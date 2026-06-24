#!/usr/bin/env bash
# Validate production environment before deploy. Sources server/.env when present.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ROOT_DIR}/server/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "[validate-env] ERROR: Missing server/.env — copy .env.example and configure secrets."
  exit 1
fi

# shellcheck disable=SC1090
set -a
source "$ENV_FILE"
set +a

NODE_ENV="${NODE_ENV:-development}"
if [[ "$NODE_ENV" != "production" ]]; then
  echo "[validate-env] WARNING: NODE_ENV is '$NODE_ENV' (expected production on VPS)."
fi

REQUIRED_KEYS=(
  MYSQL_HOST
  MYSQL_USER
  MYSQL_PASSWORD
  MYSQL_DATABASE
  REDIS_URL
  JWT_ACCESS_SECRET
  JWT_REFRESH_SECRET
  ADMIN_SECRET_PATH
  SAFEPAY_ENV
  SAFEPAY_MERCHANT_SECRET
  SAFEPAY_MERCHANT_API_KEY
  SAFEPAY_WEBHOOK_SECRET
  CLIENT_URL
  TEACHER_THREAD_SECRET
)

MISSING=()
for key in "${REQUIRED_KEYS[@]}"; do
  val="${!key:-}"
  if [[ -z "${val// /}" ]]; then
    MISSING+=("$key")
  fi
done

if [[ ${#MISSING[@]} -gt 0 ]]; then
  echo "[validate-env] ERROR: Missing required environment variables:"
  printf '  - %s\n' "${MISSING[@]}"
  exit 1
fi

if [[ "${#ADMIN_SECRET_PATH}" -lt 16 ]]; then
  echo "[validate-env] ERROR: ADMIN_SECRET_PATH must be at least 16 characters."
  exit 1
fi

if [[ "${#JWT_ACCESS_SECRET}" -lt 32 || "${#JWT_REFRESH_SECRET}" -lt 32 ]]; then
  echo "[validate-env] ERROR: JWT secrets must be at least 32 characters."
  exit 1
fi

if [[ "${TRUST_PROXY:-false}" == "false" ]]; then
  echo "[validate-env] ERROR: TRUST_PROXY must be set (use 1 behind Nginx)."
  exit 1
fi

if [[ "${REQUIRE_REDIS_IN_PRODUCTION:-true}" == "false" && "$NODE_ENV" == "production" ]]; then
  echo "[validate-env] ERROR: REQUIRE_REDIS_IN_PRODUCTION must not be false in production."
  exit 1
fi

if [[ "$NODE_ENV" == "production" ]]; then
  if [[ "${REFRESH_COOKIE_SECURE:-false}" != "true" || "${ACCESS_COOKIE_SECURE:-false}" != "true" ]]; then
    echo "[validate-env] ERROR: REFRESH_COOKIE_SECURE and ACCESS_COOKIE_SECURE must be true in production."
    exit 1
  fi

  if [[ "${SAFEPAY_ENV:-sandbox}" != "production" ]]; then
    echo "[validate-env] ERROR: SAFEPAY_ENV must be 'production' in production (got '${SAFEPAY_ENV}')."
    exit 1
  fi

  # Debug flags must not be enabled in production
  if [[ "${SAFEPAY_DEBUG:-false}" == "true" ]]; then
    echo "[validate-env] ERROR: SAFEPAY_DEBUG must not be 'true' in production (logs sensitive data)."
    exit 1
  fi
  if [[ "${SAFEPAY_WEBHOOK_CRASH_DEBUG:-false}" == "true" ]]; then
    echo "[validate-env] ERROR: SAFEPAY_WEBHOOK_CRASH_DEBUG must not be 'true' in production (logs sensitive data)."
    exit 1
  fi

  if [[ "${ALLOW_ADMIN_BOOTSTRAP:-false}" == "true" ]]; then
    echo "[validate-env] ERROR: ALLOW_ADMIN_BOOTSTRAP must not be 'true' in production (admin bootstrap blocked)."
    exit 1
  fi
fi

if [[ -z "${VITE_GOOGLE_CLIENT_ID:-}" && -z "${GOOGLE_CLIENT_ID:-}" ]]; then
  echo "[validate-env] WARNING: GOOGLE_CLIENT_ID / VITE_GOOGLE_CLIENT_ID not set — Google Sign-In disabled."
fi

echo "[validate-env] Environment validation passed."
