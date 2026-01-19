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
import { SubmitEvaluationDto } from './dto/submit-evaluation.dto';
import { SubmitSummaryDto } from './dto/submit-summary.dto';
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
  create(
    @Body() createMeetingDto: CreateMeetingDto,
    @CurrentUser() user: any,
  ) {
    return this.meetingsService.create(createMeetingDto, user.userId);
  }

  @Get()
  @ApiOperation({ summary: 'Получить все встречи текущего пользователя' })
  @ApiQuery({
    name: 'filter',
    required: false,
    enum: ['current', 'past'],
    description: 'Фильтр по статусу встречи',
  })
  @ApiResponse({
    status: 200,
    description: 'Список встреч',
    type: [MeetingResponseDto],
  })
  @ApiResponse({ status: 401, description: 'Не авторизован' })
  findAll(
    @CurrentUser() user: any,
    @Query('filter') filter?: 'current' | 'past',
  ) {
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

  @Post(':id/evaluations')
  @ApiOperation({ summary: 'Отправить оценку (фаза evaluation)' })
  @ApiParam({ name: 'id', description: 'ID встречи' })
  @ApiResponse({
    status: 201,
    description: 'Оценка отправлена',
    type: MeetingResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Встреча не в фазе evaluation' })
  @ApiResponse({ status: 401, description: 'Не авторизован' })
  submitEvaluation(
    @Param('id') id: string,
    @Body() evaluationDto: SubmitEvaluationDto,
    @CurrentUser() user: any,
  ) {
    return this.meetingsService.submitEvaluation(id, evaluationDto, user.userId);
  }

  @Post(':id/summaries')
  @ApiOperation({ summary: 'Отправить резюме (фаза summary)' })
  @ApiParam({ name: 'id', description: 'ID встречи' })
  @ApiResponse({
    status: 201,
    description: 'Резюме отправлено',
    type: MeetingResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Встреча не в фазе summary' })
  @ApiResponse({ status: 401, description: 'Не авторизован' })
  submitSummary(
    @Param('id') id: string,
    @Body() summaryDto: SubmitSummaryDto,
    @CurrentUser() user: any,
  ) {
    return this.meetingsService.submitSummary(id, summaryDto, user.userId);
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
}
