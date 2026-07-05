# =============================================================================
# Frontend Dockerfile — Multi-stage Build with Nginx
# Serves React SPA + Proxies /api to backend
# =============================================================================

# ── Stage 1: Build React App ──────────────────────────────────────────────────
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . .

ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

# ── Stage 2: Serve with Nginx ────────────────────────────────────────────────
FROM nginx:alpine AS runner

RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=15s --timeout=10s --retries=5 \
  CMD curl -sf http://localhost:80 || exit 1

CMD ["nginx", "-g", "daemon off;"]
