import { IsMongoId, IsEnum, IsBoolean } from 'class-validator';
import { MeetingPhase } from '../schemas/meeting.schema';

export class WsAdvancePhaseDto {
  @IsMongoId()
  meetingId: string;

  @IsEnum(MeetingPhase)
  toPhase: MeetingPhase;
}

export class WsApproveTaskDto {
  @IsMongoId()
  meetingId: string;

  @IsMongoId()
  taskId: string;

  @IsBoolean()
  approved: boolean;
}

export class WsFinishMeetingDto {
  @IsMongoId()
  meetingId: string;
}
