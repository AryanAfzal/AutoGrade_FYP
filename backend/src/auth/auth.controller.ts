import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterStudentDto } from './dto/register-student.dto';
import { RegisterTeacherDto } from './dto/register-teacher.dto';
import { UpdateTeacherApplicationDto } from './dto/update-teacher-application.dto';
import { AssignTeacherSubjectsDto } from './dto/assign-teacher-subjects.dto';
import { UpdateRegistrationStatusDto } from './dto/update-registration-status.dto';
import { UpdateStudentApplicationDto } from './dto/update-student-application.dto';
import { CreateStudentEnrollmentDto } from './dto/create-student-enrollment.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Roles } from './decorators/roles.decorator';
import { RolesGuard } from './guards/roles.guard';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password, dto.role);
  }

  @Post('google-admin-login')
  googleAdminLogin(@Body() body: { email: string; emailVerified: boolean }) {
    return this.authService.googleAdminLogin(body.email, body.emailVerified);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getCurrentUser(@Request() req) {
    return this.authService.getCurrentUser(req.user.id);
  }

  @Post('register/student')
  registerStudent(@Body() dto: RegisterStudentDto) {
    return this.authService.registerStudent({
      fullName: dto.fullName,
      email: dto.email,
      password: dto.password,
    });
  }

  @Post('register/teacher')
  registerTeacher(@Body() dto: RegisterTeacherDto) {
    return this.authService.registerTeacher(dto);
  }

  @Get('teacher-applications')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  getTeacherApplications() {
    return this.authService.getTeacherApplications();
  }

  @Patch('teacher-applications/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  updateTeacherApplication(@Param('id') id: string, @Body() dto: UpdateTeacherApplicationDto) {
    return this.authService.updateTeacherApplication(id, dto.status, dto.reason);
  }

  @Patch('teachers/:id/subjects')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  assignTeacherSubjects(@Param('id') id: string, @Body() dto: AssignTeacherSubjectsDto) {
    return this.authService.assignTeacherSubjects(id, dto.subjects);
  }

  @Get('student-applications')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  getStudentApplications() {
    return this.authService.getStudentApplications();
  }

  @Patch('student-applications/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  updateStudentApplication(
    @Param('id') id: string,
    @Body() dto: UpdateStudentApplicationDto,
  ) {
    return this.authService.updateStudentApplication(
      id,
      dto.status,
      dto.rollNumber,
      dto.reason,
    );
  }

  @Get('enrollment-options')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('student')
  getEnrollmentOptions(@Request() req) {
    return this.authService.getEnrollmentOptions(req.user.id);
  }

  @Post('enrollments')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('student')
  createStudentEnrollment(@Body() dto: CreateStudentEnrollmentDto, @Request() req) {
    return this.authService.createStudentEnrollment(
      req.user.id,
      dto.teacherId,
      dto.subject,
    );
  }

  @Get('teacher-requests')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('teacher')
  getTeacherRequests(@Request() req) {
    return this.authService.getTeacherRequests(req.user.id);
  }

  @Patch('teacher-requests/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('teacher')
  updateRegistrationStatus(
    @Param('id') id: string,
    @Body() dto: UpdateRegistrationStatusDto,
    @Request() req,
  ) {
    return this.authService.updateRegistrationStatus(id, dto.status, req.user.id, dto.reason);
  }
}