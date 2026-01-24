import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MeetingsController } from './meetings.controller';
import { MeetingsService } from './meetings.service';
import { MeetingsGateway } from './meetings.gateway';
import { Meeting, MeetingSchema } from './schemas/meeting.schema';
import { Task, TaskSchema } from '../tasks/schemas/task.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Meeting.name, schema: MeetingSchema },
      { name: Task.name, schema: TaskSchema },
    ]),
  ],
  controllers: [MeetingsController],
  providers: [MeetingsService, MeetingsGateway],
  exports: [MeetingsService],
})
export class MeetingsModule {}
