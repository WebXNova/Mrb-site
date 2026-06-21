#!/usr/bin/env bash
#
# MRB Learning Platform — single-command production deploy (Ubuntu 24.04 VPS)
#
# Prerequisites: Node.js 20+, PM2, Nginx, MySQL 8, Redis, git
# Usage: ./deploy.sh
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

LOG_DIR="${ROOT_DIR}/logs/deploy"
mkdir -p "$LOG_DIR" "${ROOT_DIR}/logs/pm2"
DEPLOY_LOG="${LOG_DIR}/deploy-$(date +%Y%m%d_%H%M%S).log"

exec > >(tee -a "$DEPLOY_LOG") 2>&1

PREVIOUS_COMMIT=""
ROLLBACK_ENABLED=false
DEPLOY_FAILED=false

log() { echo "[deploy] $(date -Iseconds) $*"; }

rollback() {
  if [[ "$DEPLOY_FAILED" != "true" ]]; then
    return 0
  fi
  if [[ "$ROLLBACK_ENABLED" != "true" || -z "$PREVIOUS_COMMIT" ]]; then
    log "Rollback skipped (no previous commit captured)."
    return 1
  fi
  log "Rolling back to ${PREVIOUS_COMMIT}…"
  git checkout --force "$PREVIOUS_COMMIT"
  bash "${ROOT_DIR}/deployment/scripts/validate-env.sh"
  (cd "${ROOT_DIR}/server" && npm ci --omit=dev)
  build_frontend
  restart_pm2
  log "Rollback complete."
}

on_error() {
  DEPLOY_FAILED=true
  log "ERROR: Deployment failed — attempting rollback."
  rollback || true
  exit 1
}

trap on_error ERR

build_frontend() {
  log "Building frontend…"
  # ADMIN_SECRET_PATH must match server for admin shell injection at build time.
  export ADMIN_SECRET_PATH
  export VITE_GOOGLE_CLIENT_ID="${VITE_GOOGLE_CLIENT_ID:-${GOOGLE_CLIENT_ID:-}}"
  (cd "${ROOT_DIR}/client" && npm ci && npm run build && npm run build:validate)

  if [[ ! -f "${ROOT_DIR}/client/dist/index.html" ]]; then
    log "ERROR: client/dist/index.html missing after build."
    exit 1
  fi
  if ! grep -q '__MRB_ADMIN_SHELL__' "${ROOT_DIR}/client/dist/index.html"; then
    log "ERROR: Admin shell injection missing from built index.html."
    exit 1
  fi
  log "Frontend build validated."
}

restart_pm2() {
  log "Restarting PM2 (mrb-api)…"
  if pm2 describe mrb-api >/dev/null 2>&1; then
    pm2 reload "${ROOT_DIR}/ecosystem.config.js" --env production --update-env
  else
    pm2 start "${ROOT_DIR}/ecosystem.config.js" --env production
  fi
  pm2 save
}

# --- Main deploy flow ---

log "Starting deployment in ${ROOT_DIR}"

if [[ ! -d "${ROOT_DIR}/.git" ]]; then
  log "ERROR: Not a git repository — deploy requires git for rollback."
  exit 1
fi

PREVIOUS_COMMIT="$(git rev-parse HEAD)"
ROLLBACK_ENABLED=true
log "Previous commit: ${PREVIOUS_COMMIT}"

log "Pulling latest code…"
git fetch --prune origin
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
git pull --ff-only origin "${CURRENT_BRANCH}"

bash "${ROOT_DIR}/deployment/scripts/validate-env.sh"

# Load env for build + health checks
# shellcheck disable=SC1090
set -a
source "${ROOT_DIR}/server/.env"
set +a

log "Installing server dependencies…"
(cd "${ROOT_DIR}/server" && npm ci --omit=dev)

build_frontend

log "Running startup migrations (idempotent schema ensure runs on API boot)…"
# Optional explicit migrations — uncomment if you prefer pre-start migration:
# (cd "${ROOT_DIR}/server" && npm run migrate:processed-webhooks)

restart_pm2

# Health check against loopback API (Nginx may also be checked externally)
bash "${ROOT_DIR}/deployment/scripts/health-check.sh"

ROLLBACK_ENABLED=false
DEPLOY_FAILED=false
log "Deployment succeeded. Log: ${DEPLOY_LOG}"
