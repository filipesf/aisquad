# Aisquad Runbook

Operational runbook for running all services from the monorepo root.

## Scope

This runbook orchestrates:

- `vm/` for OpenClaw + Sentinel services inside OrbStack VM
- `mission-control/` for API/UI/workers stack
- `sentinel/` deployment/command registration helpers
- `openclaw/` as versioned state/config mirror

## Prerequisites

- Docker and Docker Compose
- OrbStack and `orb` CLI
- Access to VM `aisquad`

## Daily Operations

### Start Everything

```bash
make up
```

This runs:

1. `make vm-up` -> starts VM OpenClaw/Sentinel services
2. `make mc-up` -> starts Mission Control stack

### Check Status

```bash
make status
```

This runs:

- `make vm-ps`
- `make mc-ps`

### Stop Mission Control

```bash
make down
```

### Start Mission Control with OpenClaw workers

```bash
make mc-up-openclaw
```

## Sentinel Operations

### Deploy Sentinel to VM runtime

```bash
make sentinel-deploy
```

### Register/refresh slash commands

```bash
make sentinel-commands
```

## Troubleshooting Quick Commands

```bash
make mc-logs
make vm-ps
```

For deeper VM operations and maintenance, use `vm/README.md` and `vm/RUNBOOK.md`.

For Mission Control service-level operations, use `mission-control/RUNBOOK.md`.
