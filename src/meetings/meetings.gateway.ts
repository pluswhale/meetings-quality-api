import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Meeting, MeetingDocument } from './schemas/meeting.schema';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  userEmail?: string;
  userFullName?: string;
}

interface MeetingParticipant {
  userId: string;
  fullName: string | null;
  email: string | null;
  socketId: string;
  joinedAt: Date;
  lastSeen: Date;
}

@WebSocketGateway({
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
})
export class MeetingsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(MeetingsGateway.name);

  // In-memory storage of active participants per meeting
  private activeParticipants: Map<string, Map<string, MeetingParticipant>> = new Map();
  // Socket ID to user mapping for disconnect handling
  private socketToUser: Map<string, { userId: string; meetingId: string }> = new Map();

  constructor(
    private jwtService: JwtService,
    @InjectModel(Meeting.name) private meetingModel: Model<MeetingDocument>,
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    try {
      let rawToken =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization ||
        client.handshake.query?.token;

      if (!rawToken) {
        this.logger.warn(`[CONNECTION] ❌ Client ${client.id} missing token. Disconnecting.`);
        client.disconnect();
        return;
      }

      if (Array.isArray(rawToken)) rawToken = rawToken[0];

      const token = String(rawToken)
        .replace(/^Bearer\s+/i, '')
        .trim();

      const payload = await this.jwtService.verifyAsync(token);

      client.userId = payload.userId || payload.sub;
      client.userEmail = payload.email;
      client.userFullName = payload.fullName;

      this.logger.log(`[CONNECTION] ✅ Auth success: ${client.id} | User: ${client.userId}`);
    } catch (error) {
      this.logger.error(`[CONNECTION] ❌ Auth Failed for ${client.id}`);
      client.emit('auth_error', {
        message: 'Authentication failed',
        code: error.name || 'UnknownError',
      });
      client.disconnect();
    }
  }

  async handleDisconnect(client: AuthenticatedSocket) {
    if (client.userId) {
      this.logger.log(`[DISCONNECT] User ${client.userId} disconnected (${client.id})`);
    }

    const userInfo = this.socketToUser.get(client.id);

    if (userInfo) {
      const { userId, meetingId } = userInfo;
      await this.removeParticipant(meetingId, userId, client.id);
      this.socketToUser.delete(client.id);
    }
  }

  @SubscribeMessage('join_meeting')
  async handleJoinMeeting(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { meetingId: string },
  ) {
    if (!client.userId) {
      client.emit('auth_error', { message: 'Not authenticated' });
      client.disconnect();
      return { success: false, error: 'Not authenticated' };
    }

    const { meetingId } = data;
    const userId = client.userId;

    this.logger.log(`[JOIN] User ${userId} joining meeting ${meetingId}`);

    try {
      if (!meetingId) return { success: false, error: 'Meeting ID required' };

      const roomName = `meeting-${meetingId}`;
      client.join(roomName);

      const participantData: MeetingParticipant = {
        userId,
        fullName: client.userFullName || 'Unknown',
        email: client.userEmail || 'Unknown',
        socketId: client.id,
        joinedAt: new Date(),
        lastSeen: new Date(),
      };

      await this.addParticipant(meetingId, participantData);
      this.socketToUser.set(client.id, { userId, meetingId });

      const participants = this.getParticipantsArray(meetingId);
      this.server.to(roomName).emit('participants_updated', {
        meetingId,
        participants,
        totalParticipants: participants.length,
      });

      return {
        success: true,
        meetingId,
        participants,
        totalParticipants: participants.length,
      };
    } catch (error) {
      this.logger.error(`[JOIN] Error: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  @SubscribeMessage('leave_meeting')
  async handleLeaveMeeting(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { meetingId: string },
  ) {
    if (!client.userId) return;

    const { meetingId } = data;
    const userId = client.userId;

    const roomName = `meeting-${meetingId}`;
    client.leave(roomName);

    await this.removeParticipant(meetingId, userId, client.id);
    this.socketToUser.delete(client.id);

    return { success: true, meetingId };
  }

  // --- Helpers ---

  private async addParticipant(meetingId: string, participant: MeetingParticipant) {
    if (!this.activeParticipants.has(meetingId)) {
      this.activeParticipants.set(meetingId, new Map());
    }
    this.activeParticipants.get(meetingId)!.set(participant.userId, participant);
  }

  private async removeParticipant(meetingId: string, userId: string, socketId: string) {
    const meetingParticipants = this.activeParticipants.get(meetingId);
    if (meetingParticipants) {
      const participant = meetingParticipants.get(userId);

      if (participant && participant.socketId === socketId) {
        meetingParticipants.delete(userId);

        const participants = Array.from(meetingParticipants.values());
        this.server.to(`meeting-${meetingId}`).emit('participants_updated', {
          meetingId,
          participants,
          totalParticipants: participants.length,
        });
      }

      if (meetingParticipants.size === 0) {
        this.activeParticipants.delete(meetingId);
      }
    }
  }

  private getParticipantsArray(meetingId: string): MeetingParticipant[] {
    const map = this.activeParticipants.get(meetingId);
    return map ? Array.from(map.values()) : [];
  }

  public getActiveParticipants(meetingId: string): MeetingParticipant[] {
    return this.getParticipantsArray(meetingId);
  }

  // --- Emitters called by Service ---

  emitPhaseChange(meetingId: string, data: any) {
    this.server.to(`meeting-${meetingId}`).emit('phaseChanged', { meetingId, ...data });
  }

  // Generic emitter for updates in any phase
  emitMeetingUpdated(meetingId: string, type: string, userId: string) {
    this.server.to(`meeting-${meetingId}`).emit('meetingUpdated', {
      meetingId,
      type,
      userId,
      timestamp: new Date(),
    });
  }

  emitParticipantJoined(meetingId: string, userId: string) {
    // Legacy support
  }

  emitParticipantLeft(meetingId: string, userId: string) {
    // Legacy support
  }
}
