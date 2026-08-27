import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Meeting, MeetingDocument, MeetingPhase, MeetingStatus } from './schemas/meeting.schema';
import { Task, TaskDocument } from '../tasks/schemas/task.schema';
import { MeetingsRedisService, RetroTaskStatus } from './meetings.redis.service';

// ─── Vote payload shapes (mirror WS DTOs) ────────────────────────────────────

interface EmotionalEvalItem {
  targetParticipantId: string;
  emotionalScale: number;
  isToxic: boolean;
}

interface EmotionalVote {
  evaluations: EmotionalEvalItem[];
}

interface ContributionItem {
  participantId: string;
  contributionPercentage: number;
}

interface UnderstandingVote {
  understandingScore: number;
  contributions: ContributionItem[];
}

interface TaskPlanningVote {
  taskDescription: string;
  commonQuestion: string;
  deadline: string;
  expectedContributionPercentage: number;
  estimateHours: number;
}

interface TaskEvalItem {
  taskAuthorId: string;
  importanceScore: number;
}

interface TaskEvaluationVote {
  evaluations: TaskEvalItem[];
}

@Injectable()
export class MeetingsFlushService {
  private readonly logger = new Logger(MeetingsFlushService.name);

  constructor(
    @InjectModel(Meeting.name) private meetingModel: Model<MeetingDocument>,
    @InjectModel(Task.name) private taskModel: Model<TaskDocument>,
    private redis: MeetingsRedisService,
  ) {}

  /**
   * Reads all finalised votes for `phase` from Redis and bulk-writes them
   * to MongoDB. Called by the gateway on every admin:advance_phase event.
   * Returns the number of records flushed.
   */
  async flushPhaseToMongo(meetingId: string, phase: MeetingPhase): Promise<number> {
    this.logger.log(`[Flush] ${meetingId} → flushing phase=${phase}`);

    switch (phase) {
      case MeetingPhase.RETROSPECTIVE:
        return this.flushRetro(meetingId);
      case MeetingPhase.EMOTIONAL_EVALUATION:
        return this.flushEmotional(meetingId);
      case MeetingPhase.UNDERSTANDING_CONTRIBUTION:
        return this.flushUnderstanding(meetingId);
      case MeetingPhase.TASK_PLANNING:
        return this.flushTaskPlanning(meetingId);
      case MeetingPhase.TASK_EVALUATION:
        // Bug fix: was missing — caused task evaluation votes to be silently dropped.
        return this.flushTaskEvaluation(meetingId);
      case MeetingPhase.FINISHED:
        // Already finished — nothing to flush.
        return 0;
      default:
        this.logger.warn(`[Flush] Unknown phase "${phase}" — nothing flushed`);
        return 0;
    }
  }

  // ─── Phase 0 — Retrospective ──────────────────────────────────────────────

  private async flushRetro(meetingId: string): Promise<number> {
    const statuses = await this.redis.getAllRetroStatuses(meetingId);
    if (statuses.length === 0) return 0;

    const now = new Date();
    const ops = statuses.map((s: RetroTaskStatus) => ({
      updateOne: {
        filter: { _id: new Types.ObjectId(s.taskId) },
        update: {
          $set: {
            isCompleted: s.status === 'completed',
            retroStatus: s.status,
            statusNote: s.statusNote,
            retroReviewedAt: now,
          },
        },
      },
    }));

    if (ops.length > 0) await this.taskModel.bulkWrite(ops);
    this.logger.log(`[Flush] Retro: updated ${ops.length} tasks`);
    return ops.length;
  }

  // ─── Phase 1 — Emotional Evaluation ──────────────────────────────────────

  private async flushEmotional(meetingId: string): Promise<number> {
    const votes = await this.redis.getAllVotes<EmotionalVote>(
      meetingId,
      MeetingPhase.EMOTIONAL_EVALUATION,
    );
    if (votes.length === 0) return 0;

    const now = new Date();
    const newEvals = votes.map(({ userId, vote }) => ({
      participantId: new Types.ObjectId(userId),
      evaluations: vote.evaluations.map((e) => ({
        targetParticipantId: new Types.ObjectId(e.targetParticipantId),
        emotionalScale: e.emotionalScale,
        isToxic: e.isToxic,
      })),
      submittedAt: now,
    }));

    const submittedUserIds = votes.map(({ userId }) => new Types.ObjectId(userId));

    await this.meetingModel.findByIdAndUpdate(meetingId, {
      $pull: { emotionalEvaluations: { participantId: { $in: submittedUserIds } } },
    });

    await this.meetingModel.findByIdAndUpdate(meetingId, {
      $push: { emotionalEvaluations: { $each: newEvals } },
    });

    await this.redis.deleteVotesForPhase(meetingId, MeetingPhase.EMOTIONAL_EVALUATION);
    this.logger.log(`[Flush] Emotional: flushed ${newEvals.length} evaluations`);
    return newEvals.length;
  }

  // ─── Phase 2 — Understanding & Contribution ───────────────────────────────

  private async flushUnderstanding(meetingId: string): Promise<number> {
    const votes = await this.redis.getAllVotes<UnderstandingVote>(
      meetingId,
      MeetingPhase.UNDERSTANDING_CONTRIBUTION,
    );
    if (votes.length === 0) return 0;

    const now = new Date();
    const newContribs = votes.map(({ userId, vote }) => ({
      participantId: new Types.ObjectId(userId),
      understandingScore: vote.understandingScore,
      contributions: vote.contributions.map((c) => ({
        participantId: new Types.ObjectId(c.participantId),
        contributionPercentage: c.contributionPercentage,
      })),
      submittedAt: now,
    }));

    const submittedUserIds = votes.map(({ userId }) => new Types.ObjectId(userId));

    await this.meetingModel.findByIdAndUpdate(meetingId, {
      $pull: { understandingContributions: { participantId: { $in: submittedUserIds } } },
    });

    await this.meetingModel.findByIdAndUpdate(meetingId, {
      $push: { understandingContributions: { $each: newContribs } },
    });

    await this.redis.deleteVotesForPhase(meetingId, MeetingPhase.UNDERSTANDING_CONTRIBUTION);
    this.logger.log(`[Flush] Understanding: flushed ${newContribs.length} submissions`);
    return newContribs.length;
  }

  // ─── Phase 3 — Task Planning ──────────────────────────────────────────────

  private async flushTaskPlanning(meetingId: string): Promise<number> {
    const votes = await this.redis.getAllVotes<TaskPlanningVote>(
      meetingId,
      MeetingPhase.TASK_PLANNING,
    );
    if (votes.length === 0) return 0;

    // Skip drafts with unfilled required fields — an incomplete task must
    // never reach MongoDB (and must not fail the whole flush on validation).
    const isComplete = ({ vote }: { vote: TaskPlanningVote }): boolean => {
      const parsedDeadline = vote.deadline ? new Date(vote.deadline) : null;
      return (
        typeof vote.taskDescription === 'string' &&
        vote.taskDescription.trim().length > 0 &&
        typeof vote.commonQuestion === 'string' &&
        vote.commonQuestion.trim().length > 0 &&
        parsedDeadline !== null &&
        !isNaN(parsedDeadline.getTime()) &&
        typeof vote.estimateHours === 'number' &&
        vote.estimateHours > 0
      );
    };

    const completeVotes = votes.filter(isComplete);
    const skipped = votes.length - completeVotes.length;
    if (skipped > 0) {
      this.logger.warn(
        `[Flush] TaskPlanning: skipped ${skipped} incomplete draft(s) for meeting ${meetingId}`,
      );
    }

    if (completeVotes.length === 0) {
      await this.redis.deleteVotesForPhase(meetingId, MeetingPhase.TASK_PLANNING);
      return 0;
    }

    // Fetch shared data once — not inside the per-vote loop.
    const [approvals, meetingDoc] = await Promise.all([
      this.redis.getAllTaskApprovals(meetingId),
      this.meetingModel
        .findById(meetingId)
        .select('projectId')
        .lean<{ projectId: Types.ObjectId }>()
        .exec(),
    ]);

    const projectId = meetingDoc?.projectId;

    // approvals is keyed by userId because the creator panel calls
    // emitApproveTask(userId, approved) — the gateway stores it under the
    // submitter's userId, NOT a MongoDB task _id.
    const ops = completeVotes.map(({ userId, vote }) => {
      const parsedDeadline = vote.deadline ? new Date(vote.deadline) : null;
      const deadlineIsValid = parsedDeadline !== null && !isNaN(parsedDeadline.getTime());

      return {
        updateOne: {
          filter: {
            authorId: new Types.ObjectId(userId),
            meetingId: new Types.ObjectId(meetingId),
          },
          update: {
            $set: {
              description: vote.taskDescription,
              commonQuestion: vote.commonQuestion,
              ...(deadlineIsValid ? { deadline: parsedDeadline } : {}),
              contributionImportance: vote.expectedContributionPercentage,
              estimateHours: vote.estimateHours,
              approved: approvals[userId] ?? false,
              isCompleted: false,
            },
            $setOnInsert: {
              ...(projectId ? { projectId } : {}),
            },
          },
          upsert: true,
        },
      };
    });

    try {
      const result = await this.taskModel.bulkWrite(ops, { ordered: false });
      this.logger.log(
        `[Flush] TaskPlanning: upserted ${ops.length} task(s) ` +
          `(inserted=${result.upsertedCount}, modified=${result.modifiedCount})`,
      );
    } catch (err) {
      this.logger.error(
        `[Flush] TaskPlanning bulkWrite failed for meeting ${meetingId}: ${(err as Error).message}`,
        (err as Error).stack,
      );
      throw err; // Re-throw so the caller can surface the error and NOT advance the phase.
    }

    await this.redis.deleteVotesForPhase(meetingId, MeetingPhase.TASK_PLANNING);
    return ops.length;
  }

  // ─── Phase 4 — Task Evaluation (on finish) ────────────────────────────────

  async flushTaskEvaluation(meetingId: string): Promise<number> {
    // Bug fix: votes are stored under the 'task_evaluation' key, NOT 'finished'.
    const votes = await this.redis.getAllVotes<TaskEvaluationVote>(
      meetingId,
      MeetingPhase.TASK_EVALUATION,
    );
    if (votes.length === 0) return 0;

    const now = new Date();
    const newEvals = votes.map(({ userId, vote }) => ({
      participantId: new Types.ObjectId(userId),
      evaluations: vote.evaluations.map((e) => ({
        taskAuthorId: new Types.ObjectId(e.taskAuthorId),
        importanceScore: e.importanceScore,
      })),
      submittedAt: now,
    }));

    const submittedUserIds = votes.map(({ userId }) => new Types.ObjectId(userId));

    await this.meetingModel.findByIdAndUpdate(meetingId, {
      $pull: { taskEvaluations: { participantId: { $in: submittedUserIds } } },
    });

    await this.meetingModel.findByIdAndUpdate(meetingId, {
      $push: { taskEvaluations: { $each: newEvals } },
    });

    await this.redis.deleteVotesForPhase(meetingId, MeetingPhase.TASK_EVALUATION);
    this.logger.log(`[Flush] TaskEval: flushed ${newEvals.length} evaluations`);
    return newEvals.length;
  }

  /**
   * Finishes the meeting.
   *
   * @param meetingId  - The meeting to finish.
   * @param currentPhase - The phase that is active when finish is triggered.
   *   MUST be supplied by the caller so we can flush any pending votes before
   *   sealing the meeting.  If the creator is on task_planning and clicks
   *   "Finish Meeting", those task votes MUST be persisted here — they will not
   *   be flushed by any subsequent advance_phase call.
   */
  async finishMeeting(meetingId: string, currentPhase: MeetingPhase): Promise<void> {
    // 1. Flush whatever phase was active when the creator finished.
    //    This is the primary guard against data loss: if the creator goes
    //    task_planning → finish (skipping task_evaluation), task plans
    //    are flushed here rather than being silently dropped.
    const flushed = await this.flushPhaseToMongo(meetingId, currentPhase);
    this.logger.log(
      `[Finish] Pre-finish flush of phase=${currentPhase}: ${flushed} record(s) written`,
    );

    // 2. Seal the meeting in MongoDB.
    await this.meetingModel.findByIdAndUpdate(meetingId, {
      $set: {
        status: MeetingStatus.FINISHED,
        currentPhase: MeetingPhase.FINISHED,
      },
    });
    this.logger.log(`[Finish] Meeting ${meetingId} marked as finished`);
  }
}
