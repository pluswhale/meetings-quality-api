# Deployment Guide - Render

## Prerequisites

1. MongoDB Atlas cluster is set up and running
2. Database user credentials are configured
3. GitHub repository is connected to Render

## MongoDB Atlas Setup

### Get Your Connection String

1. Go to [MongoDB Atlas Dashboard](https://cloud.mongodb.com/)
2. Navigate to your cluster
3. Click **"Connect"** button
4. Choose **"Connect your application"**
5. Select **Driver: Node.js** and **Version: 5.5 or later**
6. Copy the connection string

### Important: Whitelist Render IPs

In MongoDB Atlas, you need to allow connections from Render:
1. Go to MongoDB Atlas Dashboard
2. Navigate to **Network Access**
3. Click **"Add IP Address"**
4. Choose **"Allow Access from Anywhere"** (0.0.0.0/0) - required for Render
5. Click **"Confirm"**

## Deploy to Render

### Manual Setup (Recommended)

1. Push your code to GitHub:
   ```bash
   git add .
   git commit -m "Configure for Render deployment"
   git push origin main
   ```

2. Go to [Render Dashboard](https://dashboard.render.com/)

3. Click **"New +"** → **"Web Service"**

4. Connect your GitHub repository

5. Configure the service:
   - **Name**: `meetings-quality-api`
   - **Environment**: `Node`
   - **Region**: Choose your preferred region
   - **Branch**: `main`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm run start:prod`
   - **Instance Type**: Free

6. Add Environment Variables (click "Advanced" → "Add Environment Variable"):
   ```
   NODE_ENV = production
   MONGODB_URI = <your-mongodb-atlas-connection-string>
   JWT_SECRET = <generate-with: openssl rand -base64 32>
   JWT_EXPIRATION = 7d
   FRONTEND_URL = <your-frontend-url>
   ```

7. Click **"Create Web Service"**

8. Wait for deployment to complete (first deploy takes 5-10 minutes)

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
