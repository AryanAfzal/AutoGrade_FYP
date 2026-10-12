import { ArrayNotEmpty, IsArray, IsString, MinLength } from 'class-validator';

export class AssignTeacherSubjectsDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @MinLength(2, { each: true })
  subjects: string[];
}
