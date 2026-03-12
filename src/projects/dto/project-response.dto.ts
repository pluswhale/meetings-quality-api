import { ApiProperty } from '@nestjs/swagger';
import { ProjectStatus } from '../schemas/project.schema';

// ─── Nested shapes ─────────────────────────────────────────────────────────────

class ProjectParticipantRefDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  _id: string;

  @ApiProperty({ example: 'Jane Doe' })
  fullName: string;

  @ApiProperty({ example: 'jane@example.com' })
  email: string;
}

// ─── Project response ──────────────────────────────────────────────────────────

export class ProjectResponseDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439050' })
  _id: string;

  @ApiProperty({ example: 'Q3 Infrastructure Upgrade' })
  title: string;

  @ApiProperty({ example: 'Migrate all services to Kubernetes' })
  goal: string;

  @ApiProperty({ example: 'Covers backend, frontend and monitoring stack' })
  description: string;

  @ApiProperty({ type: ProjectParticipantRefDto })
  creatorId: ProjectParticipantRefDto;

  @ApiProperty({ type: [ProjectParticipantRefDto] })
  participantIds: ProjectParticipantRefDto[];

  @ApiProperty({ enum: ProjectStatus, example: ProjectStatus.CURRENT })
  status: ProjectStatus;

  @ApiProperty({ example: '2026-01-19T10:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-01-19T10:00:00.000Z' })
  updatedAt: Date;
}

// ─── Project detail response (includes aggregated counts) ─────────────────────

export class ProjectDetailResponseDto extends ProjectResponseDto {
  @ApiProperty({ example: 5, description: 'Total meetings under this project' })
  meetingCount: number;

  @ApiProperty({ example: 12, description: 'Total tasks under this project' })
  taskCount: number;
}
