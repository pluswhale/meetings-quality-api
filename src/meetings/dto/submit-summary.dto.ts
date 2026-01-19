import { 
  IsNotEmpty, 
  IsString, 
  IsNumber, 
  IsDateString,
  Min, 
  Max,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SubmitSummaryDto {
  @ApiProperty({
    description: 'Описание задачи',
    example: 'Реализовать аутентификацию пользователей',
  })
  @IsNotEmpty()
  @IsString()
  taskDescription: string;

  @ApiProperty({
    description: 'Дедлайн задачи (ISO формат)',
    example: '2026-02-01T00:00:00.000Z',
  })
  @IsNotEmpty()
  @IsDateString()
  deadline: string;

  @ApiProperty({
    description: 'Важность личного вклада в понимание (0-100)',
    example: 90,
    minimum: 0,
    maximum: 100,
  })
  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  @Max(100)
  contributionImportance: number;
}
