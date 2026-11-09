import { Body, Controller, Get, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { EvaluationService } from './evaluation.service';
import { CreateRecheckRequestDto } from './dto/create-recheck-request.dto';

@Controller('student')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('student')
export class StudentResultsController {
  constructor(private evaluationService: EvaluationService) {}

  @Get('results')
  getPublishedResults(@Request() req) {
    return this.evaluationService.getPublishedStudentResults(req.user);
  }

  @Post('recheck-requests')
  createRecheckRequest(@Body() dto: CreateRecheckRequestDto, @Request() req) {
    return this.evaluationService.submitRecheckRequest(dto, req.user);
  }

  @Get('notifications')
  getNotifications(@Request() req) {
    return this.evaluationService.getStudentNotifications(req.user);
  }

  @Patch('notifications/:id/read')
  markNotificationRead(@Param('id') id: string, @Request() req) {
    return this.evaluationService.markStudentNotificationRead(id, req.user);
  }
}
