import { IsString, IsNumber, IsArray, ValidateNested, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateQuestionDto } from './create-question.dto';

export class CreateExamDto {
  @IsString()
  title: string;

  @IsString()
  course: string;

  @IsString()
  term: string;

  @Type(() => Number)
  @IsNumber()
  totalMarks: number;

  @IsDateString()
  recheckDeadline: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateQuestionDto)
  questions: CreateQuestionDto[];
}