import type { IngestTelemetryEvent } from '@mc/shared';
import { query } from '../services/db.js';

const GROUP_BY_SQL = {
  provider: "COALESCE(provider, 'unknown')",
  model: "COALESCE(model, 'unknown')",
  agent: "COALESCE(agent_id::text, 'unknown')",
  event_type: 'event_type',
  channel: "COALESCE(channel, 'unknown')"
} as const;

export type TelemetryGroupBy = keyof typeof GROUP_BY_SQL;

interface TelemetrySummaryRow {
  group_value: string;
  events: number;
  tokens_total: string;
  cost_usd: string;
  avg_duration_ms: number;
  min_duration_ms: number;
  max_duration_ms: number;
}

interface TelemetryTotalsRow {
  events: number;
  tokens_total: string;
  cost_usd: string;
  avg_duration_ms: number;
  min_duration_ms: number;
  max_duration_ms: number;
}

export async function ingestBatch(events: IngestTelemetryEvent[]): Promise<{ inserted: number }> {
  if (events.length === 0) {
    return { inserted: 0 };
  }

  const values: unknown[] = [];
  const tuples = events.map((event, index) => {
    const base = index * 15;
    values.push(
      event.agent_id ?? null,
      event.event_type,
      event.provider ?? null,
      event.model ?? null,
      event.channel ?? null,
      event.session_key ?? null,
      event.tokens_input ?? null,
      event.tokens_output ?? null,
      event.tokens_cache_read ?? null,
      event.tokens_cache_write ?? null,
      event.tokens_total ?? null,
      event.cost_usd ?? null,
      event.duration_ms ?? null,
      JSON.stringify(event.payload ?? {}),
      event.recorded_at ?? null
    );

    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11}, $${base + 12}, $${base + 13}, $${base + 14}::jsonb, COALESCE($${base + 15}::timestamptz, now()))`;
  });

  const result = await query(
    `INSERT INTO telemetry_events (
       agent_id,
       event_type,
       provider,
       model,
       channel,
       session_key,
       tokens_input,
       tokens_output,
       tokens_cache_read,
       tokens_cache_write,
       tokens_total,
       cost_usd,
       duration_ms,
       payload,
       recorded_at
     ) VALUES ${tuples.join(', ')}`,
    values
  );

  return { inserted: result.rowCount ?? 0 };
}

export async function getSummary(params: {
  since: string;
  window: string;
  groupBy: TelemetryGroupBy;
}): Promise<{
  window: string;
  group_by: TelemetryGroupBy;
  since: string;
  generated_at: string;
  totals: {
    events: number;
    tokens_total: number;
    cost_usd: number;
    avg_duration_ms: number;
    min_duration_ms: number;
    max_duration_ms: number;
  };
  groups: Array<{
    key: string;
    events: number;
    tokens_total: number;
    cost_usd: number;
    avg_duration_ms: number;
    min_duration_ms: number;
    max_duration_ms: number;
  }>;
}> {
  const groupExpr = GROUP_BY_SQL[params.groupBy];

  const [totalsResult, groupedResult] = await Promise.all([
    query<TelemetryTotalsRow>(
      `SELECT
         COUNT(*)::int AS events,
         COALESCE(SUM(tokens_total), 0)::text AS tokens_total,
         COALESCE(SUM(cost_usd), 0)::text AS cost_usd,
         COALESCE(AVG(duration_ms), 0)::float8 AS avg_duration_ms,
         COALESCE(MIN(duration_ms), 0)::int AS min_duration_ms,
         COALESCE(MAX(duration_ms), 0)::int AS max_duration_ms
       FROM telemetry_events
       WHERE recorded_at >= $1`,
      [params.since]
    ),
    query<TelemetrySummaryRow>(
      `SELECT
         ${groupExpr} AS group_value,
         COUNT(*)::int AS events,
         COALESCE(SUM(tokens_total), 0)::text AS tokens_total,
         COALESCE(SUM(cost_usd), 0)::text AS cost_usd,
         COALESCE(AVG(duration_ms), 0)::float8 AS avg_duration_ms,
         COALESCE(MIN(duration_ms), 0)::int AS min_duration_ms,
         COALESCE(MAX(duration_ms), 0)::int AS max_duration_ms
       FROM telemetry_events
       WHERE recorded_at >= $1
       GROUP BY 1
       ORDER BY events DESC, group_value ASC
       LIMIT 200`,
      [params.since]
    )
  ]);

  const totalsRow = totalsResult.rows[0];
  const totals = {
    events: totalsRow?.events ?? 0,
    tokens_total: Number(totalsRow?.tokens_total ?? 0),
    cost_usd: Number(totalsRow?.cost_usd ?? 0),
    avg_duration_ms: Number(totalsRow?.avg_duration_ms ?? 0),
    min_duration_ms: Number(totalsRow?.min_duration_ms ?? 0),
    max_duration_ms: Number(totalsRow?.max_duration_ms ?? 0)
  };

  return {
    window: params.window,
    group_by: params.groupBy,
    since: params.since,
    generated_at: new Date().toISOString(),
    totals,
    groups: groupedResult.rows.map((row) => ({
      key: row.group_value,
      events: row.events,
      tokens_total: Number(row.tokens_total),
      cost_usd: Number(row.cost_usd),
      avg_duration_ms: Number(row.avg_duration_ms),
      min_duration_ms: Number(row.min_duration_ms),
      max_duration_ms: Number(row.max_duration_ms)
    }))
  };
}
