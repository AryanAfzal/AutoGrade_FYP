import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { RubricConceptDto } from './rubric-concept.dto';

export class RubricScoringWeightsDto {
  @IsNumber()
  @Min(0)
  @Max(1)
  semantic: number;

  @IsNumber()
  @Min(0)
  @Max(1)
  keywords: number;

  @IsNumber()
  @Min(0)
  @Max(1)
  concepts: number;
}

export class QuestionRubricDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RubricConceptDto)
  concepts: RubricConceptDto[];

  @ValidateNested()
  @Type(() => RubricScoringWeightsDto)
  scoringWeights: RubricScoringWeightsDto;
}
