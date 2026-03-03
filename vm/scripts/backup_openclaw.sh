#!/usr/bin/env bash
set -euo pipefail

TS="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="${1:-./backups}"
VM="${VM:-openclaw-vm}"
STATE_DIR="/home/filipefernandes/.openclaw"

mkdir -p "${BACKUP_DIR}"

# Create backup archive from inside the VM
STATE_ARCHIVE="${BACKUP_DIR}/openclaw-state-${TS}.tar.gz"
orb -m "${VM}" bash -c "tar -C /home/filipefernandes -czf - .openclaw" > "${STATE_ARCHIVE}"
echo "Created ${STATE_ARCHIVE}"

# Create git snapshot commits in workspace directories inside the VM
orb -m "${VM}" bash -c '
  shopt -s nullglob
  WORKSPACES=("'"${STATE_DIR}"'"/workspace*)
  SNAPSHOT_COUNT=0
  for workspace_dir in "${WORKSPACES[@]}"; do
    if [ ! -d "${workspace_dir}/.git" ]; then
      continue
    fi
    pushd "${workspace_dir}" >/dev/null
    git add -A
    if ! git diff --cached --quiet; then
      git commit -m "backup(workspace): snapshot '"${TS}"'"
      SNAPSHOT_COUNT=$((SNAPSHOT_COUNT + 1))
      echo "Created workspace snapshot commit in ${workspace_dir}"
    else
      echo "Workspace clean: ${workspace_dir}"
    fi
    popd >/dev/null
  done
  if [ "${SNAPSHOT_COUNT}" -eq 0 ]; then
    echo "No workspace snapshot commits created"
  fi
'
