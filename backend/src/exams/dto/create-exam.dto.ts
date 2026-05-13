import { IsString, IsNumber, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateQuestionDto } from './create-question.dto';

export class CreateExamDto {
  @IsString()
  title: string;

  @IsString()
  course: string;

  @IsString()
  term: string;

  @IsNumber()
  totalMarks: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateQuestionDto)
  questions: CreateQuestionDto[];
}