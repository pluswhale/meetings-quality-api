import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  },
})
export class MeetingsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('joinMeeting')
  handleJoinMeeting(client: Socket, meetingId: string) {
    client.join(`meeting-${meetingId}`);
    console.log(`Client ${client.id} joined meeting ${meetingId}`);
    return { status: 'joined', meetingId };
  }

  @SubscribeMessage('leaveMeeting')
  handleLeaveMeeting(client: Socket, meetingId: string) {
    client.leave(`meeting-${meetingId}`);
    console.log(`Client ${client.id} left meeting ${meetingId}`);
    return { status: 'left', meetingId };
  }

  emitPhaseChange(meetingId: string, data: { phase: string; status: string }) {
    this.server.to(`meeting-${meetingId}`).emit('phaseChanged', {
      meetingId,
      ...data,
    });
  }

  emitEvaluationSubmitted(meetingId: string, data: any) {
    this.server.to(`meeting-${meetingId}`).emit('evaluationSubmitted', {
      meetingId,
      ...data,
    });
  }

  emitSummarySubmitted(meetingId: string, data: any) {
    this.server.to(`meeting-${meetingId}`).emit('summarySubmitted', {
      meetingId,
      ...data,
    });
  }

  emitParticipantJoined(meetingId: string, userId: string) {
    this.server.to(`meeting-${meetingId}`).emit('participantJoined', {
      meetingId,
      userId,
    });
  }

  emitParticipantLeft(meetingId: string, userId: string) {
    this.server.to(`meeting-${meetingId}`).emit('participantLeft', {
      meetingId,
      userId,
    });
  }
}
