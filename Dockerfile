# Stage 1: Build stage with compiler toolchain for native node-gyp addons (better-sqlite3)
FROM node:22-slim AS builder

WORKDIR /app

# Install native compilation dependencies for node-gyp
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy dependency specifications
COPY package*.json tsconfig.json ./

# Install all dependencies (including devDependencies for TypeScript compilation)
RUN npm ci

# Copy source code and static web assets
COPY src ./src
COPY public ./public

# Build TypeScript to dist/
RUN npm run build

# Prune devDependencies to leave only production packages with their pre-compiled native binaries
RUN npm prune --omit=dev && npm cache clean --force

# Stage 2: Ultra-slim production runtime image
FROM node:22-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3005

# Copy pre-compiled production node_modules directly from builder (avoids node-gyp rebuild in runner)
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY package*.json ./

EXPOSE 3005

# Run Express server by default
CMD ["node", "dist/src/server.js"]
