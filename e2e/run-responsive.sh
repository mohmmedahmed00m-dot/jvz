#!/bin/bash
ROOT=/home/user/affiliate-launch-kit
pkill -f "node dist/main.js" 2>/dev/null; pkill -f vite 2>/dev/null; sleep 1

cd $ROOT/backend
[ -f dist/main.js ] || npm run build --silent
[ -d node_modules ] || npm install --no-audit --no-fund --silent
node dist/main.js > /tmp/backend.log 2>&1 &
BPID=$!

cd $ROOT/frontend
[ -d node_modules ] || npm install --no-audit --no-fund --silent
npm run dev > /tmp/frontend.log 2>&1 &
FPID=$!

BK=0
for i in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/campaigns 2>/dev/null)
  echo "$code" | grep -qE "^(401|403|200)$" && { echo "backend ready ($code) ${i}s"; BK=1; break; }
  sleep 1
done
[ "$BK" != "1" ] && { echo "BACKEND FAILED"; tail -20 /tmp/backend.log; kill $BPID $FPID 2>/dev/null; exit 2; }

for i in $(seq 1 40); do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/ 2>/dev/null)
  [ "$code" = "200" ] && { echo "vite ready ${i}s"; break; }
  sleep 1
done
sleep 2

cd $ROOT/e2e
[ -d node_modules ] || npm install --no-audit --no-fund --silent
node responsive.js
EXIT=$?

kill $BPID $FPID 2>/dev/null
exit $EXIT
