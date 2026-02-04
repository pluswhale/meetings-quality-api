import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TaskResponseDto } from './dto/task-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ApproveTaskDto } from './dto/approve-task.dto';

@ApiTags('tasks')
@Controller('tasks')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  @ApiOperation({ summary: 'Создать новую задачу' })
  @ApiResponse({
    status: 201,
    description: 'Задача успешно создана',
    type: TaskResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Неверные данные' })
  @ApiResponse({ status: 401, description: 'Не авторизован' })
  create(@Body() createTaskDto: CreateTaskDto, @CurrentUser() user: any) {
    return this.tasksService.create(createTaskDto, user.userId);
  }

  @Get()
  @ApiOperation({ summary: 'Получить все задачи текущего пользователя' })
  @ApiQuery({
    name: 'filter',
    required: false,
    enum: ['current', 'past'],
    description: 'Фильтр по статусу задачи',
  })
  @ApiResponse({
    status: 200,
    description: 'Список задач',
    type: [TaskResponseDto],
  })
  @ApiResponse({ status: 401, description: 'Не авторизован' })
  findAll(@CurrentUser() user: any, @Query('filter') filter?: 'current' | 'past') {
    return this.tasksService.findAll(user.userId, filter);
  }

  @Get('meeting/:meetingId')
  @ApiOperation({ summary: 'Получить все задачи из конкретной встречи' })
  @ApiParam({ name: 'meetingId', description: 'ID встречи' })
  @ApiResponse({
    status: 200,
    description: 'Список задач встречи',
    type: [TaskResponseDto],
  })
  @ApiResponse({ status: 400, description: 'Неверный ID встречи' })
  @ApiResponse({ status: 401, description: 'Не авторизован' })
  findByMeeting(@Param('meetingId') meetingId: string, @CurrentUser() user: any) {
    return this.tasksService.findByMeeting(meetingId, user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Получить задачу по ID' })
  @ApiParam({ name: 'id', description: 'ID задачи' })
  @ApiResponse({
    status: 200,
    description: 'Детали задачи',
    type: TaskResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Не авторизован' })
  @ApiResponse({ status: 403, description: 'Можно просматривать только свои задачи' })
  @ApiResponse({ status: 404, description: 'Задача не найдена' })
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.tasksService.findOne(id, user.userId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Обновить задачу (только автор)' })
  @ApiParam({ name: 'id', description: 'ID задачи' })
  @ApiResponse({
    status: 200,
    description: 'Задача обновлена',
    type: TaskResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Не авторизован' })
  @ApiResponse({ status: 403, description: 'Только автор может обновить задачу' })
  update(@Param('id') id: string, @Body() updateTaskDto: UpdateTaskDto, @CurrentUser() user: any) {
    return this.tasksService.update(id, updateTaskDto, user.userId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Удалить задачу (только автор)' })
  @ApiParam({ name: 'id', description: 'ID задачи' })
  @ApiResponse({ status: 200, description: 'Задача удалена' })
  @ApiResponse({ status: 401, description: 'Не авторизован' })
  @ApiResponse({ status: 403, description: 'Только автор может удалить задачу' })
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.tasksService.remove(id, user.userId);
  }

  @Patch(':id/approve')
  @ApiOperation({ summary: 'Approve or unapprove task (creator only)' })
  @ApiParam({ name: 'id', description: 'ID задачи' })
  @ApiResponse({
    status: 200,
    description: 'Task approval status updated',
  })
  @ApiResponse({ status: 401, description: 'Не авторизован' })
  @ApiResponse({ status: 403, description: 'Only meeting creator can approve tasks' })
  @ApiResponse({ status: 404, description: 'Task or meeting not found' })
  approveTask(@Param('id') id: string, @Body() dto: ApproveTaskDto, @CurrentUser() user: any) {
    return this.tasksService.setApproval(id, dto.approved, user.userId);
  }
}
