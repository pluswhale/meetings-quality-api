# Participant Presence Tracking - January 24, 2026

## Feature Overview

Added real-time participant presence tracking to allow the meeting creator to see who is currently in the meeting room. Participants can join and leave the meeting room, and the creator can monitor their presence.

## What's New

### 1. **Active Participants Tracking**
- New `activeParticipantIds` field in meeting schema
- Tracks which participants are currently in the meeting room
- Separate from `participantIds` (invited participants)

### 2. **Join/Leave Endpoints**
Participants can explicitly join and leave the meeting room:
- `POST /meetings/:id/join` - Join the meeting room
- `POST /meetings/:id/leave` - Leave the meeting room

### 3. **Enhanced Voting Info**
The voting info endpoint now includes active participants:
- Shows who is currently in the meeting room
- Displays participant details (name, email)
- Real-time updates via polling

### 4. **WebSocket Events**
Real-time notifications when participants join/leave:
- `participantJoined` event
- `participantLeft` event

## API Endpoints

### Join Meeting
```http
POST /meetings/:id/join
Authorization: Bearer <token>
```

**Response**:
```json
{
  "_id": "...",
  "title": "Weekly Sync",
  "activeParticipantIds": ["user1", "user2"],
  ...
}
```

**Features**:
- Only participants can join (creator and invited participants)
- Returns 403 if user is not a participant
- Idempotent - can be called multiple times
- Emits WebSocket event `participantJoined`

### Leave Meeting
```http
POST /meetings/:id/leave
Authorization: Bearer <token>
```

**Response**:
```json
{
  "_id": "...",
  "title": "Weekly Sync",
  "activeParticipantIds": ["user2"],
  ...
}
```

**Features**:
- Any user can leave (doesn't check participation)
- Removes user from active participants list
- Emits WebSocket event `participantLeft`

### Get Voting Info (Enhanced)
```http
GET /meetings/:id/voting-info
Authorization: Bearer <token>
```

**Response**:
```json
{
  "meetingId": "...",
  "currentPhase": "emotional_evaluation",
  "participants": [
    { "_id": "user1", "fullName": "John Doe", "email": "john@example.com" },
    { "_id": "user2", "fullName": "Jane Smith", "email": "jane@example.com" }
  ],
  "activeParticipants": [
    { "_id": "user2", "fullName": "Jane Smith", "email": "jane@example.com" }
  ],
  "submissionStatus": {
    "phase": "emotional_evaluation",
    "submitted": ["user2"]
  }
}
```

**New Field**:
- `activeParticipants` - Array of participants currently in the meeting room with their details

## Schema Changes

### Meeting Schema
```typescript
@Schema({ timestamps: true })
export class Meeting {
  // ... existing fields ...
  
  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  participantIds: Types.ObjectId[];

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  activeParticipantIds: Types.ObjectId[];  // ⭐ NEW
  
  // ... rest of fields ...
}
```

### Response DTO
```typescript
export class MeetingResponseDto {
  participantIds: string[];
  activeParticipantIds: string[];  // ⭐ NEW
  // ... rest of fields ...
}
```

## WebSocket Events

### Subscribe to Meeting Room
```javascript
socket.emit('joinMeeting', meetingId);
```

### Listen for Participant Events
```javascript
// Someone joined
socket.on('participantJoined', (data) => {
  console.log('Participant joined:', data);
  // { meetingId: "...", userId: "..." }
});

// Someone left
socket.on('participantLeft', (data) => {
  console.log('Participant left:', data);
  // { meetingId: "...", userId: "..." }
});
```

## Use Cases

### 1. **Creator Monitoring**
The creator can see in real-time:
- Who is currently in the meeting room
- Who has submitted their responses for current phase
- Total number of active participants

### 2. **Participant Status**
Participants can:
- Join the meeting when they arrive
- Leave the meeting when they're done
- Frontend can show "online" indicators

### 3. **Attendance Tracking**
Track meeting attendance by monitoring:
- Who joined the meeting
- How long they stayed
- Who left early

## Frontend Integration

### Join Meeting on Page Load
```typescript
// When participant opens meeting page
useEffect(() => {
  const joinMeeting = async () => {
    await api.post(`/meetings/${meetingId}/join`);
  };
  
  joinMeeting();
  
  return () => {
    // Leave on unmount
    api.post(`/meetings/${meetingId}/leave`);
  };
}, [meetingId]);
```

### Creator View - Show Active Participants
```typescript
// Poll voting info to see who's online
useEffect(() => {
  const fetchVotingInfo = async () => {
    const data = await api.get(`/meetings/${meetingId}/voting-info`);
    setActiveParticipants(data.activeParticipants);
  };
  
  const interval = setInterval(fetchVotingInfo, 3000); // Poll every 3s
  fetchVotingInfo();
  
  return () => clearInterval(interval);
}, [meetingId]);
```

### Real-time Updates (Optional)
```typescript
// Listen for presence events via WebSocket
socket.emit('joinMeeting', meetingId);

socket.on('participantJoined', ({ userId }) => {
  // Update UI to show user is online
  setOnlineUsers(prev => [...prev, userId]);
});

socket.on('participantLeft', ({ userId }) => {
  // Update UI to show user is offline
  setOnlineUsers(prev => prev.filter(id => id !== userId));
});
```

## Example Flow

1. **Meeting Starts**
   - Creator opens meeting page → calls `/meetings/:id/join`
   - Participants open meeting page → call `/meetings/:id/join`

2. **Creator Monitors**
   - Creator polls `/meetings/:id/voting-info` every 3-5 seconds
   - Sees list of active participants in `activeParticipants` array
   - Sees submission status for current phase

3. **Phase Changes**
   - Creator sees who has submitted via `submissionStatus`
   - Creator sees who is still online via `activeParticipants`
   - Creator can wait for everyone to submit before advancing

4. **Participants Leave**
   - When participant closes page → calls `/meetings/:id/leave`
   - Creator sees updated `activeParticipants` list
   - Other participants get WebSocket notification

## Benefits

✅ **Real-time presence** - See who is currently in the meeting  
✅ **Better coordination** - Know when to advance phases  
✅ **Attendance tracking** - Track who participated  
✅ **User experience** - Show online/offline indicators  
✅ **No duplicate submissions** - Join is idempotent  

## Technical Details

### Idempotency
- Calling join multiple times is safe
- User is only added once to `activeParticipantIds`
- Leave removes user even if they weren't active

### Persistence
- Active participants are stored in MongoDB
- Survives server restarts
- Need manual cleanup for stale connections

### WebSocket vs Polling
- WebSocket events for instant updates
- Polling as fallback for reliability
- Both methods supported

## Migration

- Existing meetings will have empty `activeParticipantIds` array
- No data migration needed
- Frontend should handle both old and new formats

## Testing

All changes verified:
```bash
npx tsc --noEmit  # ✅ Passes
```

No linter errors detected.

## Summary

The presence tracking feature allows:
- **Participants** to join/leave meeting rooms explicitly
- **Creators** to see who is currently online and who has submitted
- **Real-time updates** via WebSocket and polling
- **Better meeting coordination** by knowing participant status

This creates a more interactive and responsive meeting experience!
