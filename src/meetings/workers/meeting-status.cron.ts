import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class MeetingStatusCron {
  constructor(
    @InjectQueue('meeting-status')
    private readonly queue: Queue,
  ) {}

  @Cron('*/1 * * * *') // every minute
  async triggerMeetingActivation() {
    await this.queue.add(
      'activate-meetings',
      {},
      {
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
  }
}
