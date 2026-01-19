import { 
  Injectable, 
  NotFoundException, 
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Meeting, MeetingDocument, MeetingPhase, MeetingStatus } from './schemas/meeting.schema';
import { CreateMeetingDto } from './dto/create-meeting.dto';
import { UpdateMeetingDto } from './dto/update-meeting.dto';
import { ChangePhaseDto } from './dto/change-phase.dto';
import { SubmitEvaluationDto } from './dto/submit-evaluation.dto';
import { SubmitSummaryDto } from './dto/submit-summary.dto';
import { MeetingsGateway } from './meetings.gateway';

@Injectable()
export class MeetingsService {
  constructor(
    @InjectModel(Meeting.name) private meetingModel: Model<MeetingDocument>,
    private meetingsGateway: MeetingsGateway,
  ) {}

  async create(createMeetingDto: CreateMeetingDto, userId: string): Promise<Meeting> {
    const participantIds = createMeetingDto.participantIds?.map(id => new Types.ObjectId(id)) || [];
    const creatorObjectId = new Types.ObjectId(userId);
    
    // Add creator to participants if not already included
    if (!participantIds.some(id => id.equals(creatorObjectId))) {
      participantIds.push(creatorObjectId);
    }

    const createdMeeting = new this.meetingModel({
      title: createMeetingDto.title,
      question: createMeetingDto.question,
      creatorId: creatorObjectId,
      participantIds,
      currentPhase: MeetingPhase.DISCUSSION,
      status: MeetingStatus.UPCOMING,
    });

    return createdMeeting.save();
  }

  async findAll(userId: string, filter?: 'current' | 'past'): Promise<Meeting[]> {
    const userObjectId = new Types.ObjectId(userId);
    
    const query: any = {
      participantIds: userObjectId,
    };

    if (filter === 'current') {
      query.status = { $in: [MeetingStatus.UPCOMING, MeetingStatus.ACTIVE] };
    } else if (filter === 'past') {
      query.status = MeetingStatus.FINISHED;
    }

    return this.meetingModel
      .find(query)
      .populate('creatorId', 'fullName email')
      .populate('participantIds', 'fullName email')
      .sort({ createdAt: -1 })
      .exec();
  }

  async findOne(id: string, userId: string): Promise<Meeting> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid meeting ID');
    }

    const meeting = await this.meetingModel
      .findById(id)
      .populate('creatorId', 'fullName email')
      .populate('participantIds', 'fullName email')
      .populate('evaluations.participantId', 'fullName email')
      .populate('evaluations.influences.participantId', 'fullName email')
      .populate('evaluations.emotionalEvaluations.targetParticipantId', 'fullName email')
      .populate('summaries.participantId', 'fullName email')
      .exec();

    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }

    // Check if user is a participant
    const userObjectId = new Types.ObjectId(userId);
    const isParticipant = meeting.participantIds.some(
      (id: any) => id._id.equals(userObjectId)
    );

    if (!isParticipant) {
      throw new ForbiddenException('You are not a participant of this meeting');
    }

    return meeting;
  }

  async update(id: string, updateMeetingDto: UpdateMeetingDto, userId: string): Promise<Meeting> {
    const meeting = await this.findOne(id, userId);

    // Only creator can update meeting
    if (!meeting.creatorId['_id'].equals(new Types.ObjectId(userId))) {
      throw new ForbiddenException('Only the meeting creator can update the meeting');
    }

    if (updateMeetingDto.participantIds) {
      updateMeetingDto['participantIds'] = updateMeetingDto.participantIds.map(
        id => new Types.ObjectId(id)
      );
    }

    Object.assign(meeting, updateMeetingDto);
    return meeting.save();
  }

  async remove(id: string, userId: string): Promise<void> {
    const meeting = await this.findOne(id, userId);

    // Only creator can delete meeting
    if (!meeting.creatorId['_id'].equals(new Types.ObjectId(userId))) {
      throw new ForbiddenException('Only the meeting creator can delete the meeting');
    }

    await this.meetingModel.findByIdAndDelete(id);
  }

  async changePhase(id: string, changePhaseDto: ChangePhaseDto, userId: string): Promise<Meeting> {
    const meeting = await this.findOne(id, userId);

    // Only creator can change phase
    if (!meeting.creatorId['_id'].equals(new Types.ObjectId(userId))) {
      throw new ForbiddenException('Only the meeting creator can change the phase');
    }

    // Update status based on phase
    if (changePhaseDto.phase === MeetingPhase.FINISHED) {
      meeting.status = MeetingStatus.FINISHED;
    } else if (meeting.status === MeetingStatus.UPCOMING) {
      meeting.status = MeetingStatus.ACTIVE;
    }

    meeting.currentPhase = changePhaseDto.phase;
    await meeting.save();

    // Emit WebSocket event for real-time update
    this.meetingsGateway.emitPhaseChange(id, {
      phase: changePhaseDto.phase,
      status: meeting.status,
    });

    return meeting;
  }

  async submitEvaluation(
    id: string, 
    evaluationDto: SubmitEvaluationDto, 
    userId: string
  ): Promise<Meeting> {
    const meeting = await this.findOne(id, userId);

    // Check if meeting is in evaluation phase
    if (meeting.currentPhase !== MeetingPhase.EVALUATION) {
      throw new BadRequestException('Meeting is not in evaluation phase');
    }

    const userObjectId = new Types.ObjectId(userId);

    // Remove existing evaluation from this user if any
    meeting.evaluations = meeting.evaluations.filter(
      (e: any) => !e.participantId.equals(userObjectId)
    );

    // Add new evaluation
    meeting.evaluations.push({
      participantId: userObjectId,
      understandingScore: evaluationDto.understandingScore,
      influences: evaluationDto.influences.map(inf => ({
        participantId: new Types.ObjectId(inf.participantId),
        influencePercentage: inf.influencePercentage,
      })),
      emotionalEvaluations: evaluationDto.emotionalEvaluations.map(emo => ({
        targetParticipantId: new Types.ObjectId(emo.targetParticipantId),
        emotionalScale: emo.emotionalScale,
        isToxic: emo.isToxic,
      })),
      submittedAt: new Date(),
    } as any);

    return meeting.save();
  }

  async submitSummary(
    id: string, 
    summaryDto: SubmitSummaryDto, 
    userId: string
  ): Promise<Meeting> {
    const meeting = await this.findOne(id, userId);

    // Check if meeting is in summary phase
    if (meeting.currentPhase !== MeetingPhase.SUMMARY) {
      throw new BadRequestException('Meeting is not in summary phase');
    }

    const userObjectId = new Types.ObjectId(userId);

    // Remove existing summary from this user if any
    meeting.summaries = meeting.summaries.filter(
      (s: any) => !s.participantId.equals(userObjectId)
    );

    // Add new summary
    meeting.summaries.push({
      participantId: userObjectId,
      taskDescription: summaryDto.taskDescription,
      deadline: new Date(summaryDto.deadline),
      contributionImportance: summaryDto.contributionImportance,
      submittedAt: new Date(),
    } as any);

    return meeting.save();
  }

  async getStatistics(id: string, userId: string) {
    const meeting = await this.findOne(id, userId);

    if (meeting.status !== MeetingStatus.FINISHED) {
      throw new BadRequestException('Statistics are only available for finished meetings');
    }

    // Calculate statistics
    const participants = meeting.participantIds;
    const participantStats = participants.map((participant: any) => {
      const participantId = participant._id;
      
      // Find participant's evaluation
      const evaluation = meeting.evaluations.find((e: any) => 
        e.participantId._id.equals(participantId)
      );

      // Get emotional evaluations received by this participant
      const emotionalScores = meeting.evaluations.flatMap((e: any) =>
        e.emotionalEvaluations
          .filter((ee: any) => ee.targetParticipantId.equals(participantId))
          .map((ee: any) => ({
            emotionalScale: ee.emotionalScale,
            isToxic: ee.isToxic,
          }))
      );

      const avgEmotionalScale = emotionalScores.length > 0
        ? emotionalScores.reduce((sum, e) => sum + e.emotionalScale, 0) / emotionalScores.length
        : 0;

      const toxicityFlags = emotionalScores.filter(e => e.isToxic).length;

      return {
        participant: {
          _id: participant._id,
          fullName: participant.fullName,
          email: participant.email,
        },
        understandingScore: evaluation?.understandingScore || 0,
        averageEmotionalScale: avgEmotionalScale,
        toxicityFlags,
      };
    });

    const avgUnderstanding = participantStats.reduce(
      (sum, p) => sum + p.understandingScore, 0
    ) / participantStats.length;

    return {
      question: meeting.question,
      averageUnderstanding,
      participantStats,
    };
  }
}
