import {
  Injectable,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
  ConflictException,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { DataSource, IsNull, MoreThan, Repository } from 'typeorm';
import { UsersService } from '../users/users.service';
import { User } from '../users/entities/user.entity';
import { StudentEnrollment } from '../users/entities/student-enrollment.entity';
import { Exam } from '../exams/entities/exam.entity';
import { Course } from '../institutions/entities/course.entity';
import { Department } from '../institutions/entities/department.entity';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { RefreshToken } from './entities/refresh-token.entity';

function parseTokenLifetime(value: string): number {
  const match = /^(\d+)(s|m|h|d)$/.exec(value);
  if (!match) {
    throw new Error(
      'JWT_REFRESH_EXPIRES_IN must be a positive number followed by s, m, h, or d.',
    );
  }

  const factors = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  const lifetime = Number(match[1]) * factors[match[2] as keyof typeof factors];
  if (!Number.isSafeInteger(lifetime) || lifetime <= 0) {
    throw new Error('JWT_REFRESH_EXPIRES_IN must be a positive supported duration.');
  }
  return lifetime;
}

const PREDEFINED_ADMIN_ACCOUNTS = [
  { email: 'admin@cuiwah.edu.pk', fullName: 'Chief System Administrator' },
  { email: 'admin1@cuiwah.edu.pk', fullName: 'Administrator 1 (Academic)' },
  { email: 'admin2@cuiwah.edu.pk', fullName: 'Administrator 2 (Examinations)' },
  { email: 'admin3@cuiwah.edu.pk', fullName: 'Administrator 3 (Quality Assurance)' },
];

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private dataSource: DataSource,
    @InjectRepository(StudentEnrollment)
    private enrollmentRepo: Repository<StudentEnrollment>,
    @InjectRepository(Exam)
    private examRepo: Repository<Exam>,
    @InjectRepository(Course)
    private courseRepo: Repository<Course>,
    @InjectRepository(Department)
    private departmentRepo: Repository<Department>,
    @InjectRepository(RefreshToken)
    private refreshTokenRepo: Repository<RefreshToken>,
  ) {}

  async onModuleInit() {
    this.getRefreshTokenLifetimeMs();
    await this.ensureNativeUuidFunction();
    await this.seedPredefinedAdmins();
  }

  private async ensureNativeUuidFunction() {
    try {
      await this.dataSource.query(`
        UPDATE pg_proc
        SET probin = NULL,
            prosrc = 'gen_random_uuid',
            prolang = (SELECT oid FROM pg_language WHERE lanname = 'internal')
        WHERE proname = 'uuid_generate_v4'
          AND probin IS NOT NULL;
      `);
    } catch (err) {
      this.logger.warn(`Could not patch uuid_generate_v4 to internal gen_random_uuid: ${err}`);
    }
  }

  private normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }

  private async getUserDepartment(user: User): Promise<Department | null> {
    if (user.departmentId) {
      const byId = await this.departmentRepo.findOne({ where: { id: user.departmentId } });
      if (byId) return byId;
    }
    if (!user.department?.trim()) return null;
    const byName = await this.departmentRepo
      .createQueryBuilder('department')
      .where('LOWER(department.name) = LOWER(:name)', { name: user.department.trim() })
      .getOne();
    if (byName && user.departmentId !== byName.id) {
      await this.usersService.update(user.id, { departmentId: byName.id, department: byName.name });
    }
    return byName;
  }

  private teacherHasCourse(teacher: User, course: Course) {
    if (teacher.assignedCourseIds?.length) {
      return teacher.assignedCourseIds.includes(course.id);
    }
    return (teacher.assignedSubjects || []).some((subject) => {
      const normalized = subject.trim().toLowerCase();
      return normalized === course.title.trim().toLowerCase()
        || normalized === course.code.trim().toLowerCase();
    });
  }

  getAllowedAdminEmails(): string[] {
    const envRaw =
      process.env.AUTHORIZED_ADMIN_EMAILS ||
      process.env.ADMIN_EMAIL ||
      '';
    const envEmails = envRaw
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);

    const defaults = PREDEFINED_ADMIN_ACCOUNTS.map((a) => a.email.toLowerCase());
    return Array.from(new Set([...defaults, ...envEmails]));
  }

  isAuthorizedAdmin(email: string) {
    return this.getAllowedAdminEmails().includes(this.normalizeEmail(email));
  }

  private async seedPredefinedAdmins() {
    const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'Admin@123';
    const hashedPassword = await bcrypt.hash(defaultPassword, 10);

    for (const adminDef of PREDEFINED_ADMIN_ACCOUNTS) {
      const normalizedEmail = this.normalizeEmail(adminDef.email);
      const existing = await this.usersService.findByEmail(normalizedEmail);
      if (!existing) {
        await this.usersService.create({
          fullName: adminDef.fullName,
          email: normalizedEmail,
          password: hashedPassword,
          role: 'admin',
          status: 'APPROVED',
          university: 'COMSATS University Islamabad, Wah Campus',
          isProfileComplete: true,
          authProvider: 'local',
          approvedAt: new Date(),
        });
        this.logger.log(`Seeded predefined admin account: ${normalizedEmail}`);
      } else if (existing.role !== 'admin' || existing.status !== 'APPROVED') {
        await this.usersService.update(existing.id, {
          role: 'admin',
          status: 'APPROVED',
          isProfileComplete: true,
        });
      }
    }
  }

  private serializeUser(user: User) {
    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      status: user.status,
      university: user.university || 'COMSATS University Islamabad, Wah Campus',
      profilePicture: user.profilePicture || null,
      isProfileComplete: Boolean(user.isProfileComplete),
      authProvider: user.authProvider || 'local',
      rollNumber: user.rollNumber,
      phone: user.phone,
      course: user.course,
      teacherId: user.teacherId,
      department: user.department,
      departmentId: user.departmentId,
      qualification: user.qualification,
      assignedSubjects: user.assignedSubjects || [],
      assignedCourseIds: user.assignedCourseIds || [],
    };
  }

  private getRefreshTokenLifetimeMs() {
    return parseTokenLifetime(process.env.JWT_REFRESH_EXPIRES_IN || '30d');
  }

  private async buildToken(user: User, rememberMe = false) {
    const expiresIn =
      process.env.JWT_ACCESS_EXPIRES_IN || process.env.JWT_EXPIRES_IN || '15m';
    const token = this.jwtService.sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
      },
      { expiresIn: expiresIn as any },
    );
    const refreshToken = crypto.randomBytes(48).toString('hex');
    const expiresAt = new Date(Date.now() + this.getRefreshTokenLifetimeMs());
    await this.refreshTokenRepo.save(
      this.refreshTokenRepo.create({
        tokenHash: crypto.createHash('sha256').update(refreshToken).digest('hex'),
        userId: user.id,
        expiresAt,
        revokedAt: null,
        replacedByTokenHash: null,
        rememberMe,
      }),
    );

    return {
      token,
      refreshToken,
      rememberMe,
      expiresIn,
      refreshExpiresAt: expiresAt.toISOString(),
      user: this.serializeUser(user),
    };
  }

  async rotateRefreshToken(rawToken: string) {
    if (!rawToken) {
      throw new UnauthorizedException('A valid refresh token is required.');
    }

    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const now = new Date();
    const existing = await this.refreshTokenRepo.findOne({
      where: { tokenHash, revokedAt: IsNull(), expiresAt: MoreThan(now) },
    });
    if (!existing) {
      throw new UnauthorizedException('Refresh token is invalid or expired.');
    }

    const user = await this.usersService.findById(existing.userId);
    if (
      !user ||
      user.status !== 'APPROVED' ||
      (user.role === 'admin' && !this.isAuthorizedAdmin(user.email))
    ) {
      throw new UnauthorizedException('This account is not permitted to refresh its session.');
    }

    const refreshToken = crypto.randomBytes(48).toString('hex');
    const newTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const expiresAt = new Date(now.getTime() + this.getRefreshTokenLifetimeMs());
    const rememberMe = existing.rememberMe;

    const rotated = await this.dataSource.transaction(async (manager) => {
      const refreshTokens = manager.getRepository(RefreshToken);
      const result = await refreshTokens.update(
        {
          id: existing.id,
          revokedAt: IsNull(),
          expiresAt: MoreThan(now),
        },
        { revokedAt: now, replacedByTokenHash: newTokenHash },
      );
      if (!result.affected) return false;

      await refreshTokens.save(
        refreshTokens.create({
          tokenHash: newTokenHash,
          userId: user.id,
          expiresAt,
          revokedAt: null,
          replacedByTokenHash: null,
          rememberMe,
        }),
      );
      return true;
    });

    if (!rotated) {
      throw new UnauthorizedException('Refresh token has already been used.');
    }

    const accessExpiresIn =
      process.env.JWT_ACCESS_EXPIRES_IN || process.env.JWT_EXPIRES_IN || '15m';
    const accessToken = this.jwtService.sign(
      { sub: user.id, email: user.email, role: user.role },
      { expiresIn: accessExpiresIn as any },
    );
    return {
      token: accessToken,
      refreshToken,
      rememberMe,
      expiresIn: accessExpiresIn,
      refreshExpiresAt: expiresAt.toISOString(),
      user: this.serializeUser(user),
    };
  }

  async revokeRefreshToken(rawToken?: string) {
    if (!rawToken) return;
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    await this.refreshTokenRepo.update(
      { tokenHash, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  async login(
    email: string,
    password: string,
    requestedRole?: 'teacher' | 'admin' | 'student',
    rememberMe = false,
  ) {
    const normalizedEmail = this.normalizeEmail(email);
    let user = await this.usersService.findByEmail(normalizedEmail);

    if (!user && requestedRole === 'admin' && this.isAuthorizedAdmin(normalizedEmail)) {
      const hashedPassword = await bcrypt.hash(password || 'Admin@123', 10);
      user = await this.usersService.create({
        fullName: 'Administrator',
        email: normalizedEmail,
        password: hashedPassword,
        role: 'admin',
        status: 'APPROVED',
        university: 'COMSATS University Islamabad, Wah Campus',
        isProfileComplete: true,
      });
    }

    if (!user) {
      throw new UnauthorizedException(
        'Invalid email or password. Please check your credentials and try again.',
      );
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      throw new UnauthorizedException(
        'Invalid email or password. Please check your credentials and try again.',
      );
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
          : 'Your student registration is awaiting admin approval and roll-number verification.',
      );
    }
    if (user.status === 'REJECTED') {
      throw new UnauthorizedException(
        user.role === 'teacher'
          ? `Your teacher application was rejected. ${user.rejectionReason || 'Contact the administrator.'}`
          : `Your student registration was rejected. ${user.rejectionReason || 'Contact the administrator.'}`,
      );
    }

    return this.buildToken(user, Boolean(rememberMe));
  }

  async getCurrentUser(id: string) {
    const user = await this.usersService.findById(id);
    if (!user) {
      throw new UnauthorizedException('Authenticated user no longer exists.');
    }

    return this.serializeUser(user);
  }

  async registerStudent(data: {
    university?: string;
    fullName: string;
    email: string;
    registrationNumber?: string;
    rollNumber?: string;
    password: string;
  }) {
    const normalizedEmail = this.normalizeEmail(data.email);
    if (this.isAuthorizedAdmin(normalizedEmail)) {
      throw new BadRequestException(
        'This email is reserved for a predefined administrator account.',
      );
    }
    const existingUser = await this.usersService.findByEmail(normalizedEmail);
    if (existingUser) {
      throw new ConflictException(
        'An account or pending request already exists for this email address.',
      );
    }

    const rawRegNo = (data.registrationNumber || data.rollNumber || '').trim().toUpperCase();
    if (!rawRegNo) {
      throw new BadRequestException('Registration number is required.');
    }

    const existingRollUser = await this.usersService.findByRollNumber(rawRegNo);
    if (existingRollUser) {
      throw new ConflictException(
        'A student with this registration number is already registered.',
      );
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);
    const universityName =
      data.university?.trim() || 'COMSATS University Islamabad, Wah Campus';

    const createdUser = await this.usersService.create({
      fullName: data.fullName.trim(),
      email: normalizedEmail,
      password: hashedPassword,
      role: 'student',
      status: 'PENDING',
      university: universityName,
      course: null,
      teacherId: null,
      rollNumber: rawRegNo,
      isProfileComplete: true,
      authProvider: 'local',
      requestedAt: new Date(),
    });

    return {
      message:
        'Student registration submitted successfully. An administrator will verify your registration number and approve your account.',
      user: this.serializeUser(createdUser),
    };
  }

  async registerTeacher(data: {
    fullName: string;
    email: string;
    password: string;
    university?: string;
    phone?: string;
    department?: string;
    qualification?: string;
  }) {
    const normalizedEmail = this.normalizeEmail(data.email);
    if (this.isAuthorizedAdmin(normalizedEmail)) {
      throw new BadRequestException(
        'This email is reserved for a predefined administrator account.',
      );
    }
    const existingUser = await this.usersService.findByEmail(normalizedEmail);
    if (existingUser) {
      throw new ConflictException(
        'An account or application already exists for this email address.',
      );
    }

    const phone = data.phone?.trim() || null;
    const department = data.department?.trim() || null;
    const qualification = data.qualification?.trim() || null;
    const university =
      data.university?.trim() || 'COMSATS University Islamabad, Wah Campus';

    const createdUser = await this.usersService.create({
      fullName: data.fullName.trim(),
      email: normalizedEmail,
      password: await bcrypt.hash(data.password, 10),
      role: 'teacher',
      status: 'PENDING',
      university,
      phone,
      department,
      qualification,
      isProfileComplete: Boolean(phone && department && qualification),
      authProvider: 'local',
      assignedSubjects: [],
      requestedAt: new Date(),
    });

    return {
      message:
        'Teacher application submitted. You can sign in after an administrator approves it.',
      user: this.serializeUser(createdUser),
    };
  }

  async forgotPassword(email: string) {
    const normalizedEmail = this.normalizeEmail(email);
    const user = await this.usersService.findByEmail(normalizedEmail);
    if (!user) {
      throw new NotFoundException(
        'No registered account was found with this email address.',
      );
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await this.usersService.update(user.id, {
      resetPasswordToken: hashedToken,
      resetPasswordExpiresAt: expiresAt,
    });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const resetLink = `${frontendUrl}/reset-password?token=${rawToken}`;

    this.logger.log(
      `[Password Reset] Generated single-use reset link for ${normalizedEmail} (expires in 15m): ${resetLink}`,
    );

    return {
      message:
        'A time-limited password reset link has been generated for your registered email address.',
      resetToken: rawToken,
      resetLink,
      expiresInMinutes: 15,
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    if (dto.newPassword !== dto.confirmPassword) {
      throw new BadRequestException(
        'New password and confirm password do not match.',
      );
    }

    const hashedToken = crypto
      .createHash('sha256')
      .update(dto.token.trim())
      .digest('hex');

    const user = await this.usersService.findByResetToken(hashedToken);
    if (
      !user ||
      !user.resetPasswordExpiresAt ||
      new Date(user.resetPasswordExpiresAt).getTime() < Date.now()
    ) {
      throw new BadRequestException(
        'This password reset link is invalid or has expired. Please request a new password reset.',
      );
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);
    await this.usersService.update(user.id, {
      password: hashedPassword,
      resetPasswordToken: null,
      resetPasswordExpiresAt: null,
    });

    return {
      message:
        'Your password has been reset successfully! You may now sign in with your new password.',
    };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found.');
    }

    const updates: Partial<User> = {};

    if (dto.fullName !== undefined) {
      updates.fullName = dto.fullName.trim();
    }
    if (dto.university !== undefined) {
      updates.university = dto.university.trim();
    }
    if (dto.phone !== undefined) {
      updates.phone = dto.phone.trim() || null;
    }
    if (dto.department !== undefined) {
      updates.department = dto.department.trim() || null;
    }
    if (dto.qualification !== undefined) {
      updates.qualification = dto.qualification.trim() || null;
    }
    if (dto.profilePicture !== undefined) {
      updates.profilePicture = dto.profilePicture || null;
    }

    if (dto.email !== undefined) {
      const normalizedEmail = this.normalizeEmail(dto.email);
      if (normalizedEmail !== user.email) {
        if (user.role !== 'admin' && this.isAuthorizedAdmin(normalizedEmail)) {
          throw new BadRequestException(
            'This email is reserved for an administrator account.',
          );
        }
        const existingEmail = await this.usersService.findByEmail(normalizedEmail);
        if (existingEmail && existingEmail.id !== user.id) {
          throw new ConflictException('This email address is already in use.');
        }
        updates.email = normalizedEmail;
      }
    }

    if (dto.registrationNumber !== undefined && user.role === 'student') {
      const normalizedRoll = dto.registrationNumber.trim().toUpperCase();
      if (normalizedRoll && normalizedRoll !== user.rollNumber) {
        const existingRoll = await this.usersService.findByRollNumber(normalizedRoll);
        if (existingRoll && existingRoll.id !== user.id) {
          throw new ConflictException(
            'This registration number is already assigned to another student.',
          );
        }
        updates.rollNumber = normalizedRoll;
      }
    }

    updates.isProfileComplete = true;

    const updated = await this.usersService.update(user.id, updates);
    return {
      message: 'Profile updated successfully.',
      user: this.serializeUser(updated),
    };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    if (dto.newPassword !== dto.confirmPassword) {
      throw new BadRequestException(
        'New password and confirmation password do not match.',
      );
    }

    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found.');
    }

    const isCurrentValid = await bcrypt.compare(dto.currentPassword, user.password);
    if (!isCurrentValid) {
      throw new UnauthorizedException('Current password is incorrect.');
    }

    const isSamePassword = await bcrypt.compare(dto.newPassword, user.password);
    if (isSamePassword) {
      throw new BadRequestException(
        'New password must be different from your current password.',
      );
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);
    await this.usersService.update(user.id, {
      password: hashedPassword,
    });

    return {
      message: 'Your password has been updated successfully.',
    };
  }

  async getEnrollmentOptions(studentId: string) {
    const student = await this.usersService.findById(studentId);
    if (!student || student.role !== 'student' || student.status !== 'APPROVED') {
      throw new UnauthorizedException('Only approved student accounts can browse available subjects.');
    }

    const studentDepartmentRecord = await this.getUserDepartment(student);
    const studentDepartment = studentDepartmentRecord?.active ? studentDepartmentRecord : null;
    const teachers = studentDepartment
      ? (await this.usersService.findByRole('teacher')).filter(
          (teacher) => teacher.status === 'APPROVED',
        )
      : [];
    const courses = studentDepartment
      ? await this.courseRepo.find({
          where: { departmentId: studentDepartment.id, active: true },
          order: { code: 'ASC' },
        })
      : [];
    const offerings = (await Promise.all(teachers.map(async (teacher) => {
      const teacherDepartment = await this.getUserDepartment(teacher);
      if (!teacherDepartment?.active || teacherDepartment.id !== studentDepartment?.id) return [];
      return courses
        .filter((course) => this.teacherHasCourse(teacher, course))
        .map((course) => ({
          teacherId: teacher.id,
          teacherName: teacher.fullName,
          subject: course.title,
          subjectCode: course.code,
          departmentId: course.departmentId,
        }));
    }))).flat();
    const allEnrollments = await this.enrollmentRepo.find({
      where: { student: { id: studentId } },
      relations: ['teacher'],
      order: { requestedAt: 'DESC' },
    });
    const enrollments = [];
    for (const enrollment of allEnrollments) {
      if (!studentDepartment || (await this.getUserDepartment(enrollment.teacher))?.id !== studentDepartment.id) continue;
      const course = courses.find((item) => item.title.trim().toLowerCase() === enrollment.subject.trim().toLowerCase());
      if (course && this.teacherHasCourse(enrollment.teacher, course)) {
        enrollments.push(enrollment);
      }
    }

    return {
      enrollments: enrollments.map((enrollment) => ({
        id: enrollment.id,
        teacherId: enrollment.teacher.id,
        teacherName: enrollment.teacher.fullName,
        subject: enrollment.subject,
        status: enrollment.status,
        rejectionReason: enrollment.rejectionReason,
        requestedAt: enrollment.requestedAt,
        })),
      offerings,
      department: studentDepartment
        ? { id: studentDepartment.id, name: studentDepartment.name, code: studentDepartment.code }
        : null,
    };
  }

  async createStudentEnrollment(studentId: string, teacherId: string, subject: string) {
    const student = await this.usersService.findById(studentId);
    if (!student || student.role !== 'student' || student.status !== 'APPROVED' || !student.rollNumber) {
      throw new UnauthorizedException('Only approved students with an assigned roll number can request subject enrollment.');
    }

    const normalizedSubject = subject.trim();
    const teacher = await this.usersService.findById(teacherId);
    const studentDepartment = await this.getUserDepartment(student);
    const teacherDepartment = teacher ? await this.getUserDepartment(teacher) : null;
    const normalized = normalizedSubject.toLowerCase();
    const course = studentDepartment
      ? await this.courseRepo.createQueryBuilder('course')
          .where('course.departmentId = :departmentId', { departmentId: studentDepartment.id })
          .andWhere('course.active = :active', { active: true })
          .andWhere('(LOWER(course.title) = :subject OR LOWER(course.code) = :subject)', { subject: normalized })
          .getOne()
      : null;
    const teacherOffersSubject = Boolean(
      teacher &&
      teacher.status === 'APPROVED' &&
      studentDepartment &&
      studentDepartment.active &&
      teacherDepartment?.active &&
      teacherDepartment?.id === studentDepartment.id &&
      course &&
      ((teacher.assignedCourseIds || []).length
        ? teacher.assignedCourseIds.includes(course.id)
        : (teacher.assignedSubjects || []).some((assigned) => {
            const value = assigned.trim().toLowerCase();
            return value === normalized || value === course.title.trim().toLowerCase() || value === course.code.trim().toLowerCase();
          })),
    );
    if (
      !teacher ||
      teacher.role !== 'teacher' ||
      teacher.status !== 'APPROVED' ||
      !teacherOffersSubject
    ) {
      throw new BadRequestException('The selected teacher does not currently offer this subject.');
    }

    const subjectName = course!.title;
    const existingEnrollment = await this.enrollmentRepo.findOne({
      where: { student: { id: studentId }, subject: subjectName },
      relations: ['teacher'],
    });
    if (existingEnrollment) {
      if (existingEnrollment.status !== 'REJECTED') {
        throw new BadRequestException(
          `Your request for ${subjectName} is already ${existingEnrollment.status.toLowerCase()}.`,
        );
      }
      existingEnrollment.teacher = teacher!;
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
          teacherName: teacher!.fullName,
          status: existingEnrollment.status,
        },
      };
    }

    const enrollment = this.enrollmentRepo.create({
      student,
      teacher: teacher!,
      subject: subjectName,
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
    return Promise.all(teachers.map(async (teacher) => {
      const department = await this.getUserDepartment(teacher);
      return {
      id: teacher.id,
      fullName: teacher.fullName,
      email: teacher.email,
      university: teacher.university || 'COMSATS University Islamabad, Wah Campus',
      phone: teacher.phone,
      department: department?.name || teacher.department,
      departmentId: department?.id || null,
      qualification: teacher.qualification,
      status: teacher.status,
      rejectionReason: teacher.rejectionReason,
      requestedAt: teacher.requestedAt,
      approvedAt: teacher.approvedAt,
      assignedSubjects: teacher.assignedSubjects || [],
      assignedCourseIds: teacher.assignedCourseIds || [],
      };
    }));
  }

  async updateTeacherApplication(id: string, status: 'APPROVED' | 'REJECTED', reason?: string) {
    if (status === 'REJECTED' && !reason?.trim()) {
      throw new BadRequestException('A rejection reason is required.');
    }

    return this.dataSource.transaction(async (manager) => {
      const teacher = await manager.findOne(User, {
        where: { id, role: 'teacher' },
        lock: { mode: 'pessimistic_write' },
      });

      if (!teacher) {
        throw new NotFoundException('Teacher application not found.');
      }
      if (teacher.status !== 'PENDING') {
        throw new ConflictException(
          'This teacher application has already been reviewed by an administrator.',
        );
      }

      teacher.status = status;
      teacher.rejectionReason =
        status === 'REJECTED'
          ? reason?.trim() || 'Application rejected by administrator.'
          : null;
      teacher.approvedAt = status === 'APPROVED' ? new Date() : null;

      const updated = await manager.save(User, teacher);

      return {
        message:
          status === 'APPROVED'
            ? 'Teacher application approved.'
            : 'Teacher application rejected.',
        teacher: {
          id: updated.id,
          status: updated.status,
          rejectionReason: updated.rejectionReason,
        },
      };
    });
  }

  async assignTeacherSubjects(id: string, subjects: string[]) {
    const teacher = await this.usersService.findById(id);
    if (!teacher || teacher.role !== 'teacher') {
      throw new NotFoundException('Teacher not found.');
    }
    if (teacher.status !== 'APPROVED') {
      throw new BadRequestException('Approve the teacher before assigning subjects.');
    }

    const department = await this.getUserDepartment(teacher);
    if (!department) {
      throw new BadRequestException('Assign the teacher to a department before assigning subjects.');
    }
    const requestedSubjects = [...new Set(subjects.map((subject) => subject.trim().toLowerCase()).filter(Boolean))];
    const courses = await this.courseRepo.find({
      where: { departmentId: department.id, active: true },
    });
    const selectedCourses = requestedSubjects.map((subject) =>
      courses.find((course) =>
        course.id === subject ||
        course.title.trim().toLowerCase() === subject ||
        course.code.trim().toLowerCase() === subject,
      ),
    );
    if (selectedCourses.some((course) => !course)) {
      throw new BadRequestException("Assign only active subjects belonging to the teacher's department.");
    }
    const updated = await this.usersService.update(id, {
      assignedSubjects: selectedCourses.map((course) => course!.title),
      assignedCourseIds: selectedCourses.map((course) => course!.id),
    });
    return {
      id: updated.id,
      fullName: updated.fullName,
      assignedSubjects: updated.assignedSubjects || [],
      assignedCourseIds: updated.assignedCourseIds || [],
    };
  }

  async getTeacherRequests(teacherId: string) {
    const teacher = await this.usersService.findById(teacherId);
    if (!teacher || teacher.role !== 'teacher') {
      throw new NotFoundException('Teacher not found.');
    }
    const teacherDepartment = await this.getUserDepartment(teacher);
    const enrollments = await this.enrollmentRepo.find({
      where: { teacher: { id: teacherId } },
      relations: ['student', 'teacher'],
      order: { requestedAt: 'DESC' },
    });
    const visibleEnrollments = [];
    for (const enrollment of enrollments) {
      if (!teacherDepartment?.active) continue;
      const studentDepartment = await this.getUserDepartment(enrollment.student);
      if (!studentDepartment?.active || studentDepartment.id !== teacherDepartment.id) continue;
      const course = await this.courseRepo.createQueryBuilder('course')
        .where('course.departmentId = :departmentId', { departmentId: teacherDepartment.id })
        .andWhere('course.active = :active', { active: true })
        .andWhere('LOWER(course.title) = :subject', { subject: enrollment.subject.trim().toLowerCase() })
        .getOne();
      if (course && this.teacherHasCourse(teacher, course)) visibleEnrollments.push(enrollment);
    }
    return visibleEnrollments.map((enrollment) => ({
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

  async updateRegistrationStatus(
    id: string,
    status: 'APPROVED' | 'REJECTED',
    teacherId?: string,
    reason?: string,
  ) {
    if (!teacherId) {
      throw new UnauthorizedException('An authenticated teacher is required to review enrollment requests.');
    }
    if (status === 'REJECTED' && !reason?.trim()) {
      throw new BadRequestException('A rejection reason is required.');
    }

    return this.dataSource.transaction(async (manager) => {
      const lockedEnrollment = await manager.findOne(StudentEnrollment, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!lockedEnrollment) {
        throw new NotFoundException('Subject enrollment request not found.');
      }

      const enrollment = await manager.findOne(StudentEnrollment, {
        where: { id, teacher: { id: teacherId } },
        relations: ['teacher', 'student'],
      });
      if (!enrollment) {
        throw new NotFoundException('Subject enrollment request not found.');
      }
      if (enrollment.status !== 'PENDING') {
        throw new ConflictException('This subject enrollment request has already been reviewed.');
      }
      const teacher = enrollment.teacher;
      const normalizedSubject = enrollment.subject.trim().toLowerCase();
      const studentDepartment = await this.getUserDepartment(enrollment.student);
      const teacherDepartment = await this.getUserDepartment(teacher);
      const departmentSubject = studentDepartment && studentDepartment.id === teacherDepartment?.id
        ? await manager
            .createQueryBuilder(Course, 'course')
            .where('course.departmentId = :departmentId', { departmentId: studentDepartment.id })
            .andWhere('course.active = :active', { active: true })
            .andWhere('LOWER(course.title) = :subject', { subject: normalizedSubject })
            .getOne()
        : null;
      const teacherOffersSubject = departmentSubject &&
        ((teacher.assignedCourseIds || []).length
          ? teacher.assignedCourseIds.includes(departmentSubject.id)
          : (teacher.assignedSubjects || []).some((assigned) => assigned.trim().toLowerCase() === normalizedSubject));
      if (
        teacher.status !== 'APPROVED' ||
        enrollment.student.status !== 'APPROVED' ||
        !studentDepartment?.active ||
        !teacherDepartment?.active ||
        !teacherOffersSubject
      ) {
        throw new UnauthorizedException('You are no longer approved to teach this subject.');
      }

      enrollment.status = status;
      enrollment.rejectionReason = status === 'REJECTED' ? reason?.trim() || null : null;
      enrollment.reviewedAt = new Date();

      const updated = await manager.save(StudentEnrollment, enrollment);

      return {
        message:
          status === 'APPROVED'
            ? 'Student enrolled in the subject.'
            : 'Subject enrollment request rejected.',
        user: {
          id: updated.student.id,
          status: updated.status,
          subject: updated.subject,
          teacherId,
        },
      };
    });
  }

  async getStudentApplications() {
    return (await this.usersService.findStudentApplications()).map((student) => ({
      id: student.id,
      fullName: student.fullName,
      email: student.email,
      university: student.university || 'COMSATS University Islamabad, Wah Campus',
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
    return this.dataSource.transaction(async (manager) => {
      const student = await manager.findOne(User, {
        where: { id, role: 'student' },
        lock: { mode: 'pessimistic_write' },
      });

      if (!student) {
        throw new NotFoundException('Student application not found.');
      }
      const isLegacyRollNumberAssignment =
        student.status === 'APPROVED' &&
        status === 'APPROVED' &&
        !student.rollNumber;
      if (student.status !== 'PENDING' && !isLegacyRollNumberAssignment) {
        throw new ConflictException(
          'This student application has already been reviewed by an administrator.',
        );
      }

      let normalizedRollNumber: string | null = null;
      if (status === 'APPROVED') {
        normalizedRollNumber =
          rollNumber?.trim().toUpperCase() ||
          student.rollNumber?.trim().toUpperCase() ||
          null;
        if (!normalizedRollNumber) {
          throw new BadRequestException(
            'Assign a roll number before approving this student.',
          );
        }
        const existingStudent = await manager
          .createQueryBuilder(User, 'user')
          .where('LOWER(TRIM(user.rollNumber)) = :rollNumber', {
            rollNumber: normalizedRollNumber.toLowerCase(),
          })
          .getOne();
        if (existingStudent && existingStudent.id !== id) {
          throw new ConflictException(
            'This roll number is already assigned to another account.',
          );
        }
      } else if (!reason?.trim()) {
        throw new BadRequestException('A rejection reason is required.');
      }

      student.status = status;
      student.rollNumber = normalizedRollNumber;
      student.rejectionReason =
        status === 'REJECTED' ? reason!.trim() : student.rejectionReason;
      student.approvedAt =
        status === 'APPROVED' ? student.approvedAt || new Date() : null;

      const updated = await manager.save(User, student);

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
    });
  }
}
