#!/usr/bin/env bash
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 <agent-id>" >&2
  echo "Optional env vars: VM, WORKSPACE, MODEL, BINDS (comma-separated), NON_INTERACTIVE=1|0" >&2
  exit 1
fi

AGENT_ID="$1"
VM="${VM:-openclaw-vm}"
OPENCLAW_DIR="/home/filipefernandes/openclaw"
WORKSPACE="${WORKSPACE:-/home/filipefernandes/.openclaw/workspace-${AGENT_ID}}"
NON_INTERACTIVE="${NON_INTERACTIVE:-1}"

args="agents add ${AGENT_ID} --workspace ${WORKSPACE}"

if [ -n "${MODEL:-}" ]; then
  args+=" --model ${MODEL}"
fi

if [ -n "${BINDS:-}" ]; then
  IFS=',' read -r -a binds <<< "${BINDS}"
  for bind_spec in "${binds[@]}"; do
    if [ -n "${bind_spec}" ]; then
      args+=" --bind ${bind_spec}"
    fi
  done
fi

if [ "${NON_INTERACTIVE}" = "1" ]; then
  args+=" --non-interactive --json"
fi

orb -m "${VM}" bash -c "cd ${OPENCLAW_DIR} && node dist/index.js ${args}"
