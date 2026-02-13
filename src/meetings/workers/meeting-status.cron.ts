import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class MeetingStatusCron {
  private readonly logger = new Logger(MeetingStatusCron.name);

  constructor(
    @InjectQueue('meeting-status')
    private readonly queue: Queue,
  ) {
    this.logger.log('✅ MeetingStatusCron initialized');
  }

  @Cron('*/1 * * * *') // every minute
  async triggerMeetingActivation() {
    this.logger.log('⏰ Cron triggered: Adding activate-meetings job to queue');

    const job = await this.queue.add(
      'activate-meetings',
      {},
      {
        removeOnComplete: true,
        removeOnFail: true,
      },
    );

    this.logger.log(`📝 Job added to queue with ID: ${job.id}`);
  }

  // Manual trigger for testing
  async triggerManually() {
    this.logger.log('🔧 Manual trigger: Adding activate-meetings job to queue');

    const job = await this.queue.add(
      'activate-meetings',
      {},
      {
        removeOnComplete: true,
        removeOnFail: true,
      },
    );

    return {
      success: true,
      jobId: job.id,
      message: 'Job added to queue',
    };
  }
}
