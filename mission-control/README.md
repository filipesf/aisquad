# Mission Control

Multi-agent task orchestration system. Agents register, receive heartbeats, get assigned tasks through a lease-based mechanism, and communicate via comments with @-mention notifications — all coordinated through a Fastify API, background workers, and a React dashboard.

## Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌────────────┐
│  Mission UI │────▶│   Control API    │────▶│ PostgreSQL │
│  (React 19) │     │   (Fastify 5)    │────▶│   (pg 16)  │
└─────────────┘     └──────────────────┘     └────────────┘
                           │    ▲                    ▲
                      SSE  │    │                    │
                           ▼    │              ┌─────┴──────┐
                    ┌──────────────────┐       │   Redis 7  │
                    │     Workers      │       └────────────┘
                    │ (4 bg processes) │
                    └──────────────────┘
```

| Component             | Package           | Stack                                              |
| --------------------- | ----------------- | -------------------------------------------------- |
| **Control API**       | `@mc/control-api` | Fastify 5, pg, ioredis, zod                        |
| **Mission UI**        | `@mc/mission-ui`  | React 19, React Router 7, Tailwind CSS v4, Vite 6  |
| **Workers**           | `@mc/workers`     | Node.js, pg (4 independent processes)              |
| **Shared**            | `@mc/shared`      | Zod schemas, TypeScript types, QueuePort interface |
| **Integration Tests** | `@mc/integration` | Vitest, pg, ioredis                                |

## Monorepo Structure

```
mission-control/
├── apps/
│   ├── control-api/          # HTTP API server
│   │   └── src/
│   │       ├── routes/       # 7 route modules (health, agents, tasks, assignments, comments, notifications, activities)
│   │       ├── domain/       # Business logic (agents, tasks, assignments, comments, notifications, activities, subscriptions)
│   │       ├── middleware/    # Correlation ID + idempotency
│   │       ├── services/     # DB pool, Redis client, heartbeat service
│   │       └── __tests__/    # Unit tests (9 files)
│   ├── mission-ui/           # Operator dashboard
│   │   └── src/
│   │       ├── pages/        # Dashboard, TaskBoard, TaskDetail, AgentDetail
│   │       ├── components/   # ActivityFeed, StatusBadge, TimeAgo
│   │       ├── hooks/        # usePolling, useActivityStream
│   │       ├── lib/          # API client + SSE factory
│   │       └── types/        # Domain type definitions
│   └── workers/              # Background processes
│       └── src/
│           ├── offline-detector.ts
│           ├── assigner.ts
│           ├── notification-dispatcher.ts
│           └── daily-standup.ts
├── packages/
│   └── shared/               # Zod schemas, types, QueuePort interface
├── db/
│   ├── migrate.js            # Custom SQL migration runner
│   ├── seed.ts               # Demo data (3 agents, 10 tasks, comments, notifications)
│   └── migrations/
│       ├── 001_init.sql      # 8 tables, 15 indexes, 6 FKs
│       └── 002_assignment_invariants.sql
├── infra/
│   └── nginx.conf            # nginx config for Dockerized UI
├── ops/
│   ├── backup.sh             # pg_dump with verification
│   ├── restore.sh            # Restore with dry-run + confirmation
│   └── runbooks/
│       └── local-vm-operations.md
├── tests/
│   ├── integration/          # 8 test files, 31 tests
│   └── e2e/                  # (empty, reserved)
└── thoughts/                 # Internal notes (gitignored)
```

## Getting Started

### Prerequisites

- Docker and Docker Compose
- (Optional) Node.js (ES2022+) and pnpm 10.17+ for local development

### Quick Start (Docker)

One command starts everything — Postgres, Redis, migrations, API, workers, and the UI:

```bash
docker compose up -d
```

Check status:

```bash
docker compose ps
```

Verify:

```bash
curl http://localhost:3000/health
# → {"status":"ok","db":true,"redis":true}

open http://localhost:5173
```

To include OpenClaw workers:

```bash
docker compose --profile openclaw up -d
```

### Local Development (without Docker for apps)

If you prefer hot reload during development, run infrastructure in Docker and apps bare:

```bash
# Start only Postgres + Redis
docker compose up -d postgres redis

# Install dependencies
pnpm install

# Build the shared package
pnpm --filter @mc/shared build

# Run database migrations
pnpm db:migrate

# Start all apps in parallel (with hot reload)
pnpm dev
```

Or start services individually:

```bash
pnpm --filter @mc/control-api dev     # API on port 3000
pnpm --filter @mc/mission-ui dev      # UI on port 5173
pnpm --filter @mc/workers assigner    # Task assigner
pnpm --filter @mc/workers offline-detector
pnpm --filter @mc/workers notification-dispatcher
```

## API Reference

### Agents

| Method | Path                        | Description                                            |
| ------ | --------------------------- | ------------------------------------------------------ |
| `POST` | `/agents`                   | Register a new agent                                   |
| `GET`  | `/agents`                   | List all agents                                        |
| `GET`  | `/agents/:id`               | Get agent details                                      |
| `POST` | `/agents/:id/heartbeat`     | Send heartbeat (with optional `sequence_id` for dedup) |
| `GET`  | `/agents/:id/notifications` | Get agent's notifications                              |
| `GET`  | `/agents/:id/assignments`   | Get agent's active assignments                         |

### Tasks

| Method  | Path                     | Description                              |
| ------- | ------------------------ | ---------------------------------------- |
| `POST`  | `/tasks`                 | Create a task (starts in `queued` state) |
| `GET`   | `/tasks`                 | List tasks (optional `?state=` filter)   |
| `GET`   | `/tasks/:id`             | Get task with current assignment         |
| `PATCH` | `/tasks/:id/state`       | Transition task state                    |
| `GET`   | `/tasks/:id/assignments` | Assignment history for a task            |
| `POST`  | `/tasks/:id/comments`    | Post a comment (`?author_id=` required)  |
| `GET`   | `/tasks/:id/comments`    | List comments for a task                 |

### Assignments

| Method | Path                        | Description                     |
| ------ | --------------------------- | ------------------------------- |
| `GET`  | `/assignments/:id`          | Get assignment details          |
| `POST` | `/assignments/:id/accept`   | Accept an offered assignment    |
| `POST` | `/assignments/:id/complete` | Complete an accepted assignment |

### Notifications & Activities

| Method | Path                     | Description                                  |
| ------ | ------------------------ | -------------------------------------------- |
| `POST` | `/notifications/:id/ack` | Acknowledge a notification                   |
| `GET`  | `/activities`            | List recent activities (`?limit=` up to 200) |
| `GET`  | `/activities/stream`     | SSE stream of real-time activities           |

## Core Concepts

### Task State Machine

```
queued ──────▶ assigned ──────▶ in_progress ──────▶ review ──────▶ done
  ▲              │  ▲              │                  │
  │              ▼  │              ▼                  ▼
  └──────────── blocked ◀─────────┘──────────────────┘
```

Valid transitions:

| From          | To                                            |
| ------------- | --------------------------------------------- |
| `queued`      | `assigned`                                    |
| `assigned`    | `in_progress`, `blocked`, `queued`            |
| `in_progress` | `review`, `blocked`                           |
| `review`      | `done`, `blocked`, `in_progress`              |
| `blocked`     | `queued`, `assigned`, `in_progress`, `review` |
| `done`        | _(terminal)_                                  |

### Assignment Lifecycle

Assignments use a **lease-based model** with a configurable TTL (default 30s):

1. **Offered** — assigner picks a queued task and an eligible online agent; creates assignment with `lease_expires_at`
2. **Accepted** — agent accepts within the lease window; task moves to `in_progress`
3. **Completed** — agent finishes work; task moves to `review`
4. **Expired** — lease expires without acceptance; task returns to `queued` for reassignment

A **unique partial index** (`ux_assignments_active_task`) on `(task_id) WHERE status IN ('offered', 'accepted', 'started')` guarantees that no task has more than one active assignment at any time.

### Agent Heartbeat Protocol

- Agents send periodic heartbeats with an optional `sequence_id`
- First heartbeat transitions an agent from `offline` → `online`
- Subsequent heartbeats update `last_seen_at`
- The offline-detector worker marks agents as `offline` when `3 × heartbeat_interval_ms` elapses without a heartbeat
- Sequence-based dedup via Redis SET NX (60s TTL) prevents duplicate processing

### Comment → Notification Pipeline

1. Agent posts a comment on a task
2. Author is auto-subscribed to the task
3. `@mentions` in the comment body are parsed and resolved to agent IDs
4. Mentioned agents are auto-subscribed to the task
5. Notifications are enqueued for all subscribers except the author
6. Redis dedup (5s TTL) prevents duplicate notifications per source
7. The notification-dispatcher worker delivers notifications to online agents with exponential backoff (up to 5 retries)

## Workers

Four independent background processes that poll PostgreSQL:

| Worker                      | Interval                 | Function                                                                                             |
| --------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------- |
| **Offline Detector**        | 10s (`OFFLINE_POLL_MS`)  | Marks agents as offline when heartbeats stop (3× interval threshold)                                 |
| **Assigner**                | 10s (`ASSIGNER_POLL_MS`) | Expires stale leases, then matches queued tasks to online agents by capability                       |
| **Notification Dispatcher** | 5s (`NOTIF_POLL_MS`)     | Delivers queued notifications to online agents; retries with exponential backoff                     |
| **Daily Standup**           | one-shot                 | Generates a digest of the last 24h: tasks completed/blocked/created, agent outages, assignment churn |

Workers are stateless — they can be killed and restarted without data loss. All state lives in PostgreSQL.

## OpenClaw Integration (v1)

Mission Control supports optional integration with an [OpenClaw](https://github.com/flare/openclaw) AI gateway. When enabled, OpenClaw-backed agents can be kept online via a heartbeat bridge and receive task assignments dispatched to the OpenClaw `/hooks/agent` endpoint.

### v1 Scope

- **Worker-pull only**: Mission Control dispatches to OpenClaw. No inbound callbacks from OpenClaw.
- **Identity mapping**: OpenClaw agent metadata is stored in the `agents.capabilities.openclaw` JSON field.
- **Comment-first output**: OpenClaw responses are persisted as Mission Control task comments. External channel delivery (Discord, Slack, etc.) is disabled by default.

### Enabling

Set the following environment variables:

```bash
OPENCLAW_ENABLED=true
OPENCLAW_GATEWAY_URL=http://localhost:8080   # Your OpenClaw gateway URL
OPENCLAW_GATEWAY_TOKEN=your-hooks-token       # Bearer token for /hooks/agent
```

When `OPENCLAW_ENABLED=true`, the workers will fail fast on startup if `OPENCLAW_GATEWAY_URL` or `OPENCLAW_GATEWAY_TOKEN` are missing.

With `OPENCLAW_ENABLED=false` (the default), all OpenClaw-related behavior is inert — no workers start, no dispatches occur.

### Agent Registry Sync

Fleet Status reflects rows in Mission Control's `agents` table. To keep it aligned with the OpenClaw VM agent list, run:

```bash
pnpm agents:sync-openclaw
```

This sync command:

- Reads `agents.list` from `~/.openclaw/openclaw.json` in the VM (via `orb`)
- Creates missing Mission Control agents
- Updates existing synced agent metadata (`name`, `session_key`, `capabilities.openclaw`)
- Disables stale OpenClaw mappings that no longer exist in OpenClaw
- Sends heartbeat for synced agents so Fleet Status transitions to `online`

Optional environment overrides:

- `OPENCLAW_VM` (default: `aisquad`)
- `OPENCLAW_STATE_PATH` (default: `/home/filipefernandes/.openclaw/openclaw.json`)
- `CONTROL_API_URL` (default: `http://localhost:3000`)

### Output Handling

OpenClaw responses are persisted as **Mission Control task comments** — the dispatcher calls `POST /tasks/:id/comments?author_id={agentId}` on the Control API. This means:

- The agent is auto-subscribed to the task
- `@mentions` in the response trigger the standard notification pipeline
- Comments appear in the task detail UI immediately
- External channel delivery (Discord, Slack, etc.) is **not** enabled in v1 — all output stays within Mission Control

If the comment POST fails after a successful dispatch, the failure is logged but the dispatch is still recorded as succeeded. The response text is preserved in the `openclaw_dispatch_attempts.response_excerpt` column for debugging.

### Per-Agent Configuration

Agents are linked to OpenClaw by setting `capabilities.openclaw` during registration:

```json
{
  "name": "code-reviewer",
  "session_key": "code-reviewer-01",
  "capabilities": {
    "openclaw": {
      "enabled": true,
      "agentName": "code-reviewer",
      "agentId": "oc-agent-uuid"
    }
  }
}
```

## Middleware

### Correlation ID

Every request gets an `x-correlation-id` header — propagated from the incoming request or auto-generated as a UUID.

### Idempotency

Write requests (`POST`, `PATCH`, `PUT`, `DELETE`) with an `Idempotency-Key` header get response caching in Redis (24h TTL). Repeated requests with the same key return the cached response. Non-2xx responses are not cached, allowing retries.

## Database

8 tables, 15 indexes, enforced by CHECK constraints and foreign keys (all `ON DELETE CASCADE`):

| Table           | Purpose                                                        |
| --------------- | -------------------------------------------------------------- |
| `agents`        | Agent registry with status, capabilities, heartbeat config     |
| `tasks`         | Task queue with state machine, priority, required capabilities |
| `assignments`   | Lease-based task-to-agent assignments                          |
| `notifications` | Notification queue with retry tracking                         |
| `activities`    | Append-only activity log (event sourcing)                      |
| `comments`      | Task comments with @-mention support                           |
| `subscriptions` | Agent-to-task subscription mapping                             |
| `_migrations`   | Migration tracking                                             |

Run migrations with:

```bash
pnpm db:migrate    # Applies pending SQL migrations from db/migrations/
pnpm db:seed       # Seeds demo data (3 agents, 10 tasks, comments, notifications)
```

## Dashboard

The Mission UI at `http://localhost:5173` provides:

- **Dashboard** (`/`) — Fleet status grid with online/offline indicators, task state counters, real-time activity feed via SSE
- **Task Board** (`/tasks`) — Kanban board with drag-and-drop state transitions and inline task creation
- **Task Detail** (`/tasks/:id`) — Assignment history, comments with @-mention autocomplete
- **Agent Detail** (`/agents/:id`) — Agent info, active assignments, notification inbox with acknowledge

Data is fetched via polling (5s interval) and SSE streaming. No external state library — all state is component-local via React hooks.

## Testing

```bash
# Unit tests (control-api + mission-ui)
pnpm test

# Integration tests (requires running API + Postgres + Redis)
pnpm test:integration
```

### Unit Tests

- **Control API** — 9 test files covering: health endpoint, agent status transitions, heartbeat service with Redis dedup, task state machine (all valid/invalid transitions), correlation ID middleware, idempotency middleware, subscription logic, notification lifecycle with retries, @-mention parsing
- **Mission UI** — 5 test files covering: ActivityFeed rendering, StatusBadge styling, TimeAgo formatting, Dashboard with mocked API, TaskBoard with mocked API

### Integration Tests

31 tests against a live API + database, run sequentially (`fileParallelism: false`):

- **Heartbeat lifecycle** — registration, offline→online transition, sequence dedup, offline detection, recovery
- **Assignment lifecycle** — task creation, state transitions, full offer→accept→complete flow, lease expiry and requeue
- **Chaos scenarios** — rapid agent churn (50 concurrent heartbeats), concurrent assignment races (5 agents, 1 task), worker restart simulation
- **Load testing** — 200 tasks with zero double-active assignment verification
- **Notification flow** — comment→subscribe→notify pipeline, @-mention resolution, dedup, acknowledgement
- **Reliability** — 3 agents + 20 tasks with crash recovery and reassignment, idempotency key replay, correlation ID propagation

## Operations

### Backup & Restore

```bash
# Create a backup
./ops/backup.sh

# Restore from latest backup (interactive confirmation)
./ops/restore.sh

# Restore from specific file
./ops/restore.sh ops/backups/mission_control_20260303_013107.sql

# Dry-run validation only
./ops/restore.sh --dry-run
```

### Infrastructure

```bash
# Start everything (API + UI + workers + Postgres + Redis)
docker compose up -d

# Start with OpenClaw workers
docker compose --profile openclaw up -d

# Stop (preserving data)
docker compose down

# Stop and wipe volumes
docker compose down -v

# View logs
docker compose logs -f

# Rebuild after code changes
docker compose up -d --build
```

## Environment Variables

| Variable                    | Default                 | Used By                 |
| --------------------------- | ----------------------- | ----------------------- |
| `PGHOST`                    | `localhost`             | API, Workers            |
| `PGPORT`                    | `5432`                  | API, Workers            |
| `PGUSER`                    | `postgres`              | API, Workers            |
| `PGPASSWORD`                | `postgres`              | API, Workers            |
| `PGDATABASE`                | `mission_control`       | API, Workers            |
| `REDIS_HOST`                | `localhost`             | API                     |
| `REDIS_PORT`                | `6379`                  | API                     |
| `HOST`                      | `0.0.0.0`               | API                     |
| `PORT`                      | `3000`                  | API                     |
| `LOG_LEVEL`                 | `info`                  | API                     |
| `OFFLINE_POLL_MS`           | `10000`                 | Offline Detector        |
| `ASSIGNER_POLL_MS`          | `10000`                 | Assigner                |
| `LEASE_SECONDS`             | `30`                    | Assigner                |
| `NOTIF_POLL_MS`             | `5000`                  | Notification Dispatcher |
| `OPENCLAW_ENABLED`          | `false`                 | Workers (OpenClaw)      |
| `OPENCLAW_GATEWAY_URL`      | —                       | Workers (OpenClaw)      |
| `OPENCLAW_GATEWAY_TOKEN`    | —                       | Workers (OpenClaw)      |
| `OPENCLAW_DEFAULT_MODEL`    | _(optional)_            | Workers (OpenClaw)      |
| `OPENCLAW_DISPATCH_POLL_MS` | `10000`                 | Workers (OpenClaw)      |
| `CONTROL_API_URL`           | `http://localhost:3000` | Workers (OpenClaw)      |

## Scripts

| Command                 | Description                           |
| ----------------------- | ------------------------------------- |
| `pnpm dev`              | Start all apps in parallel (dev mode) |
| `pnpm build`            | Build all packages                    |
| `pnpm lint`             | Lint all packages                     |
| `pnpm typecheck`        | Type-check all packages               |
| `pnpm test`             | Run unit tests across all packages    |
| `pnpm test:integration` | Run integration test suite            |
| `pnpm db:migrate`       | Apply pending database migrations     |
| `pnpm db:seed`          | Seed demo data                        |

## Tech Stack

| Layer           | Technology                           |
| --------------- | ------------------------------------ |
| Language        | TypeScript 5.8 (ES2022, strict mode) |
| Package Manager | pnpm 10.17 (workspace monorepo)      |
| API Framework   | Fastify 5                            |
| Frontend        | React 19 + React Router 7            |
| Styling         | Tailwind CSS v4                      |
| Bundler         | Vite 6                               |
| Validation      | Zod 3                                |
| Database        | PostgreSQL 16                        |
| Cache/Dedup     | Redis 7 (ioredis)                    |
| Testing         | Vitest 3 + Testing Library           |
| Linting         | ESLint 9 + typescript-eslint         |
| Formatting      | Prettier 3                           |
