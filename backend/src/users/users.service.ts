import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
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

  findAllUsers() {
    return this.repo.find({
      order: { fullName: 'ASC' },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        status: true,
        department: true,
        departmentId: true,
        assignedSubjects: true,
        assignedCourseIds: true,
        rollNumber: true,
        course: true,
        phone: true,
        createdAt: true,
      },
    });
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

  async syncDepartmentAssignments(
    departmentId: string,
    departmentName: string,
    previousName?: string,
  ) {
    await this.repo.update({ departmentId }, { department: departmentName });
    if (previousName && previousName !== departmentName) {
      await this.repo.update(
        { department: previousName, departmentId: IsNull() },
        { department: departmentName, departmentId },
      );
    }
  }

  async clearDepartmentAssignments(departmentId: string, departmentName: string) {
    await this.repo.update(
      { departmentId },
      { department: null, departmentId: null, assignedSubjects: [], assignedCourseIds: [] },
    );
    await this.repo.update(
      { department: departmentName, departmentId: IsNull() },
      { department: null, assignedSubjects: [], assignedCourseIds: [] },
    );
  }

  async syncCourseAssignments(
    courseId: string,
    nextTitle: string,
    remove = false,
  ) {
    const teachers = await this.repo.find({ where: { role: 'teacher' } });
    for (const teacher of teachers) {
      const ids = teacher.assignedCourseIds || [];
      const index = ids.indexOf(courseId);
      if (index < 0) continue;
      const subjects = [...(teacher.assignedSubjects || [])];
      if (remove) {
        ids.splice(index, 1);
        subjects.splice(index, 1);
      } else {
        subjects[index] = nextTitle;
      }
      await this.repo.save({ ...teacher, assignedCourseIds: ids, assignedSubjects: subjects });
    }
  }
}