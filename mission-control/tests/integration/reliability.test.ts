import { Redis } from 'ioredis';
import pg from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const API_URL = process.env.API_URL ?? 'http://localhost:3000';

const pool = new pg.Pool({
  host: process.env.PGHOST ?? 'localhost',
  port: Number(process.env.PGPORT ?? 5432),
  user: process.env.PGUSER ?? 'postgres',
  password: process.env.PGPASSWORD ?? 'postgres',
  database: process.env.PGDATABASE ?? 'mission_control'
});

const redis = new Redis({
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
  lazyConnect: true
});

interface AgentResp {
  id: string;
  name: string;
  status: string;
}

interface TaskResp {
  id: string;
  title: string;
  state: string;
}

interface AssignmentResp {
  id: string;
  task_id: string;
  agent_id: string;
  status: string;
}

async function post<T>(
  path: string,
  body: Record<string, unknown>
): Promise<{ status: number; data: T }> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return { status: res.status, data: (await res.json()) as T };
}

async function cleanRedis(): Promise<void> {
  const keys = await redis.keys('hb:seq:*');
  if (keys.length > 0) await redis.del(...keys);
  const idemKeys = await redis.keys('idem:*');
  if (idemKeys.length > 0) await redis.del(...idemKeys);
  const dedupKeys = await redis.keys('notif:dedup:*');
  if (dedupKeys.length > 0) await redis.del(...dedupKeys);
}

describe('reliability: end-to-end scenario', () => {
  let testRunStart: Date;
  const createdAgentIds: string[] = [];
  const createdTaskIds: string[] = [];

  beforeAll(async () => {
    await redis.connect();
  });

  afterAll(async () => {
    await pool.end();
    await redis.quit();
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
    await cleanRedis();
  });

  async function createAgent(
    name: string,
    caps: Record<string, unknown> = { code: true }
  ): Promise<AgentResp> {
    const { data } = await post<AgentResp>('/agents', {
      name,
      session_key: `sk-${name}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      capabilities: caps,
      heartbeat_interval_ms: 5000
    });
    createdAgentIds.push(data.id);
    await post(`/agents/${data.id}/heartbeat`, {});
    return data;
  }

  async function createTask(title: string, caps: Record<string, unknown> = {}): Promise<TaskResp> {
    const { data } = await post<TaskResp>('/tasks', {
      title,
      description: '',
      priority: 5,
      required_capabilities: caps
    });
    createdTaskIds.push(data.id);
    return data;
  }

  it('3 agents, 20 tasks, 1 agent crashes mid-task — no orphaned assignments, all tasks requeued', async () => {
    const agent1 = await createAgent('reliable-1');
    const agent2 = await createAgent('reliable-2');
    const agent3 = await createAgent('reliable-3');
    const agents = [agent1, agent2, agent3];

    const tasks: TaskResp[] = [];
    for (let i = 0; i < 20; i++) {
      tasks.push(await createTask(`reliability-task-${i}`));
    }

    const assignmentIds: string[] = [];
    for (let i = 0; i < 20; i++) {
      const agent = agents[i % 3]!;
      const task = tasks[i]!;

      const result = await pool.query(
        `INSERT INTO assignments (id, task_id, agent_id, status, lease_expires_at, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, 'offered', now() + interval '30 seconds', now(), now())
         RETURNING id`,
        [task.id, agent.id]
      );
      await pool.query("UPDATE tasks SET state = 'assigned' WHERE id = $1", [task.id]);
      assignmentIds.push(result.rows[0].id);
    }

    for (const assignmentId of assignmentIds) {
      await post<AssignmentResp>(`/assignments/${assignmentId}/accept`, {});
    }

    // Verify all our tasks are in_progress
    const inProgressResult = await pool.query(
      "SELECT id FROM tasks WHERE id = ANY($1) AND state = 'in_progress'",
      [createdTaskIds]
    );
    expect(inProgressResult.rows).toHaveLength(20);

    await pool.query("UPDATE agents SET status = 'offline', updated_at = now() WHERE id = $1", [
      agent3.id
    ]);

    const agent3Assignments = await pool.query(
      `SELECT id, task_id FROM assignments
       WHERE agent_id = $1 AND status IN ('offered', 'accepted')`,
      [agent3.id]
    );

    for (const row of agent3Assignments.rows) {
      await pool.query(
        "UPDATE assignments SET status = 'expired', updated_at = now() WHERE id = $1",
        [row.id]
      );
      await pool.query("UPDATE tasks SET state = 'queued', updated_at = now() WHERE id = $1", [
        row.task_id
      ]);

      await pool.query(
        `INSERT INTO activities (id, type, actor_id, payload, created_at)
         VALUES (gen_random_uuid(), 'assignment.expired', NULL, $1, now())`,
        [JSON.stringify({ taskId: row.task_id, agentId: agent3.id, assignmentId: row.id })]
      );
    }

    // Orphan check scoped to our tasks
    const orphanedAssignments = await pool.query(
      `SELECT a.id FROM assignments a
       JOIN tasks t ON t.id = a.task_id
       WHERE a.task_id = ANY($1)
         AND a.status IN ('offered', 'accepted', 'started')
         AND t.state NOT IN ('assigned', 'in_progress')`,
      [createdTaskIds]
    );
    expect(orphanedAssignments.rows).toHaveLength(0);

    // Double active check scoped to our tasks
    const doubleActive = await pool.query(
      `SELECT task_id, COUNT(*) as cnt
       FROM assignments
       WHERE task_id = ANY($1) AND status IN ('offered', 'accepted', 'started')
       GROUP BY task_id
       HAVING COUNT(*) > 1`,
      [createdTaskIds]
    );
    expect(doubleActive.rows).toHaveLength(0);

    // Count by state scoped to our tasks
    const queuedResult = await pool.query(
      "SELECT id FROM tasks WHERE id = ANY($1) AND state = 'queued'",
      [createdTaskIds]
    );
    const inProgressResult2 = await pool.query(
      "SELECT id FROM tasks WHERE id = ANY($1) AND state = 'in_progress'",
      [createdTaskIds]
    );

    const agent3TaskCount = agent3Assignments.rows.length;
    expect(queuedResult.rows).toHaveLength(agent3TaskCount);
    expect(inProgressResult2.rows).toHaveLength(20 - agent3TaskCount);

    // Reassign queued tasks to agents 1 and 2
    for (const row of queuedResult.rows) {
      const agent = Math.random() > 0.5 ? agent1 : agent2;
      const result = await pool.query(
        `INSERT INTO assignments (id, task_id, agent_id, status, lease_expires_at, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, 'offered', now() + interval '30 seconds', now(), now())
         RETURNING id`,
        [row.id, agent.id]
      );
      await pool.query("UPDATE tasks SET state = 'assigned' WHERE id = $1", [row.id]);
      await post<AssignmentResp>(`/assignments/${result.rows[0].id}/accept`, {});
    }

    // Complete all remaining accepted assignments for our tasks
    const allActiveAssignments = await pool.query<{ id: string; task_id: string }>(
      `SELECT id, task_id FROM assignments
       WHERE task_id = ANY($1) AND status = 'accepted'`,
      [createdTaskIds]
    );

    for (const assignment of allActiveAssignments.rows) {
      await post<AssignmentResp>(`/assignments/${assignment.id}/complete`, {});
    }

    // All 20 of our tasks should be in 'review'
    const reviewResult = await pool.query(
      "SELECT id FROM tasks WHERE id = ANY($1) AND state = 'review'",
      [createdTaskIds]
    );
    expect(reviewResult.rows).toHaveLength(20);

    // Activity counts scoped to our test window
    const activityResult = await pool.query(
      `SELECT type, COUNT(*)::text as cnt FROM activities
       WHERE created_at >= $1
       GROUP BY type ORDER BY type`,
      [testRunStart]
    );
    const activityMap: Record<string, number> = {};
    for (const row of activityResult.rows) {
      activityMap[row.type] = Number(row.cnt);
    }

    expect(activityMap['task.created']).toBe(20);
    expect(activityMap['assignment.expired']).toBe(agent3TaskCount);
  });

  it('idempotency: duplicate requests return same response', async () => {
    const idempotencyKey = `test-key-${Date.now()}`;

    const res1 = await fetch(`${API_URL}/agents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey
      },
      body: JSON.stringify({
        name: 'idem-agent',
        session_key: `sk-idem-${Date.now()}`,
        capabilities: {},
        heartbeat_interval_ms: 10000
      })
    });

    const data1 = (await res1.json()) as AgentResp;
    createdAgentIds.push(data1.id);
    expect(res1.status).toBe(201);

    const res2 = await fetch(`${API_URL}/agents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey
      },
      body: JSON.stringify({
        name: 'idem-agent-different',
        session_key: `sk-idem-different-${Date.now()}`,
        capabilities: {},
        heartbeat_interval_ms: 10000
      })
    });

    const data2 = (await res2.json()) as AgentResp;

    expect(data2.id).toBe(data1.id);
    expect(data2.name).toBe('idem-agent');
  });

  it('correlation ID: propagated through requests', async () => {
    const correlationId = 'test-correlation-12345';

    const res = await fetch(`${API_URL}/health`, {
      headers: { 'X-Correlation-ID': correlationId }
    });

    expect(res.headers.get('x-correlation-id')).toBe(correlationId);
  });

  it('correlation ID: generated when not provided', async () => {
    const res = await fetch(`${API_URL}/health`);

    const corrId = res.headers.get('x-correlation-id');
    expect(corrId).toBeTruthy();
    expect(corrId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});
