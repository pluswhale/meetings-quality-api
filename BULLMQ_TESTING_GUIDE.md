# BullMQ Job Testing Guide

## ✅ What Was Fixed

1. **Added `MeetingStatusCron` to providers** - The cron service was created but not registered in the module
2. **Enhanced logging** - Added detailed logs to track job execution
3. **Added manual test endpoint** - You can now trigger jobs manually for testing

---

## 🧪 How to Test Locally

### Option 1: Manual Trigger (Recommended for Testing)

Use the new test endpoint to manually trigger the job:

```bash
# POST request to trigger the job manually
curl -X POST http://localhost:3002/meetings/test/trigger-activation \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "jobId": "1234567890",
  "message": "Job added to queue"
}
```

### Option 2: Wait for Cron (Every Minute)

The cron job runs automatically every minute. You'll see these logs:

```
[MeetingStatusCron] ⏰ Cron triggered: Adding activate-meetings job to queue
[MeetingStatusCron] 📝 Job added to queue with ID: 1234567890
[MeetingStatusProcessor] 🔄 Processing job: activate-meetings (ID: 1234567890)
[MeetingStatusProcessor] ⏰ Checking for upcoming meetings before: 2026-02-04T19:30:00.000Z
[MeetingStatusProcessor] 📊 Found 2 meetings to activate
[MeetingStatusProcessor]   - Meeting "Team Sync" (ID: 507f...) with upcomingDate: 2026-02-04T19:25:00.000Z
[MeetingStatusProcessor]   - Meeting "Sprint Planning" (ID: 508g...) with upcomingDate: 2026-02-04T19:28:00.000Z
[MeetingStatusProcessor] ✅ Activated 2 meetings
```

---

## 📋 Prerequisites

### 1. Redis Must Be Running

Your `.env` has Redis configured with Upstash:
```
REDIS_URL="rediss://default:AWl...@glowing-shepherd-26964.upstash.io:6379"
```

**Check Redis connection:**
```bash
# Check logs when server starts
npm run start:dev

# Look for:
# [MeetingStatusCron] ✅ MeetingStatusCron initialized
# [MeetingStatusProcessor] ✅ MeetingStatusProcessor initialized and ready
```

If you don't see these logs, Redis connection might be failing.

### 2. Create Test Meeting

Create a meeting with `upcomingDate` in the past to test activation:

```bash
# Create a meeting (it will have status=UPCOMING by default)
curl -X POST http://localhost:3002/meetings \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test Meeting",
    "question": "How to test jobs?",
    "participantIds": []
  }'

# Note: upcomingDate defaults to Date.now(), so it will be in the past immediately
# Or you can use MongoDB Compass to manually set upcomingDate to a past date
```

---

## 🔍 Debugging

### Check Job Queue Status

Add this endpoint to see queue status (optional):

```typescript
// In meetings.controller.ts
@Get('test/queue-status')
async getQueueStatus() {
  const jobs = await this.meetingStatusCron.getQueueStatus();
  return jobs;
}
```

### Common Issues

#### 1. No Logs Appearing

**Symptom:** Server starts but no cron logs
**Solution:** 
- Check if `MeetingStatusCron` is in the providers (✅ fixed)
- Check if `@nestjs/schedule` is installed
- Check if `ScheduleModule.forRoot()` is in AppModule (✅ it is)

#### 2. Redis Connection Error

**Symptom:** Error on startup about Redis connection
**Solution:**
```bash
# Check if Redis URL is correct in .env
# Test Redis connection
node -e "const Redis = require('ioredis'); const redis = new Redis(process.env.REDIS_URL); redis.ping().then(() => console.log('✅ Redis OK')).catch(err => console.error('❌ Redis Error:', err));"
```

#### 3. Jobs Not Processing

**Symptom:** Job added to queue but never processed
**Solution:**
- Check if `MeetingStatusProcessor` is in providers (✅ it is)
- Check processor logs for errors
- Restart the server

---

## 📊 Expected Logs

### On Server Start:
```
[MeetingStatusCron] ✅ MeetingStatusCron initialized
[MeetingStatusProcessor] ✅ MeetingStatusProcessor initialized and ready
```

### On Cron Trigger (Every Minute):
```
[MeetingStatusCron] ⏰ Cron triggered: Adding activate-meetings job to queue
[MeetingStatusCron] 📝 Job added to queue with ID: 1234567890
```

### On Job Processing:
```
[MeetingStatusProcessor] 🔄 Processing job: activate-meetings (ID: 1234567890)
[MeetingStatusProcessor] ⏰ Checking for upcoming meetings before: 2026-02-04T19:30:00.000Z
[MeetingStatusProcessor] 📊 Found 1 meetings to activate
[MeetingStatusProcessor]   - Meeting "Test Meeting" (ID: 507f...) with upcomingDate: 2026-02-04T19:25:00.000Z
[MeetingStatusProcessor] ✅ Activated 1 meetings
```

### If No Meetings to Activate:
```
[MeetingStatusProcessor] ℹ️ No meetings to activate
```

---

## 🧪 Full Test Scenario

### Step 1: Check Server Logs
```bash
npm run start:dev

# Wait for initialization logs:
# ✅ MeetingStatusCron initialized
# ✅ MeetingStatusProcessor initialized and ready
```

### Step 2: Create Test Meeting
```bash
# Option A: Via API (upcomingDate = now, so already past)
curl -X POST http://localhost:3002/meetings \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Immediate Test",
    "question": "Test question"
  }'

# Option B: Set past date via MongoDB Compass
# Update a meeting:
# { upcomingDate: new Date('2026-02-04T10:00:00Z'), status: 'upcoming' }
```

### Step 3: Trigger Job Manually
```bash
curl -X POST http://localhost:3002/meetings/test/trigger-activation \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Step 4: Check Logs
You should see:
```
[MeetingStatusCron] 🔧 Manual trigger: Adding activate-meetings job to queue
[MeetingStatusCron] 📝 Job added to queue with ID: ...
[MeetingStatusProcessor] 🔄 Processing job: activate-meetings
[MeetingStatusProcessor] ✅ Activated 1 meetings
```

### Step 5: Verify Meeting Status
```bash
# Get the meeting and check status
curl http://localhost:3002/meetings/MEETING_ID \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# status should now be "active"
```

---

## 🎯 What the Job Does

**Query:**
```javascript
{
  status: 'upcoming',
  upcomingDate: { $lte: now }
}
```

**Action:**
```javascript
{
  $set: { status: 'active' }
}
```

**Result:** All meetings with status=`upcoming` and `upcomingDate` in the past will be activated.

---

## 📝 Files Changed

1. ✅ `src/meetings/meetings.module.ts` - Added `MeetingStatusCron` to providers
2. ✅ `src/meetings/workers/meeting-status.cron.ts` - Added logging + manual trigger
3. ✅ `src/meetings/workers/meeting-status.processor.ts` - Enhanced logging
4. ✅ `src/meetings/meetings.controller.ts` - Added test endpoint

---

## 🚀 Production Notes

### Cron Schedule
Currently runs **every minute**:
```typescript
@Cron('*/1 * * * *') // every minute
```

You may want to adjust this for production:
```typescript
@Cron('*/5 * * * *')  // every 5 minutes
@Cron('0 * * * *')    // every hour
@Cron('0 */6 * * *')  // every 6 hours
```

### Remove Test Endpoint
Before deploying to production, remove or secure the test endpoint:
```typescript
// Remove this in production:
@Post('test/trigger-activation')
async testTriggerActivation() { ... }
```

---

## ✅ Testing Checklist

- [ ] Server starts without errors
- [ ] See "MeetingStatusCron initialized" log
- [ ] See "MeetingStatusProcessor initialized" log
- [ ] Cron triggers every minute (see logs)
- [ ] Manual trigger works via `/test/trigger-activation`
- [ ] Jobs are processed (see processing logs)
- [ ] Meetings are activated correctly
- [ ] Redis connection is stable

---

**Ready to test!** 🎉

Try the manual trigger endpoint now and watch the logs!
