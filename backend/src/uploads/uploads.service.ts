import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { AnswerSheet } from './entities/answer-sheet.entity';
import axios from 'axios';
import * as path from 'path';
import * as fs from 'fs/promises';
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { UsersService } from '../users/users.service';
import { User } from '../users/entities/user.entity';
import { StudentResult } from '../evaluation/entities/student-result.entity';
import { AnswerEntry } from '../evaluation/entities/answer-entry.entity';
import { ReviewAudit } from '../evaluation/entities/review-audit.entity';
import { RecheckRequest } from '../evaluation/entities/recheck-request.entity';
import { RecheckAudit } from '../evaluation/entities/recheck-audit.entity';
import { Exam } from '../exams/entities/exam.entity';

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
    private dataSource: DataSource,
  ) {}

  async uploadSheets(examId: string, files: Express.Multer.File[], ocrEngine?: string) {
    const resolvedOcrEngine: 'trocr' | 'pen_to_print' | 'omr' =
      ocrEngine === 'omr'
        ? 'omr'
        : ocrEngine === 'pen_to_print'
          ? 'pen_to_print'
          : 'trocr';
    const sheets = [];

    for (const file of files) {
      // Convert multer's relative path to absolute so the AI service
      // (running in a different process/directory) can find the file
      const absolutePath = path.resolve(file.path);
      let studentName = 'Unknown';
      let registrationNo = 'Unknown';

      // 1. First, check if roll number is present in the filename (e.g. SP23-BCS-091.pdf)
      const rollNumberFromFilename = extractRollNumberFromFilename(file.originalname);
      let matchedStudent = null;
      if (rollNumberFromFilename) {
        registrationNo = rollNumberFromFilename;
        try {
          matchedStudent = await this.usersService.findByRollNumber(rollNumberFromFilename);
          if (matchedStudent) {
            studentName = matchedStudent.fullName;
          }
        } catch (findErr) {
          this.logger.warn(`Could not lookup student by roll number ${rollNumberFromFilename}: ${findErr}`);
        }
      }

      // 2. Only attempt AI service header extraction if student or registration is still unknown
      if ((registrationNo === 'Unknown' || studentName === 'Unknown') && process.env.AI_SERVICE_URL) {
        let fileBase64: string | undefined = undefined;
        if (existsSync(absolutePath)) {
          try {
            fileBase64 = readFileSync(absolutePath).toString('base64');
          } catch (readErr) {
            this.logger.warn(`Could not read file ${absolutePath} as base64: ${readErr}`);
          }
        }

        try {
          const response = await axios.post(
            `${process.env.AI_SERVICE_URL}/extract-student-info`,
            {
              filePath: absolutePath,
              fileBase64,
            },
            {
              timeout: 8000, // 8-second safety timeout: never hang uploads if AI service is sleeping
              maxContentLength: Infinity,
              maxBodyLength: Infinity,
            },
          );
          studentName = response.data.studentName || studentName;
          registrationNo = response.data.registrationNo || registrationNo;
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.warn(
            `Failed to extract student info from ${absolutePath}: ${message}`,
          );
        }
      }

      const resolvedRegistrationNo = rollNumberFromFilename || registrationNo;
      if (!matchedStudent && resolvedRegistrationNo && resolvedRegistrationNo !== 'Unknown') {
        try {
          matchedStudent = await this.usersService.findByRollNumber(resolvedRegistrationNo);
        } catch {
          // ignore lookup failure
        }
      }

      const sheet = this.sheetRepo.create({
        exam:           { id: examId },
        studentName:    matchedStudent?.fullName || studentName,
        registrationNo: resolvedRegistrationNo,
        filePath:       absolutePath,   // store absolute path so evaluation can find it too
        ocrEngine:      resolvedOcrEngine,
        status:         'uploaded',
      });
      sheets.push(await this.sheetRepo.save(sheet));
    }

    if (sheets.length > 0) {
      const examRepo = this.dataSource.getRepository(Exam);
      const exam = await examRepo.findOne({ where: { id: examId } });
      if (exam && exam.status === 'published') {
        exam.status = 'under_review';
        exam.publishedAt = null;
        await examRepo.save(exam);
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

  async getSheetPdf(examId: string, sheetId: string, user: User) {
    const sheet = await this.sheetRepo.findOne({
      where: {
        id: sheetId,
        exam: { id: examId, createdBy: { id: user.id } },
      },
    });
    if (!sheet) {
      throw new NotFoundException('Answer sheet not found for this exam.');
    }

    const uploadsDirectory = await fs.realpath(path.resolve(process.cwd(), 'uploads'));
    const resolvedPath = path.resolve(sheet.filePath);
    const relativePath = path.relative(uploadsDirectory, resolvedPath);
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      throw new NotFoundException('The PDF file is not available.');
    }

    let realFilePath: string;
    try {
      realFilePath = await fs.realpath(resolvedPath);
      const realRelativePath = path.relative(uploadsDirectory, realFilePath);
      if (realRelativePath.startsWith('..') || path.isAbsolute(realRelativePath)) {
        throw new NotFoundException('The PDF file is not available.');
      }
      const fileInfo = await fs.stat(realFilePath);
      if (!fileInfo.isFile()) {
        throw new NotFoundException('The PDF file is not available.');
      }
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new NotFoundException('The PDF file is no longer available.');
      }
      throw error;
    }

    return {
      stream: createReadStream(realFilePath),
      fileName: path.basename(realFilePath),
    };
  }

  async deleteSheet(examId: string, sheetId: string, user: User) {
    const sheet = await this.sheetRepo.findOne({
      where: {
        id: sheetId,
        exam: { id: examId, createdBy: { id: user.id } },
      },
      relations: ['exam'],
    });
    if (!sheet) {
      throw new NotFoundException('Answer sheet not found for this exam.');
    }
    if (sheet.status === 'processing') {
      throw new BadRequestException('Wait for processing to finish before deleting this answer sheet.');
    }

    await this.dataSource.transaction(async (manager) => {
      const resultRepo = manager.getRepository(StudentResult);
      const entryRepo = manager.getRepository(AnswerEntry);
      const reviewAuditRepo = manager.getRepository(ReviewAudit);
      const recheckRequestRepo = manager.getRepository(RecheckRequest);
      const recheckAuditRepo = manager.getRepository(RecheckAudit);

      const results = await resultRepo.find({
        where: { answerSheet: { id: sheet.id } },
        select: { id: true },
      });
      const resultIds = results.map((result) => result.id);
      if (resultIds.length) {
        const entries = await entryRepo.find({
          where: { result: { id: In(resultIds) } },
          select: { id: true },
        });
        const entryIds = entries.map((entry) => entry.id);
        if (entryIds.length) {
          const recheckRequests = await recheckRequestRepo.find({
            where: { answerEntry: { id: In(entryIds) } },
            select: { id: true },
          });
          const recheckRequestIds = recheckRequests.map((request) => request.id);
          if (recheckRequestIds.length) {
            const recheckAudits = await recheckAuditRepo.find({
              where: { request: { id: In(recheckRequestIds) } },
              select: { id: true },
            });
            if (recheckAudits.length) {
              await recheckAuditRepo.delete(recheckAudits.map((audit) => audit.id));
            }
            await recheckRequestRepo.delete(recheckRequestIds);
          }
          const reviewAudits = await reviewAuditRepo.find({
            where: { answerEntry: { id: In(entryIds) } },
            select: { id: true },
          });
          if (reviewAudits.length) {
            await reviewAuditRepo.delete(reviewAudits.map((audit) => audit.id));
          }
          await entryRepo.delete(entryIds);
        }
        await resultRepo.delete(resultIds);
      }

      await manager.getRepository(AnswerSheet).delete({ id: sheet.id });

      const examRepo = manager.getRepository(Exam);
      const exam = await examRepo.findOne({ where: { id: examId } });
      if (exam && exam.status === 'published') {
        const remainingUnpublishedResults = await manager.getRepository(StudentResult).count({
          where: { answerSheet: { exam: { id: examId } }, status: 'awaiting_approval' },
        });
        const remainingSheets = await manager.getRepository(AnswerSheet).count({
          where: { exam: { id: examId } },
        });
        if (remainingSheets === 0 || remainingUnpublishedResults > 0) {
          exam.status = 'under_review';
          exam.publishedAt = null;
          await examRepo.save(exam);
        }
      }
    });

    const uploadsDirectory = path.resolve(process.cwd(), 'uploads');
    const resolvedPath = path.resolve(sheet.filePath);
    const relativePath = path.relative(uploadsDirectory, resolvedPath);
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      this.logger.warn(`Skipped deleting answer file outside uploads directory: ${resolvedPath}`);
    } else {
      try {
        await fs.unlink(resolvedPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          this.logger.error(
            `Answer sheet ${sheet.id} was deleted, but its file cleanup failed: ${resolvedPath}`,
            error instanceof Error ? error.stack : String(error),
          );
        }
      }
    }

    if (sheet.omrAnnotatedPath) {
      const resolvedOmrPath = path.resolve(sheet.omrAnnotatedPath);
      const relativeOmrPath = path.relative(uploadsDirectory, resolvedOmrPath);
      if (!relativeOmrPath.startsWith('..') && !path.isAbsolute(relativeOmrPath)) {
        try {
          await fs.unlink(resolvedOmrPath);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            this.logger.warn(`Failed to clean up OMR annotated image: ${resolvedOmrPath}`);
          }
        }
      }
    }

    return {
      message: `Answer sheet for ${sheet.registrationNo || sheet.studentName} and its evaluation data were deleted.`,
    };
  }
}
