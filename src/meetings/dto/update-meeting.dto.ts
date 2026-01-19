import { IsOptional, IsString, IsArray } from 'class-validator';
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
}
