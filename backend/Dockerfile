# =============================================================================
# Backend Dockerfile — Multi-stage Production Build
# Compatible with: Render, Railway, Fly.io, Heroku, Coolify, Any VPS
# =============================================================================

# ── Stage 1: Dependencies ─────────────────────────────────────────────────────
FROM node:20-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund && \
    cp -R node_modules /prod_modules && \
    npm ci --no-audit --no-fund

# ── Stage 2: Build ────────────────────────────────────────────────────────────
FROM deps AS builder
WORKDIR /app
COPY . .
RUN npm run build

# ── Stage 3: Production ───────────────────────────────────────────────────────
FROM node:20-slim AS runner
WORKDIR /app

RUN groupadd --gid 1001 appuser && \
    useradd --uid 1001 --gid appuser --shell /bin/bash --create-home appuser

RUN apt-get update -qq && \
    apt-get install -y -qq curl openssl && \
    rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/dist ./dist
COPY --from=deps /prod_modules ./node_modules
COPY --from=builder /app/package.json ./

# entrypoint: ينتظر DB → يشغّل migrations → يشغّل seed → يبدأ التطبيق
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE ${PORT}

USER appuser

HEALTHCHECK --interval=15s --timeout=10s --retries=5 --start-period=60s \
  CMD curl -s http://localhost:${PORT}/api/health > /dev/null 2>&1 || exit 1

CMD ["sh", "./entrypoint.sh"]
