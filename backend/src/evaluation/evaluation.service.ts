import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StudentResult } from './entities/student-result.entity';
import { AnswerSheet } from '../uploads/entities/answer-sheet.entity';
import { Exam } from '../exams/entities/exam.entity';
import axios from 'axios';

@Injectable()
export class EvaluationService {
  private readonly logger = new Logger(EvaluationService.name);

  constructor(
    @InjectRepository(StudentResult)
    private resultRepo: Repository<StudentResult>,

    @InjectRepository(AnswerSheet)
    private sheetRepo: Repository<AnswerSheet>,

    @InjectRepository(Exam)
    private examRepo: Repository<Exam>,
  ) {}

  async getResults(examId: string) {
    // Load exam with questions once
    const exam = await this.examRepo.findOne({
      where: { id: examId },
      relations: ['questions'],
    });

    if (!exam) {
      throw new Error(`Exam ${examId} not found`);
    }

    // Get sheets that haven't been evaluated yet (status = 'uploaded')
    // or get all sheets if called for review
    const sheets = await this.sheetRepo.find({
      where: { exam: { id: examId } },
    });

    const results = [];

    for (const sheet of sheets) {
      // Check if already evaluated
      let result = await this.resultRepo.findOne({
        where: { answerSheet: { id: sheet.id } },
        relations: ['entries', 'answerSheet'],
      });

      // If not evaluated yet, evaluate it
      if (!result && sheet.status === 'uploaded') {
        try {
          // Update status to processing
          await this.sheetRepo.update(sheet.id, { status: 'processing' });

          // Call AI service
          const aiResponse = await axios.post(
            `${process.env.AI_SERVICE_URL}/evaluate`,
            {
              answersheetId: sheet.id,
              filePath: sheet.filePath,
              examId: examId,
              questions: exam.questions,
            },
            { timeout: 60000 }, // 60s timeout for AI evaluation
          );

          const { totalMark, totalMaxMarks, entries } = aiResponse.data;

          // Create student result
          result = this.resultRepo.create({
            answerSheet: sheet,
            totalAiMark: totalMark,
            totalMaxMarks: totalMaxMarks,
            status: 'awaiting_approval',
            entries: entries,
          });
          result = await this.resultRepo.save(result);

          // Reload with relations
          result = await this.resultRepo.findOne({
            where: { id: result.id },
            relations: ['entries', 'answerSheet'],
          });

          // Update answer sheet status to awaiting approval
          await this.sheetRepo.update(sheet.id, {
            status: 'awaiting_approval',
          });

          this.logger.log(
            `Evaluated sheet ${sheet.id} - Score: ${totalMark}/${totalMaxMarks}`,
          );

        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          this.logger.error(
            `AI evaluation failed for sheet ${sheet.id}: ${message}`,
          );

          // Update status to flagged (needs manual review)
          await this.sheetRepo.update(sheet.id, { status: 'flagged' });

          results.push({
            answersheetId: sheet.id,
            studentName: sheet.studentName,
            registrationNo: sheet.registrationNo,
            totalAiMark: 0,
            totalMaxMarks: exam.totalMarks,
            status: 'error',
            entries: [],
            error: `AI evaluation failed: ${message}`,
          });
          continue;
        }
      }

      // Return the result
      if (result) {
        results.push({
          answersheetId: sheet.id,
          studentName: sheet.studentName,
          registrationNo: sheet.registrationNo,
          totalAiMark: result.totalAiMark,
          totalMaxMarks: result.totalMaxMarks,
          status: result.status,
          entries: result.entries,
        });
      }
    }

    return results;
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