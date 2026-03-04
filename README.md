# Aisquad Monorepo

Single repository that groups all local services used in the agent operations stack.

## Services

- `mission-control/` - task orchestration API/UI/workers.
- `openclaw/` - versioned mirror of selected `.openclaw` state and config.
- `sentinel/` - Discord infrastructure bot and OpenClaw trigger layer.
- `vm/` - OrbStack VM operations for OpenClaw/Sentinel runtime.

## Root Command Surface

Use the root `Makefile` for cross-service operations:

```bash
make help
make up
make status
make down
```

## Runbooks

| Scope                                                       | File                         |
| ----------------------------------------------------------- | ---------------------------- |
| Cross-service daily ops                                     | `RUNBOOK.md`                 |
| VM maintenance, token rotation, emergency procedures        | `vm/RUNBOOK.md`              |
| Sentinel deploy, service management, troubleshooting        | `sentinel/RUNBOOK.md`        |
| Mission Control Docker ops, backup/restore, troubleshooting | `mission-control/RUNBOOK.md` |

## Notes

- Service-specific workflows remain in their own folders.
- `mission-control` keeps its internal pnpm workspace setup.
- `openclaw/workspace` and `openclaw/workspace-corven` remain excluded from root git tracking.
