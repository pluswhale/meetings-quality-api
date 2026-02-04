import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class ApproveTaskDto {
  @ApiProperty({
    description: 'Approve or unapprove the task',
    example: true,
  })
  @IsBoolean()
  approved: boolean;
}
