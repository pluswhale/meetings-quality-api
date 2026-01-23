# Render Memory Fix - Quick Reference

## Problem
JavaScript heap out of memory error on Render's free tier (512 MB RAM):
```
FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
```

## Solution Applied ✅

### 1. Updated `package.json` start script
Changed from:
```json
"start": "nest start"
```
To:
```json
"start": "node --max-old-space-size=460 dist/src/main.js"
```

This limits Node.js memory usage to 460MB, leaving headroom for the system.

## Next Steps - Configure Render

### **CRITICAL**: Set Environment Variable on Render

1. Go to your Render dashboard: https://dashboard.render.com/
2. Select your `meetings-quality-api` service
3. Go to **Environment** section
4. Add or verify this variable:
   ```
   NODE_ENV = production
   ```
5. Click **"Save Changes"**

This disables Swagger docs in production, which saves significant memory.

### Verify Your Environment Variables

Make sure these are set in Render:
- ✅ `NODE_ENV` = `production` ← **CRITICAL for memory**
- ✅ `MONGODB_URI` = Your MongoDB Atlas connection string
- ✅ `JWT_SECRET` = Your secure JWT secret
- ✅ `JWT_EXPIRATION` = `7d`
- ✅ `FRONTEND_URL` = Your frontend URL
- ✅ `PORT` = Auto-assigned by Render (don't set manually)

## Deploy Changes

1. Commit and push the changes:
   ```bash
   git add .
   git commit -m "Fix: Add memory optimization for Render free tier"
   git push origin main
   ```

2. Render will automatically deploy the changes

3. Monitor the logs to ensure successful startup

## Memory Optimizations Included

- **Build command**: Uses `--max-old-space-size=460` during build
- **Start command**: Uses `--max-old-space-size=460` during runtime  
- **Production mode**: Disables Swagger docs (saves ~50-100MB)
- **Efficient startup**: Direct node execution instead of nest CLI

## If Issues Persist

1. Check logs in Render dashboard
2. Verify `NODE_ENV=production` is actually set
3. Consider upgrading to a paid instance ($7/month for 512MB guaranteed)

## Alternative: Use start:prod

If you prefer, you can also change Render's start command to:
```
npm run start:prod
```

Both `start` and `start:prod` now have the same memory optimizations.
