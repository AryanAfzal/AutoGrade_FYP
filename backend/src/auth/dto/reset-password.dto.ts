import { IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'Reset token is required.' })
  token: string;

  @IsString()
  @MinLength(8, { message: 'New password must be at least 8 characters long.' })
  @Matches(/[A-Z]/, { message: 'New password must contain at least one uppercase letter.' })
  @Matches(/[^A-Za-z0-9]/, { message: 'New password must contain at least one special character.' })
  newPassword: string;

  @IsString()
  @IsNotEmpty({ message: 'Please confirm your new password.' })
  confirmPassword: string;
}
