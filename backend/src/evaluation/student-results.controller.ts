import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { EvaluationService } from './evaluation.service';

@Controller('student')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('student')
export class StudentResultsController {
  constructor(private evaluationService: EvaluationService) {}

  @Get('results')
  getPublishedResults(@Request() req) {
    return this.evaluationService.getPublishedStudentResults(req.user);
  }
}
