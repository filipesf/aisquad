# Telemetry Last-Mile Wiring Plan

> **Status:** Planned
> **Created:** 2026-03-05
> **Context:** OpenClaw already has a complete diagnostic event system (`src/infra/diagnostic-events.ts`) emitting 13 typed events with full token usage, cost, latency, provider, and model data. A bundled `diagnostics-otel` plugin subscribes to all of these and exports them as OpenTelemetry metrics, traces, and logs. The system is fully implemented and tested — it's just not enabled. The stale `plugins.entries.telemetry` config key in `openclaw.json` is unrelated dead config.

---

## Tier 1: Enable the existing diagnostics system

**Effort:** ~30 minutes
**Prerequisite:** None

### What already exists

OpenClaw's diagnostic event bus (`emitDiagnosticEvent()` / `onDiagnosticEvent()`) fires across the codebase — 15+ emit sites in `src/logging/diagnostic.ts` and `src/auto-reply/reply/agent-runner.ts`. The bundled `diagnostics-otel` plugin (`extensions/diagnostics-otel/`) defines 16 OTel metrics:

| Metric                          | Description                                                                 |
| ------------------------------- | --------------------------------------------------------------------------- |
| `openclaw.tokens`               | Token usage by provider/model/type (input, output, cache read/write, total) |
| `openclaw.cost.usd`             | Estimated model cost in USD                                                 |
| `openclaw.run.duration_ms`      | Agent run duration histogram                                                |
| `openclaw.context.tokens`       | Context window limit vs used                                                |
| `openclaw.webhook.received`     | Inbound webhook count                                                       |
| `openclaw.webhook.error`        | Webhook processing errors                                                   |
| `openclaw.webhook.duration_ms`  | Webhook processing latency                                                  |
| `openclaw.message.queued`       | Messages queued for processing                                              |
| `openclaw.message.processed`    | Messages processed by outcome                                               |
| `openclaw.message.duration_ms`  | Message processing latency                                                  |
| `openclaw.queue.depth`          | Queue depth on enqueue/dequeue                                              |
| `openclaw.queue.wait_ms`        | Queue wait time before execution                                            |
| `openclaw.queue.lane.enqueue`   | Command queue lane enqueue events                                           |
| `openclaw.queue.lane.dequeue`   | Command queue lane dequeue events                                           |
| `openclaw.session.state`        | Session state transitions                                                   |
| `openclaw.session.stuck`        | Sessions stuck in processing                                                |
| `openclaw.session.stuck_age_ms` | Age of stuck sessions                                                       |
| `openclaw.run.attempt`          | Run attempt counter                                                         |

### Step 1 — Enable diagnostics in OpenClaw config

Edit `~/.openclaw/openclaw.json` on the VM. Add/update the `diagnostics` key:

```json
{
  "diagnostics": {
    "enabled": true,
    "otel": {
      "enabled": true,
      "endpoint": "http://127.0.0.1:4318",
      "traces": true,
      "metrics": true,
      "logs": false
    }
  }
}
```

The `diagnostics-otel` plugin is bundled in `extensions/diagnostics-otel/` and auto-discovered. No explicit `plugins.entries` key needed.

### Step 2 — Remove the stale `telemetry` plugin entry

Delete `plugins.entries.telemetry` from `~/.openclaw/openclaw.json` to silence the startup warning.

### Step 3 — Deploy an OTel collector

Something needs to listen on `:4318` (OTLP/HTTP). Two options:

| Option                                      | Pros                                                          | Cons                             |
| ------------------------------------------- | ------------------------------------------------------------- | -------------------------------- |
| **Grafana Alloy + Grafana Cloud free tier** | Managed storage, free 10k metrics/month, pre-built dashboards | External dependency              |
| **Alloy + local Prometheus + Grafana**      | Fully self-hosted, no external dependency                     | Another Docker stack to maintain |

Either way, this is a single `docker compose` service on the VM or alongside Mission Control.

### Step 4 — Restart gateway and verify

```bash
cd /Users/filipefernandes/Code/squadai/vm
make restart
make health
# Verify no more "plugin not found: telemetry" warning
# Verify diagnostics-otel service starts in logs
make logs
```

### What Tier 1 delivers

Answers the core customer questions:

1. **"How much is this costing me?"** — `openclaw.tokens` + `openclaw.cost.usd` by provider/model
2. **"Is it performing well?"** — `openclaw.run.duration_ms` latency distribution
3. **"Which model should I use?"** — Compare cost/latency/token usage across providers
4. **"How much are agents being used?"** — `openclaw.message.processed`, `openclaw.session.state`

---

## Tier 2: Pipe telemetry into Mission Control

**Effort:** 4-6 hours
**Prerequisite:** Tier 1 (for validation that events flow correctly)

This gives a unified view — gateway metrics alongside task/assignment/agent data — queryable from the MC API and visible in Mission UI.

### Step 1 — Migration `004_telemetry.sql`

File: `mission-control/db/migrations/004_telemetry.sql`

```sql
CREATE TABLE telemetry_events (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id           UUID REFERENCES agents(id) ON DELETE CASCADE,
  event_type         TEXT NOT NULL,
  provider           TEXT,
  model              TEXT,
  channel            TEXT,
  session_key        TEXT,
  tokens_input       INTEGER,
  tokens_output      INTEGER,
  tokens_cache_read  INTEGER,
  tokens_cache_write INTEGER,
  tokens_total       INTEGER,
  cost_usd           NUMERIC(12, 6),
  duration_ms        INTEGER,
  payload            JSONB NOT NULL DEFAULT '{}',
  recorded_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_telemetry_agent_recorded ON telemetry_events (agent_id, recorded_at DESC);
CREATE INDEX idx_telemetry_type_recorded  ON telemetry_events (event_type, recorded_at DESC);
CREATE INDEX idx_telemetry_recorded       ON telemetry_events (recorded_at DESC);
```

Follows the exact pattern of `003_openclaw_dispatch_tracking.sql`. Promotes high-query columns (tokens, cost, duration, provider, model) out of JSONB for efficient aggregation. Overflow goes into `payload`.

### Step 2 — Zod schema in `@mc/shared`

File: `mission-control/packages/shared/src/schemas.ts` (append)

```ts
export const IngestTelemetryEventSchema = z.object({
  agent_id: z.string().uuid().optional(),
  event_type: z.string().min(1),
  provider: z.string().optional(),
  model: z.string().optional(),
  channel: z.string().optional(),
  session_key: z.string().optional(),
  tokens_input: z.number().int().nonneg().optional(),
  tokens_output: z.number().int().nonneg().optional(),
  tokens_cache_read: z.number().int().nonneg().optional(),
  tokens_cache_write: z.number().int().nonneg().optional(),
  tokens_total: z.number().int().nonneg().optional(),
  cost_usd: z.number().nonneg().optional(),
  duration_ms: z.number().int().nonneg().optional(),
  payload: z.record(z.unknown()).default({}),
  recorded_at: z.string().datetime().optional(),
});

export type IngestTelemetryEvent = z.infer<typeof IngestTelemetryEventSchema>;

export const IngestTelemetryBatchSchema = z.object({
  events: z.array(IngestTelemetryEventSchema).min(1).max(500),
});

export type IngestTelemetryBatch = z.infer<typeof IngestTelemetryBatchSchema>;
```

### Step 3 — Domain module

File: `mission-control/apps/control-api/src/domain/telemetry.ts`

Modeled on `domain/activities.ts`. A single `ingestBatch()` function that does a multi-row INSERT via `query<T>()` from `services/db.ts`. Optionally calls `activities.emit('telemetry.ingested', ...)` to surface in the activity stream. ~30 lines.

### Step 4 — Route

File: `mission-control/apps/control-api/src/routes/telemetry.ts`

Two endpoints following the existing Fastify plugin pattern:

```
POST /telemetry/batch   — accepts IngestTelemetryBatchSchema, calls domain, returns 201
GET  /telemetry/summary — aggregates by agent/provider/model over a time window
```

The `POST` endpoint gets idempotency middleware for free via the existing `Idempotency-Key` header support.

### Step 5 — Register in control-api entry point

File: `mission-control/apps/control-api/src/index.ts` (one line)

```ts
await app.register(telemetryRoutes);
```

### Step 6 — OpenClaw forwarder plugin

New plugin: `openclaw/extensions/telemetry-mc/`

Structure:

```
telemetry-mc/
├── index.ts              # Plugin definition, registerService()
├── openclaw.plugin.json  # Plugin manifest
├── package.json          # Minimal, no external deps
└── src/
    └── service.ts        # Subscribes to onDiagnosticEvent, batches, POSTs to MC
```

~80 lines of service code: subscribe to `onDiagnosticEvent` bus → in-memory buffer → flush every 10s or 100 events → `POST http://<CONTROL_API_URL>/telemetry/batch`. Uses `registerService()` for lifecycle. Modeled on the `diagnostics-otel` service pattern.

Config via env vars already in the ecosystem:

- `CONTROL_API_URL` (already in `.env.example`)
- `OPENCLAW_GATEWAY_TOKEN` for auth (or a dedicated telemetry token)

### Step 7 — Rebuild and deploy

```bash
# Mission Control
cd /Users/filipefernandes/Code/squadai/mission-control
docker compose up -d --build

# OpenClaw (after plugin is synced to VM)
cd /Users/filipefernandes/Code/squadai/vm
make restart
```

### What Tier 2 delivers

- Single data store (Postgres) with gateway telemetry alongside task/agent data
- API-queryable: `GET /telemetry/summary?window=24h&group_by=model`
- Foundation for Mission UI dashboard (Tier 3)
- No need for a separate Grafana instance if you only want basic visibility

---

## Tier 3: Mission UI Dashboard (future)

**Effort:** 1-2 days
**Prerequisite:** Tier 2

Add a Telemetry page to Mission UI (`http://localhost:5173/telemetry`) showing:

- Token usage over time (line chart by provider/model)
- Cost accumulator (daily/weekly/monthly)
- Latency p50/p95/p99 by model
- Agent utilization (sessions, messages, active time)

Separate body of work — React components + API queries over `telemetry_events`. Depends on Tiers 1+2 flowing data first. Chart library TBD (lightweight options: recharts, uPlot).

---

## Recommended sequencing

| Phase      | Scope                                                            | Effort    | Prerequisite |
| ---------- | ---------------------------------------------------------------- | --------- | ------------ |
| **Tier 1** | Enable `diagnostics-otel`, deploy collector, remove stale config | 30 min    | None         |
| **Tier 2** | MC ingest endpoint + OC forwarder plugin                         | 4-6 hours | Tier 1       |
| **Tier 3** | Mission UI dashboard                                             | 1-2 days  | Tier 2       |

Start with Tier 1 — it's essentially free (code already written and tested) and immediately answers "how much is this costing me?" via Grafana. Tier 2 matters if you want a single-pane-of-glass in Mission UI rather than a separate Grafana instance. Tier 3 is the polish layer.

---

## Key files reference

### OpenClaw (on VM: `/home/filipefernandes/openclaw/`)

| File                                           | Role                                                                           |
| ---------------------------------------------- | ------------------------------------------------------------------------------ |
| `src/infra/diagnostic-events.ts`               | Event bus: `emitDiagnosticEvent()`, `onDiagnosticEvent()`, all 13 typed events |
| `src/logging/diagnostic.ts`                    | 15+ emit sites (webhooks, messages, sessions, queues, tool loops)              |
| `src/agents/usage.ts`                          | `NormalizedUsage` type, cross-provider token normalization                     |
| `src/agents/pi-embedded-runner/run/attempt.ts` | Hook call sites: `llm_input`, `llm_output`, `agent_end`                        |
| `src/plugins/types.ts`                         | `OpenClawPluginApi`, `PluginHookName` (25 hooks), `OpenClawPluginService`      |
| `src/plugins/hooks.ts`                         | Hook runner (void=parallel, modifying=sequential)                              |
| `extensions/diagnostics-otel/`                 | Bundled OTel exporter plugin (16 metrics, traces, logs)                        |
| `~/.openclaw/openclaw.json`                    | Runtime config (`diagnostics`, `plugins.entries`)                              |

### Mission Control (`mission-control/`)

| File                                               | Role                                            |
| -------------------------------------------------- | ----------------------------------------------- |
| `apps/control-api/src/index.ts`                    | Route registration, middleware setup            |
| `apps/control-api/src/domain/activities.ts`        | Pattern for append-only event store             |
| `apps/control-api/src/routes/agents.ts`            | Pattern for Zod-validated POST routes           |
| `apps/control-api/src/services/db.ts`              | `query<T>()` wrapper over pg Pool               |
| `apps/control-api/src/middleware/idempotency.ts`   | Redis-backed idempotency (free for POST routes) |
| `packages/shared/src/schemas.ts`                   | All Zod schemas and inferred types              |
| `db/migrations/003_openclaw_dispatch_tracking.sql` | Latest migration (pattern reference)            |
