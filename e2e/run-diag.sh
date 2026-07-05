#!/bin/bash
ROOT=/home/user/affiliate-launch-kit
pkill -f "node dist/main.js" 2>/dev/null; pkill -f vite 2>/dev/null; sleep 1
[ -d $ROOT/frontend/node_modules ] || (cd $ROOT/frontend && npm install --no-audit --no-fund --silent)
node $ROOT/backend/dist/main.js > /tmp/backend.log 2>&1 &
cd $ROOT/frontend && npm run dev > /tmp/frontend.log 2>&1 &
for i in $(seq 1 25); do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/ 2>/dev/null)
  [ "$code" = "200" ] && break; sleep 1
done
echo "vite ready: $code"
cd $ROOT/e2e && node diag.js 2>&1
pkill -f "node dist/main.js" 2>/dev/null; pkill -f vite 2>/dev/null
