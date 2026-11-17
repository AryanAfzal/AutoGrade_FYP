import { IsString, IsUUID, MinLength } from 'class-validator';

export class CreateRecheckRequestDto {
  @IsUUID()
  answerEntryId: string;

  @IsString()
  @MinLength(10, { message: 'Justification must be at least 10 characters.' })
  justification: string;
}
