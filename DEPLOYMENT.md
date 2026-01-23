# Deployment Guide - Render

## Prerequisites

1. MongoDB Atlas cluster is set up and running
2. Database user credentials are configured
3. GitHub repository is connected to Render

## MongoDB Atlas Setup

✅ **Already configured!**
- Connection URI: `mongodb+srv://mongouser:***@cluster0.3yldtew.mongodb.net/meetings-quality`
- Database name: `meetings-quality`

### Important: Whitelist Render IPs

In MongoDB Atlas, you need to allow connections from Render:
1. Go to MongoDB Atlas Dashboard
2. Navigate to Network Access
3. Click "Add IP Address"
4. Choose "Allow Access from Anywhere" (0.0.0.0/0) for simplicity, or
5. Add specific Render IPs if you prefer more security

## Deploy to Render

### Option 1: Using render.yaml (Recommended)

1. Push your code to GitHub:
   ```bash
   git add .
   git commit -m "Configure for Render deployment"
   git push origin main
   ```

2. Go to [Render Dashboard](https://dashboard.render.com/)

3. Click "New +" → "Blueprint"

4. Connect your GitHub repository

5. Render will automatically detect `render.yaml` and set up the service

6. Add the following environment variables in Render dashboard:
   - `MONGODB_URI`: `mongodb+srv://mongouser:lLe0W95BmfPd8tD7@cluster0.3yldtew.mongodb.net/meetings-quality?retryWrites=true&w=majority&appName=Cluster0`
   - `JWT_SECRET`: Generate a strong secret (e.g., use `openssl rand -base64 32`)
   - `FRONTEND_URL`: Your frontend URL (e.g., `https://your-frontend.onrender.com`)

### Option 2: Manual Setup

1. Go to [Render Dashboard](https://dashboard.render.com/)

2. Click "New +" → "Web Service"

3. Connect your GitHub repository

4. Configure the service:
   - **Name**: `meetings-quality-api`
   - **Environment**: `Node`
   - **Region**: Choose your preferred region
   - **Branch**: `main`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm run start:prod`
   - **Plan**: Free (or paid as needed)

5. Add Environment Variables:
   ```
   NODE_ENV=production
   MONGODB_URI=mongodb+srv://mongouser:lLe0W95BmfPd8tD7@cluster0.3yldtew.mongodb.net/meetings-quality?retryWrites=true&w=majority&appName=Cluster0
   JWT_SECRET=<generate-a-strong-secret>
   JWT_EXPIRATION=7d
   FRONTEND_URL=<your-frontend-url>
   PORT=10000
   ```

6. Click "Create Web Service"

## Post-Deployment

### Test Your API

Once deployed, your API will be available at: `https://meetings-quality-api.onrender.com` (or your custom URL)

Test endpoints:
- Health check: `GET /`
- Swagger docs: `GET /api`
- OpenAPI spec: `GET /api-json`

### Update Frontend CORS

Update your frontend URL in Render environment variables to enable CORS.

### Important Notes

1. **Free Tier Limitations**:
   - Render free tier spins down after 15 minutes of inactivity
   - First request after inactivity may take 30-50 seconds
   - Consider upgrading to paid tier for production use

2. **MongoDB Atlas Free Tier**:
   - 512MB storage limit
   - Shared CPU
   - Good for development and small projects

3. **Environment Variables Security**:
   - Never commit `.env` file to Git
   - Always use environment variables in Render dashboard
   - Rotate JWT_SECRET regularly in production

## Monitoring

- View logs in Render dashboard under "Logs" tab
- Monitor MongoDB usage in Atlas dashboard
- Set up alerts for errors and high usage

## Troubleshooting

### Connection Issues
- Verify MongoDB Atlas IP whitelist includes Render IPs
- Check MONGODB_URI is correctly set in Render environment variables
- Ensure database user has correct permissions

### Build Failures
- Check Node.js version compatibility
- Verify all dependencies are in `package.json`
- Review build logs in Render dashboard

### Runtime Errors
- Check environment variables are set correctly
- Review application logs in Render dashboard
- Verify MongoDB cluster is running

## Useful Commands

Generate a secure JWT secret:
```bash
openssl rand -base64 32
```

Test MongoDB connection locally:
```bash
npm run start:dev
```

Build for production locally:
```bash
npm run build
npm run start:prod
```
