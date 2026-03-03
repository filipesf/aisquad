#!/usr/bin/env bash
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 <backup-archive.tar.gz> [restore-dir]" >&2
  exit 1
fi

ARCHIVE="$1"
RESTORE_DIR="${2:-/tmp/openclaw-restore-test}"

if [ ! -f "${ARCHIVE}" ]; then
  echo "Backup archive not found: ${ARCHIVE}" >&2
  exit 1
fi

rm -rf "${RESTORE_DIR}"
mkdir -p "${RESTORE_DIR}"
tar -C "${RESTORE_DIR}" -xzf "${ARCHIVE}"

RESTORED_STATE="${RESTORE_DIR}/.openclaw"
CONFIG_FILE="${RESTORED_STATE}/openclaw.json"

if [ ! -f "${CONFIG_FILE}" ]; then
  echo "Restore validation failed: missing ${CONFIG_FILE}" >&2
  exit 1
fi

if [ ! -d "${RESTORED_STATE}/agents" ]; then
  echo "Restore validation failed: missing ${RESTORED_STATE}/agents directory" >&2
  exit 1
fi

FOUND_SESSIONS=0
for sessions_file in "${RESTORED_STATE}"/agents/*/sessions/sessions.json; do
  if [ -f "${sessions_file}" ]; then
    FOUND_SESSIONS=1
    echo "Restored sessions store: ${sessions_file}"
  fi
done

if [ "${FOUND_SESSIONS}" -eq 0 ]; then
  echo "Restore validation failed: no agent sessions stores found under ${RESTORED_STATE}/agents/*/sessions/sessions.json" >&2
  exit 1
fi

echo "Restore validation passed"
echo "Restored config: ${CONFIG_FILE}"
