import { 
  IsNotEmpty, 
  IsString, 
  IsNumber, 
  IsDateString,
  Min, 
  Max,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SubmitTaskPlanningDto {
  @ApiProperty({
    description: 'Описание задачи',
    example: 'Реализовать аутентификацию пользователей',
  })
  @IsNotEmpty()
  @IsString()
  taskDescription: string;

  @ApiProperty({
    description: 'Общий вопрос задачи',
    example: 'Какие технологии использовать?',
  })
  @IsNotEmpty()
  @IsString()
  commonQuestion: string;

  @ApiProperty({
    description: 'Дедлайн задачи (ISO формат)',
    example: '2026-02-01T00:00:00.000Z',
  })
  @IsNotEmpty()
  @IsDateString()
  deadline: string;

  @ApiProperty({
    description: 'Ожидаемый процент вклада в задачу (0-100)',
    example: 90,
    minimum: 0,
    maximum: 100,
  })
  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  @Max(100)
  expectedContributionPercentage: number;
}
