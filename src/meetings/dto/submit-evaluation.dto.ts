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

export class EmotionalEvaluationDto {
  @IsNotEmpty()
  @IsMongoId()
  targetParticipantId: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(-100)
  @Max(100)
  emotionalScale: number;

  @IsNotEmpty()
  @IsBoolean()
  isToxic: boolean;
}

export class UnderstandingInfluenceDto {
  @IsNotEmpty()
  @IsMongoId()
  participantId: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  @Max(100)
  influencePercentage: number;
}

export class SubmitEvaluationDto {
  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  @Max(100)
  understandingScore: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UnderstandingInfluenceDto)
  influences: UnderstandingInfluenceDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EmotionalEvaluationDto)
  emotionalEvaluations: EmotionalEvaluationDto[];
}
