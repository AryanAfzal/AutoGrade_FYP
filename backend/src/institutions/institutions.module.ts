import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '../users/users.module';
import { StudentEnrollment } from '../users/entities/student-enrollment.entity';
import { Department } from './entities/department.entity';
import { Course } from './entities/course.entity';
import { AcademicTerm } from './entities/academic-term.entity';
import { InstitutionsService } from './institutions.service';
import { InstitutionsController } from './institutions.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Department, Course, AcademicTerm, StudentEnrollment]), UsersModule],
  providers: [InstitutionsService],
  controllers: [InstitutionsController],
})
export class InstitutionsModule {}
