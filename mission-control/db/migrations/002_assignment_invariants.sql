-- Assignment invariants (safety check)
-- The unique partial index ux_assignments_active_task was created in 001_init.sql
-- This migration ensures it exists and adds additional helpful indexes

-- Ensure the unique partial index exists (CREATE IF NOT EXISTS not supported for indexes,
-- so we use a DO block)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'ux_assignments_active_task'
  ) THEN
    CREATE UNIQUE INDEX ux_assignments_active_task
      ON assignments(task_id)
      WHERE status IN ('offered', 'accepted', 'started');
  END IF;
END
$$;

-- Additional index for lease expiry queries
CREATE INDEX IF NOT EXISTS idx_assignments_lease_active
  ON assignments(lease_expires_at)
  WHERE status IN ('offered', 'accepted');
