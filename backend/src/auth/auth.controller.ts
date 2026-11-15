import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Res,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
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
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Roles } from './decorators/roles.decorator';
import { RolesGuard } from './guards/roles.guard';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.login(
      dto.email,
      dto.password,
      dto.role,
      dto.rememberMe,
    );
    this.setRefreshCookie(response, result);
    const { refreshToken: _refreshToken, ...authResponse } = result;
    return authResponse;
  }

  @Post('refresh')
  async refresh(
    @Headers('cookie') cookieHeader: string | undefined,
    @Headers('origin') origin: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const frontendOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000')
      .split(',')
      .map((value) => value.trim().replace(/\/$/, ''));
    if (!origin || !frontendOrigins.includes(origin.replace(/\/$/, ''))) {
      throw new ForbiddenException('Refresh request origin is not allowed.');
    }

    const refreshToken = this.readRefreshCookie(cookieHeader);
    const result = await this.authService.rotateRefreshToken(refreshToken || '');
    this.setRefreshCookie(response, result);
    const { refreshToken: _refreshToken, ...authResponse } = result;
    return authResponse;
  }

  @Post('logout')
  async logout(
    @Headers('cookie') cookieHeader: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.authService.revokeRefreshToken(this.readRefreshCookie(cookieHeader));
    response.clearCookie('autograde_refresh', this.refreshCookieOptions());
    return { message: 'Logged out successfully.' };
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

  private readRefreshCookie(cookieHeader?: string) {
    const cookie = cookieHeader
      ?.split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('autograde_refresh='));
    return cookie ? cookie.slice('autograde_refresh='.length) : undefined;
  }

  private refreshCookieOptions() {
    return {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      path: '/auth',
    };
  }

  private setRefreshCookie(
    response: Response,
    result: { refreshToken: string; rememberMe: boolean; refreshExpiresAt: string },
  ) {
    response.cookie('autograde_refresh', result.refreshToken, {
      ...this.refreshCookieOptions(),
      ...(result.rememberMe
        ? { maxAge: Math.max(0, Date.parse(result.refreshExpiresAt) - Date.now()) }
        : {}),
    });
  }
}
