import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Exam } from './entities/exam.entity';
import { Question } from './entities/question.entity';
import { CreateExamDto } from './dto/create-exam.dto';
import { User } from '../users/entities/user.entity';

@Injectable()
export class ExamsService {
  constructor(
    @InjectRepository(Exam) private examRepo: Repository<Exam>,
    @InjectRepository(Question) private questionRepo: Repository<Question>,
  ) {}

  async create(dto: CreateExamDto, user: User) {
    if (user.status !== 'APPROVED' || !(user.assignedSubjects || []).includes(dto.course)) {
      throw new UnauthorizedException('You may create exams only for subjects assigned to your approved teacher account.');
    }

    const exam = this.examRepo.create({
      title: dto.title,
      course: dto.course,
      term: dto.term,
      totalMarks: dto.totalMarks,
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
}