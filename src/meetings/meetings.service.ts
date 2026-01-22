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
    // Allow all logged-in users to see all meetings
    const query: any = {};

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

  async findOne(id: string, userId: string): Promise<MeetingDocument> {
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

    // Allow all logged-in users to view any meeting
    // No participant check needed

    return meeting;
  }

  async update(id: string, updateMeetingDto: UpdateMeetingDto, userId: string): Promise<MeetingDocument> {
    const meeting = await this.findOne(id, userId);

    // Only creator can update meeting
    const creatorId = (meeting.creatorId as any)?._id || meeting.creatorId;
    if (!creatorId.equals(new Types.ObjectId(userId))) {
      throw new ForbiddenException('Only the meeting creator can update the meeting');
    }

    if (updateMeetingDto.participantIds) {
      (updateMeetingDto as any).participantIds = updateMeetingDto.participantIds.map(
        id => new Types.ObjectId(id)
      );
    }

    Object.assign(meeting, updateMeetingDto);
    return meeting.save();
  }

  async remove(id: string, userId: string): Promise<void> {
    const meeting = await this.findOne(id, userId);

    // Only creator can delete meeting
    const creatorId = (meeting.creatorId as any)?._id || meeting.creatorId;
    if (!creatorId.equals(new Types.ObjectId(userId))) {
      throw new ForbiddenException('Only the meeting creator can delete the meeting');
    }

    await this.meetingModel.findByIdAndDelete(id);
  }

  async changePhase(id: string, changePhaseDto: ChangePhaseDto, userId: string): Promise<MeetingDocument> {
    const meeting = await this.findOne(id, userId);

    // Only creator can change phase
    const creatorId = (meeting.creatorId as any)?._id || meeting.creatorId;
    if (!creatorId.equals(new Types.ObjectId(userId))) {
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
  ): Promise<MeetingDocument> {
    const meeting = await this.findOne(id, userId);

    // Check if meeting is in evaluation phase
    if (meeting.currentPhase !== MeetingPhase.EVALUATION) {
      throw new BadRequestException('Meeting is not in evaluation phase');
    }

    const userObjectId = new Types.ObjectId(userId);

    // Remove existing evaluation from this user if any
    meeting.evaluations = (meeting.evaluations as any[]).filter(
      (e: any) => {
        const participantId = e.participantId?._id || e.participantId;
        return !participantId.equals(userObjectId);
      }
    );

    // Add new evaluation
    (meeting.evaluations as any[]).push({
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
    });

    return meeting.save();
  }

  async submitSummary(
    id: string, 
    summaryDto: SubmitSummaryDto, 
    userId: string
  ): Promise<MeetingDocument> {
    const meeting = await this.findOne(id, userId);

    // Check if meeting is in summary phase
    if (meeting.currentPhase !== MeetingPhase.SUMMARY) {
      throw new BadRequestException('Meeting is not in summary phase');
    }

    const userObjectId = new Types.ObjectId(userId);

    // Remove existing summary from this user if any
    meeting.summaries = (meeting.summaries as any[]).filter(
      (s: any) => {
        const participantId = s.participantId?._id || s.participantId;
        return !participantId.equals(userObjectId);
      }
    );

    // Add new summary
    (meeting.summaries as any[]).push({
      participantId: userObjectId,
      taskDescription: summaryDto.taskDescription,
      deadline: new Date(summaryDto.deadline),
      contributionImportance: summaryDto.contributionImportance,
      submittedAt: new Date(),
    });

    return meeting.save();
  }

  async getStatistics(id: string, userId: string) {
    const meeting = await this.findOne(id, userId);

    if (meeting.status !== MeetingStatus.FINISHED) {
      throw new BadRequestException('Statistics are only available for finished meetings');
    }

    // Calculate statistics
    const participants = meeting.participantIds as any[];
    const participantStats = participants.map((participant: any) => {
      const participantId = participant._id || participant;
      
      // Find participant's evaluation
      const evaluation = (meeting.evaluations as any[]).find((e: any) => {
        const evalParticipantId = e.participantId?._id || e.participantId;
        return evalParticipantId.equals(participantId);
      });

      // Get emotional evaluations received by this participant
      const emotionalScores = (meeting.evaluations as any[]).flatMap((e: any) =>
        (e.emotionalEvaluations || [])
          .filter((ee: any) => {
            const targetId = ee.targetParticipantId?._id || ee.targetParticipantId;
            return targetId.equals(participantId);
          })
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
          _id: participant._id || participant,
          fullName: participant.fullName,
          email: participant.email,
        },
        understandingScore: evaluation?.understandingScore || 0,
        averageEmotionalScale: avgEmotionalScale,
        toxicityFlags,
      };
    });

    const avgUnderstanding = participantStats.length > 0
      ? participantStats.reduce((sum, p) => sum + p.understandingScore, 0) / participantStats.length
      : 0;

    return {
      question: meeting.question,
      avgUnderstanding,
      participantStats,
    };
  }
}
