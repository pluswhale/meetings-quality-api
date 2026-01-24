import { IsEnum, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { MeetingPhase } from '../schemas/meeting.schema';

export class ChangePhaseDto {
  @ApiProperty({
    description: 'Новая фаза встречи',
    enum: MeetingPhase,
    example: MeetingPhase.EMOTIONAL_EVALUATION,
  })
  @IsNotEmpty()
  @IsEnum(MeetingPhase)
  phase: MeetingPhase;
}
