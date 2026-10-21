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
import axios from 'axios';
import { DataSource, Repository } from 'typeorm';
import { UsersService } from '../users/users.service';
import { User } from '../users/entities/user.entity';
import { StudentEnrollment } from '../users/entities/student-enrollment.entity';
import { Exam } from '../exams/entities/exam.entity';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { GoogleAuthDto } from './dto/google-auth.dto';

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
  ) {}

  async onModuleInit() {
    await this.seedPredefinedAdmins();
  }

  private normalizeEmail(email: string) {
    return email.trim().toLowerCase();
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
      qualification: user.qualification,
      assignedSubjects: user.assignedSubjects || [],
    };
  }

  private async buildToken(user: User, rememberMe = false) {
    const expiresIn = rememberMe ? '30d' : '1d';
    const token = this.jwtService.sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
      },
      { expiresIn: expiresIn as any },
    );

    return {
      token,
      rememberMe,
      expiresIn,
      user: this.serializeUser(user),
    };
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

  async googleAdminLogin(email: string, emailVerified: boolean) {
    const normalizedEmail = this.normalizeEmail(email);

    if (!emailVerified || !this.isAuthorizedAdmin(normalizedEmail)) {
      throw new UnauthorizedException('Unauthorized admin account.');
    }

    let user = await this.usersService.findByEmail(normalizedEmail);
    if (!user) {
      const hashedPassword = await bcrypt.hash('google-admin-login-Admin@123', 10);
      user = await this.usersService.create({
        fullName: 'Administrator',
        email: normalizedEmail,
        password: hashedPassword,
        role: 'admin',
        status: 'APPROVED',
        university: 'COMSATS University Islamabad, Wah Campus',
        isProfileComplete: true,
        authProvider: 'google',
      });
    }

    return this.buildToken(user, true);
  }

  async googleAuth(dto: GoogleAuthDto) {
    let email = dto.email ? this.normalizeEmail(dto.email) : '';
    let fullName = dto.fullName?.trim() || '';
    let picture = dto.profilePicture || null;

    if (dto.idToken) {
      try {
        const res = await axios.get(
          `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(dto.idToken)}`,
          { timeout: 5000 },
        );
        if (res.data?.email) {
          email = this.normalizeEmail(res.data.email);
          fullName = res.data.name || fullName || email.split('@')[0];
          picture = res.data.picture || picture;
        }
      } catch {
        // Fallback if token is a decoded/mock credential in dev mode
        if (!email) {
          throw new UnauthorizedException('Invalid Google authentication token.');
        }
      }
    }

    if (!email) {
      throw new BadRequestException('Google account email is required.');
    }

    if (dto.role === 'admin') {
      if (!this.isAuthorizedAdmin(email)) {
        throw new UnauthorizedException(
          'This Google account is not authorized as a predefined administrator.',
        );
      }
      return this.googleAdminLogin(email, true);
    }

    if (this.isAuthorizedAdmin(email)) {
      throw new BadRequestException(
        'This email is reserved for a predefined administrator account and cannot be used for teacher or student login.',
      );
    }

    let user = await this.usersService.findByEmail(email);

    if (!user) {
      // Sign-up via Google
      const normalizedRoll = dto.registrationNumber?.trim().toUpperCase() || null;
      if (dto.role === 'student' && normalizedRoll) {
        const existingRoll = await this.usersService.findByRollNumber(normalizedRoll);
        if (existingRoll) {
          throw new ConflictException(
            'A student account with this registration number already exists.',
          );
        }
      }

      const randomPassword = await bcrypt.hash(
        `Google_${crypto.randomBytes(16).toString('hex')}!A1`,
        10,
      );

      user = await this.usersService.create({
        fullName: fullName || email.split('@')[0],
        email,
        password: randomPassword,
        role: dto.role,
        status: 'PENDING',
        university:
          dto.university?.trim() || 'COMSATS University Islamabad, Wah Campus',
        rollNumber: dto.role === 'student' ? normalizedRoll : null,
        profilePicture: picture,
        isProfileComplete: false,
        authProvider: 'google',
        assignedSubjects: dto.role === 'teacher' ? [] : null,
        requestedAt: new Date(),
      });

      return {
        pendingApproval: true,
        message:
          dto.role === 'teacher'
            ? 'Teacher account registered with Google! Your application is now pending administrator approval.'
            : 'Student account registered with Google! Your account is now pending administrator approval.',
        user: this.serializeUser(user),
      };
    }

    if (user.role !== dto.role) {
      throw new UnauthorizedException(
        `This email is already registered as a ${user.role}, not a ${dto.role}.`,
      );
    }

    if (picture && !user.profilePicture) {
      user = await this.usersService.update(user.id, { profilePicture: picture });
    }

    if (user.status === 'PENDING') {
      throw new UnauthorizedException(
        user.role === 'teacher'
          ? 'Your Google-linked teacher application is awaiting admin approval.'
          : 'Your Google-linked student registration is awaiting admin approval.',
      );
    }

    if (user.status === 'REJECTED') {
      throw new UnauthorizedException(
        `Your application was rejected. ${user.rejectionReason || 'Contact the administrator.'}`,
      );
    }

    return this.buildToken(user, Boolean(dto.rememberMe));
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
      university: teacher.university || 'COMSATS University Islamabad, Wah Campus',
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
      let teacherOffersSubject = (teacher.assignedSubjects || []).some(
        (s) => s.trim().toLowerCase() === normalizedSubject,
      );
      if (!teacherOffersSubject) {
        teacherOffersSubject = await manager
          .createQueryBuilder(Exam, 'exam')
          .innerJoin('exam.createdBy', 'teacher')
          .where('teacher.id = :teacherId', { teacherId })
          .andWhere('LOWER(TRIM(exam.course)) = :subject', {
            subject: normalizedSubject,
          })
          .getExists();
      }
      if (teacher.status !== 'APPROVED' || !teacherOffersSubject) {
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
