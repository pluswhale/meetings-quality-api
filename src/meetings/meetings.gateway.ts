import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UsePipes, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { Meeting, MeetingDocument, MeetingPhase, MeetingStatus } from './schemas/meeting.schema';
import { Task, TaskDocument } from '../tasks/schemas/task.schema';
import { MeetingsRedisService, RetroTaskStatus } from './meetings.redis.service';
import { MeetingsFlushService } from './meetings.flush.service';
import { UsersService } from '../users/users.service';
import { WsRetroStatusDto } from './dto/ws-retro-status.dto';
import { WsAdvancePhaseDto, WsApproveTaskDto, WsFinishMeetingDto } from './dto/ws-advance-phase.dto';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuthenticatedSocket extends Socket {
  userId?: string;
  userEmail?: string;
  userFullName?: string;
}

/**
 * Resolves a populated-or-raw ObjectId field to a string.
 * Avoids the scattered `(field as any)?._id || field` anti-pattern.
 */
function resolveId(field: unknown): string {
  if (field && typeof field === 'object' && '_id' in field) {
    return String((field as { _id: unknown })._id);
  }
  return String(field);
}

@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
@WebSocketGateway({
  cors: { origin: '*', methods: ['GET', 'POST'], credentials: true },
  transports: ['websocket', 'polling'],
})
export class MeetingsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(MeetingsGateway.name);

  /** Maps socketId → { userId, meetingId } for disconnect cleanup. */
  private readonly socketMeta = new Map<string, { userId: string; meetingId: string }>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly redisService: MeetingsRedisService,
    private readonly flushService: MeetingsFlushService,
    private readonly usersService: UsersService,
    @InjectModel(Meeting.name) private readonly meetingModel: Model<MeetingDocument>,
    @InjectModel(Task.name) private readonly taskModel: Model<TaskDocument>,
  ) {}

  // ─── Connection lifecycle ──────────────────────────────────────────────────

  async handleConnection(client: AuthenticatedSocket) {
    try {
      let raw =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization ||
        client.handshake.query?.token;

      if (!raw) {
        this.emit(client, 'error:unauthorized', { message: 'Token missing', code: 'NO_TOKEN' });
        client.disconnect();
        return;
      }

      if (Array.isArray(raw)) raw = raw[0];
      const token = String(raw).replace(/^Bearer\s+/i, '').trim();
      const payload = await this.jwtService.verifyAsync(token);

      client.userId = payload.userId || payload.sub;
      client.userEmail = payload.email;

      // fullName was added to JWT in a later version. Fall back to a DB lookup
      // for clients holding an older token that lacks the field.
      if (payload.fullName) {
        client.userFullName = payload.fullName;
      } else {
        try {
          const user = await this.usersService.findById(client.userId!);
          client.userFullName = (user as { fullName?: string }).fullName ?? null;
        } catch {
          client.userFullName = null;
        }
      }

      this.logger.log(`[CONNECT] ${client.id} | User: ${client.userId} | Name: ${client.userFullName}`);
    } catch {
      this.emit(client, 'error:unauthorized', { message: 'Invalid token', code: 'INVALID_TOKEN' });
      client.disconnect();
    }
  }

  async handleDisconnect(client: AuthenticatedSocket) {
    const meta = this.socketMeta.get(client.id);
    if (!meta) return;

    const { userId, meetingId } = meta;
    this.socketMeta.delete(client.id);

    await this.redisService.removeParticipant(meetingId, userId);

    const participants = await this.redisService.getParticipants(meetingId);
    const room = roomName(meetingId);

    this.server.to(room).emit('room:participants_updated', { meetingId, participants });

    const state = await this.redisService.getHotState(meetingId);
    if (state) {
      const pending = await this.redisService.getPendingParticipants(meetingId, state.phase);
      const submitted = await this.redisService.getSubmittedIds(meetingId, state.phase);
      this.server.to(room).emit('room:pending_voters_updated', {
        meetingId,
        phase: state.phase,
        pending,
        submitted,
      });
    }

    this.logger.log(`[DISCONNECT] ${userId} left ${meetingId}`);
  }

  // ─── room:join ─────────────────────────────────────────────────────────────

  @SubscribeMessage('room:join')
  async handleJoinRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { meetingId: string },
  ) {
    const userId = this.requireAuth(client);
    const { meetingId } = data;

    if (!meetingId || !Types.ObjectId.isValid(meetingId)) {
      return this.ack(false, 'Invalid meetingId');
    }

    const meeting = await this.meetingModel
      .findById(meetingId)
      .select('participantIds creatorId status currentPhase previousMeetingId projectId')
      .lean<{
        participantIds: Types.ObjectId[];
        creatorId: Types.ObjectId;
        status: MeetingStatus;
        currentPhase: MeetingPhase;
        previousMeetingId: Types.ObjectId | null;
        projectId: Types.ObjectId | null;
      }>()
      .exec();

    if (!meeting) return this.ack(false, 'Meeting not found');

    const isCreatorJoining = resolveId(meeting.creatorId) === userId;
    // Guard against documents where participantIds is missing (legacy data).
    const participantIds: Types.ObjectId[] = meeting.participantIds ?? [];
    const alreadyParticipant =
      isCreatorJoining ||
      participantIds.some((id) => resolveId(id) === userId);

    // ── Creator-First Rule ────────────────────────────────────────────────────
    // Participants cannot join until the creator has connected at least once.
    // We use the presence of creator_socket in Redis as the signal.
    // Only enforced for UPCOMING meetings — once ACTIVE, anyone can rejoin freely.
    if (!isCreatorJoining && meeting.status === MeetingStatus.UPCOMING) {
      const creatorSocket = await this.redisService.getCreatorSocket(meetingId);
      if (!creatorSocket) {
        this.logger.log(
          `[JOIN] Blocked ${userId} from ${meetingId} — creator not present yet`,
        );
        return this.ack(false, 'creator_not_present');
      }
    }

    // Auto-register: any authenticated user who joins the room is added as a
    // participant in MongoDB so they appear in the participants list.
    if (!alreadyParticipant) {
      await this.meetingModel.findByIdAndUpdate(meetingId, {
        $addToSet: { participantIds: new Types.ObjectId(userId) },
      });
      this.logger.log(
        `[JOIN] Auto-added ${userId} to participantIds for meeting ${meetingId}`,
      );
    }

    const room = roomName(meetingId);
    client.join(room);

    // ── Initialise / refresh Redis state ────────────────────────────────────
    let hotState = await this.redisService.getHotState(meetingId);

    if (!hotState) {
      // First join after server restart — reconstruct from MongoDB
      await this.redisService.setHotState(meetingId, meeting.currentPhase, meeting.status);
      hotState = { phase: meeting.currentPhase, status: meeting.status, previousPhase: null, startedAt: new Date().toISOString() };
    }

    // ── Register participant ──────────────────────────────────────────────────
    const now = new Date().toISOString();
    await this.redisService.addParticipant(meetingId, {
      userId,
      fullName: client.userFullName ?? null,
      email: client.userEmail ?? null,
      socketId: client.id,
      joinedAt: now,
      lastSeen: now,
    });

    this.socketMeta.set(client.id, { userId, meetingId });

    // ── Creator: register socket + activate UPCOMING meeting ─────────────────
    if (isCreatorJoining) {
      await this.redisService.setCreatorSocket(meetingId, client.id);

      // Transition UPCOMING → ACTIVE when the creator first joins.
      if (meeting.status === MeetingStatus.UPCOMING) {
        await this.meetingModel.findByIdAndUpdate(meetingId, {
          $set: { status: MeetingStatus.ACTIVE },
        });
        await this.redisService.setHotState(meetingId, hotState.phase, MeetingStatus.ACTIVE);
        hotState = { ...hotState, status: MeetingStatus.ACTIVE };
        this.logger.log(`[JOIN] Creator joined — meeting ${meetingId} is now ACTIVE`);
      }
    }

    // ── Build state-sync payload ─────────────────────────────────────────────
    // All users receive current votes so the live panel hydrates on join/reconnect.
    const [participants, submittedIds, myDraft, retroStatuses, currentVotes, taskApprovals] = await Promise.all([
      this.redisService.getParticipants(meetingId),
      this.redisService.getSubmittedIds(meetingId, hotState.phase),
      this.redisService.getDraft(meetingId, hotState.phase, userId),
      meeting.previousMeetingId
        ? this.redisService.getAllRetroStatuses(meetingId)
        : Promise.resolve([] as RetroTaskStatus[]),
      this.redisService.getAllVotes<Record<string, unknown>>(meetingId, hotState.phase as MeetingPhase),
      // Approvals are relevant during task_planning but safe to always include.
      this.redisService.getAllTaskApprovals(meetingId),
    ]);

    const pendingIds = new Set(submittedIds);
    const pendingUserIds = participants
      .filter((p) => !pendingIds.has(p.userId))
      .map((p) => p.userId);

    // Fetch retro tasks from the previous meeting.
    // Creator receives ALL tasks so they can monitor progress.
    // Each participant receives only their own tasks to review.
    let retroTasks: unknown[] = [];
    if (meeting.previousMeetingId && hotState.phase === MeetingPhase.RETROSPECTIVE) {
      const retroFilter = isCreatorJoining
        ? { meetingId: meeting.previousMeetingId }
        : { meetingId: meeting.previousMeetingId, authorId: new Types.ObjectId(userId) };

      retroTasks = await this.taskModel
        .find(retroFilter)
        .select('_id authorId description commonQuestion deadline contributionImportance estimateHours isCompleted retroStatus')
        .lean()
        .exec();
    }

    // Build votes map: { [userId]: { payload, fullName, updatedAt } }
    // Sent to ALL joining users so the live panel hydrates on join/reconnect.
    const votesMap: Record<string, { payload: Record<string, unknown>; fullName: string | null; updatedAt: string }> = {};
    const hydrationTs = new Date().toISOString();
    for (const { userId: voteUserId, vote } of currentVotes) {
      const participant = participants.find((p) => p.userId === voteUserId);
      votesMap[voteUserId] = {
        payload: vote as Record<string, unknown>,
        fullName: participant?.fullName ?? null,
        updatedAt: hydrationTs,
      };
    }

    const stateSync = {
      meetingId,
      phase: hotState.phase,
      status: hotState.status,
      participants,
      submittedUserIds: submittedIds,
      pendingUserIds,
      hasSubmitted: submittedIds.includes(userId),
      myDraft,
      retroTasks,
      retroStatuses,
      isCreator: isCreatorJoining,
      previousMeetingId: meeting.previousMeetingId?.toString() ?? null,
      // Live votes map for instant panel hydration on reconnect.
      votes: votesMap,
      // Task approval flags — always sent so the admin panel hydrates correctly.
      taskApprovals,
    };

    client.emit('room:state_sync', stateSync);

    // ── Broadcast updated participant list ────────────────────────────────────
    this.server.to(room).emit('room:participants_updated', { meetingId, participants });

    this.logger.log(`[JOIN] ${userId} joined ${meetingId} | phase=${hotState.phase}`);
    return this.ack(true, undefined, { meetingId, phase: hotState.phase });
  }

  // ─── room:leave ───────────────────────────────────────────────────────────

  @SubscribeMessage('room:leave')
  async handleLeaveRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { meetingId: string },
  ) {
    const userId = this.requireAuth(client);
    const { meetingId } = data;
    const room = roomName(meetingId);

    client.leave(room);
    await this.redisService.removeParticipant(meetingId, userId);
    this.socketMeta.delete(client.id);

    const participants = await this.redisService.getParticipants(meetingId);
    this.server.to(room).emit('room:participants_updated', { meetingId, participants });

    return this.ack(true);
  }

  // ─── user:submit_vote ────────────────────────────────────────────────────

  @SubscribeMessage('user:submit_vote')
  async handleSubmitVote(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: Record<string, unknown>,
  ) {
    const userId = this.requireAuth(client);
    const meetingId = data.meetingId as string;
    const phase = data.phase as MeetingPhase;

    if (!meetingId || !phase) return this.ack(false, 'meetingId and phase required');

    const hotState = await this.redisService.getHotState(meetingId);
    if (!hotState) return this.ack(false, 'Meeting not active');

    if (hotState.phase !== phase) {
      return this.ack(false, `Phase mismatch: meeting is in ${hotState.phase}`);
    }

    // Store vote in Redis
    await this.redisService.setVote(meetingId, phase, userId, data);
    await this.redisService.markSubmitted(meetingId, phase, userId);

    const submittedAt = new Date().toISOString();
    const room = roomName(meetingId);

    // Broadcast to room — anonymised (no data)
    this.server.to(room).emit('room:vote_received', { meetingId, phase, userId, submittedAt });

    // Update pending voters list for entire room
    const [pending, submitted] = await Promise.all([
      this.redisService.getPendingParticipants(meetingId, phase),
      this.redisService.getSubmittedIds(meetingId, phase),
    ]);

    this.server.to(room).emit('room:pending_voters_updated', { meetingId, phase, pending, submitted });

    // Send full submission data to creator only.
    // Always send even if the creator submitted their own vote so they see it
    // in the admin panel.
    const creatorSocketId = await this.redisService.getCreatorSocket(meetingId);
    if (creatorSocketId) {
      const participantInfo = await this.redisService.getParticipants(meetingId).then(
        (ps) => ps.find((p) => p.userId === userId),
      );
      this.server.to(creatorSocketId).emit('room:submission_created', {
        id: `${meetingId}:${phase}:${userId}`,
        meetingId,
        phase,
        userId,
        fullName: participantInfo?.fullName ?? null,
        submittedAt,
        data,
      });

      const total = (await this.redisService.getParticipants(meetingId)).length;
      this.server.to(creatorSocketId).emit('admin:voting_progress', {
        meetingId,
        phase,
        submitted: submitted.length,
        total,
        percentage: total > 0 ? Math.round((submitted.length / total) * 100) : 0,
      });
    }

    this.logger.log(`[VOTE] ${userId} submitted vote for ${phase} in ${meetingId}`);
    return this.ack(true, undefined, { submittedAt });
  }

  // ─── user:update_live_vote ────────────────────────────────────────────────
  // Primary persistence event — replaces the old submit+slider split.
  // Fires on every slider release / field blur. Saves to Redis immediately
  // and broadcasts to the whole room so the creator (and everyone) sees it.

  @SubscribeMessage('user:update_live_vote')
  async handleUpdateLiveVote(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: Record<string, unknown>,
  ) {
    const userId = this.requireAuth(client);
    const meetingId = data.meetingId as string;
    const phase = data.phase as MeetingPhase;
    const payload = data.payload as Record<string, unknown> | undefined;

    if (!meetingId || !phase || !payload) {
      return this.ack(false, 'meetingId, phase, and payload are required');
    }

    const hotState = await this.redisService.getHotState(meetingId);
    if (!hotState) return this.ack(false, 'Meeting not active');
    if (hotState.phase !== phase) {
      return this.ack(false, `Phase mismatch: meeting is in ${hotState.phase}`);
    }

    // Persist to Redis hot state
    await this.redisService.setVote(meetingId, phase, userId, payload);
    await this.redisService.markSubmitted(meetingId, phase, userId);

    const updatedAt = new Date().toISOString();
    const room = roomName(meetingId);

    // Look up full name for display in creator panel
    const participants = await this.redisService.getParticipants(meetingId);
    const participantInfo = participants.find((p) => p.userId === userId);

    // Broadcast to the ENTIRE room (Figma/Slack model — everyone sees live updates)
    this.server.to(room).emit('room:vote_updated', {
      meetingId,
      userId,
      phase,
      payload,
      fullName: participantInfo?.fullName ?? null,
      updatedAt,
    });

    // Update pending voters list for the whole room
    const [pending, submitted] = await Promise.all([
      this.redisService.getPendingParticipants(meetingId, phase),
      this.redisService.getSubmittedIds(meetingId, phase),
    ]);
    this.server.to(room).emit('room:pending_voters_updated', { meetingId, phase, pending, submitted });

    // Update voting progress ring for creator
    const creatorSocketId = await this.redisService.getCreatorSocket(meetingId);
    if (creatorSocketId) {
      const total = participants.length;
      this.server.to(creatorSocketId).emit('admin:voting_progress', {
        meetingId,
        phase,
        submitted: submitted.length,
        total,
        percentage: total > 0 ? Math.round((submitted.length / total) * 100) : 0,
      });
    }

    this.logger.log(`[LIVE_VOTE] ${userId} updated ${phase} vote in ${meetingId}`);
    return this.ack(true, undefined, { updatedAt });
  }

  // ─── user:update_slider (legacy draft — kept for backward compat) ─────────

  @SubscribeMessage('user:update_slider')
  async handleUpdateSlider(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: Record<string, unknown>,
  ) {
    const userId = this.requireAuth(client);
    const meetingId = data.meetingId as string;
    const phase = data.phase as MeetingPhase;

    if (!meetingId || !phase) return this.ack(false, 'meetingId and phase required');

    const draft: Record<string, string> = {};
    Object.entries(data).forEach(([k, v]) => {
      if (k !== 'meetingId' && k !== 'phase') {
        draft[k] = typeof v === 'string' ? v : JSON.stringify(v);
      }
    });

    await this.redisService.setDraft(meetingId, phase, userId, draft);
    return this.ack(true);
  }

  // ─── retro:submit_task_status ────────────────────────────────────────────

  @SubscribeMessage('retro:submit_task_status')
  async handleRetroStatus(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: WsRetroStatusDto,
  ) {
    const userId = this.requireAuth(client);
    const { meetingId, taskId, status, statusNote } = data;

    const retroStatus: RetroTaskStatus = {
      taskId,
      userId,
      status,
      statusNote: statusNote ?? null,
      updatedAt: new Date().toISOString(),
    };

    await this.redisService.setRetroStatus(meetingId, taskId, retroStatus);

    const allStatuses = await this.redisService.getAllRetroStatuses(meetingId);
    const room = roomName(meetingId);

    this.server.to(room).emit('room:retro_status_updated', {
      meetingId,
      taskStatuses: allStatuses,
    });

    // Notify creator of per-user progress
    const creatorSocketId = await this.redisService.getCreatorSocket(meetingId);
    if (creatorSocketId) {
      const userStatuses = allStatuses.filter((s) => s.userId === userId);
      this.server.to(creatorSocketId).emit('admin:retro_progress', {
        meetingId,
        userId,
        fullName: client.userFullName ?? null,
        statuses: userStatuses,
      });
    }

    this.logger.log(`[RETRO] ${userId} marked task ${taskId} as ${status}`);
    return this.ack(true);
  }

  // ─── admin:advance_phase ─────────────────────────────────────────────────

  @SubscribeMessage('admin:advance_phase')
  async handleAdvancePhase(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: WsAdvancePhaseDto,
  ) {
    const userId = this.requireAuth(client);
    const { meetingId, toPhase } = data;

    const meeting = await this.assertCreator(meetingId, userId, client);
    if (!meeting) return this.ack(false, 'Forbidden');

    const hotState = await this.redisService.getHotState(meetingId);
    if (!hotState) return this.ack(false, 'Meeting not active in Redis');

    const currentPhase = hotState.phase;

    // Flush current-phase data to MongoDB before moving to the next phase.
    const flushed = await this.flushService.flushPhaseToMongo(meetingId, currentPhase);
    this.logger.log(
      `[PHASE] Pre-advance flush of ${currentPhase}: ${flushed} record(s) written`,
    );
    if (flushed === 0 && currentPhase !== MeetingPhase.RETROSPECTIVE) {
      this.logger.warn(
        `[PHASE] No records flushed for ${currentPhase} in meeting ${meetingId} — ` +
        `participants may not have voted yet`,
      );
    }

    // Notify the room that tasks are now persisted (clients invalidate REST caches).
    if (currentPhase === MeetingPhase.TASK_PLANNING) {
      const room = roomName(meetingId);
      this.server.to(room).emit('room:task_created', { meetingId });
    }

    const isFinishing = toPhase === MeetingPhase.FINISHED;

    if (isFinishing) {
      // Delegate entirely to finishMeeting which handles: flush + DB seal + Redis update.
      // We already flushed above, but finishMeeting will only flush again if no-op
      // (the votes were deleted after the first flush, so the second pass is safe).
      await this.redisService.setHotState(meetingId, MeetingPhase.FINISHED, MeetingStatus.FINISHED, currentPhase);
      await this.flushService.finishMeeting(meetingId, currentPhase);
    } else {
      // Standard mid-meeting phase advance — update Redis + MongoDB only.
      await this.redisService.setHotState(meetingId, toPhase, MeetingStatus.ACTIVE, currentPhase);
      await this.meetingModel.findByIdAndUpdate(meetingId, {
        $set: { currentPhase: toPhase },
      });
    }

    const room = roomName(meetingId);
    this.server.to(room).emit('room:phase_changed', {
      meetingId,
      phase: toPhase,
      previousPhase: currentPhase,
    });

    this.logger.log(`[PHASE] ${meetingId}: ${currentPhase} → ${toPhase}`);
    return this.ack(true, undefined, { phase: toPhase });
  }

  // ─── admin:approve_task ───────────────────────────────────────────────────

  @SubscribeMessage('admin:approve_task')
  async handleApproveTask(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: WsApproveTaskDto,
  ) {
    const userId = this.requireAuth(client);
    const { meetingId, taskId, approved } = data;

    const meeting = await this.assertCreator(meetingId, userId, client);
    if (!meeting) return this.ack(false, 'Forbidden');

    await this.redisService.setTaskApproval(meetingId, taskId, approved);

    const room = roomName(meetingId);
    // Broadcast to the whole room so progress indicators stay in sync.
    this.server.to(room).emit('room:task_approval_updated', {
      meetingId,
      taskId,
      approved,
    });

    // Emit directly to the affected participant (taskId === their userId)
    // so they see approval in real-time without a REST round-trip.
    const participants = await this.redisService.getParticipants(meetingId);
    const target = participants.find((p) => p.userId === taskId);
    if (target?.socketId) {
      this.server.to(target.socketId).emit('room:task_approved', {
        meetingId,
        userId: taskId,
        approved,
      });
    }

    this.logger.log(`[APPROVE] userId=${taskId} approved=${approved} in ${meetingId}`);
    return this.ack(true);
  }

  // ─── admin:finish_meeting ─────────────────────────────────────────────────

  @SubscribeMessage('admin:finish_meeting')
  async handleFinishMeeting(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: WsFinishMeetingDto,
  ) {
    const userId = this.requireAuth(client);
    const { meetingId } = data;

    const meeting = await this.assertCreator(meetingId, userId, client);
    if (!meeting) return this.ack(false, 'Forbidden');

    // Read the phase that is currently active so we can flush it before sealing.
    const hotState = await this.redisService.getHotState(meetingId);
    if (!hotState) return this.ack(false, 'Meeting not active in Redis');

    const currentPhase = hotState.phase;

    try {
      // Update Redis FIRST so any concurrent vote writes are rejected.
      await this.redisService.setHotState(meetingId, MeetingPhase.FINISHED, MeetingStatus.FINISHED, currentPhase);

      // Flush the active phase (e.g. task_planning → Tasks collection) then
      // mark the meeting as FINISHED in MongoDB.
      await this.flushService.finishMeeting(meetingId, currentPhase);
    } catch (err) {
      this.logger.error(
        `[FINISH] Failed to finish meeting ${meetingId}: ${(err as Error).message}`,
        (err as Error).stack,
      );
      // Revert Redis state so the creator can retry.
      await this.redisService.setHotState(meetingId, currentPhase, MeetingStatus.ACTIVE);
      return this.ack(false, 'Failed to finish meeting — please try again');
    }

    const room = roomName(meetingId);
    this.server.to(room).emit('room:phase_changed', {
      meetingId,
      phase: MeetingPhase.FINISHED,
      previousPhase: currentPhase,
    });

    this.logger.log(`[FINISH] Meeting ${meetingId} finished (flushed from phase=${currentPhase})`);
    return this.ack(true);
  }

  // ─── Emitter helpers (called by MeetingsService for REST-triggered events) ──

  emitPhaseChange(meetingId: string, data: Record<string, unknown>): void {
    this.server.to(roomName(meetingId)).emit('room:phase_changed', { meetingId, ...data });
  }

  emitMeetingUpdated(meetingId: string, type: string, userId: string): void {
    this.server.to(roomName(meetingId)).emit('meetingUpdated', {
      meetingId,
      type,
      userId,
      timestamp: new Date(),
    });
  }

  /** @deprecated kept for REST compatibility only */
  emitParticipantJoined(_meetingId: string, _userId: string): void {}
  /** @deprecated kept for REST compatibility only */
  emitParticipantLeft(_meetingId: string, _userId: string): void {}

  getActiveParticipants(meetingId: string) {
    return this.redisService.getParticipants(meetingId);
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private requireAuth(client: AuthenticatedSocket): string {
    if (!client.userId) {
      this.emit(client, 'error:unauthorized', { message: 'Not authenticated' });
      throw new WsException('Not authenticated');
    }
    return client.userId;
  }

  private async assertCreator(
    meetingId: string,
    userId: string,
    client: AuthenticatedSocket,
  ): Promise<MeetingDocument | null> {
    const meeting = await this.meetingModel
      .findById(meetingId)
      .select('creatorId')
      .exec();

    if (!meeting) {
      this.emit(client, 'error:forbidden', { message: 'Meeting not found', action: 'creator_action' });
      return null;
    }

    if (resolveId(meeting.creatorId) !== userId) {
      this.emit(client, 'error:forbidden', {
        message: 'Only the creator can perform this action',
        action: 'creator_action',
      });
      return null;
    }

    return meeting;
  }

  private emit(client: Socket, event: string, data: unknown): void {
    client.emit(event, data);
  }

  private ack(success: boolean, error?: string, data?: Record<string, unknown>) {
    if (!success) return { success: false, error };
    return { success: true, ...data };
  }
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function roomName(meetingId: string): string {
  return `meeting-${meetingId}`;
}
