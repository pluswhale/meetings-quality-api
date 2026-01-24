# Meeting Phases Restructuring - Backend Changes Summary

## Overview
Restructured the meeting phases system to separate data collection into distinct phases with creator-controlled phase transitions and real-time voting information.

## New Meeting Phases

1. **DISCUSSION** (unchanged) - Initial discussion phase
2. **EMOTIONAL_EVALUATION** - Participants set emotional scale and toxicity for all other participants
3. **UNDERSTANDING_CONTRIBUTION** - Participants set personal understanding and distribution of contribution percentages
4. **TASK_PLANNING** - Participants add tasks with deadlines and expected contribution percentages
5. **FINISHED** - Meeting completed

## Schema Changes (`meeting.schema.ts`)

### Updated Meeting Phases Enum
- Removed: `EVALUATION`, `SUMMARY`
- Added: `EMOTIONAL_EVALUATION`, `UNDERSTANDING_CONTRIBUTION`, `TASK_PLANNING`

### New Schema Models

#### EmotionalEvaluation (Phase 2)
```typescript
{
  participantId: ObjectId,
  evaluations: [{
    targetParticipantId: ObjectId,
    emotionalScale: number (-100 to 100),
    isToxic: boolean
  }],
  submittedAt: Date
}
```

#### UnderstandingContribution (Phase 3)
```typescript
{
  participantId: ObjectId,
  understandingScore: number (0-100),
  contributions: [{
    participantId: ObjectId,
    contributionPercentage: number (0-100)
  }],
  submittedAt: Date
}
```

#### TaskPlanning (Phase 4)
```typescript
{
  participantId: ObjectId,
  taskDescription: string,
  deadline: Date,
  expectedContributionPercentage: number (0-100),
  submittedAt: Date
}
```

### Updated Meeting Model
- Replaced `evaluations` array with `emotionalEvaluations` array
- Replaced `summaries` array with `understandingContributions` and `taskPlannings` arrays

## New DTOs

### 1. `submit-emotional-evaluation.dto.ts`
```typescript
{
  evaluations: [{
    targetParticipantId: string,
    emotionalScale: number (-100 to 100),
    isToxic: boolean
  }]
}
```

### 2. `submit-understanding-contribution.dto.ts`
```typescript
{
  understandingScore: number (0-100),
  contributions: [{
    participantId: string,
    contributionPercentage: number (0-100)
  }]
}
```

### 3. `submit-task-planning.dto.ts`
```typescript
{
  taskDescription: string,
  deadline: string (ISO format),
  expectedContributionPercentage: number (0-100)
}
```

## Service Changes (`meetings.service.ts`)

### New Methods

1. **`submitEmotionalEvaluation(id, dto, userId)`**
   - Validates meeting is in `EMOTIONAL_EVALUATION` phase
   - Allows participants to submit emotional evaluations for all other participants
   - Replaces previous submission if exists

2. **`submitUnderstandingContribution(id, dto, userId)`**
   - Validates meeting is in `UNDERSTANDING_CONTRIBUTION` phase
   - Allows participants to submit understanding score and contribution distribution
   - Replaces previous submission if exists

3. **`submitTaskPlanning(id, dto, userId)`**
   - Validates meeting is in `TASK_PLANNING` phase
   - Allows participants to submit tasks with deadlines and expected contributions
   - Replaces previous submission if exists

4. **`getVotingInfo(id, userId)`** ⭐ NEW
   - **Creator-only endpoint**
   - Returns real-time voting information showing which participants have submitted for the current phase
   - Returns:
     ```typescript
     {
       meetingId: string,
       currentPhase: MeetingPhase,
       participants: [{ _id, fullName, email }],
       submissionStatus: {
         phase: MeetingPhase,
         submitted: string[] // array of participant IDs who submitted
       }
     }
     ```

### Updated Methods

- **`changePhase(id, dto, userId)`** - Still creator-only (no changes needed)
- **`findOne(id, userId)`** - Updated populate paths for new schema structure
- **`getStatistics(id, userId)`** - Updated to work with new schema structure

### Removed Methods
- `submitEvaluation()` - replaced by phase-specific methods
- `submitSummary()` - replaced by phase-specific methods

## Controller Changes (`meetings.controller.ts`)

### New Endpoints

1. **POST `/meetings/:id/emotional-evaluations`** ⭐ UPDATED
   - Submit emotional evaluation (phase 2)
   - **Participants only** - Creator cannot submit (returns 403)

2. **POST `/meetings/:id/understanding-contributions`** ⭐ UPDATED
   - Submit understanding and contribution distribution (phase 3)
   - **Participants only** - Creator cannot submit (returns 403)

3. **POST `/meetings/:id/task-plannings`** ⭐ UPDATED
   - Submit task planning (phase 4)
   - **Participants only** - Creator cannot submit (returns 403)
   - **Automatically creates a Task document** in the tasks collection

4. **GET `/meetings/:id/voting-info`**
   - Get real-time voting information
   - **Creator-only** - Returns 403 for non-creators
   - Use for polling to see who has submitted in current phase
   - Returns: `{ meetingId, currentPhase, participants, submissionStatus }`

5. **GET `/meetings/:id/phase-submissions`** ⭐ NEW
   - Get detailed submissions from all participants for all phases
   - **Creator-only** - Returns 403 for non-creators
   - Returns complete data including:
     - All emotional evaluations with scores and toxicity flags
     - All understanding contributions with scores and contribution distributions
     - All task plannings with descriptions, deadlines, and expected contributions
   - Use this to display what participants have submitted, not just who submitted

### Removed Endpoints
- `POST /meetings/:id/evaluations` - replaced by `/emotional-evaluations`
- `POST /meetings/:id/summaries` - replaced by `/task-plannings`

## Deleted Files
- `src/meetings/dto/submit-evaluation.dto.ts` (no longer needed)
- `src/meetings/dto/submit-summary.dto.ts` (no longer needed)

## Key Features

### 1. Creator Controls ⭐ UPDATED
- Only the meeting creator can change phases using `PATCH /meetings/:id/phase`
- Only the creator can view real-time voting info using `GET /meetings/:id/voting-info`
- **NEW**: Only the creator can view detailed submissions using `GET /meetings/:id/phase-submissions`
- **IMPORTANT**: The creator **CANNOT** submit to any phase endpoints (emotional-evaluations, understanding-contributions, task-plannings)
- Creator is excluded from participants list in submission views

### 2. Real-Time Voting Information
- Creator can poll `/meetings/:id/voting-info` to see submission status
- Returns list of all participants and who has submitted for current phase
- Updated in real-time as participants submit

### 3. Detailed Submissions View ⭐ NEW
- Creator can view all detailed submissions using `GET /meetings/:id/phase-submissions`
- Returns complete data for all phases:
  - Emotional evaluations: who evaluated whom, with scores and toxicity flags
  - Understanding contributions: understanding scores and contribution distributions
  - Task plannings: task descriptions, deadlines, and expected contributions
- Includes participant names and emails for easy reference
- Available at any phase (not just finished)

### 4. Phase-Specific Validation ⭐ UPDATED
- Each submission endpoint validates the meeting is in the correct phase
- Returns 400 error if attempting to submit for wrong phase
- **NEW**: Returns 403 error if the creator attempts to submit (only participants can submit)

### 5. Submission Updates
- Participants can update their submission by submitting again
- Latest submission replaces previous one

### 6. Task Integration ⭐ NEW
- When a participant submits a task planning, a Task document is automatically created in the tasks collection
- Tasks appear in the participant's "My Tasks" list
- Task includes: description, deadline, contribution importance, and meeting reference

## Example API Responses

### GET `/meetings/:id/phase-submissions` (Creator only)
```json
{
  "meetingId": "...",
  "title": "Weekly Sync",
  "question": "How should we approach the new feature?",
  "currentPhase": "task_planning",
  "status": "active",
  "participants": [
    { "_id": "user2", "fullName": "John Doe", "email": "john@example.com" },
    { "_id": "user3", "fullName": "Jane Smith", "email": "jane@example.com" }
  ],
  "emotionalEvaluations": [
    {
      "participantId": "user2",
      "participant": { "fullName": "John Doe", "email": "john@example.com" },
      "evaluations": [
        {
          "targetParticipantId": "user3",
          "targetParticipant": { "fullName": "Jane Smith", "email": "jane@example.com" },
          "emotionalScale": 85,
          "isToxic": false
        }
      ],
      "submittedAt": "2026-01-24T10:30:00.000Z"
    }
  ],
  "understandingContributions": [
    {
      "participantId": "user2",
      "participant": { "fullName": "John Doe", "email": "john@example.com" },
      "understandingScore": 90,
      "contributions": [
        {
          "participantId": "user3",
          "participant": { "fullName": "Jane Smith", "email": "jane@example.com" },
          "contributionPercentage": 60
        }
      ],
      "submittedAt": "2026-01-24T11:00:00.000Z"
    }
  ],
  "taskPlannings": [
    {
      "participantId": "user2",
      "participant": { "fullName": "John Doe", "email": "john@example.com" },
      "taskDescription": "Implement user authentication",
      "deadline": "2026-02-01T00:00:00.000Z",
      "expectedContributionPercentage": 80,
      "submittedAt": "2026-01-24T11:30:00.000Z"
    }
  ]
}
```

## Usage Flow

1. **Creator creates meeting** - Starts in `DISCUSSION` phase
2. **Creator advances to phase 2** - `PATCH /meetings/:id/phase { phase: "emotional_evaluation" }`
3. **Participants submit emotional evaluations** - `POST /meetings/:id/emotional-evaluations` (creator cannot submit)
4. **Creator monitors progress** - `GET /meetings/:id/voting-info` (who submitted) or `GET /meetings/:id/phase-submissions` (what they submitted)
5. **Creator advances to phase 3** - `PATCH /meetings/:id/phase { phase: "understanding_contribution" }`
6. **Participants submit understanding/contribution** - `POST /meetings/:id/understanding-contributions` (creator cannot submit)
7. **Creator monitors progress** - `GET /meetings/:id/voting-info` or `GET /meetings/:id/phase-submissions`
8. **Creator advances to phase 4** - `PATCH /meetings/:id/phase { phase: "task_planning" }`
9. **Participants submit tasks** - `POST /meetings/:id/task-plannings` (creator cannot submit, tasks automatically created)
10. **Creator monitors progress** - `GET /meetings/:id/voting-info` or `GET /meetings/:id/phase-submissions`
11. **Participants check their tasks** - Tasks appear in `GET /tasks?filter=current`
12. **Creator finishes meeting** - `PATCH /meetings/:id/phase { phase: "finished" }`

## Next Steps

1. **Generate OpenAPI spec** - Run `npm run generate:openapi` to update API documentation
2. **Frontend integration** - Use polling to fetch `/meetings/:id/voting-info` for real-time updates
3. **Update existing meetings** - Any meetings in old phases will need migration or recreation

## Testing

All code compiles successfully with TypeScript strict mode.

```bash
npx tsc --noEmit  # ✅ Passes
```

## Notes

- No WebSocket/Socket.io changes made (as requested - using polling instead)
- All participants can still view meeting details
- Creator role is enforced for phase changes and voting info access
- Statistics endpoint updated to work with new schema structure
