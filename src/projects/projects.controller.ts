import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectResponseDto, ProjectDetailResponseDto } from './dto/project-response.dto';
import { ProjectStatus } from './schemas/project.schema';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

interface AuthenticatedUser {
  userId: string;
  email: string;
  fullName: string;
}

@ApiTags('projects')
@Controller('projects')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  // ─── Create ──────────────────────────────────────────────────────────────────

  @Post()
  @ApiOperation({ summary: 'Create a new project' })
  @ApiResponse({
    status: 201,
    description: 'Project created successfully',
    type: ProjectResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  create(
    @Body() createProjectDto: CreateProjectDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProjectResponseDto> {
    return this.projectsService.create(createProjectDto, user.userId);
  }

  // ─── List ────────────────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({
    summary: 'List projects visible to the current user',
    description:
      'Returns all projects where the current user is a participant. ' +
      'Optional filters: status, search (matches title, goal, description).',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ProjectStatus,
    description: 'Filter by project status',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Case-insensitive keyword search across title, goal, and description',
  })
  @ApiResponse({
    status: 200,
    description: 'List of projects',
    type: [ProjectResponseDto],
  })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: ProjectStatus,
    @Query('search') search?: string,
  ): Promise<ProjectResponseDto[]> {
    return this.projectsService.findAll(user.userId, status, search);
  }

  // ─── Get one ─────────────────────────────────────────────────────────────────

  @Get(':id')
  @ApiOperation({
    summary: 'Get project details including meeting and task counts',
  })
  @ApiParam({ name: 'id', description: 'Project ID' })
  @ApiResponse({
    status: 200,
    description: 'Project detail with aggregate counts',
    type: ProjectDetailResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Not a project participant' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProjectDetailResponseDto> {
    return this.projectsService.findOne(id, user.userId);
  }

  // ─── Update ──────────────────────────────────────────────────────────────────

  @Patch(':id')
  @ApiOperation({
    summary: 'Update project (creator only)',
    description:
      'Editable fields: title, goal, description, participantIds, status. ' +
      'The creator is always preserved in participantIds regardless of the payload.',
  })
  @ApiParam({ name: 'id', description: 'Project ID' })
  @ApiResponse({
    status: 200,
    description: 'Project updated',
    type: ProjectResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Only the project creator can update it' })
  update(
    @Param('id') id: string,
    @Body() updateProjectDto: UpdateProjectDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProjectResponseDto> {
    return this.projectsService.update(id, updateProjectDto, user.userId);
  }

  // ─── Delete ──────────────────────────────────────────────────────────────────

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete project (creator only)',
    description:
      'Permanently deletes the project and cascade-deletes all associated meetings and tasks.',
  })
  @ApiParam({ name: 'id', description: 'Project ID' })
  @ApiResponse({ status: 204, description: 'Project deleted' })
  @ApiResponse({ status: 403, description: 'Only the project creator can delete it' })
  remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.projectsService.remove(id, user.userId);
  }
}
