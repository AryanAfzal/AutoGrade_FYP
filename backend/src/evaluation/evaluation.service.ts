import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { StudentResult } from './entities/student-result.entity';
import { AnswerSheet } from '../uploads/entities/answer-sheet.entity';
import { Exam } from '../exams/entities/exam.entity';
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

  async getResults(examId: string) {
    const results = await this.resultRepo.find({
      where: { answerSheet: { exam: { id: examId } } },
      relations: ['entries', 'answerSheet'],
      order: { answerSheet: { uploadedAt: 'DESC' } },
    });

    return results.map((result) => ({
      answersheetId: result.answerSheet.id,
      studentName: result.answerSheet.studentName,
      registrationNo: result.answerSheet.registrationNo,
      totalAiMark: result.totalAiMark,
      totalMaxMarks: result.totalMaxMarks,
      status: result.status,
      entries: result.entries,
    }));
  }

  async triggerEvaluation(examId: string): Promise<EvaluationJobStartResult> {
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

  // ── getSimilarityFlags ────────────────────────────────────────────────────
  // Called by GET /evaluation/:examId/similarity
  //
  // FIX 1: Was GET — changed to POST because the AI service needs the answer
  //        data in the body (it has no DB to fetch it from)
  // FIX 2: Fetch evaluated results + entries, build the payload the AI
  //        service expects, and include it in the POST body
  // ─────────────────────────────────────────────────────────────────────────
  async getSimilarityFlags(examId: string) {
    const exam = await this.examRepo.findOne({
      where: { id: examId },
      relations: ['questions'],
    });

    if (!exam) {
      throw new Error(`Exam ${examId} not found`);
    }

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
  async publishResults(examId: string) {
    // Update every StudentResult for this exam to approved
    const results = await this.resultRepo.find({
      where: { answerSheet: { exam: { id: examId } } },
      relations: ['answerSheet'],
    });

    if (!results.length) {
      return { message: 'No results found to publish' };
    }

    const ids = results.map((r) => r.id);
    await this.resultRepo
      .createQueryBuilder()
      .update()
      .set({ status: 'approved' })
      .whereInIds(ids)
      .execute();

    return {
      message:        'Results published successfully',
      publishedCount: ids.length,
    };
  }
}