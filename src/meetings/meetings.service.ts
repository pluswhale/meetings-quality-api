import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Meeting, MeetingDocument, MeetingPhase, MeetingStatus } from './schemas/meeting.schema';
import { Task, TaskDocument } from '../tasks/schemas/task.schema';
import { CreateMeetingDto } from './dto/create-meeting.dto';
import { UpdateMeetingDto } from './dto/update-meeting.dto';
import { ChangePhaseDto } from './dto/change-phase.dto';
import { SubmitEmotionalEvaluationDto } from './dto/submit-emotional-evaluation.dto';
import { SubmitUnderstandingContributionDto } from './dto/submit-understanding-contribution.dto';
import { SubmitTaskPlanningDto } from './dto/submit-task-planning.dto';
import { SubmitTaskEvaluationDto } from './dto/submit-task-evaluation.dto';
import { MeetingsGateway } from './meetings.gateway';

@Injectable()
export class MeetingsService {
  constructor(
    @InjectModel(Meeting.name) private meetingModel: Model<MeetingDocument>,
    @InjectModel(Task.name) private taskModel: Model<TaskDocument>,
    private meetingsGateway: MeetingsGateway,
  ) {}

  private transformMeetingResponse(meeting: any): any {
    // Transform nested populated fields to just IDs
    const transformId = (field: any) => {
      if (!field) return field;
      return (field._id || field).toString();
    };

    const transformEvaluation = (evaluation: any) => ({
      participantId: transformId(evaluation.participantId),
      evaluations: (evaluation.evaluations || []).map((e: any) => ({
        targetParticipantId: transformId(e.targetParticipantId),
        emotionalScale: e.emotionalScale,
        isToxic: e.isToxic,
      })),
      submittedAt: evaluation.submittedAt,
    });

    const transformContribution = (contribution: any) => ({
      participantId: transformId(contribution.participantId),
      understandingScore: contribution.understandingScore,
      contributions: (contribution.contributions || []).map((c: any) => ({
        participantId: transformId(c.participantId),
        contributionPercentage: c.contributionPercentage,
      })),
      submittedAt: contribution.submittedAt,
    });

    const transformTaskPlanning = (task: any) => ({
      participantId: transformId(task.participantId),
      taskDescription: task.taskDescription,
      commonQuestion: task.commonQuestion,
      deadline: task.deadline,
      expectedContributionPercentage: task.expectedContributionPercentage,
      submittedAt: task.submittedAt,
    });

    const transformTaskEvaluation = (evaluation: any) => ({
      participantId: transformId(evaluation.participantId),
      evaluations: (evaluation.evaluations || []).map((e: any) => ({
        taskAuthorId: transformId(e.taskAuthorId),
        importanceScore: e.importanceScore,
      })),
      submittedAt: evaluation.submittedAt,
    });

    return {
      _id: meeting._id.toString(),
      title: meeting.title,
      question: meeting.question,
      creatorId: transformId(meeting.creatorId),
      participantIds: (meeting.participantIds || []).map(transformId),
      activeParticipantIds: (meeting.activeParticipants || []).map((ap: any) =>
        transformId(ap.participantId),
      ),
      currentPhase: meeting.currentPhase,
      status: meeting.status,
      emotionalEvaluations: (meeting.emotionalEvaluations || []).map(transformEvaluation),
      understandingContributions: (meeting.understandingContributions || []).map(
        transformContribution,
      ),
      taskPlannings: (meeting.taskPlannings || []).map(transformTaskPlanning),
      taskEvaluations: (meeting.taskEvaluations || []).map(transformTaskEvaluation),
      createdAt: meeting.createdAt,
      updatedAt: meeting.updatedAt,
      __v: meeting.__v,
    };
  }

  async create(createMeetingDto: CreateMeetingDto, userId: string): Promise<Meeting> {
    const participantIds =
      createMeetingDto.participantIds?.map((id) => new Types.ObjectId(id)) || [];
    const creatorObjectId = new Types.ObjectId(userId);

    // Add creator to participants if not already included
    if (!participantIds.some((id) => id.equals(creatorObjectId))) {
      participantIds.push(creatorObjectId);
    }

    const createdMeeting = new this.meetingModel({
      title: createMeetingDto.title,
      question: createMeetingDto.question,
      creatorId: creatorObjectId,
      participantIds,
      currentPhase: MeetingPhase.EMOTIONAL_EVALUATION,
      status: MeetingStatus.UPCOMING,
    });

    const saved = await createdMeeting.save();
    return this.transformMeetingResponse(saved);
  }

  async findAll(userId: string, filter?: 'current' | 'past'): Promise<any[]> {
    // Allow all logged-in users to see all meetings
    const query: any = {};

    if (filter === 'current') {
      query.status = { $in: [MeetingStatus.UPCOMING, MeetingStatus.ACTIVE] };
    } else if (filter === 'past') {
      query.status = MeetingStatus.FINISHED;
    }

    const meetings = await this.meetingModel
      .find(query)
      .populate('creatorId', 'fullName email')
      .populate('participantIds', 'fullName email')
      .sort({ createdAt: -1 })
      .exec();

    return meetings.map((m) => this.transformMeetingResponse(m));
  }

  private async findOneInternal(id: string, userId: string): Promise<MeetingDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid meeting ID');
    }

    const meeting = await this.meetingModel
      .findById(id)
      .populate('creatorId', 'fullName email')
      .populate('participantIds', 'fullName email')
      .populate('activeParticipants.participantId', 'fullName email')
      .populate('emotionalEvaluations.participantId', 'fullName email')
      .populate('emotionalEvaluations.evaluations.targetParticipantId', 'fullName email')
      .populate('understandingContributions.participantId', 'fullName email')
      .populate('understandingContributions.contributions.participantId', 'fullName email')
      .populate('taskPlannings.participantId', 'fullName email')
      .exec();

    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }

    // Allow all logged-in users to view any meeting
    // No participant check needed

    return meeting;
  }

  async findOne(id: string, userId: string): Promise<any> {
    const meeting = await this.findOneInternal(id, userId);
    return this.transformMeetingResponse(meeting);
  }

  async update(id: string, updateMeetingDto: UpdateMeetingDto, userId: string): Promise<any> {
    const meeting = await this.findOneInternal(id, userId);

    // Only creator can update meeting
    const creatorId = (meeting.creatorId as any)?._id || meeting.creatorId;
    if (!creatorId.equals(new Types.ObjectId(userId))) {
      throw new ForbiddenException('Only the meeting creator can update the meeting');
    }

    if (updateMeetingDto.participantIds) {
      (updateMeetingDto as any).participantIds = updateMeetingDto.participantIds.map(
        (id) => new Types.ObjectId(id),
      );
    }

    Object.assign(meeting, updateMeetingDto);
    const saved = await meeting.save();
    return this.transformMeetingResponse(saved);
  }

  async remove(id: string, userId: string): Promise<void> {
    const meeting = await this.findOneInternal(id, userId);

    // Only creator can delete meeting
    const creatorId = (meeting.creatorId as any)?._id || meeting.creatorId;
    if (!creatorId.equals(new Types.ObjectId(userId))) {
      throw new ForbiddenException('Only the meeting creator can delete the meeting');
    }

    await this.meetingModel.findByIdAndDelete(id);
  }

  async changePhase(id: string, changePhaseDto: ChangePhaseDto, userId: string): Promise<any> {
    const meeting = await this.findOneInternal(id, userId);

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

    return this.transformMeetingResponse(meeting);
  }

  async submitEmotionalEvaluation(
    id: string,
    evaluationDto: SubmitEmotionalEvaluationDto,
    userId: string,
  ): Promise<any> {
    const meeting = await this.findOneInternal(id, userId);

    // Check if meeting is in emotional evaluation phase
    if (meeting.currentPhase !== MeetingPhase.EMOTIONAL_EVALUATION) {
      throw new BadRequestException('Meeting is not in emotional evaluation phase');
    }

    const userObjectId = new Types.ObjectId(userId);
    const creatorId = (meeting.creatorId as any)?._id || meeting.creatorId;

    // Creator cannot submit evaluations
    if (creatorId.equals(userObjectId)) {
      throw new ForbiddenException(
        'Meeting creator cannot submit evaluations, only participants can',
      );
    }

    // Remove existing evaluation from this user if any
    meeting.emotionalEvaluations = (meeting.emotionalEvaluations as any[]).filter((e: any) => {
      const participantId = e.participantId?._id || e.participantId;
      return !participantId.equals(userObjectId);
    });

    // Add new emotional evaluation
    (meeting.emotionalEvaluations as any[]).push({
      participantId: userObjectId,
      evaluations: evaluationDto.evaluations.map((evaluation) => ({
        targetParticipantId: new Types.ObjectId(evaluation.targetParticipantId),
        emotionalScale: evaluation.emotionalScale,
        isToxic: evaluation.isToxic,
      })),
      submittedAt: new Date(),
    });

    const saved = await meeting.save();
    return this.transformMeetingResponse(saved);
  }

  async submitUnderstandingContribution(
    id: string,
    contributionDto: SubmitUnderstandingContributionDto,
    userId: string,
  ): Promise<any> {
    const meeting = await this.findOneInternal(id, userId);

    // Check if meeting is in understanding contribution phase
    if (meeting.currentPhase !== MeetingPhase.UNDERSTANDING_CONTRIBUTION) {
      throw new BadRequestException('Meeting is not in understanding contribution phase');
    }

    const userObjectId = new Types.ObjectId(userId);
    const creatorId = (meeting.creatorId as any)?._id || meeting.creatorId;

    // Creator cannot submit contributions
    if (creatorId.equals(userObjectId)) {
      throw new ForbiddenException(
        'Meeting creator cannot submit contributions, only participants can',
      );
    }

    // Remove existing contribution from this user if any
    meeting.understandingContributions = (meeting.understandingContributions as any[]).filter(
      (c: any) => {
        const participantId = c.participantId?._id || c.participantId;
        return !participantId.equals(userObjectId);
      },
    );

    // Add new understanding contribution
    (meeting.understandingContributions as any[]).push({
      participantId: userObjectId,
      understandingScore: contributionDto.understandingScore,
      contributions: contributionDto.contributions.map((contrib) => ({
        participantId: new Types.ObjectId(contrib.participantId),
        contributionPercentage: contrib.contributionPercentage,
      })),
      submittedAt: new Date(),
    });

    const saved = await meeting.save();
    return this.transformMeetingResponse(saved);
  }

  async submitTaskPlanning(
    id: string,
    taskDto: SubmitTaskPlanningDto,
    userId: string,
  ): Promise<any> {
    const meeting = await this.findOneInternal(id, userId);

    // Check if meeting is in task planning phase
    if (meeting.currentPhase !== MeetingPhase.TASK_PLANNING) {
      throw new BadRequestException('Meeting is not in task planning phase');
    }

    const userObjectId = new Types.ObjectId(userId);
    const creatorId = (meeting.creatorId as any)?._id || meeting.creatorId;

    // Creator cannot submit tasks
    if (creatorId.equals(userObjectId)) {
      throw new ForbiddenException('Meeting creator cannot submit tasks, only participants can');
    }

    // Remove existing task from this user if any
    meeting.taskPlannings = (meeting.taskPlannings as any[]).filter((t: any) => {
      const participantId = t.participantId?._id || t.participantId;
      return !participantId.equals(userObjectId);
    });

    // Add new task planning
    (meeting.taskPlannings as any[]).push({
      participantId: userObjectId,
      taskDescription: taskDto.taskDescription,
      commonQuestion: taskDto.commonQuestion,
      deadline: new Date(taskDto.deadline),
      expectedContributionPercentage: taskDto.expectedContributionPercentage,
      submittedAt: new Date(),
    });

    // Create a Task document in the tasks collection
    const createdTask = new this.taskModel({
      description: taskDto.taskDescription,
      commonQuestion: taskDto.commonQuestion,
      authorId: userObjectId,
      meetingId: new Types.ObjectId(id),
      deadline: new Date(taskDto.deadline),
      contributionImportance: taskDto.expectedContributionPercentage,
      isCompleted: false,
    });

    await createdTask.save();

    const saved = await meeting.save();
    return this.transformMeetingResponse(saved);
  }

  async submitTaskEvaluation(
    id: string,
    evaluationDto: SubmitTaskEvaluationDto,
    userId: string,
  ): Promise<any> {
    const meeting = await this.findOneInternal(id, userId);

    // Check if meeting is in the correct phase
    if (meeting.currentPhase !== MeetingPhase.TASK_EVALUATION) {
      throw new BadRequestException('Meeting is not in task evaluation phase');
    }

    const userObjectId = new Types.ObjectId(userId);

    // Check if user is a participant (all participants including creator can evaluate)
    const isParticipant = (meeting.participantIds as any[]).some((pId: any) => {
      const participantId = pId._id || pId;
      return participantId.equals(userObjectId);
    });

    const isCreator = (meeting.creatorId._id || meeting.creatorId).equals(userObjectId);

    if (!isParticipant && !isCreator) {
      throw new ForbiddenException('Only participants and creator can submit task evaluations');
    }

    // Check if user already submitted
    const existingEvaluation = (meeting.taskEvaluations as any[]).find((evaluation: any) => {
      const evalParticipantId = evaluation.participantId?._id || evaluation.participantId;
      return evalParticipantId.equals(userObjectId);
    });

    if (existingEvaluation) {
      throw new BadRequestException('You have already submitted task evaluations');
    }

    // Validate that all task author IDs exist in taskPlannings
    const taskAuthorIds = (meeting.taskPlannings as any[]).map((task: any) => {
      const authorId = task.participantId?._id || task.participantId;
      return authorId.toString();
    });

    for (const evaluation of evaluationDto.evaluations) {
      if (!taskAuthorIds.includes(evaluation.taskAuthorId)) {
        throw new BadRequestException(
          `Task author ${evaluation.taskAuthorId} not found in task plannings`,
        );
      }
    }

    // Add new task evaluation
    (meeting.taskEvaluations as any[]).push({
      participantId: userObjectId,
      evaluations: evaluationDto.evaluations.map((evaluation) => ({
        taskAuthorId: new Types.ObjectId(evaluation.taskAuthorId),
        importanceScore: evaluation.importanceScore,
      })),
      submittedAt: new Date(),
    });

    const saved = await meeting.save();
    return this.transformMeetingResponse(saved);
  }

  async joinMeeting(id: string, userId: string): Promise<any> {
    const meeting = await this.findOneInternal(id, userId);
    const userObjectId = new Types.ObjectId(userId);

    // Check if user is a participant
    const isParticipant = (meeting.participantIds as any[]).some((pId: any) => {
      const participantId = pId._id || pId;
      return participantId.equals(userObjectId);
    });

    if (!isParticipant) {
      throw new ForbiddenException('Only participants can join the meeting');
    }

    const now = new Date();

    // Check if already active
    const existingIndex = (meeting.activeParticipants as any[]).findIndex((ap: any) => {
      const apId = ap.participantId?._id || ap.participantId;
      return apId.equals(userObjectId);
    });

    if (existingIndex >= 0) {
      // Update lastSeen
      (meeting.activeParticipants as any[])[existingIndex].lastSeen = now;
    } else {
      // Add new active participant
      (meeting.activeParticipants as any[]).push({
        participantId: userObjectId,
        joinedAt: now,
        lastSeen: now,
      });
    }

    await meeting.save();

    // Emit WebSocket event
    this.meetingsGateway.emitParticipantJoined(id, userId);

    // Get populated active participants for response
    const populatedMeeting = await this.findOneInternal(id, userId);
    const activeParticipants = (populatedMeeting.activeParticipants as any[]).map((ap: any) => ({
      _id: (ap.participantId?._id || ap.participantId).toString(),
      fullName: ap.participantId?.fullName || null,
      email: ap.participantId?.email || null,
      isActive: true,
      joinedAt: ap.joinedAt,
      lastSeen: ap.lastSeen,
    }));

    return {
      meetingId: id,
      userId,
      joinedAt: now,
      activeParticipants,
    };
  }

  async leaveMeeting(id: string, userId: string): Promise<any> {
    const meeting = await this.findOneInternal(id, userId);
    const userObjectId = new Types.ObjectId(userId);

    // Remove from active participants
    meeting.activeParticipants = (meeting.activeParticipants as any[]).filter((ap: any) => {
      const apId = ap.participantId?._id || ap.participantId;
      return !apId.equals(userObjectId);
    });

    await meeting.save();

    // Emit WebSocket event
    this.meetingsGateway.emitParticipantLeft(id, userId);

    return { success: true };
  }

  async getActiveParticipants(id: string, userId: string): Promise<any> {
    const meeting = await this.findOneInternal(id, userId);

    // Map active participants with details
    const activeParticipants = (meeting.activeParticipants as any[]).map((ap: any) => ({
      _id: (ap.participantId?._id || ap.participantId).toString(),
      fullName: ap.participantId?.fullName || null,
      email: ap.participantId?.email || null,
      isActive: true,
      joinedAt: ap.joinedAt,
      lastSeen: ap.lastSeen,
    }));

    const totalParticipants = (meeting.participantIds || []).length;
    const activeCount = activeParticipants.length;

    return {
      meetingId: id,
      activeParticipants,
      totalParticipants,
      activeCount,
    };
  }

  async getAllSubmissions(id: string, userId: string): Promise<any> {
    const meeting = await this.findOneInternal(id, userId);

    // Only creator can view all submissions
    const creatorId = (meeting.creatorId as any)?._id || meeting.creatorId;
    if (!creatorId.equals(new Types.ObjectId(userId))) {
      throw new ForbiddenException('Only the meeting creator can view all submissions');
    }

    const submissions: any = {};

    // Emotional Evaluations
    submissions.emotional_evaluation = {};
    (meeting.emotionalEvaluations as any[]).forEach((evaluation: any) => {
      const participantId = (evaluation.participantId?._id || evaluation.participantId).toString();
      submissions.emotional_evaluation[participantId] = {
        participant: {
          _id: participantId,
          fullName: evaluation.participantId?.fullName || null,
          email: evaluation.participantId?.email || null,
        },
        submitted: true,
        submittedAt: evaluation.submittedAt,
        evaluations: (evaluation.evaluations || []).map((e: any) => ({
          targetParticipant: {
            _id: (e.targetParticipantId?._id || e.targetParticipantId).toString(),
            fullName: e.targetParticipantId?.fullName || null,
          },
          emotionalScale: e.emotionalScale,
          isToxic: e.isToxic,
        })),
      };
    });

    // Understanding Contributions
    submissions.understanding_contribution = {};
    (meeting.understandingContributions as any[]).forEach((contrib: any) => {
      const participantId = (contrib.participantId?._id || contrib.participantId).toString();
      submissions.understanding_contribution[participantId] = {
        participant: {
          _id: participantId,
          fullName: contrib.participantId?.fullName || null,
          email: contrib.participantId?.email || null,
        },
        submitted: true,
        submittedAt: contrib.submittedAt,
        understandingScore: contrib.understandingScore,
        contributions: (contrib.contributions || []).map((c: any) => ({
          participant: {
            _id: (c.participantId?._id || c.participantId).toString(),
            fullName: c.participantId?.fullName || null,
          },
          contributionPercentage: c.contributionPercentage,
        })),
      };
    });

    // Task Planning
    submissions.task_planning = {};
    (meeting.taskPlannings as any[]).forEach((task: any) => {
      const participantId = (task.participantId?._id || task.participantId).toString();
      submissions.task_planning[participantId] = {
        participant: {
          _id: participantId,
          fullName: task.participantId?.fullName || null,
          email: task.participantId?.email || null,
        },
        submitted: true,
        submittedAt: task.submittedAt,
        taskDescription: task.taskDescription,
        commonQuestion: task.commonQuestion,
        deadline: task.deadline,
        expectedContributionPercentage: task.expectedContributionPercentage,
      };
    });

    // Task Evaluation
    submissions.task_evaluation = {};
    (meeting.taskEvaluations as any[]).forEach((evaluation: any) => {
      const participantId = (evaluation.participantId?._id || evaluation.participantId).toString();
      submissions.task_evaluation[participantId] = {
        participant: {
          _id: participantId,
          fullName: evaluation.participantId?.fullName || null,
          email: evaluation.participantId?.email || null,
        },
        submitted: true,
        submittedAt: evaluation.submittedAt,
        evaluations: (evaluation.evaluations || []).map((e: any) => ({
          taskAuthor: {
            _id: (e.taskAuthorId?._id || e.taskAuthorId).toString(),
            fullName: e.taskAuthorId?.fullName || null,
          },
          importanceScore: e.importanceScore,
        })),
      };
    });

    return {
      meetingId: id,
      submissions,
    };
  }

  async getVotingInfo(id: string, userId: string) {
    const meeting = await this.findOneInternal(id, userId);

    // Only creator can view voting information
    const creatorId = (meeting.creatorId as any)?._id || meeting.creatorId;
    if (!creatorId.equals(new Types.ObjectId(userId))) {
      throw new ForbiddenException('Only the meeting creator can view voting information');
    }

    const participants = meeting.participantIds as any[];
    const participantList = participants.map((p: any) => ({
      _id: (p._id || p).toString(),
      fullName: p.fullName,
      email: p.email,
    }));

    // Get submission status for current phase
    let submissionStatus: any = {};

    switch (meeting.currentPhase) {
      case MeetingPhase.EMOTIONAL_EVALUATION:
        submissionStatus = {
          phase: MeetingPhase.EMOTIONAL_EVALUATION,
          submitted: (meeting.emotionalEvaluations as any[]).map((e: any) => {
            const participantId = e.participantId?._id || e.participantId;
            return participantId.toString();
          }),
        };
        break;

      case MeetingPhase.UNDERSTANDING_CONTRIBUTION:
        submissionStatus = {
          phase: MeetingPhase.UNDERSTANDING_CONTRIBUTION,
          submitted: (meeting.understandingContributions as any[]).map((c: any) => {
            const participantId = c.participantId?._id || c.participantId;
            return participantId.toString();
          }),
        };
        break;

      case MeetingPhase.TASK_PLANNING:
        submissionStatus = {
          phase: MeetingPhase.TASK_PLANNING,
          submitted: (meeting.taskPlannings as any[]).map((t: any) => {
            const participantId = t.participantId?._id || t.participantId;
            return participantId.toString();
          }),
        };
        break;

      default:
        submissionStatus = {
          phase: meeting.currentPhase,
          submitted: [],
        };
    }

    // Get active participants (currently in the meeting room)
    const activeParticipants = (meeting.activeParticipants as any[]).map((ap: any) => ({
      _id: (ap.participantId?._id || ap.participantId).toString(),
      fullName: ap.participantId?.fullName || null,
      email: ap.participantId?.email || null,
      joinedAt: ap.joinedAt,
      lastSeen: ap.lastSeen,
    }));

    return {
      meetingId: id,
      currentPhase: meeting.currentPhase,
      participants: participantList,
      activeParticipants,
      submissionStatus,
    };
  }

  async getPhaseSubmissions(id: string, userId: string) {
    const meeting = await this.findOneInternal(id, userId);

    // Only creator can view detailed submissions
    const creatorId = (meeting.creatorId as any)?._id || meeting.creatorId;
    if (!creatorId.equals(new Types.ObjectId(userId))) {
      throw new ForbiddenException('Only the meeting creator can view detailed submissions');
    }

    const participants = meeting.participantIds as any[];
    const participantList = participants
      .filter((p: any) => {
        const pId = (p._id || p).toString();
        const cId = creatorId.toString();
        return pId !== cId; // Exclude creator from participants list
      })
      .map((p: any) => ({
        _id: (p._id || p).toString(),
        fullName: p.fullName,
        email: p.email,
      }));

    return {
      meetingId: id,
      title: meeting.title,
      question: meeting.question,
      currentPhase: meeting.currentPhase,
      status: meeting.status,
      participants: participantList,
      emotionalEvaluations: (meeting.emotionalEvaluations as any[]).map((e: any) => ({
        participantId: (e.participantId?._id || e.participantId).toString(),
        participant: e.participantId?.fullName
          ? { fullName: e.participantId.fullName, email: e.participantId.email }
          : null,
        evaluations: (e.evaluations || []).map((evaluation: any) => ({
          targetParticipantId: (
            evaluation.targetParticipantId?._id || evaluation.targetParticipantId
          ).toString(),
          targetParticipant: evaluation.targetParticipantId?.fullName
            ? {
                fullName: evaluation.targetParticipantId.fullName,
                email: evaluation.targetParticipantId.email,
              }
            : null,
          emotionalScale: evaluation.emotionalScale,
          isToxic: evaluation.isToxic,
        })),
        submittedAt: e.submittedAt,
      })),
      understandingContributions: (meeting.understandingContributions as any[]).map((c: any) => ({
        participantId: (c.participantId?._id || c.participantId).toString(),
        participant: c.participantId?.fullName
          ? { fullName: c.participantId.fullName, email: c.participantId.email }
          : null,
        understandingScore: c.understandingScore,
        contributions: (c.contributions || []).map((contrib: any) => ({
          participantId: (contrib.participantId?._id || contrib.participantId).toString(),
          participant: contrib.participantId?.fullName
            ? { fullName: contrib.participantId.fullName, email: contrib.participantId.email }
            : null,
          contributionPercentage: contrib.contributionPercentage,
        })),
        submittedAt: c.submittedAt,
      })),
      taskPlannings: (meeting.taskPlannings as any[]).map((t: any) => ({
        participantId: (t.participantId?._id || t.participantId).toString(),
        participant: t.participantId?.fullName
          ? { fullName: t.participantId.fullName, email: t.participantId.email }
          : null,
        taskDescription: t.taskDescription,
        commonQuestion: t.commonQuestion,
        deadline: t.deadline,
        expectedContributionPercentage: t.expectedContributionPercentage,
        submittedAt: t.submittedAt,
      })),
    };
  }

  async getStatistics(id: string, userId: string) {
    const meeting = await this.findOneInternal(id, userId);

    if (meeting.status !== MeetingStatus.FINISHED) {
      throw new BadRequestException('Statistics are only available for finished meetings');
    }

    // Calculate statistics
    const participants = meeting.participantIds as any[];
    const participantStats = participants.map((participant: any) => {
      const participantId = participant._id || participant;

      // Find participant's understanding contribution
      const understanding = (meeting.understandingContributions as any[]).find((c: any) => {
        const contribParticipantId = c.participantId?._id || c.participantId;
        return contribParticipantId.equals(participantId);
      });

      // Get emotional evaluations received by this participant
      const emotionalScores = (meeting.emotionalEvaluations as any[]).flatMap((e: any) =>
        (e.evaluations || [])
          .filter((ee: any) => {
            const targetId = ee.targetParticipantId?._id || ee.targetParticipantId;
            return targetId.equals(participantId);
          })
          .map((ee: any) => ({
            emotionalScale: ee.emotionalScale,
            isToxic: ee.isToxic,
          })),
      );

      const avgEmotionalScale =
        emotionalScores.length > 0
          ? emotionalScores.reduce((sum, e) => sum + e.emotionalScale, 0) / emotionalScores.length
          : 0;

      const toxicityFlags = emotionalScores.filter((e) => e.isToxic).length;

      // Get contribution percentages from all participants
      const contributions = (meeting.understandingContributions as any[])
        .flatMap((c: any) => c.contributions || [])
        .filter((contrib: any) => {
          const contribId = contrib.participantId?._id || contrib.participantId;
          return contribId.equals(participantId);
        });

      const avgContribution =
        contributions.length > 0
          ? contributions.reduce((sum: number, c: any) => sum + c.contributionPercentage, 0) /
            contributions.length
          : 0;

      return {
        participant: {
          _id: participant._id || participant,
          fullName: participant.fullName,
          email: participant.email,
        },
        understandingScore: understanding?.understandingScore || 0,
        averageEmotionalScale: avgEmotionalScale,
        toxicityFlags,
        averageContribution: avgContribution,
      };
    });

    const avgUnderstanding =
      participantStats.length > 0
        ? participantStats.reduce((sum, p) => sum + p.understandingScore, 0) /
          participantStats.length
        : 0;

    return {
      question: meeting.question,
      avgUnderstanding,
      participantStats,
    };
  }

  async getTaskEvaluationAnalytics(id: string, userId: string) {
    const meeting = await this.findOneInternal(id, userId);

    // Check if user is the creator
    const creatorId = meeting.creatorId._id || meeting.creatorId;
    const userObjectId = new Types.ObjectId(userId);

    if (!creatorId.equals(userObjectId)) {
      throw new ForbiddenException('Only the creator can view task evaluation analytics');
    }

    // Check if meeting has task evaluations
    if ((meeting.taskEvaluations as any[]).length === 0) {
      return {
        meetingId: id,
        message: 'No task evaluations submitted yet',
        taskAnalytics: [],
      };
    }

    // Build analytics for each task
    const taskAnalytics = (meeting.taskPlannings as any[]).map((task: any) => {
      const taskAuthorId = (task.participantId?._id || task.participantId).toString();
      
      // Get all evaluations for this task
      const evaluationsForTask: number[] = [];
      (meeting.taskEvaluations as any[]).forEach((evaluation: any) => {
        const evalForThisTask = (evaluation.evaluations || []).find((e: any) => {
          const authorId = (e.taskAuthorId?._id || e.taskAuthorId).toString();
          return authorId === taskAuthorId;
        });
        
        if (evalForThisTask) {
          evaluationsForTask.push(evalForThisTask.importanceScore);
        }
      });

      // Calculate statistics
      const averageScore =
        evaluationsForTask.length > 0
          ? evaluationsForTask.reduce((sum, score) => sum + score, 0) / evaluationsForTask.length
          : 0;

      const minScore = evaluationsForTask.length > 0 ? Math.min(...evaluationsForTask) : 0;
      const maxScore = evaluationsForTask.length > 0 ? Math.max(...evaluationsForTask) : 0;

      // Calculate median
      let medianScore = 0;
      if (evaluationsForTask.length > 0) {
        const sorted = [...evaluationsForTask].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        medianScore =
          sorted.length % 2 !== 0
            ? sorted[mid]
            : (sorted[mid - 1] + sorted[mid]) / 2;
      }

      return {
        taskAuthor: {
          _id: taskAuthorId,
          fullName: task.participantId?.fullName || null,
          email: task.participantId?.email || null,
        },
        taskDescription: task.taskDescription,
        commonQuestion: task.commonQuestion,
        deadline: task.deadline,
        originalContributionPercentage: task.expectedContributionPercentage,
        evaluations: {
          count: evaluationsForTask.length,
          average: Math.round(averageScore * 100) / 100,
          min: minScore,
          max: maxScore,
          median: Math.round(medianScore * 100) / 100,
          scores: evaluationsForTask,
        },
        // Comparison: how much the task was overestimated/underestimated
        evaluationDifference: Math.round((averageScore - task.expectedContributionPercentage) * 100) / 100,
      };
    });

    // Sort by average score descending (most important first)
    taskAnalytics.sort((a, b) => b.evaluations.average - a.evaluations.average);

    return {
      meetingId: id,
      meetingTitle: meeting.title,
      totalTasks: taskAnalytics.length,
      totalEvaluators: (meeting.taskEvaluations as any[]).length,
      totalParticipants: (meeting.participantIds as any[]).length,
      taskAnalytics,
    };
  }
}
