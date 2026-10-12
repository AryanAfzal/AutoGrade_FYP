import { IsEmail, IsString, MinLength } from 'class-validator';

export class RegisterTeacherDto {
  @IsString()
  @MinLength(2)
  fullName: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  @MinLength(7)
  phone: string;

  @IsString()
  @MinLength(2)
  department: string;

  @IsString()
  @MinLength(2)
  qualification: string;
}

