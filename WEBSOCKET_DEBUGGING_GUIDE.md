# WebSocket Presence System - Debugging Guide

## Overview

This guide helps diagnose why connected users may not appear in the participant list. The system now has comprehensive logging to trace every step of the connection flow.

## Log Prefixes

All logs are prefixed to easily identify the source:

- `[CONNECTION]` - Socket.IO connection events
- `[DISCONNECT]` - Socket.IO disconnect events
- `[JOIN]` - User joining a meeting room
- `[LEAVE]` - User leaving a meeting room
- `[GET_PARTICIPANTS]` - Requesting participant list
- `[ADD_PARTICIPANT]` - Internal: Adding user to memory
- `[REMOVE_PARTICIPANT]` - Internal: Removing user from memory
- `[REST_API]` - REST API accessing participant data
- `[SERVICE]` - Service layer operations

## Expected Flow

### 1. Client Connects
```
[CONNECTION] New client connecting: abc123
[CONNECTION] Token found for client abc123, verifying...
[CONNECTION] ✅ Client authenticated: abc123 | User: user_id | Name: John Doe
```

**What to check if this fails:**
- Token is missing: Check frontend is sending `auth: { token }` in Socket.IO connection
- Token invalid: Verify JWT_SECRET matches between services
- Authentication fails: Check token hasn't expired

### 2. User Joins Meeting
```
[JOIN] Event received | Socket: abc123 | User: user_id | Meeting: meeting123
[JOIN] Verifying meeting meeting123 exists...
[JOIN] ✅ Meeting found: Important Discussion
[JOIN] Socket abc123 joined room: meeting-meeting123
[JOIN] Adding participant: { userId: 'user_id', fullName: 'John Doe', ... }
[ADD_PARTICIPANT] Creating new participant map for meeting meeting123
[ADD_PARTICIPANT] ✅ Added new participant user_id
[ADD_PARTICIPANT] Total participants in meeting123: 1
[JOIN] Current participants in meeting123: 1
[JOIN] Participant list: ['user_id']
[JOIN] Broadcasting to room meeting-meeting123 with 1 participants
[JOIN] ✅ User user_id successfully joined meeting meeting123
```

**What to check if this fails:**
- Event not received: Frontend must emit `join_meeting` with `{ meetingId }`
- Not authenticated: User ID is missing from socket
- Meeting not found: Meeting ID is incorrect or meeting doesn't exist
- No broadcast: Check Socket.IO room joining worked

### 3. REST API Fetches Participants
```
[REST_API] getActiveParticipants called for meeting meeting123
[REST_API] Returning 1 participants for meeting meeting123

[SERVICE] getActiveParticipants called for meeting meeting123 by user creator_id
[SERVICE] Fetching participants from WebSocket gateway...
[SERVICE] Socket gateway returned 1 participants
[SERVICE] Returning 1 active out of 5 total invited participants
```

**What to check if empty:**
- Warning appears: `⚠️ No WebSocket participants found!`
- This means: Users haven't called `join_meeting` via Socket.IO
- Solution: Verify frontend is connecting and joining

### 4. Voting Info Uses WebSocket Data
```
[SERVICE] getVotingInfo: Fetching WebSocket participants for meeting meeting123
[SERVICE] getVotingInfo: Found 1 active participants via WebSocket
```

**What to check if empty:**
- Warning: `⚠️ No WebSocket participants! Voting list will be empty`
- This means: No one has joined via Socket.IO
- Creator also needs to join: No special treatment

### 5. User Disconnects
```
[DISCONNECT] Client disconnecting: abc123 | User: user_id
[DISCONNECT] Found mapping - Removing user user_id from meeting meeting123
[REMOVE_PARTICIPANT] Removing user_id from meeting meeting123
[REMOVE_PARTICIPANT] ✅ Removed participant user_id
[REMOVE_PARTICIPANT] Remaining participants in meeting123: 0
[REMOVE_PARTICIPANT] Broadcasting update to room meeting-meeting123
[REMOVE_PARTICIPANT] Meeting meeting123 is empty, cleaning up
[DISCONNECT] ✅ Cleanup complete for user_id
```

## Common Issues & Solutions

### Issue 1: No participants appear in list

**Symptoms:**
```
[REST_API] ⚠️ No participants found in meeting123 - users may not have connected via WebSocket
[SERVICE] ⚠️ No WebSocket participants found! Users may not be connected via Socket.IO
```

**Root Causes:**
1. Frontend not connecting to Socket.IO
2. Frontend not emitting `join_meeting` event
3. Wrong meeting ID being used
4. Authentication failure preventing connection

**Debug Steps:**
1. Check frontend Socket.IO connection:
```typescript
const socket = io('http://localhost:3000', {
  auth: { token: 'your-jwt-token' }
});

socket.on('connect', () => {
  console.log('✅ Connected:', socket.id);
});

socket.on('connect_error', (error) => {
  console.error('❌ Connection failed:', error);
});
```

2. Verify `join_meeting` is being called:
```typescript
socket.emit('join_meeting', { meetingId: 'meeting123' }, (response) => {
  console.log('Join response:', response);
  if (!response.success) {
    console.error('Join failed:', response.error);
  }
});
```

3. Check backend logs for connection:
```bash
# Should see:
[CONNECTION] ✅ Client authenticated: ...
[JOIN] ✅ User user_id successfully joined ...
```

### Issue 2: Connection succeeds but join fails

**Symptoms:**
```
[CONNECTION] ✅ Client authenticated: abc123 | User: user_id | Name: John Doe
[JOIN] ❌ Meeting meeting123 not found
```

**Root Causes:**
1. Meeting ID is incorrect
2. Meeting doesn't exist in database
3. Wrong database connection

**Debug Steps:**
1. Verify meeting ID in frontend matches backend
2. Check meeting exists:
```bash
# MongoDB
db.meetings.findOne({ _id: ObjectId('meeting123') })
```

3. Console log meeting ID before joining:
```typescript
console.log('Joining meeting:', meetingId);
socket.emit('join_meeting', { meetingId });
```

### Issue 3: User authenticated but userId is undefined

**Symptoms:**
```
[JOIN] ❌ Not authenticated - userId is missing
```

**Root Causes:**
1. JWT payload doesn't include `userId` field
2. Token verification succeeded but payload structure is wrong
3. Token is for different system

**Debug Steps:**
1. Check JWT payload structure:
```typescript
// Backend: Log what's in the token
const payload = await this.jwtService.verifyAsync(token);
console.log('JWT payload:', payload);
```

2. Ensure JWT includes required fields:
```typescript
// When creating JWT
{
  userId: user._id.toString(),
  email: user.email,
  fullName: user.fullName
}
```

### Issue 4: Participants appear then disappear

**Symptoms:**
```
[ADD_PARTICIPANT] ✅ Added new participant user_id
[REMOVE_PARTICIPANT] ✅ Removed participant user_id
// Happens immediately
```

**Root Causes:**
1. Frontend calling `leave_meeting` immediately
2. Frontend disconnecting socket
3. Component unmounting too quickly

**Debug Steps:**
1. Check for premature cleanup:
```typescript
useEffect(() => {
  socket.emit('join_meeting', { meetingId });
  
  return () => {
    // DON'T do this if you want to stay connected:
    socket.emit('leave_meeting', { meetingId });
  };
}, []);
```

2. Keep socket connected while on meeting page:
```typescript
// Only disconnect when actually leaving meeting
const leaveMeeting = () => {
  socket.emit('leave_meeting', { meetingId });
  navigate('/dashboard');
};
```

### Issue 5: Creator not appearing in participant list

**Symptoms:**
```
[SERVICE] getVotingInfo: Found 2 active participants via WebSocket
// But creator expects to see themselves (3 total)
```

**Root Cause:**
Creator hasn't connected via Socket.IO

**Solution:**
Creator must also call `join_meeting`:
```typescript
// Creator needs to do this too!
socket.emit('join_meeting', { meetingId });
```

**Note:** There is no special logic for creators. They are treated exactly like participants.

### Issue 6: Multiple connections from same user

**Symptoms:**
```
[ADD_PARTICIPANT] Updated existing participant user_id
[ADD_PARTICIPANT] Total participants in meeting123: 1
// User opens multiple tabs
```

**Behavior:**
This is correct! The system uses `userId` as the key, so multiple connections from the same user count as one participant.

**What happens:**
- First tab joins: New participant added
- Second tab joins: Participant updated with new socket ID
- First tab disconnects: Participant remains (second tab still active)
- Second tab disconnects: Participant removed

### Issue 7: Broadcast not received by clients

**Symptoms:**
```
[JOIN] Broadcasting to room meeting-meeting123 with 2 participants
// But frontend doesn't receive participants_updated
```

**Root Causes:**
1. Frontend not listening to `participants_updated`
2. Wrong event name
3. Socket not in room

**Debug Steps:**
1. Add listener on frontend:
```typescript
socket.on('participants_updated', (data) => {
  console.log('Participants updated:', data);
  setParticipants(data.participants);
});
```

2. Verify event name matches:
```typescript
// Backend emits: 'participants_updated'
// Frontend must listen: 'participants_updated'
```

3. Check socket is in room:
```typescript
// After successful join
socket.emit('join_meeting', { meetingId }, (response) => {
  if (response.success) {
    console.log('✅ In room, will receive broadcasts');
  }
});
```

## Monitoring in Production

### Health Check Endpoint

Add this REST endpoint to monitor WebSocket health:

```typescript
@Get('debug/websocket-status')
getWebSocketStatus() {
  return {
    totalMeetings: this.meetingsGateway.getTotalMeetings(),
    totalParticipants: this.meetingsGateway.getTotalParticipants(),
    meetings: this.meetingsGateway.getAllMeetingParticipants()
  };
}
```

### Add to Gateway:

```typescript
public getTotalMeetings(): number {
  return this.activeParticipants.size;
}

public getTotalParticipants(): number {
  let total = 0;
  this.activeParticipants.forEach(meeting => {
    total += meeting.size;
  });
  return total;
}

public getAllMeetingParticipants(): any {
  const result: any = {};
  this.activeParticipants.forEach((participants, meetingId) => {
    result[meetingId] = {
      count: participants.size,
      userIds: Array.from(participants.keys())
    };
  });
  return result;
}
```

## Testing Checklist

### Manual Testing

1. **Connection Test**
```bash
# Open browser console
const socket = io('http://localhost:3000', {
  auth: { token: 'YOUR_TOKEN' }
});

socket.on('connect', () => console.log('✅ Connected'));
socket.on('connect_error', (e) => console.error('❌', e));
```

2. **Join Test**
```bash
socket.emit('join_meeting', { meetingId: 'MEETING_ID' }, (res) => {
  console.log('Join result:', res);
});
```

3. **Participant List Test**
```bash
socket.emit('get_participants', { meetingId: 'MEETING_ID' }, (res) => {
  console.log('Participants:', res);
});
```

4. **Broadcast Test**
```bash
socket.on('participants_updated', (data) => {
  console.log('Update received:', data);
});
```

### Automated Testing

```typescript
describe('WebSocket Presence', () => {
  it('should track participant on join', (done) => {
    const socket = io(SERVER_URL, { auth: { token: TEST_TOKEN } });
    
    socket.on('connect', () => {
      socket.emit('join_meeting', { meetingId: TEST_MEETING_ID }, (response) => {
        expect(response.success).toBe(true);
        expect(response.participants).toHaveLength(1);
        done();
      });
    });
  });

  it('should broadcast to all participants', (done) => {
    const socket1 = io(SERVER_URL, { auth: { token: TOKEN1 } });
    const socket2 = io(SERVER_URL, { auth: { token: TOKEN2 } });
    
    socket1.on('connect', () => {
      socket1.emit('join_meeting', { meetingId: TEST_MEETING_ID });
    });

    socket2.on('connect', () => {
      socket2.on('participants_updated', (data) => {
        expect(data.totalParticipants).toBeGreaterThan(0);
        done();
      });
      
      socket2.emit('join_meeting', { meetingId: TEST_MEETING_ID });
    });
  });
});
```

## Log Analysis

### Successful Flow Pattern
```
[CONNECTION] ✅ Client authenticated
[JOIN] ✅ User ... successfully joined
[ADD_PARTICIPANT] ✅ Added new participant
[JOIN] Broadcasting to room ...
[REST_API] Returning N participants
```

### Failed Authentication Pattern
```
[CONNECTION] New client connecting
[CONNECTION] ❌ Authentication failed
// or
[CONNECTION] ❌ Client connected without token
```

### User Not Joining Pattern
```
[CONNECTION] ✅ Client authenticated
// No [JOIN] logs
[REST_API] ⚠️ No participants found
```

### Premature Disconnect Pattern
```
[CONNECTION] ✅ Client authenticated
[JOIN] ✅ User ... successfully joined
[DISCONNECT] Client disconnecting
// Too quickly
```

## Quick Fixes

### Fix 1: Frontend Not Connecting

**Add connection debug:**
```typescript
const socket = io(SERVER_URL, {
  auth: { token },
  transports: ['websocket', 'polling'], // Try both
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000
});

socket.onAny((event, ...args) => {
  console.log('Socket event:', event, args);
});
```

### Fix 2: Token Issues

**Verify token format:**
```typescript
// Correct format
const token = localStorage.getItem('jwt_token');
console.log('Token:', token.substring(0, 20) + '...');

// Ensure it's just the token, not "Bearer token"
const cleanToken = token.replace('Bearer ', '');
```

### Fix 3: Meeting ID Issues

**Add validation:**
```typescript
const meetingId = route.params.id;
console.log('Meeting ID:', meetingId);
console.log('Valid ObjectId:', /^[0-9a-fA-F]{24}$/.test(meetingId));
```

### Fix 4: CORS Issues

**Update gateway CORS:**
```typescript
@WebSocketGateway({
  cors: {
    origin: [
      'http://localhost:5173',
      'http://localhost:3000',
      process.env.FRONTEND_URL
    ],
    credentials: true,
  },
})
```

## Summary

The enhanced logging system provides complete visibility into:

1. ✅ **Connection Flow** - See every connection attempt and authentication
2. ✅ **Join/Leave Flow** - Track every join and leave event with details
3. ✅ **Participant Storage** - Monitor in-memory participant map changes
4. ✅ **Broadcasting** - Confirm broadcasts are sent to correct rooms
5. ✅ **REST Integration** - Verify REST APIs get WebSocket data
6. ✅ **Error Cases** - Clear warnings when something is wrong

**Most Common Issue:**
Users not appearing = Frontend not calling `socket.emit('join_meeting', { meetingId })`

**Verification:**
Check logs for `[JOIN] ✅ User ... successfully joined` - if missing, user never joined via WebSocket.
