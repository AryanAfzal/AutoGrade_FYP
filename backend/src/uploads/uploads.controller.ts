import {
  Controller, Post, Get, Param, Delete, Request,
  UseGuards, UseInterceptors, UploadedFiles,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UploadsService } from './uploads.service';

@Controller('uploads')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('teacher')
export class UploadsController {
  constructor(private uploadsService: UploadsService) {}

  @Post(':examId')
  @UseInterceptors(
    FilesInterceptor('files', 50, {
      storage: diskStorage({
        destination: './uploads',
        filename: (_, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
      }),
    }),
  )
  uploadSheets(
    @Param('examId') examId: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.uploadsService.uploadSheets(examId, files);
  }

  @Get(':examId')
  getSheets(@Param('examId') examId: string) {
    return this.uploadsService.getSheets(examId);
  }

  @Delete(':examId/:sheetId')
  deleteSheet(
    @Param('examId') examId: string,
    @Param('sheetId') sheetId: string,
    @Request() req,
  ) {
    return this.uploadsService.deleteSheet(examId, sheetId, req.user);
  }
}