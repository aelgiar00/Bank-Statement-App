#!/bin/sh
# Restart contract for the live preview. Idempotent: skip if :8080 is healthy.
set -eu
cd /workspace

if curl -sf -o /dev/null --max-time 2 http://127.0.0.1:8080/; then
  exit 0
fi

npm run dev > /tmp/keshf-dev.log 2>&1 &
# Wait until the preview answers so revive is not racing first paint.
i=0
while [ "$i" -lt 40 ]; do
  if curl -sf -o /dev/null --max-time 2 http://127.0.0.1:8080/; then
    exit 0
  fi
  i=$((i + 1))
  sleep 0.25
done
exit 0
