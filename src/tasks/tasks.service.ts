import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { Task, TaskDocument } from './schemas/task.schema';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TaskApprovalResponseDto } from './dto/task-response.dto';
import { Meeting, MeetingDocument } from 'src/meetings/schemas/meeting.schema';
import { MeetingsGateway } from 'src/meetings/meetings.gateway';

// ─── Internal type definitions ─────────────────────────────────────────────────

/**
 * Shape of task.authorId after .populate('authorId', 'fullName email').
 * Mongoose replaces the raw ObjectId with a partial User document at runtime;
 * this interface makes that implicit contract explicit, eliminating the need
 * for `as any` casts whenever we access populated author fields.
 */
interface PopulatedAuthor {
  _id: Types.ObjectId;
  fullName: string | null;
  email: string | null;
}

/**
 * Typed Mongo filter used in findAll().
 * A concrete interface catches invalid field names at compile time.
 */
interface TaskFilterQuery {
  authorId?: Types.ObjectId;
  projectId?: Types.ObjectId;
  isCompleted?: boolean;
  description?: { $regex: RegExp };
}

/**
 * Lean projection of a Meeting document used only for the creator-ID check
 * inside setApproval(). Selecting only creatorId avoids loading the full
 * meeting into memory for a single ObjectId comparison.
 */
interface MeetingCreatorProjection {
  creatorId: Types.ObjectId;
}

// ─── Module-level pure helpers ─────────────────────────────────────────────────

function isPopulatedAuthor(value: unknown): value is PopulatedAuthor {
  return typeof value === 'object' && value !== null && '_id' in value;
}

/**
 * Extracts the ObjectId from an authorId field that may be either a raw
 * ObjectId (before populate) or a populated author document (after populate).
 */
function resolveAuthorObjectId(
  authorId: Types.ObjectId | PopulatedAuthor,
): Types.ObjectId {
  return isPopulatedAuthor(authorId) ? authorId._id : authorId;
}

/**
 * Resolves an authorId field into a serialisable author ref object.
 * Returns null-safe name and email when the field is not populated.
 */
function resolveAuthorRef(
  authorId: Types.ObjectId | PopulatedAuthor,
): { _id: string; fullName: string | null; email: string | null } {
  if (isPopulatedAuthor(authorId)) {
    return {
      _id: authorId._id.toString(),
      fullName: authorId.fullName,
      email: authorId.email,
    };
  }
  return { _id: authorId.toString(), fullName: null, email: null };
}

// ─── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class TasksService {
  constructor(
    @InjectModel(Task.name) private taskModel: Model<TaskDocument>,
    @InjectModel(Meeting.name) private meetingModel: Model<MeetingDocument>,
    @Inject(forwardRef(() => MeetingsGateway))
    private meetingsGateway: MeetingsGateway,
  ) {}

  // ─── Create ───────────────────────────────────────────────────────────────

  async create(createTaskDto: CreateTaskDto, userId: string): Promise<Task> {
    if (!Types.ObjectId.isValid(createTaskDto.meetingId)) {
      throw new BadRequestException('Invalid meeting ID');
    }

    const createdTask = new this.taskModel({
      description: createTaskDto.description,
      commonQuestion: createTaskDto.commonQuestion,
      authorId: new Types.ObjectId(userId),
      meetingId: new Types.ObjectId(createTaskDto.meetingId),
      deadline: new Date(createTaskDto.deadline),
      estimateHours: createTaskDto.estimateHours,
      contributionImportance: createTaskDto.contributionImportance,
      ...(createTaskDto.projectId && {
        projectId: new Types.ObjectId(createTaskDto.projectId),
      }),
    });

    return createdTask.save();
  }

  // ─── List ─────────────────────────────────────────────────────────────────

  /**
   * Returns tasks filtered by the provided criteria.
   *
   * Scoping rules:
   *   - When `projectId` is supplied: returns ALL tasks for that project,
   *     regardless of who created them. `authorId` is NOT used as a filter.
   *   - When `projectId` is omitted: falls back to the caller's own tasks only
   *     (used by personal task views and the meeting-room task-planning phase).
   *
   * @param userId     Caller's userId — applied as authorId filter only when no projectId given.
   * @param filter     'current' → isCompleted=false, 'past' → isCompleted=true.
   * @param projectId  Scope to a specific project (returns all tasks, not just caller's).
   * @param search     Case-insensitive substring match on description.
   */
  async findAll(
    userId: string,
    filter?: 'current' | 'past',
    projectId?: string,
    search?: string,
  ): Promise<Task[]> {
    const query: TaskFilterQuery = {};

    if (projectId) {
      if (!Types.ObjectId.isValid(projectId)) {
        throw new BadRequestException('Invalid project ID');
      }
      // Project-scoped query: return every task in the project, owner or not.
      query.projectId = new Types.ObjectId(projectId);
    } else {
      // Personal query (no project): scope to the caller's own tasks only.
      query.authorId = new Types.ObjectId(userId);
    }

    if (filter === 'current') query.isCompleted = false;
    else if (filter === 'past') query.isCompleted = true;

    if (search?.trim()) {
      query.description = { $regex: new RegExp(search.trim(), 'i') };
    }

    return this.taskModel
      .find(query as FilterQuery<TaskDocument>)
      .populate('authorId', 'fullName email')
      .populate('meetingId', 'title question')
      .sort({ deadline: 1 })
      .exec();
  }

  // ─── Find one ─────────────────────────────────────────────────────────────

  /**
   * Returns a single task by ID. Any authenticated user may read any task.
   * Ownership is only enforced in mutating operations (update / remove).
   */
  async findOne(id: string, _userId?: string): Promise<TaskDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid task ID');
    }

    const task = await this.taskModel
      .findById(id)
      .populate('authorId', 'fullName email')
      .populate('meetingId', 'title question')
      .exec();

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    return task;
  }

  // ─── Update ───────────────────────────────────────────────────────────────

  async update(
    id: string,
    updateTaskDto: UpdateTaskDto,
    userId: string,
  ): Promise<TaskDocument> {
    const task = await this.findOne(id);

    // Ownership is enforced here: only the task author may mutate it.
    const authorObjectId = resolveAuthorObjectId(
      task.authorId as unknown as Types.ObjectId | PopulatedAuthor,
    );
    if (!authorObjectId.equals(new Types.ObjectId(userId))) {
      throw new ForbiddenException('Only the task author can update this task');
    }

    // Build a typed update payload rather than mutating the DTO with `as any`.
    const updatePayload: Partial<{
      description: string;
      deadline: Date;
      estimateHours: number;
      contributionImportance: number;
      isCompleted: boolean;
    }> = {};

    // Status toggle is always allowed for the owner, even on approved tasks.
    if (updateTaskDto.isCompleted !== undefined) {
      updatePayload.isCompleted = updateTaskDto.isCompleted;
    }

    // Content fields are locked once the task has been approved.
    // A field only counts as a change when its incoming value actually differs
    // from the stored value — this lets the status-toggle safely echo back the
    // current estimateHours without tripping the approved guard.
    const deadlineMs = task.deadline ? new Date(task.deadline).getTime() : null;
    const incomingDeadlineMs = updateTaskDto.deadline
      ? new Date(updateTaskDto.deadline).getTime()
      : null;

    const hasContentChange =
      (updateTaskDto.description !== undefined && updateTaskDto.description !== task.description) ||
      (updateTaskDto.deadline !== undefined && incomingDeadlineMs !== deadlineMs) ||
      (updateTaskDto.estimateHours !== undefined && updateTaskDto.estimateHours !== task.estimateHours) ||
      (updateTaskDto.contributionImportance !== undefined &&
        updateTaskDto.contributionImportance !== task.contributionImportance);

    if (hasContentChange && task.approved) {
      throw new ForbiddenException('Cannot edit approved tasks');
    }

    if (updateTaskDto.description !== undefined) {
      updatePayload.description = updateTaskDto.description;
    }
    if (updateTaskDto.deadline !== undefined) {
      updatePayload.deadline = new Date(updateTaskDto.deadline);
    }
    if (updateTaskDto.estimateHours !== undefined) {
      updatePayload.estimateHours = updateTaskDto.estimateHours;
    }
    if (updateTaskDto.contributionImportance !== undefined) {
      updatePayload.contributionImportance = updateTaskDto.contributionImportance;
    }

    Object.assign(task, updatePayload);
    const saved = await task.save();

    this.meetingsGateway.emitMeetingUpdated(
      task.meetingId.toString(),
      'task_updated',
      userId,
    );

    return saved;
  }

  // ─── Remove ───────────────────────────────────────────────────────────────

  async remove(id: string, userId: string): Promise<void> {
    const task = await this.findOne(id);

    const authorObjectId = resolveAuthorObjectId(
      task.authorId as unknown as Types.ObjectId | PopulatedAuthor,
    );
    if (!authorObjectId.equals(new Types.ObjectId(userId))) {
      throw new ForbiddenException('Only the task author can delete this task');
    }

    await this.taskModel.findByIdAndDelete(id);
  }

  // ─── Find by meeting ──────────────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async findByMeeting(meetingId: string, userId: string): Promise<Task[]> {
    if (!Types.ObjectId.isValid(meetingId)) {
      throw new BadRequestException('Invalid meeting ID');
    }

    // userId parameter retained for future per-participant access control.
    return this.taskModel
      .find({ meetingId: new Types.ObjectId(meetingId) })
      .populate('authorId', 'fullName email')
      .populate('meetingId', 'title question')
      .exec();
  }

  // ─── Approve ──────────────────────────────────────────────────────────────

  async setApproval(
    taskId: string,
    approved: boolean,
    userId: string,
  ): Promise<TaskApprovalResponseDto> {
    const task = await this.taskModel
      .findById(taskId)
      .populate('authorId', 'fullName email')
      .exec();

    if (!task) throw new NotFoundException('Task not found');

    // Select only creatorId — we never need the full Meeting document here.
    // The lean + typed projection avoids hydrating a Mongoose document for a
    // single equality check.
    const meeting = await this.meetingModel
      .findById(task.meetingId)
      .select('creatorId')
      .lean<MeetingCreatorProjection>()
      .exec();

    if (!meeting) throw new NotFoundException('Meeting not found');

    // meeting.creatorId is a raw ObjectId here (no populate requested).
    if (!meeting.creatorId.equals(new Types.ObjectId(userId))) {
      throw new ForbiddenException('Only the meeting creator can approve tasks');
    }

    task.approved = approved;
    await task.save();

    this.meetingsGateway.emitMeetingUpdated(
      task.meetingId.toString(),
      'task_approved',
      userId,
    );

    const authorRef = resolveAuthorRef(
      task.authorId as unknown as Types.ObjectId | PopulatedAuthor,
    );

    return {
      taskId,
      approved,
      task: {
        _id: (task._id as Types.ObjectId).toString(),
        description: task.description,
        approved: task.approved,
        author: authorRef,
      },
    };
  }
}
