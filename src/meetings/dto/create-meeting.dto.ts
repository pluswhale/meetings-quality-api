import { IsNotEmpty, IsString, IsArray, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateMeetingDto {
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
    description: 'Дата и время встречи',
    example: '2026-02-11T00:00:00.000Z',
  })
  @IsOptional()
  @IsString()
  upcomingDate: string;

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
}
