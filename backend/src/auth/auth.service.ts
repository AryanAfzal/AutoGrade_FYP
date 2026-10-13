import { Injectable, BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { Repository } from 'typeorm';
import { UsersService } from '../users/users.service';
import { User } from '../users/entities/user.entity';
import { StudentEnrollment } from '../users/entities/student-enrollment.entity';
import { Exam } from '../exams/entities/exam.entity';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    @InjectRepository(StudentEnrollment)
    private enrollmentRepo: Repository<StudentEnrollment>,
    @InjectRepository(Exam)
    private examRepo: Repository<Exam>,
  ) {}

  private normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }

  private getAllowedAdminEmails() {
    const raw = process.env.AUTHORIZED_ADMIN_EMAILS || process.env.ADMIN_EMAIL || 'admin@cuiwah.edu.pk';
    return raw
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
  }

  private isAuthorizedAdmin(email: string) {
    return this.getAllowedAdminEmails().includes(this.normalizeEmail(email));
  }

  private async buildToken(user: User) {
    const token = this.jwtService.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      token,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        status: user.status,
        rollNumber: user.rollNumber,
        course: user.course,
        teacherId: user.teacherId,
        department: user.department,
        qualification: user.qualification,
        assignedSubjects: user.assignedSubjects || [],
      },
    };
  }

  async login(email: string, password: string, requestedRole?: 'teacher' | 'admin' | 'student') {
    const normalizedEmail = this.normalizeEmail(email);
    let user = await this.usersService.findByEmail(normalizedEmail);

    if (!user && requestedRole === 'admin' && this.isAuthorizedAdmin(normalizedEmail)) {
      const hashedPassword = await bcrypt.hash(password || 'google-admin-login', 10);
      user = await this.usersService.create({
        fullName: 'Administrator',
        email: normalizedEmail,
        password: hashedPassword,
        role: 'admin',
        status: 'APPROVED',
      });
    }

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const activeRole = requestedRole || user.role;
    if (user.role !== activeRole) {
      throw new UnauthorizedException(`This account is not registered as a ${activeRole}.`);
    }

    if (user.role === 'admin' && !this.isAuthorizedAdmin(user.email)) {
      throw new UnauthorizedException('Unauthorized admin account.');
    }

    if (user.status === 'PENDING') {
      throw new UnauthorizedException(
        user.role === 'teacher'
          ? 'Your teacher application is awaiting admin approval.'
          : 'Your student registration is awaiting admin approval and roll-number assignment.',
      );
    }
    if (user.status === 'REJECTED') {
      throw new UnauthorizedException(
        user.role === 'teacher'
          ? `Your teacher application was rejected. ${user.rejectionReason || 'Contact the administrator.'}`
          : `Your student registration was rejected. ${user.rejectionReason || 'Contact the administrator.'}`,
      );
    }

    return this.buildToken(user);
  }

  async googleAdminLogin(email: string, emailVerified: boolean) {
    const normalizedEmail = this.normalizeEmail(email);

    if (!emailVerified || !this.isAuthorizedAdmin(normalizedEmail)) {
      throw new UnauthorizedException('Unauthorized admin account.');
    }

    let user = await this.usersService.findByEmail(normalizedEmail);
    if (!user) {
      const hashedPassword = await bcrypt.hash('google-admin-login', 10);
      user = await this.usersService.create({
        fullName: 'Administrator',
        email: normalizedEmail,
        password: hashedPassword,
        role: 'admin',
        status: 'APPROVED',
      });
    }

    return this.buildToken(user);
  }

  async getCurrentUser(id: string) {
    const user = await this.usersService.findById(id);
    if (!user) {
      throw new UnauthorizedException('Authenticated user no longer exists.');
    }

    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      status: user.status,
      rollNumber: user.rollNumber,
      course: user.course,
      teacherId: user.teacherId,
      department: user.department,
      qualification: user.qualification,
      assignedSubjects: user.assignedSubjects || [],
    };
  }

  async registerStudent(data: {
    fullName: string;
    email: string;
    password: string;
  }) {
    const normalizedEmail = this.normalizeEmail(data.email);
    if (this.isAuthorizedAdmin(normalizedEmail)) {
      throw new BadRequestException(
        'This email is reserved for an administrator account.',
      );
    }
    const existingUser = await this.usersService.findByEmail(normalizedEmail);
    if (existingUser) {
      throw new UnauthorizedException('An account or pending request already exists for this email.');
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);

    const createdUser = await this.usersService.create({
      fullName: data.fullName.trim(),
      email: normalizedEmail,
      password: hashedPassword,
      role: 'student',
      status: 'PENDING',
      course: null,
      teacherId: null,
      rollNumber: null,
      requestedAt: new Date(),
    });

    return {
      message: 'Student registration submitted. An administrator will approve your account and assign your roll number.',
      user: {
        id: createdUser.id,
        fullName: createdUser.fullName,
        email: createdUser.email,
        role: createdUser.role,
        status: createdUser.status,
      },
    };
  }

  async registerTeacher(data: {
    fullName: string;
    email: string;
    password: string;
    phone: string;
    department: string;
    qualification: string;
  }) {
    const normalizedEmail = this.normalizeEmail(data.email);
    if (this.isAuthorizedAdmin(normalizedEmail)) {
      throw new BadRequestException(
        'This email is reserved for an administrator account.',
      );
    }
    const existingUser = await this.usersService.findByEmail(normalizedEmail);
    if (existingUser) {
      throw new BadRequestException('An account or application already exists for this email.');
    }

    const createdUser = await this.usersService.create({
      fullName: data.fullName.trim(),
      email: normalizedEmail,
      password: await bcrypt.hash(data.password, 10),
      role: 'teacher',
      status: 'PENDING',
      phone: data.phone.trim(),
      department: data.department.trim(),
      qualification: data.qualification.trim(),
      assignedSubjects: [],
      requestedAt: new Date(),
    });

    return {
      message: 'Teacher application submitted. You can sign in after an administrator approves it.',
      user: {
        id: createdUser.id,
        fullName: createdUser.fullName,
        email: createdUser.email,
        role: createdUser.role,
        status: createdUser.status,
      },
    };
  }

  async getEnrollmentOptions(studentId: string) {
    const student = await this.usersService.findById(studentId);
    if (!student || student.role !== 'student' || student.status !== 'APPROVED') {
      throw new UnauthorizedException('Only approved student accounts can browse available subjects.');
    }

    const teachers = (await this.usersService.findByRole('teacher')).filter(
      (teacher) => teacher.status === 'APPROVED',
    );
    const teacherIds = teachers.map((teacher) => teacher.id);
    const examSubjects = teacherIds.length
      ? await this.examRepo
          .createQueryBuilder('exam')
          .innerJoin('exam.createdBy', 'teacher')
          .select('teacher.id', 'teacherId')
          .addSelect('exam.course', 'subject')
          .where('teacher.id IN (:...teacherIds)', { teacherIds })
          .getRawMany<{ teacherId: string; subject: string }>()
      : [];
    const subjectsByTeacher = new Map<string, Map<string, string>>();
    for (const teacher of teachers) {
      const subjects = new Map<string, string>();
      for (const subject of teacher.assignedSubjects || []) {
        const normalized = subject.trim();
        if (normalized) subjects.set(normalized.toLowerCase(), normalized);
      }
      subjectsByTeacher.set(teacher.id, subjects);
    }
    for (const { teacherId, subject } of examSubjects) {
      const normalized = subject.trim();
      if (normalized) {
        subjectsByTeacher
          .get(teacherId)
          ?.set(normalized.toLowerCase(), normalized);
      }
    }
    const enrollments = await this.enrollmentRepo.find({
      where: { student: { id: studentId } },
      relations: ['teacher'],
      order: { requestedAt: 'DESC' },
    });

    return {
      offerings: teachers.flatMap((teacher) =>
        [...(subjectsByTeacher.get(teacher.id)?.values() || [])].map((subject) => ({
          teacherId: teacher.id,
          teacherName: teacher.fullName,
          subject,
        })),
      ),
      enrollments: enrollments.map((enrollment) => ({
        id: enrollment.id,
        teacherId: enrollment.teacher.id,
        teacherName: enrollment.teacher.fullName,
        subject: enrollment.subject,
        status: enrollment.status,
        rejectionReason: enrollment.rejectionReason,
        requestedAt: enrollment.requestedAt,
      })),
    };
  }

  async createStudentEnrollment(studentId: string, teacherId: string, subject: string) {
    const student = await this.usersService.findById(studentId);
    if (!student || student.role !== 'student' || student.status !== 'APPROVED' || !student.rollNumber) {
      throw new UnauthorizedException('Only approved students with an assigned roll number can request subject enrollment.');
    }

    const normalizedSubject = subject.trim();
    const teacher = await this.usersService.findById(teacherId);
    let teacherOffersSubject = false;
    if (teacher?.role === 'teacher' && teacher.status === 'APPROVED') {
      teacherOffersSubject = (teacher.assignedSubjects || []).some(
        (assignedSubject) =>
          assignedSubject.trim().toLowerCase() === normalizedSubject.toLowerCase(),
      );
      if (!teacherOffersSubject) {
        teacherOffersSubject = await this.examRepo
          .createQueryBuilder('exam')
          .innerJoin('exam.createdBy', 'teacher')
          .where('teacher.id = :teacherId', { teacherId })
          .andWhere('LOWER(TRIM(exam.course)) = :subject', {
            subject: normalizedSubject.toLowerCase(),
          })
          .getExists();
      }
    }
    if (
      !teacher ||
      teacher.role !== 'teacher' ||
      teacher.status !== 'APPROVED' ||
      !teacherOffersSubject
    ) {
      throw new BadRequestException('The selected teacher does not currently offer this subject.');
    }

    const existingEnrollment = await this.enrollmentRepo.findOne({
      where: { student: { id: studentId }, subject: normalizedSubject },
      relations: ['teacher'],
    });
    if (existingEnrollment) {
      if (existingEnrollment.status !== 'REJECTED') {
        throw new BadRequestException(
          `Your request for ${normalizedSubject} is already ${existingEnrollment.status.toLowerCase()}.`,
        );
      }
      existingEnrollment.teacher = teacher;
      existingEnrollment.status = 'PENDING';
      existingEnrollment.rejectionReason = null;
      existingEnrollment.requestedAt = new Date();
      existingEnrollment.reviewedAt = null;
      await this.enrollmentRepo.save(existingEnrollment);
      return {
        message: 'Subject enrollment request submitted.',
        enrollment: {
          id: existingEnrollment.id,
          subject: existingEnrollment.subject,
          teacherName: teacher.fullName,
          status: existingEnrollment.status,
        },
      };
    }

    const enrollment = this.enrollmentRepo.create({
      student,
      teacher,
      subject: normalizedSubject,
      status: 'PENDING',
    });
    await this.enrollmentRepo.save(enrollment);
    return {
      message: 'Subject enrollment request submitted.',
      enrollment: {
        id: enrollment.id,
        subject: enrollment.subject,
        teacherName: teacher.fullName,
        status: enrollment.status,
      },
    };
  }

  async getTeacherApplications() {
    const teachers = await this.usersService.findByRole('teacher');
    return teachers.map((teacher) => ({
      id: teacher.id,
      fullName: teacher.fullName,
      email: teacher.email,
      phone: teacher.phone,
      department: teacher.department,
      qualification: teacher.qualification,
      status: teacher.status,
      rejectionReason: teacher.rejectionReason,
      requestedAt: teacher.requestedAt,
      approvedAt: teacher.approvedAt,
      assignedSubjects: teacher.assignedSubjects || [],
    }));
  }

  async updateTeacherApplication(id: string, status: 'APPROVED' | 'REJECTED', reason?: string) {
    const teacher = await this.usersService.findById(id);
    if (!teacher || teacher.role !== 'teacher') {
      throw new NotFoundException('Teacher application not found.');
    }
    if (teacher.status !== 'PENDING') {
      throw new BadRequestException('This teacher application has already been reviewed.');
    }
    if (status === 'REJECTED' && !reason?.trim()) {
      throw new BadRequestException('A rejection reason is required.');
    }

    const updated = await this.usersService.update(id, {
      status,
      rejectionReason: status === 'REJECTED' ? reason?.trim() || 'Application rejected by administrator.' : null,
      approvedAt: status === 'APPROVED' ? new Date() : null,
    });

    return {
      message: status === 'APPROVED' ? 'Teacher application approved.' : 'Teacher application rejected.',
      teacher: {
        id: updated.id,
        status: updated.status,
        rejectionReason: updated.rejectionReason,
      },
    };
  }

  async assignTeacherSubjects(id: string, subjects: string[]) {
    const teacher = await this.usersService.findById(id);
    if (!teacher || teacher.role !== 'teacher') {
      throw new NotFoundException('Teacher not found.');
    }
    if (teacher.status !== 'APPROVED') {
      throw new BadRequestException('Approve the teacher before assigning subjects.');
    }

    const requestedSubjects = subjects.map((subject) => subject.trim()).filter(Boolean);
    if (requestedSubjects.length === 0) {
      throw new BadRequestException('Assign at least one subject.');
    }

    const subjectMap = new Map<string, string>();
    for (const subject of [...(teacher.assignedSubjects || []), ...requestedSubjects]) {
      const normalized = subject.trim();
      if (normalized) {
        subjectMap.set(normalized.toLowerCase(), normalized);
      }
    }
    const updated = await this.usersService.update(id, {
      assignedSubjects: [...subjectMap.values()],
    });
    return {
      id: updated.id,
      fullName: updated.fullName,
      assignedSubjects: updated.assignedSubjects || [],
    };
  }

  async getTeacherRequests(teacherId: string) {
    const enrollments = await this.enrollmentRepo.find({
      where: { teacher: { id: teacherId } },
      relations: ['student', 'teacher'],
      order: { requestedAt: 'DESC' },
    });
    return enrollments.map((enrollment) => ({
      id: enrollment.id,
      fullName: enrollment.student.fullName,
      email: enrollment.student.email,
      rollNumber: enrollment.student.rollNumber,
      subject: enrollment.subject,
      status: enrollment.status,
      requestedAt: enrollment.requestedAt,
      reviewedAt: enrollment.reviewedAt,
      rejectionReason: enrollment.rejectionReason,
    }));
  }

  async updateRegistrationStatus(id: string, status: 'APPROVED' | 'REJECTED', teacherId?: string, reason?: string) {
    if (!teacherId) {
      throw new UnauthorizedException('An authenticated teacher is required to review enrollment requests.');
    }
    const enrollment = await this.enrollmentRepo.findOne({
      where: { id, teacher: { id: teacherId } },
      relations: ['teacher', 'student'],
    });
    if (!enrollment) {
      throw new NotFoundException('Subject enrollment request not found.');
    }
    if (enrollment.status !== 'PENDING') {
      throw new BadRequestException('This subject enrollment request has already been reviewed.');
    }
    const teacher = enrollment.teacher;
    if (teacher.status !== 'APPROVED' || !(teacher.assignedSubjects || []).includes(enrollment.subject)) {
      throw new UnauthorizedException('You are no longer approved to teach this subject.');
    }
    if (status === 'REJECTED' && !reason?.trim()) {
      throw new BadRequestException('A rejection reason is required.');
    }

    const updated = await this.enrollmentRepo.save({
      ...enrollment,
      status,
      rejectionReason: status === 'REJECTED' ? reason?.trim() || null : null,
      reviewedAt: new Date(),
    });

    return {
      message: status === 'APPROVED' ? 'Student enrolled in the subject.' : 'Subject enrollment request rejected.',
      user: {
        id: updated.student.id,
        status: updated.status,
        subject: updated.subject,
        teacherId,
      },
    };
  }

  async getStudentApplications() {
    return (await this.usersService.findStudentApplications())
      .map((student) => ({
        id: student.id,
        fullName: student.fullName,
        email: student.email,
        status: student.status,
        rollNumber: student.rollNumber,
        requestedAt: student.requestedAt,
        approvedAt: student.approvedAt,
        rejectionReason: student.rejectionReason,
      }));
  }

  async updateStudentApplication(
    id: string,
    status: 'APPROVED' | 'REJECTED',
    rollNumber?: string,
    reason?: string,
  ) {
    const student = await this.usersService.findById(id);
    if (!student || student.role !== 'student') {
      throw new NotFoundException('Student application not found.');
    }
    const isLegacyRollNumberAssignment =
      student.status === 'APPROVED' &&
      status === 'APPROVED' &&
      !student.rollNumber;
    if (student.status !== 'PENDING' && !isLegacyRollNumberAssignment) {
      throw new BadRequestException('This student application has already been reviewed.');
    }

    let normalizedRollNumber: string | null = null;
    if (status === 'APPROVED') {
      normalizedRollNumber = rollNumber?.trim().toUpperCase() || null;
      if (!normalizedRollNumber) {
        throw new BadRequestException('Assign a roll number before approving this student.');
      }
      const existingStudent = await this.usersService.findByRollNumber(normalizedRollNumber);
      if (existingStudent && existingStudent.id !== id) {
        throw new BadRequestException('This roll number is already assigned to another account.');
      }
    } else if (!reason?.trim()) {
      throw new BadRequestException('A rejection reason is required.');
    }

    const updated = await this.usersService.update(id, {
      status,
      rollNumber: normalizedRollNumber,
      rejectionReason: status === 'REJECTED' ? reason!.trim() : student.rejectionReason,
      approvedAt: status === 'APPROVED' ? student.approvedAt || new Date() : null,
    });
    return {
      message: isLegacyRollNumberAssignment
        ? `Roll number ${updated.rollNumber} assigned to the existing student account.`
        : status === 'APPROVED'
        ? `Student approved with roll number ${updated.rollNumber}.`
        : 'Student application rejected.',
      student: {
        id: updated.id,
        status: updated.status,
        rollNumber: updated.rollNumber,
        rejectionReason: updated.rejectionReason,
      },
    };
  }
}