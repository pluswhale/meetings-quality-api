import { IsEnum, IsNotEmpty } from 'class-validator';
import { MeetingPhase } from '../schemas/meeting.schema';

export class ChangePhaseDto {
  @IsNotEmpty()
  @IsEnum(MeetingPhase)
  phase: MeetingPhase;
}
