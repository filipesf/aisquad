import pg from 'pg';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

const pool = new pg.Pool({
  host: process.env.PGHOST ?? 'localhost',
  port: Number(process.env.PGPORT ?? 5432),
  user: process.env.PGUSER ?? 'postgres',
  password: process.env.PGPASSWORD ?? 'postgres',
  database: process.env.PGDATABASE ?? 'mission_control'
});

describe('load: assignment invariants', () => {
  let testRunStart: Date;
  const createdAgentIds: string[] = [];
  const createdTaskIds: string[] = [];

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(() => {
    testRunStart = new Date();
    createdAgentIds.length = 0;
    createdTaskIds.length = 0;
  });

  afterEach(async () => {
    if (createdAgentIds.length > 0) {
      await pool.query('DELETE FROM agents WHERE id = ANY($1)', [createdAgentIds]);
    }
    if (createdTaskIds.length > 0) {
      await pool.query('DELETE FROM tasks WHERE id = ANY($1)', [createdTaskIds]);
    }
    await pool.query('DELETE FROM activities WHERE created_at >= $1', [testRunStart]);
  });

  it('creates 200 tasks and verifies zero double-active assignments', async () => {
    // Create 5 agents
    for (let i = 0; i < 5; i++) {
      const result = await pool.query(
        `INSERT INTO agents (id, name, session_key, status, capabilities, heartbeat_interval_ms, last_seen_at, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, 'online', '{"code": true}', 10000, now(), now(), now())
         RETURNING id`,
        [`load-agent-${i}`, `sk-load-${i}-${Date.now()}`]
      );
      createdAgentIds.push(result.rows[0].id);
    }

    // Create 200 tasks
    for (let i = 0; i < 200; i++) {
      const result = await pool.query(
        `INSERT INTO tasks (id, title, description, state, priority, required_capabilities, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, '', 'queued', 5, '{}', now(), now())
         RETURNING id`,
        [`load-task-${i}`]
      );
      createdTaskIds.push(result.rows[0].id);
    }

    // Assign each task to an agent sequentially
    let _assignedByUs = 0;
    for (let i = 0; i < createdTaskIds.length; i++) {
      const taskId = createdTaskIds[i]!;
      const agentId = createdAgentIds[i % createdAgentIds.length]!;

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

    // Try to double-assign 50 tasks concurrently — all should fail
    let doubleAssignFailures = 0;
    const doubleAssignPromises = createdTaskIds.slice(0, 50).map(async (taskId) => {
      const agentId = createdAgentIds[Math.floor(Math.random() * createdAgentIds.length)]!;
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

    expect(doubleAssignFailures).toBe(50);

    // No task (among ours) should have more than 1 active assignment
    const doubleActive = await pool.query(
      `SELECT task_id, COUNT(*) as cnt
       FROM assignments
       WHERE task_id = ANY($1) AND status IN ('offered', 'accepted', 'started')
       GROUP BY task_id
       HAVING COUNT(*) > 1`,
      [createdTaskIds]
    );
    expect(doubleActive.rows).toHaveLength(0);

    // All 200 of our tasks should have exactly 1 active assignment
    const activeCount = await pool.query(
      `SELECT COUNT(DISTINCT task_id) as cnt
       FROM assignments
       WHERE task_id = ANY($1) AND status IN ('offered', 'accepted', 'started')`,
      [createdTaskIds]
    );
    expect(Number(activeCount.rows[0].cnt)).toBe(200);
  });
});
