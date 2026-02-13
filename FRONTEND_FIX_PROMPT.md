# Frontend Fix - Emotional Evaluation Creator Panel

## 🎯 Problem
When a user submits an emotional evaluation, the creator doesn't see it immediately in the creator panel.

---

## ✅ Backend is Working Correctly

The backend:
1. ✅ Saves evaluations to database
2. ✅ Emits WebSocket event `meetingUpdated` with type `emotional_evaluation_updated`
3. ✅ Returns data via `GET /meetings/:id/all-submissions`

**Issue is in Frontend!**

---

## 🔧 Required Frontend Changes

### 1. Setup WebSocket Connection

```typescript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3002', {
  auth: { token: YOUR_JWT_TOKEN },
  transports: ['websocket', 'polling'],
});
```

### 2. Join Meeting Room

```typescript
socket.emit('join_meeting', { meetingId: 'YOUR_MEETING_ID' });
```

### 3. Listen to Evaluation Updates

```typescript
socket.on('meetingUpdated', (data) => {
  if (data.type === 'emotional_evaluation_updated') {
    // REFRESH THE CREATOR PANEL HERE!
    // Option A: Refetch data
    fetchAllSubmissions(meetingId);
    
    // Option B: Invalidate React Query cache
    queryClient.invalidateQueries(['all-submissions', meetingId]);
  }
});
```

### 4. Fetch All Submissions (Creator View)

```typescript
async function fetchAllSubmissions(meetingId) {
  const response = await fetch(
    `http://localhost:3002/meetings/${meetingId}/all-submissions`,
    {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    }
  );
  
  const data = await response.json();
  return data.submissions.emotional_evaluation;
}
```

### 5. Display in Creator Panel

```typescript
// Example structure
{
  "userId1": {
    "participant": {
      "_id": "userId1",
      "fullName": "John Doe",
      "email": "john@example.com"
    },
    "submitted": true,
    "submittedAt": "2026-02-04T16:30:00.000Z",
    "evaluations": [
      {
        "targetParticipant": {
          "_id": "userId2",
          "fullName": "Jane Smith"
        },
        "emotionalScale": 80,
        "isToxic": false
      }
    ]
  }
}
```

---

## 📋 Checklist for Frontend Developer

### Setup Phase:
- [ ] Install socket.io-client: `npm install socket.io-client`
- [ ] Create WebSocket connection with JWT token
- [ ] Join meeting room when component mounts
- [ ] Leave meeting room when component unmounts

### Event Handling:
- [ ] Listen to `meetingUpdated` event
- [ ] Filter events by `type === 'emotional_evaluation_updated'`
- [ ] Refresh creator panel data when event received
- [ ] Add toast/notification: "New evaluation submitted!"

### Data Fetching:
- [ ] Fetch `/meetings/:id/all-submissions` on mount
- [ ] Refetch when WebSocket event received
- [ ] Handle empty evaluations (show "No votes" message)
- [ ] Show loading state while fetching
- [ ] Handle errors gracefully

### Display:
- [ ] Show list of all participants who submitted
- [ ] Show submission time
- [ ] Show who they evaluated
- [ ] Show emotional scale (-100 to 100)
- [ ] Show toxic flag if true
- [ ] Handle empty submissions (evaluations: [])

---

## 🎨 UI Example

```tsx
function CreatorPanel({ meetingId, token }) {
  const [submissions, setSubmissions] = useState({});
  const [loading, setLoading] = useState(true);

  // WebSocket setup
  useEffect(() => {
    const socket = io('http://localhost:3002', {
      auth: { token }
    });

    socket.emit('join_meeting', { meetingId });

    socket.on('meetingUpdated', (data) => {
      if (data.type === 'emotional_evaluation_updated') {
        console.log('✅ New evaluation received!');
        fetchData(); // Refresh data
      }
    });

    return () => {
      socket.emit('leave_meeting', { meetingId });
      socket.disconnect();
    };
  }, [meetingId, token]);

  // Fetch data
  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `http://localhost:3002/meetings/${meetingId}/all-submissions`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await response.json();
      setSubmissions(data.submissions.emotional_evaluation || {});
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchData();
  }, [meetingId]);

  if (loading) return <div>Loading...</div>;

  const submissionList = Object.values(submissions);

  return (
    <div>
      <h2>Emotional Evaluations ({submissionList.length} submissions)</h2>
      
      {submissionList.map((submission) => (
        <div key={submission.participant._id} className="submission-card">
          <h3>{submission.participant.fullName}</h3>
          <p>Submitted: {new Date(submission.submittedAt).toLocaleString()}</p>
          
          {submission.evaluations.length === 0 ? (
            <p>❌ No votes (empty submission)</p>
          ) : (
            <ul>
              {submission.evaluations.map((eval, i) => (
                <li key={i}>
                  {eval.targetParticipant.fullName}: 
                  <strong> {eval.emotionalScale}</strong>
                  {eval.isToxic && <span> ⚠️ TOXIC</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
      
      {submissionList.length === 0 && (
        <p>No submissions yet. Waiting for participants...</p>
      )}
    </div>
  );
}
```

---

## 🧪 Testing Steps

### Test 1: Manual Refresh
1. User submits evaluation
2. Creator clicks refresh button
3. ✅ Should see new evaluation

### Test 2: Real-time Update
1. User submits evaluation
2. Wait 1-2 seconds
3. ✅ Creator panel should auto-refresh (WebSocket)

### Test 3: Empty Submission
1. User submits empty array `{ evaluations: [] }`
2. ✅ Creator should see "No votes" message

### Test 4: Multiple Users
1. User A submits evaluation
2. User B submits evaluation
3. ✅ Creator sees both submissions

---

## 🐛 Common Issues & Solutions

### Issue 1: "Not seeing updates in real-time"
**Solution:** Check WebSocket connection:
```typescript
socket.on('connect', () => console.log('✅ Connected:', socket.id));
socket.on('disconnect', () => console.log('❌ Disconnected'));
```

### Issue 2: "403 Forbidden on /all-submissions"
**Solution:** Only creator can access this endpoint. Check if:
- User is the meeting creator
- JWT token is valid

### Issue 3: "Empty data returned"
**Solution:** Check if evaluations are actually submitted:
```typescript
console.log('Submissions:', data.submissions.emotional_evaluation);
```

### Issue 4: "Updates work but data is old"
**Solution:** Clear cache before refetching:
```typescript
// If using React Query
queryClient.invalidateQueries(['all-submissions']);

// If using state
setSubmissions({}); // Clear first
fetchData(); // Then fetch
```

---

## 🎁 Bonus: Add Loading Indicator

```typescript
function CreatorPanel() {
  const [isUpdating, setIsUpdating] = useState(false);

  socket.on('meetingUpdated', async (data) => {
    if (data.type === 'emotional_evaluation_updated') {
      setIsUpdating(true);
      await fetchData();
      setIsUpdating(false);
      
      // Show toast
      toast.success('New evaluation received!');
    }
  });

  return (
    <div>
      {isUpdating && <div className="updating-badge">🔄 Updating...</div>}
      {/* ... rest of UI */}
    </div>
  );
}
```

---

## 📦 Required Packages

```bash
npm install socket.io-client
npm install @tanstack/react-query  # Optional but recommended
npm install react-hot-toast         # Optional for notifications
```

---

## ✅ Summary

**Backend:** ✅ Working perfectly
- Saves data ✅
- Emits WebSocket events ✅
- Returns data via API ✅

**Frontend Fixes Needed:**
1. ❌ Setup WebSocket connection
2. ❌ Listen to `meetingUpdated` events
3. ❌ Refresh data when event received
4. ❌ Handle empty submissions in UI

**Expected Timeline:** 2-4 hours

---

## 📞 Need Help?

Check the full implementation guide: `EMOTIONAL_EVALUATION_FLOW.md`

---

**Date:** February 4, 2026
