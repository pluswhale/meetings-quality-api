import { IsMongoId, IsEnum, IsBoolean, IsString, IsOptional } from 'class-validator';
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

  /**
   * During live planning this is the client-minted taskKey (or, for the
   * legacy one-task-per-user flow, the author's userId). After flush it may
   * be a Task document id.
   */
  @IsString()
  taskId: string;

  @IsOptional()
  @IsString()
  authorUserId?: string;

  @IsBoolean()
  approved: boolean;
}

export class WsFinishMeetingDto {
  @IsMongoId()
  meetingId: string;
}

export class WsUpdateConclusionsDto {
  @IsMongoId()
  meetingId: string;

  @IsString()
  conclusions: string;
}
