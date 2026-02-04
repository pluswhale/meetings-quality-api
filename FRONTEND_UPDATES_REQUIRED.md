# Frontend Updates Required - Task Approval & Pending Voters Feature

## Overview
This document outlines the frontend changes needed to support the new features:
1. **Pending Voters List** - View who hasn't voted yet in real-time
2. **Task Approval System** - Meeting creator can approve/unapprove tasks
3. **Task Edit Restrictions** - Prevent editing approved tasks
4. **Private Task Visibility** - Each user sees only their own tasks until approved

---

## 1. New Endpoint: Pending Voters List

### API Endpoint
```
GET /meetings/:id/pending-voters
```

**Authentication Required:** Yes (JWT Bearer token)

**Access:** Only meeting creator can access this endpoint

### Response Format
```json
{
  "meetingId": "507f1f77bcf86cd799439011",
  "phase": "emotional_evaluation",
  "pendingCount": 2,
  "pendingParticipants": [
    {
      "_id": "507f1f77bcf86cd799439012",
      "fullName": "John Doe",
      "email": "john@example.com",
      "joinedAt": "2026-02-04T15:30:00.000Z",
      "lastSeen": "2026-02-04T15:35:00.000Z"
    },
    {
      "_id": "507f1f77bcf86cd799439013",
      "fullName": "Jane Smith",
      "email": "jane@example.com",
      "joinedAt": "2026-02-04T15:32:00.000Z",
      "lastSeen": "2026-02-04T15:36:00.000Z"
    }
  ]
}
```

### Frontend Implementation

#### 1.1 Create a Pending Voters Component
```typescript
// Example React/Vue component structure
interface PendingVoter {
  _id: string;
  fullName: string;
  email: string;
  joinedAt: string;
  lastSeen: string;
}

interface PendingVotersData {
  meetingId: string;
  phase: string;
  pendingCount: number;
  pendingParticipants: PendingVoter[];
}

// Fetch pending voters
async function fetchPendingVoters(meetingId: string): Promise<PendingVotersData> {
  const response = await fetch(`/api/meetings/${meetingId}/pending-voters`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  return response.json();
}
```

#### 1.2 Display Pending Voters (Meeting Creator View)
Create a component that:
- Shows a badge with pending count (e.g., "2 pending")
- Displays a list of participants who haven't voted yet
- Updates in real-time using WebSocket events
- Only visible to meeting creator

#### 1.3 Real-time Updates via WebSocket
Listen to these Socket.IO events:
```typescript
// When someone submits their vote
socket.on('meetingUpdated', (data) => {
  if (data.type === 'emotional_evaluation_updated' || 
      data.type === 'understanding_contribution_updated' ||
      data.type === 'task_planning_updated' ||
      data.type === 'task_evaluation_updated') {
    // Refresh pending voters list
    fetchPendingVoters(data.meetingId);
  }
});

// When participants join/leave
socket.on('participants_updated', (data) => {
  // Refresh pending voters list
  fetchPendingVoters(data.meetingId);
});
```

---

## 2. Task Approval System

### API Endpoints

#### 2.1 Approve/Unapprove Task
```
PATCH /tasks/:id/approve
```

**Authentication Required:** Yes (JWT Bearer token)

**Access:** Only meeting creator can approve tasks

**Request Body:**
```json
{
  "approved": true
}
```

**Response:**
```json
{
  "taskId": "507f1f77bcf86cd799439011",
  "approved": true,
  "task": {
    "_id": "507f1f77bcf86cd799439011",
    "description": "Implement user authentication",
    "approved": true,
    "author": {
      "_id": "507f1f77bcf86cd799439012",
      "fullName": "John Doe",
      "email": "john@example.com"
    }
  }
}
```

#### 2.2 Get Tasks by Meeting
```
GET /tasks/meeting/:meetingId
```

**Response includes `approved` field:**
```json
[
  {
    "_id": "507f1f77bcf86cd799439011",
    "description": "Implement user authentication",
    "commonQuestion": "What needs to be done?",
    "approved": false,
    "deadline": "2026-02-15T00:00:00.000Z",
    "contributionImportance": 85,
    "isCompleted": false,
    "authorId": {
      "_id": "507f1f77bcf86cd799439012",
      "fullName": "John Doe",
      "email": "john@example.com"
    }
  }
]
```

### Frontend Implementation

#### 2.1 Task Approval Checkbox (Creator Only)
Add a checkbox for each task in the meeting creator's view:

```typescript
// Example component
function TaskApprovalCheckbox({ task, onApprove }) {
  const [approved, setApproved] = useState(task.approved);
  const [loading, setLoading] = useState(false);

  const handleToggle = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/tasks/${task._id}/approve`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ approved: !approved })
      });
      
      const data = await response.json();
      setApproved(data.approved);
      onApprove?.(data);
    } catch (error) {
      console.error('Failed to approve task:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <label>
      <input 
        type="checkbox" 
        checked={approved} 
        onChange={handleToggle}
        disabled={loading}
      />
      Approve
    </label>
  );
}
```

#### 2.2 Real-time Task Approval Updates
Listen to WebSocket events:
```typescript
socket.on('meetingUpdated', (data) => {
  if (data.type === 'task_approved') {
    // Refresh tasks list
    fetchMeetingTasks(data.meetingId);
  }
});
```

---

## 3. Task Edit Restrictions

### Business Rules
- **Before approval:** Task author can edit description, deadline, and contribution importance
- **After approval:** Task cannot be edited (API returns 403 Forbidden)
- **Meeting creator:** Can only approve/unapprove, cannot edit other users' tasks

### Frontend Implementation

#### 3.1 Disable Edit Controls for Approved Tasks
```typescript
function TaskEditForm({ task, currentUserId, isCreator }) {
  const canEdit = task.authorId._id === currentUserId && !task.approved;
  const canApprove = isCreator;

  return (
    <form>
      <input 
        type="text" 
        value={task.description}
        disabled={!canEdit}
      />
      <input 
        type="datetime-local" 
        value={task.deadline}
        disabled={!canEdit}
      />
      <input 
        type="number" 
        value={task.contributionImportance}
        disabled={!canEdit}
      />
      
      {!canEdit && task.approved && (
        <div className="info-message">
          ⚠️ This task is approved and cannot be edited
        </div>
      )}
      
      {canApprove && (
        <TaskApprovalCheckbox task={task} />
      )}
    </form>
  );
}
```

#### 3.2 Handle Edit Errors
When attempting to edit an approved task, the API returns:
```json
{
  "statusCode": 403,
  "message": "Cannot edit approved tasks",
  "error": "Forbidden"
}
```

Show appropriate error message to the user.

---

## 4. Task Visibility Rules

### Business Logic
- **Before approval:** Only the task author can see their own task
- **After approval:** Everyone in the meeting can see the task
- **Meeting creator:** Can see ALL tasks regardless of approval status

### Frontend Implementation

#### 4.1 Filter Tasks by Visibility
```typescript
function filterVisibleTasks(tasks: Task[], currentUserId: string, isCreator: boolean): Task[] {
  if (isCreator) {
    // Creator sees all tasks
    return tasks;
  }
  
  // Regular participants see:
  // 1. Their own tasks (all)
  // 2. Other people's approved tasks
  return tasks.filter(task => 
    task.authorId._id === currentUserId || task.approved
  );
}
```

#### 4.2 Display Task Lists
```typescript
function MeetingTasksList({ meetingId, currentUserId, isCreator }) {
  const [tasks, setTasks] = useState([]);
  
  useEffect(() => {
    fetchMeetingTasks(meetingId).then(allTasks => {
      const visibleTasks = filterVisibleTasks(allTasks, currentUserId, isCreator);
      setTasks(visibleTasks);
    });
  }, [meetingId, currentUserId, isCreator]);

  return (
    <div>
      <h2>Tasks</h2>
      {isCreator && (
        <div className="creator-view">
          <h3>All Tasks (Creator View)</h3>
          {tasks.filter(t => !t.approved).length > 0 && (
            <div>
              <h4>Pending Approval</h4>
              {tasks.filter(t => !t.approved).map(task => (
                <TaskCard key={task._id} task={task} canApprove={true} />
              ))}
            </div>
          )}
          {tasks.filter(t => t.approved).length > 0 && (
            <div>
              <h4>Approved</h4>
              {tasks.filter(t => t.approved).map(task => (
                <TaskCard key={task._id} task={task} canApprove={true} />
              ))}
            </div>
          )}
        </div>
      )}
      
      {!isCreator && (
        <div className="participant-view">
          <h3>My Tasks</h3>
          {tasks
            .filter(t => t.authorId._id === currentUserId)
            .map(task => (
              <TaskCard 
                key={task._id} 
                task={task} 
                canEdit={!task.approved}
              />
            ))}
          
          <h3>Approved Tasks</h3>
          {tasks
            .filter(t => t.approved && t.authorId._id !== currentUserId)
            .map(task => (
              <TaskCard key={task._id} task={task} readOnly={true} />
            ))}
        </div>
      )}
    </div>
  );
}
```

---

## 5. UI/UX Recommendations

### 5.1 Pending Voters Indicator
For meeting creator:
```
┌─────────────────────────────────────┐
│ Meeting Phase: Task Planning         │
│                                       │
│ Voting Progress: 3/5 submitted       │
│ [!] 2 participants pending           │
│                                       │
│ Pending:                              │
│ • John Doe (last seen 2 min ago)     │
│ • Jane Smith (last seen 5 min ago)   │
└─────────────────────────────────────┘
```

### 5.2 Task Approval Interface
For meeting creator:
```
┌─────────────────────────────────────┐
│ Task by John Doe                     │
│                                       │
│ Description: Implement auth system    │
│ Deadline: Feb 15, 2026               │
│ Contribution: 85%                     │
│                                       │
│ ☑️ Approve Task (Creator Only)       │
└─────────────────────────────────────┘
```

### 5.3 Task Edit Restrictions
For task author when approved:
```
┌─────────────────────────────────────┐
│ My Task (APPROVED)                   │
│                                       │
│ ⚠️ This task is approved             │
│    and cannot be edited               │
│                                       │
│ Description: Implement auth system    │
│ Deadline: Feb 15, 2026               │
│ Contribution: 85%                     │
│                                       │
│ [View Only Mode]                      │
└─────────────────────────────────────┘
```

---

## 6. WebSocket Events Summary

### Events to Listen To:
```typescript
// Real-time meeting updates
socket.on('meetingUpdated', (data) => {
  // data.type can be:
  // - 'emotional_evaluation_updated'
  // - 'understanding_contribution_updated'
  // - 'task_planning_updated'
  // - 'task_evaluation_updated'
  // - 'task_updated'
  // - 'task_approved'
  
  // Refresh relevant data based on type
});

// Participant join/leave
socket.on('participants_updated', (data) => {
  // data contains updated participants list
  // Refresh pending voters if creator
});

// Phase changes
socket.on('phaseChanged', (data) => {
  // Meeting phase changed
  // Refresh pending voters list for new phase
});
```

---

## 7. API Error Handling

### Common Errors to Handle:

#### 7.1 403 Forbidden - Cannot Edit Approved Task
```json
{
  "statusCode": 403,
  "message": "Cannot edit approved tasks",
  "error": "Forbidden"
}
```

**UI Action:** Show error message, disable edit form

#### 7.2 403 Forbidden - Only Creator Can Approve
```json
{
  "statusCode": 403,
  "message": "Only creator can approve tasks",
  "error": "Forbidden"
}
```

**UI Action:** Hide approval checkbox for non-creators

#### 7.3 403 Forbidden - Only Creator Can View Pending Voters
```json
{
  "statusCode": 403,
  "message": "Only creator can view pending voters",
  "error": "Forbidden"
}
```

**UI Action:** Don't show pending voters component for non-creators

---

## 8. Testing Checklist

### 8.1 Pending Voters Feature
- [ ] Creator can see pending voters list
- [ ] Non-creators cannot access pending voters endpoint
- [ ] Pending count updates when someone submits
- [ ] Pending count updates when someone joins/leaves via WebSocket
- [ ] Pending voters list updates in real-time

### 8.2 Task Approval
- [ ] Creator can approve/unapprove tasks
- [ ] Non-creators cannot see approval checkbox
- [ ] Approval status updates in real-time via WebSocket
- [ ] Approved badge/indicator is visible

### 8.3 Task Edit Restrictions
- [ ] Author can edit their own unapproved task
- [ ] Author cannot edit their own approved task
- [ ] Edit form shows disabled state for approved tasks
- [ ] API returns 403 when trying to edit approved task
- [ ] Error message is displayed appropriately

### 8.4 Task Visibility
- [ ] Author sees their own tasks (approved or not)
- [ ] Participants see only approved tasks from others
- [ ] Creator sees all tasks regardless of approval
- [ ] Task list updates when approval status changes

---

## 9. Database Schema Reference

### Task Model
```typescript
{
  _id: ObjectId,
  description: string,
  commonQuestion: string,
  approved: boolean,              // NEW FIELD
  authorId: ObjectId (ref: User),
  meetingId: ObjectId (ref: Meeting),
  deadline: Date,
  contributionImportance: number, // 0-100
  isCompleted: boolean,
  createdAt: Date,
  updatedAt: Date
}
```

---

## 10. Questions & Support

If you have any questions about these requirements, please contact the backend team.

### Related Documentation:
- OpenAPI Spec: `/generated/openapi.json`
- WebSocket Events: See `WEBSOCKET_PRESENCE_SYSTEM.md` (if exists)
- API Base URL: Check your `.env` configuration

---

**Last Updated:** February 4, 2026
**Version:** 1.0.0
