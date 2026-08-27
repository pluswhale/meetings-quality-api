import { IsNotEmpty, IsString, IsArray, IsOptional, IsMongoId } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateMeetingDto {
  /**
   * Meetings MUST be created inside a project.
   * The projectId is required — reject any request without it.
   */
  @ApiProperty({
    description: 'Project this meeting belongs to (required)',
    example: '507f1f77bcf86cd799439050',
    required: true,
  })
  @IsNotEmpty({ message: 'projectId обязателен — встреча должна принадлежать проекту' })
  @IsMongoId({ message: 'projectId должен быть валидным MongoDB ObjectId' })
  projectId: string;

  @ApiProperty({
    description: 'Название встречи',
    example: 'Обсуждение нового проекта',
  })
  @IsNotEmpty()
  @IsString()
  title: string;

  @ApiProperty({
    description: 'Вопрос для обсуждения',
    example: 'Какие технологии использовать для нового проекта?',
  })
  @IsNotEmpty()
  @IsString()
  question: string;

  @ApiProperty({
    description: 'Дата и время встречи. Если не указано — встреча начинается сразу.',
    example: '2026-02-11T00:00:00.000Z',
    required: false,
  })
  @IsOptional()
  @IsString()
  upcomingDate?: string;

  @ApiProperty({
    description: 'ID участников встречи',
    example: ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012'],
    required: false,
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  participantIds?: string[];

  @ApiProperty({
    description: 'Link to a previous meeting for Phase 0 retrospective review',
    example: '507f1f77bcf86cd799439030',
    required: false,
  })
  @IsOptional()
  @IsMongoId()
  previousMeetingId?: string;
}
