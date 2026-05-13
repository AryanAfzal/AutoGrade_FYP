import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StudentResult } from './entities/student-result.entity';
import { AnswerSheet } from '../uploads/entities/answer-sheet.entity';
import axios from 'axios';

@Injectable()
export class EvaluationService {
  constructor(
    @InjectRepository(StudentResult)
    private resultRepo: Repository<StudentResult>,
    @InjectRepository(AnswerSheet)
    private sheetRepo: Repository<AnswerSheet>,
  ) {}

  async getResults(examId: string) {
    const sheets = await this.sheetRepo.find({
      where: { exam: { id: examId } },
    });

    const results = [];
    for (const sheet of sheets) {
      let result = await this.resultRepo.findOne({
        where: { answerSheet: { id: sheet.id } },
        relations: ['entries', 'answerSheet'],
      });

      if (!result) {
        // Trigger AI evaluation
        try {
          const aiResponse = await axios.post(
            `${process.env.AI_SERVICE_URL}/evaluate`,
            { answersheetId: sheet.id, filePath: sheet.filePath, examId },
          );
          result = await this.resultRepo.save(
            this.resultRepo.create({
              answerSheet: sheet,
              totalAiMark: aiResponse.data.totalMark,
              totalMaxMarks: aiResponse.data.totalMaxMarks,
              entries: aiResponse.data.entries,
            }),
          );
        } catch {
          continue;
        }
      }

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
    return results;
  }

  async getSimilarityFlags(examId: string) {
    const response = await axios.get(
      `${process.env.AI_SERVICE_URL}/similarity/${examId}`,
    );
    return response.data;
  }

  async publishResults(examId: string) {
    await this.sheetRepo.update(
      { exam: { id: examId } },
      { status: 'approved' },
    );
    return { message: 'Results published successfully' };
  }
}