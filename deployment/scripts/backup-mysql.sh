#!/usr/bin/env bash
# MySQL logical backup — run via cron on the VPS.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ROOT_DIR}/server/.env"
BACKUP_DIR="${BACKUP_DIR:-${ROOT_DIR}/backups/mysql}"
RETENTION_DAYS="${MYSQL_BACKUP_RETENTION_DAYS:-14}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "[backup-mysql] ERROR: server/.env not found"
  exit 1
fi

# shellcheck disable=SC1090
set -a
source "$ENV_FILE"
set +a

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d_%H%M%S)"
OUT_FILE="${BACKUP_DIR}/${MYSQL_DATABASE}_${STAMP}.sql.gz"

echo "[backup-mysql] Dumping ${MYSQL_DATABASE} → ${OUT_FILE}"
mysqldump \
  -h "${MYSQL_HOST:-127.0.0.1}" \
  -P "${MYSQL_PORT:-3306}" \
  -u "${MYSQL_USER}" \
  -p"${MYSQL_PASSWORD}" \
  --single-transaction \
  --routines \
  --triggers \
  --set-gtid-purged=OFF \
  "${MYSQL_DATABASE}" | gzip -9 > "$OUT_FILE"

find "$BACKUP_DIR" -type f -name '*.sql.gz' -mtime +"$RETENTION_DAYS" -delete
echo "[backup-mysql] Done. Retention: ${RETENTION_DAYS} days."
