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
import { MeetingsService } from './meetings.service';
import { CreateMeetingDto } from './dto/create-meeting.dto';
import { UpdateMeetingDto } from './dto/update-meeting.dto';
import { MeetingResponseDto, StatisticsResponseDto } from './dto/meeting-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { MeetingStatusCron } from './workers/meeting-status.cron';

@ApiTags('meetings')
@Controller('meetings')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class MeetingsController {
  constructor(
    private readonly meetingsService: MeetingsService,
    private readonly meetingStatusCron: MeetingStatusCron,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Создать новую встречу' })
  @ApiResponse({
    status: 201,
    description: 'Встреча успешно создана',
    type: MeetingResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Не авторизован' })
  create(@Body() createMeetingDto: CreateMeetingDto, @CurrentUser() user: any) {
    return this.meetingsService.create(createMeetingDto, user.userId);
  }

  @Get()
  @ApiOperation({
    summary: 'Get meetings for the current user',
    description:
      'Returns meetings where the user is a participant. ' +
      'Optionally scope to a specific project with ?projectId=.',
  })
  @ApiQuery({
    name: 'filter',
    required: false,
    enum: ['current', 'past', 'upcoming'],
    description: 'Filter by meeting status',
  })
  @ApiQuery({
    name: 'projectId',
    required: false,
    type: String,
    description: 'Scope results to a specific project',
  })
  @ApiResponse({
    status: 200,
    description: 'Meeting list',
    type: [MeetingResponseDto],
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  findAll(
    @CurrentUser() user: any,
    @Query('filter') filter?: 'current' | 'past' | 'upcoming',
    @Query('projectId') projectId?: string,
  ) {
    return this.meetingsService.findAll(user.userId, filter, projectId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Получить встречу по ID' })
  @ApiParam({ name: 'id', description: 'ID встречи' })
  @ApiResponse({
    status: 200,
    description: 'Детали встречи',
    type: MeetingResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Не авторизован' })
  @ApiResponse({ status: 403, description: 'Нет доступа к встрече' })
  @ApiResponse({ status: 404, description: 'Встреча не найдена' })
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.meetingsService.findOne(id, user.userId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Обновить встречу (только создатель)' })
  @ApiParam({ name: 'id', description: 'ID встречи' })
  @ApiResponse({
    status: 200,
    description: 'Встреча обновлена',
    type: MeetingResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Не авторизован' })
  @ApiResponse({ status: 403, description: 'Только создатель может обновить встречу' })
  update(
    @Param('id') id: string,
    @Body() updateMeetingDto: UpdateMeetingDto,
    @CurrentUser() user: any,
  ) {
    return this.meetingsService.update(id, updateMeetingDto, user.userId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Удалить встречу (только создатель)' })
  @ApiParam({ name: 'id', description: 'ID встречи' })
  @ApiResponse({ status: 200, description: 'Встреча удалена' })
  @ApiResponse({ status: 401, description: 'Не авторизован' })
  @ApiResponse({ status: 403, description: 'Только создатель может удалить встречу' })
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.meetingsService.remove(id, user.userId);
  }

  // Phase submissions are now exclusively handled via WebSocket (user:submit_vote).
  // The deprecated REST submission endpoints below have been removed.

  @Get(':id/task-evaluation-analytics')
  @ApiOperation({ summary: 'Получить аналитику оценок задач (только создатель)' })
  @ApiParam({ name: 'id', description: 'ID встречи' })
  @ApiResponse({ status: 200, description: 'Аналитика оценок задач с агрегированными данными' })
  @ApiResponse({ status: 401, description: 'Не авторизован' })
  @ApiResponse({ status: 403, description: 'Только создатель может просматривать аналитику' })
  getTaskEvaluationAnalytics(@Param('id') id: string, @CurrentUser() user: any) {
    return this.meetingsService.getTaskEvaluationAnalytics(id, user.userId);
  }

  // voting-info, active-participants, and pending-voters are now pushed via
  // WebSocket events (room:pending_voters_updated, room:participants_updated).
  // Their REST endpoints have been removed to prevent stale polling.

  @Get(':id/all-submissions')
  @ApiOperation({
    summary: 'Получить все ответы участников в упрощенном формате (только создатель)',
    description: `
      Получить все ответы участников по всем фазам.
      
      ВАЖНО: Показывает все оценки, включая пустые!
      - Участники могут не голосовать вообще (пустой массив [])
      - Участники могут оценить только некоторых
      - Создатель видит все оценки, даже пустые
      - Если участник не оценил кого-то, этого не будет в списке evaluations
      - Используйте для отслеживания прогресса голосования
    `,
  })
  @ApiParam({ name: 'id', description: 'ID встречи' })
  @ApiResponse({
    status: 200,
    description: 'Все ответы участников (включая пустые оценки)',
  })
  @ApiResponse({ status: 401, description: 'Не авторизован' })
  @ApiResponse({ status: 403, description: 'Только создатель может просматривать все ответы' })
  getAllSubmissions(@Param('id') id: string, @CurrentUser() user: any) {
    return this.meetingsService.getAllSubmissions(id, user.userId);
  }

  @Get(':id/phase-submissions')
  @ApiOperation({
    summary: 'Получить детальную информацию о всех ответах участников (только создатель)',
  })
  @ApiParam({ name: 'id', description: 'ID встречи' })
  @ApiResponse({
    status: 200,
    description: 'Детальная информация о всех ответах участников по всем фазам',
  })
  @ApiResponse({ status: 401, description: 'Не авторизован' })
  @ApiResponse({
    status: 403,
    description: 'Только создатель может просматривать ответы участников',
  })
  getPhaseSubmissions(@Param('id') id: string, @CurrentUser() user: any) {
    return this.meetingsService.getPhaseSubmissions(id, user.userId);
  }

  @Get(':id/statistics')
  @ApiOperation({ summary: 'Получить статистику встречи (только завершенные)' })
  @ApiParam({ name: 'id', description: 'ID встречи' })
  @ApiResponse({
    status: 200,
    description: 'Статистика встречи',
    type: StatisticsResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Статистика доступна только для завершенных встреч' })
  @ApiResponse({ status: 401, description: 'Не авторизован' })
  getStatistics(@Param('id') id: string, @CurrentUser() user: any) {
    return this.meetingsService.getStatistics(id, user.userId);
  }

  @Get(':id/final-stats')
  @ApiOperation({
    summary: 'Получить финальную статистику встречи со всеми данными участников (только создатель)',
    description: `
      Возвращает подробную статистику для каждого участника:
      - Какие оценки участник поставил и кому
      - Какие задачи участник создал и свой уровень вклада
      - Какие участники присвоили уровни вклада задачам
    `,
  })
  @ApiParam({ name: 'id', description: 'ID встречи' })
  @ApiResponse({
    status: 200,
    description: 'Подробная финальная статистика по всем участникам',
  })
  @ApiResponse({ status: 401, description: 'Не авторизован' })
  @ApiResponse({
    status: 403,
    description: 'Только создатель может просматривать финальную статистику',
  })
  getFinalStatistics(@Param('id') id: string, @CurrentUser() user: any) {
    return this.meetingsService.getFinalStatistics(id, user.userId);
  }

  @Post('test/trigger-activation')
  @ApiOperation({
    summary: '[TEST] Manually trigger meeting activation job',
    description: `
      Test endpoint to manually trigger the meeting activation job.
      
      This is useful for testing the BullMQ queue and job processing locally.
      
      The job will check for meetings with status=UPCOMING and upcomingDate <= now,
      and activate them.
    `,
  })
  @ApiResponse({
    status: 200,
    description: 'Job triggered successfully',
  })
  async testTriggerActivation() {
    return this.meetingStatusCron.triggerManually();
  }
}
