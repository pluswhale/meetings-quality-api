# Enhanced Participant Presence & Voting API - January 27, 2026

## Overview
Implemented comprehensive participant tracking and simplified voting data endpoints for the meeting quality platform with detailed timestamps and real-time presence monitoring.

## New API Endpoints

### 1. Join Meeting Room
**POST** `/meetings/:id/join`

**Description**: Mark participant as actively present in meeting room with timestamp tracking.

**Authentication**: Required (JWT)

**Request**: No body needed (user from JWT)

**Response Example**:
```json
{
  "meetingId": "679a1234567890abcdef",
  "userId": "679a9876543210fedcba",
  "joinedAt": "2026-01-27T10:00:00.000Z",
  "activeParticipants": [
    {
      "_id": "679a9876543210fedcba",
      "fullName": "John Doe",
      "email": "john@example.com",
      "isActive": true,
      "joinedAt": "2026-01-27T10:00:00.000Z",
      "lastSeen": "2026-01-27T10:00:00.000Z"
    },
    {
      "_id": "679a1111222233334444",
      "fullName": "Jane Smith",
      "email": "jane@example.com",
      "isActive": true,
      "joinedAt": "2026-01-27T09:55:00.000Z",
      "lastSeen": "2026-01-27T09:58:00.000Z"
    }
  ]
}
```

**Features**:
- Only participants can join (returns 403 otherwise)
- Idempotent - updates `lastSeen` if already joined
- Tracks `joinedAt` and `lastSeen` timestamps
- Returns all active participants with details
- Emits `participantJoined` WebSocket event

### 2. Leave Meeting Room
**POST** `/meetings/:id/leave`

**Description**: Mark participant as no longer active in the meeting room.

**Authentication**: Required (JWT)

**Request**: No body needed

**Response Example**:
```json
{
  "success": true
}
```

**Features**:
- Removes user from active participants
- Emits `participantLeft` WebSocket event
- Can be called by anyone (doesn't verify participation)

### 3. Get Active Participants
**GET** `/meetings/:id/active-participants`

**Description**: Get list of currently active participants in meeting room with presence details.

**Authentication**: Required (JWT)

**Response Example**:
```json
{
  "meetingId": "679a1234567890abcdef",
  "activeParticipants": [
    {
      "_id": "679a9876543210fedcba",
      "fullName": "John Doe",
      "email": "john@example.com",
      "isActive": true,
      "joinedAt": "2026-01-27T10:00:00.000Z",
      "lastSeen": "2026-01-27T10:15:00.000Z"
    },
    {
      "_id": "679a1111222233334444",
      "fullName": "Jane Smith",
      "email": "jane@example.com",
      "isActive": true,
      "joinedAt": "2026-01-27T09:55:00.000Z",
      "lastSeen": "2026-01-27T10:14:00.000Z"
    }
  ],
  "totalParticipants": 5,
  "activeCount": 2
}
```

**Features**:
- Available to all participants
- Shows join time and last activity
- Includes participant counts
- Updates automatically when called

### 4. Get All Submissions (Simplified)
**GET** `/meetings/:id/all-submissions`

**Description**: Get all submissions from all phases in a simplified, frontend-friendly format.

**Authentication**: Required (JWT)

**Access**: Creator only (returns 403 for non-creators)

**Response Example**:
```json
{
  "meetingId": "679a1234567890abcdef",
  "submissions": {
    "emotional_evaluation": {
      "679a9876543210fedcba": {
        "participant": {
          "_id": "679a9876543210fedcba",
          "fullName": "John Doe",
          "email": "john@example.com"
        },
        "submitted": true,
        "submittedAt": "2026-01-27T10:05:00.000Z",
        "evaluations": [
          {
            "targetParticipant": {
              "_id": "679a1111222233334444",
              "fullName": "Jane Smith"
            },
            "emotionalScale": 85,
            "isToxic": false
          }
        ]
      }
    },
    "understanding_contribution": {
      "679a9876543210fedcba": {
        "participant": {
          "_id": "679a9876543210fedcba",
          "fullName": "John Doe",
          "email": "john@example.com"
        },
        "submitted": true,
        "submittedAt": "2026-01-27T10:10:00.000Z",
        "understandingScore": 90,
        "contributions": [
          {
            "participant": {
              "_id": "679a1111222233334444",
              "fullName": "Jane Smith"
            },
            "contributionPercentage": 60
          }
        ]
      }
    },
    "task_planning": {
      "679a9876543210fedcba": {
        "participant": {
          "_id": "679a9876543210fedcba",
          "fullName": "John Doe",
          "email": "john@example.com"
        },
        "submitted": true,
        "submittedAt": "2026-01-27T10:15:00.000Z",
        "taskDescription": "Implement user authentication",
        "deadline": "2026-02-01T00:00:00.000Z",
        "expectedContributionPercentage": 80
      }
    }
  }
}
```

**Features**:
- Creator-only access
- Grouped by phase, then by participant ID
- Includes participant info inline (no extra lookups needed)
- Only includes phases with submissions
- Easier to display in UI popovers/dropdowns

## Schema Changes

### Active Participant Schema
```typescript
@Schema({ _id: false })
export class ActiveParticipant {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  participantId: Types.ObjectId;

  @Prop({ default: Date.now })
  joinedAt: Date;

  @Prop({ default: Date.now })
  lastSeen: Date;
}
```

### Meeting Schema Updates
```typescript
export class Meeting {
  // ... existing fields ...
  
  @Prop({ type: [ActiveParticipantSchema], default: [] })
  activeParticipants: ActiveParticipant[];  // Enhanced with timestamps
  
  // ... rest of fields ...
}
```

## Implementation Details

### Participant Tracking
- **joinedAt**: Set once when participant first joins
- **lastSeen**: Updated every time join endpoint is called
- **Auto-update**: Call join endpoint periodically to update lastSeen
- **Cleanup**: Manual cleanup required (or implement auto-kick after 5 min inactive)

### Data Format
- **Object keyed by participant ID**: Easy lookups in frontend
- **Inline participant data**: No need for separate lookups
- **Phase-grouped**: Easy to display by phase
- **Only submitted data**: Reduces response size

### Performance
- Indexed fields: `activeParticipants.participantId`, `activeParticipants.lastSeen`
- Cached in MongoDB (no Redis needed for MVP)
- WebSocket for instant updates
- Polling as fallback (recommended: every 3-5 seconds)

## Frontend Integration Examples

### Join on Page Load
```typescript
useEffect(() => {
  // Join when mounting
  const join = async () => {
    try {
      await api.post(`/meetings/${meetingId}/join`);
    } catch (error) {
      console.error('Failed to join:', error);
    }
  };
  
  join();
  
  // Update presence every 30 seconds
  const interval = setInterval(join, 30000);
  
  // Leave on unmount
  return () => {
    clearInterval(interval);
    api.post(`/meetings/${meetingId}/leave`).catch(console.error);
  };
}, [meetingId]);
```

### Poll Active Participants (Creator View)
```typescript
useEffect(() => {
  const fetchActive = async () => {
    const data = await api.get(`/meetings/${meetingId}/active-participants`);
    setActiveParticipants(data.activeParticipants);
    setActiveCount(data.activeCount);
  };
  
  fetchActive();
  const interval = setInterval(fetchActive, 5000); // Every 5 seconds
  
  return () => clearInterval(interval);
}, [meetingId]);
```

### Display All Submissions (Creator Popover)
```typescript
const fetchSubmissions = async () => {
  const data = await api.get(`/meetings/${meetingId}/all-submissions`);
  
  // Easy to map over phases
  Object.entries(data.submissions).forEach(([phase, participants]) => {
    console.log(`Phase: ${phase}`);
    
    // Easy to map over participants
    Object.entries(participants).forEach(([userId, submission]) => {
      console.log(`${submission.participant.fullName}: ${submission.submitted}`);
    });
  });
};
```

### WebSocket Real-time Updates
```typescript
socket.emit('joinMeeting', meetingId);

socket.on('participantJoined', ({ userId }) => {
  // Refresh active participants list
  fetchActiveParticipants();
});

socket.on('participantLeft', ({ userId }) => {
  // Refresh active participants list
  fetchActiveParticipants();
});
```

## Migration Notes

- Existing meetings will have empty `activeParticipants` array
- Old `activeParticipantIds` field removed (replaced with `activeParticipants`)
- No data migration needed
- Frontend should handle both formats during transition

## Security

- ✅ Join: Only meeting participants can join (403 otherwise)
- ✅ Leave: Anyone can leave (no validation)
- ✅ Active Participants: All participants can view
- ✅ All Submissions: Creator only (403 for non-creators)

## Performance Considerations

### Recommended Polling Intervals
- **Join heartbeat**: Every 30-60 seconds (keep presence alive)
- **Active participants**: Every 3-5 seconds (creator view)
- **All submissions**: On-demand or every 10 seconds (when viewing popover)

### Auto-cleanup (Future Enhancement)
```typescript
// Mark as inactive after 5 minutes of no activity
// Run as cron job or on-demand
const INACTIVE_THRESHOLD = 5 * 60 * 1000; // 5 minutes
activeParticipants = activeParticipants.filter(ap => 
  Date.now() - ap.lastSeen.getTime() < INACTIVE_THRESHOLD
);
```

## API Comparison

### Old vs New
| Feature | Old Endpoint | New Endpoint | Improvement |
|---------|-------------|--------------|-------------|
| Join meeting | `POST /meetings/:id/join` | `POST /meetings/:id/join` | Now returns active participants |
| Leave meeting | `POST /meetings/:id/leave` | `POST /meetings/:id/leave` | Simpler response |
| Get active | Via `/voting-info` | `GET /meetings/:id/active-participants` | Dedicated endpoint |
| All submissions | `/phase-submissions` | `GET /meetings/:id/all-submissions` | Flatter, keyed by ID |

## Testing

All changes verified:
```bash
npx tsc --noEmit  # ✅ Passes
```

No linter errors detected.

## Summary

These endpoints provide:
- ✅ **Real-time presence tracking** with timestamps
- ✅ **Simplified data format** for frontend consumption
- ✅ **Dedicated endpoints** for specific use cases
- ✅ **Creator-only access** to submission details
- ✅ **WebSocket support** for instant updates
- ✅ **Polling fallback** for reliability

Perfect for building real-time meeting room UIs with presence indicators and voting progress displays!
