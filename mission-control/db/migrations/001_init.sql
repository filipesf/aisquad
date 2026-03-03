-- Mission Control: Initial Schema
-- Creates all core tables, indexes, and constraints

-- ── Migrations tracking ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS _migrations (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Agents ─────────────────────────────────────────────────────
CREATE TABLE agents (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  session_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'offline'
    CHECK (status IN ('online', 'offline', 'draining')),
  capabilities JSONB NOT NULL DEFAULT '{}',
  heartbeat_interval_ms INT NOT NULL DEFAULT 10000
    CHECK (heartbeat_interval_ms >= 1000 AND heartbeat_interval_ms <= 300000),
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_agents_status ON agents(status);
CREATE INDEX idx_agents_last_seen ON agents(last_seen_at);

-- ── Tasks ──────────────────────────────────────────────────────
CREATE TABLE tasks (
  id UUID PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT 'queued'
    CHECK (state IN ('queued', 'assigned', 'in_progress', 'review', 'done', 'blocked')),
  priority INT NOT NULL DEFAULT 5
    CHECK (priority >= 0 AND priority <= 10),
  required_capabilities JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tasks_state ON tasks(state);
CREATE INDEX idx_tasks_state_priority ON tasks(state, priority DESC);

-- ── Assignments ────────────────────────────────────────────────
CREATE TABLE assignments (
  id UUID PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'offered'
    CHECK (status IN ('offered', 'accepted', 'started', 'completed', 'expired', 'cancelled')),
  lease_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_assignments_task ON assignments(task_id);
CREATE INDEX idx_assignments_agent ON assignments(agent_id);
CREATE INDEX idx_assignments_status ON assignments(status);
CREATE INDEX idx_assignments_lease ON assignments(lease_expires_at)
  WHERE status IN ('offered', 'accepted', 'started');

-- Prevent multiple active assignments per task
CREATE UNIQUE INDEX ux_assignments_active_task
  ON assignments(task_id)
  WHERE status IN ('offered', 'accepted', 'started');

-- ── Notifications ──────────────────────────────────────────────
CREATE TABLE notifications (
  id UUID PRIMARY KEY,
  target_agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  source_id UUID NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'delivered', 'failed')),
  delivered_at TIMESTAMPTZ,
  retry_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_target ON notifications(target_agent_id);
CREATE INDEX idx_notifications_status ON notifications(status);
CREATE INDEX idx_notifications_queued ON notifications(status, created_at)
  WHERE status = 'queued';

-- ── Activities ─────────────────────────────────────────────────
CREATE TABLE activities (
  id UUID PRIMARY KEY,
  type TEXT NOT NULL,
  actor_id UUID,
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_activities_type ON activities(type);
CREATE INDEX idx_activities_created ON activities(created_at DESC);

-- ── Comments ───────────────────────────────────────────────────
CREATE TABLE comments (
  id UUID PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_comments_task ON comments(task_id);

-- ── Subscriptions ──────────────────────────────────────────────
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (task_id, agent_id)
);

CREATE INDEX idx_subscriptions_task ON subscriptions(task_id);
CREATE INDEX idx_subscriptions_agent ON subscriptions(agent_id);
