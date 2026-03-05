# Mission Control Runbook

> Multi-agent task orchestration stack. All services run as Docker containers managed by `docker-compose.yml` inside `mission-control/`.

## Quick Reference

| Action                      | Command                                        |
| --------------------------- | ---------------------------------------------- |
| Start everything            | `docker compose up -d`                         |
| Start with OpenClaw workers | `docker compose --profile openclaw up -d`      |
| Stop (preserve data)        | `docker compose down`                          |
| Stop + wipe all data        | `docker compose down -v`                       |
| Container status            | `docker compose ps`                            |
| All logs                    | `docker compose logs -f`                       |
| Specific service logs       | `docker compose logs -f control-api`           |
| API health                  | `curl -s http://localhost:3000/health \| jq .` |
| Rebuild after code changes  | `docker compose up -d --build`                 |
| Backup database             | `bash ops/backup.sh`                           |
| Restore latest backup       | `bash ops/restore.sh`                          |
| Run migrations              | `pnpm db:migrate`                              |
| Sync OpenClaw agents        | `pnpm agents:sync-openclaw`                    |

---

## System Overview

All services run from `mission-control/docker-compose.yml`. Commands are run from the `mission-control/` directory.

### Core services (always started)

| Service name              | Container               | Port | Description                                                 |
| ------------------------- | ----------------------- | ---- | ----------------------------------------------------------- |
| `postgres`                | `mctl-postgres`         | 5432 | PostgreSQL 16 — primary datastore                           |
| `redis`                   | `mctl-redis`            | 6379 | Redis 7 — idempotency cache, dedup keys                     |
| `migrate`                 | `mctl-migrate`          | —    | One-shot migration runner; exits after completing           |
| `control-api`             | `mctl-api`              | 3000 | Fastify 5 REST API                                          |
| `mission-ui`              | `mctl-ui`               | 5173 | React 19 dashboard (nginx, static build)                    |
| `offline-detector`        | `mctl-offline-detector` | —    | Marks agents offline when heartbeats stop                   |
| `assigner`                | `mctl-assigner`         | —    | Expires stale leases; assigns queued tasks to online agents |
| `notification-dispatcher` | `mctl-notif-dispatcher` | —    | Delivers queued notifications with exponential backoff      |
| `daily-standup`           | `mctl-daily-standup`    | —    | One-shot: generates 24h activity digest                     |

### OpenClaw profile (optional)

Started with `--profile openclaw`. Requires `OPENCLAW_ENABLED=true`, `OPENCLAW_GATEWAY_URL`, and `OPENCLAW_GATEWAY_TOKEN` in `.env`.

| Service name                | Container                  | Description                                                                                                                                                                |
| --------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `openclaw-heartbeat-bridge` | `mctl-openclaw-heartbeat`  | Sends periodic heartbeats for OpenClaw-backed agents to keep them `online` in Mission Control                                                                              |
| `openclaw-dispatcher`       | `mctl-openclaw-dispatcher` | Polls for offered assignments on OpenClaw agents; dispatches via `POST /hooks/agent`; tracks attempts in `openclaw_dispatch_attempts` (max 5 retries, exponential backoff) |

**Service name** (e.g. `control-api`, `offline-detector`) is used with `docker compose logs/stop/restart`.
**Container name** (e.g. `mctl-api`, `mctl-offline-detector`) is used with `docker exec`.

**nginx proxy:** The UI container proxies `/api/` → `http://control-api:3000/` so the dashboard talks to the API without CORS issues.

---

## Starting Services

### Core stack

```bash
docker compose up -d
```

Startup order is enforced via `depends_on` + health checks:

1. `postgres` and `redis` start and become healthy
2. `migrate` runs all pending migrations and exits
3. `control-api`, `mission-ui`, and all workers start

### With OpenClaw workers

```bash
docker compose --profile openclaw up -d
```

Requires in `.env`:

```
OPENCLAW_ENABLED=true
OPENCLAW_GATEWAY_URL=http://aisquad.orb.local:18789
OPENCLAW_GATEWAY_TOKEN=<hooks-bearer-token>
```

After startup, sync Mission Control agents from OpenClaw:

```bash
pnpm agents:sync-openclaw
```

To keep Fleet Status continuously aligned, add a cron job on the host:

```bash
crontab -l > /tmp/mc_cron 2>/dev/null || true
cat <<'EOF' >> /tmp/mc_cron
# BEGIN mission-control openclaw agent sync
* * * * * cd /Users/filipefernandes/Code/squadai/mission-control && pnpm agents:sync-openclaw >> /Users/filipefernandes/Code/squadai/mission-control/ops/logs/openclaw-agent-sync.log 2>&1
# END mission-control openclaw agent sync
EOF
crontab /tmp/mc_cron
```

### Infrastructure only (for local development with hot reload)

```bash
docker compose up -d postgres redis
pnpm install
pnpm --filter @mc/shared build
pnpm db:migrate
pnpm dev   # starts all apps in parallel with hot reload
```

Or start apps individually:

```bash
pnpm --filter @mc/control-api dev      # API on :3000
pnpm --filter @mc/mission-ui dev       # UI on :5173
pnpm --filter @mc/workers assigner
pnpm --filter @mc/workers offline-detector
pnpm --filter @mc/workers notification-dispatcher
```

### Seed demo data

```bash
docker exec mctl-postgres psql -U postgres -d mission_control -c "\dt"  # verify tables exist first
pnpm db:seed   # 3 agents, 10 tasks, comments, notifications
```

### Verify startup

```bash
docker compose ps
curl -s http://localhost:3000/health | jq .
# Expected: {"status":"ok","db":true,"redis":true}
curl -s -o /dev/null -w "%{http_code}" http://localhost:5173
# Expected: 200
```

---

## Stopping Services

```bash
docker compose down           # stop all, preserve volumes (pg_data, redis_data)
docker compose down -v        # stop all + DELETE all data — irreversible
docker compose stop control-api           # stop single service
docker compose stop offline-detector
```

---

## Restarting Services

```bash
docker compose restart control-api       # restart single service
docker compose restart offline-detector

docker compose down && docker compose up -d   # full restart, preserve data

docker compose up -d --build             # rebuild images then restart (after code changes)

docker compose down -v && docker compose up -d  # clean slate — wipes all data
```

---

## Database

### Migrations

```bash
pnpm db:migrate    # apply all pending migrations from db/migrations/

# Check current migration state
docker exec mctl-postgres psql -U postgres -d mission_control -c \
  "SELECT * FROM _migrations ORDER BY name;"

# Re-run migrations (force recreate the migrate container)
docker compose up -d --force-recreate migrate
```

Migration files:

- `001_init.sql` — 8 tables, 15 indexes, 6 FKs (agents, tasks, assignments, notifications, activities, comments, subscriptions, \_migrations)
- `002_assignment_invariants.sql` — partial unique index preventing multiple active assignments per task
- `003_openclaw_dispatch_tracking.sql` — `openclaw_dispatch_attempts` table + 3 indexes
- `004_telemetry.sql` — `telemetry_events` table + telemetry query indexes

### Tables

| Table                        | Purpose                                                                     |
| ---------------------------- | --------------------------------------------------------------------------- |
| `agents`                     | Agent registry with status, capabilities, heartbeat config                  |
| `tasks`                      | Task queue with state machine, priority, required capabilities              |
| `assignments`                | Lease-based task-to-agent assignments                                       |
| `notifications`              | Notification queue with retry tracking                                      |
| `activities`                 | Append-only activity log                                                    |
| `comments`                   | Task comments with @-mention support                                        |
| `subscriptions`              | Agent-to-task subscriptions                                                 |
| `openclaw_dispatch_attempts` | Per-attempt record of OpenClaw dispatches — status, error, response excerpt |
| `telemetry_events`           | Telemetry ingest store for OpenClaw diagnostics events + aggregate columns    |
| `_migrations`                | Migration tracking                                                          |

---

## Workers

Six background processes. All are stateless — they can be killed and restarted without data loss.

| Worker                    | Service name                | Container                  | Poll interval                               | Batch size          |
| ------------------------- | --------------------------- | -------------------------- | ------------------------------------------- | ------------------- |
| Offline Detector          | `offline-detector`          | `mctl-offline-detector`    | `OFFLINE_POLL_MS` (default 10s)             | —                   |
| Assigner                  | `assigner`                  | `mctl-assigner`            | `ASSIGNER_POLL_MS` (default 10s)            | 10 tasks, 10 agents |
| Notification Dispatcher   | `notification-dispatcher`   | `mctl-notif-dispatcher`    | `NOTIF_POLL_MS` (default 5s)                | 50 notifications    |
| Daily Standup             | `daily-standup`             | `mctl-daily-standup`       | one-shot (or loop with `STANDUP_LOOP=true`) | —                   |
| OpenClaw Dispatcher       | `openclaw-dispatcher`       | `mctl-openclaw-dispatcher` | `OPENCLAW_DISPATCH_POLL_MS` (default 10s)   | 20 assignments      |
| OpenClaw Heartbeat Bridge | `openclaw-heartbeat-bridge` | `mctl-openclaw-heartbeat`  | `OPENCLAW_DISPATCH_POLL_MS` (default 10s)   | all OpenClaw agents |

**Offline threshold:** per-agent `heartbeat_interval_ms × 3` (not a global fixed threshold).

**Notification retry:** exponential backoff, `MAX_RETRIES=5`.

**OpenClaw dispatcher retry:** max 5 attempts per assignment, exponential backoff; attempts tracked in `openclaw_dispatch_attempts`.

### Run a worker manually (outside Docker)

```bash
pnpm --filter @mc/workers offline-detector
pnpm --filter @mc/workers assigner
pnpm --filter @mc/workers notification-dispatcher
pnpm --filter @mc/workers daily-standup

# Daily standup in loop mode
STANDUP_LOOP=true pnpm --filter @mc/workers daily-standup
```

---

## Backup and Restore

### Create a backup

```bash
bash ops/backup.sh
# Saves: ops/backups/mission_control_YYYYMMDD_HHMMSS.sql
```

Uses `pg_dump` with verification. The dump file is plain SQL.

### Validate a backup (dry run — no data change)

```bash
bash ops/restore.sh --dry-run
bash ops/restore.sh --dry-run ops/backups/mission_control_20260303_013107.sql
```

### Restore from backup

```bash
bash ops/restore.sh                                              # most recent backup
bash ops/restore.sh ops/backups/mission_control_20260303_013107.sql
# WARNING: drops and recreates the database!
```

---

## OpenClaw Sync

Reads agent list from the OpenClaw VM via `orb` and syncs them into Mission Control's `agents` table:

```bash
pnpm agents:sync-openclaw
```

What it does:

- Reads `agents.list` from `~/.openclaw/openclaw.json` in the VM
- Creates missing Mission Control agents
- Updates existing synced agent metadata (`name`, `session_key`, `capabilities.openclaw`)
- Disables stale OpenClaw mappings no longer in OpenClaw
- Sends heartbeat for synced agents so Fleet Status transitions to `online`

Optional env overrides:

| Variable              | Default                                         |
| --------------------- | ----------------------------------------------- |
| `OPENCLAW_VM`         | `aisquad`                                       |
| `OPENCLAW_STATE_PATH` | `/home/filipefernandes/.openclaw/openclaw.json` |
| `CONTROL_API_URL`     | `http://localhost:3000`                         |

---

## Environment Variables

Template: `mission-control/.env.example`. Copy to `mission-control/.env` and fill in values.

| Variable                    | Default                 | Used by                 | Notes                                      |
| --------------------------- | ----------------------- | ----------------------- | ------------------------------------------ |
| `PGHOST`                    | `localhost`             | API, Workers            | Use `postgres` when running inside Docker  |
| `PGPORT`                    | `5432`                  | API, Workers            |                                            |
| `PGUSER`                    | `postgres`              | API, Workers            |                                            |
| `PGPASSWORD`                | `postgres`              | API, Workers            |                                            |
| `PGDATABASE`                | `mission_control`       | API, Workers            |                                            |
| `REDIS_HOST`                | `localhost`             | API                     | Use `redis` when running inside Docker     |
| `REDIS_PORT`                | `6379`                  | API                     |                                            |
| `HOST`                      | `0.0.0.0`               | API                     |                                            |
| `PORT`                      | `3000`                  | API                     |                                            |
| `LOG_LEVEL`                 | `info`                  | API                     |                                            |
| `CONTROL_API_TELEMETRY_TOKEN` | —                     | API                     | Required bearer token for `/telemetry/*` routes |
| `OFFLINE_POLL_MS`           | `10000`                 | Offline Detector        |                                            |
| `ASSIGNER_POLL_MS`          | `10000`                 | Assigner                |                                            |
| `LEASE_SECONDS`             | `30`                    | Assigner                |                                            |
| `NOTIF_POLL_MS`             | `5000`                  | Notification Dispatcher |                                            |
| `OPENCLAW_ENABLED`          | `false`                 | OpenClaw workers        | Set `true` to activate OpenClaw profile    |
| `OPENCLAW_GATEWAY_URL`      | —                       | OpenClaw workers        | Required when `OPENCLAW_ENABLED=true`      |
| `OPENCLAW_GATEWAY_TOKEN`    | —                       | OpenClaw workers        | Hooks bearer token for `POST /hooks/agent` |
| `OPENCLAW_DEFAULT_MODEL`    | —                       | OpenClaw workers        | Optional model override                    |
| `OPENCLAW_DISPATCH_POLL_MS` | `10000`                 | OpenClaw workers        | Shared by dispatcher + heartbeat bridge    |
| `CONTROL_API_URL`           | `http://localhost:3000` | OpenClaw workers        |                                            |
| `STANDUP_LOOP`              | —                       | Daily Standup           | Set `true` for continuous loop mode        |

**Connection pool limits:** API max 20 connections; each worker max 5 connections.

---

## Health Checks

```bash
# All containers at a glance
docker compose ps

# API health (checks DB + Redis)
curl -s http://localhost:3000/health | jq .
# Expected: {"status":"ok","db":true,"redis":true}

# PostgreSQL
docker exec mctl-postgres pg_isready -U postgres

# Redis
docker exec mctl-redis redis-cli ping
# Expected: PONG

# Specific service logs
docker compose logs --tail=50 control-api
docker compose logs --tail=50 offline-detector
docker compose logs --tail=50 openclaw-dispatcher
```

---

## Failure Recovery

### Worker container crashed

Workers have `restart: unless-stopped` and auto-restart. If stuck:

```bash
docker compose ps
docker compose logs --tail=50 offline-detector
docker compose restart offline-detector
```

No data loss — all state is in PostgreSQL.

### API container won't restart

```bash
docker compose logs --tail=100 control-api
docker compose up -d --force-recreate control-api
curl -s http://localhost:3000/health | jq .
```

### PostgreSQL down

```bash
docker compose ps postgres
docker compose up -d postgres
# Wait for healthy, then check
docker compose ps postgres
# If data is corrupted:
bash ops/restore.sh
```

### Redis down

```bash
docker compose up -d redis
# Redis data loss is non-critical (only caches and dedup keys)
# Services reconnect automatically via ioredis retry logic
```

### Orphaned assignments (task stuck in `assigned` or `in_progress`)

The assigner worker expires stale leases automatically. To check or force-expire:

```bash
# Check for orphaned assignments
docker exec mctl-postgres psql -U postgres -d mission_control -c "
  SELECT a.id, t.title, a.status, a.lease_expires_at
  FROM assignments a
  JOIN tasks t ON t.id = a.task_id
  WHERE a.status IN ('offered', 'accepted')
    AND a.lease_expires_at < now();
"

# Force-expire if needed
docker exec mctl-postgres psql -U postgres -d mission_control -c "
  UPDATE assignments SET status = 'expired', updated_at = now()
  WHERE status IN ('offered', 'accepted') AND lease_expires_at < now();

  UPDATE tasks SET state = 'queued', updated_at = now()
  WHERE state IN ('assigned', 'in_progress')
    AND id NOT IN (
      SELECT task_id FROM assignments WHERE status IN ('offered', 'accepted')
    );
"
```

### OpenClaw: hook auth failures (HTTP 401/403)

```bash
docker compose logs --tail=50 openclaw-dispatcher

# Verify token in .env matches OpenClaw gateway config
curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $OPENCLAW_GATEWAY_TOKEN" \
  "$OPENCLAW_GATEWAY_URL/hooks/agent"
# Expected: anything except 401/403
```

### OpenClaw: repeated dispatch failures

```bash
# Recent failures
docker exec mctl-postgres psql -U postgres -d mission_control -c "
  SELECT d.assignment_id, d.attempt, d.status, d.error, d.created_at::text
  FROM openclaw_dispatch_attempts d
  WHERE d.status = 'failed'
  ORDER BY d.created_at DESC
  LIMIT 20;
"

# Assignments with all 5 attempts exhausted
docker exec mctl-postgres psql -U postgres -d mission_control -c "
  SELECT a.id AS assignment_id, t.title, ag.name AS agent,
         (SELECT MAX(attempt) FROM openclaw_dispatch_attempts d WHERE d.assignment_id = a.id) AS attempts
  FROM assignments a
  JOIN tasks t ON t.id = a.task_id
  JOIN agents ag ON ag.id = a.agent_id
  WHERE a.status = 'offered'
    AND ag.capabilities->'openclaw'->>'enabled' = 'true'
    AND (SELECT COALESCE(MAX(attempt), 0) FROM openclaw_dispatch_attempts d WHERE d.assignment_id = a.id) >= 5;
"

# Reset attempts to allow retry
# docker exec mctl-postgres psql -U postgres -d mission_control -c "
#   DELETE FROM openclaw_dispatch_attempts WHERE assignment_id = '<assignment-id>';
# "
```

### OpenClaw: stale `sent` rows (dispatcher crashed mid-attempt)

```bash
docker exec mctl-postgres psql -U postgres -d mission_control -c "
  SELECT * FROM openclaw_dispatch_attempts
  WHERE status = 'sent'
    AND created_at < now() - interval '5 minutes';
"

# Unstick by marking as failed
# docker exec mctl-postgres psql -U postgres -d mission_control -c "
#   UPDATE openclaw_dispatch_attempts
#   SET status = 'failed', error = 'stale sent row — manual cleanup'
#   WHERE status = 'sent' AND created_at < now() - interval '5 minutes';
# "
```

### OpenClaw: disabling the integration

```bash
docker compose stop openclaw-heartbeat-bridge openclaw-dispatcher

# Or restart without the profile
docker compose down
docker compose up -d   # starts without openclaw profile

# OpenClaw agents go offline naturally after 3× their heartbeat interval (~30s default)
```

---

## Common Troubleshooting

### Port already in use

```bash
lsof -i :5432
lsof -i :3000
lsof -i :5173

# Override ports in .env:
# PG_PORT=5433
# PORT=3001
# UI_PORT=5174
```

### Redis connection errors in API logs

```bash
docker exec mctl-redis redis-cli ping
# ioredis has built-in retry logic; API reconnects automatically
docker compose restart control-api   # if still failing
```

### Migrations fail

```bash
docker compose logs migrate
docker exec mctl-postgres psql -U postgres -d mission_control -c \
  "SELECT * FROM _migrations ORDER BY name;"
docker compose up -d --force-recreate migrate
```

### Connection pool exhausted

```bash
docker exec mctl-postgres psql -U postgres -d mission_control -c "
  SELECT count(*) FROM pg_stat_activity WHERE datname = 'mission_control';
"
# API: max 20 connections; each worker: max 5 connections
docker compose restart   # releases all held connections
```

### Container build failures

```bash
docker compose build --no-cache
docker system df           # check disk space
docker system prune -f     # clean unused images/volumes
```

### Container exits with code 1

```bash
docker compose logs --tail=100 <service-name>
# Common causes: missing env var, port conflict, migrations not run
```

### Run daily standup manually

```bash
pnpm --filter @mc/workers daily-standup

# Via Docker
docker compose run --rm daily-standup
```
