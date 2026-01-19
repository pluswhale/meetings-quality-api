import { 
  IsOptional, 
  IsString, 
  IsNumber, 
  IsDateString,
  IsBoolean,
  Min, 
  Max,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateTaskDto {
  @ApiProperty({
    description: 'Описание задачи',
    example: 'Обновленное описание задачи',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'Дедлайн задачи (ISO формат)',
    example: '2026-02-15T00:00:00.000Z',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  deadline?: string;

  @ApiProperty({
    description: 'Важность вклада (0-100)',
    example: 95,
    minimum: 0,
    maximum: 100,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  contributionImportance?: number;

  @ApiProperty({
    description: 'Статус завершения задачи',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isCompleted?: boolean;
}
