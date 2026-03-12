# Meetings Quality API — Business Architecture

> **Document type:** Business Architecture Overview  
> **Audience:** Business Analysts, Product Owners, Stakeholders, Frontend Teams  
> **Last updated:** March 2026  
> **System:** Meetings Quality API v1.0

---

## Table of Contents

1. [System Purpose](#1-system-purpose)
2. [Core Concepts (Glossary)](#2-core-concepts-glossary)
3. [Data Models](#3-data-models)
4. [Entity Relationships](#4-entity-relationships)
5. [Meeting Lifecycle](#5-meeting-lifecycle)
6. [Business Rules & Access Control](#6-business-rules--access-control)
7. [API Capabilities by Domain](#7-api-capabilities-by-domain)
8. [Real-Time Events (WebSocket)](#8-real-time-events-websocket)
9. [Analytics & Reporting](#9-analytics--reporting)
10. [Key Business Constraints](#10-key-business-constraints)

---

## 1. System Purpose

The **Meetings Quality API** is a backend platform designed to measure and improve the quality of team meetings. It provides a structured, multi-phase framework for participants to:

- Evaluate each other's **emotional state** during the meeting
- Assess each other's **understanding** of the discussion topic and **contribution** to it
- Submit and peer-evaluate individual **task plans** that emerge from the meeting
- Give the meeting creator real-time visibility into participation and voting progress

The platform is built around the concept of a **Meeting** that progresses through a defined sequence of phases. Each phase collects a specific type of feedback from participants. The creator controls the phase transitions and has access to aggregated analytics once all phases are complete.

---

## 2. Core Concepts (Glossary)

| Term | Business Meaning |
|---|---|
| **Meeting** | A structured session with a defined topic (question) that participants join and move through evaluation phases |
| **Creator** | The user who creates the meeting. Has exclusive control over phase transitions and access to all analytics |
| **Participant** | A user invited to a meeting. Submits evaluations in each phase |
| **Phase** | A stage of the meeting during which participants submit a specific type of feedback |
| **Submission** | A participant's response in a given phase (emotional evaluation, contribution scores, task plan, or task evaluation) |
| **Task** | An action item created by a participant during the task planning phase, representing their planned work following the meeting |
| **Emotional Scale** | A numeric score from **−100** (very negative) to **+100** (very positive) representing the perceived emotional state of another participant |
| **Understanding Score** | A self-assessment score from **0** to **100** representing how well the participant understood the discussion topic |
| **Contribution Percentage** | A score from **0** to **100** representing how much a participant contributed to the discussion |
| **Contribution Importance** | A self-assessed score from **0** to **100** representing how important the participant considers their own task |
| **Toxicity Flag** | A boolean indicator set when a participant is perceived as toxic by another |
| **Approval** | The creator's confirmation that a participant's task is accepted as planned |
| **Active Participant** | A participant currently connected to the meeting room via WebSocket |

---

## 3. Data Models

### 3.1 User

The foundational identity entity. Every actor in the system is a User.

| Field | Type | Required | Description |
|---|---|---|---|
| `_id` | ID | Auto | Unique identifier |
| `fullName` | Text | Yes | Full display name |
| `email` | Email | Yes | Unique login email |
| `password` | Text | Yes | Hashed password (never returned in responses) |

---

### 3.2 Meeting

The central entity. Tracks the lifecycle of a meeting session and stores all phase submission data except task planning content (which lives in the Task entity).

| Field | Type | Required | Description |
|---|---|---|---|
| `_id` | ID | Auto | Unique identifier |
| `title` | Text | Yes | Human-readable name of the meeting |
| `question` | Text | Yes | The central discussion question for the meeting |
| `creatorId` | → User | Yes | The user who owns and controls this meeting |
| `participantIds` | → User[ ] | Yes | All users invited to participate |
| `activeParticipants` | Object[ ] | Auto | Users currently connected via WebSocket (real-time) |
| `currentPhase` | Enum | Auto | The current active phase (see §5) |
| `status` | Enum | Auto | `upcoming` / `active` / `finished` |
| `upcomingDate` | DateTime | Yes | Scheduled start date/time |
| `emotionalEvaluations` | Object[ ] | Auto | Submissions from Phase 1 |
| `understandingContributions` | Object[ ] | Auto | Submissions from Phase 2 |
| `taskEvaluations` | Object[ ] | Auto | Submissions from Phase 3 |
| `createdAt` | DateTime | Auto | Record creation timestamp |
| `updatedAt` | DateTime | Auto | Last modification timestamp |

**Meeting Status Values:**

| Status | Meaning |
|---|---|
| `upcoming` | Meeting is scheduled but not yet started (scheduled date in the future) |
| `active` | Meeting is in progress; participants can submit evaluations |
| `finished` | All phases completed; full analytics are available |

**Active Participant entry (per connected user):**

| Field | Description |
|---|---|
| `participantId` | → User |
| `joinedAt` | When they connected to the room |
| `lastSeen` | Most recent heartbeat/activity |

---

### 3.3 Task

The single source of truth for all task planning data. A Task is created when a participant submits their task plan during the Task Planning phase. Each participant can have at most **one Task per Meeting**.

| Field | Type | Required | Description |
|---|---|---|---|
| `_id` | ID | Auto | Unique identifier |
| `meetingId` | → Meeting | Yes | The meeting this task belongs to |
| `authorId` | → User | Yes | The participant who owns this task |
| `description` | Text | Yes | What the participant plans to do |
| `commonQuestion` | Text | Yes | How the participant understands the meeting's central question |
| `deadline` | DateTime | Yes | When this task must be completed by |
| `estimateHours` | Number | Yes | Estimated hours to complete (default: 0) |
| `contributionImportance` | Number (0–100) | Yes | How important the participant rates their own contribution |
| `approved` | Boolean | Auto | Whether the meeting creator has approved this task (default: false) |
| `isCompleted` | Boolean | Auto | Whether the task has been marked done (default: false) |
| `createdAt` | DateTime | Auto | Record creation timestamp |
| `updatedAt` | DateTime | Auto | Last modification timestamp |

> **Design principle:** Task data lives **only** in the Task collection. The Meeting entity does not store any task content. This prevents data duplication and ensures that updates to a task (e.g. revising `estimateHours`) are always reflected consistently across all views.

---

### 3.4 Emotional Evaluation (embedded in Meeting)

Captured during **Phase 1**. Each participating user submits evaluations of the other participants' emotional states.

**Submission (one per participant per meeting):**

| Field | Description |
|---|---|
| `participantId` | The user who submitted this evaluation |
| `submittedAt` | Submission timestamp |
| `evaluations[ ]` | Array of individual target evaluations (see below) |

**Per-target entry:**

| Field | Type | Range | Description |
|---|---|---|---|
| `targetParticipantId` | → User | — | The participant being evaluated |
| `emotionalScale` | Number | −100 to +100 | Perceived emotional tone |
| `isToxic` | Boolean | — | Whether this participant was perceived as toxic |

---

### 3.5 Understanding & Contribution (embedded in Meeting)

Captured during **Phase 2**. Each participant self-reports their understanding score and distributes contribution percentages among other participants.

**Submission (one per participant per meeting):**

| Field | Description |
|---|---|
| `participantId` | The user who submitted |
| `understandingScore` | Self-assessment of topic comprehension (0–100) |
| `submittedAt` | Submission timestamp |
| `contributions[ ]` | Distribution of influence scores across other participants |

**Per-target contribution entry:**

| Field | Type | Range | Description |
|---|---|---|---|
| `participantId` | → User | — | The participant being credited |
| `contributionPercentage` | Number | 0–100 | How much this person contributed |

---

### 3.6 Task Evaluation (embedded in Meeting)

Captured during **Phase 3**. Participants rate the importance of each other's tasks.

**Submission (one per participant per meeting):**

| Field | Description |
|---|---|
| `participantId` | The user who submitted |
| `submittedAt` | Submission timestamp |
| `evaluations[ ]` | Importance scores for other participants' tasks |

**Per-task evaluation entry:**

| Field | Type | Range | Description |
|---|---|---|---|
| `taskAuthorId` | → User | — | Whose task is being evaluated |
| `importanceScore` | Number | 0–100 | How important the evaluator considers that task |

---

## 4. Entity Relationships

```
┌──────────────────────────────────────────────────────────────────────┐
│                              USER                                     │
│  _id · fullName · email                                              │
└────────┬────────────────────────────┬────────────────────────────────┘
         │ creates (1)                │ participates in (many)
         │                            │
         ▼                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                            MEETING                                   │
│  _id · title · question · status · currentPhase · upcomingDate      │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  emotionalEvaluations[ ]         (Phase 1 submissions)      │    │
│  │  understandingContributions[ ]   (Phase 2 submissions)      │    │
│  │  taskEvaluations[ ]              (Phase 3 submissions)      │    │
│  │  activeParticipants[ ]           (real-time presence)       │    │
│  └─────────────────────────────────────────────────────────────┘    │
└────────────────────────────────────┬────────────────────────────────┘
                                     │ has many (by meetingId)
                                     │
                                     ▼
┌──────────────────────────────────────────────────────────────────────┐
│                              TASK                                     │
│  _id · description · commonQuestion · deadline · estimateHours       │
│  contributionImportance · approved · isCompleted                     │
│  meetingId → MEETING                                                 │
│  authorId  → USER                                                    │
└──────────────────────────────────────────────────────────────────────┘

Unique constraint: one Task per (meetingId + authorId) pair
```

**Relationship summary:**

| Relationship | Cardinality | Notes |
|---|---|---|
| User → Meeting (as creator) | 1 : Many | One user can create many meetings |
| User → Meeting (as participant) | Many : Many | Users can participate in multiple meetings |
| Meeting → Task | 1 : Many | Each meeting can have many tasks |
| User → Task (as author) | 1 : Many | One user can have tasks across multiple meetings |
| Task (per meeting, per user) | Unique | Max 1 task per participant per meeting |

---

## 5. Meeting Lifecycle

### 5.1 Status Transitions

```
        Schedule future date           Start (or past date)
CREATED ──────────────────► UPCOMING ──────────────────► ACTIVE
                                                              │
                                              Creator moves to
                                              FINISHED phase
                                                              │
                                                              ▼
                                                          FINISHED
                                                    (analytics available)
```

A meeting is automatically set to `active` when:
- The creator creates it with a date in the past or present, **or**
- The scheduled `upcomingDate` is reached (via a background job)

---

### 5.2 Phase Progression

Phases are advanced **manually by the creator**. There is no forced sequence — the creator moves to the next phase when they judge the current one complete.

```
  START
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│  PHASE 1 — Emotional Evaluation                             │
│                                                             │
│  Each participant rates other participants on:              │
│  · Emotional scale (−100 to +100)                          │
│  · Toxicity flag (yes/no)                                   │
│                                                             │
│  Submission is optional — empty arrays are accepted.        │
│  Resubmission replaces the previous entry.                  │
└──────────────────────────────┬──────────────────────────────┘
                               │  Creator advances phase
                               ▼
┌─────────────────────────────────────────────────────────────┐
│  PHASE 2 — Understanding & Contribution                     │
│                                                             │
│  Each participant submits:                                  │
│  · Self-assessed understanding score (0–100)                │
│  · Contribution percentages for other participants          │
│                                                             │
│  Percentages do not need to sum to 100%.                    │
│  Submission is optional. Resubmission replaces previous.    │
└──────────────────────────────┬──────────────────────────────┘
                               │  Creator advances phase
                               ▼
┌─────────────────────────────────────────────────────────────┐
│  PHASE 3 — Task Planning                                    │
│                                                             │
│  Each participant submits their task plan:                  │
│  · What they will do (description)                          │
│  · How they understand the meeting question                 │
│  · Deadline for the task                                    │
│  · Expected contribution percentage (self-assessment)       │
│                                                             │
│  A Task record is created/updated in the Task collection.   │
│  Resubmission updates the existing task (no duplicates).    │
└──────────────────────────────┬──────────────────────────────┘
                               │  Creator advances phase
                               ▼
┌─────────────────────────────────────────────────────────────┐
│  PHASE 4 — Task Evaluation                                  │
│                                                             │
│  Each participant rates the importance of others' tasks:    │
│  · Importance score per task author (0–100)                 │
│                                                             │
│  Only tasks that exist in the Task collection can be        │
│  evaluated. Submission is optional.                         │
└──────────────────────────────┬──────────────────────────────┘
                               │  Creator marks FINISHED
                               ▼
                          FINISHED
                   Full analytics unlocked
```

---

## 6. Business Rules & Access Control

### 6.1 Authentication

All endpoints (except `/auth/register` and `/auth/login`) require a valid **JWT Bearer token** in the Authorization header.

### 6.2 Role-Based Permissions

The system has two implicit roles within a meeting:

| Action | Creator | Participant |
|---|---|---|
| Create meeting | Yes | — |
| Update meeting metadata | Yes | No |
| Delete meeting | Yes | No |
| Advance phase | Yes | No |
| View all submissions (`/all-submissions`) | Yes | No |
| View phase submission detail | Yes | No |
| View voting progress | Yes | No |
| View pending voters | Yes | No |
| View task evaluation analytics | Yes | No |
| View final statistics | Yes | No |
| Submit emotional evaluation | Yes | Yes |
| Submit understanding/contribution | Yes | Yes |
| Submit task plan | Yes | Yes |
| Submit task evaluation | Yes | Yes |
| Join / leave meeting room | Yes | Yes |
| Update own task | No (via task endpoint, own tasks only) | Yes (own tasks only) |
| Delete own task | No | Yes (own tasks only) |
| Approve / reject tasks | Yes | No |

### 6.3 Task Ownership Rules

- A participant can **update** their own task only if it has **not been approved** yet.
- A task that has been **approved by the creator cannot be edited** by the participant.
- Only the **meeting creator** can approve or unapprove tasks.

### 6.4 Submission Rules

- **All submissions are optional.** A participant can submit an empty array `[]` and it counts as having submitted for that phase.
- **Resubmission is allowed.** Sending a new submission replaces the previous one (last-write-wins).
- **One task per participant per meeting** is enforced at the database level. Resubmitting a task plan updates the existing task rather than creating a new one.

---

## 7. API Capabilities by Domain

### 7.1 Authentication (`/auth`)

| Endpoint | Method | Description | Auth required |
|---|---|---|---|
| `/auth/register` | POST | Register new user account | No |
| `/auth/login` | POST | Log in, receive JWT token | No |
| `/auth/me` | GET | Get own profile | Yes |

**Register / Login Response:**
```
{
  access_token: "JWT...",
  user: { _id, fullName, email }
}
```

---

### 7.2 Users (`/users`)

| Endpoint | Method | Description | Auth required |
|---|---|---|---|
| `/users` | GET | List all users (for participant selection) | Yes |

---

### 7.3 Meetings (`/meetings`)

#### Core CRUD

| Endpoint | Method | Who | Description |
|---|---|---|---|
| `/meetings` | POST | Any | Create a new meeting |
| `/meetings` | GET | Any | List meetings (filter: `current` / `past` / `upcoming`) |
| `/meetings/:id` | GET | Any | Get meeting details |
| `/meetings/:id` | PATCH | Creator | Update title, question, or participant list |
| `/meetings/:id` | DELETE | Creator | Delete meeting permanently |
| `/meetings/:id/phase` | PATCH | Creator | Advance to a specific phase |

#### Phase Submissions (all participants including creator)

| Endpoint | Method | Phase | Description |
|---|---|---|---|
| `/meetings/:id/emotional-evaluations` | POST | Phase 1 | Submit emotional ratings for other participants |
| `/meetings/:id/understanding-contributions` | POST | Phase 2 | Submit self-understanding score and contribution percentages |
| `/meetings/:id/task-plannings` | POST | Phase 3 | Submit task plan (creates/updates a Task record) |
| `/meetings/:id/task-evaluations` | POST | Phase 4 | Submit importance scores for other participants' tasks |

#### Monitoring (creator only)

| Endpoint | Method | Description |
|---|---|---|
| `/meetings/:id/voting-info` | GET | Active participants + who has submitted in current phase |
| `/meetings/:id/pending-voters` | GET | Active participants who have NOT yet submitted |
| `/meetings/:id/all-submissions` | GET | All submissions across all phases (keyed by participantId) |
| `/meetings/:id/phase-submissions` | GET | Detailed view of all submissions with participant names |
| `/meetings/:id/active-participants` | GET | Real-time list of connected participants (WebSocket-based) |

#### Analytics (creator only)

| Endpoint | Method | Description |
|---|---|---|
| `/meetings/:id/statistics` | GET | Summary stats per participant (finished meetings only) |
| `/meetings/:id/final-stats` | GET | Full participant breakdown — given/received for all phases |
| `/meetings/:id/task-evaluation-analytics` | GET | Aggregate importance scores per task with min/max/avg/median |

---

### 7.4 Tasks (`/tasks`)

| Endpoint | Method | Who | Description |
|---|---|---|---|
| `/tasks` | POST | Any participant | Create a task directly (outside meeting flow) |
| `/tasks` | GET | Author | List own tasks (filter: `current` / `past`) |
| `/tasks/meeting/:meetingId` | GET | Any | All tasks for a specific meeting |
| `/tasks/:id` | GET | Author | Get own task detail |
| `/tasks/:id` | PATCH | Author | Update own task (blocked if approved) |
| `/tasks/:id` | DELETE | Author | Delete own task |
| `/tasks/:id/approve` | PATCH | Meeting creator | Approve or unapprove a task |

---

## 8. Real-Time Events (WebSocket)

The platform uses **Socket.IO** for real-time presence and event broadcasting. All participants should connect via WebSocket for the best experience.

> **Note:** The REST endpoints `/meetings/:id/join` and `/meetings/:id/leave` are **deprecated** in favour of WebSocket events.

### 8.1 Client → Server Events

| Event | Payload | Description |
|---|---|---|
| `join_meeting` | `{ meetingId }` | Join the meeting room; marks user as active |
| `leave_meeting` | `{ meetingId }` | Leave the meeting room; marks user as inactive |

### 8.2 Server → Client Events

| Event | Triggered by | Description |
|---|---|---|
| `phase_changed` | Creator advances phase | New `phase` and `status` values |
| `meeting_updated` | Any submission | Notifies all room members of a change |
| `participant_joined` | User joins room | New participant appeared |
| `participant_left` | User leaves room | Participant disconnected |
| `participants_updated` | Join or leave | Full updated list of active participants |

### 8.3 Presence Tracking

Active participants are tracked by WebSocket connection state:
- A user becomes **active** when they emit `join_meeting`
- A user becomes **inactive** when they emit `leave_meeting` or disconnect
- The voting progress and pending-voters endpoints use this real-time list to calculate how many people still need to submit

---

## 9. Analytics & Reporting

### 9.1 Meeting Statistics (`/statistics`)

*Available for finished meetings only.*

Returns a per-participant summary:

| Metric | Description |
|---|---|
| `understandingScore` | Self-reported understanding from Phase 2 |
| `averageEmotionalScale` | Average score received from others in Phase 1 |
| `toxicityFlags` | How many participants flagged this person as toxic |
| `averageContribution` | Average contribution percentage received from others in Phase 2 |
| `avgUnderstanding` | Meeting-wide average understanding score |

---

### 9.2 Final Statistics (`/final-stats`)

*Creator only.*

A comprehensive per-participant report covering all phases:

```
For each participant:
  ├── Emotional Evaluations
  │     ├── Given: who they evaluated and what scores
  │     └── Received: who evaluated them and what scores
  │
  ├── Understanding & Contribution
  │     ├── Given: their self-score + contribution % they assigned to others
  │     └── Received: contribution % assigned to them by others
  │
  └── Task Planning
        ├── Task created: their task details (description, deadline, hours, approval status)
        ├── Evaluations given: importance scores they gave to others' tasks
        └── Evaluations received: importance scores others gave to their task
```

---

### 9.3 Task Evaluation Analytics (`/task-evaluation-analytics`)

*Creator only.*

Per-task aggregated importance scores from Phase 4:

| Metric | Description |
|---|---|
| `count` | How many participants evaluated this task |
| `average` | Mean importance score (rounded to 2 decimals) |
| `min` / `max` | Lowest and highest score received |
| `median` | Median importance score |
| `scores` | Raw array of all scores received |
| `evaluationDifference` | Gap between peer average and author's self-assessment |

Results are **sorted descending by average score**, showing the most peer-valued tasks first.

---

### 9.4 All Submissions (`/all-submissions`)

*Creator only.*

A unified snapshot across all four phases, keyed by participant ID:

```
{
  meetingId: "...",
  submissions: {
    emotional_evaluation:      { [participantId]: EmotionalSubmission },
    understanding_contribution: { [participantId]: UnderstandingSubmission },
    task_planning:             { [authorId]: TaskSubmission },
    task_evaluation:           { [participantId]: TaskEvaluationSubmission }
  }
}
```

**Important:** Only participants who have submitted appear in each map. The absence of a key means the participant has not submitted for that phase yet.

---

## 10. Key Business Constraints

| # | Constraint | Impact |
|---|---|---|
| 1 | **One task per participant per meeting.** Enforced at database level. | Prevents duplicate tasks; resubmission safely updates existing record |
| 2 | **Approved tasks cannot be edited.** | Ensures agreed task descriptions are locked after creator review |
| 3 | **Voting is fully optional in all phases.** Empty arrays are valid submissions. | Reduces friction; participants can acknowledge a phase without providing data |
| 4 | **Phase transitions are manual.** The creator decides when each phase ends. | Gives flexibility; creator can wait for more submissions before advancing |
| 5 | **Statistics are only available for finished meetings.** | Prevents premature conclusions while voting is still in progress |
| 6 | **Contribution percentages do not need to sum to 100%.** | Allows partial assessments without validation burden |
| 7 | **Task evaluation can only reference tasks that exist in the Task collection.** | Prevents phantom evaluations for participants who didn't submit a task plan |
| 8 | **The creator is automatically added as a participant.** | Ensures the creator can submit their own evaluations like everyone else |
| 9 | **Meetings with a past `upcomingDate` are automatically activated.** | Background job ensures scheduled meetings start on time without manual intervention |
| 10 | **A task's `estimateHours` can be updated after submission** (via `PATCH /tasks/:id`). | Allows refinement of time estimates without requiring a full resubmission through the meeting flow |

---

## Appendix A — Meeting Phase Reference

| Phase Key | Human Name | What participants submit |
|---|---|---|
| `emotional_evaluation` | Emotional Evaluation | Scores and toxicity flags for each other participant |
| `understanding_contribution` | Understanding & Contribution | Self-understanding score + contribution distribution |
| `task_planning` | Task Planning | Personal task description, deadline, and expected contribution % |
| `finished` | Finished | No submissions; analytics become available |

---

## Appendix B — Numeric Scale Reference

| Scale | Range | Used for |
|---|---|---|
| Emotional Scale | −100 to +100 | How positively/negatively a participant behaved |
| Understanding Score | 0 to 100 | Self-assessed topic comprehension |
| Contribution Percentage | 0 to 100 | Share of discussion contribution |
| Contribution Importance | 0 to 100 | Self-assessed task priority |
| Importance Score | 0 to 100 | Peer-assessed task priority |

---

## Appendix C — Meeting Status & Phase State Machine (Summary)

```
MEETING STATUS
  upcoming  →  active  →  finished

MEETING PHASE (independent of status — controlled by creator)
  emotional_evaluation
         ↓
  understanding_contribution
         ↓
  task_planning
         ↓
  finished  ──────────────→  sets Meeting.status = finished
```

The `currentPhase` and `status` are independent fields. A meeting can be `active` while still in `emotional_evaluation`, or a creator can jump phases in any order if the business process requires it.
