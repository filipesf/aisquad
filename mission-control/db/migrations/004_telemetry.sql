CREATE TABLE telemetry_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  provider TEXT,
  model TEXT,
  channel TEXT,
  session_key TEXT,
  tokens_input INTEGER,
  tokens_output INTEGER,
  tokens_cache_read INTEGER,
  tokens_cache_write INTEGER,
  tokens_total INTEGER,
  cost_usd NUMERIC(12, 6),
  duration_ms INTEGER,
  payload JSONB NOT NULL DEFAULT '{}',
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_telemetry_agent_recorded
  ON telemetry_events (agent_id, recorded_at DESC);

CREATE INDEX idx_telemetry_type_recorded
  ON telemetry_events (event_type, recorded_at DESC);

CREATE INDEX idx_telemetry_recorded
  ON telemetry_events (recorded_at DESC);
