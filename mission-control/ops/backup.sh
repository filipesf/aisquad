#!/usr/bin/env bash
set -euo pipefail

# ── Configuration ────────────────────────────────────────────────
PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-postgres}"
PGPASSWORD="${PGPASSWORD:-postgres}"
PGDATABASE="${PGDATABASE:-mission_control}"

export PGPASSWORD

BACKUP_DIR="${BACKUP_DIR:-$(dirname "$0")/backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/mission_control_${TIMESTAMP}.sql"

# ── Create backup directory ──────────────────────────────────────
mkdir -p "$BACKUP_DIR"

echo "🔄 Starting backup of ${PGDATABASE}..."
echo "   Host: ${PGHOST}:${PGPORT}"
echo "   Output: ${BACKUP_FILE}"

# ── Dump ─────────────────────────────────────────────────────────
pg_dump \
  -h "$PGHOST" \
  -p "$PGPORT" \
  -U "$PGUSER" \
  -d "$PGDATABASE" \
  --format=plain \
  --no-owner \
  --no-privileges \
  > "$BACKUP_FILE"

# ── Verify ───────────────────────────────────────────────────────
FILE_SIZE=$(wc -c < "$BACKUP_FILE" | tr -d ' ')

if [ "$FILE_SIZE" -eq 0 ]; then
  echo "❌ Backup file is empty!"
  rm -f "$BACKUP_FILE"
  exit 1
fi

# Check that expected tables are mentioned in the dump
EXPECTED_TABLES=("agents" "tasks" "assignments" "notifications" "activities" "comments" "subscriptions")
MISSING_TABLES=()

for table in "${EXPECTED_TABLES[@]}"; do
  if ! grep -q "CREATE TABLE.*${table}" "$BACKUP_FILE" 2>/dev/null && \
     ! grep -q "COPY.*${table}" "$BACKUP_FILE" 2>/dev/null; then
    MISSING_TABLES+=("$table")
  fi
done

if [ ${#MISSING_TABLES[@]} -gt 0 ]; then
  echo "⚠️  Warning: The following tables may be missing from the backup:"
  printf "   - %s\n" "${MISSING_TABLES[@]}"
  echo "   This may be expected if those tables are empty."
fi

echo ""
echo "✅ Backup completed successfully!"
echo "   File: ${BACKUP_FILE}"
echo "   Size: ${FILE_SIZE} bytes"
