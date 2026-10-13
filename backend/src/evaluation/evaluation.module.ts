import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StudentResult } from './entities/student-result.entity';
import { AnswerEntry } from './entities/answer-entry.entity';
import { AnswerSheet } from '../uploads/entities/answer-sheet.entity';
import { Exam } from '../exams/entities/exam.entity';           // ← added
import { ReviewAudit } from './entities/review-audit.entity';
import { EvaluationService } from './evaluation.service';
import { EvaluationController } from './evaluation.controller';
import { RolesGuard } from '../auth/guards/roles.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      StudentResult,
      AnswerEntry,
      AnswerSheet,
      Exam,           
      ReviewAudit,
    ]),
  ],
  providers: [EvaluationService, RolesGuard],
  controllers: [EvaluationController],
})
export class EvaluationModule {}