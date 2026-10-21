# Use official Node.js image for building
FROM node:22-slim AS builder

WORKDIR /app

# Install native compilation dependencies for node-gyp (e.g. better-sqlite3 in devDependencies)
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*

# Copy dependency definitions
COPY package*.json tsconfig.json ./

# Install all dependencies including devDependencies
RUN npm ci

# Copy source files
COPY src ./src

# Build TypeScript code
RUN npm run build

# Production image
FROM node:22-slim AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy package files and install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev

# Copy built dist files from builder stage
COPY --from=builder /app/dist ./dist

# Run index.js on container startup
CMD ["node", "dist/src/index.js"]
