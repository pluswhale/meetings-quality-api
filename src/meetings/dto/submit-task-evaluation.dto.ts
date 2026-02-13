import { IsNotEmpty, IsString, IsNumber, IsArray, ValidateNested, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class TaskImportanceEvaluationDto {
  @ApiProperty({
    description: 'ID автора задачи, которую оценивают',
    example: '507f1f77bcf86cd799439011',
  })
  @IsNotEmpty()
  @IsString()
  taskAuthorId: string;

  @ApiProperty({
    description: 'Оценка важности задачи (0-100)',
    example: 75,
    minimum: 0,
    maximum: 100,
  })
  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  @Max(100)
  importanceScore: number;
}

export class SubmitTaskEvaluationDto {
  @ApiProperty({
    description:
      'Массив оценок важности задач (можно отправить пустой массив - голосование полностью опциональное)',
    type: [TaskImportanceEvaluationDto],
    example: [],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TaskImportanceEvaluationDto)
  evaluations: TaskImportanceEvaluationDto[];
}
