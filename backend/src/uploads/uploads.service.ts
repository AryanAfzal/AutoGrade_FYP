import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AnswerSheet } from './entities/answer-sheet.entity';
import axios from 'axios';

@Injectable()
export class UploadsService {
  constructor(
    @InjectRepository(AnswerSheet)
    private sheetRepo: Repository<AnswerSheet>,
  ) {}

  async uploadSheets(examId: string, files: Express.Multer.File[]) {
    const sheets = [];

    for (const file of files) {
      // Call AI service to extract student info from PDF
      try {
        const response = await axios.post(
          `${process.env.AI_SERVICE_URL}/extract-student-info`,
          { filePath: file.path },
        );
        const { studentName, registrationNo } = response.data;

        const sheet = this.sheetRepo.create({
          exam: { id: examId },
          studentName: studentName || 'Unknown',
          registrationNo: registrationNo || 'Unknown',
          filePath: file.path,
          status: 'uploaded',
        });
        sheets.push(await this.sheetRepo.save(sheet));
      } catch {
        const sheet = this.sheetRepo.create({
          exam: { id: examId },
          studentName: 'Unknown',
          registrationNo: 'Unknown',
          filePath: file.path,
          status: 'uploaded',
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