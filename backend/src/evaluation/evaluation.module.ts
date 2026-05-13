import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StudentResult } from './entities/student-result.entity';
import { AnswerEntry } from './entities/answer-entry.entity';
import { AnswerSheet } from '../uploads/entities/answer-sheet.entity';
import { Exam } from '../exams/entities/exam.entity';           // ← added
import { EvaluationService } from './evaluation.service';
import { EvaluationController } from './evaluation.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      StudentResult,
      AnswerEntry,
      AnswerSheet,
      Exam,           
    ]),
  ],
  providers: [EvaluationService],
  controllers: [EvaluationController],
})
export class EvaluationModule {}