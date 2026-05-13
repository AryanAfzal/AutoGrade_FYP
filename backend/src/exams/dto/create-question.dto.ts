import { IsString, IsNumber, IsOptional, IsArray } from 'class-validator';

export class CreateQuestionDto {
  @IsString()
  type: 'mcq' | 'descriptive';

  @IsString()
  questionText: string;

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