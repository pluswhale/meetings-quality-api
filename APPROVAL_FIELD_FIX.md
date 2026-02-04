# Fix: Task Approval Field Not Showing in Meeting Submissions

## Issue
The `approved` field was not appearing in the meeting's `taskPlannings` data because it only existed in the separate Task model, not in the embedded TaskPlanning subdocument.

## Root Cause
When task planning is submitted:
1. Data is stored in `meeting.taskPlannings` (embedded subdocument)
2. A separate `Task` document is created with the `approved` field

The `TaskPlanning` schema was missing the `approved` field, causing it not to show up in meeting submissions.

## Solution

### 1. Added `approved` Field to TaskPlanning Schema
**File:** `src/meetings/schemas/meeting.schema.ts`

```typescript
@Schema({ _id: false })
export class TaskPlanning {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  participantId: Types.ObjectId;

  @Prop({ required: true })
  taskDescription: string;

  @Prop({ required: true })
  commonQuestion: string;

  @Prop({ required: true })
  deadline: Date;

  @Prop({ required: true, min: 0, max: 100 })
  expectedContributionPercentage: number;

  @Prop({ default: false })
  approved: boolean;  // ← ADDED THIS

  @Prop({ default: Date.now })
  submittedAt: Date;
}
```

### 2. Sync Approval Status to Meeting Document
**File:** `src/tasks/tasks.service.ts`

When a task is approved/unapproved, the status is now synced to the meeting's `taskPlannings` subdocument:

```typescript
async setApproval(taskId: string, approved: boolean, userId: string) {
  // ... validation ...
  
  // Update Task model
  task.approved = approved;
  await task.save();

  // Sync approval status to meeting's taskPlannings subdocument
  const taskAuthorId = task.authorId._id || task.authorId;
  const taskPlanningIndex = (meeting.taskPlannings as any[]).findIndex((tp: any) => {
    const tpAuthorId = tp.participantId?._id || tp.participantId;
    return tpAuthorId.equals(taskAuthorId);
  });

  if (taskPlanningIndex !== -1) {
    (meeting.taskPlannings as any[])[taskPlanningIndex].approved = approved;
    await meeting.save();
  }

  // ... emit socket event ...
}
```

### 3. Fixed Task Evaluation Response
**File:** `src/meetings/meetings.service.ts`

Removed incorrect `approved` field from task evaluations (line 590), as evaluations don't have approval status.

## Result

Now when you fetch meeting submissions, the `approved` field will appear:

```json
{
  "submissions": {
    "task_planning": {
      "userId123": {
        "participant": { ... },
        "submitted": true,
        "taskDescription": "Implement auth",
        "approved": false,  // ← NOW VISIBLE
        "deadline": "2026-02-15",
        "expectedContributionPercentage": 85
      }
    }
  }
}
```

## Testing

### Before Fix:
```javascript
// GET /meetings/:id/all-submissions
{
  task_planning: {
    userId: {
      taskDescription: "...",
      // approved field missing ❌
    }
  }
}
```

### After Fix:
```javascript
// GET /meetings/:id/all-submissions
{
  task_planning: {
    userId: {
      taskDescription: "...",
      approved: false  // ✅ Now present
    }
  }
}
```

## Migration Note

**No database migration required!**

- Existing `taskPlannings` will have `approved: false` (default value)
- When you approve a task, both the Task model and meeting's taskPlannings will be updated

## Files Changed

1. ✅ `src/meetings/schemas/meeting.schema.ts` - Added `approved` field to TaskPlanning
2. ✅ `src/tasks/tasks.service.ts` - Added sync logic to `setApproval()`
3. ✅ `src/meetings/meetings.service.ts` - Removed incorrect `approved` from task evaluations

## Linter Status

✅ All linter checks passed (exit code: 0)

---

**Date:** February 4, 2026
**Status:** FIXED ✅
