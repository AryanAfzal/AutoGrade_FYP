import { IsString, MinLength } from 'class-validator';

export class CreateStudentEnrollmentDto {
  @IsString()
  @MinLength(1)
  teacherId: string;

  @IsString()
  @MinLength(2)
  subject: string;
}
