import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Task, TaskDocument } from './schemas/task.schema';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

@Injectable()
export class TasksService {
  constructor(@InjectModel(Task.name) private taskModel: Model<TaskDocument>) {}

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

    if (updateTaskDto.deadline) {
      (updateTaskDto as any).deadline = new Date(updateTaskDto.deadline);
    }

    Object.assign(task, updateTaskDto);
    return task.save();
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

  async findByMeeting(meetingId: string, userId: string): Promise<Task[]> {
    if (!Types.ObjectId.isValid(meetingId)) {
      throw new BadRequestException('Invalid meeting ID');
    }

    return this.taskModel
      .find({ meetingId: new Types.ObjectId(meetingId) })
      .populate('authorId', 'fullName email')
      .populate('meetingId', 'title question')
      .exec();
  }
}
