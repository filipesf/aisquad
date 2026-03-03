# Aisquad Monorepo Migration Plan

## Goal

Turn this folder into one top-level git repository that contains and operates:

- `mission-control` (orchestration API/UI/workers)
- `openclaw` (versioned mirror of `.openclaw` state)
- `sentinel` (Discord infrastructure bot)
- `vm` (OrbStack VM operations and runbooks)

The target is a single command surface and one source-of-truth repository for operations.

---

## Current State Snapshot

- Root (`aisquad/`) is **not** a git repo.
- Each service folder currently has its own `.git`:
  - `mission-control/.git`
  - `openclaw/.git`
  - `sentinel/.git`
  - `vm/.git`
- `mission-control` already contains an internal pnpm monorepo for its own apps/packages.
- Cross-service integration already exists:
  - Sentinel triggers OpenClaw via gateway WS/HTTP hooks.
  - Mission Control optional workers dispatch tasks to OpenClaw.
  - VM Makefile controls OpenClaw/Sentinel services in OrbStack VM.

---

## Target Repository Shape

Keep the same top-level directories:

```text
aisquad/
├── mission-control/
├── openclaw/
├── sentinel/
├── vm/
├── .gitignore
├── Makefile
└── README.md
```

Notes:

- Existing per-service layouts remain intact.
- Existing service-local package managers remain intact (`pnpm` in mission-control, `npm` in sentinel).
- Root adds orchestration docs and helper commands only.

---

## Migration Strategy

Use a **new root git repository** and import each service directory into it.

Two valid import modes:

1. **Snapshot import (simpler)**
   - Copy current working trees into root repo.
   - No commit history from child repos is preserved.

2. **History-preserving import (preferred when history matters)**
   - Import each child repository history under its folder path (for example using subtree/filter-repo flow).
   - Maintains commit provenance per service.

This plan assumes **history-preserving import**.

---

## Guardrails Before Migration

1. Freeze writes during migration window.
2. Ensure each child repo is in a known state (commit/stash as needed).
3. Remove nested git metadata from imported working trees (`.git` directories) once imported.
4. Confirm secret files remain ignored:
   - `mission-control/.env`, `mission-control/.env.local`
   - `sentinel/.env`, `sentinel/config.json`
   - `vm/.env`, `vm/.env.local`
   - `openclaw/openclaw.json`, `openclaw/credentials/`, `openclaw/identity/`, `openclaw/devices/`
5. Confirm nested workspace repos under `openclaw/workspace` and `openclaw/workspace-corven` policy:
   - keep as nested repos and ignore in root, or
   - import as regular directories and remove their `.git` folders.

---

## Execution Plan

### Phase 1 - Prepare Root Monorepo

1. Initialize git at `aisquad/`.
2. Create root `.gitignore` to cover:
   - macOS files (`.DS_Store`)
   - service-local env/secrets that must never be tracked
   - heavy runtime outputs not already ignored in subfolders
3. Add root `README.md` describing the four services and startup model.

### Phase 2 - Import Repositories

1. Import `mission-control` history into `mission-control/` path.
2. Import `openclaw` history into `openclaw/` path.
3. Import `sentinel` history into `sentinel/` path.
4. Import `vm` history into `vm/` path.
5. Validate imported tree matches current files.

### Phase 3 - Normalize Repository Boundaries

1. Remove child `.git` directories so root git is authoritative.
2. Resolve handling of nested repos inside `openclaw/workspace*`.
3. Run `git status` at root and verify expected tracked/untracked sets.

### Phase 4 - Root Operations Layer

1. Add root `Makefile` with delegated commands, for example:
   - `make mc-up` -> runs Mission Control docker compose in `mission-control/`
   - `make sentinel-deploy` -> runs `sentinel/deploy.sh`
   - `make vm-up` -> runs `make up` in `vm/`
   - `make up` -> documented sequence for full environment bootstrap
2. Add root runbook for local startup/shutdown order and health checks.

### Phase 5 - Verification

1. Mission Control boots (`docker compose ps`, API health endpoint).
2. Sentinel starts and can connect to OpenClaw gateway.
3. VM Make targets still execute OrbStack/systemd operations.
4. OpenClaw mirror files tracked as expected; secrets remain untracked.
5. Root repo clean after test cycle.

---

## Unified Runtime Model (from one place)

Recommended operational sequence from root:

1. Start VM services (`vm`).
2. Start Mission Control stack (`mission-control`).
3. Start/Deploy Sentinel (`sentinel`) if not already running in VM.
4. Validate integration:
   - Mission Control health endpoint
   - OpenClaw gateway reachable
   - Sentinel -> OpenClaw trigger path operational

This preserves current architecture while centralizing control in one repository.

---

## Risks and Handling

1. **Nested git collisions**
   - Explicitly handle `openclaw/workspace` and `openclaw/workspace-corven`.
2. **Accidental secret tracking during import**
   - Establish root ignore rules before first root commit.
3. **Command drift after consolidation**
   - Use root wrappers that call existing service commands instead of replacing them.
4. **Dirty working tree import ambiguity**
   - Capture known state in each child repo before migration.

---

## Deliverables

After migration, the repository should include:

1. One root `.git` in `aisquad/`
2. One root `README.md` describing all services and orchestration
3. One root `Makefile` exposing cross-service commands
4. Existing service docs and command surfaces preserved in place
5. Explicit policy for `openclaw` nested workspaces and secrets

---

## Completion Criteria

Migration is complete when all items are true:

- `git status` works from `aisquad/`
- No child `.git` directories remain (except any intentionally retained nested workspace policy)
- `mission-control`, `openclaw`, `sentinel`, and `vm` are visible and tracked from root
- A single root command surface can start/check the integrated environment
- Secret-bearing files remain untracked
