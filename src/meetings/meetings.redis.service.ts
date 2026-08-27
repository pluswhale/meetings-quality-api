import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';
import { MeetingPhase, MeetingStatus } from './schemas/meeting.schema';

// ─── Key helpers ──────────────────────────────────────────────────────────────

const KEY = {
  state: (id: string) => `mq:meeting:${id}:state`,
  participants: (id: string) => `mq:meeting:${id}:participants`,
  submitted: (id: string, phase: string) => `mq:meeting:${id}:phase:${phase}:submitted`,
  draft: (id: string, phase: string, userId: string) =>
    `mq:meeting:${id}:phase:${phase}:draft:${userId}`,
  vote: (id: string, phase: string, userId: string) =>
    `mq:meeting:${id}:phase:${phase}:vote:${userId}`,
  retro: (id: string) => `mq:meeting:${id}:retro`,
  creatorSocket: (id: string) => `mq:meeting:${id}:creator_socket`,
};

const STATE_TTL = 86_400; // 24 h
const DRAFT_TTL = 3_600; // 1 h

// ─── Domain types ─────────────────────────────────────────────────────────────

export interface RedisParticipant {
  userId: string;
  fullName: string | null;
  email: string | null;
  socketId: string;
  joinedAt: string;
  lastSeen: string;
}

export interface MeetingHotState {
  phase: MeetingPhase;
  status: MeetingStatus;
  previousPhase: string | null;
  startedAt: string;
}

export interface RetroTaskStatus {
  taskId: string;
  userId: string;
  status: 'completed' | 'incomplete';
  statusNote: string | null;
  updatedAt: string;
}

@Injectable()
export class MeetingsRedisService {
  private readonly logger = new Logger(MeetingsRedisService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  // ─── Hot State ────────────────────────────────────────────────────────────

  async setHotState(
    meetingId: string,
    phase: MeetingPhase,
    status: MeetingStatus,
    previousPhase?: string,
  ): Promise<void> {
    const key = KEY.state(meetingId);
    const now = new Date().toISOString();

    const existing = await this.redis.hget(key, 'startedAt');

    await this.redis.hset(key, {
      phase,
      status,
      previousPhase: previousPhase ?? '',
      startedAt: existing ?? now,
    });
    await this.redis.expire(key, STATE_TTL);
  }

  async getHotState(meetingId: string): Promise<MeetingHotState | null> {
    const data = await this.redis.hgetall(KEY.state(meetingId));
    if (!data || !data.phase) return null;

    return {
      phase: data.phase as MeetingPhase,
      status: data.status as MeetingStatus,
      previousPhase: data.previousPhase || null,
      startedAt: data.startedAt,
    };
  }

  // ─── Participants ─────────────────────────────────────────────────────────

  async addParticipant(meetingId: string, participant: RedisParticipant): Promise<void> {
    const key = KEY.participants(meetingId);
    await this.redis.hset(key, participant.userId, JSON.stringify(participant));
    await this.redis.expire(key, STATE_TTL);
  }

  async removeParticipant(meetingId: string, userId: string): Promise<void> {
    await this.redis.hdel(KEY.participants(meetingId), userId);
  }

  async getParticipants(meetingId: string): Promise<RedisParticipant[]> {
    const data = await this.redis.hgetall(KEY.participants(meetingId));
    if (!data) return [];
    return Object.values(data).map((v) => JSON.parse(v) as RedisParticipant);
  }

  async updateParticipantLastSeen(meetingId: string, userId: string): Promise<void> {
    const key = KEY.participants(meetingId);
    const raw = await this.redis.hget(key, userId);
    if (!raw) return;
    const participant: RedisParticipant = JSON.parse(raw);
    participant.lastSeen = new Date().toISOString();
    await this.redis.hset(key, userId, JSON.stringify(participant));
  }

  // ─── Submissions ──────────────────────────────────────────────────────────

  async markSubmitted(meetingId: string, phase: MeetingPhase, userId: string): Promise<void> {
    const key = KEY.submitted(meetingId, phase);
    await this.redis.sadd(key, userId);
    await this.redis.expire(key, STATE_TTL);
  }

  async isSubmitted(meetingId: string, phase: MeetingPhase, userId: string): Promise<boolean> {
    return (await this.redis.sismember(KEY.submitted(meetingId, phase), userId)) === 1;
  }

  async getSubmittedIds(meetingId: string, phase: MeetingPhase): Promise<string[]> {
    return this.redis.smembers(KEY.submitted(meetingId, phase));
  }

  async getPendingParticipants(
    meetingId: string,
    phase: MeetingPhase,
  ): Promise<RedisParticipant[]> {
    const [participants, submittedIds] = await Promise.all([
      this.getParticipants(meetingId),
      this.getSubmittedIds(meetingId, phase),
    ]);
    const submittedSet = new Set(submittedIds);
    return participants.filter((p) => !submittedSet.has(p.userId));
  }

  // ─── Votes ────────────────────────────────────────────────────────────────

  async setVote(
    meetingId: string,
    phase: MeetingPhase,
    userId: string,
    vote: unknown,
  ): Promise<void> {
    const key = KEY.vote(meetingId, phase, userId);
    await this.redis.set(key, JSON.stringify(vote));
    await this.redis.expire(key, STATE_TTL);
  }

  async getVote<T = unknown>(
    meetingId: string,
    phase: MeetingPhase,
    userId: string,
  ): Promise<T | null> {
    const raw = await this.redis.get(KEY.vote(meetingId, phase, userId));
    return raw ? (JSON.parse(raw) as T) : null;
  }

  async getAllVotes<T = unknown>(
    meetingId: string,
    phase: MeetingPhase,
  ): Promise<{ userId: string; vote: T }[]> {
    const participants = await this.getParticipants(meetingId);
    const submittedIds = await this.getSubmittedIds(meetingId, phase);
    const userIds = submittedIds.length > 0 ? submittedIds : participants.map((p) => p.userId);

    if (userIds.length === 0) return [];

    const keys = userIds.map((uid) => KEY.vote(meetingId, phase, uid));
    const values = await this.redis.mget(...keys);

    const results: { userId: string; vote: T }[] = [];
    userIds.forEach((uid, i) => {
      if (values[i]) {
        results.push({ userId: uid, vote: JSON.parse(values[i]!) as T });
      }
    });
    return results;
  }

  async deleteVotesForPhase(meetingId: string, phase: MeetingPhase): Promise<void> {
    const submittedIds = await this.getSubmittedIds(meetingId, phase);
    if (submittedIds.length === 0) return;
    const keys = submittedIds.map((uid) => KEY.vote(meetingId, phase, uid));
    await this.redis.del(...keys);
  }

  // ─── Drafts ───────────────────────────────────────────────────────────────

  async setDraft(
    meetingId: string,
    phase: MeetingPhase,
    userId: string,
    draft: Record<string, string>,
  ): Promise<void> {
    const key = KEY.draft(meetingId, phase, userId);
    await this.redis.hset(key, draft);
    await this.redis.expire(key, DRAFT_TTL);
  }

  async getDraft(
    meetingId: string,
    phase: MeetingPhase,
    userId: string,
  ): Promise<Record<string, string> | null> {
    const data = await this.redis.hgetall(KEY.draft(meetingId, phase, userId));
    return data && Object.keys(data).length > 0 ? data : null;
  }

  // ─── Retrospective ────────────────────────────────────────────────────────

  async setRetroStatus(meetingId: string, taskId: string, status: RetroTaskStatus): Promise<void> {
    const key = KEY.retro(meetingId);
    await this.redis.hset(key, taskId, JSON.stringify(status));
    await this.redis.expire(key, STATE_TTL);
  }

  async getAllRetroStatuses(meetingId: string): Promise<RetroTaskStatus[]> {
    const data = await this.redis.hgetall(KEY.retro(meetingId));
    if (!data) return [];
    return Object.values(data).map((v) => JSON.parse(v) as RetroTaskStatus);
  }

  async getRetroStatusesByUser(meetingId: string, userId: string): Promise<RetroTaskStatus[]> {
    const all = await this.getAllRetroStatuses(meetingId);
    return all.filter((s) => s.userId === userId);
  }

  // ─── Creator socket ───────────────────────────────────────────────────────

  async setCreatorSocket(meetingId: string, socketId: string): Promise<void> {
    await this.redis.set(KEY.creatorSocket(meetingId), socketId);
    await this.redis.expire(KEY.creatorSocket(meetingId), STATE_TTL);
  }

  async getCreatorSocket(meetingId: string): Promise<string | null> {
    return this.redis.get(KEY.creatorSocket(meetingId));
  }

  // ─── Task approval (Phase 3) ──────────────────────────────────────────────

  async setTaskApproval(meetingId: string, taskId: string, approved: boolean): Promise<void> {
    const key = `mq:meeting:${meetingId}:task_approvals`;
    await this.redis.hset(key, taskId, approved ? '1' : '0');
    await this.redis.expire(key, STATE_TTL);
  }

  async getTaskApproval(meetingId: string, taskId: string): Promise<boolean | null> {
    const val = await this.redis.hget(`mq:meeting:${meetingId}:task_approvals`, taskId);
    if (val === null) return null;
    return val === '1';
  }

  async getAllTaskApprovals(meetingId: string): Promise<Record<string, boolean>> {
    const data = await this.redis.hgetall(`mq:meeting:${meetingId}:task_approvals`);
    if (!data) return {};
    return Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v === '1']));
  }

  // ─── Cleanup ──────────────────────────────────────────────────────────────

  async clearMeetingState(meetingId: string): Promise<void> {
    let cursor = '0';
    do {
      const [next, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        `mq:meeting:${meetingId}:*`,
        'COUNT',
        100,
      );
      cursor = next;
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } while (cursor !== '0');
  }
}
