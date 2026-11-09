import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class DecideRecheckRequestDto {
  @IsIn(['uphold', 'revise'])
  decision: 'uphold' | 'revise';

  @IsString()
  comment: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  mark?: number;
}
