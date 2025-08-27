#!/usr/bin/env bash
# 안전 모드 설정 (일부 셸에서 pipefail 미지원 시 우회)
set -eu
set -o pipefail 2>/dev/null || true

echo "Starting Playwright E2E runner"

# Ensure backend is reachable
API_HOST=${BACKEND_BASE:-http://backend:8000}
WEB_HOST=${FRONTEND_BASE:-http://frontend:3000}
echo "Waiting for API: $API_HOST"
for i in {1..60}; do
  if curl -sSf "$API_HOST/health" >/dev/null; then
    echo "backend ready"; break
  fi
  echo "waiting for backend... ($i)"
  sleep 2
done

# Activate virtualenv if any (workspace may mount local .venv)
if [ -f "/workspace/.venv/bin/activate" ]; then
  source /workspace/.venv/bin/activate
fi

# Export hosts for tests
export FRONTEND_BASE="$WEB_HOST"
export BACKEND_BASE="$API_HOST"

# Run the e2e script with python
python e2e/game_e2e.py || exit $?

# Run the WebSocket reward immediate update smoke test
python e2e/ws_reward_smoke.py

EXIT_CODE=$?
echo "E2E exit code: $EXIT_CODE"
exit $EXIT_CODE
