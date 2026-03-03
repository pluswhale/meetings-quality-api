import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Meeting,
  MeetingDocument,
  MeetingPhase,
  MeetingStatus,
  EmotionalEvaluation,
  UnderstandingContribution,
  TaskEvaluation,
} from './schemas/meeting.schema';
import { Task, TaskDocument } from '../tasks/schemas/task.schema';
import { CreateMeetingDto } from './dto/create-meeting.dto';
import { UpdateMeetingDto } from './dto/update-meeting.dto';
import { ChangePhaseDto } from './dto/change-phase.dto';
import { SubmitEmotionalEvaluationDto } from './dto/submit-emotional-evaluation.dto';
import { SubmitUnderstandingContributionDto } from './dto/submit-understanding-contribution.dto';
import { SubmitTaskPlanningDto } from './dto/submit-task-planning.dto';
import { SubmitTaskEvaluationDto } from './dto/submit-task-evaluation.dto';
import { MeetingsGateway } from './meetings.gateway';

import { MeetingResponseDto } from './dto/meeting-response.dto';
import {
  EmotionalSubmissionDto,
  GetMeetingSubmissionsResponseDto,
  ParticipantRefDto,
  TaskEvaluationSubmissionDto,
  TaskSubmissionDto,
  UnderstandingSubmissionDto,
} from './dto/get-submissions-response.dto';

// ─── Internal type definitions ─────────────────────────────────────────────────

/**
 * Represents a Mongoose ref field that may be either a raw ObjectId or a fully
 * populated User document. Mongoose populates refs at runtime but the static
 * schema types remain ObjectId. We cast to this union at every populate boundary
 * so all downstream logic is fully typed without resorting to `any`.
 */
interface PopulatedUser {
  _id: Types.ObjectId;
  fullName: string | null;
  email: string | null;
}

/**
 * Lean projection of Task documents used in getAllSubmissions and analytics.
 * Using .lean() avoids the overhead of hydrating full Mongoose documents
 * when we only need to read fields.
 */
interface TaskLeanDoc {
  _id: Types.ObjectId;
  authorId: Types.ObjectId;
  description: string;
  commonQuestion: string;
  estimateHours: number;
  approved: boolean;
  deadline: Date;
  contributionImportance: number;
  isCompleted: boolean;
  createdAt: Date;
}

/**
 * Typed Mongo filter used in findAll() to avoid `query: any`.
 */
interface MeetingStatusFilter {
  status?: MeetingStatus | { $in: MeetingStatus[] };
}

// ─── Module-level pure helpers ─────────────────────────────────────────────────
// No side effects, no dependency on service state — straightforward to unit-test.

function isPopulatedUser(value: unknown): value is PopulatedUser {
  return (
    typeof value === 'object' &&
    value !== null &&
    '_id' in value &&
    ('fullName' in value || 'email' in value)
  );
}

/**
 * Returns a string representation of an ObjectId field that may be populated
 * or raw. Used for equality checks (e.g. creator guard).
 */
function resolveId(field: Types.ObjectId | PopulatedUser | unknown): string {
  if (isPopulatedUser(field)) return field._id.toString();
  return String(field);
}

/**
 * Resolves a populated-or-raw user ref into the canonical ParticipantRefDto shape.
 */
function resolveUserRef(field: Types.ObjectId | PopulatedUser | unknown): ParticipantRefDto {
  if (isPopulatedUser(field)) {
    return { _id: field._id.toString(), fullName: field.fullName, email: field.email };
  }
  return { _id: String(field), fullName: null, email: null };
}

/**
 * Like resolveUserRef but omits email — used for nested refs where only the
 * name is needed (e.g. per-evaluation target refs).
 */
function resolveCompactRef(field: Types.ObjectId | PopulatedUser | unknown): {
  _id: string;
  fullName: string | null;
} {
  const ref = resolveUserRef(field);
  return { _id: ref._id, fullName: ref.fullName };
}

// ─── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class MeetingsService {
  private readonly logger = new Logger(MeetingsService.name);

  constructor(
    @InjectModel(Meeting.name) private meetingModel: Model<MeetingDocument>,
    @InjectModel(Task.name) private taskModel: Model<TaskDocument>,
    private meetingsGateway: MeetingsGateway,
  ) {}

  // ─── Authorization guard ──────────────────────────────────────────────────────

  /**
   * Throws ForbiddenException if the calling user is not the meeting creator.
   * Centralising this check eliminates the repeated `(meeting.creatorId as any)?._id || …`
   * pattern that was scattered across every write method.
   */
  private assertCreator(meeting: MeetingDocument, userId: string): void {
    if (resolveId(meeting.creatorId) !== userId) {
      throw new ForbiddenException('Only the meeting creator can perform this action');
    }
  }

  // ─── Core CRUD ────────────────────────────────────────────────────────────────

  async create(createMeetingDto: CreateMeetingDto, userId: string): Promise<MeetingResponseDto> {
    const now = new Date();
    const creatorObjectId = new Types.ObjectId(userId);

    const participantIds =
      createMeetingDto.participantIds?.map((id) => new Types.ObjectId(id)) ?? [];

    if (!participantIds.some((id) => id.equals(creatorObjectId))) {
      participantIds.push(creatorObjectId);
    }

    const upcomingDate = createMeetingDto.upcomingDate
      ? new Date(createMeetingDto.upcomingDate)
      : now;

    const status: MeetingStatus =
      upcomingDate > now ? MeetingStatus.UPCOMING : MeetingStatus.ACTIVE;

    const saved = await new this.meetingModel({
      title: createMeetingDto.title,
      question: createMeetingDto.question,
      creatorId: creatorObjectId,
      participantIds,
      currentPhase: MeetingPhase.EMOTIONAL_EVALUATION,
      status,
      upcomingDate,
    }).save();

    return this.transformMeetingResponse(saved);
  }

  async findAll(
    userId: string,
    filter?: 'current' | 'past' | 'upcoming',
  ): Promise<MeetingResponseDto[]> {
    void userId;

    const query: MeetingStatusFilter = {};
    if (filter === 'current') query.status = { $in: [MeetingStatus.ACTIVE] };
    else if (filter === 'past') query.status = MeetingStatus.FINISHED;
    else if (filter === 'upcoming') query.status = { $in: [MeetingStatus.UPCOMING] };

    const meetings = await this.meetingModel
      .find(query)
      .populate('creatorId', 'fullName email')
      .populate('participantIds', 'fullName email')
      .populate('emotionalEvaluations.participantId', 'fullName email')
      .populate('emotionalEvaluations.evaluations.targetParticipantId', 'fullName email')
      .populate('understandingContributions.participantId', 'fullName email')
      .populate('understandingContributions.contributions.participantId', 'fullName email')
      .populate('taskEvaluations.participantId', 'fullName email')
      .populate('taskEvaluations.evaluations.taskAuthorId', 'fullName email')
      .sort({ createdAt: -1 })
      .exec();

    return meetings.map((m) => this.transformMeetingResponse(m));
  }

  /**
   * Central internal fetch used by all service methods.
   * Performs all required populates in a single query so callers never need to
   * re-fetch the document after the initial load.
   */
  private async findOneInternal(id: string): Promise<MeetingDocument> {
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
      .populate('taskEvaluations.participantId', 'fullName email')
      .populate('taskEvaluations.evaluations.taskAuthorId', 'fullName email')
      .exec();

    if (!meeting) throw new NotFoundException('Meeting not found');
    return meeting;
  }

  async findOne(id: string, _userId: string): Promise<MeetingResponseDto> {
    return this.transformMeetingResponse(await this.findOneInternal(id));
  }

  async update(id: string, dto: UpdateMeetingDto, userId: string): Promise<MeetingResponseDto> {
    const meeting = await this.findOneInternal(id);
    this.assertCreator(meeting, userId);

    // Build a typed update payload instead of mutating the DTO with `as any`.
    const updatePayload: Partial<{
      title: string;
      question: string;
      participantIds: Types.ObjectId[];
    }> = {};

    if (dto.title !== undefined) updatePayload.title = dto.title;
    if (dto.question !== undefined) updatePayload.question = dto.question;
    if (dto.participantIds !== undefined) {
      updatePayload.participantIds = dto.participantIds.map((pid) => new Types.ObjectId(pid));
    }

    Object.assign(meeting, updatePayload);
    const saved = await meeting.save();
    return this.transformMeetingResponse(saved);
  }

  async remove(id: string, userId: string): Promise<void> {
    const meeting = await this.findOneInternal(id);
    this.assertCreator(meeting, userId);
    await this.meetingModel.findByIdAndDelete(id);
  }

  async changePhase(id: string, dto: ChangePhaseDto, userId: string): Promise<MeetingResponseDto> {
    const meeting = await this.findOneInternal(id);
    this.assertCreator(meeting, userId);

    if (dto.phase === MeetingPhase.FINISHED) {
      meeting.status = MeetingStatus.FINISHED;
    } else if (meeting.status === MeetingStatus.UPCOMING) {
      meeting.status = MeetingStatus.ACTIVE;
    }

    meeting.currentPhase = dto.phase;
    await meeting.save();

    this.meetingsGateway.emitPhaseChange(id, { phase: dto.phase, status: meeting.status });

    return this.transformMeetingResponse(meeting);
  }

  // ─── Phase submissions ────────────────────────────────────────────────────────

  async submitEmotionalEvaluation(
    id: string,
    dto: SubmitEmotionalEvaluationDto,
    userId: string,
  ): Promise<MeetingResponseDto> {
    const meeting = await this.findOneInternal(id);
    const userObjectId = new Types.ObjectId(userId);

    // Filter then push is idempotent — resubmissions replace the previous entry.
    meeting.emotionalEvaluations = meeting.emotionalEvaluations.filter(
      (e) => resolveId(e.participantId) !== userId,
    );

    meeting.emotionalEvaluations.push({
      participantId: userObjectId,
      evaluations: dto.evaluations.map((e) => ({
        targetParticipantId: new Types.ObjectId(e.targetParticipantId),
        emotionalScale: e.emotionalScale,
        isToxic: e.isToxic ?? false,
      })),
      submittedAt: new Date(),
    } as EmotionalEvaluation);

    const saved = await meeting.save();
    this.meetingsGateway.emitMeetingUpdated(id, 'emotional_evaluation_updated', userId);
    return this.transformMeetingResponse(saved);
  }

  async submitUnderstandingContribution(
    id: string,
    dto: SubmitUnderstandingContributionDto,
    userId: string,
  ): Promise<MeetingResponseDto> {
    const meeting = await this.findOneInternal(id);
    const userObjectId = new Types.ObjectId(userId);

    meeting.understandingContributions = meeting.understandingContributions.filter(
      (c) => resolveId(c.participantId) !== userId,
    );

    meeting.understandingContributions.push({
      participantId: userObjectId,
      understandingScore: dto.understandingScore,
      contributions: dto.contributions.map((c) => ({
        participantId: new Types.ObjectId(c.participantId),
        contributionPercentage: c.contributionPercentage,
      })),
      submittedAt: new Date(),
    } as UnderstandingContribution);

    const saved = await meeting.save();
    this.meetingsGateway.emitMeetingUpdated(id, 'understanding_contribution_updated', userId);
    return this.transformMeetingResponse(saved);
  }

  /**
   * Upserts the Task document for this participant+meeting pair.
   *
   * Writing ONLY to the Task collection eliminates the dual-write bug that
   * previously kept a stale copy in Meeting.taskPlannings. The compound unique
   * index on (meetingId, authorId) makes the upsert idempotent — resubmissions
   * update the existing Task rather than creating a duplicate.
   */
  async submitTaskPlanning(
    id: string,
    dto: SubmitTaskPlanningDto,
    userId: string,
  ): Promise<MeetingResponseDto> {
    const meeting = await this.findOneInternal(id);
    const userObjectId = new Types.ObjectId(userId);

    await this.taskModel.findOneAndUpdate(
      { authorId: userObjectId, meetingId: new Types.ObjectId(id) },
      {
        description: dto.taskDescription,
        commonQuestion: dto.commonQuestion,
        deadline: new Date(dto.deadline),
        contributionImportance: dto.expectedContributionPercentage,
        isCompleted: false,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    this.meetingsGateway.emitMeetingUpdated(id, 'task_planning_updated', userId);
    return this.transformMeetingResponse(meeting);
  }

  async submitTaskEvaluation(
    id: string,
    dto: SubmitTaskEvaluationDto,
    userId: string,
  ): Promise<MeetingResponseDto> {
    const meeting = await this.findOneInternal(id);
    const userObjectId = new Types.ObjectId(userId);

    meeting.taskEvaluations = meeting.taskEvaluations.filter(
      (e) => resolveId(e.participantId) !== userId,
    );

    // Validate all referenced task authors against the Task collection in a
    // single query rather than iterating over embedded taskPlannings (which no
    // longer exist on the Meeting document).
    if (dto.evaluations.length > 0) {
      const authorObjectIds = dto.evaluations.map((e) => new Types.ObjectId(e.taskAuthorId));

      const existingTasks = await this.taskModel
        .find({ meetingId: new Types.ObjectId(id), authorId: { $in: authorObjectIds } })
        .select('authorId')
        .lean<Array<{ authorId: Types.ObjectId }>>()
        .exec();

      const validAuthorIds = new Set(existingTasks.map((t) => t.authorId.toString()));

      for (const evaluation of dto.evaluations) {
        if (!validAuthorIds.has(evaluation.taskAuthorId)) {
          throw new BadRequestException(
            `Task author ${evaluation.taskAuthorId} has no task in this meeting`,
          );
        }
      }
    }

    meeting.taskEvaluations.push({
      participantId: userObjectId,
      evaluations: dto.evaluations.map((e) => ({
        taskAuthorId: new Types.ObjectId(e.taskAuthorId),
        importanceScore: e.importanceScore,
      })),
      submittedAt: new Date(),
    } as TaskEvaluation);

    const saved = await meeting.save();
    this.meetingsGateway.emitMeetingUpdated(id, 'task_evaluation_updated', userId);
    return this.transformMeetingResponse(saved);
  }

  // ─── Presence ─────────────────────────────────────────────────────────────────

  async joinMeeting(id: string, userId: string): Promise<Record<string, unknown>> {
    const meeting = await this.findOneInternal(id);
    const userObjectId = new Types.ObjectId(userId);

    const isParticipant = (
      meeting.participantIds as unknown as Array<PopulatedUser | Types.ObjectId>
    ).some((p) => resolveId(p) === userId);

    if (!isParticipant) {
      throw new ForbiddenException('Only participants can join the meeting');
    }

    const now = new Date();
    const existingIndex = meeting.activeParticipants.findIndex(
      (ap) => resolveId(ap.participantId) === userId,
    );

    if (existingIndex >= 0) {
      meeting.activeParticipants[existingIndex].lastSeen = now;
    } else {
      meeting.activeParticipants.push({
        participantId: userObjectId,
        joinedAt: now,
        lastSeen: now,
      });
    }

    await meeting.save();
    this.meetingsGateway.emitParticipantJoined(id, userId);

    const populated = await this.findOneInternal(id);
    const activeParticipants = populated.activeParticipants.map((ap) => {
      const ref = resolveUserRef(ap.participantId);
      return { ...ref, isActive: true, joinedAt: ap.joinedAt, lastSeen: ap.lastSeen };
    });

    return { meetingId: id, userId, joinedAt: now, activeParticipants };
  }

  async leaveMeeting(id: string, userId: string): Promise<{ success: boolean }> {
    const meeting = await this.findOneInternal(id);

    meeting.activeParticipants = meeting.activeParticipants.filter(
      (ap) => resolveId(ap.participantId) !== userId,
    );

    await meeting.save();
    this.meetingsGateway.emitParticipantLeft(id, userId);
    return { success: true };
  }

  async getActiveParticipants(id: string, _userId: string): Promise<Record<string, unknown>> {
    const meeting = await this.findOneInternal(id);
    const socketParticipants = this.meetingsGateway.getActiveParticipants(id);

    const activeParticipants = socketParticipants.map((p) => ({
      _id: p.userId,
      fullName: p.fullName,
      email: p.email,
      isActive: true,
      joinedAt: p.joinedAt,
      lastSeen: p.lastSeen,
    }));

    return {
      meetingId: id,
      activeParticipants,
      totalParticipants: (meeting.participantIds ?? []).length,
      activeCount: activeParticipants.length,
      source: 'websocket',
    };
  }

  // ─── getAllSubmissions — composable mapping layer ───────────────────────────

  /**
   * Returns a typed snapshot of all phase submissions for a meeting.
   *
   * Complexity: O(n) — each collection is iterated exactly once.
   * Tasks are fetched in a single query; Map<authorId, TaskLeanDoc> provides
   * O(1) participant lookups, replacing the O(n²) nested find() that existed before.
   */
  async getAllSubmissions(id: string, userId: string): Promise<GetMeetingSubmissionsResponseDto> {
    const meeting = await this.findOneInternal(id);
    this.assertCreator(meeting, userId);

    // Single Task query — avoids the N+1 pattern from the old implementation.
    const tasks = await this.taskModel
      .find({ meetingId: new Types.ObjectId(id) })
      .select(
        '_id authorId description commonQuestion estimateHours approved deadline contributionImportance isCompleted createdAt',
      )
      .lean<TaskLeanDoc[]>()
      .exec();

    // Build O(1) lookup: participantId → ParticipantRefDto.
    const participantById = this.buildParticipantMap(meeting);

    return {
      meetingId: id,
      submissions: {
        emotional_evaluation: this.mapEmotionalEvaluations(meeting.emotionalEvaluations),
        understanding_contribution: this.mapUnderstandingContributions(
          meeting.understandingContributions,
        ),
        task_planning: this.mapTaskSubmissions(tasks, participantById),
        task_evaluation: this.mapTaskEvaluations(meeting.taskEvaluations),
      },
    };
  }

  /**
   * Builds a Map<participantIdStr, ParticipantRefDto> from the meeting's
   * populated participantIds array. Consumed by mapTaskSubmissions() to resolve
   * author names without re-querying the database.
   */
  private buildParticipantMap(meeting: MeetingDocument): Map<string, ParticipantRefDto> {
    const participants = meeting.participantIds as unknown as Array<PopulatedUser | Types.ObjectId>;

    return new Map(
      participants.map((p) => {
        const ref = resolveUserRef(p);
        return [ref._id, ref];
      }),
    );
  }

  /**
   * Maps emotional evaluation subdocuments to a record keyed by participantId.
   * Pure function: no mutation, no side effects.
   */
  private mapEmotionalEvaluations(
    evaluations: EmotionalEvaluation[],
  ): Record<string, EmotionalSubmissionDto> {
    return evaluations.reduce<Record<string, EmotionalSubmissionDto>>((acc, evaluation) => {
      const participant = resolveUserRef(evaluation.participantId);

      acc[participant._id] = {
        participant,
        submitted: true,
        submittedAt: evaluation.submittedAt,
        evaluations: evaluation.evaluations.map((e) => ({
          targetParticipant: resolveCompactRef(e.targetParticipantId),
          emotionalScale: e.emotionalScale,
          isToxic: e.isToxic,
        })),
      };

      return acc;
    }, {});
  }

  /**
   * Maps understanding/contribution subdocuments to a record keyed by participantId.
   * Pure function: no mutation, no side effects.
   */
  private mapUnderstandingContributions(
    contributions: UnderstandingContribution[],
  ): Record<string, UnderstandingSubmissionDto> {
    return contributions.reduce<Record<string, UnderstandingSubmissionDto>>((acc, contrib) => {
      const participant = resolveUserRef(contrib.participantId);

      acc[participant._id] = {
        participant,
        submitted: true,
        submittedAt: contrib.submittedAt,
        understandingScore: contrib.understandingScore,
        contributions: contrib.contributions.map((c) => ({
          participant: resolveCompactRef(c.participantId),
          contributionPercentage: c.contributionPercentage,
        })),
      };

      return acc;
    }, {});
  }

  /**
   * Maps lean Task documents to a record keyed by authorId.
   *
   * Participant display names are resolved from the pre-built Map rather than
   * re-querying the database, keeping the entire operation O(n) — no nested
   * find() calls.
   */
  private mapTaskSubmissions(
    tasks: TaskLeanDoc[],
    participantById: Map<string, ParticipantRefDto>,
  ): Record<string, TaskSubmissionDto> {
    return tasks.reduce<Record<string, TaskSubmissionDto>>((acc, task) => {
      const authorId = task.authorId.toString();
      const participant = participantById.get(authorId) ?? {
        _id: authorId,
        fullName: null,
        email: null,
      };

      acc[authorId] = {
        participant,
        taskId: task._id.toString(),
        submitted: true,
        submittedAt: task.createdAt,
        description: task.description,
        commonQuestion: task.commonQuestion,
        estimateHours: task.estimateHours,
        approved: task.approved,
        deadline: task.deadline,
        contributionImportance: task.contributionImportance,
        isCompleted: task.isCompleted,
      };

      return acc;
    }, {});
  }

  /**
   * Maps task evaluation subdocuments to a record keyed by participantId.
   * Pure function: no mutation, no side effects.
   */
  private mapTaskEvaluations(
    evaluations: TaskEvaluation[],
  ): Record<string, TaskEvaluationSubmissionDto> {
    return evaluations.reduce<Record<string, TaskEvaluationSubmissionDto>>((acc, evaluation) => {
      const participant = resolveUserRef(evaluation.participantId);

      acc[participant._id] = {
        participant,
        submitted: true,
        submittedAt: evaluation.submittedAt,
        evaluations: evaluation.evaluations.map((e) => ({
          taskAuthor: resolveCompactRef(e.taskAuthorId),
          importanceScore: e.importanceScore,
        })),
      };

      return acc;
    }, {});
  }

  // ─── Voting & submission status ───────────────────────────────────────────────

  async getVotingInfo(id: string, userId: string): Promise<Record<string, unknown>> {
    const meeting = await this.findOneInternal(id);
    this.assertCreator(meeting, userId);

    const socketParticipants = this.meetingsGateway.getActiveParticipants(id);

    const activeParticipants = socketParticipants.map((p) => ({
      _id: p.userId,
      fullName: p.fullName,
      email: p.email,
      joinedAt: p.joinedAt,
      lastSeen: p.lastSeen,
    }));

    const submittedIds = await this.getSubmittedIdsForPhase(id, meeting.currentPhase, meeting);
    const submitted = submittedIds.length;
    const total = activeParticipants.length;

    return {
      meetingId: id,
      currentPhase: meeting.currentPhase,
      votingParticipants: activeParticipants,
      totalVotingParticipants: total,
      submissionStatus: { phase: meeting.currentPhase, submitted: submittedIds },
      votingProgress: {
        submitted,
        total,
        percentage: total > 0 ? Math.round((submitted / total) * 100) : 0,
      },
    };
  }

  async getPhaseSubmissions(id: string, userId: string): Promise<Record<string, unknown>> {
    const meeting = await this.findOneInternal(id);
    this.assertCreator(meeting, userId);

    const creatorId = resolveId(meeting.creatorId);

    const participants = (
      meeting.participantIds as unknown as Array<PopulatedUser | Types.ObjectId>
    )
      .filter((p) => resolveId(p) !== creatorId)
      .map((p) => resolveUserRef(p));

    // Task data lives exclusively in the Task collection.
    const tasks = await this.taskModel
      .find({ meetingId: new Types.ObjectId(id) })
      .populate('authorId', 'fullName email')
      .exec();

    return {
      meetingId: id,
      title: meeting.title,
      question: meeting.question,
      currentPhase: meeting.currentPhase,
      status: meeting.status,
      participants,
      emotionalEvaluations: meeting.emotionalEvaluations.map((e) => ({
        participantId: resolveId(e.participantId),
        participant: resolveUserRef(e.participantId),
        evaluations: e.evaluations.map((ev) => ({
          targetParticipantId: resolveId(ev.targetParticipantId),
          targetParticipant: resolveUserRef(ev.targetParticipantId),
          emotionalScale: ev.emotionalScale,
          isToxic: ev.isToxic,
        })),
        submittedAt: e.submittedAt,
      })),
      understandingContributions: meeting.understandingContributions.map((c) => ({
        participantId: resolveId(c.participantId),
        participant: resolveUserRef(c.participantId),
        understandingScore: c.understandingScore,
        contributions: c.contributions.map((contrib) => ({
          participantId: resolveId(contrib.participantId),
          participant: resolveUserRef(contrib.participantId),
          contributionPercentage: contrib.contributionPercentage,
        })),
        submittedAt: c.submittedAt,
      })),
      taskPlannings: tasks.map((task) => {
        const author = resolveUserRef(task.authorId as unknown as PopulatedUser | Types.ObjectId);
        return {
          participantId: author._id,
          participant: { fullName: author.fullName, email: author.email },
          description: task.description,
          commonQuestion: task.commonQuestion,
          deadline: task.deadline,
          contributionImportance: task.contributionImportance,
          estimateHours: task.estimateHours,
          approved: task.approved,
          submittedAt: task.createdAt,
        };
      }),
    };
  }

  async getStatistics(id: string, _userId: string): Promise<Record<string, unknown>> {
    const meeting = await this.findOneInternal(id);

    if (meeting.status !== MeetingStatus.FINISHED) {
      throw new BadRequestException('Statistics are only available for finished meetings');
    }

    const participants = meeting.participantIds as unknown as Array<PopulatedUser | Types.ObjectId>;

    const participantStats = participants.map((participant) => {
      const participantId = resolveId(participant);
      const participantRef = resolveUserRef(participant);

      const understanding = meeting.understandingContributions.find(
        (c) => resolveId(c.participantId) === participantId,
      );

      const emotionalScores = meeting.emotionalEvaluations.flatMap((e) =>
        e.evaluations
          .filter((ee) => resolveId(ee.targetParticipantId) === participantId)
          .map((ee) => ({ emotionalScale: ee.emotionalScale, isToxic: ee.isToxic })),
      );

      const avgEmotionalScale =
        emotionalScores.length > 0
          ? emotionalScores.reduce((sum, e) => sum + e.emotionalScale, 0) / emotionalScores.length
          : 0;

      const contributionsReceived = meeting.understandingContributions
        .flatMap((c) => c.contributions)
        .filter((c) => resolveId(c.participantId) === participantId);

      const avgContribution =
        contributionsReceived.length > 0
          ? contributionsReceived.reduce((sum, c) => sum + c.contributionPercentage, 0) /
            contributionsReceived.length
          : 0;

      return {
        participant: participantRef,
        understandingScore: understanding?.understandingScore ?? 0,
        averageEmotionalScale: avgEmotionalScale,
        toxicityFlags: emotionalScores.filter((e) => e.isToxic).length,
        averageContribution: avgContribution,
      };
    });

    const avgUnderstanding =
      participantStats.length > 0
        ? participantStats.reduce((sum, p) => sum + p.understandingScore, 0) /
          participantStats.length
        : 0;

    return { question: meeting.question, avgUnderstanding, participantStats };
  }

  async getTaskEvaluationAnalytics(id: string, userId: string): Promise<Record<string, unknown>> {
    const meeting = await this.findOneInternal(id);
    this.assertCreator(meeting, userId);

    if (meeting.taskEvaluations.length === 0) {
      return { meetingId: id, message: 'No task evaluations submitted yet', taskAnalytics: [] };
    }

    // Fetch task data from the authoritative Task collection.
    const tasks = await this.taskModel
      .find({ meetingId: new Types.ObjectId(id) })
      .populate('authorId', 'fullName email')
      .exec();

    // Aggregate importance scores per author in one pass: O(evaluators × evaluations_per_evaluator).
    const scoresByAuthor = meeting.taskEvaluations.reduce<Map<string, number[]>>(
      (map, evaluation) => {
        for (const e of evaluation.evaluations) {
          const authorId = resolveId(e.taskAuthorId);
          const existing = map.get(authorId) ?? [];
          existing.push(e.importanceScore);
          map.set(authorId, existing);
        }
        return map;
      },
      new Map(),
    );

    const taskAnalytics = tasks.map((task) => {
      const authorId = resolveId(task.authorId as unknown as PopulatedUser | Types.ObjectId);
      const scores = scoresByAuthor.get(authorId) ?? [];
      const avg = scores.length > 0 ? scores.reduce((s, n) => s + n, 0) / scores.length : 0;
      const min = scores.length > 0 ? Math.min(...scores) : 0;
      const max = scores.length > 0 ? Math.max(...scores) : 0;

      let median = 0;
      if (scores.length > 0) {
        const sorted = [...scores].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
      }

      return {
        taskAuthor: resolveUserRef(task.authorId as unknown as PopulatedUser | Types.ObjectId),
        description: task.description,
        commonQuestion: task.commonQuestion,
        deadline: task.deadline,
        contributionImportance: task.contributionImportance,
        evaluations: {
          count: scores.length,
          average: Math.round(avg * 100) / 100,
          min,
          max,
          median: Math.round(median * 100) / 100,
          scores,
        },
        evaluationDifference: Math.round((avg - task.contributionImportance) * 100) / 100,
      };
    });

    taskAnalytics.sort((a, b) => b.evaluations.average - a.evaluations.average);

    return {
      meetingId: id,
      meetingTitle: meeting.title,
      totalTasks: taskAnalytics.length,
      totalEvaluators: meeting.taskEvaluations.length,
      totalParticipants: meeting.participantIds.length,
      taskAnalytics,
    };
  }

  async getFinalStatistics(id: string, userId: string): Promise<Record<string, unknown>> {
    const meeting = await this.findOneInternal(id);
    this.assertCreator(meeting, userId);

    // Fetch tasks once and index by authorId for O(1) per-participant lookups.
    const tasks = await this.taskModel.find({ meetingId: new Types.ObjectId(id) }).exec();
    const taskByAuthorId = new Map(tasks.map((t) => [t.authorId.toString(), t]));

    const participants = meeting.participantIds as unknown as Array<PopulatedUser | Types.ObjectId>;

    const participantStatistics = participants.map((participant) => {
      const participantId = resolveId(participant);
      const participantInfo = resolveUserRef(participant);

      const emotionalEvaluationsGiven = meeting.emotionalEvaluations
        .filter((e) => resolveId(e.participantId) === participantId)
        .flatMap((e) =>
          e.evaluations.map((ev) => ({
            targetParticipant: resolveCompactRef(ev.targetParticipantId),
            emotionalScale: ev.emotionalScale,
            isToxic: ev.isToxic,
          })),
        );

      const emotionalEvaluationsReceived = meeting.emotionalEvaluations.flatMap((e) =>
        e.evaluations
          .filter((ev) => resolveId(ev.targetParticipantId) === participantId)
          .map((ev) => ({
            fromParticipant: resolveCompactRef(e.participantId),
            emotionalScale: ev.emotionalScale,
            isToxic: ev.isToxic,
          })),
      );

      const understandingEntry = meeting.understandingContributions.find(
        (c) => resolveId(c.participantId) === participantId,
      );

      const contributionsGiven = understandingEntry
        ? {
            understandingScore: understandingEntry.understandingScore,
            contributions: understandingEntry.contributions.map((c) => ({
              participant: resolveCompactRef(c.participantId),
              contributionPercentage: c.contributionPercentage,
            })),
            submittedAt: understandingEntry.submittedAt,
          }
        : null;

      const contributionsReceived = meeting.understandingContributions.flatMap((c) =>
        c.contributions
          .filter((contrib) => resolveId(contrib.participantId) === participantId)
          .map((contrib) => ({
            fromParticipant: resolveCompactRef(c.participantId),
            contributionPercentage: contrib.contributionPercentage,
          })),
      );

      // O(1) task lookup via pre-built Map — no nested find() inside the loop.
      const task = taskByAuthorId.get(participantId);
      const taskInfo = task
        ? {
            description: task.description,
            commonQuestion: task.commonQuestion,
            deadline: task.deadline,
            contributionImportance: task.contributionImportance,
            estimateHours: task.estimateHours,
            approved: task.approved,
            isCompleted: task.isCompleted,
            submittedAt: task.createdAt,
          }
        : null;

      const taskEvaluationsGiven = meeting.taskEvaluations
        .filter((e) => resolveId(e.participantId) === participantId)
        .flatMap((e) =>
          e.evaluations.map((ev) => ({
            taskAuthor: resolveCompactRef(ev.taskAuthorId),
            importanceScore: ev.importanceScore,
          })),
        );

      const taskEvaluationsReceived = task
        ? meeting.taskEvaluations.flatMap((e) =>
            e.evaluations
              .filter((ev) => resolveId(ev.taskAuthorId) === participantId)
              .map((ev) => ({
                fromParticipant: resolveCompactRef(e.participantId),
                importanceScore: ev.importanceScore,
              })),
          )
        : [];

      return {
        participant: participantInfo,
        emotionalEvaluations: {
          given: emotionalEvaluationsGiven,
          received: emotionalEvaluationsReceived,
        },
        understandingAndContribution: {
          given: contributionsGiven,
          received: contributionsReceived,
        },
        taskPlanning: {
          taskCreated: taskInfo,
          evaluationsGiven: taskEvaluationsGiven,
          evaluationsReceived: taskEvaluationsReceived,
        },
      };
    });

    return {
      meetingId: id,
      meetingTitle: meeting.title,
      meetingQuestion: meeting.question,
      currentPhase: meeting.currentPhase,
      status: meeting.status,
      creator: resolveUserRef(meeting.creatorId),
      totalParticipants: participantStatistics.length,
      participantStatistics,
      createdAt: meeting.createdAt,
      updatedAt: meeting.updatedAt,
    };
  }

  async getPendingVoters(meetingId: string, userId: string): Promise<Record<string, unknown>> {
    const meeting = await this.findOneInternal(meetingId);
    this.assertCreator(meeting, userId);

    const activeParticipants = this.meetingsGateway.getActiveParticipants(meetingId);
    const submittedIds = await this.getSubmittedIdsForPhase(
      meetingId,
      meeting.currentPhase,
      meeting,
    );
    const submittedSet = new Set(submittedIds);

    const pending = activeParticipants.filter((p) => !submittedSet.has(p.userId));

    return {
      meetingId,
      phase: meeting.currentPhase,
      pendingCount: pending.length,
      pendingParticipants: pending.map((p) => ({
        _id: p.userId,
        fullName: p.fullName,
        email: p.email,
        joinedAt: p.joinedAt,
        lastSeen: p.lastSeen,
      })),
    };
  }

  // ─── Private utilities ────────────────────────────────────────────────────────

  /**
   * Returns the list of participantId strings that have already submitted
   * in the given phase. For TASK_PLANNING, defers to the Task collection
   * since Meeting no longer embeds task planning data.
   */
  private async getSubmittedIdsForPhase(
    meetingId: string,
    phase: MeetingPhase,
    meeting: MeetingDocument,
  ): Promise<string[]> {
    switch (phase) {
      case MeetingPhase.EMOTIONAL_EVALUATION:
        return meeting.emotionalEvaluations.map((e) => resolveId(e.participantId));

      case MeetingPhase.UNDERSTANDING_CONTRIBUTION:
        return meeting.understandingContributions.map((c) => resolveId(c.participantId));

      case MeetingPhase.TASK_PLANNING: {
        const tasks = await this.taskModel
          .find({ meetingId: new Types.ObjectId(meetingId) })
          .select('authorId')
          .lean<Array<{ authorId: Types.ObjectId }>>()
          .exec();
        return tasks.map((t) => t.authorId.toString());
      }

      default:
        return [];
    }
  }

  /**
   * Serialises a MeetingDocument into the typed API response shape.
   *
   * All ObjectId fields are converted to strings; populated User refs are
   * resolved to ParticipantRefDto objects via the pure helper functions.
   * Task planning data is intentionally absent — consumers should use
   * GET /tasks?meetingId=:id to access task data.
   */
  private transformMeetingResponse(meeting: MeetingDocument): MeetingResponseDto {
    return {
      _id: meeting._id.toString(),
      title: meeting.title,
      question: meeting.question,
      creatorId: resolveUserRef(meeting.creatorId),
      participantIds: (
        meeting.participantIds as unknown as Array<PopulatedUser | Types.ObjectId>
      ).map((p) => resolveId(p)),
      activeParticipantIds: meeting.activeParticipants.map((ap) =>
        resolveUserRef(ap.participantId),
      ),
      currentPhase: meeting.currentPhase,
      status: meeting.status,
      emotionalEvaluations: meeting.emotionalEvaluations.map((e) => ({
        participant: resolveUserRef(e.participantId),
        evaluations: e.evaluations.map((ev) => ({
          targetParticipantId: resolveId(ev.targetParticipantId),
          emotionalScale: ev.emotionalScale,
          isToxic: ev.isToxic,
        })),
        submittedAt: e.submittedAt,
      })),
      understandingContributions: meeting.understandingContributions.map((c) => ({
        participant: resolveUserRef(c.participantId),
        understandingScore: c.understandingScore,
        contributions: c.contributions.map((contrib) => ({
          participantId: resolveId(contrib.participantId),
          contributionPercentage: contrib.contributionPercentage,
        })),
        submittedAt: c.submittedAt,
      })),
      taskEvaluations: meeting.taskEvaluations.map((e) => ({
        participant: resolveUserRef(e.participantId),
        evaluations: e.evaluations.map((ev) => ({
          taskAuthorId: resolveId(ev.taskAuthorId),
          importanceScore: ev.importanceScore,
        })),
        submittedAt: e.submittedAt,
      })),
      createdAt: meeting.createdAt,
      updatedAt: meeting.updatedAt,
    };
  }
}
