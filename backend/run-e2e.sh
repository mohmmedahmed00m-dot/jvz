#!/bin/bash
set +e
cd /home/user/affiliate-launch-kit/backend

pkill -f "node dist/main.js" 2>/dev/null
sleep 1

node dist/main.js > /tmp/backend.log 2>&1 &
SERVER_PID=$!
echo "Backend PID=$SERVER_PID"

READY=0
for i in $(seq 1 40); do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/campaigns 2>/dev/null)
  if echo "$CODE" | grep -qE "^(401|403|200)$"; then
    echo "Server ready after ${i}s (status=$CODE)"
    READY=1
    break
  fi
  sleep 1
done

if [ "$READY" != "1" ]; then
  echo "SERVER NOT READY"
  echo "=== backend log ==="
  cat /tmp/backend.log
  kill $SERVER_PID 2>/dev/null
  exit 2
fi

echo "=== running E2E test ==="
node test/e2e-flow.js
E2E_EXIT=$?
echo "=== E2E exit code: $E2E_EXIT ==="

echo "=== tail backend log ==="
tail -8 /tmp/backend.log

kill $SERVER_PID 2>/dev/null
exit $E2E_EXIT
