import { Controller, Get, Post, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { EvaluationService } from './evaluation.service';

@Controller('evaluation')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('teacher')
export class EvaluationController {
  constructor(private evaluationService: EvaluationService) {}

  @Post(':examId/trigger')
  triggerEvaluation(@Param('examId') examId: string) {
    return this.evaluationService.getResults(examId);
  }

  @Get(':examId')
  getResults(@Param('examId') examId: string) {
    return this.evaluationService.getResults(examId);
  }

  @Get(':examId/similarity')
  getSimilarityFlags(@Param('examId') examId: string) {
    return this.evaluationService.getSimilarityFlags(examId);
  }

  @Post(':examId/publish')
  publishResults(@Param('examId') examId: string) {
    return this.evaluationService.publishResults(examId);
  }
}