import { ApiProperty } from '@nestjs/swagger';

// ─── Nested populated-ref shapes ──────────────────────────────────────────────
// These mirror what Mongoose returns after .populate() calls in TasksService.
// Defining them here keeps the Swagger schema accurate and gives consumers a
// typed contract without coupling them to internal Mongoose document types.

class TaskAuthorRefDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  _id: string;

  @ApiProperty({ example: 'Jane Doe', nullable: true })
  fullName: string | null;

  @ApiProperty({ example: 'jane@example.com', nullable: true })
  email: string | null;
}

class TaskMeetingRefDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439020' })
  _id: string;

  @ApiProperty({ example: 'Q3 Planning Session' })
  title: string;

  @ApiProperty({ example: 'What are the priorities this quarter?' })
  question: string;
}

// ─── Task response ────────────────────────────────────────────────────────────

export class TaskResponseDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439030' })
  _id: string;

  @ApiProperty({ example: 'Implement authentication module' })
  description: string;

  @ApiProperty({ example: 'How should we approach the tech stack?' })
  commonQuestion: string;

  @ApiProperty({ type: TaskAuthorRefDto })
  authorId: TaskAuthorRefDto;

  @ApiProperty({ type: TaskMeetingRefDto })
  meetingId: TaskMeetingRefDto;

  @ApiProperty({ example: '2026-02-01T00:00:00.000Z' })
  deadline: Date;

  @ApiProperty({ example: 8, description: 'Estimated hours to complete the task' })
  estimateHours: number;

  @ApiProperty({ example: 80, minimum: 0, maximum: 100 })
  contributionImportance: number;

  @ApiProperty({ example: false })
  approved: boolean;

  @ApiProperty({ example: false })
  isCompleted: boolean;

  @ApiProperty({ example: '2026-01-19T10:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-01-19T10:00:00.000Z' })
  updatedAt: Date;
}

// ─── Task approval response ────────────────────────────────────────────────────

class ApprovedTaskSummaryDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439030' })
  _id: string;

  @ApiProperty({ example: 'Implement authentication module' })
  description: string;

  @ApiProperty({ example: true })
  approved: boolean;

  @ApiProperty({ type: TaskAuthorRefDto })
  author: TaskAuthorRefDto;
}

export class TaskApprovalResponseDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439030' })
  taskId: string;

  @ApiProperty({ example: true })
  approved: boolean;

  @ApiProperty({ type: ApprovedTaskSummaryDto })
  task: ApprovedTaskSummaryDto;
}
