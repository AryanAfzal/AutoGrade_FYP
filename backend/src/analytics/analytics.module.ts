import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StudentResult } from '../evaluation/entities/student-result.entity';
import { Exam } from '../exams/entities/exam.entity';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';
import { RolesGuard } from '../auth/guards/roles.guard';

@Module({
  imports: [TypeOrmModule.forFeature([StudentResult, Exam])],
  providers: [AnalyticsService, RolesGuard],
  controllers: [AnalyticsController],
})
export class AnalyticsModule {}