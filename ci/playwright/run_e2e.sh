#!/usr/bin/env bash
set -euo pipefail

echo "Starting Playwright E2E runner"

# Ensure backend is reachable
for i in {1..60}; do
  if curl -sSf http://localhost:8000/docs >/dev/null; then
    echo "backend ready"; break
  fi
  echo "waiting for backend... ($i)"
  sleep 2
done

# Activate virtualenv if any (workspace may mount local .venv)
if [ -f "/workspace/.venv/bin/activate" ]; then
  source /workspace/.venv/bin/activate
fi

# Run the e2e script with python
python e2e/game_e2e.py

EXIT_CODE=$?
echo "E2E exit code: $EXIT_CODE"
exit $EXIT_CODE
