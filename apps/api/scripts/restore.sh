#!/usr/bin/env bash
#
# Restore a backup.sh dump into a target database (issue #95).
#
# Usage:  bash scripts/restore.sh <dumpfile> <target-database-url> [--yes]
#
# - Refuses to run without explicit confirmation (interactive prompt) unless
#   --yes is passed (automation / verified drills only).
# - The target is DROPPED and recreated schema-wise by pg_restore --clean:
#   triple-check the target URL. Never point this at production outside a
#   declared disaster-recovery drill.
set -euo pipefail

DUMP="${1:?"usage: restore.sh <dumpfile> <target-database-url> [--yes]"}"
TARGET="${2:?"usage: restore.sh <dumpfile> <target-database-url> [--yes]"}"
FLAG="${3:-}"

if [ ! -f "$DUMP" ]; then
  echo "[restore] FAILED: dump file not found: $DUMP" >&2
  exit 1
fi

if [ "$FLAG" != "--yes" ]; then
  echo "[restore] about to DESTROY and reload the database at:"
  echo "[restore]   $TARGET"
  echo "[restore] from:"
  echo "[restore]   $DUMP"
  printf "[restore] type the target database name to continue: "
  read -r ANSWER
  TARGET_DB="$(echo "$TARGET" | sed -E 's|.*/([^/?]+).*|\1|')"
  if [ "$ANSWER" != "$TARGET_DB" ]; then
    echo "[restore] aborted (name mismatch)" >&2
    exit 1
  fi
fi

echo "[restore] restoring $DUMP into target"
if ! pg_restore --clean --if-exists --no-owner -d "$TARGET" "$DUMP"; then
  echo "[restore] FAILED: pg_restore exited non-zero" >&2
  exit 1
fi
echo "[restore] done — verify with: psql \$TARGET -c 'select count(*) from products;'"
