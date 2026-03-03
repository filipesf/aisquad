-- OpenClaw dispatch attempt tracking
-- Records each attempt to dispatch an offered assignment to the OpenClaw gateway.
-- Supports retry/failure analysis and prevents duplicate sends per attempt number.

CREATE TABLE openclaw_dispatch_attempts (
  id UUID PRIMARY KEY,
  assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  attempt INT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'sent', 'succeeded', 'failed')),
  error TEXT,
  response_excerpt TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Look up dispatch history for a given assignment
CREATE INDEX idx_openclaw_dispatch_assignment
  ON openclaw_dispatch_attempts(assignment_id);

-- Find recent failures for operational monitoring
CREATE INDEX idx_openclaw_dispatch_failures
  ON openclaw_dispatch_attempts(created_at DESC)
  WHERE status = 'failed';

-- Prevent duplicate dispatch records for the same assignment + attempt number
CREATE UNIQUE INDEX ux_openclaw_dispatch_attempt
  ON openclaw_dispatch_attempts(assignment_id, attempt);
