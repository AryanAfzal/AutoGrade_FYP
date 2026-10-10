import { IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateRegistrationStatusDto {
  @IsIn(['APPROVED', 'REJECTED'])
  status: 'APPROVED' | 'REJECTED';

  @IsOptional()
  @IsString()
  reason?: string;
}
