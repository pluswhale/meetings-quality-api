# Backend Dockerfile for NestJS
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (using install instead of ci for flexibility)
RUN npm install

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Expose the port
EXPOSE 4000

# Start the application in development mode
CMD ["npm", "run", "start:dev"]
