import { IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class DepartmentDto {
  @IsString() name: string;
  @IsString() code: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() head?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class CourseDto {
  @IsString() title: string;
  @IsString() code: string;
  @IsOptional() @IsString() departmentId?: string;
  @IsOptional() @IsString() departmentName?: string;
  @IsOptional() @IsInt() @Min(1) @Max(12) creditHours?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class AcademicTermDto {
  @IsString() name: string;
  @IsDateString() startDate: string;
  @IsDateString() endDate: string;
  @IsOptional() @IsBoolean() current?: boolean;
  @IsOptional() @IsIn(['UPCOMING', 'ACTIVE', 'CLOSED']) status?: 'UPCOMING' | 'ACTIVE' | 'CLOSED';
}

export class AssignDepartmentDto {
  @IsOptional() @IsString() departmentId?: string | null;
}

export class AssignStudentSubjectDto {
  @IsString() teacherId: string;
  @IsString() courseId: string;
}
