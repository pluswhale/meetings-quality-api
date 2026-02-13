# Partial Voting Feature - Implementation Summary

## ✅ What Was Changed

Users can now submit **partial votes** - they only need to vote for **at least 1 person/task**, not everyone. The creator can see all partial submissions immediately.

---

## 🎯 Key Changes

### 1. Validation Updated (DTOs)

Added `@ArrayMinSize(1)` to require at least one vote:

**Files Modified:**
- `src/meetings/dto/submit-emotional-evaluation.dto.ts`
- `src/meetings/dto/submit-understanding-contribution.dto.ts`
- `src/meetings/dto/submit-task-evaluation.dto.ts`

**Before:**
```typescript
@IsArray()
evaluations: ParticipantEmotionalEvaluationDto[];
// ❌ Could submit empty array []
```

**After:**
```typescript
@IsArray()
@ArrayMinSize(1, { message: 'You must evaluate at least one participant' })
evaluations: ParticipantEmotionalEvaluationDto[];
// ✅ Must have at least 1 evaluation
```

### 2. API Documentation Enhanced

Updated all submission endpoints to clarify partial voting is allowed:

**Example - Emotional Evaluation:**
```
ВАЖНО: Не обязательно оценивать всех участников!
- Минимум: 1 участник
- Можно отправить оценку только для тех, кого хотите оценить
- Можно обновить оценку, отправив новую
- Создатель видит все частичные оценки в /all-submissions
```

---

## 📊 How It Works

### Phase 1: Emotional Evaluation

**User can vote for:**
- ✅ 1 participant (minimum)
- ✅ Some participants
- ✅ All participants

**Example Request:**
```json
POST /meetings/:id/emotional-evaluations

{
  "evaluations": [
    {
      "targetParticipantId": "user1",
      "emotionalScale": 80,
      "isToxic": false
    }
    // Can add more, but 1 is enough!
  ]
}
```

**What Creator Sees:**
```json
GET /meetings/:id/all-submissions

{
  "submissions": {
    "emotional_evaluation": {
      "user123": {
        "participant": { "_id": "user123", "fullName": "John" },
        "submitted": true,
        "evaluations": [
          {
            "targetParticipant": { "_id": "user1", "fullName": "Alice" },
            "emotionalScale": 80,
            "isToxic": false
          }
          // Only 1 evaluation - that's OK!
        ]
      }
    }
  }
}
```

---

### Phase 2: Understanding Contribution

**User can vote for:**
- ✅ 1 participant (minimum)
- ✅ Some participants  
- ✅ All participants

**Note:** Percentages don't need to sum to 100%!

**Example Request:**
```json
POST /meetings/:id/understanding-contributions

{
  "understandingScore": 85,
  "contributions": [
    {
      "participantId": "user1",
      "contributionPercentage": 60
    },
    {
      "participantId": "user2",
      "contributionPercentage": 40
    }
    // Can be just 1, or more - doesn't need to be 100%
  ]
}
```

---

### Phase 3: Task Planning

**No minimum requirement** - each user submits their own task (0 or 1).

---

### Phase 4: Task Evaluation

**User can vote for:**
- ✅ 1 task (minimum)
- ✅ Some tasks
- ✅ All tasks

**Example Request:**
```json
POST /meetings/:id/task-evaluations

{
  "evaluations": [
    {
      "taskAuthorId": "user1",
      "importanceScore": 85
    }
    // Can evaluate just 1 task, or more!
  ]
}
```

---

## 🔍 Creator View (All Submissions)

The creator can see **all partial submissions** via:

```
GET /meetings/:id/all-submissions
```

**Key Points:**
- ✅ Shows partial submissions immediately
- ✅ If user didn't evaluate someone, they won't be in the list
- ✅ No waiting for "complete" submissions
- ✅ Can track progress in real-time

**Example Response Structure:**
```json
{
  "meetingId": "507f...",
  "submissions": {
    "emotional_evaluation": {
      "user1": {
        "participant": { "_id": "user1", "fullName": "John" },
        "submitted": true,
        "submittedAt": "2026-02-04T15:45:09.268Z",
        "evaluations": [
          // Only the evaluations user1 submitted (might be 1, might be 10)
        ]
      },
      "user2": {
        "participant": { "_id": "user2", "fullName": "Jane" },
        "submitted": true,
        "submittedAt": "2026-02-04T15:46:30.123Z",
        "evaluations": [
          // Only the evaluations user2 submitted
        ]
      }
    },
    "understanding_contribution": {
      "user1": {
        "participant": { "_id": "user1", "fullName": "John" },
        "submitted": true,
        "understandingScore": 70,
        "contributions": [
          // Partial contribution list - that's OK!
        ]
      }
    },
    "task_planning": {
      "user1": {
        "taskId": "507f...",
        "taskDescription": "...",
        "approved": false
      }
    },
    "task_evaluation": {
      "user1": {
        "evaluations": [
          // Partial task evaluations - that's OK!
        ]
      }
    }
  }
}
```

---

## 🚫 Validation Rules

### What IS Required:
- ✅ At least **1 evaluation** per submission
- ✅ Valid participant/task IDs
- ✅ Scores within valid ranges

### What is NOT Required:
- ❌ Evaluating all participants
- ❌ Evaluating all tasks
- ❌ Percentages summing to 100%
- ❌ Complete submissions before viewing

---

## 📝 Error Responses

### If User Submits Empty Array:
```json
{
  "statusCode": 400,
  "message": [
    "evaluations must contain at least 1 elements"
  ],
  "error": "Bad Request"
}
```

### If Invalid Participant ID:
```json
{
  "statusCode": 400,
  "message": "Task author xxx not found in task plannings",
  "error": "Bad Request"
}
```

---

## 🔄 Updates Allowed

Users can **update** their submissions by submitting again:

```typescript
// First submission
POST /meetings/:id/emotional-evaluations
{ "evaluations": [{ "targetParticipantId": "user1", ... }] }

// Update (overwrites previous)
POST /meetings/:id/emotional-evaluations
{ "evaluations": [
  { "targetParticipantId": "user1", ... },
  { "targetParticipantId": "user2", ... }
]}
```

**Behavior:**
- ✅ Previous submission is **replaced** (not merged)
- ✅ Can add more evaluations
- ✅ Can change evaluations
- ✅ WebSocket notification sent

---

## 🎭 Frontend Implementation Guide

### 1. Emotional Evaluation Form

```typescript
// User can select which participants to evaluate
const [selectedParticipants, setSelectedParticipants] = useState([]);

function handleSubmit() {
  // Only submit evaluations for selected participants
  const evaluations = selectedParticipants.map(userId => ({
    targetParticipantId: userId,
    emotionalScale: scores[userId],
    isToxic: toxicFlags[userId]
  }));
  
  // ✅ Can be just 1 evaluation, doesn't need to be all
  if (evaluations.length === 0) {
    alert('Please evaluate at least one participant');
    return;
  }
  
  await api.post(`/meetings/${meetingId}/emotional-evaluations`, {
    evaluations
  });
}
```

### 2. Display Partial Submissions (Creator View)

```typescript
function SubmissionsView({ meetingId }) {
  const { data } = useQuery(['submissions', meetingId], 
    () => api.get(`/meetings/${meetingId}/all-submissions`)
  );
  
  return (
    <div>
      <h2>Emotional Evaluations</h2>
      {Object.entries(data.submissions.emotional_evaluation).map(([userId, submission]) => (
        <div key={userId}>
          <h3>{submission.participant.fullName}</h3>
          <p>Evaluated {submission.evaluations.length} participants</p>
          {/* Show partial list - that's OK! */}
          <ul>
            {submission.evaluations.map(eval => (
              <li key={eval.targetParticipant._id}>
                {eval.targetParticipant.fullName}: {eval.emotionalScale}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
```

### 3. Voting Progress

```typescript
function VotingProgress({ meetingId }) {
  const { data: pendingVoters } = useQuery(['pending-voters', meetingId],
    () => api.get(`/meetings/${meetingId}/pending-voters`)
  );
  
  const { data: submissions } = useQuery(['submissions', meetingId],
    () => api.get(`/meetings/${meetingId}/all-submissions`)
  );
  
  return (
    <div>
      <h3>Voting Progress</h3>
      <p>{pendingVoters.pendingCount} participants haven't voted yet</p>
      
      {/* Show who has submitted (even partial) */}
      <h4>Submitted:</h4>
      {Object.values(submissions.emotional_evaluation).map(sub => (
        <div key={sub.participant._id}>
          ✅ {sub.participant.fullName} 
          <span>(evaluated {sub.evaluations.length} people)</span>
        </div>
      ))}
      
      {/* Show who hasn't submitted */}
      <h4>Pending:</h4>
      {pendingVoters.pendingParticipants.map(p => (
        <div key={p._id}>
          ⏳ {p.fullName}
        </div>
      ))}
    </div>
  );
}
```

---

## 🧪 Testing Scenarios

### Test 1: Submit Minimum (1 vote)
```bash
curl -X POST http://localhost:3002/meetings/MEETING_ID/emotional-evaluations \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "evaluations": [
      {
        "targetParticipantId": "USER_ID",
        "emotionalScale": 80,
        "isToxic": false
      }
    ]
  }'

# ✅ Should succeed
```

### Test 2: Submit Empty Array
```bash
curl -X POST http://localhost:3002/meetings/MEETING_ID/emotional-evaluations \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "evaluations": [] }'

# ❌ Should fail with "must contain at least 1 elements"
```

### Test 3: View Partial Submissions
```bash
curl http://localhost:3002/meetings/MEETING_ID/all-submissions \
  -H "Authorization: Bearer CREATOR_TOKEN"

# ✅ Should show all partial submissions
```

---

## 📚 Files Changed

1. ✅ `src/meetings/dto/submit-emotional-evaluation.dto.ts`
2. ✅ `src/meetings/dto/submit-understanding-contribution.dto.ts`
3. ✅ `src/meetings/dto/submit-task-evaluation.dto.ts`
4. ✅ `src/meetings/meetings.controller.ts` (API documentation)

---

## ✅ Summary

**Before:**
- No minimum validation (could submit empty arrays)
- Unclear if partial voting was allowed
- Documentation didn't mention partial submissions

**After:**
- ✅ Must submit at least 1 vote (validated)
- ✅ Clearly documented that partial voting is allowed
- ✅ Creator can see all partial submissions immediately
- ✅ No waiting for "complete" submissions
- ✅ Better API documentation

---

## 🎉 Benefits

1. **Flexible Voting** - Users can vote for only relevant people/tasks
2. **Faster Process** - No need to evaluate everyone
3. **Better UX** - Users can focus on meaningful evaluations
4. **Real-time Tracking** - Creator sees partial progress immediately
5. **Toxic Participant Detection** - Users can flag just the toxic ones

---

**Date:** February 4, 2026
**Status:** ✅ Implemented and tested
