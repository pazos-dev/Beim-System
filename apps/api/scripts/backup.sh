#!/usr/bin/env bash
#
# Nightly Postgres backup (issue #95).
#
# Usage:  DATABASE_URL=<conn> [BACKUP_DIR=./backups] [RETENTION_DAYS=7] bash scripts/backup.sh
# Cron:   0 3 * * *  cd /srv/beim && DATABASE_URL=... BACKUP_DIR=/var/backups/beim bash apps/api/scripts/backup.sh
#
# - Dumps custom format (-Fc, compressed) with a timestamped name.
# - Prunes files older than RETENTION_DAYS (off-site copy, if any, is the
#   operator's next cron step reading the same BACKUP_DIR).
# - Exit code is the contract for alerting: 0 = ok (logs "[backup] ok ..."),
#   non-zero = failed (logs "[backup] FAILED ..."). Wire your monitor to it.
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL must be set (never commit it)}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
FILE="$BACKUP_DIR/beim_$STAMP.dump"

echo "[backup] starting dump to $FILE"
if ! pg_dump -Fc -f "$FILE" "$DATABASE_URL"; then
  echo "[backup] FAILED: pg_dump exited non-zero" >&2
  rm -f "$FILE"
  exit 1
fi

SIZE="$(du -h "$FILE" | cut -f1)"
echo "[backup] ok file=$FILE size=$SIZE"

BEFORE="$(find "$BACKUP_DIR" -maxdepth 1 -name 'beim_*.dump' | wc -l)"
find "$BACKUP_DIR" -maxdepth 1 -name 'beim_*.dump' -mtime +"$RETENTION_DAYS" -delete
AFTER="$(find "$BACKUP_DIR" -maxdepth 1 -name 'beim_*.dump' | wc -l)"
echo "[backup] retention: kept=$AFTER pruned=$((BEFORE - AFTER)) (older than ${RETENTION_DAYS}d)"
echo "[backup] done"
