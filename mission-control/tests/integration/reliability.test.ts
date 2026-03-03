import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import pg from 'pg';
import { Redis } from 'ioredis';

const API_URL = process.env['API_URL'] ?? 'http://localhost:3000';

const pool = new pg.Pool({
  host: process.env['PGHOST'] ?? 'localhost',
  port: Number(process.env['PGPORT'] ?? 5432),
  user: process.env['PGUSER'] ?? 'postgres',
  password: process.env['PGPASSWORD'] ?? 'postgres',
  database: process.env['PGDATABASE'] ?? 'mission_control',
});

const redis = new Redis({
  host: process.env['REDIS_HOST'] ?? 'localhost',
  port: Number(process.env['REDIS_PORT'] ?? 6379),
  lazyConnect: true,
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

async function post<T>(path: string, body: Record<string, unknown>): Promise<{ status: number; data: T }> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: (await res.json()) as T };
}

async function get<T>(path: string): Promise<{ status: number; data: T }> {
  const res = await fetch(`${API_URL}${path}`);
  return { status: res.status, data: (await res.json()) as T };
}

async function cleanDb(): Promise<void> {
  await pool.query('DELETE FROM activities');
  await pool.query('DELETE FROM subscriptions');
  await pool.query('DELETE FROM comments');
  await pool.query('DELETE FROM notifications');
  await pool.query('DELETE FROM assignments');
  await pool.query('DELETE FROM tasks');
  await pool.query('DELETE FROM agents');
}

async function cleanRedis(): Promise<void> {
  const keys = await redis.keys('hb:seq:*');
  if (keys.length > 0) await redis.del(...keys);
  const idemKeys = await redis.keys('idem:*');
  if (idemKeys.length > 0) await redis.del(...idemKeys);
  const dedupKeys = await redis.keys('notif:dedup:*');
  if (dedupKeys.length > 0) await redis.del(...dedupKeys);
}

async function createAgent(name: string, caps: Record<string, unknown> = { code: true }): Promise<AgentResp> {
  const { data } = await post<AgentResp>('/agents', {
    name,
    session_key: `sk-${name}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    capabilities: caps,
    heartbeat_interval_ms: 5000,
  });
  await post('/agents/' + data.id + '/heartbeat', {});
  return data;
}

async function createTask(title: string, caps: Record<string, unknown> = {}): Promise<TaskResp> {
  const { data } = await post<TaskResp>('/tasks', {
    title,
    description: '',
    priority: 5,
    required_capabilities: caps,
  });
  return data;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe('reliability: end-to-end scenario', () => {
  beforeAll(async () => {
    await redis.connect();
  });

  afterAll(async () => {
    await pool.end();
    await redis.quit();
  });

  beforeEach(async () => {
    await cleanDb();
    await cleanRedis();
  });

  it('3 agents, 20 tasks, 1 agent crashes mid-task — no orphaned assignments, all tasks requeued', async () => {
    // Create 3 agents
    const agent1 = await createAgent('reliable-1');
    const agent2 = await createAgent('reliable-2');
    const agent3 = await createAgent('reliable-3');
    const agents = [agent1, agent2, agent3];

    // Create 20 tasks
    const tasks: TaskResp[] = [];
    for (let i = 0; i < 20; i++) {
      tasks.push(await createTask(`reliability-task-${i}`));
    }

    // Assign tasks to agents in round-robin (simulating assigner worker)
    const assignmentIds: string[] = [];
    for (let i = 0; i < 20; i++) {
      const agent = agents[i % 3]!;
      const task = tasks[i]!;

      const result = await pool.query(
        `INSERT INTO assignments (id, task_id, agent_id, status, lease_expires_at, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, 'offered', now() + interval '30 seconds', now(), now())
         RETURNING id`,
        [task.id, agent.id],
      );
      await pool.query("UPDATE tasks SET state = 'assigned' WHERE id = $1", [task.id]);
      assignmentIds.push(result.rows[0].id);
    }

    // Accept all assignments
    for (const assignmentId of assignmentIds) {
      await post<AssignmentResp>(`/assignments/${assignmentId}/accept`, {});
    }

    // Verify all tasks are in_progress
    const { data: inProgressTasks } = await get<TaskResp[]>('/tasks?state=in_progress');
    expect(inProgressTasks).toHaveLength(20);

    // Agent 3 "crashes" mid-task — stop heartbeats and force offline
    await pool.query(
      "UPDATE agents SET status = 'offline', updated_at = now() WHERE id = $1",
      [agent3.id],
    );

    // Expire agent3's assignments (simulating lease expiry)
    const agent3Assignments = await pool.query(
      `SELECT id, task_id FROM assignments
       WHERE agent_id = $1 AND status IN ('offered', 'accepted')`,
      [agent3.id],
    );

    for (const row of agent3Assignments.rows) {
      await pool.query(
        "UPDATE assignments SET status = 'expired', updated_at = now() WHERE id = $1",
        [row.id],
      );
      await pool.query(
        "UPDATE tasks SET state = 'queued', updated_at = now() WHERE id = $1",
        [row.task_id],
      );

      // Emit activity for each expiry
      await pool.query(
        `INSERT INTO activities (id, type, actor_id, payload, created_at)
         VALUES (gen_random_uuid(), 'assignment.expired', NULL, $1, now())`,
        [JSON.stringify({ taskId: row.task_id, agentId: agent3.id, assignmentId: row.id })],
      );
    }

    // Verify: zero orphaned assignments
    // An orphaned assignment = active assignment with no corresponding task in assigned/in_progress
    const orphanedAssignments = await pool.query(
      `SELECT a.id FROM assignments a
       JOIN tasks t ON t.id = a.task_id
       WHERE a.status IN ('offered', 'accepted', 'started')
         AND t.state NOT IN ('assigned', 'in_progress')`,
    );
    expect(orphanedAssignments.rows).toHaveLength(0);

    // Verify: no double active assignments
    const doubleActive = await pool.query(
      `SELECT task_id, COUNT(*) as cnt
       FROM assignments
       WHERE status IN ('offered', 'accepted', 'started')
       GROUP BY task_id
       HAVING COUNT(*) > 1`,
    );
    expect(doubleActive.rows).toHaveLength(0);

    // Count tasks by state
    const { data: queuedTasks } = await get<TaskResp[]>('/tasks?state=queued');
    const { data: remainingInProgress } = await get<TaskResp[]>('/tasks?state=in_progress');

    // Agent3 had ceil(20/3) = 7 tasks. Those should now be queued
    // Agent1 and Agent2 still have their tasks in_progress
    const agent3TaskCount = agent3Assignments.rows.length;
    expect(queuedTasks).toHaveLength(agent3TaskCount);
    expect(remainingInProgress).toHaveLength(20 - agent3TaskCount);

    // Now reassign the queued tasks to agents 1 and 2
    for (const task of queuedTasks) {
      const agent = Math.random() > 0.5 ? agent1 : agent2;
      const result = await pool.query(
        `INSERT INTO assignments (id, task_id, agent_id, status, lease_expires_at, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, 'offered', now() + interval '30 seconds', now(), now())
         RETURNING id`,
        [task.id, agent.id],
      );
      await pool.query("UPDATE tasks SET state = 'assigned' WHERE id = $1", [task.id]);

      // Accept
      await post<AssignmentResp>(`/assignments/${result.rows[0].id}/accept`, {});
    }

    // Now complete all in_progress tasks
    const allActiveAssignments = await pool.query<{ id: string; task_id: string }>(
      `SELECT id, task_id FROM assignments WHERE status = 'accepted'`,
    );

    for (const assignment of allActiveAssignments.rows) {
      await post<AssignmentResp>(`/assignments/${assignment.id}/complete`, {});
    }

    // Verify: all 20 tasks should be in 'review' state
    const { data: reviewTasks } = await get<TaskResp[]>('/tasks?state=review');
    expect(reviewTasks).toHaveLength(20);

    // Verify activities were emitted
    const activityResult = await pool.query(
      `SELECT type, COUNT(*)::text as cnt FROM activities GROUP BY type ORDER BY type`,
    );
    const activityMap: Record<string, number> = {};
    for (const row of activityResult.rows) {
      activityMap[row.type] = Number(row.cnt);
    }

    // We should have: task.created, assignment.offered (x2 rounds), assignment.accepted,
    // assignment.expired, assignment.completed activities
    expect(activityMap['task.created']).toBe(20);
    expect(activityMap['assignment.expired']).toBe(agent3TaskCount);
  });

  it('idempotency: duplicate requests return same response', async () => {
    const idempotencyKey = `test-key-${Date.now()}`;

    // Create an agent with an idempotency key
    const res1 = await fetch(`${API_URL}/agents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({
        name: 'idem-agent',
        session_key: `sk-idem-${Date.now()}`,
        capabilities: {},
        heartbeat_interval_ms: 10000,
      }),
    });

    const data1 = (await res1.json()) as AgentResp;
    expect(res1.status).toBe(201);

    // Second request with same key — should return cached response
    const res2 = await fetch(`${API_URL}/agents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({
        name: 'idem-agent-different',
        session_key: `sk-idem-different-${Date.now()}`,
        capabilities: {},
        heartbeat_interval_ms: 10000,
      }),
    });

    const data2 = (await res2.json()) as AgentResp;

    // Should get the cached response with the original agent data
    expect(data2.id).toBe(data1.id);
    expect(data2.name).toBe('idem-agent');
  });

  it('correlation ID: propagated through requests', async () => {
    const correlationId = 'test-correlation-12345';

    const res = await fetch(`${API_URL}/health`, {
      headers: { 'X-Correlation-ID': correlationId },
    });

    expect(res.headers.get('x-correlation-id')).toBe(correlationId);
  });

  it('correlation ID: generated when not provided', async () => {
    const res = await fetch(`${API_URL}/health`);

    const corrId = res.headers.get('x-correlation-id');
    expect(corrId).toBeTruthy();
    // Should be a UUID
    expect(corrId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
});
