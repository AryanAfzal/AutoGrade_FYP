import { IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateTeacherApplicationDto {
  @IsIn(['APPROVED', 'REJECTED'])
  status: 'APPROVED' | 'REJECTED';

  @IsOptional()
  @IsString()
  reason?: string;
}

