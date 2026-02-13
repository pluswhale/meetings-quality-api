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
  }

  async process(job: Job): Promise<void> {
    if (job.name !== 'activate-meetings') return;

    const now = new Date();

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
      this.logger.log(`Activated ${result.modifiedCount} meetings`);
    }
  }
}
