import { IsString, IsNumber, IsOptional, IsArray } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateQuestionDto {
  @IsString()
  type: 'mcq' | 'descriptive';

  @IsString()
  questionText: string;

  @Type(() => Number)
  @IsNumber()
  maxMarks: number;

  @IsString()
  clo: string;

  @IsOptional()
  @IsString()
  correctAnswer?: string;

  @IsOptional()
  @IsString()
  referenceAnswer?: string;

  @IsOptional()
  @IsArray()
  keywords?: string[];

  @IsOptional()
  options?: { label: string; text: string }[];
}