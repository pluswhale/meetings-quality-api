import { 
  IsNotEmpty, 
  IsString, 
  IsNumber, 
  IsDateString,
  IsMongoId,
  Min, 
  Max,
} from 'class-validator';

export class CreateTaskDto {
  @IsNotEmpty()
  @IsString()
  description: string;

  @IsNotEmpty()
  @IsMongoId()
  meetingId: string;

  @IsNotEmpty()
  @IsDateString()
  deadline: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  @Max(100)
  contributionImportance: number;
}
