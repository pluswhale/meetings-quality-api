import {
  IsNotEmpty,
  IsNumber,
  IsArray,
  ValidateNested,
  Min,
  Max,
  IsMongoId,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class ContributionInfluenceDto {
  @ApiProperty({
    description: 'ID участника',
    example: '507f1f77bcf86cd799439012',
  })
  @IsNotEmpty()
  @IsMongoId()
  participantId: string;

  @ApiProperty({
    description: 'Процент вклада участника в обсуждение (0-100)',
    example: 60,
    minimum: 0,
    maximum: 100,
  })
  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  @Max(100)
  contributionPercentage: number;
}

export class SubmitUnderstandingContributionDto {
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
    description:
      'Распределение вклада участников в обсуждение (можно отправить пустой массив - голосование полностью опциональное)',
    type: [ContributionInfluenceDto],
    example: [],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContributionInfluenceDto)
  contributions: ContributionInfluenceDto[];
}
