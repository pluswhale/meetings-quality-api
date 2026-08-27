import { IsOptional, IsString, IsArray, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateMeetingDto {
  @ApiProperty({
    description: 'Название встречи',
    example: 'Обновленное название встречи',
    required: false,
  })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiProperty({
    description: 'Вопрос для обсуждения',
    example: 'Обновленный вопрос',
    required: false,
  })
  @IsOptional()
  @IsString()
  question?: string;

  @ApiProperty({
    description: 'ID участников встречи',
    example: ['507f1f77bcf86cd799439011'],
    required: false,
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  participantIds?: string[];

  @ApiProperty({
    description:
      'Новая дата и время встречи. Статус пересчитывается: будущая дата возвращает встречу в upcoming, прошедшая — в active.',
    example: '2026-02-11T09:00:00.000Z',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  upcomingDate?: string;
}
