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

# Install dependencies again in case package.json changed (for dev with volumes)
# Generate OpenAPI spec before starting (continue even if it fails)
CMD ["sh", "-c", "npm run start:prod"]
