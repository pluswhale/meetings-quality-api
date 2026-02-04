# Frontend Implementation Checklist

## 📋 Overview
Quick checklist for implementing the new task approval and pending voters features.

---

## ✅ Phase 1: Pending Voters (Meeting Creator View)

### [ ] 1.1 Create API Service Method
```typescript
async getPendingVoters(meetingId: string): Promise<PendingVotersResponse> {
  const response = await api.get(`/meetings/${meetingId}/pending-voters`);
  return response.data;
}
```

### [ ] 1.2 Create Pending Voters Component
- [ ] Shows "X pending" badge
- [ ] Lists participants who haven't voted
- [ ] Shows last seen time
- [ ] Only visible to meeting creator

### [ ] 1.3 Add Real-time Updates
```typescript
socket.on('meetingUpdated', (data) => {
  if (['emotional_evaluation_updated', 'understanding_contribution_updated',
       'task_planning_updated', 'task_evaluation_updated'].includes(data.type)) {
    refreshPendingVoters();
  }
});

socket.on('participants_updated', () => {
  refreshPendingVoters();
});
```

---

## ✅ Phase 2: Task Approval System

### [ ] 2.1 Add Approval Checkbox Component
```typescript
// Only for meeting creator
<TaskApprovalCheckbox 
  taskId={task._id}
  approved={task.approved}
  onChange={(approved) => handleApprove(taskId, approved)}
/>
```

### [ ] 2.2 Create Approve Task API Method
```typescript
async approveTask(taskId: string, approved: boolean): Promise<void> {
  await api.patch(`/tasks/${taskId}/approve`, { approved });
}
```

### [ ] 2.3 Update Task Model
```typescript
interface Task {
  _id: string;
  description: string;
  commonQuestion: string;
  approved: boolean;  // ← ADD THIS
  deadline: Date;
  contributionImportance: number;
  isCompleted: boolean;
  authorId: User;
  meetingId: string;
}
```

### [ ] 2.4 Listen to Approval Events
```typescript
socket.on('meetingUpdated', (data) => {
  if (data.type === 'task_approved') {
    refreshTasksList();
  }
});
```

---

## ✅ Phase 3: Task Edit Restrictions

### [ ] 3.1 Disable Edit Form for Approved Tasks
```typescript
const canEdit = task.authorId === currentUserId && !task.approved;

return (
  <TaskForm>
    <input disabled={!canEdit} value={task.description} />
    <input disabled={!canEdit} value={task.deadline} />
    {!canEdit && task.approved && (
      <Alert>⚠️ This task is approved and cannot be edited</Alert>
    )}
  </TaskForm>
);
```

### [ ] 3.2 Handle 403 Error When Editing Approved Task
```typescript
try {
  await api.patch(`/tasks/${taskId}`, updateData);
} catch (error) {
  if (error.status === 403 && error.message === 'Cannot edit approved tasks') {
    showError('This task is approved and cannot be edited');
  }
}
```

---

## ✅ Phase 4: Task Visibility Rules

### [ ] 4.1 Filter Tasks by Visibility
```typescript
function filterVisibleTasks(
  tasks: Task[], 
  currentUserId: string, 
  isCreator: boolean
): Task[] {
  if (isCreator) return tasks; // Creator sees all
  
  return tasks.filter(task => 
    task.authorId._id === currentUserId || // Own tasks
    task.approved                           // Approved tasks
  );
}
```

### [ ] 4.2 Separate Task Lists
- [ ] **For Creator:**
  - Section: "Pending Approval" (unapproved tasks)
  - Section: "Approved Tasks"
  - Show approval checkbox for each
  
- [ ] **For Participants:**
  - Section: "My Tasks" (own tasks, any status)
  - Section: "Approved Tasks" (others' approved tasks only)

---

## ✅ Phase 5: UI/UX Components

### [ ] 5.1 Pending Voters Badge
```
┌─────────────────────────────────┐
│ 📊 Voting Progress              │
│ ✅ 3/5 submitted                │
│ ⏳ 2 pending                    │
└─────────────────────────────────┘
```

### [ ] 5.2 Approval Status Badge
```typescript
{task.approved && <Badge color="green">✓ Approved</Badge>}
{!task.approved && <Badge color="gray">Pending</Badge>}
```

### [ ] 5.3 Task Card States
```
UNAPPROVED (Author):  [Edit] [Delete]
APPROVED (Author):    [View Only] ✓ Approved
APPROVED (Others):    [View Only]
UNAPPROVED (Creator): [Approve ☐]
APPROVED (Creator):   [Approve ☑]
```

---

## ✅ Phase 6: WebSocket Integration

### [ ] 6.1 Listen to All Relevant Events
```typescript
socket.on('meetingUpdated', handleMeetingUpdate);
socket.on('participants_updated', handleParticipantsUpdate);
socket.on('phaseChanged', handlePhaseChange);
```

### [ ] 6.2 Handle Event Types
```typescript
function handleMeetingUpdate(data) {
  switch (data.type) {
    case 'task_approved':
    case 'task_updated':
      refreshTasksList();
      break;
    case 'task_planning_updated':
    case 'task_evaluation_updated':
      refreshPendingVoters();
      break;
  }
}
```

---

## ✅ Phase 7: Access Control

### [ ] 7.1 Show/Hide UI Elements
```typescript
const isCreator = meeting.creatorId === currentUserId;

return (
  <>
    {isCreator && <PendingVotersPanel />}
    {isCreator && <TaskApprovalCheckbox />}
    {canEdit && <EditTaskButton />}
  </>
);
```

### [ ] 7.2 Handle 403 Errors Gracefully
- [ ] Don't show features that require creator access
- [ ] Show appropriate error messages
- [ ] Disable actions that will fail

---

## 🧪 Testing Checklist

### [ ] Unit Tests
- [ ] `filterVisibleTasks()` function
- [ ] Task approval toggle logic
- [ ] Edit restrictions logic

### [ ] Integration Tests
- [ ] Pending voters component updates on WebSocket events
- [ ] Task list refreshes on approval
- [ ] Edit form disables when task is approved

### [ ] E2E Tests
- [ ] **Scenario 1:** Creator approves task → All participants see it
- [ ] **Scenario 2:** Author edits task → Gets approved → Cannot edit anymore
- [ ] **Scenario 3:** Participant submits vote → Pending count decreases
- [ ] **Scenario 4:** Non-creator cannot see pending voters

---

## 📱 Responsive Design Checklist

### [ ] Mobile View
- [ ] Pending voters list is scrollable
- [ ] Approval checkbox is touch-friendly
- [ ] Task cards stack vertically

### [ ] Desktop View
- [ ] Pending voters panel in sidebar
- [ ] Task list with proper spacing
- [ ] Approval actions visible without scrolling

---

## 🎨 Design System Integration

### [ ] Components to Create/Update
- [ ] `<PendingVotersPanel />`
- [ ] `<TaskApprovalCheckbox />`
- [ ] `<TaskCard />` - Add approved state
- [ ] `<TaskEditForm />` - Add disabled state
- [ ] `<VotingProgressBar />`

### [ ] States to Style
- [ ] Task approved (green badge)
- [ ] Task pending (gray badge)
- [ ] Edit disabled (grayed out form)
- [ ] Pending voters (orange badge)

---

## 🔗 API Endpoints Reference

| Method | Endpoint | Access | Purpose |
|--------|----------|--------|---------|
| `GET` | `/meetings/:id/pending-voters` | Creator | Get who hasn't voted |
| `PATCH` | `/tasks/:id/approve` | Creator | Approve/unapprove task |
| `PATCH` | `/tasks/:id` | Author | Edit task (fails if approved) |
| `GET` | `/tasks/meeting/:meetingId` | All | Get tasks (filtered) |

---

## 📚 Documentation Links

- **Full Guide:** `FRONTEND_UPDATES_REQUIRED.md`
- **API Changes:** `CHANGES_SUMMARY.md`
- **Quick Start:** `QUICK_START.md`
- **OpenAPI Spec:** `generated/openapi.json`

---

## ✨ Quick Wins

Start with these for immediate results:

1. ✅ Add `approved` field to Task model
2. ✅ Filter visible tasks on existing list
3. ✅ Add approval checkbox (creator view)
4. ✅ Disable edit form when approved
5. ✅ Add pending voters count badge

---

## 🚀 Estimated Timeline

- **Phase 1-2:** 2-3 hours (API integration + basic UI)
- **Phase 3-4:** 2-3 hours (Edit restrictions + visibility)
- **Phase 5-6:** 2-3 hours (UI polish + WebSocket)
- **Phase 7:** 1-2 hours (Access control + testing)

**Total:** ~8-12 hours for full implementation

---

## 💡 Pro Tips

1. **Start simple:** Implement without real-time first, add WebSocket later
2. **Test access control:** Use different user accounts
3. **Handle loading states:** Show skeletons while fetching
4. **Cache responses:** Use React Query or similar
5. **Optimistic updates:** Update UI before server responds

---

## ❓ Questions?

Contact backend team or check:
- Swagger UI: `http://localhost:3000/api`
- API logs for debugging
- WebSocket connection status

---

**Ready to build!** 🎉

Remember: Most backend work is done. Focus on UI/UX and real-time updates!
