#!/bin/bash
# Boots backend + frontend, runs the real-browser E2E, captures screenshots.
ROOT=/home/user/affiliate-launch-kit

echo "▶ ensuring chromium system deps"
dpkg -s libnspr4 >/dev/null 2>&1 || \
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
    libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 \
    libpango-1.0-0 libcairo2 libasound2t64 libatspi2.0-0 >/dev/null 2>&1

cd $ROOT/e2e
[ -d node_modules ] || npm install --no-audit --no-fund --silent
[ -d /home/user/.cache/ms-playwright/chromium_headless_shell-1228 ] || \
  npx playwright install chromium

# ensure backend built
cd $ROOT/backend
[ -d node_modules ] || npm install --no-audit --no-fund --silent
[ -f dist/main.js ] || npm run build --silent

pkill -f "node dist/main.js" 2>/dev/null
pkill -f vite 2>/dev/null
sleep 1

node dist/main.js > /tmp/backend.log 2>&1 &
BPID=$!

echo "▶ waiting for BACKEND..."
BK=0
for i in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/campaigns 2>/dev/null)
  echo "$code" | grep -qE "^(401|403|200)$" && { echo "  backend ready (${i}s, $code)"; BK=1; break; }
  kill -0 $BPID 2>/dev/null || { echo "  backend DIED"; tail -20 /tmp/backend.log; break; }
  sleep 1
done
[ "$BK" != "1" ] && { echo "BACKEND FAILED"; tail -30 /tmp/backend.log; kill $BPID 2>/dev/null; exit 2; }

echo "▶ waiting for VITE..."
cd $ROOT/frontend
[ -d node_modules ] || npm install --no-audit --no-fund --silent
npm run dev > /tmp/frontend.log 2>&1 &
FPID=$!
VITE_OK=0
for i in $(seq 1 40); do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/ 2>/dev/null)
  [ "$code" = "200" ] && { echo "  vite ready (${i}s)"; VITE_OK=1; break; }
  sleep 1
done
[ "$VITE_OK" != "1" ] && { echo "VITE FAILED"; cat /tmp/frontend.log; kill $BPID $FPID 2>/dev/null; exit 2; }

# Settle for NestJS module init
sleep 2

echo "▶ running real-browser E2E"
cd $ROOT/e2e
node browser-e2e.js
E2E_EXIT=$?

kill $BPID $FPID 2>/dev/null
echo "▶ screenshots saved:"
ls -1 screenshots/*.png 2>/dev/null | sed 's/^/  /'
exit $E2E_EXIT
