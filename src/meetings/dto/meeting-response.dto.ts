import { ApiProperty } from '@nestjs/swagger';
import { MeetingPhase, MeetingStatus } from '../schemas/meeting.schema';

// ─── Shared primitive shapes ───────────────────────────────────────────────────
// These reflect the output of resolveUserRef() / resolveId() in meetings.service.ts.
// Declaring them explicitly here keeps Swagger accurate and gives callers a typed
// contract that survives future service refactors.

class MeetingParticipantRefDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  _id: string;

  @ApiProperty({ example: 'Jane Doe', nullable: true })
  fullName: string | null;

  @ApiProperty({ example: 'jane@example.com', nullable: true })
  email: string | null;
}

// ─── Emotional evaluations ─────────────────────────────────────────────────────

class EmotionalEvaluationItemDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439012' })
  targetParticipantId: string;

  @ApiProperty({ example: 85, minimum: -100, maximum: 100 })
  emotionalScale: number;

  @ApiProperty({ example: false })
  isToxic: boolean;
}

class EmotionalEvaluationDto {
  /**
   * Populated participant ref — transformMeetingResponse() uses resolveUserRef(),
   * so this field is an object, not a bare string ID.
   */
  @ApiProperty({ type: MeetingParticipantRefDto })
  participant: MeetingParticipantRefDto;

  @ApiProperty({ type: [EmotionalEvaluationItemDto] })
  evaluations: EmotionalEvaluationItemDto[];

  @ApiProperty({ example: '2026-01-24T10:30:00.000Z' })
  submittedAt: Date;
}

// ─── Understanding & Contribution ─────────────────────────────────────────────

class ContributionItemDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439012' })
  participantId: string;

  @ApiProperty({ example: 60, minimum: 0, maximum: 100 })
  contributionPercentage: number;
}

class UnderstandingContributionDto {
  /**
   * Populated participant ref — same population pattern as emotional evaluations.
   */
  @ApiProperty({ type: MeetingParticipantRefDto })
  participant: MeetingParticipantRefDto;

  @ApiProperty({ example: 90, minimum: 0, maximum: 100 })
  understandingScore: number;

  @ApiProperty({ type: [ContributionItemDto] })
  contributions: ContributionItemDto[];

  @ApiProperty({ example: '2026-01-24T11:00:00.000Z' })
  submittedAt: Date;
}

// ─── Task evaluations ──────────────────────────────────────────────────────────

class TaskImportanceEvaluationItemDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  taskAuthorId: string;

  @ApiProperty({ example: 75, minimum: 0, maximum: 100 })
  importanceScore: number;
}

class TaskEvaluationDto {
  /**
   * Populated participant ref — same population pattern as other phase DTOs.
   */
  @ApiProperty({ type: MeetingParticipantRefDto })
  participant: MeetingParticipantRefDto;

  @ApiProperty({ type: [TaskImportanceEvaluationItemDto] })
  evaluations: TaskImportanceEvaluationItemDto[];

  @ApiProperty({ example: '2026-01-24T12:00:00.000Z' })
  submittedAt: Date;
}

// ─── Meeting response ──────────────────────────────────────────────────────────

export class MeetingResponseDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439020' })
  _id: string;

  @ApiProperty({ example: 'Q3 Planning Session' })
  title: string;

  @ApiProperty({ example: 'What are the priorities this quarter?' })
  question: string;

  /**
   * creatorId is always populated via .populate('creatorId', 'fullName email'),
   * so the response contains a full user ref, not a bare ObjectId string.
   */
  @ApiProperty({ type: MeetingParticipantRefDto })
  creatorId: MeetingParticipantRefDto;

  @ApiProperty({ type: [String], example: ['507f1f77bcf86cd799439011'] })
  participantIds: string[];

  /**
   * Named activeParticipantIds for API compatibility, but the value is an array
   * of populated user refs (not bare IDs) sourced from meeting.activeParticipants.
   */
  @ApiProperty({ type: [MeetingParticipantRefDto] })
  activeParticipantIds: MeetingParticipantRefDto[];

  @ApiProperty({ enum: MeetingPhase, example: MeetingPhase.EMOTIONAL_EVALUATION })
  currentPhase: MeetingPhase;

  @ApiProperty({ enum: MeetingStatus, example: MeetingStatus.UPCOMING })
  status: MeetingStatus;

  @ApiProperty({ type: [EmotionalEvaluationDto] })
  emotionalEvaluations: EmotionalEvaluationDto[];

  @ApiProperty({ type: [UnderstandingContributionDto] })
  understandingContributions: UnderstandingContributionDto[];

  @ApiProperty({ type: [TaskEvaluationDto] })
  taskEvaluations: TaskEvaluationDto[];

  @ApiProperty({ example: '2026-01-19T10:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-01-19T10:00:00.000Z' })
  updatedAt: Date;
}

// ─── Statistics response ───────────────────────────────────────────────────────

class ParticipantStatDto {
  @ApiProperty({
    type: 'object',
    properties: {
      _id: { type: 'string' },
      fullName: { type: 'string', nullable: true },
      email: { type: 'string', nullable: true },
    },
  })
  participant: { _id: string; fullName: string | null; email: string | null };

  @ApiProperty({ example: 88 })
  understandingScore: number;

  @ApiProperty({ example: 72.5 })
  averageEmotionalScale: number;

  @ApiProperty({ example: 0 })
  toxicityFlags: number;

  @ApiProperty({ example: 45.0 })
  averageContribution: number;
}

export class StatisticsResponseDto {
  @ApiProperty({ example: 'What are the priorities this quarter?' })
  question: string;

  @ApiProperty({ example: 82.5 })
  avgUnderstanding: number;

  @ApiProperty({ type: [ParticipantStatDto] })
  participantStats: ParticipantStatDto[];
}
