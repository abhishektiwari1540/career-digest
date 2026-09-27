# Use official Node.js image for building
FROM node:20-slim AS builder

WORKDIR /app

# Copy dependency definitions
COPY package*.json tsconfig.json ./

# Install all dependencies including devDependencies
RUN npm ci

# Copy source files
COPY src ./src

# Build TypeScript code
RUN npm run build

# Production image
FROM node:20-slim AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy package files and install production dependencies only
COPY package*.json ./
RUN npm ci --only=production

# Copy built dist files from builder stage
COPY --from=builder /app/dist ./dist

# Run index.js on container startup
CMD ["node", "dist/index.js"]
