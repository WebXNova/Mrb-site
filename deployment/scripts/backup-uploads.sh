#!/usr/bin/env bash
# Incremental-friendly tarball of server/uploads and server/data runtime dirs.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
UPLOADS_SRC="${ROOT_DIR}/server/uploads"
DATA_SRC="${ROOT_DIR}/server/data"
BACKUP_DIR="${UPLOADS_BACKUP_DIR:-${ROOT_DIR}/backups/uploads}"
RETENTION_DAYS="${UPLOADS_BACKUP_RETENTION_DAYS:-30}"

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d_%H%M%S)"
OUT_FILE="${BACKUP_DIR}/uploads_${STAMP}.tar.gz"

echo "[backup-uploads] Archiving uploads + data → ${OUT_FILE}"
tar -czf "$OUT_FILE" \
  -C "${ROOT_DIR}/server" \
  uploads data 2>/dev/null || tar -czf "$OUT_FILE" -C "${ROOT_DIR}/server" uploads

find "$BACKUP_DIR" -type f -name 'uploads_*.tar.gz' -mtime +"$RETENTION_DAYS" -delete
echo "[backup-uploads] Done. Retention: ${RETENTION_DAYS} days."
