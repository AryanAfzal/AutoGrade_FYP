import { IsBoolean, IsEmail, IsIn, IsOptional, IsString } from 'class-validator';

export class GoogleAuthDto {
  @IsOptional()
  @IsString()
  idToken?: string;

  @IsOptional()
  @IsEmail({}, { message: 'A valid Google email is required.' })
  email?: string;

  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsString()
  profilePicture?: string;

  @IsString()
  @IsIn(['teacher', 'student', 'admin'], { message: 'Role must be teacher, student, or admin.' })
  role: 'teacher' | 'student' | 'admin';

  @IsOptional()
  @IsString()
  university?: string;

  @IsOptional()
  @IsString()
  registrationNumber?: string;

  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;
}
