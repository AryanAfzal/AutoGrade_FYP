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
import { RecheckRequest } from './entities/recheck-request.entity';
import { RecheckAudit } from './entities/recheck-audit.entity';
import { UserNotification } from './entities/user-notification.entity';
import { ReviewAnswerEntryDto } from './dto/review-answer-entry.dto';
import { AddGraceMarksDto } from './dto/add-grace-marks.dto';
import { CreateRecheckRequestDto } from './dto/create-recheck-request.dto';
import { DecideRecheckRequestDto } from './dto/decide-recheck-request.dto';
import { DecideSimilarityDto } from './dto/decide-similarity.dto';
import { User } from '../users/entities/user.entity';
import axios, { AxiosError, isAxiosError } from 'axios';
import { createReadStream, existsSync, promises as fs } from 'node:fs';
import * as path from 'node:path';

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

    @InjectRepository(RecheckRequest)
    private recheckRepo: Repository<RecheckRequest>,

    @InjectRepository(UserNotification)
    private notificationRepo: Repository<UserNotification>,
  ) {}

  async getOmrAnnotatedImage(examId: string, sheetId: string, user: User) {
    await this.getOwnedExam(examId, user);
    const sheet = await this.sheetRepo.findOne({
      where: {
        id: sheetId,
        exam: { id: examId },
      },
    });
    if (!sheet || !sheet.omrAnnotatedPath) {
      throw new NotFoundException('Highlighted OMR image is not available for this sheet.');
    }

    const uploadsDirectory = await fs.realpath(path.resolve(process.cwd(), 'uploads'));
    const resolvedPath = path.resolve(sheet.omrAnnotatedPath);
    const relativePath = path.relative(uploadsDirectory, resolvedPath);
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      throw new NotFoundException('Highlighted OMR image is not available.');
    }

    let realFilePath: string;
    try {
      realFilePath = await fs.realpath(resolvedPath);
      const realRelativePath = path.relative(uploadsDirectory, realFilePath);
      if (realRelativePath.startsWith('..') || path.isAbsolute(realRelativePath)) {
        throw new NotFoundException('Highlighted OMR image is not available.');
      }
      const fileInfo = await fs.stat(realFilePath);
      if (!fileInfo.isFile()) {
        throw new NotFoundException('Highlighted OMR image is not available.');
      }
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new NotFoundException('Highlighted OMR image file no longer exists.');
      }
      throw error;
    }

    return {
      stream: createReadStream(realFilePath),
      fileName: path.basename(realFilePath),
    };
  }

  async getResults(examId: string, user: User) {
    const exam = await this.getOwnedExam(examId, user);
    const questionOrder = new Map(
      (exam.questions || []).map((q, index) => [q.id, index]),
    );
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
      totalApprovedMark: typeof result.totalApprovedMark === 'number'
        ? result.totalApprovedMark
        : Math.round(
            result.entries.reduce(
              (sum, e) => sum + (typeof e.approvedMark === 'number' ? e.approvedMark : e.aiMark),
              0,
            ) * 100,
          ) / 100,
      reviewCompletedAt: result.reviewCompletedAt,
      status: result.status,
      cheatingStatus: result.cheatingStatus || 'clean',
      cheatingPenaltyNotes: result.cheatingPenaltyNotes || null,
      cheatingReport: result.cheatingReport || null,
      ocrEngine: result.answerSheet.ocrEngine,
      hasOmrImage: Boolean(result.answerSheet.omrAnnotatedPath),
      entries: [...result.entries]
        .sort(
          (a, b) =>
            (questionOrder.get(a.questionId) ?? Number.MAX_SAFE_INTEGER) -
            (questionOrder.get(b.questionId) ?? Number.MAX_SAFE_INTEGER),
        )
        .map((entry) => ({
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

  async getPublishedPapers(user: User, examId?: string) {
    let query = this.resultRepo
      .createQueryBuilder('result')
      .innerJoinAndSelect('result.answerSheet', 'answerSheet')
      .innerJoinAndSelect('answerSheet.exam', 'exam')
      .leftJoinAndSelect('exam.createdBy', 'examCreator')
      .leftJoinAndSelect('result.entries', 'entry')
      .leftJoinAndSelect('entry.reviewAuditTrail', 'audit')
      .leftJoinAndSelect('audit.reviewer', 'reviewer')
      .where('result.status = :status', { status: 'approved' })
      .andWhere('result.publishedAt IS NOT NULL');

    if (user.role === 'teacher') {
      query = query.andWhere('examCreator.id = :userId', { userId: user.id });
    }

    if (examId) {
      query = query.andWhere('exam.id = :examId', { examId });
    }

    query = query
      .orderBy('result.publishedAt', 'DESC')
      .addOrderBy('answerSheet.studentName', 'ASC');

    const results = await query.getMany();

    return results.map((result) => {
      const exam = result.answerSheet.exam;
      const questionOrder = new Map(
        (exam.questions || []).map((q, index) => [q.id, index]),
      );

      return {
        id: result.id,
        answersheetId: result.answerSheet.id,
        examId: exam.id,
        examTitle: exam.title,
        course: exam.course,
        term: exam.term,
        recheckDeadline: exam.recheckDeadline,
        studentName: result.answerSheet.studentName,
        registrationNo: result.answerSheet.registrationNo,
        totalAiMark: result.totalAiMark,
        totalApprovedMark: result.totalApprovedMark,
        totalMaxMarks: result.totalMaxMarks,
        publishedAt: result.publishedAt,
        reviewCompletedAt: result.reviewCompletedAt,
        status: result.status,
        cheatingStatus: result.cheatingStatus || 'clean',
        cheatingPenaltyNotes: result.cheatingPenaltyNotes || null,
        cheatingReport: result.cheatingReport || null,
        ocrEngine: result.answerSheet.ocrEngine,
        hasOmrImage: Boolean(result.answerSheet.omrAnnotatedPath),
        entries: [...(result.entries || [])]
          .sort(
            (a, b) =>
              (questionOrder.get(a.questionId) ?? Number.MAX_SAFE_INTEGER) -
              (questionOrder.get(b.questionId) ?? Number.MAX_SAFE_INTEGER),
          )
          .map((entry) => ({
            id: entry.id,
            questionId: entry.questionId,
            questionText: entry.questionText,
            studentAnswer: entry.studentAnswer || 'No answer extracted.',
            referenceAnswer: entry.referenceAnswer,
            aiMark: entry.aiMark,
            approvedMark: entry.approvedMark,
            maxMarks: entry.maxMarks,
            confidence: entry.confidence,
            semanticScore: entry.semanticScore,
            keywordScore: entry.keywordScore,
            reviewStatus: entry.reviewStatus,
            type: entry.type,
            rubricBreakdown: entry.rubricBreakdown,
            feedback: entry.feedback,
            reviewAuditTrail: (entry.reviewAuditTrail || [])
              .sort(
                (a, b) =>
                  new Date(a.reviewedAt).getTime() -
                  new Date(b.reviewedAt).getTime(),
              )
              .map((audit) => ({
                id: audit.id,
                action: audit.action,
                originalAiMark: audit.originalAiMark,
                finalMark: audit.finalMark,
                comment: audit.comment,
                reviewedAt: audit.reviewedAt,
                reviewerName: audit.reviewer?.fullName || 'Teacher',
              })),
          })),
      };
    });
  }

  async getPublishedStudentResults(user: User) {
    if (user.role !== 'student' || user.status !== 'APPROVED' || !user.rollNumber) {
      throw new BadRequestException(
        'Your student account must be approved and have a roll number to view results.',
      );
    }

    const results = await this.resultRepo
      .createQueryBuilder('result')
      .innerJoinAndSelect('result.answerSheet', 'answerSheet')
      .innerJoinAndSelect('answerSheet.exam', 'exam')
      .leftJoinAndSelect('result.entries', 'entry')
      .where('result.status = :status', { status: 'approved' })
      .andWhere('result.publishedAt IS NOT NULL')
      .andWhere('LOWER(TRIM(answerSheet.registrationNo)) = :rollNumber', {
        rollNumber: user.rollNumber.trim().toLowerCase(),
      })
      .orderBy('result.publishedAt', 'DESC', 'NULLS LAST')
      .getMany();

    const entryIds = results.flatMap((result) => result.entries.map((entry) => entry.id));
    const requests = entryIds.length
      ? await this.recheckRepo.find({
          where: { answerEntry: { id: In(entryIds) }, student: { id: user.id } },
          relations: ['answerEntry'],
          order: { createdAt: 'DESC' },
        })
      : [];
    const latestRequestByEntry = new Map<string, RecheckRequest>();
    for (const request of requests) {
      if (!latestRequestByEntry.has(request.answerEntry.id)) {
        latestRequestByEntry.set(request.answerEntry.id, request);
      }
    }

    return results.map((result) => ({
      examId: result.answerSheet.exam.id,
      examTitle: result.answerSheet.exam.title,
      subject: result.answerSheet.exam.course,
      term: result.answerSheet.exam.term,
      rollNumber: result.answerSheet.registrationNo,
      totalMarks: result.totalApprovedMark !== null && result.totalApprovedMark !== undefined
        ? Math.round(result.totalApprovedMark * 100) / 100
        : (result.totalAiMark !== null && result.totalAiMark !== undefined
            ? Math.round(result.totalAiMark * 100) / 100
            : null),
      maxMarks: result.totalMaxMarks,
      cheatingStatus: result.cheatingStatus || 'clean',
      cheatingPenaltyNotes: result.cheatingPenaltyNotes || null,
      cheatingReport: result.cheatingReport || null,
      publishedAt: result.publishedAt,
      recheckDeadline: result.answerSheet.exam.recheckDeadline,
      questions: result.entries.map((entry) => ({
        answerEntryId: entry.id,
        recheckRequest: latestRequestByEntry.has(entry.id)
          ? {
              id: latestRequestByEntry.get(entry.id)!.id,
              status: latestRequestByEntry.get(entry.id)!.status,
              justification: latestRequestByEntry.get(entry.id)!.justification,
              decisionComment: latestRequestByEntry.get(entry.id)!.decisionComment,
              resolvedAt: latestRequestByEntry.get(entry.id)!.resolvedAt,
            }
          : null,
        questionText: entry.questionText,
        studentAnswer: entry.studentAnswer || 'No answer was extracted for this question.',
        mark: typeof entry.approvedMark === 'number'
          ? Math.round(entry.approvedMark * 100) / 100
          : (typeof entry.aiMark === 'number' ? Math.round(entry.aiMark * 100) / 100 : null),
        maxMarks: entry.maxMarks,
        feedback: entry.feedback,
      })),
    }));
  }

  async submitRecheckRequest(dto: CreateRecheckRequestDto, user: User) {
    const justification = dto.justification.trim();
    if (justification.length < 10) {
      throw new BadRequestException('Justification must be at least 10 characters.');
    }

    return this.resultRepo.manager.transaction(async (manager) => {
      const entryRepo = manager.getRepository(AnswerEntry);
      const requestRepo = manager.getRepository(RecheckRequest);
      const lockedEntry = await entryRepo.findOne({
        where: { id: dto.answerEntryId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!lockedEntry) {
        throw new NotFoundException('Published answer entry not found.');
      }
      const entry = await entryRepo.findOne({
        where: { id: lockedEntry.id },
        relations: ['result', 'result.answerSheet', 'result.answerSheet.exam'],
      });
      if (!entry || entry.result.status !== 'approved' || !entry.result.publishedAt) {
        throw new NotFoundException('Published answer entry not found.');
      }
      if (
        user.role !== 'student' ||
        user.status !== 'APPROVED' ||
        !user.rollNumber ||
        user.rollNumber.trim().toLowerCase() !==
          entry.result.answerSheet.registrationNo.trim().toLowerCase()
      ) {
        throw new NotFoundException('Published answer entry not found.');
      }
      const deadline = entry.result.answerSheet.exam.recheckDeadline;
      if (!deadline || new Date() > deadline) {
        throw new BadRequestException('The recheck request deadline has passed or is not configured.');
      }
      const existingRequest = await requestRepo.findOne({
        where: {
          answerEntry: { id: entry.id },
          student: { id: user.id },
        },
      });
      if (existingRequest) {
        throw new BadRequestException('You have already submitted a recheck request for this answer.');
      }
      if (entry.approvedMark === null || entry.approvedMark === undefined) {
        throw new BadRequestException('This answer does not have a published mark to recheck.');
      }

      const request = await requestRepo.save(
        requestRepo.create({
          answerEntry: entry,
          student: { id: user.id },
          justification,
          originalMark: entry.approvedMark,
          status: 'pending',
          decision: null,
          revisedMark: null,
          decisionComment: null,
          reviewedBy: null,
          resolvedAt: null,
        }),
      );
      await manager.getRepository(RecheckAudit).save(
        manager.getRepository(RecheckAudit).create({
          request,
          actor: { id: user.id },
          action: 'submitted',
          previousMark: entry.approvedMark,
          finalMark: entry.approvedMark,
          comment: justification,
        }),
      );

      return {
        id: request.id,
        status: request.status,
        justification: request.justification,
        message: 'Your recheck request has been sent to your teacher.',
      };
    });
  }

  async getTeacherRecheckRequests(user: User) {
    const requests = await this.recheckRepo.find({
      where: {
        status: 'pending',
        answerEntry: {
          result: {
            answerSheet: { exam: { createdBy: { id: user.id } } },
          },
        },
      },
      relations: [
        'student',
        'answerEntry',
        'answerEntry.result',
        'answerEntry.result.answerSheet',
        'answerEntry.result.answerSheet.exam',
      ],
      order: { createdAt: 'ASC' },
    });
    return requests.map((request) => ({
      id: request.id,
      studentName: request.student.fullName,
      studentEmail: request.student.email,
      rollNumber: request.student.rollNumber,
      examId: request.answerEntry.result.answerSheet.exam.id,
      examTitle: request.answerEntry.result.answerSheet.exam.title,
      subject: request.answerEntry.result.answerSheet.exam.course,
      questionText: request.answerEntry.questionText,
      studentAnswer: request.answerEntry.studentAnswer,
      originalMark: request.originalMark,
      maxMarks: request.answerEntry.maxMarks,
      feedback: request.answerEntry.feedback,
      justification: request.justification,
      createdAt: request.createdAt,
    }));
  }

  async decideRecheckRequest(
    requestId: string,
    dto: DecideRecheckRequestDto,
    user: User,
  ) {
    const comment = dto.comment.trim();
    if (!comment) {
      throw new BadRequestException('A comment is required for every recheck decision.');
    }
    if (dto.decision === 'revise' && (typeof dto.mark !== 'number' || !Number.isFinite(dto.mark))) {
      throw new BadRequestException('Enter a valid revised mark.');
    }

    return this.resultRepo.manager.transaction(async (manager) => {
      const requestRepo = manager.getRepository(RecheckRequest);
      const lockedRequest = await requestRepo.findOne({
        where: { id: requestId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!lockedRequest) {
        throw new NotFoundException('Recheck request not found.');
      }
      const request = await requestRepo.findOne({
        where: { id: lockedRequest.id },
        relations: [
          'student',
          'answerEntry',
          'answerEntry.result',
          'answerEntry.result.entries',
          'answerEntry.result.answerSheet',
          'answerEntry.result.answerSheet.exam',
          'answerEntry.result.answerSheet.exam.createdBy',
        ],
      });
      if (
        !request ||
        request.answerEntry.result.answerSheet.exam.createdBy.id !== user.id
      ) {
        throw new NotFoundException('Recheck request not found.');
      }
      if (request.status !== 'pending') {
        throw new BadRequestException('This recheck request has already been resolved.');
      }

      const entry = request.answerEntry;
      const result = entry.result;
      let finalMark = request.originalMark;
      if (dto.decision === 'revise') {
        if (dto.mark! > entry.maxMarks) {
          throw new BadRequestException(`The revised mark cannot exceed ${entry.maxMarks}.`);
        }
        finalMark = Math.round(dto.mark! * 100) / 100;
        entry.approvedMark = finalMark;
        entry.reviewStatus = 'overridden';
        await manager.getRepository(AnswerEntry).save(entry);
        result.totalApprovedMark = result.entries.reduce(
          (sum, resultEntry) =>
            sum +
            (resultEntry.id === entry.id
              ? finalMark
              : resultEntry.approvedMark ?? 0),
          0,
        );
        await manager.getRepository(StudentResult).update(result.id, {
          totalApprovedMark: result.totalApprovedMark,
        });
      }

      request.status = dto.decision === 'uphold' ? 'upheld' : 'revised';
      request.decision = dto.decision;
      request.revisedMark = dto.decision === 'revise' ? finalMark : null;
      request.decisionComment = comment;
      request.reviewedBy = user;
      request.resolvedAt = new Date();
      await requestRepo.save(request);
      await manager.getRepository(RecheckAudit).save(
        manager.getRepository(RecheckAudit).create({
          request,
          actor: { id: user.id },
          action: dto.decision === 'uphold' ? 'upheld' : 'revised',
          previousMark: request.originalMark,
          finalMark,
          comment,
        }),
      );
      await manager.getRepository(UserNotification).save(
        manager.getRepository(UserNotification).create({
          user: request.student,
          recheckRequest: request,
          title: 'Recheck request resolved',
          message:
            dto.decision === 'uphold'
              ? `Your recheck request for "${entry.questionText}" was reviewed. The original mark of ${request.originalMark}/${entry.maxMarks} was upheld. Teacher comment: ${comment}`
              : `Your recheck request for "${entry.questionText}" was reviewed. Your mark was revised to ${finalMark}/${entry.maxMarks}. Teacher comment: ${comment}`,
          readAt: null,
        }),
      );

      return {
        id: request.id,
        status: request.status,
        finalMark,
        totalApprovedMark: result.totalApprovedMark,
        resolvedAt: request.resolvedAt,
      };
    });
  }

  async getStudentNotifications(user: User) {
    const list = await this.notificationRepo.find({
      where: { user: { id: user.id } },
      order: { createdAt: 'DESC' },
      take: 30,
    });
    // Deduplicate identical notifications by title & message
    const seen = new Set<string>();
    return list.filter((n) => {
      const key = `${n.title.trim()}__${n.message.trim()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async markStudentNotificationRead(notificationId: string, user: User) {
    const notification = await this.notificationRepo.findOne({
      where: { id: notificationId, user: { id: user.id } },
    });
    if (!notification) {
      throw new NotFoundException('Notification not found.');
    }
    notification.readAt = new Date();
    await this.notificationRepo.save(notification);
    return { message: 'Notification marked as read.' };
  }

  async triggerEvaluation(
    examId: string,
    user: User,
    ocrEngine?: string,
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
      if (exam.questions?.length) {
        exam.questions.sort(
          (a, b) =>
            (a.orderIndex ?? Number.MAX_SAFE_INTEGER) -
            (b.orderIndex ?? Number.MAX_SAFE_INTEGER),
        );
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
      void this.processEvaluationSheets(exam, availableSheets, ocrEngine)
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

  private async processEvaluationSheets(
    exam: Exam,
    sheets: AnswerSheet[],
    fallbackOcrEngine?: string,
  ) {
    for (const sheet of sheets) {
      const startedAt = Date.now();
      try {
        const resolvedEngine: 'trocr' | 'pen_to_print' | 'omr' =
          sheet.ocrEngine === 'omr'
            ? 'omr'
            : sheet.ocrEngine === 'pen_to_print'
              ? 'pen_to_print'
              : sheet.ocrEngine === 'trocr'
                ? 'trocr'
                : fallbackOcrEngine === 'omr'
                  ? 'omr'
                  : fallbackOcrEngine === 'pen_to_print'
                    ? 'pen_to_print'
                    : 'trocr';

        const omrOutputPath =
          resolvedEngine === 'omr'
            ? path.resolve(process.cwd(), 'uploads', 'omr-annotated', `${sheet.id}.png`)
            : undefined;

        const aiResponse = await axios.post(
          `${process.env.AI_SERVICE_URL}/evaluate`,
          {
            answersheetId: sheet.id,
            filePath: sheet.filePath,
            examId: exam.id,
            questions: exam.questions,
            ocrEngine: resolvedEngine,
            ...(omrOutputPath ? { omrOutputPath } : {}),
          },
          { timeout: 300000 },
        );

        const { totalMark, totalMaxMarks, omrAnnotatedPath, entries } = aiResponse.data;
        const result = this.resultRepo.create({
          answerSheet: sheet,
          totalAiMark: totalMark,
          totalMaxMarks,
          status: 'awaiting_approval',
          entries,
        });
        await this.resultRepo.save(result);
        await this.sheetRepo.update(sheet.id, {
          status: 'awaiting_approval',
          ...(omrAnnotatedPath ? { omrAnnotatedPath } : {}),
        });

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
      if (
        entry.result.status !== 'awaiting_approval' &&
        entry.result.status !== 'approved'
      ) {
        throw new BadRequestException('Invalid result status for review.');
      }

      let finalMark = entry.aiMark;
      let comment: string =
        dto.comment?.trim() ||
        dto.approvalComment?.trim() ||
        (dto.action === 'override' ? 'Teacher revised mark' : 'AI mark approved');

      if (dto.action === 'override') {
        if (typeof dto.mark !== 'number' || !Number.isFinite(dto.mark)) {
          throw new BadRequestException('A valid revised mark is required.');
        }
        if (dto.mark > entry.maxMarks) {
          throw new BadRequestException(
            `The revised mark cannot exceed ${entry.maxMarks}.`,
          );
        }
        finalMark = Math.round(dto.mark * 100) / 100;
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
      const allEntriesReviewed = result.entries.every(
        (resultEntry) =>
          resultEntry.reviewStatus !== 'pending' &&
          resultEntry.approvedMark !== null &&
          resultEntry.approvedMark !== undefined,
      );
      result.totalApprovedMark = Math.round(
        result.entries.reduce(
          (sum, resultEntry) =>
            sum + (typeof resultEntry.approvedMark === 'number' ? resultEntry.approvedMark : resultEntry.aiMark),
          0,
        ) * 100,
      ) / 100;
      if (allEntriesReviewed) {
        result.reviewCompletedAt = new Date();
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
      if (
        result.status !== 'awaiting_approval' &&
        result.status !== 'approved'
      ) {
        throw new BadRequestException('Invalid result status for completion.');
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
      return {
        examId,
        summary:      { totalFlaggedPairs: 0, studentsInvolved: [], byQuestion: [] },
        flaggedPairs: [],
        groupedPairs: [],
      };
    }

    // Build the payload the AI service expects
    const studentAnswers = results.map((result) => ({
      studentName:    result.answerSheet.studentName,
      registrationNo: result.answerSheet.registrationNo,
      answersheetId:  result.answerSheet.id,
      answers: result.entries.map((entry, idx) => ({
        questionNumber: idx + 1,
        answerText:     entry.studentAnswer,
      })),
    }));

    const response = await axios.post(
      `${process.env.AI_SERVICE_URL}/similarity/${examId}`,
      {
        questions:      exam.questions,
        studentAnswers: studentAnswers,
        threshold:      0.85, // Critical match threshold: only > 85%
      },
    );

    const data = response.data;
    const resultMap = new Map(results.map((r) => [r.answerSheet.registrationNo, r]));

    // Filter to only include critical matches with percent greater than 85% (> 0.85)
    if (data.flaggedPairs && Array.isArray(data.flaggedPairs)) {
      data.flaggedPairs = data.flaggedPairs.filter((p: any) => p.similarityScore > 0.85);
    }

    // Attach studentResult IDs and cheating status to grouped pairs (only > 85%)
    if (data.groupedPairs && Array.isArray(data.groupedPairs)) {
      data.groupedPairs = data.groupedPairs
        .filter((pair: any) => pair.overallSimilarity > 0.85)
        .map((pair: any) => {
          const resA = resultMap.get(pair.studentA?.regNo);
          const resB = resultMap.get(pair.studentB?.regNo);
          return {
            ...pair,
            studentA: {
              ...pair.studentA,
              resultId: resA?.id,
              cheatingStatus: resA?.cheatingStatus || 'clean',
              totalApprovedMark: resA?.totalApprovedMark,
              totalMaxMarks: resA?.totalMaxMarks,
            },
            studentB: {
              ...pair.studentB,
              resultId: resB?.id,
              cheatingStatus: resB?.cheatingStatus || 'clean',
              totalApprovedMark: resB?.totalApprovedMark,
              totalMaxMarks: resB?.totalMaxMarks,
            },
          };
        });
    }

    return data;
  }

  async decideSimilarity(examId: string, dto: DecideSimilarityDto, user: User) {
    const exam = await this.getOwnedExam(examId, user);

    const results = await this.resultRepo.find({
      where: { answerSheet: { exam: { id: examId } } },
      relations: ['entries', 'answerSheet'],
    });

    const studentAResult = results.find(
      (r) =>
        (dto.studentAResultId && r.id === dto.studentAResultId) ||
        (dto.studentARegNo &&
          r.answerSheet.registrationNo?.trim().toLowerCase() ===
            dto.studentARegNo.trim().toLowerCase()),
    );

    const studentBResult = results.find(
      (r) =>
        (dto.studentBResultId && r.id === dto.studentBResultId) ||
        (dto.studentBRegNo &&
          r.answerSheet.registrationNo?.trim().toLowerCase() ===
            dto.studentBRegNo.trim().toLowerCase()),
    );

    if (dto.action === 'dismiss') {
      if (studentAResult && studentAResult.cheatingStatus !== 'confirmed_cheating') {
        studentAResult.cheatingStatus = 'clean';
        await this.resultRepo.save(studentAResult);
      }
      if (studentBResult && studentBResult.cheatingStatus !== 'confirmed_cheating') {
        studentBResult.cheatingStatus = 'clean';
        await this.resultRepo.save(studentBResult);
      }
      return { message: 'Similarity flag dismissed successfully.' };
    }

    // Action: confirm_cheating
    const targetResults: StudentResult[] = [];
    const penaltyTarget = dto.penaltyTarget || 'both';

    if ((penaltyTarget === 'both' || penaltyTarget === 'student_a') && studentAResult) {
      targetResults.push(studentAResult);
    }
    if ((penaltyTarget === 'both' || penaltyTarget === 'student_b') && studentBResult) {
      targetResults.push(studentBResult);
    }

    if (targetResults.length === 0) {
      throw new NotFoundException('No target student results found for cheating penalty.');
    }

    const userRepo = this.notificationRepo.manager.getRepository(User);
    const entryRepo = this.notificationRepo.manager.getRepository(AnswerEntry);
    const auditRepo = this.notificationRepo.manager.getRepository(ReviewAudit);

    const teacherName = user.fullName || 'Teacher';
    const notes =
      dto.teacherNotes?.trim() ||
      'Academic integrity violation: unauthorized copying confirmed by instructor.';

    const notifiedUserIds = new Set<string>();

    for (const res of targetResults) {
      res.cheatingStatus = 'confirmed_cheating';
      res.cheatingPenaltyNotes = notes;
      res.cheatingReport = dto.reportData || {
        penaltyTarget,
        teacherNotes: notes,
        decidedAt: new Date().toISOString(),
        decidedBy: teacherName,
        matchedWith:
          res.id === studentAResult?.id
            ? studentBResult?.answerSheet?.registrationNo
            : studentAResult?.answerSheet?.registrationNo,
      };
      res.totalApprovedMark = 0;
      res.reviewCompletedAt = new Date();

      for (const entry of res.entries) {
        entry.approvedMark = 0;
        entry.reviewStatus = 'overridden';
        await entryRepo.save(entry);

        const audit = auditRepo.create({
          answerEntry: entry,
          reviewer: user,
          action: 'override',
          originalAiMark: entry.aiMark,
          finalMark: 0,
          comment: `[Cheating Penalty] ${notes}`,
          reviewedAt: new Date(),
        });
        await auditRepo.save(audit);
      }

      await this.resultRepo.save(res);

      // Create notification for student if their account exists (prevent duplicates across multiple sheets or rolls)
      const studentRoll = res.answerSheet.registrationNo?.trim().toLowerCase();
      if (studentRoll) {
        const studentUser = await userRepo
          .createQueryBuilder('u')
          .where('LOWER(TRIM(u.rollNumber)) = :roll', { roll: studentRoll })
          .getOne();

        if (studentUser && !notifiedUserIds.has(studentUser.id)) {
          notifiedUserIds.add(studentUser.id);

          const noticeTitle = `Academic Integrity Notice · ${exam.title}`;
          const noticeMessage = `Following teacher review for exam "${exam.title}", unauthorized similarity/copying was confirmed in your paper. In accordance with academic integrity guidelines, zero marks (0) have been awarded for this assessment. Reason: ${notes}`;

          const existingNotice = await this.notificationRepo.findOne({
            where: {
              user: { id: studentUser.id },
              title: noticeTitle,
            },
          });

          if (!existingNotice) {
            const notification = this.notificationRepo.create({
              user: studentUser,
              title: noticeTitle,
              message: noticeMessage,
            });
            await this.notificationRepo.save(notification);
          } else {
            // Update existing notification instead of creating a duplicate
            existingNotice.message = noticeMessage;
            existingNotice.readAt = null;
            await this.notificationRepo.save(existingNotice);
          }
        }
      }
    }

    return {
      message: `Confirmed cheating and awarded 0 marks to ${targetResults.length} student(s).`,
      penalizedStudents: targetResults.map((r) => r.answerSheet.registrationNo),
    };
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
      if (!exam.recheckDeadline || exam.recheckDeadline <= new Date()) {
        throw new BadRequestException(
          'Set a future recheck deadline for this exam before publishing results.',
        );
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
        const hasAwaiting = results.some((result) => result.status === 'awaiting_approval');
        if (hasAwaiting) {
          throw new BadRequestException(
            'Mark at least one fully reviewed paper done before publishing.',
          );
        }
        throw new BadRequestException('Results for this exam are already published.');
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

      const publishedAt = new Date();
      for (const result of completedResults) {
        result.publishedAt = publishedAt;
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
        results.every(
          (result) =>
            result.status === 'approved' ||
            completedResults.some((cr) => cr.id === result.id),
        );
      if (allResultsPublished) {
        exam.status = 'published';
        exam.publishedAt = publishedAt;
      } else {
        exam.status = 'under_review';
      }
      await examRepo.save(exam);

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

  async addGraceMarks(examId: string, dto: AddGraceMarksDto, user: User) {
    if (typeof dto.marks !== 'number' || !Number.isFinite(dto.marks) || dto.marks <= 0) {
      throw new BadRequestException('Grace marks must be a positive number.');
    }
    const graceMarksToAdd = Math.round(dto.marks * 100) / 100;

    return this.resultRepo.manager.transaction(async (manager) => {
      const examRepo = manager.getRepository(Exam);
      const exam = await examRepo.findOne({
        where: { id: examId, createdBy: { id: user.id } },
        relations: ['questions'],
      });
      if (!exam) {
        throw new NotFoundException('Exam not found.');
      }

      const resultRepo = manager.getRepository(StudentResult);
      const entryRepo = manager.getRepository(AnswerEntry);
      const auditRepo = manager.getRepository(ReviewAudit);

      let query = resultRepo
        .createQueryBuilder('result')
        .innerJoinAndSelect('result.answerSheet', 'answerSheet')
        .innerJoinAndSelect('answerSheet.exam', 'exam')
        .leftJoinAndSelect('result.entries', 'entries')
        .where('exam.id = :examId', { examId });

      if (dto.resultIds && dto.resultIds.length > 0) {
        query = query.andWhere(
          '(result.id IN (:...resultIds) OR answerSheet.id IN (:...resultIds))',
          { resultIds: dto.resultIds },
        );
      }

      const results = await query.getMany();
      if (!results.length) {
        throw new NotFoundException('No student results found to apply grace marks.');
      }

      let updatedCount = 0;
      let excludedCheatingCount = 0;

      for (const result of results) {
        // STRICT ACADEMIC INTEGRITY EXCLUSION:
        // Never add grace marks to a student who has been confirmed for cheating or penalized with zero
        if (
          result.cheatingStatus === 'confirmed_cheating' ||
          (Boolean(result.cheatingPenaltyNotes) && result.totalApprovedMark === 0)
        ) {
          excludedCheatingCount++;
          continue;
        }

        if (!result.entries || !result.entries.length) continue;

        const currentTotal = result.entries.reduce(
          (sum, e) => sum + (e.approvedMark ?? e.aiMark),
          0,
        );
        const maxAwardable = Math.max(0, result.totalMaxMarks - currentTotal);
        if (maxAwardable <= 0) continue;

        let remainingGrace = Math.min(graceMarksToAdd, maxAwardable);

        // Sort entries by headroom descending so marks are added where student lost most marks
        const sortedEntries = [...result.entries].sort((a, b) => {
          const headroomA = a.maxMarks - (a.approvedMark ?? a.aiMark);
          const headroomB = b.maxMarks - (b.approvedMark ?? b.aiMark);
          return headroomB - headroomA;
        });

        let anyEntryUpdated = false;
        for (const entry of sortedEntries) {
          if (remainingGrace <= 0.001) break;
          const currentMark = entry.approvedMark ?? entry.aiMark;
          const headroom = entry.maxMarks - currentMark;
          if (headroom <= 0) continue;

          const toAdd = Math.round(Math.min(headroom, remainingGrace) * 100) / 100;
          if (toAdd <= 0) continue;

          const newMark = Math.round((currentMark + toAdd) * 100) / 100;
          entry.approvedMark = newMark;
          entry.reviewStatus = 'overridden';
          remainingGrace = Math.round((remainingGrace - toAdd) * 100) / 100;
          anyEntryUpdated = true;

          const audit = auditRepo.create({
            answerEntry: entry,
            reviewer: { id: user.id },
            action: 'override',
            originalAiMark: entry.aiMark,
            finalMark: newMark,
            comment: `Teacher awarded +${toAdd} grace mark(s)`,
          });
          await auditRepo.save(audit);
          await entryRepo.save(entry);
        }

        if (anyEntryUpdated) {
          result.totalApprovedMark = result.entries.reduce(
            (sum, e) => sum + (e.approvedMark ?? e.aiMark),
            0,
          );
          const allEntriesReviewed = result.entries.every(
            (e) => e.reviewStatus !== 'pending' && e.approvedMark !== null && e.approvedMark !== undefined,
          );
          if (allEntriesReviewed) {
            result.reviewCompletedAt = new Date();
          }
          await resultRepo.save(result);
          updatedCount++;
        }
      }

      const exclusionNotice = excludedCheatingCount > 0
        ? ` (${excludedCheatingCount} student(s) excluded due to cheating violation)`
        : '';

      return {
        success: true,
        updatedCount,
        excludedCheatingCount,
        message: updatedCount > 0
          ? `Successfully added ${graceMarksToAdd} grace mark(s) to ${updatedCount} student paper(s)${exclusionNotice}.`
          : `No papers updated${exclusionNotice}. Students with confirmed cheating violations cannot receive grace marks.`,
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
    if (exam.questions?.length) {
      exam.questions.sort(
        (a, b) =>
          (a.orderIndex ?? Number.MAX_SAFE_INTEGER) -
          (b.orderIndex ?? Number.MAX_SAFE_INTEGER),
      );
    }
    return exam;
  }
}