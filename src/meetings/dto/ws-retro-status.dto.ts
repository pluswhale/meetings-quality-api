import { IsMongoId, IsEnum, IsString, IsOptional } from 'class-validator';

export class WsRetroStatusDto {
  @IsMongoId()
  meetingId: string;

  @IsMongoId()
  taskId: string;

  @IsEnum(['completed', 'incomplete'])
  status: 'completed' | 'incomplete';

  @IsOptional()
  @IsString()
  statusNote?: string;
}
