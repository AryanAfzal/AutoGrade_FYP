import { Controller, Get, Param, Patch, Body, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { EvaluationService } from './evaluation.service';
import { DecideRecheckRequestDto } from './dto/decide-recheck-request.dto';

@Controller('teacher/recheck-requests')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('teacher')
export class TeacherRecheckController {
  constructor(private evaluationService: EvaluationService) {}

  @Get()
  getRequests(@Request() req) {
    return this.evaluationService.getTeacherRecheckRequests(req.user);
  }

  @Patch(':id')
  decideRequest(
    @Param('id') id: string,
    @Body() dto: DecideRecheckRequestDto,
    @Request() req,
  ) {
    return this.evaluationService.decideRecheckRequest(id, dto, req.user);
  }
}
