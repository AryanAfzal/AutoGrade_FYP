import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { EvaluationService } from './evaluation.service';
import { ReviewAnswerEntryDto } from './dto/review-answer-entry.dto';

@Controller('evaluation')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('teacher')
export class EvaluationController {
  constructor(private evaluationService: EvaluationService) {}

  @Post(':examId/trigger')
  triggerEvaluation(
    @Param('examId') examId: string,
    @Request() req,
    @Body('ocrEngine') ocrEngine?: string,
  ) {
    return this.evaluationService.triggerEvaluation(examId, req.user, ocrEngine);
  }

  @Get(':examId')
  getResults(@Param('examId') examId: string, @Request() req) {
    return this.evaluationService.getResults(examId, req.user);
  }

  @Get(':examId/similarity')
  getSimilarityFlags(@Param('examId') examId: string, @Request() req) {
    return this.evaluationService.getSimilarityFlags(examId, req.user);
  }

  @Patch(':examId/entries/:entryId/review')
  reviewAnswerEntry(
    @Param('examId') examId: string,
    @Param('entryId') entryId: string,
    @Body() dto: ReviewAnswerEntryDto,
    @Request() req,
  ) {
    return this.evaluationService.reviewAnswerEntry(
      examId,
      entryId,
      dto,
      req.user,
    );
  }

  @Patch(':examId/results/:resultId/complete')
  completeResultReview(
    @Param('examId') examId: string,
    @Param('resultId') resultId: string,
    @Request() req,
  ) {
    return this.evaluationService.completeResultReview(
      examId,
      resultId,
      req.user,
    );
  }

  @Post(':examId/publish')
  publishResults(@Param('examId') examId: string, @Request() req) {
    return this.evaluationService.publishResults(examId, req.user);
  }
}