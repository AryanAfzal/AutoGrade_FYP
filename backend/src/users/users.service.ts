import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

  findByRollNumber(rollNumber: string) {
    return this.repo
      .createQueryBuilder('user')
      .where('LOWER(TRIM(user.rollNumber)) = :rollNumber', {
        rollNumber: rollNumber.trim().toLowerCase(),
      })
      .getOne();
  }

  findByRole(role: User['role']) {
    return this.repo.find({ where: { role } });
  }

  findStudentApplications() {
    return this.repo.find({
      where: { role: 'student' },
      order: { requestedAt: 'DESC' },
    });
  }

  findByResetToken(hashedToken: string) {
    return this.repo.findOne({
      where: { resetPasswordToken: hashedToken },
    });
  }

  create(data: Partial<User>) {
    return this.repo.save(this.repo.create(data));
  }

  async update(id: string, data: Partial<User>): Promise<User> {
    const existing = await this.findById(id);
    if (!existing) {
      return this.repo.save(this.repo.create({ ...data, id }));
    }
    Object.assign(existing, data);
    return this.repo.save(existing);
  }
}