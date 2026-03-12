import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { Project, ProjectDocument, ProjectStatus } from './schemas/project.schema';
import { Meeting, MeetingDocument } from '../meetings/schemas/meeting.schema';
import { Task, TaskDocument } from '../tasks/schemas/task.schema';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import {
  ProjectResponseDto,
  ProjectDetailResponseDto,
} from './dto/project-response.dto';

// ─── Internal types ────────────────────────────────────────────────────────────

interface PopulatedUser {
  _id: Types.ObjectId;
  fullName: string;
  email: string;
}

interface ProjectListQuery {
  participantIds: Types.ObjectId;
  status?: ProjectStatus;
  $or?: Array<{ title?: RegExp; goal?: RegExp; description?: RegExp }>;
}

// ─── Pure helpers ──────────────────────────────────────────────────────────────

function isPopulatedUser(v: unknown): v is PopulatedUser {
  return typeof v === 'object' && v !== null && '_id' in v;
}

function resolveUserRef(v: unknown): { _id: string; fullName: string; email: string } {
  if (isPopulatedUser(v)) {
    return { _id: v._id.toString(), fullName: v.fullName, email: v.email };
  }
  return { _id: String(v), fullName: '', email: '' };
}

// ─── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class ProjectsService {
  constructor(
    @InjectModel(Project.name) private projectModel: Model<ProjectDocument>,
    @InjectModel(Meeting.name) private meetingModel: Model<MeetingDocument>,
    @InjectModel(Task.name) private taskModel: Model<TaskDocument>,
  ) {}

  // ─── Authorization guards ──────────────────────────────────────────────────

  /**
   * Verifies the calling user is listed in participantIds.
   * Called before any read or write on a project or its child resources.
   */
  private assertParticipant(project: ProjectDocument, userId: string): void {
    const isParticipant = project.participantIds.some(
      (pid) => pid.toString() === userId,
    );
    if (!isParticipant) {
      throw new ForbiddenException('You are not a participant of this project');
    }
  }

  /**
   * Verifies the calling user is the project creator.
   * Called before mutating project metadata.
   */
  private assertCreator(project: ProjectDocument, userId: string): void {
    if (project.creatorId.toString() !== userId) {
      throw new ForbiddenException('Only the project creator can perform this action');
    }
  }

  // ─── Internal fetch ────────────────────────────────────────────────────────

  /**
   * Central internal fetch: loads a project with populated creator and
   * participants. Throws 400 for invalid IDs, 404 if not found.
   */
  private async findOneInternal(id: string): Promise<ProjectDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid project ID');
    }

    const project = await this.projectModel
      .findById(id)
      .populate('creatorId', 'fullName email')
      .populate('participantIds', 'fullName email')
      .exec();

    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  // ─── Serialisation ─────────────────────────────────────────────────────────

  private toResponseDto(project: ProjectDocument): ProjectResponseDto {
    return {
      _id: project._id.toString(),
      title: project.title,
      goal: project.goal,
      description: project.description,
      creatorId: resolveUserRef(project.creatorId),
      participantIds: (
        project.participantIds as unknown as Array<PopulatedUser | Types.ObjectId>
      ).map(resolveUserRef),
      status: project.status,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    };
  }

  // ─── CRUD ──────────────────────────────────────────────────────────────────

  async create(dto: CreateProjectDto, userId: string): Promise<ProjectResponseDto> {
    const creatorObjectId = new Types.ObjectId(userId);

    // Deduplicate participant list and guarantee the creator is always included.
    const participantSet = new Set<string>([userId]);
    for (const pid of dto.participantIds ?? []) {
      participantSet.add(pid);
    }
    const participantIds = [...participantSet].map((id) => new Types.ObjectId(id));

    const saved = await new this.projectModel({
      title: dto.title,
      goal: dto.goal ?? '',
      description: dto.description ?? '',
      creatorId: creatorObjectId,
      participantIds,
      status: ProjectStatus.CURRENT,
    }).save();

    return this.toResponseDto(
      await this.projectModel
        .findById(saved._id)
        .populate('creatorId', 'fullName email')
        .populate('participantIds', 'fullName email')
        .exec(),
    );
  }

  async findAll(
    userId: string,
    status?: ProjectStatus,
    search?: string,
  ): Promise<ProjectResponseDto[]> {
    const query: ProjectListQuery = {
      participantIds: new Types.ObjectId(userId),
    };

    if (status) {
      query.status = status;
    }

    // Full-text search across title, goal and description using
    // case-insensitive regex. Indexes on those fields would make this
    // faster at scale, but regex is adequate for the current volume.
    if (search?.trim()) {
      const pattern = new RegExp(search.trim(), 'i');
      query.$or = [
        { title: pattern },
        { goal: pattern },
        { description: pattern },
      ];
    }

    const projects = await this.projectModel
      .find(query as FilterQuery<ProjectDocument>)
      .populate('creatorId', 'fullName email')
      .populate('participantIds', 'fullName email')
      .sort({ createdAt: -1 })
      .exec();

    return projects.map((p) => this.toResponseDto(p));
  }

  async findOne(id: string, userId: string): Promise<ProjectDetailResponseDto> {
    const project = await this.findOneInternal(id);
    this.assertParticipant(project, userId);

    // Count child resources in parallel — avoids sequential round trips.
    const projectObjectId = new Types.ObjectId(id);
    const [meetingCount, taskCount] = await Promise.all([
      this.meetingModel.countDocuments({ projectId: projectObjectId }),
      this.taskModel.countDocuments({ projectId: projectObjectId }),
    ]);

    return {
      ...this.toResponseDto(project),
      meetingCount,
      taskCount,
    };
  }

  async update(
    id: string,
    dto: UpdateProjectDto,
    userId: string,
  ): Promise<ProjectResponseDto> {
    const project = await this.findOneInternal(id);
    this.assertCreator(project, userId);

    // Build typed update payload; never spread the raw DTO to avoid
    // accidentally leaking unexpected fields into the document.
    if (dto.title !== undefined) project.title = dto.title;
    if (dto.goal !== undefined) project.goal = dto.goal;
    if (dto.description !== undefined) project.description = dto.description;
    if (dto.status !== undefined) project.status = dto.status;

    if (dto.participantIds !== undefined) {
      // Always preserve the creator in the participant list.
      const participantSet = new Set<string>([project.creatorId.toString()]);
      for (const pid of dto.participantIds) {
        participantSet.add(pid);
      }
      project.participantIds = [...participantSet].map((p) => new Types.ObjectId(p));
    }

    await project.save();

    return this.toResponseDto(
      await this.projectModel
        .findById(project._id)
        .populate('creatorId', 'fullName email')
        .populate('participantIds', 'fullName email')
        .exec(),
    );
  }

  async remove(id: string, userId: string): Promise<void> {
    const project = await this.findOneInternal(id);
    this.assertCreator(project, userId);

    const projectObjectId = new Types.ObjectId(id);

    // Cascade delete: remove all child meetings and tasks that belong to
    // this project. Using deleteMany for atomicity at the collection level.
    await Promise.all([
      this.meetingModel.deleteMany({ projectId: projectObjectId }),
      this.taskModel.deleteMany({ projectId: projectObjectId }),
      this.projectModel.findByIdAndDelete(id),
    ]);
  }

  // ─── Project access guard (used by other modules) ──────────────────────────

  /**
   * Verifies that the given projectId exists and the user is a participant.
   * Called from MeetingsService and TasksService before creating child resources.
   */
  async assertUserCanAccessProject(
    projectId: string,
    userId: string,
  ): Promise<ProjectDocument> {
    const project = await this.findOneInternal(projectId);
    this.assertParticipant(project, userId);
    return project;
  }
}
