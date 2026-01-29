# Voting System Changes - Join/Leave Based Participants

## Overview
Updated the voting system to use **real-time join/leave behavior** instead of static participant lists. Voting participants are now determined dynamically based on who has actively joined the meeting room.

## ✅ Changes Implemented

### 1. Voting Participants Logic Updated

**Before:** 
- Voting info returned `meeting.participantIds` (static invited list)
- Creator was always included regardless of join status

**After:**
- Voting info returns `meeting.activeParticipants` (dynamic join/leave list)
- Creator must join to be included in voting (no special treatment)

### 2. Key Behavioral Changes

#### Participant Lists Explained

| List | Purpose | When Updated | Used For |
|------|---------|--------------|----------|
| `participantIds` | Static invited list | At meeting creation/update | Authorization to join |
| `activeParticipants` | Dynamic "in room" list | On join/leave | Voting participants |

#### Voting Participation Requirements

✅ **To participate in voting, a user must:**
1. Be in `participantIds` (invited to the meeting)
2. Call `POST /meetings/:id/join` (join the meeting)
3. NOT have called `POST /meetings/:id/leave` (still in the room)

#### Creator Treatment

✅ **The creator is treated identically to other participants:**
- Creator is automatically added to `participantIds` at meeting creation
- Creator must call `/join` to appear in voting participants
- Creator can call `/leave` to remove themselves from voting
- No hardcoded creator logic in voting calculations

### 3. API Changes

#### Updated Endpoint: `GET /meetings/:id/voting-info`

**Response Structure (Before):**
```json
{
  "meetingId": "string",
  "currentPhase": "emotional_evaluation",
  "participants": [...],           // Static participantIds
  "activeParticipants": [...],     // Join/leave based
  "submissionStatus": {...}
}
```

**Response Structure (After):**
```json
{
  "meetingId": "string",
  "currentPhase": "emotional_evaluation",
  "votingParticipants": [...],     // Join/leave based (renamed from activeParticipants)
  "totalVotingParticipants": 5,    // Count of voting participants
  "submissionStatus": {
    "phase": "emotional_evaluation",
    "submitted": ["user1", "user2"]
  },
  "votingProgress": {               // NEW: Voting progress calculation
    "submitted": 2,
    "total": 5,
    "percentage": 40
  }
}
```

**Key Changes:**
- ❌ Removed: `participants` (static list)
- ✅ Renamed: `activeParticipants` → `votingParticipants` (clearer naming)
- ✅ Added: `totalVotingParticipants` (quick count)
- ✅ Added: `votingProgress` (submission progress tracking)
- ✅ Added: Support for `task_evaluation` phase (was missing)

### 4. Voting Progress Calculation

The endpoint now calculates real-time voting progress:

```typescript
votingProgress: {
  submitted: 2,        // Number who submitted in current phase
  total: 5,            // Total voting participants (actively joined)
  percentage: 40       // Rounded percentage (submitted/total * 100)
}
```

**Edge Cases Handled:**
- If no one has joined: `percentage: 0`
- If everyone has left: `percentage: 0`
- Division by zero protected

## Implementation Details

### Modified Files

#### 1. `src/meetings/meetings.service.ts`

**Method: `getVotingInfo()`**

**Changes:**
```typescript
// BEFORE: Used static participant list
const participants = meeting.participantIds as any[];
const participantList = participants.map(...);

// AFTER: Uses dynamic active participants
const activeParticipants = (meeting.activeParticipants as any[]).map((ap: any) => ({
  _id: (ap.participantId?._id || ap.participantId).toString(),
  fullName: ap.participantId?.fullName || null,
  email: ap.participantId?.email || null,
  joinedAt: ap.joinedAt,
  lastSeen: ap.lastSeen,
}));
```

**Added Phase Support:**
```typescript
case MeetingPhase.TASK_EVALUATION:
  submissionStatus = {
    phase: MeetingPhase.TASK_EVALUATION,
    submitted: (meeting.taskEvaluations as any[]).map((e: any) => {
      const participantId = e.participantId?._id || e.participantId;
      return participantId.toString();
    }),
  };
  break;
```

#### 2. `src/meetings/meetings.controller.ts`

**Updated API Documentation:**
- Added detailed description explaining join/leave requirements
- Clarified that creator must join to participate
- Documented response structure changes
- Added voting progress explanation

### Existing Join/Leave Logic (Unchanged)

The join/leave endpoints were already correctly implemented:

#### `POST /meetings/:id/join`
```typescript
// Checks if user is in participantIds (invited list)
const isParticipant = (meeting.participantIds as any[]).some((pId: any) => {
  const participantId = pId._id || pId;
  return participantId.equals(userObjectId);
});

if (!isParticipant) {
  throw new ForbiddenException('Only participants can join the meeting');
}

// Adds to activeParticipants with joinedAt timestamp
(meeting.activeParticipants as any[]).push({
  participantId: userObjectId,
  joinedAt: now,
  lastSeen: now,
});
```

#### `POST /meetings/:id/leave`
```typescript
// Removes from activeParticipants
meeting.activeParticipants = (meeting.activeParticipants as any[]).filter((ap: any) => {
  const participantId = ap.participantId?._id || ap.participantId;
  return !participantId.equals(userObjectId);
});
```

## Data Flow

### Meeting Creation
```
1. Creator creates meeting
2. Creator is auto-added to participantIds
3. Other invited users added to participantIds
4. activeParticipants = [] (empty initially)
```

### User Joins Meeting
```
1. User calls POST /meetings/:id/join
2. System checks: Is user in participantIds?
3. If yes: Add to activeParticipants with timestamp
4. If no: Return 403 Forbidden
5. Emit WebSocket event: participantJoined
```

### User Leaves Meeting
```
1. User calls POST /meetings/:id/leave
2. System removes user from activeParticipants
3. Emit WebSocket event: participantLeft
```

### Creator Views Voting Info
```
1. Creator calls GET /meetings/:id/voting-info
2. System returns activeParticipants as votingParticipants
3. System calculates submission progress
4. Response includes who submitted in current phase
```

## Example Scenarios

### Scenario 1: Creator Doesn't Join

```json
// Meeting state
{
  "participantIds": ["creator_id", "user1_id", "user2_id"],
  "activeParticipants": [
    { "participantId": "user1_id", "joinedAt": "..." },
    { "participantId": "user2_id", "joinedAt": "..." }
  ]
}

// Voting info response
{
  "votingParticipants": [
    { "_id": "user1_id", "fullName": "User 1", ... },
    { "_id": "user2_id", "fullName": "User 2", ... }
  ],
  "totalVotingParticipants": 2
  // Note: Creator is NOT in votingParticipants because they didn't join
}
```

### Scenario 2: Creator Joins

```json
// After creator calls /join
{
  "participantIds": ["creator_id", "user1_id", "user2_id"],
  "activeParticipants": [
    { "participantId": "creator_id", "joinedAt": "..." },
    { "participantId": "user1_id", "joinedAt": "..." },
    { "participantId": "user2_id", "joinedAt": "..." }
  ]
}

// Voting info response
{
  "votingParticipants": [
    { "_id": "creator_id", "fullName": "Creator", ... },
    { "_id": "user1_id", "fullName": "User 1", ... },
    { "_id": "user2_id", "fullName": "User 2", ... }
  ],
  "totalVotingParticipants": 3
  // Note: Creator IS in votingParticipants because they joined
}
```

### Scenario 3: User Leaves Mid-Voting

```json
// User 2 calls /leave
{
  "participantIds": ["creator_id", "user1_id", "user2_id"],
  "activeParticipants": [
    { "participantId": "creator_id", "joinedAt": "..." },
    { "participantId": "user1_id", "joinedAt": "..." }
    // user2 removed
  ]
}

// Voting info response
{
  "votingParticipants": [
    { "_id": "creator_id", "fullName": "Creator", ... },
    { "_id": "user1_id", "fullName": "User 1", ... }
  ],
  "totalVotingParticipants": 2,
  "votingProgress": {
    "submitted": 1,     // Only user1 submitted before user2 left
    "total": 2,         // Now only 2 active participants
    "percentage": 50
  }
  // Note: User 2 removed from voting list after leaving
}
```

## Migration & Compatibility

### Frontend Changes Needed

#### Before (Old Code):
```typescript
// Frontend was using 'participants' from response
const votingParticipants = response.participants;
```

#### After (New Code):
```typescript
// Frontend should use 'votingParticipants' instead
const votingParticipants = response.votingParticipants;

// Also available: voting progress
const progress = response.votingProgress.percentage;
```

### Breaking Changes

⚠️ **Response Structure Changed:**
- Field `participants` removed
- Field `activeParticipants` renamed to `votingParticipants`

✅ **Backward Compatibility Workaround:**
If needed for gradual migration, could add:
```typescript
return {
  // ... other fields
  votingParticipants: activeParticipants,
  participants: activeParticipants,  // Deprecated alias
};
```

## Testing Checklist

### Test Cases

✅ **Join/Leave Behavior:**
1. Creator creates meeting → creator in participantIds, NOT in activeParticipants
2. Creator joins → creator added to activeParticipants
3. Participant joins → added to activeParticipants
4. Participant leaves → removed from activeParticipants
5. User not invited tries to join → 403 Forbidden

✅ **Voting Info:**
1. Only joined users appear in votingParticipants
2. Creator appears only if joined
3. User leaves → removed from votingParticipants
4. User rejoins → re-added to votingParticipants
5. Voting progress calculates correctly

✅ **All Voting Phases:**
1. EMOTIONAL_EVALUATION - submission status works
2. UNDERSTANDING_CONTRIBUTION - submission status works
3. TASK_PLANNING - submission status works
4. TASK_EVALUATION - submission status works (newly added)

✅ **Edge Cases:**
1. No one joined → votingParticipants = [], progress = 0%
2. Everyone left → votingParticipants = [], progress = 0%
3. Only creator joined → votingParticipants = [creator]
4. Creator never joins → creator not in votingParticipants

## Permission Consistency

### Authorization Rules

| Action | Requires | Check Against |
|--------|----------|---------------|
| Create meeting | Authenticated | - |
| Join meeting | In participantIds | participantIds |
| Leave meeting | Currently joined | activeParticipants |
| Submit vote | Currently joined | activeParticipants |
| View voting info | Is creator | creatorId |
| Change phase | Is creator | creatorId |

### No Special Creator Logic

✅ **Consistent Treatment:**
- Creator authorization: Checked by `creatorId`
- Creator voting eligibility: Checked by presence in `activeParticipants`
- Creator submission: Treated like any participant

## Performance Considerations

### Optimizations Present

✅ **Efficient Queries:**
- `activeParticipants` stored as embedded array (no extra query)
- Participant info populated in single query
- Progress calculated in-memory (no aggregation query)

### Potential Improvements

💡 **If Scaling Issues Arise:**
1. Index `activeParticipants.participantId` if array grows large
2. Cache voting info with short TTL (e.g., 5 seconds)
3. Use WebSocket for real-time updates instead of polling

## Summary

✅ **All Requirements Met:**
1. ✅ Voting participants based on join/leave endpoints
2. ✅ Creator treated like any other participant
3. ✅ Must join to participate in voting
4. ✅ No hardcoded creator logic
5. ✅ Real-time join/leave behavior reflected
6. ✅ Consistent across all voting phases
7. ✅ Clean API response with progress tracking

**Result:** The voting system now accurately reflects who is actively participating in the meeting, with the creator having no special privileges regarding voting eligibility.
