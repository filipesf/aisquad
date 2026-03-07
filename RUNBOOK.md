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

1. `make vm-up` — starts VM OpenClaw/Sentinel services
2. `make mc-up` — starts Mission Control stack
3. `make links` — prints operational URLs

### Check Status

```bash
make status
```

This runs `make vm-ps` + `make mc-ps` + `make links`.

### Print Operational Links

```bash
make links
```

Prints Mission Control UI, API health, OpenClaw VM endpoint, and dashboard URL.

### Update Everything (pull + rebuild + restart)

```bash
make update
```

This runs:

1. `git pull`
2. `make -C vm pull` — updates OpenClaw in VM
3. `bash sentinel/deploy.sh` — rebuilds and redeploys Sentinel
4. Rebuilds Mission Control Docker images
5. Full restart via `make down && make up`

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

## Runbooks

| Scope                                                       | File                         |
| ----------------------------------------------------------- | ---------------------------- |
| VM maintenance, token rotation, emergency procedures        | `vm/RUNBOOK.md`              |
| Sentinel deploy, service management, troubleshooting        | `sentinel/RUNBOOK.md`        |
| Mission Control Docker ops, backup/restore, troubleshooting | `mission-control/RUNBOOK.md` |
