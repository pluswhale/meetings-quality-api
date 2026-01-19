import { IsNotEmpty, IsString, IsArray, IsOptional } from 'class-validator';

export class CreateMeetingDto {
  @IsNotEmpty()
  @IsString()
  title: string;

  @IsNotEmpty()
  @IsString()
  question: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  participantIds?: string[];
}
