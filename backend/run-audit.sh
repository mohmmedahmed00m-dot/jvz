#!/bin/bash
cd /home/user/affiliate-launch-kit/backend
pkill -f "node dist/main.js" 2>/dev/null
sleep 1

node dist/main.js > /tmp/backend.log 2>&1 &
PID=$!

READY=0
for i in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/campaigns 2>/dev/null)
  if echo "$code" | grep -qE "^(401|403|200)$"; then
    echo "Server ready after ${i}s ($code)"; READY=1; break
  fi
  sleep 1
done

if [ "$READY" != "1" ]; then
  echo "SERVER NOT READY"; cat /tmp/backend.log; kill $PID 2>/dev/null; exit 2
fi

echo "=== running audit ==="
node test/audit.js
AUDIT_EXIT=$?

kill $PID 2>/dev/null
exit $AUDIT_EXIT
