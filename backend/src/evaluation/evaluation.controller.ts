import { Controller, Get, Post, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { EvaluationService } from './evaluation.service';

@Controller('evaluation')
@UseGuards(JwtAuthGuard)
export class EvaluationController {
  constructor(private evaluationService: EvaluationService) {}

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