import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class DecideSimilarityDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(['confirm_cheating', 'dismiss'])
  action: 'confirm_cheating' | 'dismiss';

  @IsOptional()
  @IsString()
  @IsIn(['both', 'student_a', 'student_b'])
  penaltyTarget?: 'both' | 'student_a' | 'student_b';

  @IsOptional()
  @IsString()
  studentAResultId?: string;

  @IsOptional()
  @IsString()
  studentBResultId?: string;

  @IsOptional()
  @IsString()
  studentARegNo?: string;

  @IsOptional()
  @IsString()
  studentBRegNo?: string;

  @IsOptional()
  @IsString()
  teacherNotes?: string;

  @IsOptional()
  reportData?: any;
}
