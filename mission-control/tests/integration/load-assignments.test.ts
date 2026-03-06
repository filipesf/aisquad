import pg from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

const pool = new pg.Pool({
  host: process.env.PGHOST ?? 'localhost',
  port: Number(process.env.PGPORT ?? 5432),
  user: process.env.PGUSER ?? 'postgres',
  password: process.env.PGPASSWORD ?? 'postgres',
  database: process.env.PGDATABASE ?? 'mission_control'
});

async function cleanDb() {
  await pool.query('DELETE FROM activities');
  await pool.query('DELETE FROM subscriptions');
  await pool.query('DELETE FROM comments');
  await pool.query('DELETE FROM notifications');
  await pool.query('DELETE FROM assignments');
  await pool.query('DELETE FROM tasks');
  await pool.query('DELETE FROM agents');
}

describe('load: assignment invariants', () => {
  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await cleanDb();
  });

  it('creates 200 tasks and verifies zero double-active assignments', async () => {
    // Create 5 agents
    const agentIds: string[] = [];
    for (let i = 0; i < 5; i++) {
      const result = await pool.query(
        `INSERT INTO agents (id, name, session_key, status, capabilities, heartbeat_interval_ms, last_seen_at, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, 'online', '{"code": true}', 10000, now(), now(), now())
         RETURNING id`,
        [`load-agent-${i}`, `sk-load-${i}-${Date.now()}`]
      );
      agentIds.push(result.rows[0].id);
    }

    // Create 200 tasks
    const taskIds: string[] = [];
    for (let i = 0; i < 200; i++) {
      const result = await pool.query(
        `INSERT INTO tasks (id, title, description, state, priority, required_capabilities, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, '', 'queued', 5, '{}', now(), now())
         RETURNING id`,
        [`load-task-${i}`]
      );
      taskIds.push(result.rows[0].id);
    }

    // Assign each task to an agent sequentially (simulating the assigner worker).
    // The real assigner worker may race with this test, so we tolerate constraint
    // violations (meaning the task was already assigned by the worker).
    let _assignedByUs = 0;
    for (let i = 0; i < taskIds.length; i++) {
      const taskId = taskIds[i]!;
      const agentId = agentIds[i % agentIds.length]!;

      try {
        await pool.query(
          `INSERT INTO assignments (id, task_id, agent_id, status, lease_expires_at, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, 'offered', now() + interval '30 seconds', now(), now())`,
          [taskId, agentId]
        );
        await pool.query("UPDATE tasks SET state = 'assigned' WHERE id = $1", [taskId]);
        _assignedByUs++;
      } catch {
        // Unique constraint violation — assigner worker already assigned this task
      }
    }

    // Now try to double-assign 50 tasks concurrently (should all fail due to unique partial index)
    let doubleAssignFailures = 0;
    const doubleAssignPromises = taskIds.slice(0, 50).map(async (taskId) => {
      const agentId = agentIds[Math.floor(Math.random() * agentIds.length)]!;
      try {
        await pool.query(
          `INSERT INTO assignments (id, task_id, agent_id, status, lease_expires_at, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, 'offered', now() + interval '30 seconds', now(), now())`,
          [taskId, agentId]
        );
      } catch {
        doubleAssignFailures++;
      }
    });

    await Promise.all(doubleAssignPromises);

    // All 50 double-assign attempts should have failed
    expect(doubleAssignFailures).toBe(50);

    // Verify: count tasks with more than 1 active assignment
    const doubleActive = await pool.query(
      `SELECT task_id, COUNT(*) as cnt
       FROM assignments
       WHERE status IN ('offered', 'accepted', 'started')
       GROUP BY task_id
       HAVING COUNT(*) > 1`
    );

    expect(doubleActive.rows).toHaveLength(0);

    // Verify all 200 tasks have exactly 1 active assignment
    const activeCount = await pool.query(
      `SELECT COUNT(DISTINCT task_id) as cnt
       FROM assignments
       WHERE status IN ('offered', 'accepted', 'started')`
    );

    expect(Number(activeCount.rows[0].cnt)).toBe(200);
  });
});
