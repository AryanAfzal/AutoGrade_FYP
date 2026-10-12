import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterStudentDto {
  @IsString()
  @MinLength(2)
  fullName: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsOptional()
  @IsString()
  confirmPassword?: string;

  @IsString()
  @MinLength(2)
  course: string;

  @IsString()
  @MinLength(1)
  teacherId: string;
}
