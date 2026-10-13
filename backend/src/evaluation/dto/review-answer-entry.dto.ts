import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
} from 'class-validator';

export class ReviewAnswerEntryDto {
  @IsIn(['approve', 'override'])
  action: 'approve' | 'override';

  @ValidateIf((request: ReviewAnswerEntryDto) => request.action === 'override')
  @IsNumber()
  @Min(0)
  mark?: number;

  @ValidateIf((request: ReviewAnswerEntryDto) => request.action === 'override')
  @IsString()
  comment?: string;

  @IsOptional()
  @IsString()
  approvalComment?: string;
}
