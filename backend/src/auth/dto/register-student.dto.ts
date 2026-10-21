import { IsEmail, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class RegisterStudentDto {
  @IsString({ message: 'University name is required.' })
  @MinLength(2, { message: 'University name must be at least 2 characters long.' })
  university: string;

  @IsString({ message: 'Full name is required.' })
  @MinLength(2, { message: 'Full name must be at least 2 characters long.' })
  fullName: string;

  @IsEmail({}, { message: 'Please enter a valid email address.' })
  email: string;

  @IsString({ message: 'Registration number is required.' })
  @MinLength(2, { message: 'Registration number must be at least 2 characters long.' })
  registrationNumber: string;

  @IsOptional()
  @IsString()
  rollNumber?: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long.' })
  @Matches(/[A-Z]/, { message: 'Password must contain at least one uppercase letter.' })
  @Matches(/[^A-Za-z0-9]/, { message: 'Password must contain at least one special character.' })
  password: string;
}
