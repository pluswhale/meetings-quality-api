import { ApiProperty } from '@nestjs/swagger';

export class TaskResponseDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439030' })
  _id: string;

  @ApiProperty({ example: 'Реализовать аутентификацию пользователей' })
  description: string;

  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  authorId: string;

  @ApiProperty({ example: '507f1f77bcf86cd799439020' })
  meetingId: string;

  @ApiProperty({ example: '2026-02-01T00:00:00.000Z' })
  deadline: Date;

  @ApiProperty({ example: 90, minimum: 0, maximum: 100 })
  contributionImportance: number;

  @ApiProperty({ example: false })
  isCompleted: boolean;

  @ApiProperty({ example: '2026-01-19T10:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-01-19T10:00:00.000Z' })
  updatedAt: Date;
}
