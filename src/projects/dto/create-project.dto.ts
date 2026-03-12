import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsArray,
  IsMongoId,
  MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateProjectDto {
  @ApiProperty({
    description: 'Project title',
    example: 'Q3 Infrastructure Upgrade',
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(200)
  title: string;

  @ApiProperty({
    description: 'High-level goal for this project',
    example: 'Migrate all services to Kubernetes by end of Q3',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  goal?: string;

  @ApiProperty({
    description: 'Detailed description of the project scope',
    example: 'Covers backend, frontend and monitoring stack migration',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'User IDs to invite as participants (creator is added automatically)',
    example: ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012'],
    required: false,
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  participantIds?: string[];
}
