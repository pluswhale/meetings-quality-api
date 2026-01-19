import { 
  IsNotEmpty, 
  IsString, 
  IsNumber, 
  IsDateString,
  IsMongoId,
  Min, 
  Max,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateTaskDto {
  @ApiProperty({
    description: 'Описание задачи',
    example: 'Реализовать аутентификацию пользователей',
  })
  @IsNotEmpty()
  @IsString()
  description: string;

  @ApiProperty({
    description: 'ID встречи, из которой создана задача',
    example: '507f1f77bcf86cd799439020',
  })
  @IsNotEmpty()
  @IsMongoId()
  meetingId: string;

  @ApiProperty({
    description: 'Дедлайн задачи (ISO формат)',
    example: '2026-02-01T00:00:00.000Z',
  })
  @IsNotEmpty()
  @IsDateString()
  deadline: string;

  @ApiProperty({
    description: 'Важность вклада (0-100)',
    example: 90,
    minimum: 0,
    maximum: 100,
  })
  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  @Max(100)
  contributionImportance: number;
}
