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
   * Returns tasks visible to the current user, filtered by the provided
   * optional criteria.
   *
   * Access rule: a user can only retrieve their own tasks (authorId filter).
   * Additional optional filters: projectId, status, and description search.
   *
   * @param userId   Caller's userId — always applied as the authorId filter.
   * @param filter   'current' → isCompleted=false, 'past' → isCompleted=true.
   * @param projectId  Scope to a specific project.
   * @param search   Case-insensitive substring match on description.
   */
  async findAll(
    userId: string,
    filter?: 'current' | 'past',
    projectId?: string,
    search?: string,
  ): Promise<Task[]> {
    const query: TaskFilterQuery = { authorId: new Types.ObjectId(userId) };

    if (filter === 'current') query.isCompleted = false;
    else if (filter === 'past') query.isCompleted = true;

    if (projectId) {
      if (!Types.ObjectId.isValid(projectId)) {
        throw new BadRequestException('Invalid project ID');
      }
      query.projectId = new Types.ObjectId(projectId);
    }

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

  async findOne(id: string, userId: string): Promise<TaskDocument> {
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

    const authorObjectId = resolveAuthorObjectId(
      task.authorId as unknown as Types.ObjectId | PopulatedAuthor,
    );
    if (!authorObjectId.equals(new Types.ObjectId(userId))) {
      throw new ForbiddenException('You can only view your own tasks');
    }

    return task;
  }

  // ─── Update ───────────────────────────────────────────────────────────────

  async update(
    id: string,
    updateTaskDto: UpdateTaskDto,
    userId: string,
  ): Promise<TaskDocument> {
    const task = await this.findOne(id, userId);

    if (task.approved) {
      throw new ForbiddenException('Cannot edit approved tasks');
    }

    // Build a typed update payload rather than mutating the DTO with `as any`.
    // This keeps the DTO immutable, makes type coercions explicit (e.g. string → Date),
    // and prevents accidental leaking of unknown DTO fields into the document.
    const updatePayload: Partial<{
      description: string;
      deadline: Date;
      estimateHours: number;
      contributionImportance: number;
      isCompleted: boolean;
    }> = {};

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

    // Status (isCompleted) may only be changed by the task author.
    // findOne() above already enforces ownership, so this check is always
    // satisfied for the caller — but it is kept explicit for clarity
    // and to guard against future refactoring that might bypass findOne().
    if (updateTaskDto.isCompleted !== undefined) {
      const authorObjectId = resolveAuthorObjectId(
        task.authorId as unknown as Types.ObjectId | PopulatedAuthor,
      );
      if (!authorObjectId.equals(new Types.ObjectId(userId))) {
        throw new ForbiddenException('Only the task author can change task status');
      }
      updatePayload.isCompleted = updateTaskDto.isCompleted;
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
    // findOne already validates existence and ownership — no need to repeat checks.
    await this.findOne(id, userId);
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
