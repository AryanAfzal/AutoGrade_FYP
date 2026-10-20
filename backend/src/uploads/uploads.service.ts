import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AnswerSheet } from './entities/answer-sheet.entity';
import axios from 'axios';
import * as path from 'path';
import { UsersService } from '../users/users.service';

function extractRollNumberFromFilename(fileName: string): string | null {
  const fullMatch = fileName.match(
    /(?:^|[^A-Z0-9])((?:SP|FA)\s*\d{2})[\s_-]+([A-Z]{2,4})[\s_-]+(\d{1,4})(?!\d)/i,
  );
  if (fullMatch) {
    return `${fullMatch[1].replace(/\s+/g, '').toUpperCase()}-${fullMatch[2].toUpperCase()}-${fullMatch[3]}`;
  }
  const shortMatch = fileName.match(
    /(?:^|[^A-Z0-9])((?:SP|FA)\s*\d{2})[\s_-]+(\d{1,4})(?!\d)/i,
  );
  if (!shortMatch) return null;
  return `${shortMatch[1].replace(/\s+/g, '').toUpperCase()}-${shortMatch[2]}`;
}

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);

  constructor(
    @InjectRepository(AnswerSheet)
    private sheetRepo: Repository<AnswerSheet>,
    private usersService: UsersService,
  ) {}

  async uploadSheets(examId: string, files: Express.Multer.File[]) {
    const sheets = [];

    for (const file of files) {
      // Convert multer's relative path to absolute so the AI service
      // (running in a different process/directory) can find the file
      const absolutePath = path.resolve(file.path);
      let studentName = 'Unknown';
      let registrationNo = 'Unknown';

      try {
        const response = await axios.post(
          `${process.env.AI_SERVICE_URL}/extract-student-info`,
          { filePath: absolutePath },
        );
        studentName = response.data.studentName || studentName;
        registrationNo = response.data.registrationNo || registrationNo;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Failed to extract student info from ${absolutePath}: ${message}`,
        );
      }

      const rollNumberFromFilename = extractRollNumberFromFilename(file.originalname);
      const resolvedRegistrationNo =
        rollNumberFromFilename || registrationNo;
      const matchedStudent = rollNumberFromFilename
        ? await this.usersService.findByRollNumber(rollNumberFromFilename)
        : null;

      const sheet = this.sheetRepo.create({
        exam:           { id: examId },
        studentName:    matchedStudent?.fullName || studentName,
        registrationNo: resolvedRegistrationNo,
        filePath:       absolutePath,   // store absolute path so evaluation can find it too
        status:         'uploaded',
      });
      sheets.push(await this.sheetRepo.save(sheet));
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
