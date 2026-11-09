import { BadRequestException, ConflictException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsersService } from '../users/users.service';
import { Department } from './entities/department.entity';
import { Course } from './entities/course.entity';
import { AcademicTerm } from './entities/academic-term.entity';
import { StudentEnrollment } from '../users/entities/student-enrollment.entity';
import { AcademicTermDto, AssignDepartmentDto, AssignStudentSubjectDto, CourseDto, DepartmentDto } from './dto/institution.dto';

@Injectable()
export class InstitutionsService {
  constructor(
    @InjectRepository(Department) private departmentsRepo: Repository<Department>,
    @InjectRepository(Course) private coursesRepo: Repository<Course>,
    @InjectRepository(AcademicTerm) private termsRepo: Repository<AcademicTerm>,
    @InjectRepository(StudentEnrollment) private enrollmentRepo: Repository<StudentEnrollment>,
    private usersService: UsersService,
  ) {}

  getOverview() {
    return Promise.all([
      this.departmentsRepo.count(),
      this.coursesRepo.count(),
      this.termsRepo.count(),
      this.usersService.findAllUsers(),
    ]).then(async ([departmentCount, courseCount, termCount, users]) => ({
      departmentCount,
      courseCount,
      termCount,
      userCount: users.filter((user) => user.role !== 'admin').length,
      assignedUserCount: users.filter((user) => user.role !== 'admin' && Boolean(user.department)).length,
    }));
  }

  findDepartments() {
    return this.departmentsRepo.find({ order: { name: 'ASC' } });
  }
  createDepartment(dto: DepartmentDto) {
    return this.saveDepartment(null, dto);
  }
  async updateDepartment(id: string, dto: DepartmentDto) {
    const department = await this.departmentsRepo.findOne({ where: { id } });
    if (!department) throw new NotFoundException('Department not found.');
    return this.saveDepartment(department, dto);
  }
  async deleteDepartment(id: string) {
    const department = await this.departmentsRepo.findOne({ where: { id } });
    if (!department) throw new NotFoundException('Department not found.');
    await this.usersService.clearDepartmentAssignments(department.id, department.name);
    await this.coursesRepo.update({ departmentId: department.id }, {
      departmentId: null,
      departmentName: null,
    });
    await this.departmentsRepo.delete(id);
    return { message: `${department.name} deleted.` };
  }

  private async saveDepartment(existing: Department | null, dto: DepartmentDto) {
    const name = dto.name.trim();
    const code = dto.code.trim().toUpperCase();
    const duplicate = await this.departmentsRepo
      .createQueryBuilder('department')
      .where('(LOWER(department.name) = LOWER(:name) OR department.code = :code)', { name, code })
      .andWhere(existing ? 'department.id != :id' : '1 = 1', existing ? { id: existing.id } : {})
      .getOne();
    if (duplicate) {
      throw new ConflictException('A department with this name or code already exists.');
    }
    const previousName = existing?.name;
    const department = existing || this.departmentsRepo.create();
    Object.assign(department, dto, { name, code });
    const saved = await this.departmentsRepo.save(department);
    await this.usersService.syncDepartmentAssignments(saved.id, saved.name, previousName);
    await this.coursesRepo.update({ departmentId: saved.id }, { departmentName: saved.name });
    return saved;
  }

  findCourses() {
    return this.coursesRepo.find({ order: { code: 'ASC' } });
  }
  createCourse(dto: CourseDto) {
    return this.saveCourse(null, dto);
  }
  async updateCourse(id: string, dto: CourseDto) {
    const course = await this.coursesRepo.findOne({ where: { id } });
    if (!course) throw new NotFoundException('Course not found.');
    return this.saveCourse(course, dto);
  }
  async deleteCourse(id: string) {
    const course = await this.coursesRepo.findOne({ where: { id } });
    if (!course) throw new NotFoundException('Course not found.');
    await this.usersService.syncCourseAssignments(course.id, course.title, true);
    await this.coursesRepo.delete(id);
    return { message: `${course.code} deleted.` };
  }

  private async saveCourse(existing: Course | null, dto: CourseDto) {
    if (!dto.departmentId) {
      throw new BadRequestException('Select a department for every subject.');
    }
    const code = dto.code.trim().toUpperCase();
    const duplicate = await this.coursesRepo.findOne({ where: { code } });
    if (duplicate && duplicate.id !== existing?.id) {
      throw new ConflictException('A course with this code already exists.');
    }
    if (dto.departmentId) {
      const department = await this.departmentsRepo.findOne({ where: { id: dto.departmentId, active: true } });
      if (!department) throw new BadRequestException('Select an active department for this subject.');
      dto.departmentName = department.name;
    }
    const previousDepartmentId = existing?.departmentId;
    const previousTitle = existing?.title;
    const course = existing || this.coursesRepo.create();
    Object.assign(course, dto, {
      code,
      creditHours: dto.creditHours ?? course.creditHours ?? 3,
      departmentId: dto.departmentId || null,
      departmentName: dto.departmentId ? dto.departmentName : null,
    });
    const saved = await this.coursesRepo.save(course);
    if (existing && previousDepartmentId !== saved.departmentId) {
      await this.usersService.syncCourseAssignments(saved.id, saved.title, true);
    } else if (existing && previousTitle !== saved.title) {
      await this.usersService.syncCourseAssignments(saved.id, saved.title);
    }
    return saved;
  }

  findTerms() {
    return this.termsRepo.find({ order: { startDate: 'DESC' } });
  }
  async createTerm(dto: AcademicTermDto) {
    this.validateTermDates(dto.startDate, dto.endDate);
    if (dto.current) {
      await this.termsRepo.update({ current: true }, { current: false, status: 'CLOSED' });
    }
    return this.termsRepo.save(this.termsRepo.create({
      ...dto,
      current: dto.current ?? false,
      status: dto.status ?? (dto.current ? 'ACTIVE' : 'UPCOMING'),
    }));
  }
  async updateTerm(id: string, dto: AcademicTermDto) {
    const term = await this.termsRepo.findOne({ where: { id } });
    if (!term) throw new NotFoundException('Academic term not found.');
    this.validateTermDates(dto.startDate || term.startDate, dto.endDate || term.endDate);
    if (dto.current) {
      await this.termsRepo.update({ current: true }, { current: false, status: 'CLOSED' });
    }
    Object.assign(term, dto);
    if (dto.current) term.status = 'ACTIVE';
    return this.termsRepo.save(term);
  }
  async deleteTerm(id: string) {
    const term = await this.termsRepo.findOne({ where: { id } });
    if (!term) throw new NotFoundException('Academic term not found.');
    await this.termsRepo.delete(id);
    return { message: `${term.name} deleted.` };
  }

  getUsers() {
    return this.usersService.findAllUsers();
  }
  async assignUserDepartment(id: string, dto: AssignDepartmentDto) {
    const user = await this.usersService.findById(id);
    if (!user) throw new NotFoundException('User not found.');
    if (user.role === 'admin') {
      throw new BadRequestException('Departments can only be assigned to teachers and students.');
    }

    const department = dto.departmentId
      ? await this.departmentsRepo.findOne({ where: { id: dto.departmentId, active: true } })
      : null;
    if (dto.departmentId && !department) {
      throw new BadRequestException('Select an active department.');
    }
    const departmentChanged = user.departmentId !== (department?.id || null)
      || (!user.departmentId && user.department !== (department?.name || null));
    const updated = await this.usersService.update(id, {
      department: department?.name || null,
      departmentId: department?.id || null,
      ...(user.role === 'teacher' && departmentChanged
        ? { assignedSubjects: [], assignedCourseIds: [] }
        : {}),
    });
    return {
      message: department ? `${department.name} assigned to ${updated.fullName}.` : `Department removed from ${updated.fullName}.`,
      user: { id: updated.id, fullName: updated.fullName, email: updated.email, role: updated.role, department: updated.department, departmentId: updated.departmentId },
    };
  }

  async getStudentAssignments() {
    const enrollments = await this.enrollmentRepo.find({
      where: { student: { role: 'student' } },
      relations: ['student', 'teacher'],
      order: { requestedAt: 'DESC' },
    });
    return enrollments.map((enrollment) => ({
      id: enrollment.id,
      studentId: enrollment.student.id,
      studentName: enrollment.student.fullName,
      teacherId: enrollment.teacher.id,
      teacherName: enrollment.teacher.fullName,
      subject: enrollment.subject,
      status: enrollment.status,
    }));
  }

  async assignStudentSubject(studentId: string, dto: AssignStudentSubjectDto) {
    const [student, teacher, course] = await Promise.all([
      this.usersService.findById(studentId),
      this.usersService.findById(dto.teacherId),
      this.coursesRepo.findOne({ where: { id: dto.courseId, active: true } }),
    ]);
    if (!student || student.role !== 'student') throw new NotFoundException('Student not found.');
    if (student.status !== 'APPROVED') throw new BadRequestException('Approve the student before assigning subjects.');
    if (!teacher || teacher.role !== 'teacher' || teacher.status !== 'APPROVED') {
      throw new BadRequestException('Select an approved teacher.');
    }
    if (!course) throw new BadRequestException('Select an active department subject.');

    const department = await this.departmentsRepo.findOne({ where: { id: course.departmentId, active: true } });
    if (!department) throw new BadRequestException('The subject department is not active.');
    const studentDepartment = await this.resolveUserDepartment(student);
    const teacherDepartment = await this.resolveUserDepartment(teacher);
    if (studentDepartment?.id !== department.id || teacherDepartment?.id !== department.id) {
      throw new BadRequestException('The student, teacher, and subject must all belong to the same department.');
    }
    const hasSubject = teacher.assignedCourseIds?.length
      ? teacher.assignedCourseIds.includes(course.id)
      : (teacher.assignedSubjects || []).some((subject) =>
          subject.trim().toLowerCase() === course.title.trim().toLowerCase()
          || subject.trim().toLowerCase() === course.code.trim().toLowerCase(),
        );
    if (!hasSubject) {
      throw new BadRequestException('Assign this subject to the teacher before enrolling the student.');
    }

    let enrollment = await this.enrollmentRepo.findOne({
      where: { student: { id: student.id }, subject: course.title },
      relations: ['student', 'teacher'],
    });
    if (!enrollment) {
      enrollment = this.enrollmentRepo.create({ student, teacher, subject: course.title });
    }
    enrollment.teacher = teacher;
    enrollment.status = 'APPROVED';
    enrollment.rejectionReason = null;
    enrollment.reviewedAt = new Date();
    const saved = await this.enrollmentRepo.save(enrollment);
    return {
      message: `${student.fullName} is now enrolled in ${course.title} with ${teacher.fullName}.`,
      enrollment: {
        id: saved.id,
        studentId: student.id,
        studentName: student.fullName,
        teacherId: teacher.id,
        teacherName: teacher.fullName,
        subject: course.title,
        status: saved.status,
      },
    };
  }

  private async resolveUserDepartment(user: { departmentId?: string | null; department?: string | null }) {
    if (user.departmentId) {
      const byId = await this.departmentsRepo.findOne({ where: { id: user.departmentId, active: true } });
      if (byId) return byId;
    }
    if (!user.department?.trim()) return null;
    return this.departmentsRepo.createQueryBuilder('department')
      .where('LOWER(department.name) = LOWER(:name)', { name: user.department.trim() })
      .andWhere('department.active = :active', { active: true })
      .getOne();
  }

  private validateTermDates(startDate: string, endDate: string) {
    if (endDate < startDate) {
      throw new BadRequestException('The academic term end date must be on or after its start date.');
    }
  }
}
