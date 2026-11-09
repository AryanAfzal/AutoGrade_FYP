import { BadRequestException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Exam } from './entities/exam.entity';
import { Question } from './entities/question.entity';
import { CreateExamDto } from './dto/create-exam.dto';
import { User } from '../users/entities/user.entity';
import { Course } from '../institutions/entities/course.entity';
import { Department } from '../institutions/entities/department.entity';
import { AnswerSheet } from '../uploads/entities/answer-sheet.entity';
import { StudentResult } from '../evaluation/entities/student-result.entity';
import { AnswerEntry } from '../evaluation/entities/answer-entry.entity';
import { ReviewAudit } from '../evaluation/entities/review-audit.entity';
import * as fs from 'fs/promises';
import * as path from 'path';

@Injectable()
export class ExamsService {
  private readonly logger = new Logger(ExamsService.name);

  constructor(
    @InjectRepository(Exam) private examRepo: Repository<Exam>,
    @InjectRepository(Question) private questionRepo: Repository<Question>,
    @InjectRepository(Course) private courseRepo: Repository<Course>,
    @InjectRepository(Department) private departmentRepo: Repository<Department>,
    private dataSource: DataSource,
  ) {}

  async create(dto: CreateExamDto, user: User) {
    let department = user.departmentId
      ? await this.departmentRepo.findOne({ where: { id: user.departmentId, active: true } })
      : null;
    if (!department && user.department?.trim()) {
      department = await this.departmentRepo
        .createQueryBuilder('department')
        .where('LOWER(department.name) = LOWER(:name)', { name: user.department.trim() })
        .andWhere('department.active = :active', { active: true })
        .getOne();
    }
    const course = department
      ? await this.courseRepo.createQueryBuilder('course')
          .where('course.departmentId = :departmentId', { departmentId: department.id })
          .andWhere('course.active = :active', { active: true })
          .andWhere('LOWER(course.title) = LOWER(:title)', { title: dto.course.trim() })
          .getOne()
      : null;
    const assigned = course && (
      user.assignedCourseIds?.length
        ? user.assignedCourseIds.includes(course.id)
        : (user.assignedSubjects || []).some(
            (subject) => subject.trim().toLowerCase() === course.title.trim().toLowerCase(),
          )
    );
    if (user.status !== 'APPROVED' || !assigned) {
      throw new UnauthorizedException('You may create exams only for subjects assigned to your approved teacher account.');
    }
    const recheckDeadline = new Date(dto.recheckDeadline);
    if (!Number.isFinite(recheckDeadline.getTime()) || recheckDeadline <= new Date()) {
      throw new BadRequestException('The recheck deadline must be a valid future date and time.');
    }

    for (const [index, question] of dto.questions.entries()) {
      if (question.type !== 'descriptive') continue;
      const rubric = question.rubric;
      if (!rubric?.concepts?.length) {
        throw new BadRequestException(`Question ${index + 1} must have at least one rubric concept.`);
      }

      const rubricMarks = rubric.concepts.reduce((sum, concept) => sum + concept.maxMarks, 0);
      if (Math.abs(rubricMarks - question.maxMarks) > 0.01) {
        throw new BadRequestException(
          `Question ${index + 1} rubric concept marks must add up to the question's ${question.maxMarks} marks.`,
        );
      }

      if (
        rubric.concepts.some(
          (concept) =>
            !concept.name.trim() ||
            (!concept.description.trim() && !(concept.keywords || []).length),
        )
      ) {
        throw new BadRequestException(
          `Each rubric concept in question ${index + 1} needs a name and a description or at least one keyword.`,
        );
      }

      const scoringWeights = rubric.scoringWeights;
      if (!scoringWeights) {
        throw new BadRequestException(`Question ${index + 1} rubric scoring weights are required.`);
      }
      const { semantic, keywords, concepts } = scoringWeights;
      if (Math.abs(semantic + keywords + concepts - 1) > 0.001) {
        throw new BadRequestException(
          `Question ${index + 1} rubric scoring weights must add up to 100%.`,
        );
      }
    }

    const exam = this.examRepo.create({
      title: dto.title,
      course: dto.course,
      term: dto.term,
      totalMarks: dto.totalMarks,
      recheckDeadline,
      createdBy: user,
    });
    const saved = await this.examRepo.save(exam);

    const questions = dto.questions.map((q) =>
      this.questionRepo.create({ ...q, exam: saved }),
    );
    await this.questionRepo.save(questions);

    return this.examRepo.findOne({
      where: { id: saved.id },
      relations: ['questions'],
    });
  }

  findAll(user: User) {
    return this.examRepo.find({
      where: { createdBy: { id: user.id } },
      relations: ['questions'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string, user: User) {
    const exam = await this.examRepo.findOne({
      where: { id, createdBy: { id: user.id } },
      relations: ['questions'],
    });
    if (!exam) {
      throw new BadRequestException('Exam not found or you do not have access to it.');
    }
    return exam;
  }

  async updateRecheckDeadline(id: string, deadline: string, user: User) {
    const exam = await this.examRepo.findOne({
      where: { id, createdBy: { id: user.id } },
    });
    if (!exam) {
      throw new NotFoundException('Exam not found or you do not have permission to change its recheck deadline.');
    }
    if (exam.recheckDeadline && new Date() > exam.recheckDeadline) {
      const hasPublishedResults = await this.dataSource
        .getRepository(StudentResult)
        .findOne({
          where: {
            status: 'approved',
            answerSheet: { exam: { id: exam.id } },
          },
          select: { id: true },
        });
      if (hasPublishedResults) {
        throw new BadRequestException('The recheck deadline has already passed and cannot be extended.');
      }
    }

    const recheckDeadline = new Date(deadline);
    if (!Number.isFinite(recheckDeadline.getTime()) || recheckDeadline <= new Date()) {
      throw new BadRequestException('The recheck deadline must be a valid future date and time.');
    }
    exam.recheckDeadline = recheckDeadline;
    return this.examRepo.save(exam);
  }

  async delete(id: string, user: User) {
    const exam = await this.examRepo.findOne({
      where: { id, createdBy: { id: user.id } },
      select: { id: true, title: true },
    });
    if (!exam) {
      throw new NotFoundException('Exam not found or you do not have permission to delete it.');
    }

    const filesToDelete = await this.dataSource.transaction(async (manager) => {
      const sheetRepo = manager.getRepository(AnswerSheet);
      const resultRepo = manager.getRepository(StudentResult);
      const entryRepo = manager.getRepository(AnswerEntry);
      const auditRepo = manager.getRepository(ReviewAudit);
      const sheets = await sheetRepo.find({
        where: { exam: { id } },
        select: { id: true, filePath: true },
      });
      const sheetIds = sheets.map((sheet) => sheet.id);

      if (sheetIds.length) {
        const results = await resultRepo.find({
          where: { answerSheet: { id: In(sheetIds) } },
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
            const audits = await auditRepo.find({
              where: { answerEntry: { id: In(entryIds) } },
              select: { id: true },
            });
            if (audits.length) await auditRepo.delete(audits.map((audit) => audit.id));
            await entryRepo.delete(entryIds);
          }
          await resultRepo.delete(resultIds);
        }
        await sheetRepo.delete(sheetIds);
      }

      await manager.getRepository(Exam).delete({ id });
      return sheets.map((sheet) => sheet.filePath);
    });

    const uploadsDirectory = path.resolve(process.cwd(), 'uploads');
    for (const filePath of filesToDelete) {
      const resolvedPath = path.resolve(filePath);
      const relativePath = path.relative(uploadsDirectory, resolvedPath);
      if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        this.logger.warn(`Skipped deleting answer file outside uploads directory: ${resolvedPath}`);
        continue;
      }
      try {
        await fs.unlink(resolvedPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          this.logger.error(`Exam ${exam.id} was deleted, but answer file cleanup failed: ${resolvedPath}`, error instanceof Error ? error.stack : String(error));
        }
      }
    }

    return { message: `Exam "${exam.title}" and its uploaded answer sheets and results were deleted.` };
  }
}