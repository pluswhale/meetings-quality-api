# WebSocket-Based Participant Presence System

## Overview

Refactored the participant presence tracking from unreliable REST endpoints to real-time WebSocket connections using Socket.IO. All voting and scoring logic remains REST-based, while join/leave tracking is now handled through persistent socket connections.

## Architecture

### Core Principle
- **Presence = WebSocket** (join/leave via Socket.IO)
- **Voting/Scoring = REST** (all submissions via HTTP)

### Technology Stack
- **Socket.IO** for real-time bidirectional communication
- **JWT Authentication** for socket connections
- **In-memory storage** for active participant tracking
- **REST APIs** for all voting submissions

## WebSocket Events

### Client → Server Events

#### 1. `join_meeting`
User joins a meeting room.

**Payload:**
```typescript
{
  meetingId: string
}
```

**Response:**
```typescript
{
  success: boolean,
  meetingId: string,
  participants: Array<{
    userId: string,
    fullName: string | null,
    email: string | null,
    joinedAt: Date
  }>,
  error?: string
}
```

**Requirements:**
- Socket must be authenticated with JWT token
- User must be in meeting's `participantIds` (invited list)

**What Happens:**
1. Socket joins Socket.IO room `meeting-{meetingId}`
2. User added to in-memory active participants map
3. `participants_updated` event broadcasted to all in room
4. Returns current participant list

#### 2. `leave_meeting`
User leaves a meeting room.

**Payload:**
```typescript
{
  meetingId: string
}
```

**Response:**
```typescript
{
  success: boolean,
  meetingId: string,
  error?: string
}
```

**What Happens:**
1. Socket leaves Socket.IO room `meeting-{meetingId}`
2. User removed from active participants map
3. `participants_updated` event broadcasted to remaining users
4. Socket mapping cleaned up

#### 3. `get_participants`
Get current participant list without joining.

**Payload:**
```typescript
{
  meetingId: string
}
```

**Response:**
```typescript
{
  success: boolean,
  meetingId: string,
  participants: Array<{
    userId: string,
    fullName: string | null,
    email: string | null,
    joinedAt: Date
  }>,
  totalParticipants: number
}
```

### Server → Client Events

#### 1. `participants_updated`
Broadcasted whenever someone joins or leaves.

**Payload:**
```typescript
{
  meetingId: string,
  participants: Array<{
    userId: string,
    fullName: string | null,
    email: string | null,
    joinedAt: Date
  }>,
  totalParticipants: number
}
```

**When Emitted:**
- Someone calls `join_meeting`
- Someone calls `leave_meeting`
- Someone disconnects unexpectedly

#### 2. `phaseChanged` (Legacy)
Emitted when meeting phase changes.

**Payload:**
```typescript
{
  meetingId: string,
  phase: string,
  status: string
}
```

#### 3. `participantJoined` / `participantLeft` (Legacy)
Emitted for backward compatibility.

**Payload:**
```typescript
{
  meetingId: string,
  userId: string
}
```

## Frontend Integration

### Connection Setup

```typescript
import { io, Socket } from 'socket.io-client';

// Get JWT token from your auth system
const token = localStorage.getItem('jwt_token');

// Connect to Socket.IO server
const socket: Socket = io('http://localhost:3000', {
  auth: {
    token: token
  },
  transports: ['websocket', 'polling']
});

// Handle connection events
socket.on('connect', () => {
  console.log('Connected to Socket.IO server');
});

socket.on('disconnect', () => {
  console.log('Disconnected from Socket.IO server');
});

socket.on('connect_error', (error) => {
  console.error('Connection error:', error.message);
});
```

### Joining a Meeting

```typescript
// Join a meeting room
const joinMeeting = (meetingId: string) => {
  socket.emit('join_meeting', { meetingId }, (response) => {
    if (response.success) {
      console.log('Joined meeting:', response.meetingId);
      console.log('Active participants:', response.participants);
      
      // Update your UI with participant list
      updateParticipantList(response.participants);
    } else {
      console.error('Failed to join:', response.error);
    }
  });
};

// Listen for participant updates
socket.on('participants_updated', (data) => {
  console.log('Participants updated:', data.participants);
  console.log('Total participants:', data.totalParticipants);
  
  // Update your UI
  updateParticipantList(data.participants);
});
```

### Leaving a Meeting

```typescript
const leaveMeeting = (meetingId: string) => {
  socket.emit('leave_meeting', { meetingId }, (response) => {
    if (response.success) {
      console.log('Left meeting:', response.meetingId);
    } else {
      console.error('Failed to leave:', response.error);
    }
  });
};

// Clean up on component unmount
useEffect(() => {
  return () => {
    if (currentMeetingId) {
      leaveMeeting(currentMeetingId);
    }
  };
}, [currentMeetingId]);
```

### Complete React Example

```typescript
import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

interface Participant {
  userId: string;
  fullName: string | null;
  email: string | null;
  joinedAt: Date;
}

export const MeetingRoom = ({ meetingId }: { meetingId: string }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Connect to Socket.IO
    const token = localStorage.getItem('jwt_token');
    const newSocket = io('http://localhost:3000', {
      auth: { token },
      transports: ['websocket', 'polling']
    });

    setSocket(newSocket);

    // Connection handlers
    newSocket.on('connect', () => {
      console.log('Connected');
      setIsConnected(true);
      
      // Join meeting room
      newSocket.emit('join_meeting', { meetingId }, (response) => {
        if (response.success) {
          setParticipants(response.participants);
        }
      });
    });

    newSocket.on('disconnect', () => {
      console.log('Disconnected');
      setIsConnected(false);
    });

    // Listen for participant updates
    newSocket.on('participants_updated', (data) => {
      if (data.meetingId === meetingId) {
        setParticipants(data.participants);
      }
    });

    // Cleanup on unmount
    return () => {
      newSocket.emit('leave_meeting', { meetingId });
      newSocket.disconnect();
    };
  }, [meetingId]);

  return (
    <div>
      <h2>Meeting Room</h2>
      <p>Status: {isConnected ? 'Connected' : 'Disconnected'}</p>
      
      <h3>Active Participants ({participants.length})</h3>
      <ul>
        {participants.map(p => (
          <li key={p.userId}>
            {p.fullName || p.email}
            <small> (joined: {new Date(p.joinedAt).toLocaleTimeString()})</small>
          </li>
        ))}
      </ul>
    </div>
  );
};
```

## REST API Integration

### Getting Active Participants

While WebSockets provide real-time updates, you can also fetch the current participant list via REST:

```typescript
// GET /meetings/:id/active-participants
const response = await fetch(`/meetings/${meetingId}/active-participants`, {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

const data = await response.json();
console.log('Active participants:', data.activeParticipants);
console.log('Total invited:', data.totalParticipants);
console.log('Currently active:', data.activeCount);
console.log('Data source:', data.source); // 'websocket'
```

**Use Cases:**
- Initial page load before WebSocket connection
- Fallback when WebSocket unavailable
- Server-side rendering

### Voting Info with Socket Participants

```typescript
// GET /meetings/:id/voting-info
const response = await fetch(`/meetings/${meetingId}/voting-info`, {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

const data = await response.json();
console.log('Voting participants:', data.votingParticipants); // From WebSocket
console.log('Total:', data.totalVotingParticipants);
console.log('Submitted:', data.submissionStatus.submitted);
console.log('Progress:', data.votingProgress.percentage + '%');
```

### Submitting Votes (Still REST)

All voting submissions remain REST-based:

```typescript
// POST /meetings/:id/emotional-evaluations
await fetch(`/meetings/${meetingId}/emotional-evaluations`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    evaluations: [
      { targetParticipantId: 'user1', emotionalScale: 85, isToxic: false }
    ]
  })
});

// POST /meetings/:id/understanding-contributions
await fetch(`/meetings/${meetingId}/understanding-contributions`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    understandingScore: 90,
    contributions: [
      { participantId: 'user1', contributionPercentage: 60 }
    ]
  })
});
```

## Backend Implementation

### Gateway Architecture

```typescript
@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  },
})
export class MeetingsGateway {
  // In-memory storage
  private activeParticipants: Map<string, Map<string, MeetingParticipant>> = new Map();
  private socketToUser: Map<string, { userId: string; meetingId: string }> = new Map();

  // JWT authentication on connect
  async handleConnection(client: AuthenticatedSocket) {
    const token = client.handshake.auth?.token;
    const payload = await this.jwtService.verifyAsync(token);
    client.userId = payload.userId;
    // ... store user info
  }

  // Cleanup on disconnect
  async handleDisconnect(client: AuthenticatedSocket) {
    const userInfo = this.socketToUser.get(client.id);
    if (userInfo) {
      await this.removeParticipant(userInfo.meetingId, userInfo.userId, client.id);
    }
  }
}
```

### Data Structures

#### MeetingParticipant Interface
```typescript
interface MeetingParticipant {
  userId: string;
  fullName: string | null;
  email: string | null;
  socketId: string;
  joinedAt: Date;
  lastSeen: Date;
}
```

#### Storage Maps
```typescript
// Active participants per meeting
// { meetingId: { userId: MeetingParticipant } }
private activeParticipants: Map<string, Map<string, MeetingParticipant>>;

// Socket ID to user mapping for cleanup
// { socketId: { userId, meetingId } }
private socketToUser: Map<string, { userId: string; meetingId: string }>;
```

### Integration with Voting

```typescript
async getVotingInfo(id: string, userId: string) {
  // Get active participants from Socket.IO (real-time)
  const socketParticipants = this.meetingsGateway.getActiveParticipants(id);
  const activeParticipants = socketParticipants.map(p => ({
    _id: p.userId,
    fullName: p.fullName,
    email: p.email,
    joinedAt: p.joinedAt,
    lastSeen: p.lastSeen,
  }));

  // Calculate voting progress based on socket participants
  return {
    votingParticipants: activeParticipants,
    totalVotingParticipants: activeParticipants.length,
    votingProgress: {
      submitted: submissionStatus.submitted?.length || 0,
      total: activeParticipants.length,
      percentage: /* calculated */
    }
  };
}
```

## Comparison: Before vs After

### Before (REST-based)
```
❌ Problems:
- Unreliable: Users "stuck" as active after browser crash
- No real-time updates: Needed polling
- Race conditions: Multiple simultaneous joins/leaves
- No automatic cleanup: Manual leave required
- Network issues: Lost state on reconnect
```

### After (WebSocket-based)
```
✅ Improvements:
- Automatic cleanup: Disconnect removes participant
- Real-time updates: Instant participant list changes
- Connection-based: Presence tied to active socket
- Idempotent: Rejoin updates last seen timestamp
- Resilient: Auto-reconnect with Socket.IO
```

## Reliability Features

### 1. JWT Authentication
```typescript
// Token verified on connection
const payload = await this.jwtService.verifyAsync(token);
if (!payload) {
  client.disconnect(); // Immediate disconnect if invalid
}
```

### 2. Automatic Cleanup
```typescript
// Disconnect handler removes user from all rooms
handleDisconnect(client) {
  const userInfo = this.socketToUser.get(client.id);
  if (userInfo) {
    this.removeParticipant(userInfo.meetingId, userInfo.userId);
    // Broadcasts updated list to remaining participants
  }
}
```

### 3. Idempotent Joins
```typescript
// Multiple joins from same user update last seen
const existingIndex = meetingParticipants.findIndex(p => p.userId === userId);
if (existingIndex >= 0) {
  meetingParticipants[existingIndex].lastSeen = new Date();
} else {
  meetingParticipants.push(newParticipant);
}
```

### 4. Broadcast Updates
```typescript
// All participants notified immediately
this.server.to(`meeting-${meetingId}`).emit('participants_updated', {
  meetingId,
  participants: updatedList,
  totalParticipants: updatedList.length
});
```

## Migration Guide

### Deprecated REST Endpoints

#### ❌ `POST /meetings/:id/join`
**Status:** Deprecated (but still functional)  
**Replacement:** Socket.IO event `join_meeting`

#### ❌ `POST /meetings/:id/leave`
**Status:** Deprecated (but still functional)  
**Replacement:** Socket.IO event `leave_meeting`

### Migration Steps

1. **Install Socket.IO Client**
```bash
npm install socket.io-client
```

2. **Replace REST calls with WebSocket**

**Before:**
```typescript
// OLD: REST-based join
await fetch(`/meetings/${meetingId}/join`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` }
});
```

**After:**
```typescript
// NEW: WebSocket-based join
socket.emit('join_meeting', { meetingId }, (response) => {
  if (response.success) {
    console.log('Joined successfully');
  }
});
```

3. **Add Real-time Listeners**
```typescript
// NEW: Listen for updates
socket.on('participants_updated', (data) => {
  updateParticipantList(data.participants);
});
```

4. **Keep REST for Voting**
```typescript
// UNCHANGED: REST for submissions
await fetch(`/meetings/${meetingId}/emotional-evaluations`, {
  method: 'POST',
  body: JSON.stringify(evaluationData)
});
```

## Testing

### Connection Test
```typescript
const socket = io('http://localhost:3000', {
  auth: { token: 'your-jwt-token' }
});

socket.on('connect', () => {
  console.log('✅ Connected');
});

socket.on('connect_error', (error) => {
  console.log('❌ Connection failed:', error.message);
});
```

### Join/Leave Test
```typescript
// Join
socket.emit('join_meeting', { meetingId: 'test123' }, (response) => {
  console.log('Join response:', response);
  // Should see: { success: true, participants: [...] }
});

// Leave
socket.emit('leave_meeting', { meetingId: 'test123' }, (response) => {
  console.log('Leave response:', response);
  // Should see: { success: true }
});
```

### Participant Updates Test
```typescript
socket.on('participants_updated', (data) => {
  console.log('Meeting:', data.meetingId);
  console.log('Participants:', data.participants);
  console.log('Total:', data.totalParticipants);
});
```

## Performance Considerations

### Memory Usage
- In-memory storage: ~1KB per active participant
- Scales to thousands of concurrent users
- No database queries for presence tracking

### Network Efficiency
- WebSocket: Persistent connection (no HTTP overhead)
- Broadcasts: Only to users in same meeting room
- Binary protocol: Efficient data transfer

### Cleanup Strategy
- Automatic on disconnect: No manual cleanup needed
- Memory cleared when meeting empty
- Socket ID mapping: Fast lookup on disconnect

## Security

### Authentication
- JWT token required on connection
- Token verified before accepting any events
- Invalid token = immediate disconnect

### Authorization
- Users must be in `participantIds` to join
- Meeting existence verified
- No special creator privileges for joining

### Data Validation
- Meeting ID validated on all events
- User ID extracted from verified JWT
- No client-provided user info trusted

## Troubleshooting

### Connection Issues

**Problem:** `connect_error` event triggered

**Solutions:**
1. Check JWT token is valid
2. Verify backend URL is correct
3. Check CORS settings
4. Try polling transport: `transports: ['polling', 'websocket']`

### Participants Not Updating

**Problem:** `participants_updated` not received

**Solutions:**
1. Verify `join_meeting` was successful
2. Check you're in correct meeting room
3. Confirm socket is connected
4. Check server logs for errors

### Creator Not Included in Voting

**Problem:** Creator doesn't appear in `votingParticipants`

**Solutions:**
1. Creator must explicitly call `join_meeting`
2. No automatic inclusion (by design)
3. Check creator is in `activeParticipants` list

## Summary

✅ **Implemented:**
- Socket.IO-based real-time presence tracking
- JWT authentication for socket connections
- Automatic cleanup on disconnect
- Real-time participant list broadcasting
- REST endpoint for initial participant fetch
- Integration with existing voting system

✅ **Maintained:**
- All voting/scoring via REST APIs
- No changes to submission logic
- Creator authorization for viewing info
- Backward compatibility with deprecated REST endpoints

✅ **Benefits:**
- Reliable presence tracking
- Real-time updates (no polling needed)
- Automatic cleanup
- Better user experience
- Simplified architecture

**Result:** The system now provides reliable, real-time participant presence tracking via WebSocket while keeping all business logic (voting, scoring) in REST APIs for simplicity and testability.
