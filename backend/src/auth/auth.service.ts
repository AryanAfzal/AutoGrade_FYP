import { Injectable, BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { User } from '../users/entities/user.entity';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
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
          : 'Your student registration is still pending teacher approval.',
      );
    }
    if (user.status === 'REJECTED') {
      throw new UnauthorizedException(
        user.role === 'teacher'
          ? `Your teacher application was rejected. ${user.rejectionReason || 'Contact the administrator.'}`
          : `Your student registration was rejected. ${user.rejectionReason || 'Contact the teacher.'}`,
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
    course: string;
    teacherId: string;
  }) {
    const normalizedEmail = this.normalizeEmail(data.email);
    const existingUser = await this.usersService.findByEmail(normalizedEmail);
    if (existingUser) {
      throw new UnauthorizedException('An account or pending request already exists for this email.');
    }

    const teacher = await this.usersService.findById(data.teacherId);
    if (
      !teacher ||
      teacher.role !== 'teacher' ||
      teacher.status !== 'APPROVED' ||
      !(teacher.assignedSubjects || []).includes(data.course)
    ) {
      throw new BadRequestException('The selected teacher is not assigned to this subject.');
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);

    const createdUser = await this.usersService.create({
      fullName: data.fullName,
      email: normalizedEmail,
      password: hashedPassword,
      role: 'student',
      status: 'PENDING',
      course: data.course,
      teacherId: data.teacherId,
      requestedAt: new Date(),
    });

    return {
      message: 'Student registration submitted successfully. Your request is pending teacher approval.',
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

  async getRegistrationOptions() {
    const teacherUsers = (await this.usersService.findByRole('teacher')).filter(
      (teacher) => teacher.status === 'APPROVED' && (teacher.assignedSubjects || []).length > 0,
    );

    return {
      teachers: teacherUsers.map((teacher) => ({
        id: teacher.id,
        fullName: teacher.fullName,
        email: teacher.email,
        subjects: teacher.assignedSubjects || [],
      })),
      courses: [...new Set(teacherUsers.flatMap((teacher) => teacher.assignedSubjects || []))],
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

    const normalizedSubjects = [...new Set(subjects.map((subject) => subject.trim()).filter(Boolean))];
    if (normalizedSubjects.length === 0) {
      throw new BadRequestException('Assign at least one subject.');
    }

    const updated = await this.usersService.update(id, { assignedSubjects: normalizedSubjects });
    return {
      id: updated.id,
      fullName: updated.fullName,
      assignedSubjects: updated.assignedSubjects || [],
    };
  }

  async getTeacherRequests(teacherId?: string, adminView = false) {
    const users = await this.usersService.findStudentRegistrationRequests(teacherId);

    if (adminView) {
      return users
        .map((user) => ({
          id: user.id,
          fullName: user.fullName,
          email: user.email,
          course: user.course,
          status: user.status,
          teacherId: user.teacherId,
          requestedAt: user.requestedAt,
          approvedAt: user.approvedAt,
          rejectionReason: user.rejectionReason,
        }));
    }

    return users
      .filter((user) => user.teacherId === teacherId)
      .map((user) => ({
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        course: user.course,
        status: user.status,
        teacherId: user.teacherId,
        requestedAt: user.requestedAt,
        approvedAt: user.approvedAt,
        rejectionReason: user.rejectionReason,
      }));
  }

  async updateRegistrationStatus(id: string, status: 'APPROVED' | 'REJECTED', teacherId?: string, reason?: string) {
    const targetUser = await this.usersService.findById(id);
    if (!targetUser || targetUser.role !== 'student') {
      throw new UnauthorizedException('Student registration not found.');
    }

    if (teacherId && targetUser.teacherId !== teacherId) {
      throw new UnauthorizedException('You are not assigned to this student registration.');
    }
    if (teacherId) {
      const teacher = await this.usersService.findById(teacherId);
      if (!teacher || teacher.role !== 'teacher' || teacher.status !== 'APPROVED') {
        throw new UnauthorizedException('Only an approved teacher can review student registrations.');
      }
      if (!(teacher.assignedSubjects || []).includes(targetUser.course || '')) {
        throw new UnauthorizedException('You are no longer assigned to this student subject.');
      }
    }

    const updated = await this.usersService.update(id, {
      status,
      rejectionReason: status === 'REJECTED' ? reason || 'Registration rejected by teacher.' : null,
      approvedAt: status === 'APPROVED' ? new Date() : null,
      approvedByTeacherId: teacherId || targetUser.approvedByTeacherId,
    });

    return {
      message: status === 'APPROVED' ? 'Student registration approved.' : 'Student registration rejected.',
      user: {
        id: updated.id,
        status: updated.status,
        course: updated.course,
        teacherId: updated.teacherId,
      },
    };
  }
}