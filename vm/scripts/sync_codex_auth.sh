#!/usr/bin/env bash
# sync_codex_auth.sh — Sync ~/.codex/auth.json from macOS host to the OpenClaw VM.
#
# The openai-codex provider reads OAuth credentials from ~/.codex/auth.json on the VM.
# The Codex CLI runs on macOS and rotates the token there, leaving the VM copy stale.
# This script keeps them in sync and restarts the gateway only when the file changed.
#
# Usage:
#   ./scripts/sync_codex_auth.sh
#   VM=aisquad ./scripts/sync_codex_auth.sh
#
# Called by:
#   make codex-auth-sync

set -euo pipefail

VM="${VM:-aisquad}"
MAC_AUTH="${HOME}/.codex/auth.json"
VM_AUTH="/home/filipefernandes/.codex/auth.json"
VM_AUTH_DIR="/home/filipefernandes/.codex"

# ── Preflight ────────────────────────────────────────────────────────────────

if [ ! -f "${MAC_AUTH}" ]; then
  echo "error: ${MAC_AUTH} not found on macOS host." >&2
  echo "Run 'codex' on your Mac and sign in first to create it." >&2
  exit 1
fi

# Validate the source file has the expected token structure
if ! python3 -c "
import sys, json
d = json.load(open('${MAC_AUTH}'))
t = d.get('tokens', {})
assert t.get('access_token'), 'missing access_token'
assert t.get('refresh_token'), 'missing refresh_token'
" 2>/dev/null; then
  echo "error: ${MAC_AUTH} is missing required token fields (access_token, refresh_token)." >&2
  echo "Re-authenticate the Codex CLI on your Mac first." >&2
  exit 1
fi

# ── Compare ──────────────────────────────────────────────────────────────────

# Read the current refresh token on the VM (if the file exists)
VM_REFRESH="$(orb -m "${VM}" bash -c "
  if [ -f '${VM_AUTH}' ]; then
    python3 -c \"import json; d=json.load(open('${VM_AUTH}')); print(d.get('tokens',{}).get('refresh_token',''))\" 2>/dev/null || echo ''
  fi
" 2>/dev/null || echo '')"

MAC_REFRESH="$(python3 -c "
import json; d=json.load(open('${MAC_AUTH}')); print(d.get('tokens',{}).get('refresh_token',''))
")"

if [ "${VM_REFRESH}" = "${MAC_REFRESH}" ] && [ -n "${VM_REFRESH}" ]; then
  echo "codex-auth-sync: VM already has the current token — no action needed."
  exit 0
fi

# ── Sync ─────────────────────────────────────────────────────────────────────

echo "codex-auth-sync: token mismatch detected, syncing..."

# Ensure the directory exists on the VM
orb -m "${VM}" bash -c "mkdir -p '${VM_AUTH_DIR}'"

# Copy the file
orb push -m "${VM}" "${MAC_AUTH}" "${VM_AUTH}"

# Verify the push landed
VM_REFRESH_AFTER="$(orb -m "${VM}" bash -c "
  python3 -c \"import json; d=json.load(open('${VM_AUTH}')); print(d.get('tokens',{}).get('refresh_token',''))\" 2>/dev/null
" 2>/dev/null || echo '')"

if [ "${VM_REFRESH_AFTER}" != "${MAC_REFRESH}" ]; then
  echo "error: post-sync verification failed — token on VM does not match source." >&2
  exit 1
fi

echo "codex-auth-sync: auth.json synced successfully."

# ── Restart gateway ──────────────────────────────────────────────────────────

echo "codex-auth-sync: restarting gateway to pick up new credentials..."
orb -m "${VM}" -u root systemctl restart openclaw-gateway
echo "codex-auth-sync: gateway restarted."
