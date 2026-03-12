import {
  IsOptional,
  IsString,
  IsArray,
  IsMongoId,
  IsEnum,
  MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ProjectStatus } from '../schemas/project.schema';

export class UpdateProjectDto {
  @ApiProperty({ required: false, example: 'Q3 Infrastructure Upgrade (revised)' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiProperty({ required: false, example: 'Updated goal description' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  goal?: string;

  @ApiProperty({ required: false, example: 'Updated scope description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    required: false,
    type: [String],
    example: ['507f1f77bcf86cd799439011'],
    description: 'Replaces the full participant list. Creator is always preserved.',
  })
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  participantIds?: string[];

  @ApiProperty({
    required: false,
    enum: ProjectStatus,
    example: ProjectStatus.ARCHIVED,
  })
  @IsOptional()
  @IsEnum(ProjectStatus)
  status?: ProjectStatus;
}
