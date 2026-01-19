import { 
  IsNotEmpty, 
  IsNumber, 
  IsArray, 
  ValidateNested, 
  Min, 
  Max,
  IsMongoId,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class EmotionalEvaluationDto {
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
  @IsNotEmpty()
  @IsNumber()
  @Min(-100)
  @Max(100)
  emotionalScale: number;

  @ApiProperty({
    description: 'Флаг токсичности участника',
    example: false,
  })
  @IsNotEmpty()
  @IsBoolean()
  isToxic: boolean;
}

export class UnderstandingInfluenceDto {
  @ApiProperty({
    description: 'ID участника',
    example: '507f1f77bcf86cd799439012',
  })
  @IsNotEmpty()
  @IsMongoId()
  participantId: string;

  @ApiProperty({
    description: 'Процент влияния участника на понимание (0-100)',
    example: 60,
    minimum: 0,
    maximum: 100,
  })
  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  @Max(100)
  influencePercentage: number;
}

export class SubmitEvaluationDto {
  @ApiProperty({
    description: 'Самооценка понимания задачи (0-100)',
    example: 85,
    minimum: 0,
    maximum: 100,
  })
  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  @Max(100)
  understandingScore: number;

  @ApiProperty({
    description: 'Влияние других участников на понимание',
    type: [UnderstandingInfluenceDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UnderstandingInfluenceDto)
  influences: UnderstandingInfluenceDto[];

  @ApiProperty({
    description: 'Эмоциональные оценки других участников',
    type: [EmotionalEvaluationDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EmotionalEvaluationDto)
  emotionalEvaluations: EmotionalEvaluationDto[];
}
