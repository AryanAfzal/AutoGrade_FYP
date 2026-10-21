import { IsBoolean, IsEmail, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'Please enter a valid email address.' })
  email: string;

  @IsString()
  @IsNotEmpty({ message: 'Password is required.' })
  password: string;

  @IsOptional()
  @IsString()
  @IsIn(['teacher', 'admin', 'student'])
  role?: 'teacher' | 'admin' | 'student';

  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;
}
