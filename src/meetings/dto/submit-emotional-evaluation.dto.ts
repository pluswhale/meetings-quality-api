import {
  IsNotEmpty,
  IsNumber,
  IsArray,
  ValidateNested,
  Min,
  Max,
  IsMongoId,
  IsBoolean,
  IsOptional,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class ParticipantEmotionalEvaluationDto {
  @ApiProperty({
    description: 'ID участника, которого оценивают',
    example: '507f1f77bcf86cd799439012',
  })
  @IsNotEmpty()
  @IsMongoId()
  targetParticipantId: string;

  @ApiProperty({
    description: 'Эмоциональная оценка от -100 (негативная) до 100 (позитивная)',
    example: 80,
    minimum: -100,
    maximum: 100,
  })
  @IsOptional()
  @IsNumber()
  @Min(-100)
  @Max(100)
  emotionalScale: number;

  @ApiProperty({
    description: 'Флаг токсичности участника',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  isToxic: boolean;
}

export class SubmitEmotionalEvaluationDto {
  @ApiProperty({
    description:
      'Эмоциональные оценки других участников (можно отправить пустой массив - голосование полностью опциональное)',
    type: [ParticipantEmotionalEvaluationDto],
    example: [],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ParticipantEmotionalEvaluationDto)
  evaluations: ParticipantEmotionalEvaluationDto[];
}
