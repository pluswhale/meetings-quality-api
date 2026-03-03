import { ApiProperty } from '@nestjs/swagger';

// ─── Shared primitives ─────────────────────────────────────────────────────────

export class ParticipantRefDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  _id: string;

  @ApiProperty({ example: 'Jane Doe', nullable: true })
  fullName: string | null;

  @ApiProperty({ example: 'jane@example.com', nullable: true })
  email: string | null;
}

class CompactParticipantRefDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439012' })
  _id: string;

  @ApiProperty({ example: 'John Smith', nullable: true })
  fullName: string | null;
}

// ─── Emotional Evaluation submission ──────────────────────────────────────────

class EmotionalEvaluationEntryDto {
  @ApiProperty({ type: CompactParticipantRefDto })
  targetParticipant: CompactParticipantRefDto;

  @ApiProperty({ example: 80, minimum: -100, maximum: 100 })
  emotionalScale: number;

  @ApiProperty({ example: false })
  isToxic: boolean;
}

export class EmotionalSubmissionDto {
  @ApiProperty({ type: ParticipantRefDto })
  participant: ParticipantRefDto;

  @ApiProperty({ example: true })
  submitted: boolean;

  @ApiProperty({ example: '2026-01-24T10:30:00.000Z' })
  submittedAt: Date;

  @ApiProperty({ type: [EmotionalEvaluationEntryDto] })
  evaluations: EmotionalEvaluationEntryDto[];
}

// ─── Understanding & Contribution submission ───────────────────────────────────

class ContributionEntryDto {
  @ApiProperty({ type: CompactParticipantRefDto })
  participant: CompactParticipantRefDto;

  @ApiProperty({ example: 60, minimum: 0, maximum: 100 })
  contributionPercentage: number;
}

export class UnderstandingSubmissionDto {
  @ApiProperty({ type: ParticipantRefDto })
  participant: ParticipantRefDto;

  @ApiProperty({ example: true })
  submitted: boolean;

  @ApiProperty({ example: '2026-01-24T11:00:00.000Z' })
  submittedAt: Date;

  @ApiProperty({ example: 90, minimum: 0, maximum: 100 })
  understandingScore: number;

  @ApiProperty({ type: [ContributionEntryDto] })
  contributions: ContributionEntryDto[];
}

// ─── Task submission (sourced from Task collection, not Meeting) ───────────────

/**
 * Represents a task planning submission.
 *
 * All fields are sourced exclusively from the Task collection — there is no
 * fallback to any embedded Meeting subdocument. This ensures consumers always
 * see the canonical, up-to-date task data (e.g. estimateHours updated post-submission).
 */
export class TaskSubmissionDto {
  @ApiProperty({ type: ParticipantRefDto })
  participant: ParticipantRefDto;

  @ApiProperty({ example: '507f1f77bcf86cd799439030' })
  taskId: string;

  @ApiProperty({ example: true })
  submitted: boolean;

  @ApiProperty({
    example: '2026-01-24T11:30:00.000Z',
    description: 'Task creation timestamp used as submission time',
  })
  submittedAt: Date;

  @ApiProperty({ example: 'Implement auth module' })
  description: string;

  @ApiProperty({ example: 'What tech stack should we use?' })
  commonQuestion: string;

  @ApiProperty({ example: 8, description: 'Estimated hours; updatable after submission' })
  estimateHours: number;

  @ApiProperty({ example: false })
  approved: boolean;

  @ApiProperty({ example: '2026-02-01T00:00:00.000Z' })
  deadline: Date;

  @ApiProperty({ example: 80, minimum: 0, maximum: 100 })
  contributionImportance: number;

  @ApiProperty({ example: false })
  isCompleted: boolean;
}

// ─── Task Evaluation submission ────────────────────────────────────────────────

class TaskEvaluationEntryDto {
  @ApiProperty({ type: CompactParticipantRefDto })
  taskAuthor: CompactParticipantRefDto;

  @ApiProperty({ example: 85, minimum: 0, maximum: 100 })
  importanceScore: number;
}

export class TaskEvaluationSubmissionDto {
  @ApiProperty({ type: ParticipantRefDto })
  participant: ParticipantRefDto;

  @ApiProperty({ example: true })
  submitted: boolean;

  @ApiProperty({ example: '2026-01-24T12:00:00.000Z' })
  submittedAt: Date;

  @ApiProperty({ type: [TaskEvaluationEntryDto] })
  evaluations: TaskEvaluationEntryDto[];
}

// ─── Root response ─────────────────────────────────────────────────────────────

class SubmissionsDto {
  @ApiProperty({
    description: 'Keyed by participantId string',
    type: 'object',
    additionalProperties: { $ref: '#/components/schemas/EmotionalSubmissionDto' },
  })
  emotional_evaluation: Record<string, EmotionalSubmissionDto>;

  @ApiProperty({
    description: 'Keyed by participantId string',
    type: 'object',
    additionalProperties: { $ref: '#/components/schemas/UnderstandingSubmissionDto' },
  })
  understanding_contribution: Record<string, UnderstandingSubmissionDto>;

  @ApiProperty({
    description: 'Keyed by authorId string — sourced from Task collection',
    type: 'object',
    additionalProperties: { $ref: '#/components/schemas/TaskSubmissionDto' },
  })
  task_planning: Record<string, TaskSubmissionDto>;

  @ApiProperty({
    description: 'Keyed by participantId string',
    type: 'object',
    additionalProperties: { $ref: '#/components/schemas/TaskEvaluationSubmissionDto' },
  })
  task_evaluation: Record<string, TaskEvaluationSubmissionDto>;
}

export class GetMeetingSubmissionsResponseDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439020' })
  meetingId: string;

  @ApiProperty({ type: SubmissionsDto })
  submissions: SubmissionsDto;
}
