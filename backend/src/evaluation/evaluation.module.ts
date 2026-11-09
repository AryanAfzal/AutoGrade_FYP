import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StudentResult } from './entities/student-result.entity';
import { AnswerEntry } from './entities/answer-entry.entity';
import { AnswerSheet } from '../uploads/entities/answer-sheet.entity';
import { Exam } from '../exams/entities/exam.entity';           // ← added
import { ReviewAudit } from './entities/review-audit.entity';
import { EvaluationService } from './evaluation.service';
import { EvaluationController } from './evaluation.controller';
import { StudentResultsController } from './student-results.controller';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RecheckRequest } from './entities/recheck-request.entity';
import { RecheckAudit } from './entities/recheck-audit.entity';
import { UserNotification } from './entities/user-notification.entity';
import { TeacherRecheckController } from './teacher-recheck.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      StudentResult,
      AnswerEntry,
      AnswerSheet,
      Exam,           
      ReviewAudit,
      RecheckRequest,
      RecheckAudit,
      UserNotification,
    ]),
  ],
  providers: [EvaluationService, RolesGuard],
  controllers: [EvaluationController, StudentResultsController, TeacherRecheckController],
})
export class EvaluationModule {}