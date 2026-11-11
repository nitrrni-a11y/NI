#!/bin/sh
set -e

export AI_SERVICE_URL="${AI_SERVICE_URL:-http://127.0.0.1:8000}"

# Start Python FastAPI AI microservice on loopback port 8000 (1 worker for <200MB RSS)
cd /app/ai
uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1 &
AI_PID=$!

cleanup() {
  if kill -0 "$AI_PID" 2>/dev/null; then
    kill "$AI_PID" 2>/dev/null || true
    wait "$AI_PID" 2>/dev/null || true
  fi
}
trap cleanup INT TERM EXIT

# Briefly wait for FastAPI health endpoint (non-fatal if model warms up asynchronously)
i=0
while [ "$i" -lt 30 ]; do
  if curl -fsS http://127.0.0.1:8000/health >/dev/null 2>&1; then
    break
  fi
  i=$((i + 1))
  sleep 1
done

# Start Node.js Express backend in foreground bound to Render's $PORT
cd /app/backend
exec node server.js

