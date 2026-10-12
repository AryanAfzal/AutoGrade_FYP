import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Exam } from './entities/exam.entity';
import { Question } from './entities/question.entity';
import { ExamsService } from './exams.service';
import { ExamsController } from './exams.controller';
import { RolesGuard } from '../auth/guards/roles.guard';

@Module({
  imports: [TypeOrmModule.forFeature([Exam, Question])],
  providers: [ExamsService, RolesGuard],
  controllers: [ExamsController],
  exports: [ExamsService],
})
export class ExamsModule {}