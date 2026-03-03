#!/usr/bin/env bash
set -euo pipefail

# ── Configuration ────────────────────────────────────────────────
PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-postgres}"
PGPASSWORD="${PGPASSWORD:-postgres}"
PGDATABASE="${PGDATABASE:-mission_control}"

export PGPASSWORD

DRY_RUN=false
BACKUP_FILE=""

# ── Parse arguments ──────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case $1 in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    *)
      BACKUP_FILE="$1"
      shift
      ;;
  esac
done

# ── Find backup file ────────────────────────────────────────────
if [ -z "$BACKUP_FILE" ]; then
  # Use the most recent backup
  BACKUP_DIR="$(dirname "$0")/backups"
  if [ ! -d "$BACKUP_DIR" ]; then
    echo "❌ No backup directory found at ${BACKUP_DIR}"
    exit 1
  fi

  BACKUP_FILE=$(ls -t "$BACKUP_DIR"/mission_control_*.sql 2>/dev/null | head -1)
  if [ -z "$BACKUP_FILE" ]; then
    echo "❌ No backup files found in ${BACKUP_DIR}"
    exit 1
  fi
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "❌ Backup file not found: ${BACKUP_FILE}"
  exit 1
fi

FILE_SIZE=$(wc -c < "$BACKUP_FILE" | tr -d ' ')
echo "📋 Backup file: ${BACKUP_FILE}"
echo "   Size: ${FILE_SIZE} bytes"

# ── Validate backup file ────────────────────────────────────────
echo ""
echo "🔍 Validating backup file..."

EXPECTED_TABLES=("agents" "tasks" "assignments" "notifications" "activities" "comments" "subscriptions")
FOUND_TABLES=0

for table in "${EXPECTED_TABLES[@]}"; do
  if grep -q "CREATE TABLE.*${table}\|COPY.*${table}" "$BACKUP_FILE" 2>/dev/null; then
    FOUND_TABLES=$((FOUND_TABLES + 1))
    echo "   ✓ Found table: ${table}"
  else
    echo "   ○ Table not in dump: ${table} (may be empty)"
  fi
done

if [ "$FILE_SIZE" -eq 0 ]; then
  echo "❌ Backup file is empty!"
  exit 1
fi

echo ""
echo "   Found ${FOUND_TABLES}/${#EXPECTED_TABLES[@]} expected tables in dump"

if $DRY_RUN; then
  echo ""
  echo "✅ Dry run complete — backup file appears valid."
  echo "   Run without --dry-run to restore."
  exit 0
fi

# ── Restore ──────────────────────────────────────────────────────
echo ""
echo "⚠️  This will DROP and recreate the database!"
read -rp "Continue? [y/N] " confirm

if [[ "$confirm" != [yY] ]]; then
  echo "Aborted."
  exit 0
fi

echo ""
echo "🔄 Dropping and recreating database..."

# Drop connections and recreate
psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d postgres -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${PGDATABASE}' AND pid <> pg_backend_pid();" \
  2>/dev/null || true

psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d postgres -c \
  "DROP DATABASE IF EXISTS ${PGDATABASE};"

psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d postgres -c \
  "CREATE DATABASE ${PGDATABASE};"

echo "🔄 Restoring from backup..."
psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" < "$BACKUP_FILE"

# ── Verify table counts ─────────────────────────────────────────
echo ""
echo "🔍 Verifying restored data..."

for table in "${EXPECTED_TABLES[@]}"; do
  COUNT=$(psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -t -c \
    "SELECT COUNT(*) FROM ${table};" 2>/dev/null | tr -d ' ' || echo "N/A")
  echo "   ${table}: ${COUNT} rows"
done

echo ""
echo "✅ Restore completed successfully!"
