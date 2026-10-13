import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { StudentResult } from './entities/student-result.entity';
import { AnswerSheet } from '../uploads/entities/answer-sheet.entity';
import { Exam } from '../exams/entities/exam.entity';
import { AnswerEntry } from './entities/answer-entry.entity';
import { ReviewAudit } from './entities/review-audit.entity';
import { ReviewAnswerEntryDto } from './dto/review-answer-entry.dto';
import { User } from '../users/entities/user.entity';
import axios, { AxiosError, isAxiosError } from 'axios';
import { existsSync } from 'node:fs';

export interface EvaluationJobStartResult {
  started: boolean;
  queuedSheets: number;
  message: string;
}

@Injectable()
export class EvaluationService {
  private readonly logger = new Logger(EvaluationService.name);
  private readonly activeEvaluations = new Set<string>();

  constructor(
    @InjectRepository(StudentResult)
    private resultRepo: Repository<StudentResult>,

    @InjectRepository(AnswerSheet)
    private sheetRepo: Repository<AnswerSheet>,

    @InjectRepository(Exam)
    private examRepo: Repository<Exam>,
  ) {}

  async getResults(examId: string, user: User) {
    await this.getOwnedExam(examId, user);
    const results = await this.resultRepo.find({
      where: { answerSheet: { exam: { id: examId } } },
      relations: [
        'entries',
        'entries.reviewAuditTrail',
        'entries.reviewAuditTrail.reviewer',
        'answerSheet',
      ],
      order: { answerSheet: { uploadedAt: 'DESC' } },
    });

    return results.map((result) => ({
      id: result.id,
      answersheetId: result.answerSheet.id,
      studentName: result.answerSheet.studentName,
      registrationNo: result.answerSheet.registrationNo,
      totalAiMark: result.totalAiMark,
      totalMaxMarks: result.totalMaxMarks,
      totalApprovedMark: result.totalApprovedMark,
      reviewCompletedAt: result.reviewCompletedAt,
      status: result.status,
      entries: result.entries.map((entry) => ({
        ...entry,
        reviewAuditTrail: (entry.reviewAuditTrail || [])
          .sort(
            (first, second) =>
              new Date(first.reviewedAt).getTime() -
              new Date(second.reviewedAt).getTime(),
          )
          .map((audit) => ({
            id: audit.id,
            action: audit.action,
            originalAiMark: audit.originalAiMark,
            finalMark: audit.finalMark,
            comment: audit.comment,
            reviewedAt: audit.reviewedAt,
            reviewerName: audit.reviewer.fullName,
          })),
      })),
    }));
  }

  async triggerEvaluation(
    examId: string,
    user: User,
  ): Promise<EvaluationJobStartResult> {
    await this.getOwnedExam(examId, user);
    if (this.activeEvaluations.has(examId)) {
      return {
        started: false,
        queuedSheets: 0,
        message: 'Evaluation is already running for this exam.',
      };
    }

    this.activeEvaluations.add(examId);
    try {
      const exam = await this.examRepo.findOne({
        where: { id: examId },
        relations: ['questions'],
      });
      if (!exam) {
        throw new Error(`Exam ${examId} not found`);
      }

      const candidates = await this.sheetRepo.find({
        where: {
          exam: { id: examId },
          status: In(['uploaded', 'flagged', 'processing']),
        },
        order: { uploadedAt: 'ASC' },
      });
      const sheets = (
        await Promise.all(
          candidates.map(async (sheet) => {
            const existingResult = await this.resultRepo.findOne({
              where: { answerSheet: { id: sheet.id } },
              select: { id: true },
            });
            return existingResult ? null : sheet;
          }),
        )
      ).filter((sheet): sheet is AnswerSheet => sheet !== null);

      const availableSheets: AnswerSheet[] = [];
      for (const sheet of sheets) {
        if (!existsSync(sheet.filePath)) {
          await this.sheetRepo.update(sheet.id, { status: 'flagged' });
          this.logger.error(
            `Cannot evaluate sheet ${sheet.id}: source PDF is missing at ${sheet.filePath}. Re-upload this sheet.`,
          );
          continue;
        }
        availableSheets.push(sheet);
      }

      if (!availableSheets.length) {
        this.activeEvaluations.delete(examId);
        return {
          started: false,
          queuedSheets: 0,
          message: sheets.length
            ? 'No source PDFs are available. Re-upload the flagged sheets.'
            : 'There are no unevaluated sheets to process.',
        };
      }

      await Promise.all(
        availableSheets.map((sheet) =>
          this.sheetRepo.update(sheet.id, { status: 'processing' }),
        ),
      );

      this.logger.log(
        `Started evaluation for exam ${examId}: ${availableSheets.length} sheet(s).`,
      );
      void this.processEvaluationSheets(exam, availableSheets)
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.error(
            `Evaluation worker failed for exam ${examId}: ${message}`,
          );
        })
        .finally(() => this.activeEvaluations.delete(examId));

      return {
        started: true,
        queuedSheets: sheets.length,
        message: 'Evaluation started. Sheet statuses will update as each finishes.',
      };
    } catch (error) {
      this.activeEvaluations.delete(examId);
      throw error;
    }
  }

  private async processEvaluationSheets(exam: Exam, sheets: AnswerSheet[]) {
    for (const sheet of sheets) {
      const startedAt = Date.now();
      try {
        const aiResponse = await axios.post(
          `${process.env.AI_SERVICE_URL}/evaluate`,
          {
            answersheetId: sheet.id,
            filePath: sheet.filePath,
            examId: exam.id,
            questions: exam.questions,
          },
          { timeout: 300000 },
        );

        const { totalMark, totalMaxMarks, entries } = aiResponse.data;
        const result = this.resultRepo.create({
          answerSheet: sheet,
          totalAiMark: totalMark,
          totalMaxMarks,
          status: 'awaiting_approval',
          entries,
        });
        await this.resultRepo.save(result);
        await this.sheetRepo.update(sheet.id, { status: 'awaiting_approval' });

        this.logger.log(
          `Evaluated sheet ${sheet.id} - Score: ${totalMark}/${totalMaxMarks} in ${Math.round((Date.now() - startedAt) / 1000)}s.`,
        );
      } catch (error: unknown) {
        const message = isAxiosError(error)
          ? this.formatAiServiceError(error)
          : error instanceof Error
            ? error.message
            : String(error);
        this.logger.error(
          `AI evaluation failed for sheet ${sheet.id} after ${Math.round((Date.now() - startedAt) / 1000)}s: ${message}`,
        );
        await this.sheetRepo.update(sheet.id, { status: 'flagged' });
      }
    }
  }

  private formatAiServiceError(error: AxiosError): string {
    const status = error.response?.status ?? 'no response';
    const responseBody = error.response?.data;
    const detail =
      responseBody &&
      typeof responseBody === 'object' &&
      'detail' in responseBody
        ? responseBody.detail
        : responseBody;
    const responseMessage =
      typeof detail === 'string'
        ? detail
        : detail
          ? JSON.stringify(detail)
          : error.message;
    return `HTTP ${status}${error.code ? ` (${error.code})` : ''}: ${responseMessage}`;
  }

  async reviewAnswerEntry(
    examId: string,
    entryId: string,
    dto: ReviewAnswerEntryDto,
    user: User,
  ) {
    return this.resultRepo.manager.transaction(async (manager) => {
      const entryRepo = manager.getRepository(AnswerEntry);
      const entry = await entryRepo.findOne({
        where: { id: entryId },
        relations: [
          'result',
          'result.answerSheet',
          'result.answerSheet.exam',
          'result.answerSheet.exam.createdBy',
        ],
      });

      if (
        !entry ||
        entry.result.answerSheet.exam.id !== examId ||
        entry.result.answerSheet.exam.createdBy.id !== user.id
      ) {
        throw new NotFoundException('Answer entry not found for this exam.');
      }
      if (entry.result.status !== 'awaiting_approval') {
        throw new BadRequestException('Only unpublished results can be reviewed.');
      }

      let finalMark = entry.aiMark;
      let comment: string | null = dto.approvalComment?.trim() || null;
      if (dto.action === 'override') {
        if (typeof dto.mark !== 'number' || !Number.isFinite(dto.mark)) {
          throw new BadRequestException('A valid revised mark is required.');
        }
        if (dto.mark > entry.maxMarks) {
          throw new BadRequestException(
            `The revised mark cannot exceed ${entry.maxMarks}.`,
          );
        }
        if (!dto.comment?.trim()) {
          throw new BadRequestException(
            'A comment is required when overriding an AI-assigned mark.',
          );
        }
        finalMark = Math.round(dto.mark * 100) / 100;
        comment = dto.comment.trim();
        entry.reviewStatus = 'overridden';
      } else {
        entry.reviewStatus = 'approved';
      }

      entry.approvedMark = finalMark;
      await entryRepo.save(entry);

      const auditRepo = manager.getRepository(ReviewAudit);
      const audit = auditRepo.create({
        answerEntry: entry,
        reviewer: { id: user.id },
        action: dto.action,
        originalAiMark: entry.aiMark,
        finalMark,
        comment,
      });
      await auditRepo.save(audit);

      const resultRepo = manager.getRepository(StudentResult);
      const result = await resultRepo.findOne({
        where: { id: entry.result.id },
        relations: ['entries'],
      });
      if (!result) {
        throw new NotFoundException('Evaluation result no longer exists.');
      }
      result.totalApprovedMark = result.entries.every(
        (resultEntry) =>
          resultEntry.reviewStatus !== 'pending' &&
          resultEntry.approvedMark !== null &&
          resultEntry.approvedMark !== undefined,
      )
        ? result.entries.reduce(
            (sum, resultEntry) => sum + resultEntry.approvedMark,
            0,
          )
        : null;
      if (result.reviewCompletedAt) {
        result.reviewCompletedAt = null;
      }
      await resultRepo.save(result);

      return {
        entryId: entry.id,
        reviewStatus: entry.reviewStatus,
        approvedMark: entry.approvedMark,
        totalApprovedMark: result.totalApprovedMark,
      };
    });
  }

  async completeResultReview(examId: string, resultId: string, user: User) {
    return this.resultRepo.manager.transaction(async (manager) => {
      const resultRepo = manager.getRepository(StudentResult);
      const result = await resultRepo.findOne({
        where: {
          id: resultId,
          answerSheet: { exam: { id: examId, createdBy: { id: user.id } } },
        },
        relations: ['entries', 'answerSheet', 'answerSheet.exam', 'answerSheet.exam.questions'],
      });
      if (!result) {
        throw new NotFoundException('Review result not found for this exam.');
      }
      if (result.status !== 'awaiting_approval') {
        throw new BadRequestException('Only unpublished results can be marked done.');
      }

      const expectedQuestionIds = new Set(
        result.answerSheet.exam.questions.map((question) => question.id),
      );
      if (
        result.entries.length !== expectedQuestionIds.size ||
        result.entries.some(
          (entry) =>
            !expectedQuestionIds.has(entry.questionId) ||
            entry.reviewStatus === 'pending' ||
            entry.approvedMark === null ||
            entry.approvedMark === undefined,
        )
      ) {
        throw new BadRequestException(
          'Review every question before marking this paper done.',
        );
      }

      result.totalApprovedMark = result.entries.reduce(
        (sum, entry) => sum + entry.approvedMark,
        0,
      );
      result.reviewCompletedAt = new Date();
      await resultRepo.save(result);

      return {
        resultId: result.id,
        reviewCompletedAt: result.reviewCompletedAt,
      };
    });
  }

  // ── getSimilarityFlags ────────────────────────────────────────────────────
  // Called by GET /evaluation/:examId/similarity
  //
  // FIX 1: Was GET — changed to POST because the AI service needs the answer
  //        data in the body (it has no DB to fetch it from)
  // FIX 2: Fetch evaluated results + entries, build the payload the AI
  //        service expects, and include it in the POST body
  // ─────────────────────────────────────────────────────────────────────────
  async getSimilarityFlags(examId: string, user: User) {
    const exam = await this.getOwnedExam(examId, user);

    // Load all evaluated results for this exam
    const results = await this.resultRepo.find({
      where: { answerSheet: { exam: { id: examId } } },
      relations: ['entries', 'answerSheet'],
    });

    if (results.length < 2) {
      // Can't detect similarity with fewer than 2 students
      return {
        examId,
        summary:      { totalFlaggedPairs: 0, studentsInvolved: [], byQuestion: [] },
        flaggedPairs: [],
      };
    }

    // Build the payload the AI service expects
    const studentAnswers = results.map((result) => ({
      studentName:    result.answerSheet.studentName,
      registrationNo: result.answerSheet.registrationNo,
      answersheetId:  result.answerSheet.id,
      // Map AnswerEntry rows back into {questionNumber, answerText}
      // The AI service matches by questionNumber (1-based index order)
      answers: result.entries.map((entry, idx) => ({
        questionNumber: idx + 1,
        answerText:     entry.studentAnswer,
      })),
    }));

    // FIX: POST (not GET) with data in the body
    const response = await axios.post(
      `${process.env.AI_SERVICE_URL}/similarity/${examId}`,
      {
        questions:      exam.questions,   // question list so AI knows types + text
        studentAnswers: studentAnswers,   // per-student answer arrays
        threshold:      0.92,             // configurable similarity cutoff
      },
    );

    return response.data;
  }

  // ── publishResults ────────────────────────────────────────────────────────
  // Called by POST /evaluation/:examId/publish
  // Marks all StudentResult rows for the exam as approved.
  //
  // FIX: Original updated AnswerSheet.status — should update StudentResult.status
  //      since "published" is a result state, not an upload state.
  //      AnswerSheet.status tracks the upload pipeline; StudentResult.status
  //      tracks the review/approval pipeline.
  // ─────────────────────────────────────────────────────────────────────────
  async publishResults(examId: string, user: User) {
    return this.resultRepo.manager.transaction(async (manager) => {
      const examRepo = manager.getRepository(Exam);
      const exam = await examRepo.findOne({
        where: { id: examId, createdBy: { id: user.id } },
        relations: ['questions'],
      });
      if (!exam) {
        throw new NotFoundException('Exam not found.');
      }
      if (exam.status === 'published' || exam.publishedAt) {
        throw new BadRequestException('Results for this exam are already published.');
      }
      if (!exam.questions.length) {
        throw new BadRequestException('An exam without questions cannot be published.');
      }

      const sheets = await manager.getRepository(AnswerSheet).find({
        where: { exam: { id: examId } },
      });
      if (!sheets.length) {
        throw new BadRequestException('There are no answer sheets to publish.');
      }

      const results = await manager.getRepository(StudentResult).find({
        where: { answerSheet: { exam: { id: examId } } },
        relations: ['entries', 'answerSheet'],
      });
      const expectedQuestionIds = new Set(exam.questions.map((question) => question.id));
      const completedResults = results.filter(
        (result) =>
          result.reviewCompletedAt !== null &&
          result.status === 'awaiting_approval',
      );
      if (!completedResults.length) {
        throw new BadRequestException(
          'Mark at least one fully reviewed paper done before publishing.',
        );
      }

      for (const result of completedResults) {
        if (result.status !== 'awaiting_approval') {
          throw new BadRequestException(
            'All evaluated results must be awaiting teacher approval before publishing.',
          );
        }
        if (
          result.entries.length !== expectedQuestionIds.size ||
          result.entries.some(
            (entry) =>
              !expectedQuestionIds.has(entry.questionId) ||
              entry.reviewStatus === 'pending' ||
              entry.approvedMark === null ||
              entry.approvedMark === undefined,
          )
        ) {
          throw new BadRequestException(
            `Every question for ${result.answerSheet.studentName} must be explicitly reviewed before publishing.`,
          );
        }
        result.totalApprovedMark = result.entries.reduce(
          (sum, entry) => sum + entry.approvedMark,
          0,
        );
        result.status = 'approved';
      }

      const completedSheetIds = completedResults.map(
        (result) => result.answerSheet.id,
      );
      await manager.getRepository(StudentResult).save(completedResults);
      await manager.getRepository(AnswerSheet).update(
        completedSheetIds,
        { status: 'approved' },
      );

      const allResultsPublished =
        results.length === sheets.length &&
        results.every((result) => result.status === 'approved');
      const publishedAt = allResultsPublished ? new Date() : null;
      if (publishedAt) {
        exam.status = 'published';
        exam.publishedAt = publishedAt;
        await examRepo.save(exam);
      }

      return {
        message: allResultsPublished
          ? 'All exam results published successfully.'
          : 'Completed paper results published successfully.',
        publishedCount: completedResults.length,
        examCompleted: allResultsPublished,
        publishedAt,
      };
    });
  }

  private async getOwnedExam(examId: string, user: User) {
    const exam = await this.examRepo.findOne({
      where: { id: examId, createdBy: { id: user.id } },
      relations: ['questions'],
    });
    if (!exam) {
      throw new NotFoundException('Exam not found.');
    }
    return exam;
  }
}