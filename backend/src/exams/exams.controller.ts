import {
  Controller, Get, Post, Body, Param,
  UseGuards, Request, UseInterceptors, UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ExamsService } from './exams.service';
import { CreateExamDto } from './dto/create-exam.dto';
import axios from 'axios';
import * as fs from 'fs';
import FormData from 'form-data';

@Controller('exams')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('teacher')
export class ExamsController {
  constructor(private examsService: ExamsService) {}

  @Post()
  create(@Body() dto: CreateExamDto, @Request() req) {
    return this.examsService.create(dto, req.user);
  }

  @Get()
  findAll(@Request() req) {
    return this.examsService.findAll(req.user);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    return this.examsService.findOne(id, req.user);
  }

  @Post('parse-pdf')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads',
        filename: (_, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
      }),
    }),
  )
  async parsePdf(@UploadedFile() file: Express.Multer.File) {
    const form = new FormData();
    form.append('file', fs.createReadStream(file.path), file.originalname);

    const response = await axios.post(
      `${process.env.AI_SERVICE_URL}/parse-pdf`,
      form,
      { headers: form.getHeaders() },
    );
    return response.data;
  }
}