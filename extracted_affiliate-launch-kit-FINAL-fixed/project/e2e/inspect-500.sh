#!/bin/bash
ROOT=/home/user/affiliate-launch-kit
pkill -f "node dist/main.js" 2>/dev/null; pkill -f vite 2>/dev/null; sleep 1

# ensure backend built
cd $ROOT/backend
[ -d node_modules ] || npm install --no-audit --no-fund --silent
[ -f dist/main.js ] || npm run build --silent
[ -d node_modules/pg ] || echo "WARN: pg missing"

node dist/main.js > /tmp/backend.log 2>&1 &
BPID=$!
echo "backend pid=$BPID"

# wait for backend specifically
BK=0
for i in $(seq 1 40); do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/campaigns 2>/dev/null)
  echo "$code" | grep -qE "^(401|403|200)$" && { echo "backend ready ($code) after ${i}s"; BK=1; break; }
  # check if process died
  kill -0 $BPID 2>/dev/null || { echo "backend process DIED"; break; }
  sleep 1
done
[ "$BK" != "1" ] && { echo "=== backend log (first 60 lines) ==="; head -60 /tmp/backend.log; pkill -f vite 2>/dev/null; exit 2; }

echo "=== direct register (port 3000, no cookie) ==="
curl -s -w "\n-> status %{http_code}\n" -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" -d '{"email":"direct2@example.com","password":"RealPass123!"}' | tail -2

echo "=== proxy register (port 5173, NO cookie) ==="
cd $ROOT/frontend && npm run dev > /tmp/frontend.log 2>&1 &
for i in $(seq 1 25); do code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/ 2>/dev/null); [ "$code" = "200" ] && break; sleep 1; done
curl -s -w "\n-> status %{http_code}\n" -X POST http://localhost:5173/api/auth/register \
  -H "Content-Type: application/json" -d '{"email":"proxy_nocookie@example.com","password":"RealPass123!"}' | tail -2

echo "=== proxy register WITH bogus cookie ==="
curl -s -w "\n-> status %{http_code}\n" -X POST http://localhost:5173/api/auth/register \
  -H "Content-Type: application/json" -H "Cookie: alk_refresh=garbage.value.here" \
  -d '{"email":"proxy_withcookie@example.com","password":"RealPass123!"}' | tail -2

echo ""
echo "=== backend ERROR log (filtered) ==="
grep -iE "error|exception|stack|throw|Cannot|undefined" /tmp/backend.log | grep -viE "no error|error-handler|error-banner" | tail -25

pkill -f "node dist/main.js" 2>/dev/null; pkill -f vite 2>/dev/null
