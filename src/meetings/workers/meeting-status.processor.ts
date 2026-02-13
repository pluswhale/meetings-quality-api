import { Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectModel } from '@nestjs/mongoose';
import { Logger } from '@nestjs/common';
import { Model } from 'mongoose';
import { Job } from 'bullmq';

import { Meeting, MeetingDocument, MeetingStatus } from '../schemas/meeting.schema';

@Processor('meeting-status')
export class MeetingStatusProcessor extends WorkerHost {
  private readonly logger = new Logger(MeetingStatusProcessor.name);

  constructor(
    @InjectModel(Meeting.name)
    private readonly meetingModel: Model<MeetingDocument>,
  ) {
    super();
    this.logger.log('✅ MeetingStatusProcessor initialized and ready');
  }

  async process(job: Job): Promise<void> {
    this.logger.log(`🔄 Processing job: ${job.name} (ID: ${job.id})`);

    if (job.name !== 'activate-meetings') {
      this.logger.warn(`⚠️ Unknown job name: ${job.name}`);
      return;
    }

    const now = new Date();
    this.logger.log(`⏰ Checking for upcoming meetings before: ${now.toISOString()}`);

    // Find meetings that should be activated
    const meetingsToActivate = await this.meetingModel.find({
      status: MeetingStatus.UPCOMING,
      upcomingDate: { $lte: now },
    });

    this.logger.log(`📊 Found ${meetingsToActivate.length} meetings to activate`);

    if (meetingsToActivate.length > 0) {
      meetingsToActivate.forEach((meeting) => {
        this.logger.log(
          `  - Meeting "${meeting.title}" (ID: ${meeting._id}) with upcomingDate: ${meeting.upcomingDate}`,
        );
      });
    }

    const result = await this.meetingModel.updateMany(
      {
        status: MeetingStatus.UPCOMING,
        upcomingDate: { $lte: now },
      },
      {
        $set: { status: MeetingStatus.ACTIVE },
      },
    );

    if (result.modifiedCount > 0) {
      this.logger.log(`✅ Activated ${result.modifiedCount} meetings`);
    } else {
      this.logger.log('ℹ️ No meetings to activate');
    }
  }
}
