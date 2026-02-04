import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Task, TaskDocument } from './schemas/task.schema';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { Meeting, MeetingDocument } from 'src/meetings/schemas/meeting.schema';
import { MeetingsGateway } from 'src/meetings/meetings.gateway';

@Injectable()
export class TasksService {
  constructor(
    @InjectModel(Task.name) private taskModel: Model<TaskDocument>,
    @InjectModel(Meeting.name) private meetingModel: Model<MeetingDocument>,
    @Inject(forwardRef(() => MeetingsGateway))
    private meetingsGateway: MeetingsGateway,
  ) {}

  async create(createTaskDto: CreateTaskDto, userId: string): Promise<Task> {
    if (!Types.ObjectId.isValid(createTaskDto.meetingId)) {
      throw new BadRequestException('Invalid meeting ID');
    }

    const createdTask = new this.taskModel({
      description: createTaskDto.description,
      authorId: new Types.ObjectId(userId),
      meetingId: new Types.ObjectId(createTaskDto.meetingId),
      deadline: new Date(createTaskDto.deadline),
      contributionImportance: createTaskDto.contributionImportance,
      commonQuestion: createTaskDto.commonQuestion,
    });

    return createdTask.save();
  }

  async findAll(userId: string, filter?: 'current' | 'past'): Promise<Task[]> {
    const userObjectId = new Types.ObjectId(userId);

    const query: any = {
      authorId: userObjectId,
    };

    if (filter === 'current') {
      query.isCompleted = false;
    } else if (filter === 'past') {
      query.isCompleted = true;
    }

    return this.taskModel
      .find(query)
      .populate('authorId', 'fullName email')
      .populate('meetingId', 'title question')
      .sort({ deadline: 1 })
      .exec();
  }

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

    // Allow viewing if user is the author
    const userObjectId = new Types.ObjectId(userId);
    const authorId = (task.authorId as any)?._id || task.authorId;
    if (!authorId.equals(userObjectId)) {
      throw new ForbiddenException('You can only view your own tasks');
    }

    return task;
  }

  async update(id: string, updateTaskDto: UpdateTaskDto, userId: string): Promise<TaskDocument> {
    const task = await this.findOne(id, userId);

    // Only author can update task
    const authorId = (task.authorId as any)?._id || task.authorId;
    if (!authorId.equals(new Types.ObjectId(userId))) {
      throw new ForbiddenException('Only the task author can update the task');
    }

    // Prevent editing approved tasks
    if (task.approved) {
      throw new ForbiddenException('Cannot edit approved tasks');
    }

    if (updateTaskDto.deadline) {
      (updateTaskDto as any).deadline = new Date(updateTaskDto.deadline);
    }

    Object.assign(task, updateTaskDto);
    const saved = await task.save();

    // Notify via Socket
    const meetingId = task.meetingId.toString();
    this.meetingsGateway.emitMeetingUpdated(meetingId, 'task_updated', userId);

    return saved;
  }

  async remove(id: string, userId: string): Promise<void> {
    const task = await this.findOne(id, userId);

    // Only author can delete task
    const authorId = (task.authorId as any)?._id || task.authorId;
    if (!authorId.equals(new Types.ObjectId(userId))) {
      throw new ForbiddenException('Only the task author can delete the task');
    }

    await this.taskModel.findByIdAndDelete(id);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async findByMeeting(meetingId: string, userId: string): Promise<Task[]> {
    if (!Types.ObjectId.isValid(meetingId)) {
      throw new BadRequestException('Invalid meeting ID');
    }

    // Note: userId parameter kept for future access control implementation
    return this.taskModel
      .find({ meetingId: new Types.ObjectId(meetingId) })
      .populate('authorId', 'fullName email')
      .populate('meetingId', 'title question')
      .exec();
  }

  async setApproval(taskId: string, approved: boolean, userId: string) {
    const task = await this.taskModel
      .findById(taskId)
      .populate('authorId', 'fullName email')
      .populate('meetingId', 'title question');

    if (!task) throw new NotFoundException('Task not found');

    const meeting = await this.meetingModel.findById(task.meetingId);
    if (!meeting) throw new NotFoundException('Meeting not found');

    const creatorId = meeting.creatorId._id || meeting.creatorId;
    if (!creatorId.equals(new Types.ObjectId(userId))) {
      throw new ForbiddenException('Only creator can approve tasks');
    }

    // Update Task model
    task.approved = approved;
    await task.save();

    // Sync approval status to meeting's taskPlannings subdocument
    const taskAuthorId = task.authorId._id || task.authorId;
    const taskPlanningIndex = (meeting.taskPlannings as any[]).findIndex((tp: any) => {
      const tpAuthorId = tp.participantId?._id || tp.participantId;
      return tpAuthorId.equals(taskAuthorId);
    });

    if (taskPlanningIndex !== -1) {
      (meeting.taskPlannings as any[])[taskPlanningIndex].approved = approved;
      await meeting.save();
    }

    // Notify via Socket
    const meetingId = task.meetingId.toString();
    this.meetingsGateway.emitMeetingUpdated(meetingId, 'task_approved', userId);

    return {
      taskId,
      approved,
      task: {
        _id: task._id.toString(),
        description: task.description,
        approved: task.approved,
        author: {
          _id: (task.authorId as any)?._id?.toString() || task.authorId.toString(),
          fullName: (task.authorId as any)?.fullName || null,
          email: (task.authorId as any)?.email || null,
        },
      },
    };
  }
}
