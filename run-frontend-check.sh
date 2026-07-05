#!/bin/bash
cd /home/user/affiliate-launch-kit/backend
pkill -f "node dist/main.js" 2>/dev/null
pkill -f vite 2>/dev/null
sleep 1

node dist/main.js > /tmp/backend.log 2>&1 &
BPID=$!

cd /home/user/affiliate-launch-kit/frontend
npm run dev > /tmp/frontend.log 2>&1 &
FPID=$!

echo "Waiting for Vite..."
VITE_OK=0
for i in $(seq 1 25); do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/ 2>/dev/null)
  if [ "$code" = "200" ]; then echo "Vite ready after ${i}s"; VITE_OK=1; break; fi
  sleep 1
done

if [ "$VITE_OK" != "1" ]; then
  echo "VITE NOT READY"; echo "=== log ==="; cat /tmp/frontend.log
  kill $BPID $FPID 2>/dev/null; exit 2
fi

echo "=== frontend index.html served ==="
curl -s http://localhost:5173/ | head -12
echo ""
echo "=== proxy /api/auth/register -> backend ==="
curl -s -X POST http://localhost:5173/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"proxy_test@example.com","password":"testtest123"}' | head -c 250
echo ""
echo "=== main.tsx transform status ==="
curl -s -o /dev/null -w "main.tsx -> %{http_code}\n" http://localhost:5173/src/main.tsx
echo "=== tokens.css status ==="
curl -s -o /dev/null -w "tokens.css -> %{http_code}\n" http://localhost:5173/src/styles/tokens.css

kill $BPID $FPID 2>/dev/null
echo "done"
