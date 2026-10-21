import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterStudentDto } from './dto/register-student.dto';
import { RegisterTeacherDto } from './dto/register-teacher.dto';
import { UpdateTeacherApplicationDto } from './dto/update-teacher-application.dto';
import { AssignTeacherSubjectsDto } from './dto/assign-teacher-subjects.dto';
import { UpdateRegistrationStatusDto } from './dto/update-registration-status.dto';
import { UpdateStudentApplicationDto } from './dto/update-student-application.dto';
import { CreateStudentEnrollmentDto } from './dto/create-student-enrollment.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { GoogleAuthDto } from './dto/google-auth.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Roles } from './decorators/roles.decorator';
import { RolesGuard } from './guards/roles.guard';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(
      dto.email,
      dto.password,
      dto.role,
      dto.rememberMe,
    );
  }

  @Post('google-admin-login')
  googleAdminLogin(@Body() body: { email: string; emailVerified: boolean }) {
    return this.authService.googleAdminLogin(body.email, body.emailVerified);
  }

  @Post('google-auth')
  googleAuth(@Body() dto: GoogleAuthDto) {
    return this.authService.googleAuth(dto);
  }

  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getCurrentUser(@Request() req) {
    return this.authService.getCurrentUser(req.user.id);
  }

  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  updateProfile(@Request() req, @Body() dto: UpdateProfileDto) {
    return this.authService.updateProfile(req.user.id, dto);
  }

  @Post('profile/picture')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 2 * 1024 * 1024 },
    }),
  )
  async uploadProfilePicture(
    @Request() req,
    @UploadedFile() file?: Express.Multer.File,
    @Body() body?: { profilePicture?: string },
  ) {
    if (file) {
      if (!file.mimetype.startsWith('image/')) {
        throw new BadRequestException('Only image files are allowed for profile pictures.');
      }
      const dataUrl = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
      return this.authService.updateProfile(req.user.id, { profilePicture: dataUrl });
    }
    if (body?.profilePicture !== undefined) {
      return this.authService.updateProfile(req.user.id, {
        profilePicture: body.profilePicture,
      });
    }
    throw new BadRequestException('Please provide an image file or profilePicture data.');
  }

  @Patch('change-password')
  @UseGuards(JwtAuthGuard)
  changePassword(@Request() req, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(req.user.id, dto);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  logout() {
    return { message: 'Logged out successfully.' };
  }

  @Post('register/student')
  registerStudent(@Body() dto: RegisterStudentDto) {
    return this.authService.registerStudent({
      university: dto.university,
      fullName: dto.fullName,
      email: dto.email,
      registrationNumber: dto.registrationNumber || dto.rollNumber,
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
