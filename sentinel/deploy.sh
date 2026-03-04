#!/usr/bin/env bash
#
# deploy.sh — Build Sentinel locally and deploy to the OrbStack VM
#
# Usage:
#   ./deploy.sh          Build + sync + restart service
#   ./deploy.sh sync     Sync only (skip build)
#   ./deploy.sh commands Register slash commands on VM
#
set -euo pipefail

VM_HOST="aisquad@orb"
VM_DIR="/home/filipefernandes/sentinel"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

cd "$SCRIPT_DIR"

sync_files() {
  echo "[deploy] Syncing to ${VM_HOST}:${VM_DIR}..."
  rsync -az --delete \
    --include='dist/***' \
    --include='node_modules/***' \
    --include='config.json' \
    --include='package.json' \
    --exclude='*' \
    -e ssh \
    ./ "${VM_HOST}:${VM_DIR}/"
  echo "[deploy] Sync complete."
}

restart_service() {
  echo "[deploy] Restarting sentinel service..."
  orb run -m aisquad -u root systemctl restart openclaw-sentinel
  echo "[deploy] Service restarted."
  sleep 3
  orb run -m aisquad -u root journalctl -u openclaw-sentinel --no-pager -n 15
}

case "${1:-}" in
  sync)
    sync_files
    ;;
  commands)
    echo "[deploy] Registering slash commands..."
    orb run -m aisquad bash -c "cd ${VM_DIR} && node dist/deploy-commands.js"
    ;;
  *)
    echo "[deploy] Building..."
    npm run build
    sync_files
    restart_service
    ;;
esac
