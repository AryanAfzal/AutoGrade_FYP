import {
  IsString,
  IsNumber,
  IsInt,
  IsOptional,
  IsArray,
  IsDefined,
  IsIn,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { QuestionRubricDto } from './question-rubric.dto';

export class CreateQuestionDto {
  @IsString()
  @IsIn(['mcq', 'descriptive'])
  type: 'mcq' | 'descriptive';

  @IsString()
  questionText: string;

  @Type(() => Number)
  @IsInt()
  @Min(0.01)
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

  @ValidateIf((question: CreateQuestionDto) => question.type === 'descriptive')
  @IsDefined()
  @ValidateNested()
  @Type(() => QuestionRubricDto)
  rubric: QuestionRubricDto;
}