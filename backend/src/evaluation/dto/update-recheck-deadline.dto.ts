import { IsDateString } from 'class-validator';

export class UpdateRecheckDeadlineDto {
  @IsDateString()
  recheckDeadline: string;
}
