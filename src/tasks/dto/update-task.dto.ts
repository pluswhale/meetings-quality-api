import { 
  IsOptional, 
  IsString, 
  IsNumber, 
  IsDateString,
  IsBoolean,
  Min, 
  Max,
} from 'class-validator';

export class UpdateTaskDto {
  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  deadline?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  contributionImportance?: number;

  @IsOptional()
  @IsBoolean()
  isCompleted?: boolean;
}
