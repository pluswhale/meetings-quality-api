# Emotional Evaluation Flow - Complete Guide

## 🎯 Problem Description

When a user submits an emotional evaluation, the creator doesn't see it immediately in the creator panel.

---

## ✅ Backend Flow (Already Working)

### 1. User Submits Evaluation
```
POST /meetings/:meetingId/emotional-evaluations
{
  "evaluations": [
    {
      "targetParticipantId": "507f1f77bcf86cd799439011",
      "emotionalScale": 80,
      "isToxic": false
    }
  ]
}
```

### 2. Backend Processing
1. Removes previous evaluation from same user (allows updates)
2. Adds new evaluation to `meeting.emotionalEvaluations`
3. Saves to database
4. Emits WebSocket event: `meetingUpdated` with type `emotional_evaluation_updated`
5. Returns transformed meeting response

### 3. Creator Fetches Submissions
```
GET /meetings/:meetingId/all-submissions
```

Returns all evaluations including empty ones.

---

## 🔍 Common Issues

### Issue 1: Empty Evaluations
**Problem:** User submits empty array `[]`, it saves but shows nothing

**Solution:** This is intentional! Empty = user chose not to vote. Frontend should show this clearly.

### Issue 2: WebSocket Not Connected
**Problem:** WebSocket event emitted but frontend doesn't receive it

**Solution:** Ensure WebSocket connection is established before submitting.

### Issue 3: Cache Not Invalidated
**Problem:** Data cached in frontend, doesn't refresh after submission

**Solution:** Invalidate cache or refetch after WebSocket event.

---

## 🎨 Frontend Implementation Guide

### Step 1: Setup WebSocket Connection

```typescript
import { io, Socket } from 'socket.io-client';
import { useEffect, useState } from 'react';

const BACKEND_URL = 'http://localhost:3002'; // Your backend URL

function useWebSocket(token: string) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!token) return;

    const socketInstance = io(BACKEND_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    socketInstance.on('connect', () => {
      console.log('✅ WebSocket connected');
      setConnected(true);
    });

    socketInstance.on('disconnect', () => {
      console.log('❌ WebSocket disconnected');
      setConnected(false);
    });

    socketInstance.on('auth_error', (error) => {
      console.error('❌ Auth error:', error);
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, [token]);

  return { socket, connected };
}
```

### Step 2: Join Meeting Room

```typescript
function MeetingRoom({ meetingId, token }) {
  const { socket, connected } = useWebSocket(token);

  useEffect(() => {
    if (!socket || !connected) return;

    // Join meeting room
    socket.emit('join_meeting', { meetingId }, (response) => {
      console.log('Joined meeting:', response);
    });

    return () => {
      // Leave meeting when component unmounts
      socket.emit('leave_meeting', { meetingId });
    };
  }, [socket, connected, meetingId]);

  return <div>Meeting Room</div>;
}
```

### Step 3: Listen to Evaluation Updates

```typescript
import { useQueryClient } from '@tanstack/react-query';

function CreatorPanel({ meetingId }) {
  const { socket, connected } = useWebSocket(token);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!socket) return;

    // Listen for meeting updates
    const handleMeetingUpdate = (data: {
      meetingId: string;
      type: string;
      userId: string;
      timestamp: Date;
    }) => {
      console.log('📢 Meeting updated:', data);

      if (data.type === 'emotional_evaluation_updated') {
        console.log(`User ${data.userId} submitted emotional evaluation`);
        
        // Invalidate and refetch all-submissions
        queryClient.invalidateQueries(['all-submissions', meetingId]);
        
        // Optional: Show toast notification
        toast.success('New evaluation submitted!');
      }
    };

    socket.on('meetingUpdated', handleMeetingUpdate);

    return () => {
      socket.off('meetingUpdated', handleMeetingUpdate);
    };
  }, [socket, meetingId, queryClient]);

  return <AllSubmissionsView meetingId={meetingId} />;
}
```

### Step 4: Fetch All Submissions

```typescript
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

interface EmotionalEvaluation {
  targetParticipant: {
    _id: string;
    fullName: string;
  };
  emotionalScale: number;
  isToxic: boolean;
}

interface Submission {
  participant: {
    _id: string;
    fullName: string;
    email: string;
  };
  submitted: boolean;
  submittedAt: string;
  evaluations: EmotionalEvaluation[];
}

function useAllSubmissions(meetingId: string, token: string) {
  return useQuery(
    ['all-submissions', meetingId],
    async () => {
      const response = await axios.get(
        `${BACKEND_URL}/meetings/${meetingId}/all-submissions`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      return response.data;
    },
    {
      // Refetch every 10 seconds (backup to WebSocket)
      refetchInterval: 10000,
      // Keep data fresh
      staleTime: 5000,
    }
  );
}
```

### Step 5: Display Submissions (Creator View)

```typescript
function EmotionalEvaluationsView({ meetingId, token }) {
  const { data, isLoading, error } = useAllSubmissions(meetingId, token);

  if (isLoading) return <div>Loading submissions...</div>;
  if (error) return <div>Error loading submissions</div>;

  const submissions = data.submissions.emotional_evaluation || {};
  const submissionList = Object.values(submissions);

  return (
    <div className="submissions-view">
      <h2>Emotional Evaluations</h2>
      <p>Total submissions: {submissionList.length}</p>

      {submissionList.map((submission: Submission) => (
        <div key={submission.participant._id} className="submission-card">
          <h3>{submission.participant.fullName}</h3>
          <p>Submitted at: {new Date(submission.submittedAt).toLocaleString()}</p>

          {submission.evaluations.length === 0 ? (
            <div className="empty-evaluation">
              ⚠️ User chose not to vote (empty submission)
            </div>
          ) : (
            <div className="evaluations-list">
              <h4>Evaluated {submission.evaluations.length} participants:</h4>
              {submission.evaluations.map((eval, index) => (
                <div key={index} className="evaluation-item">
                  <span className="target-name">
                    {eval.targetParticipant.fullName}
                  </span>
                  <span className="scale">
                    Score: {eval.emotionalScale}
                  </span>
                  {eval.isToxic && (
                    <span className="toxic-badge">⚠️ Toxic</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {submissionList.length === 0 && (
        <div className="no-submissions">
          No submissions yet. Waiting for participants to vote...
        </div>
      )}
    </div>
  );
}
```

### Step 6: User Submission Form

```typescript
function EmotionalEvaluationForm({ meetingId, participants, token }) {
  const [evaluations, setEvaluations] = useState<
    Array<{
      targetParticipantId: string;
      emotionalScale: number;
      isToxic: boolean;
    }>
  >([]);
  const [submitting, setSubmitting] = useState(false);
  const queryClient = useQueryClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      await axios.post(
        `${BACKEND_URL}/meetings/${meetingId}/emotional-evaluations`,
        { evaluations },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      toast.success('Evaluation submitted successfully!');
      
      // Optionally clear form or redirect
      setEvaluations([]);
    } catch (error) {
      console.error('Submission error:', error);
      toast.error('Failed to submit evaluation');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleParticipant = (participantId: string) => {
    const exists = evaluations.find(e => e.targetParticipantId === participantId);
    
    if (exists) {
      // Remove
      setEvaluations(evaluations.filter(e => e.targetParticipantId !== participantId));
    } else {
      // Add with default values
      setEvaluations([
        ...evaluations,
        {
          targetParticipantId: participantId,
          emotionalScale: 0,
          isToxic: false,
        },
      ]);
    }
  };

  const updateEvaluation = (participantId: string, updates: Partial<typeof evaluations[0]>) => {
    setEvaluations(
      evaluations.map(e =>
        e.targetParticipantId === participantId ? { ...e, ...updates } : e
      )
    );
  };

  return (
    <form onSubmit={handleSubmit}>
      <h2>Emotional Evaluation</h2>
      <p>Select participants to evaluate (optional - can submit empty)</p>

      <div className="participants-list">
        {participants.map((participant) => {
          const evaluation = evaluations.find(
            e => e.targetParticipantId === participant._id
          );
          const isSelected = !!evaluation;

          return (
            <div key={participant._id} className="participant-item">
              <label>
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleParticipant(participant._id)}
                />
                {participant.fullName}
              </label>

              {isSelected && (
                <div className="evaluation-controls">
                  <label>
                    Emotional Scale (-100 to 100):
                    <input
                      type="range"
                      min="-100"
                      max="100"
                      value={evaluation.emotionalScale}
                      onChange={(e) =>
                        updateEvaluation(participant._id, {
                          emotionalScale: parseInt(e.target.value),
                        })
                      }
                    />
                    <span>{evaluation.emotionalScale}</span>
                  </label>

                  <label>
                    <input
                      type="checkbox"
                      checked={evaluation.isToxic}
                      onChange={(e) =>
                        updateEvaluation(participant._id, {
                          isToxic: e.target.checked,
                        })
                      }
                    />
                    Mark as toxic
                  </label>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <button type="submit" disabled={submitting}>
        {submitting ? 'Submitting...' : 'Submit Evaluation'}
      </button>

      {evaluations.length === 0 && (
        <p className="info">
          ℹ️ You can submit without selecting anyone (empty vote is allowed)
        </p>
      )}
    </form>
  );
}
```

### Step 7: Real-time Update Indicator

```typescript
function SubmissionStatusIndicator({ meetingId }) {
  const { socket } = useWebSocket(token);
  const [recentUpdate, setRecentUpdate] = useState<string | null>(null);

  useEffect(() => {
    if (!socket) return;

    const handleUpdate = (data: { type: string; userId: string }) => {
      if (data.type === 'emotional_evaluation_updated') {
        setRecentUpdate(`User just submitted evaluation`);
        
        // Clear indicator after 5 seconds
        setTimeout(() => setRecentUpdate(null), 5000);
      }
    };

    socket.on('meetingUpdated', handleUpdate);

    return () => {
      socket.off('meetingUpdated', handleUpdate);
    };
  }, [socket]);

  if (!recentUpdate) return null;

  return (
    <div className="update-indicator">
      ✅ {recentUpdate}
    </div>
  );
}
```

---

## 🧪 Testing Checklist

### Backend Tests:
- [ ] Submit evaluation with data
- [ ] Submit empty evaluation `{ evaluations: [] }`
- [ ] Update evaluation (submit twice)
- [ ] WebSocket event emitted
- [ ] Creator can fetch all submissions

### Frontend Tests:
- [ ] WebSocket connects successfully
- [ ] Join meeting room works
- [ ] Submit evaluation form works
- [ ] Creator panel shows submissions immediately
- [ ] Empty submissions show "No votes" message
- [ ] Real-time updates work (WebSocket)
- [ ] Manual refresh works (refetch button)
- [ ] Handle disconnections gracefully

---

## 🔧 Debugging Tips

### 1. Check WebSocket Connection
```typescript
// Add this to your component
useEffect(() => {
  if (socket) {
    console.log('Socket connected:', socket.connected);
    console.log('Socket ID:', socket.id);
  }
}, [socket]);
```

### 2. Log All WebSocket Events
```typescript
socket.onAny((eventName, ...args) => {
  console.log(`📢 WebSocket Event: ${eventName}`, args);
});
```

### 3. Check API Response
```typescript
// In your submission handler
try {
  const response = await axios.post(/*...*/);
  console.log('✅ Submission response:', response.data);
} catch (error) {
  console.error('❌ Submission error:', error.response?.data);
}
```

### 4. Monitor Query Cache
```typescript
// In React Query DevTools
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

<QueryClientProvider client={queryClient}>
  <App />
  <ReactQueryDevtools initialIsOpen={false} />
</QueryClientProvider>
```

---

## 📝 Complete Example

```typescript
// Full working example
import { io } from 'socket.io-client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';

function MeetingEmotionalEvaluation({ meetingId, isCreator, token }) {
  const socket = io('http://localhost:3002', { auth: { token } });
  const queryClient = useQueryClient();

  // Join meeting
  useEffect(() => {
    socket.emit('join_meeting', { meetingId });
    return () => socket.emit('leave_meeting', { meetingId });
  }, [meetingId]);

  // Listen to updates
  useEffect(() => {
    socket.on('meetingUpdated', (data) => {
      if (data.type === 'emotional_evaluation_updated') {
        queryClient.invalidateQueries(['all-submissions', meetingId]);
      }
    });

    return () => socket.off('meetingUpdated');
  }, [meetingId]);

  // Fetch submissions (for creator)
  const { data } = useQuery(
    ['all-submissions', meetingId],
    () => fetch(`/api/meetings/${meetingId}/all-submissions`, {
      headers: { Authorization: `Bearer ${token}` }
    }).then(r => r.json()),
    { enabled: isCreator }
  );

  return isCreator ? (
    <CreatorView submissions={data} />
  ) : (
    <UserSubmissionForm meetingId={meetingId} token={token} />
  );
}
```

---

## ✅ Summary

**Backend is working correctly!** The issue is likely in the frontend:

1. ✅ WebSocket connection not established
2. ✅ WebSocket events not being listened to
3. ✅ Cache not being invalidated after submission
4. ✅ Empty evaluations not being handled in UI

Follow the frontend guide above to fix these issues!

---

**Date:** February 4, 2026
**Status:** Backend ✅ | Frontend Guide ✅
