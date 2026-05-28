# Multi-stage build: compile TypeScript in stage 1, ship only runtime in stage 2.
# Final image is a minimal Node 20 Alpine that runs the MCP server over stdio.

FROM node:20-alpine AS builder

WORKDIR /app

# Copy manifests first to maximize layer caching when source changes
COPY package.json package-lock.json tsconfig.json ./

# Install ALL dependencies (devDependencies needed for `tsc`)
RUN npm ci

# Copy source and build
COPY src ./src
RUN npm run build

# ---- Runtime stage ----
FROM node:20-alpine

WORKDIR /app

# Re-install only production deps for a small final image
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled output from builder
COPY --from=builder /app/dist ./dist

# MemoryBridge respects MEMORYBRIDGE_PATH for global data location.
# Default to a writable path inside the container; mount a volume here
# from the host to persist memory across container runs.
ENV MEMORYBRIDGE_PATH=/data/memorybridge
VOLUME ["/data"]

# Optional: cd into a project directory at runtime via `-v $(pwd):/workspace -w /workspace`
WORKDIR /workspace

# MCP servers communicate via stdio. No ports to expose.
ENTRYPOINT ["node", "/app/dist/server.js"]
