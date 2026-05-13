import { Injectable } from '@nestjs/common';
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

  findOne(id: string) {
    return this.examRepo.findOne({
      where: { id },
      relations: ['questions'],
    });
  }
}