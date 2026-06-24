#!/usr/bin/env bash
#
# MRB Learning Platform — Nginx production setup
#
# Generates the Nginx site config from template, installs it, adds rate-limit
# zones to nginx.conf, and validates the configuration.
#
# Usage:
#   sudo bash deployment/scripts/setup-nginx.sh
#
# Before running, create deployment/nginx/nginx-deploy.env:
#   DOMAIN=your-domain.example
#   APP_ROOT=/var/www/mrb-learning
#
# Or export DOMAIN and APP_ROOT as environment variables.
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NGINX_DIR="${ROOT_DIR}/deployment/nginx"
ENV_FILE="${NGINX_DIR}/nginx-deploy.env"

# ---------------------------------------------------------------------------
# Load configuration
# ---------------------------------------------------------------------------
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

DOMAIN="${DOMAIN:-}"
APP_ROOT="${APP_ROOT:-}"

if [[ -z "$DOMAIN" ]]; then
  echo "[setup-nginx] ERROR: DOMAIN is required."
  echo "  Set it in ${ENV_FILE} or export DOMAIN=your-domain.example"
  exit 1
fi

if [[ -z "$APP_ROOT" ]]; then
  echo "[setup-nginx] ERROR: APP_ROOT is required."
  echo "  Set it in ${ENV_FILE} or export APP_ROOT=/var/www/mrb-learning"
  exit 1
fi

if [[ ! -d "$APP_ROOT" ]]; then
  echo "[setup-nginx] WARNING: APP_ROOT directory does not exist: ${APP_ROOT}"
  echo "  The config will be generated but Nginx may not serve files until the directory is created."
fi

export DOMAIN APP_ROOT

# ---------------------------------------------------------------------------
# Generate site config from template
# ---------------------------------------------------------------------------
TEMPLATE="${NGINX_DIR}/mrb-learning.conf.template"
SITES_AVAILABLE="/etc/nginx/sites-available/mrb-learning"

if [[ ! -f "$TEMPLATE" ]]; then
  echo "[setup-nginx] ERROR: Template not found: ${TEMPLATE}"
  exit 1
fi

echo "[setup-nginx] Generating Nginx site config..."
echo "  DOMAIN:   ${DOMAIN}"
echo "  APP_ROOT: ${APP_ROOT}"

envsubst '${DOMAIN} ${APP_ROOT}' < "$TEMPLATE" | sudo tee "$SITES_AVAILABLE" > /dev/null

if [[ ! -f "$SITES_AVAILABLE" ]]; then
  echo "[setup-nginx] ERROR: Failed to write ${SITES_AVAILABLE}"
  exit 1
fi

echo "[setup-nginx] Config written to ${SITES_AVAILABLE}"

# ---------------------------------------------------------------------------
# Enable site
# ---------------------------------------------------------------------------
SITES_ENABLED="/etc/nginx/sites-enabled/mrb-learning"

if [[ ! -L "$SITES_ENABLED" ]] || [[ "$(readlink -f "$SITES_ENABLED")" != "$SITES_AVAILABLE" ]]; then
  echo "[setup-nginx] Enabling site (symlink)..."
  sudo ln -sf "$SITES_AVAILABLE" "$SITES_ENABLED"
fi

# ---------------------------------------------------------------------------
# Add rate-limit zones include to nginx.conf if not present
# ---------------------------------------------------------------------------
NGINX_CONF="/etc/nginx/nginx.conf"
RATE_LIMIT_INCLUDE="include ${NGINX_DIR}/rate-limit-zones.conf;"

if ! grep -qF "$RATE_LIMIT_INCLUDE" "$NGINX_CONF" 2>/dev/null; then
  echo "[setup-nginx] Adding rate-limit zones include to ${NGINX_CONF}..."
  # Insert after the first 'http {' line
  sudo sed -i "0,/^http {/a\\    ${RATE_LIMIT_INCLUDE}" "$NGINX_CONF"
  echo "[setup-nginx] Added: ${RATE_LIMIT_INCLUDE}"
else
  echo "[setup-nginx] Rate-limit include already present in ${NGINX_CONF}"
fi

# ---------------------------------------------------------------------------
# Validate and reload
# ---------------------------------------------------------------------------
echo "[setup-nginx] Validating Nginx configuration..."
if sudo nginx -t; then
  echo "[setup-nginx] Config valid. Reloading Nginx..."
  sudo systemctl reload nginx
  echo "[setup-nginx] Nginx reloaded successfully."
else
  echo "[setup-nginx] ERROR: Nginx configuration test failed."
  echo "  Check ${SITES_AVAILABLE} and ${NGINX_CONF} for errors."
  exit 1
fi

echo "[setup-nginx] Done. Site is live at https://${DOMAIN}"
