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
import { ChangePhaseDto } from './dto/change-phase.dto';
import { SubmitEmotionalEvaluationDto } from './dto/submit-emotional-evaluation.dto';
import { SubmitUnderstandingContributionDto } from './dto/submit-understanding-contribution.dto';
import { SubmitTaskPlanningDto } from './dto/submit-task-planning.dto';
import { SubmitTaskEvaluationDto } from './dto/submit-task-evaluation.dto';
import { MeetingResponseDto, StatisticsResponseDto } from './dto/meeting-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('meetings')
@Controller('meetings')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class MeetingsController {
  constructor(private readonly meetingsService: MeetingsService) {}

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
  @ApiOperation({ summary: 'Получить все встречи текущего пользователя' })
  @ApiQuery({
    name: 'filter',
    required: false,
    enum: ['current', 'past', 'upcoming'],
    description: 'Фильтр по статусу встречи',
  })
  @ApiResponse({
    status: 200,
    description: 'Список встреч',
    type: [MeetingResponseDto],
  })
  @ApiResponse({ status: 401, description: 'Не авторизован' })
  findAll(@CurrentUser() user: any, @Query('filter') filter?: 'current' | 'past' | 'upcoming') {
    return this.meetingsService.findAll(user.userId, filter);
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

  @Patch(':id/phase')
  @ApiOperation({ summary: 'Изменить фазу встречи (только создатель)' })
  @ApiParam({ name: 'id', description: 'ID встречи' })
  @ApiResponse({
    status: 200,
    description: 'Фаза встречи изменена',
    type: MeetingResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Не авторизован' })
  @ApiResponse({ status: 403, description: 'Только создатель может менять фазу' })
  changePhase(
    @Param('id') id: string,
    @Body() changePhaseDto: ChangePhaseDto,
    @CurrentUser() user: any,
  ) {
    return this.meetingsService.changePhase(id, changePhaseDto, user.userId);
  }

  @Post(':id/join')
  @ApiOperation({
    summary: '[DEPRECATED] Присоединиться к встрече (войти в комнату)',
    deprecated: true,
    description: `
      ⚠️ DEPRECATED: Используйте WebSocket event 'join_meeting' вместо этого REST endpoint.
      
      Этот endpoint оставлен для обратной совместимости, но не обеспечивает 
      надежное отслеживание присутствия в реальном времени.
      
      Для корректной работы голосования используйте Socket.IO:
      socket.emit('join_meeting', { meetingId })
    `,
  })
  @ApiParam({ name: 'id', description: 'ID встречи' })
  @ApiResponse({
    status: 200,
    description: 'Участник присоединился к встрече (устаревший метод)',
    type: MeetingResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Не авторизован' })
  @ApiResponse({ status: 403, description: 'Только участники могут присоединиться к встрече' })
  joinMeeting(@Param('id') id: string, @CurrentUser() user: any) {
    return this.meetingsService.joinMeeting(id, user.userId);
  }

  @Post(':id/leave')
  @ApiOperation({
    summary: '[DEPRECATED] Покинуть встречу (выйти из комнаты)',
    deprecated: true,
    description: `
      ⚠️ DEPRECATED: Используйте WebSocket event 'leave_meeting' вместо этого REST endpoint.
      
      Для корректной работы голосования используйте Socket.IO:
      socket.emit('leave_meeting', { meetingId })
    `,
  })
  @ApiParam({ name: 'id', description: 'ID встречи' })
  @ApiResponse({
    status: 200,
    description: 'Участник покинул встречу (устаревший метод)',
    type: MeetingResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Не авторизован' })
  leaveMeeting(@Param('id') id: string, @CurrentUser() user: any) {
    return this.meetingsService.leaveMeeting(id, user.userId);
  }

  @Post(':id/emotional-evaluations')
  @ApiOperation({
    summary:
      'Отправить эмоциональную оценку (фаза emotional_evaluation, все участники включая создателя)',
  })
  @ApiParam({ name: 'id', description: 'ID встречи' })
  @ApiResponse({
    status: 201,
    description: 'Эмоциональная оценка отправлена',
    type: MeetingResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Встреча не в фазе emotional_evaluation' })
  @ApiResponse({ status: 401, description: 'Не авторизован' })
  submitEmotionalEvaluation(
    @Param('id') id: string,
    @Body() evaluationDto: SubmitEmotionalEvaluationDto,
    @CurrentUser() user: any,
  ) {
    return this.meetingsService.submitEmotionalEvaluation(id, evaluationDto, user.userId);
  }

  @Post(':id/understanding-contributions')
  @ApiOperation({
    summary:
      'Отправить понимание и вклад (фаза understanding_contribution, все участники включая создателя)',
  })
  @ApiParam({ name: 'id', description: 'ID встречи' })
  @ApiResponse({
    status: 201,
    description: 'Понимание и вклад отправлены',
    type: MeetingResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Встреча не в фазе understanding_contribution' })
  @ApiResponse({ status: 401, description: 'Не авторизован' })
  submitUnderstandingContribution(
    @Param('id') id: string,
    @Body() contributionDto: SubmitUnderstandingContributionDto,
    @CurrentUser() user: any,
  ) {
    return this.meetingsService.submitUnderstandingContribution(id, contributionDto, user.userId);
  }

  @Post(':id/task-plannings')
  @ApiOperation({
    summary: 'Отправить планирование задачи (фаза task_planning, все участники включая создателя)',
  })
  @ApiParam({ name: 'id', description: 'ID встречи' })
  @ApiResponse({
    status: 201,
    description: 'Планирование задачи отправлено и задача создана',
    type: MeetingResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Встреча не в фазе task_planning' })
  @ApiResponse({ status: 401, description: 'Не авторизован' })
  submitTaskPlanning(
    @Param('id') id: string,
    @Body() taskDto: SubmitTaskPlanningDto,
    @CurrentUser() user: any,
  ) {
    return this.meetingsService.submitTaskPlanning(id, taskDto, user.userId);
  }

  @Post(':id/task-evaluations')
  @ApiOperation({
    summary:
      'Отправить оценки важности задач (фаза task_evaluation, все участники включая создателя)',
  })
  @ApiParam({ name: 'id', description: 'ID встречи' })
  @ApiResponse({
    status: 201,
    description: 'Оценки задач отправлены',
    type: MeetingResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Встреча не в фазе task_evaluation или оценки уже отправлены',
  })
  @ApiResponse({ status: 401, description: 'Не авторизован' })
  @ApiResponse({ status: 403, description: 'Только участники и создатель могут отправлять оценки' })
  submitTaskEvaluation(
    @Param('id') id: string,
    @Body() evaluationDto: SubmitTaskEvaluationDto,
    @CurrentUser() user: any,
  ) {
    return this.meetingsService.submitTaskEvaluation(id, evaluationDto, user.userId);
  }

  @Get(':id/task-evaluation-analytics')
  @ApiOperation({ summary: 'Получить аналитику оценок задач (только создатель)' })
  @ApiParam({ name: 'id', description: 'ID встречи' })
  @ApiResponse({
    status: 200,
    description: 'Аналитика оценок задач с агрегированными данными',
  })
  @ApiResponse({ status: 401, description: 'Не авторизован' })
  @ApiResponse({ status: 403, description: 'Только создатель может просматривать аналитику' })
  getTaskEvaluationAnalytics(@Param('id') id: string, @CurrentUser() user: any) {
    return this.meetingsService.getTaskEvaluationAnalytics(id, user.userId);
  }

  @Get(':id/voting-info')
  @ApiOperation({
    summary: 'Получить информацию о голосовании с активными участниками (только создатель)',
    description: `
      Возвращает список участников голосования и статус отправки.
      
      ВАЖНО: Участниками голосования являются только те пользователи, которые:
      - Вызвали endpoint /meetings/:id/join (присоединились к встрече)
      - НЕ вызвали endpoint /meetings/:id/leave (не покинули встречу)
      
      Создатель встречи включается в список участников ТОЛЬКО если он присоединился к встрече.
      Нет специальной логики для создателя - он обрабатывается как обычный участник.
    `,
  })
  @ApiParam({ name: 'id', description: 'ID встречи' })
  @ApiResponse({
    status: 200,
    description: `
      Информация о голосовании с участниками на основе join/leave.
      
      Структура ответа:
      - votingParticipants: массив пользователей, активно присоединившихся к встрече
      - totalVotingParticipants: количество активных участников
      - submissionStatus: кто уже отправил голос в текущей фазе
      - votingProgress: прогресс голосования (отправлено/всего)
    `,
  })
  @ApiResponse({ status: 401, description: 'Не авторизован' })
  @ApiResponse({
    status: 403,
    description: 'Только создатель может просматривать информацию о голосовании',
  })
  getVotingInfo(@Param('id') id: string, @CurrentUser() user: any) {
    return this.meetingsService.getVotingInfo(id, user.userId);
  }

  @Get(':id/active-participants')
  @ApiOperation({
    summary: 'Получить список активных участников в комнате встречи (Socket.IO-based)',
    description: `
      Возвращает список участников, которые активно подключены через WebSocket.
      
      ВАЖНО: Этот endpoint возвращает данные из Socket.IO в реальном времени.
      Участники отслеживаются через WebSocket соединения:
      - Добавляются при emit('join_meeting')
      - Удаляются при emit('leave_meeting') или disconnect
      
      Используйте для:
      - Начальной загрузки списка участников
      - Проверки статуса подключения
      
      Для real-time обновлений подключитесь к Socket.IO и слушайте:
      socket.on('participants_updated', (data) => { ... })
    `,
  })
  @ApiParam({ name: 'id', description: 'ID встречи' })
  @ApiResponse({
    status: 200,
    description: 'Список активных участников на основе WebSocket подключений',
  })
  @ApiResponse({ status: 401, description: 'Не авторизован' })
  getActiveParticipants(@Param('id') id: string, @CurrentUser() user: any) {
    return this.meetingsService.getActiveParticipants(id, user.userId);
  }

  @Get(':id/all-submissions')
  @ApiOperation({
    summary: 'Получить все ответы участников в упрощенном формате (только создатель)',
  })
  @ApiParam({ name: 'id', description: 'ID встречи' })
  @ApiResponse({
    status: 200,
    description: 'Все ответы участников по всем фазам в упрощенном формате',
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

  @Get(':id/pending-voters')
  @ApiOperation({
    summary: 'Get active participants who have not voted yet (socket-synced)',
    description: `
      Returns list of active participants (connected via WebSocket) who haven't submitted
      their response in the current meeting phase.
      
      IMPORTANT: This uses real-time Socket.IO data to determine who's active,
      then filters out those who have already submitted.
      
      Only the meeting creator can view this information.
    `,
  })
  @ApiParam({ name: 'id', description: 'Meeting ID' })
  @ApiResponse({
    status: 200,
    description: 'List of pending voters with their connection info',
  })
  @ApiResponse({ status: 401, description: 'Not authorized' })
  @ApiResponse({ status: 403, description: 'Only creator can view pending voters' })
  @ApiResponse({ status: 404, description: 'Meeting not found' })
  getPendingVoters(@Param('id') id: string, @CurrentUser() user: any) {
    return this.meetingsService.getPendingVoters(id, user.userId);
  }
}
