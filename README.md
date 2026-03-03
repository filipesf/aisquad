# Squadai Monorepo

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

## Notes

- Service-specific workflows remain in their own folders.
- `mission-control` keeps its internal pnpm workspace setup.
- `openclaw/workspace` and `openclaw/workspace-corven` remain excluded from root git tracking.

## Migration Plan

See `MONOREPO_MIGRATION_PLAN.md` for the migration steps and constraints used for this repository.
