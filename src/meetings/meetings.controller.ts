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
import { MeetingsService } from './meetings.service';
import { CreateMeetingDto } from './dto/create-meeting.dto';
import { UpdateMeetingDto } from './dto/update-meeting.dto';
import { ChangePhaseDto } from './dto/change-phase.dto';
import { SubmitEvaluationDto } from './dto/submit-evaluation.dto';
import { SubmitSummaryDto } from './dto/submit-summary.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('meetings')
@UseGuards(JwtAuthGuard)
export class MeetingsController {
  constructor(private readonly meetingsService: MeetingsService) {}

  @Post()
  create(
    @Body() createMeetingDto: CreateMeetingDto,
    @CurrentUser() user: any,
  ) {
    return this.meetingsService.create(createMeetingDto, user.userId);
  }

  @Get()
  findAll(
    @CurrentUser() user: any,
    @Query('filter') filter?: 'current' | 'past',
  ) {
    return this.meetingsService.findAll(user.userId, filter);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.meetingsService.findOne(id, user.userId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateMeetingDto: UpdateMeetingDto,
    @CurrentUser() user: any,
  ) {
    return this.meetingsService.update(id, updateMeetingDto, user.userId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.meetingsService.remove(id, user.userId);
  }

  @Patch(':id/phase')
  changePhase(
    @Param('id') id: string,
    @Body() changePhaseDto: ChangePhaseDto,
    @CurrentUser() user: any,
  ) {
    return this.meetingsService.changePhase(id, changePhaseDto, user.userId);
  }

  @Post(':id/evaluations')
  submitEvaluation(
    @Param('id') id: string,
    @Body() evaluationDto: SubmitEvaluationDto,
    @CurrentUser() user: any,
  ) {
    return this.meetingsService.submitEvaluation(id, evaluationDto, user.userId);
  }

  @Post(':id/summaries')
  submitSummary(
    @Param('id') id: string,
    @Body() summaryDto: SubmitSummaryDto,
    @CurrentUser() user: any,
  ) {
    return this.meetingsService.submitSummary(id, summaryDto, user.userId);
  }

  @Get(':id/statistics')
  getStatistics(@Param('id') id: string, @CurrentUser() user: any) {
    return this.meetingsService.getStatistics(id, user.userId);
  }
}
