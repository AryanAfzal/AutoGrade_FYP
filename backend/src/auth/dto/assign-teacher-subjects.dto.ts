import { IsArray, IsString, MinLength } from 'class-validator';

export class AssignTeacherSubjectsDto {
  @IsArray()
  @IsString({ each: true })
  @MinLength(2, { each: true })
  subjects: string[];
}
