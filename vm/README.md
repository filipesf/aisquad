# OpenClaw VM Deployment (OrbStack Linux Machine)

This repository manages a native OpenClaw deployment running inside an OrbStack Linux virtual machine on macOS.

**Runtime model:** OpenClaw runs as a native Node.js process managed by systemd — no Docker containers involved.

## Target Environment

- Apple Silicon (M1 Pro)
- macOS with OrbStack
- OrbStack Linux machine: `aisquad` (Ubuntu 25.10, arm64)
- Gateway accessible at `aisquad.orb.local:18789`

## What Is Included

| File | Purpose |
|---|---|
| `Makefile` | Operator command surface — VM lifecycle, service management, health, auth, backup |
| `.env.example` | Template showing the structure of `/etc/openclaw/openclaw.env` inside the VM |
| `scripts/agent_add.sh` | Non-interactive helper to add isolated agents with optional bindings |
| `scripts/backup_openclaw.sh` | Backup script — tars `.openclaw` state from VM, snapshots git workspaces |
| `scripts/restore_verify_openclaw.sh` | Restore validation script for backup archives |
| `OPERATIONS_RUNBOOK.md` | Monthly maintenance, token rotation, and emergency lockout procedures |

## Architecture

```
macOS Host (OrbStack)
  └─ aisquad (Ubuntu 25.10 Linux machine)
       ├─ systemd: openclaw-gateway.service
       │    └─ node dist/index.js gateway --bind lan --port 18789
       │    └─ WorkingDirectory: /home/filipefernandes/openclaw
       │    └─ State: /home/filipefernandes/.openclaw
       │    └─ Env: /etc/openclaw/openclaw.env
       │
       ├─ systemd: openclaw-sentinel.service
       │    └─ node dist/index.js
       │    └─ WorkingDirectory: /home/filipefernandes/sentinel
       │    └─ Env: /etc/openclaw/sentinel.env
       │
       └─ Docker (for Mission Control only)
            └─ mc-control-api, mc-ui, mc-mission-agent, mc-postgres
```

## Security Posture

- **Process isolation:** Runs as `filipefernandes` user (non-root)
- **systemd hardening:**
  - `NoNewPrivileges=true`
  - `ProtectSystem=strict`
  - `ProtectKernelTunables=true`, `ProtectKernelModules=true`, `ProtectControlGroups=true`
  - `PrivateTmp=true`
- **Resource limits (systemd cgroups):**
  - Gateway: `MemoryMax=2G`, `CPUQuota=200%`, `TasksMax=256`
  - Sentinel: `MemoryMax=512M`, `CPUQuota=100%`, `TasksMax=64`
- **Secret management:** Env files at `/etc/openclaw/` with `chmod 600`
- **Gateway auth token** required for all connections

## Prerequisites

- OrbStack installed and running
- `orb` CLI available on macOS host

## Quick Start

```bash
# Start the VM (if stopped)
make vm-start

# Start services
make up

# Verify
make ps
make verify-local
```

## Makefile (Operator Interface)

```bash
make help          # Show all available commands
```

### VM Lifecycle

```bash
make vm-start      # Start the VM
make vm-stop       # Stop the VM
make vm-restart    # Restart the VM
make vm-info       # Show VM info (IP, disk, etc.)
make vm-ssh        # Open SSH session into the VM
```

### Service Lifecycle

```bash
make up            # Start gateway + sentinel
make down          # Stop gateway + sentinel
make restart       # Restart gateway
make restart-all   # Restart all services
make ps            # Show service status
make logs          # Tail gateway logs
make logs-sentinel # Tail sentinel logs
make logs-all      # Tail all service logs
```

### Update & Build

```bash
make pull          # Git pull + pnpm install + build
make build         # Rebuild from source only
make restart       # Apply after build
```

### Health & Diagnostics

```bash
make status        # openclaw status --all
make health        # openclaw health --json
make doctor        # openclaw doctor
make audit         # openclaw security audit --deep
make verify-local  # Check port + HTTP response
```

### Auth & UI

```bash
make token-copy        # Copy gateway token to macOS clipboard
make token-sync        # Sync config file token from env
make dashboard-url     # Print tokenized Control UI URL
make devices-list      # List paired/pending devices
make devices-approve REQUEST_ID=<id>
make devices-revoke DEVICE_ID=<id>
```

### Backup & Restore

```bash
make backup            # Create state backup archive
make restore-latest    # Validate latest backup
make restore ARCHIVE=backups/openclaw-state-YYYYMMDD-HHMMSS.tar.gz
```

### Maintenance

```bash
make monthly           # Pull, rebuild, restart, full diagnostics
make full-check        # ps, status, health, audit, verify-local
```

## Multi-Agent Support

```bash
make agents-list
make agents-list-bindings
make agent-add AGENT_ID=work
make agent-add AGENT_ID=coding WORKSPACE=coding MODEL="openai/gpt-4o" BINDS="discord:coding,telegram:ops"
make agent-bind AGENT_ID=coding BINDS="discord:coding,telegram:ops"
make agent-unbind AGENT_ID=coding BINDS="discord:coding"
make agent-unbind-all AGENT_ID=coding
make agent-delete AGENT_ID=coding
make agent-identity AGENT_ID=coding NAME="Coding" THEME="dark" EMOJI="robot" AVATAR="https://..."
```

## VM Internal Layout

| Path | Purpose |
|---|---|
| `/home/filipefernandes/openclaw/` | OpenClaw source repo (built from source) |
| `/home/filipefernandes/.openclaw/` | OpenClaw state (config, agents, workspaces) |
| `/home/filipefernandes/sentinel/` | Sentinel bot |
| `/etc/openclaw/openclaw.env` | Gateway environment variables (secrets) |
| `/etc/openclaw/sentinel.env` | Sentinel environment variables |
| `/etc/systemd/system/openclaw-gateway.service` | Gateway systemd unit |
| `/etc/systemd/system/openclaw-sentinel.service` | Sentinel systemd unit |

## Editing Environment Variables

```bash
# Edit from macOS via orb
orb -m aisquad -u root vim /etc/openclaw/openclaw.env

# Then restart the service
make restart
```

## Common Issues

### Gateway not listening after VM restart

The services are enabled (`systemctl enable`) and start automatically with the VM. If not:

```bash
make up
make verify-local
```

### Token mismatch

Ensure the token in `/etc/openclaw/openclaw.env` matches what's in `~/.openclaw/openclaw.json`:

```bash
make token-sync
make restart
```

### Bonjour name conflicts

The gateway logs may show repeated `[bonjour] gateway name conflict resolved` messages. This is harmless — it's mDNS name negotiation.

## Routine Operations

See `OPERATIONS_RUNBOOK.md` for:
- Monthly maintenance checklist
- Token rotation procedure
- Emergency lockout response

## Migration History

This project was originally a Docker Compose deployment. It was migrated to a native systemd service inside an OrbStack Linux VM for:
- Better process visibility and control
- Native systemd resource management
- Simpler debugging (no Docker layer)
- Direct filesystem access for state management
