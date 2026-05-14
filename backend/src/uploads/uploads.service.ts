import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AnswerSheet } from './entities/answer-sheet.entity';
import axios from 'axios';
import * as path from 'path';

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);

  constructor(
    @InjectRepository(AnswerSheet)
    private sheetRepo: Repository<AnswerSheet>,
  ) {}

  async uploadSheets(examId: string, files: Express.Multer.File[]) {
    const sheets = [];

    for (const file of files) {
      // Convert multer's relative path to absolute so the AI service
      // (running in a different process/directory) can find the file
      const absolutePath = path.resolve(file.path);

      try {
        const response = await axios.post(
          `${process.env.AI_SERVICE_URL}/extract-student-info`,
          { filePath: absolutePath },
        );
        const { studentName, registrationNo } = response.data;

        const sheet = this.sheetRepo.create({
          exam:           { id: examId },
          studentName:    studentName    || 'Unknown',
          registrationNo: registrationNo || 'Unknown',
          filePath:       absolutePath,   // store absolute path so evaluation can find it too
          status:         'uploaded',
        });
        sheets.push(await this.sheetRepo.save(sheet));

      } catch (err: any) {
        this.logger.error(`Failed to extract student info from ${absolutePath}: ${err.message}`);

        const sheet = this.sheetRepo.create({
          exam:           { id: examId },
          studentName:    'Unknown',
          registrationNo: 'Unknown',
          filePath:       absolutePath,
          status:         'uploaded',
        });
        sheets.push(await this.sheetRepo.save(sheet));
      }
    }

    return sheets;
  }

  getSheets(examId: string) {
    return this.sheetRepo.find({
      where: { exam: { id: examId } },
      order: { uploadedAt: 'DESC' },
    });
  }
}