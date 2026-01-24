import { ApiProperty } from '@nestjs/swagger';
import { MeetingPhase, MeetingStatus } from '../schemas/meeting.schema';

class EmotionalEvaluationItemDto {
  @ApiProperty({ 
    example: '507f1f77bcf86cd799439012',
    description: 'ID участника, которого оценивают'
  })
  targetParticipantId: string;

  @ApiProperty({ 
    example: 85,
    minimum: -100,
    maximum: 100,
    description: 'Эмоциональная оценка'
  })
  emotionalScale: number;

  @ApiProperty({ 
    example: false,
    description: 'Флаг токсичности'
  })
  isToxic: boolean;
}

class EmotionalEvaluationDto {
  @ApiProperty({ 
    example: '507f1f77bcf86cd799439011',
    description: 'ID участника, который оценивал'
  })
  participantId: string;

  @ApiProperty({ 
    type: [EmotionalEvaluationItemDto],
    description: 'Оценки других участников'
  })
  evaluations: EmotionalEvaluationItemDto[];

  @ApiProperty({ 
    example: '2026-01-24T10:30:00.000Z',
    description: 'Дата отправки'
  })
  submittedAt: Date;
}

class ContributionItemDto {
  @ApiProperty({ 
    example: '507f1f77bcf86cd799439012',
    description: 'ID участника'
  })
  participantId: string;

  @ApiProperty({ 
    example: 60,
    minimum: 0,
    maximum: 100,
    description: 'Процент вклада'
  })
  contributionPercentage: number;
}

class UnderstandingContributionDto {
  @ApiProperty({ 
    example: '507f1f77bcf86cd799439011',
    description: 'ID участника'
  })
  participantId: string;

  @ApiProperty({ 
    example: 90,
    minimum: 0,
    maximum: 100,
    description: 'Оценка понимания'
  })
  understandingScore: number;

  @ApiProperty({ 
    type: [ContributionItemDto],
    description: 'Распределение вклада'
  })
  contributions: ContributionItemDto[];

  @ApiProperty({ 
    example: '2026-01-24T11:00:00.000Z',
    description: 'Дата отправки'
  })
  submittedAt: Date;
}

class TaskPlanningDto {
  @ApiProperty({ 
    example: '507f1f77bcf86cd799439011',
    description: 'ID участника'
  })
  participantId: string;

  @ApiProperty({ 
    example: 'Implement authentication',
    description: 'Описание задачи'
  })
  taskDescription: string;

  @ApiProperty({ 
    example: '2026-02-01T00:00:00.000Z',
    description: 'Дедлайн'
  })
  deadline: Date;

  @ApiProperty({ 
    example: 80,
    minimum: 0,
    maximum: 100,
    description: 'Ожидаемый процент вклада'
  })
  expectedContributionPercentage: number;

  @ApiProperty({ 
    example: '2026-01-24T11:30:00.000Z',
    description: 'Дата отправки'
  })
  submittedAt: Date;
}

export class MeetingResponseDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439020' })
  _id: string;

  @ApiProperty({ example: 'Обсуждение нового проекта' })
  title: string;

  @ApiProperty({ example: 'Какие технологии использовать?' })
  question: string;

  @ApiProperty({ 
    example: '507f1f77bcf86cd799439011',
    description: 'ID создателя встречи (строка)' 
  })
  creatorId: string;

  @ApiProperty({ 
    example: ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012'],
    type: [String],
    description: 'Массив ID участников (строки)'
  })
  participantIds: string[];

  @ApiProperty({ enum: MeetingPhase, example: MeetingPhase.DISCUSSION })
  currentPhase: MeetingPhase;

  @ApiProperty({ enum: MeetingStatus, example: MeetingStatus.UPCOMING })
  status: MeetingStatus;

  @ApiProperty({ 
    type: [EmotionalEvaluationDto],
    description: 'Эмоциональные оценки участников'
  })
  emotionalEvaluations: EmotionalEvaluationDto[];

  @ApiProperty({ 
    type: [UnderstandingContributionDto],
    description: 'Понимание и вклад участников'
  })
  understandingContributions: UnderstandingContributionDto[];

  @ApiProperty({ 
    type: [TaskPlanningDto],
    description: 'Планирование задач участников'
  })
  taskPlannings: TaskPlanningDto[];

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
