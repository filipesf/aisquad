-- Seed the corven agent (OpenClaw-backed) if it doesn't already exist.
-- Uses ON CONFLICT to be safely re-runnable.

INSERT INTO agents (id, name, session_key, status, capabilities, heartbeat_interval_ms, last_seen_at, created_at, updated_at)
VALUES (
  'f30af1cf-4ec1-4415-8b93-47c76e65bf2d',
  'corven',
  'corven-openclaw',
  'offline',
  '{"openclaw": {"enabled": true, "agentName": "Corven", "agentId": "corven"}}',
  10000,
  NULL,
  now(),
  now()
)
ON CONFLICT (id) DO NOTHING;
