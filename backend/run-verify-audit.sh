#!/bin/bash
cd /home/user/affiliate-launch-kit/backend
pkill -f "node dist/main.js" 2>/dev/null; sleep 1
node dist/main.js > /tmp/backend.log 2>&1 &
PID=$!
BK=0
for i in $(seq 1 40); do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/campaigns 2>/dev/null)
  echo "$code" | grep -qE "^(401|403|200)$" && { echo "server ready ($code) ${i}s"; BK=1; break; }
  kill -0 $PID 2>/dev/null || { echo "server died"; tail -10 /tmp/backend.log; break; }
  sleep 1
done
[ "$BK" != "1" ] && { kill $PID 2>/dev/null; exit 2; }
sleep 1
node test/verify-audit.js
E=$?
kill $PID 2>/dev/null
exit $E
