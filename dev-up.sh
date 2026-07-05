#!/bin/bash
# dev-up.sh — FULL cold-start bootstrap (sandbox resets between turns).
# Idempotent: safe to re-run. Installs system pkgs + creates DB + node deps + build + migrate + seed.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/backend"

echo "▶ [1/7] Ensure PostgreSQL + Redis installed"
if ! command -v psql >/dev/null 2>&1; then
  sudo apt-get update -qq 2>&1 | tail -1
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql postgresql-contrib redis-server 2>&1 | tail -2
fi
echo "   psql: $(command -v psql) | redis: $(command -v redis-server)"

echo "▶ [2/7] Start PostgreSQL + Redis"
sudo pg_ctlcluster 17 main start 2>/dev/null || true
sleep 2
sudo redis-server --daemonize yes --port 6379 2>/dev/null || true
sleep 1
pg_isready >/dev/null 2>&1 && echo "   PG ready" || { echo "   PG FAILED"; exit 1; }
redis-cli ping >/dev/null 2>&1 && echo "   Redis ready" || { echo "   Redis FAILED"; exit 1; }

echo "▶ [3/7] Create DB role + database (idempotent)"
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='alk_user'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE USER alk_user WITH PASSWORD 'alk_pass';" 2>/dev/null
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='affiliate_launch_kit'" | grep -q 1 || \
  ( sudo -u postgres psql -c "CREATE DATABASE affiliate_launch_kit OWNER alk_user;" 2>/dev/null && \
    sudo -u postgres psql -d affiliate_launch_kit -c "GRANT ALL ON SCHEMA public TO alk_user;" 2>/dev/null )
sudo -u postgres psql -c "ALTER USER alk_user WITH PASSWORD 'alk_pass';" >/dev/null 2>&1

echo "▶ [4/7] Install backend dependencies"
npm install --no-audit --no-fund --silent 2>&1 | tail -1

echo "▶ [5/7] Build backend (tsc -> dist)"
npm run build --silent 2>&1 | tail -3

echo "▶ [6/7] Run migrations (idempotent)"
npx typeorm-ts-node-commonjs -d src/database/data-source.ts migration:run 2>&1 | tail -2

echo "▶ [7/7] Seed templates + test license (idempotent)"
npx ts-node src/database/seed/index.ts 2>&1 | tail -2

echo "✓ Bootstrap complete — services + DB + code ready"
