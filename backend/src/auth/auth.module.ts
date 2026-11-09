import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { UsersModule } from '../users/users.module';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { RolesGuard } from './guards/roles.guard';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StudentEnrollment } from '../users/entities/student-enrollment.entity';
import { Exam } from '../exams/entities/exam.entity';
import { Course } from '../institutions/entities/course.entity';
import { Department } from '../institutions/entities/department.entity';

@Module({
  imports: [
    UsersModule,
    TypeOrmModule.forFeature([StudentEnrollment, Exam, Course, Department]),
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') || 'development-secret',
        signOptions: { expiresIn: (configService.get<string>('JWT_EXPIRES_IN') || '7d') as any },
      }),
    }),
  ],
  providers: [AuthService, JwtStrategy, RolesGuard],
  controllers: [AuthController],
})
export class AuthModule {}