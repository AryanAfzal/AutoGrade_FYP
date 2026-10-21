import { IsEmail, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class RegisterTeacherDto {
  @IsString({ message: 'Full name is required.' })
  @MinLength(2, { message: 'Full name must be at least 2 characters long.' })
  fullName: string;

  @IsEmail({}, { message: 'Please enter a valid email address.' })
  email: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long.' })
  @Matches(/[A-Z]/, { message: 'Password must contain at least one uppercase letter.' })
  @Matches(/[^A-Za-z0-9]/, { message: 'Password must contain at least one special character.' })
  password: string;

  @IsOptional()
  @IsString()
  university?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsString()
  qualification?: string;
}
