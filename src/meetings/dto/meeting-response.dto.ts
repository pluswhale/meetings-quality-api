import { ApiProperty } from '@nestjs/swagger';
import { MeetingPhase, MeetingStatus } from '../schemas/meeting.schema';

export class MeetingResponseDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439020' })
  _id: string;

  @ApiProperty({ example: 'Обсуждение нового проекта' })
  title: string;

  @ApiProperty({ example: 'Какие технологии использовать?' })
  question: string;

  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  creatorId: string;

  @ApiProperty({ 
    example: ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012'],
    type: [String],
  })
  participantIds: string[];

  @ApiProperty({ enum: MeetingPhase, example: MeetingPhase.DISCUSSION })
  currentPhase: MeetingPhase;

  @ApiProperty({ enum: MeetingStatus, example: MeetingStatus.UPCOMING })
  status: MeetingStatus;

  @ApiProperty({ example: '2026-01-19T10:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-01-19T10:00:00.000Z' })
  updatedAt: Date;
}

export class StatisticsResponseDto {
  @ApiProperty({ example: 'Какие технологии использовать?' })
  question: string;

  @ApiProperty({ example: 82.5 })
  avgUnderstanding: number;

  @ApiProperty({
    type: 'array',
    items: {
      type: 'object',
      properties: {
        participant: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            fullName: { type: 'string' },
            email: { type: 'string' },
          },
        },
        understandingScore: { type: 'number' },
        averageEmotionalScale: { type: 'number' },
        toxicityFlags: { type: 'number' },
      },
    },
  })
  participantStats: any[];
}
