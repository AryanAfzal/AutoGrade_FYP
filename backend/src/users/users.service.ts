import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { User, UserAccountStatus } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(@InjectRepository(User) private repo: Repository<User>) {}

  findByEmail(email: string) {
    return this.repo.findOne({ where: { email: email.toLowerCase().trim() } });
  }

  findById(id: string) {
    return this.repo.findOne({ where: { id } });
  }

  findByRole(role: User['role']) {
    return this.repo.find({ where: { role } });
  }

  findStudentRegistrationRequests(teacherId?: string) {
    const where: any = {
      role: 'student',
      status: In(['PENDING', 'APPROVED', 'REJECTED']),
    };

    if (teacherId) {
      where.teacherId = teacherId;
    }

    return this.repo.find({
      where,
      order: { requestedAt: 'DESC' as const },
    });
  }

  create(data: Partial<User>) {
    return this.repo.save(this.repo.create(data));
  }

  update(id: string, data: Partial<User>) {
    return this.repo.save(this.repo.create({ ...data, id }));
  }
}