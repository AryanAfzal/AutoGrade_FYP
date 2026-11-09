import { IsString, IsUUID, MinLength } from 'class-validator';

export class CreateRecheckRequestDto {
  @IsUUID()
  answerEntryId: string;

  @IsString()
  @MinLength(50, { message: 'Justification must be at least 50 characters.' })
  justification: string;
}
