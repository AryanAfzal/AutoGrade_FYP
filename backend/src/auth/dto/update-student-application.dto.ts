import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateStudentApplicationDto {
  @IsIn(['APPROVED', 'REJECTED'])
  status: 'APPROVED' | 'REJECTED';

  @IsOptional()
  @IsString()
  @MinLength(3)
  rollNumber?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
