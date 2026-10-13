import {
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class RubricConceptDto {
  @IsString()
  name: string;

  @IsString()
  description: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  keywords: string[];

  @IsNumber()
  @Min(0.01)
  maxMarks: number;

  @IsIn(['lenient', 'balanced', 'strict'])
  strictness: 'lenient' | 'balanced' | 'strict';
}
