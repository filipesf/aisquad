# Local VM Operations Runbook

## Table of Contents

1. [System Overview](#system-overview)
2. [Health Checks](#health-checks)
3. [Starting Services](#starting-services)
4. [Stopping Services](#stopping-services)
5. [Restarting Services](#restarting-services)
6. [Backup and Restore](#backup-and-restore)
7. [Failure Recovery](#failure-recovery)
8. [Common Troubleshooting](#common-troubleshooting)

---

## System Overview

All services run as Docker containers managed by `docker-compose.yml` at the repo root.

| Service                       | Container                  | Port | Description                                                       |
| ----------------------------- | -------------------------- | ---- | ----------------------------------------------------------------- |
| **PostgreSQL 16**             | `mctl-postgres`            | 5432 | Primary datastore                                                 |
| **Redis 7**                   | `mctl-redis`               | 6379 | Cache, idempotency, dedup                                         |
| **Migrate**                   | `mctl-migrate`             | —    | One-shot migration runner (exits after completion)                |
| **Control API**               | `mctl-api`                 | 3000 | Fastify REST API                                                  |
| **Mission UI**                | `mctl-ui`                  | 5173 | React dashboard (nginx serving static build)                      |
| **Offline Detector**          | `mctl-offline-detector`    | —    | Background worker (loop)                                          |
| **Assigner**                  | `mctl-assigner`            | —    | Background worker (loop)                                          |
| **Notification Dispatcher**   | `mctl-notif-dispatcher`    | —    | Background worker (loop)                                          |
| **OpenClaw Heartbeat Bridge** | `mctl-openclaw-heartbeat`  | —    | Keeps OpenClaw agents online (optional, `openclaw` profile)       |
| **OpenClaw Dispatcher**       | `mctl-openclaw-dispatcher` | —    | Dispatches assignments to OpenClaw (optional, `openclaw` profile) |

---

## Health Checks

### Quick health check

```bash
# All services at a glance
docker compose ps

# API health (checks DB + Redis connectivity)
curl -s http://localhost:3000/health | jq .
# Expected: {"status":"ok","db":true,"redis":true}
```

### Infrastructure health

```bash
# PostgreSQL
docker exec mctl-postgres pg_isready -U postgres

# Redis
docker exec mctl-redis redis-cli ping
# Expected: PONG
```

### Check container logs for errors

```bash
# All services
docker compose logs --tail=50

# Specific service
docker compose logs --tail=50 control-api
docker compose logs --tail=50 offline-detector
```

---

## Starting Services

### Start everything (core services)

```bash
docker compose up -d
```

This starts Postgres, Redis, runs migrations, then starts the API, UI, and all core workers. Dependencies are handled automatically — migrations wait for Postgres, workers wait for migrations, etc.

### Start with OpenClaw workers

```bash
docker compose --profile openclaw up -d
```

Requires `OPENCLAW_GATEWAY_URL` and `OPENCLAW_GATEWAY_TOKEN` in your `.env` file.

### Start only infrastructure (for local development)

```bash
docker compose up -d postgres redis
```

Then run apps with `pnpm` for hot reload — see README for details.

### Seed demo data (optional)

```bash
docker exec mctl-postgres psql -U postgres -d mission_control -c "\dt"  # verify tables exist
pnpm db:seed
```

### Verify startup

```bash
# Check all containers are up
docker compose ps

# Verify API responds
curl -s http://localhost:3000/health | jq .

# Verify UI serves
curl -s -o /dev/null -w "%{http_code}" http://localhost:5173
# Expected: 200
```

---

## Stopping Services

### Stop all services (preserve data)

```bash
docker compose down
```

### Stop all services AND remove data volumes

```bash
docker compose down -v
# WARNING: This deletes all database data!
```

### Stop a single service

```bash
docker compose stop offline-detector
docker compose stop control-api
```

---

## Restarting Services

### Restart a single service

```bash
docker compose restart control-api
docker compose restart offline-detector
```

### Restart all services (preserve data)

```bash
docker compose down && docker compose up -d
```

### Rebuild and restart (after code changes)

```bash
docker compose up -d --build
```

### Full restart from scratch (clean slate)

```bash
docker compose down -v
docker compose up -d
# Migrations run automatically. Optionally seed:
pnpm db:seed
```

---

## Backup and Restore

### Create a backup

```bash
bash ops/backup.sh
# Backup saved to ops/backups/mission_control_YYYYMMDD_HHMMSS.sql
```

### Validate a backup (dry run)

```bash
bash ops/restore.sh --dry-run
# Or specify a file:
bash ops/restore.sh --dry-run ops/backups/mission_control_20240101_120000.sql
```

### Restore from backup

```bash
# Uses most recent backup:
bash ops/restore.sh

# Or specify a file:
bash ops/restore.sh ops/backups/mission_control_20240101_120000.sql

# WARNING: This drops and recreates the database!
```

---

## Failure Recovery

### Worker container crashed or exited

Workers have `restart: unless-stopped` and will auto-restart. If a worker is stuck:

```bash
# 1. Check status
docker compose ps

# 2. Check logs
docker compose logs --tail=50 offline-detector

# 3. Force restart
docker compose restart offline-detector
```

No data is lost because:

- Workers poll the database for work
- All state transitions are in PostgreSQL
- Incomplete transactions are rolled back by Postgres

### API container crashed

The API also has `restart: unless-stopped`. If it won't restart:

```bash
# Check logs for the error
docker compose logs --tail=100 control-api

# Force recreate the container
docker compose up -d --force-recreate control-api

# Verify health
curl -s http://localhost:3000/health | jq .
```

### PostgreSQL connection refused

```bash
# 1. Check container status
docker compose ps postgres

# 2. If not running, start it
docker compose up -d postgres

# 3. Wait for healthy
docker compose ps postgres

# 4. If data is corrupted, restore from backup
bash ops/restore.sh
```

### Redis connection refused

```bash
# 1. Check container status
docker compose ps redis

# 2. If not running, start it
docker compose up -d redis

# 3. Redis data loss is non-critical (only caches, dedup keys)
#    Services will reconnect automatically
```

### Orphaned assignments (task stuck in assigned/in_progress)

The assigner worker automatically expires stale leases. To check or force:

```bash
# Check for orphaned assignments
docker exec mctl-postgres psql -U postgres -d mission_control -c "
  SELECT a.id, t.title, a.status, a.lease_expires_at
  FROM assignments a
  JOIN tasks t ON t.id = a.task_id
  WHERE a.status IN ('offered', 'accepted')
    AND a.lease_expires_at < now();
"

# The assigner worker handles these automatically.
# If you need to force-expire:
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

---

## Common Troubleshooting

### Port already in use

```bash
# Find what's using a port
lsof -i :5432
lsof -i :3000
lsof -i :5173

# Change ports via .env file:
# PG_PORT=5433 API_PORT=3001 UI_PORT=5174
# Then: docker compose up -d
```

### Redis connection errors in API logs

```bash
# Check Redis is running
docker exec mctl-redis redis-cli ping

# If Redis restarted, the API will auto-reconnect (ioredis has retry logic)
# If still failing, restart the API
docker compose restart control-api
```

### Migrations fail

```bash
# Check current migration state
docker exec mctl-postgres psql -U postgres -d mission_control -c \
  "SELECT * FROM _migrations ORDER BY name;"

# Check migration container logs
docker compose logs migrate

# Re-run migrations by recreating the migrate service
docker compose up -d --force-recreate migrate
```

### Database connection pool exhausted

```bash
# Check active connections
docker exec mctl-postgres psql -U postgres -d mission_control -c "
  SELECT count(*) FROM pg_stat_activity WHERE datname = 'mission_control';
"

# If too many connections, restart services to release them
docker compose restart
# The API pool is configured for max 20 connections
# Each worker uses max 5 connections
```

### Container build failures

```bash
# Rebuild without cache
docker compose build --no-cache

# Check disk space (Docker images can be large)
docker system df

# Clean up unused images/volumes
docker system prune -f
```

### Container won't start (exit code 1)

```bash
# Check the logs for the failing container
docker compose logs --tail=100 <service-name>

# Common causes:
# - Missing env var (check .env file)
# - Port conflict (change port in .env)
# - Migration hasn't run (check migrate container)
```

### Daily standup generator

```bash
# Run manually
pnpm --filter @mc/workers daily-standup

# Or via Docker
docker compose run --rm -e PGHOST=postgres worker apps/workers/src/daily-standup.ts
```

### OpenClaw: hook auth failures

```bash
# Check dispatcher logs for HTTP 401/403 errors
docker compose logs --tail=50 openclaw-dispatcher

# Verify the gateway token matches your OpenClaw config
# (check your .env file for OPENCLAW_GATEWAY_TOKEN)

# Test connectivity to the gateway directly
curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $OPENCLAW_GATEWAY_TOKEN" \
  "$OPENCLAW_GATEWAY_URL/hooks/agent"
```

### OpenClaw: repeated dispatch failures

```bash
# Check recent failures in the dispatch tracking table
docker exec mctl-postgres psql -U postgres -d mission_control -c "
  SELECT d.assignment_id, d.attempt, d.status, d.error,
         d.created_at::text
  FROM openclaw_dispatch_attempts d
  WHERE d.status = 'failed'
  ORDER BY d.created_at DESC
  LIMIT 20;
"

# Check assignments stuck with max attempts exhausted
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

# To retry exhausted assignments, delete the failed attempts:
# docker exec mctl-postgres psql -U postgres -d mission_control -c "
#   DELETE FROM openclaw_dispatch_attempts WHERE assignment_id = '<assignment-id>';
# "
```

### OpenClaw: stale offered assignments

```bash
# Check offered assignments for OpenClaw agents that haven't been dispatched
docker exec mctl-postgres psql -U postgres -d mission_control -c "
  SELECT a.id, t.title, ag.name, a.status, a.lease_expires_at::text,
         (SELECT COUNT(*) FROM openclaw_dispatch_attempts d WHERE d.assignment_id = a.id) AS dispatch_attempts
  FROM assignments a
  JOIN tasks t ON t.id = a.task_id
  JOIN agents ag ON ag.id = a.agent_id
  WHERE a.status = 'offered'
    AND ag.capabilities->'openclaw'->>'enabled' = 'true'
  ORDER BY a.created_at ASC;
"

# Stale 'sent' status rows (dispatcher crashed between marking sent and recording result):
docker exec mctl-postgres psql -U postgres -d mission_control -c "
  SELECT * FROM openclaw_dispatch_attempts
  WHERE status = 'sent'
    AND created_at < now() - interval '5 minutes';
"

# To unstick, update stale 'sent' rows to 'failed':
# docker exec mctl-postgres psql -U postgres -d mission_control -c "
#   UPDATE openclaw_dispatch_attempts SET status = 'failed', error = 'stale sent row — manual cleanup'
#   WHERE status = 'sent' AND created_at < now() - interval '5 minutes';
# "
```

### OpenClaw: disabling the integration

```bash
# To immediately stop all OpenClaw workers:
docker compose stop openclaw-heartbeat-bridge openclaw-dispatcher

# Or remove them entirely:
docker compose down
docker compose up -d  # starts without openclaw profile

# OpenClaw agents will naturally go offline via the offline-detector
# after 3x their heartbeat interval (~30s with default config)

# No data cleanup is needed — the integration is fully inert when workers are stopped
```
