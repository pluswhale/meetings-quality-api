import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { MeetingsController } from './meetings.controller';
import { MeetingsService } from './meetings.service';
import { MeetingsGateway } from './meetings.gateway';
import { Meeting, MeetingSchema } from './schemas/meeting.schema';
import { Task, TaskSchema } from '../tasks/schemas/task.schema';
import { AuthModule } from 'src/auth/auth.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { MeetingStatusProcessor } from './workers/meeting-status.processor';
import { MeetingStatusCron } from './workers/meeting-status.cron';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'meeting-status',
    }),
    MongooseModule.forFeature([
      { name: Meeting.name, schema: MeetingSchema },
      { name: Task.name, schema: TaskSchema },
    ]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '1d' },
      }),
    }),
    AuthModule,
    ConfigModule,
  ],
  controllers: [MeetingsController],
  providers: [MeetingsService, MeetingsGateway, MeetingStatusProcessor, MeetingStatusCron],
  exports: [MeetingsService, MeetingsGateway],
})
export class MeetingsModule {}
