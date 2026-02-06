# ChatPulse web service — multi-stage build
# Compiles TypeScript backend and builds Vite React frontend,
# then produces a slim production image serving both.

# ---------------------------------------------------------------
# Stage 1: Build
# ---------------------------------------------------------------
FROM node:20 AS build

WORKDIR /app

# Install dependencies first (layer cache)
COPY package.json package-lock.json* ./
RUN npm ci

# Copy source and config
COPY tsconfig.json tsconfig.server.json vite.config.ts ./
COPY src/ src/

# Compile server TypeScript and build Vite frontend
RUN npm run build

# ---------------------------------------------------------------
# Stage 2: Production
# ---------------------------------------------------------------
FROM node:20-slim AS production

WORKDIR /app

# Install production dependencies only
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled output from build stage
COPY --from=build /app/dist/ dist/

# Create uploads directory (volume-mountable)
RUN mkdir -p /app/uploads && chown node:node /app/uploads

# Runtime environment — all infrastructure values injected at deploy time
ENV NODE_ENV=production
ENV EXTRACTION_SERVICE_URL=http://chatpulse-extraction:8001
ENV UPLOAD_DIR=/app/uploads
# DATABASE_URL injected via k8s Secret

EXPOSE 3000

USER node

CMD ["node", "dist/server/index.js"]
