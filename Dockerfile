# Backend Dockerfile for NestJS
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (using install instead of ci for flexibility)
RUN npm install

# Copy source code
COPY . .

# Expose the port
EXPOSE 4000

# Start in development mode (works with volume mounts)
# Install deps and generate OpenAPI, then start server
CMD ["sh", "-c", "npm install && npm run build && npm run openapi:generate && npm run start:dev"]
