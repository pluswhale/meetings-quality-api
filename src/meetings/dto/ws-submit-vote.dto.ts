import {
  IsString,
  IsMongoId,
  IsEnum,
  IsArray,
  ValidateNested,
  IsNumber,
  IsBoolean,
  IsOptional,
  IsISO8601,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MeetingPhase } from '../schemas/meeting.schema';

// ─── Phase 1 — Emotional Evaluation ──────────────────────────────────────────

export class WsEmotionalEvalItemDto {
  @IsMongoId()
  targetParticipantId: string;

  @IsNumber()
  @Min(-100)
  @Max(100)
  emotionalScale: number;

  @IsBoolean()
  isToxic: boolean;
}

// ─── Phase 2 — Understanding & Contribution ───────────────────────────────────

export class WsContributionItemDto {
  @IsMongoId()
  participantId: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  contributionPercentage: number;
}

// ─── Discriminated union payload ──────────────────────────────────────────────

export class WsSubmitEmotionalVoteDto {
  @IsMongoId()
  meetingId: string;

  @IsEnum(MeetingPhase)
  phase: typeof MeetingPhase.EMOTIONAL_EVALUATION;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WsEmotionalEvalItemDto)
  evaluations: WsEmotionalEvalItemDto[];
}

export class WsSubmitUnderstandingVoteDto {
  @IsMongoId()
  meetingId: string;

  @IsEnum(MeetingPhase)
  phase: typeof MeetingPhase.UNDERSTANDING_CONTRIBUTION;

  @IsNumber()
  @Min(0)
  @Max(100)
  understandingScore: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WsContributionItemDto)
  contributions: WsContributionItemDto[];
}

export class WsSubmitTaskPlanningDto {
  @IsMongoId()
  meetingId: string;

  @IsEnum(MeetingPhase)
  phase: typeof MeetingPhase.TASK_PLANNING;

  @IsString()
  taskDescription: string;

  @IsString()
  commonQuestion: string;

  @IsISO8601()
  deadline: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  expectedContributionPercentage: number;

  @IsNumber()
  @Min(0)
  estimateHours: number;
}

export class WsTaskEvalItemDto {
  @IsMongoId()
  taskAuthorId: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  importanceScore: number;
}

export class WsSubmitTaskEvaluationDto {
  @IsMongoId()
  meetingId: string;

  @IsEnum(MeetingPhase)
  phase: typeof MeetingPhase.FINISHED;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WsTaskEvalItemDto)
  evaluations: WsTaskEvalItemDto[];
}

// Slider draft — lightweight, no deep validation needed
export class WsUpdateSliderDto {
  @IsMongoId()
  meetingId: string;

  @IsEnum(MeetingPhase)
  phase: MeetingPhase;

  // Arbitrary key-value pairs for draft data — validated loosely
  [key: string]: unknown;
}
