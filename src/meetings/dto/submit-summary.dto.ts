import { 
  IsNotEmpty, 
  IsString, 
  IsNumber, 
  IsDateString,
  Min, 
  Max,
} from 'class-validator';

export class SubmitSummaryDto {
  @IsNotEmpty()
  @IsString()
  taskDescription: string;

  @IsNotEmpty()
  @IsDateString()
  deadline: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  @Max(100)
  contributionImportance: number;
}
