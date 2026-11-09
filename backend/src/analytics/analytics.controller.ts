import { Controller, Get, Param, UseGuards, Res, Request } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AnalyticsService } from './analytics.service';

@Controller('analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('teacher')
export class AnalyticsController {
  constructor(private analyticsService: AnalyticsService) {}

  @Get(':examId')
  getReport(@Param('examId') examId: string, @Request() req) {
    return this.analyticsService.getReport(examId, req.user);
  }

  @Get(':examId/export')
  async exportCSV(@Param('examId') examId: string, @Request() req, @Res() res: Response) {
    const csv = await this.analyticsService.exportCSV(examId, req.user);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=analytics-${examId}.csv`);
    res.send(csv);
  }
}