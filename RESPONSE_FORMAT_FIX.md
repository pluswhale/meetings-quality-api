# Response Format Fix - January 24, 2026

## Problem
The API was returning inconsistent data structures - some fields were populated with full objects while others were just IDs. This caused confusion on the frontend where you expected just ID strings but got nested objects like `{ _id: "...", fullName: "...", email: "..." }`.

### Example of the Problem
```json
{
  "creatorId": {
    "_id": "6974c5d9d5a897de85ca695b",
    "fullName": "Бабашка Дашка",
    "email": "darya@gmail.com"
  },
  "participantIds": ["6974c5d9d5a897de85ca695b"],
  "emotionalEvaluations": [{
    "participantId": {
      "_id": "6974c5add5a897de85ca6950",
      "fullName": "Дульцев Егор Алексеевич",
      "email": "123@gmail.com"
    }
  }]
}
```

## Solution
Added a transformation layer that converts all responses to consistent format where **all IDs are strings**, not populated objects.

### Changes Made

1. **Created `transformMeetingResponse()` method** in `MeetingsService`
   - Transforms all nested populated fields to just ID strings
   - Ensures consistent response structure across all endpoints

2. **Split `findOne()` into two methods**:
   - `findOneInternal()` - Used internally by service methods (keeps populated data for business logic)
   - `findOne()` - Public API method that returns transformed response

3. **Updated all public API methods** to return transformed responses:
   - `create()` - Returns transformed meeting
   - `findAll()` - Returns array of transformed meetings
   - `findOne()` - Returns transformed meeting
   - `update()` - Returns transformed meeting
   - `changePhase()` - Returns transformed meeting
   - `submitEmotionalEvaluation()` - Returns transformed meeting
   - `submitUnderstandingContribution()` - Returns transformed meeting
   - `submitTaskPlanning()` - Returns transformed meeting

## New Response Format

### Consistent Structure
All meeting responses now follow this format where **every ID is a string**:

```json
{
  "_id": "6974e92a427df5f446e5f96d",
  "title": "Встреча от Даши",
  "question": "Вопрос я крутой руководитель?",
  "creatorId": "6974c5d9d5a897de85ca695b",
  "participantIds": [
    "6974c5d9d5a897de85ca695b",
    "6974c5add5a897de85ca6950"
  ],
  "currentPhase": "emotional_evaluation",
  "status": "active",
  "emotionalEvaluations": [
    {
      "participantId": "6974c5add5a897de85ca6950",
      "evaluations": [
        {
          "targetParticipantId": "6974c5d9d5a897de85ca695b",
          "emotionalScale": 27,
          "isToxic": true
        }
      ],
      "submittedAt": "2026-01-24T15:46:53.811Z"
    }
  ],
  "understandingContributions": [],
  "taskPlannings": [],
  "createdAt": "2026-01-24T15:45:46.921Z",
  "updatedAt": "2026-01-24T15:46:53.814Z",
  "__v": 1
}
```

### Key Points

✅ **All ID fields are strings**:
- `creatorId` - String ID
- `participantIds` - Array of string IDs
- `emotionalEvaluations[].participantId` - String ID
- `emotionalEvaluations[].evaluations[].targetParticipantId` - String ID
- `understandingContributions[].participantId` - String ID
- `understandingContributions[].contributions[].participantId` - String ID
- `taskPlannings[].participantId` - String ID

✅ **No populated user objects in standard responses**

✅ **Consistent across all endpoints**:
- `GET /meetings` - List of transformed meetings
- `GET /meetings/:id` - Single transformed meeting
- `POST /meetings` - Returns transformed meeting
- `PATCH /meetings/:id` - Returns transformed meeting
- `PATCH /meetings/:id/phase` - Returns transformed meeting
- `POST /meetings/:id/emotional-evaluations` - Returns transformed meeting
- `POST /meetings/:id/understanding-contributions` - Returns transformed meeting
- `POST /meetings/:id/task-plannings` - Returns transformed meeting

## Detailed Submissions (Creator Only)

The **`GET /meetings/:id/phase-submissions`** endpoint is different - it **DOES** include populated user data for display purposes:

```json
{
  "meetingId": "...",
  "title": "Weekly Sync",
  "question": "How should we approach?",
  "currentPhase": "task_planning",
  "status": "active",
  "participants": [
    {
      "_id": "user2",
      "fullName": "John Doe",
      "email": "john@example.com"
    }
  ],
  "emotionalEvaluations": [
    {
      "participantId": "user2",
      "participant": {
        "fullName": "John Doe",
        "email": "john@example.com"
      },
      "evaluations": [
        {
          "targetParticipantId": "user3",
          "targetParticipant": {
            "fullName": "Jane Smith",
            "email": "jane@example.com"
          },
          "emotionalScale": 85,
          "isToxic": false
        }
      ],
      "submittedAt": "2026-01-24T10:30:00.000Z"
    }
  ]
}
```

This endpoint includes both IDs and populated participant objects for easy display.

## Frontend Integration

### Before (Inconsistent)
```typescript
// Sometimes you got a string
const creatorId = meeting.creatorId; // string

// Sometimes you got an object
const creatorId = meeting.creatorId._id; // object with _id property
```

### After (Consistent)
```typescript
// Always a string
const creatorId = meeting.creatorId; // always string
const participantIds = meeting.participantIds; // always array of strings

// For nested evaluations
meeting.emotionalEvaluations.forEach(evaluation => {
  const participantId = evaluation.participantId; // always string
  evaluation.evaluations.forEach(e => {
    const targetId = e.targetParticipantId; // always string
  });
});
```

## Migration Impact

- ✅ No database changes needed
- ✅ Existing frontend code that expects strings will work correctly
- ⚠️ Frontend code that expects populated objects (like `creatorId.fullName`) will need updates
- ℹ️ Use `GET /meetings/:id/phase-submissions` if you need populated user data

## Testing

All changes verified:
```bash
npx tsc --noEmit  # ✅ Passes
```

No linter errors.

## Summary

All meeting API responses now return consistent data structures with:
- All IDs as strings (not populated objects)
- Nested arrays properly transformed
- Predictable structure for frontend consumption
- Special detailed endpoint for when you need user info
