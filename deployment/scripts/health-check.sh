#!/usr/bin/env bash
# Post-deploy health validation — polls /api/health and /api/ready via Nginx or direct API.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ROOT_DIR}/server/.env"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a
  source "$ENV_FILE"
  set +a
fi

HEALTH_URL="${HEALTH_CHECK_URL:-http://127.0.0.1:${PORT:-4000}/api/health}"
READY_URL="${READY_CHECK_URL:-http://127.0.0.1:${PORT:-4000}/api/ready}"
MAX_ATTEMPTS="${HEALTH_CHECK_ATTEMPTS:-30}"
SLEEP_SEC="${HEALTH_CHECK_INTERVAL_SEC:-2}"

check_url() {
  local url="$1"
  local label="$2"
  local attempt=1

  while [[ "$attempt" -le "$MAX_ATTEMPTS" ]]; do
    if curl -fsS --max-time 5 "$url" >/dev/null 2>&1; then
      echo "[health-check] ${label} OK (${url})"
      return 0
    fi
    echo "[health-check] ${label} waiting… (${attempt}/${MAX_ATTEMPTS})"
    sleep "$SLEEP_SEC"
    attempt=$((attempt + 1))
  done

  echo "[health-check] ERROR: ${label} failed after ${MAX_ATTEMPTS} attempts (${url})"
  return 1
}

check_url "$HEALTH_URL" "liveness"
check_url "$READY_URL" "readiness"
echo "[health-check] All checks passed."
