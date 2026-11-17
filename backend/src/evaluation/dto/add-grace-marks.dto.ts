import { IsArray, IsNumber, IsOptional, Min } from 'class-validator';

export class AddGraceMarksDto {
  @IsNumber()
  @Min(0.1)
  marks: number;

  @IsOptional()
  @IsArray()
  resultIds?: string[];
}
