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

async function get<T>(path: string): Promise<{ status: number; data: T }> {
  const res = await fetch(`${API_URL}${path}`);
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

beforeAll(async () => {
  await redis.connect();
});

afterAll(async () => {
  await pool.end();
  await redis.quit();
});

// ── chaos: agent churn ────────────────────────────────────────────

describe('chaos: agent churn', () => {
  let testRunStart: Date;
  const createdAgentIds: string[] = [];
  const createdTaskIds: string[] = [];

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

  function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  it('handles rapid online/offline transitions with concurrent heartbeats', async () => {
    const agents: AgentResp[] = [];
    for (let i = 0; i < 5; i++) {
      agents.push(await createAgent(`churn-agent-${i}`));
    }

    const heartbeatPromises = agents.map(async (agent) => {
      for (let j = 0; j < 10; j++) {
        await post(`/agents/${agent.id}/heartbeat`, {});
        await sleep(50);
      }
    });

    await Promise.all(heartbeatPromises);

    // Check only the agents we created
    const { data: allAgents } = await get<AgentResp[]>('/agents');
    const ours = allAgents.filter((a) => createdAgentIds.includes(a.id));
    const onlineCount = ours.filter((a) => a.status === 'online').length;
    expect(onlineCount).toBe(5);

    for (let i = 0; i < 3; i++) {
      await pool.query("UPDATE agents SET status = 'offline', updated_at = now() WHERE id = $1", [
        agents[i]?.id
      ]);
    }

    const { data: mixedAgents } = await get<AgentResp[]>('/agents');
    const oursMixed = mixedAgents.filter((a) => createdAgentIds.includes(a.id));
    const offlineCount = oursMixed.filter((a) => a.status === 'offline').length;
    expect(offlineCount).toBe(3);

    for (let i = 0; i < 3; i++) {
      await post(`/agents/${agents[i]?.id}/heartbeat`, {});
    }

    const { data: recoveredAgents } = await get<AgentResp[]>('/agents');
    const oursRecovered = recoveredAgents.filter((a) => createdAgentIds.includes(a.id));
    const allOnline = oursRecovered.every((a) => a.status === 'online');
    expect(allOnline).toBe(true);
  });

  it('maintains data consistency after rapid agent state changes', async () => {
    const agent = await createAgent('consistency-agent');

    const operations: Promise<unknown>[] = [];
    for (let i = 0; i < 20; i++) {
      operations.push(post(`/agents/${agent.id}/heartbeat`, {}));
    }

    await Promise.all(operations);

    const { data: finalAgent } = await get<AgentResp>(`/agents/${agent.id}`);
    expect(['online', 'offline']).toContain(finalAgent.status);
  });
});

// ── chaos: concurrent assignment attempts ─────────────────────────

describe('chaos: concurrent assignment attempts', () => {
  let testRunStart: Date;
  const createdAgentIds: string[] = [];
  const createdTaskIds: string[] = [];

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

  it('prevents double assignment when multiple agents race for the same task', async () => {
    const agents: AgentResp[] = [];
    for (let i = 0; i < 5; i++) {
      agents.push(await createAgent(`racer-${i}`));
    }

    const task = await createTask('Contested Task');

    const raceResults = await Promise.allSettled(
      agents.map(async (agent) => {
        return pool.query(
          `INSERT INTO assignments (id, task_id, agent_id, status, lease_expires_at, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, 'offered', now() + interval '30 seconds', now(), now())`,
          [task.id, agent.id]
        );
      })
    );

    const successes = raceResults.filter((r) => r.status === 'fulfilled');
    const failures = raceResults.filter((r) => r.status === 'rejected');

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(4);

    const activeResult = await pool.query(
      `SELECT COUNT(*) as cnt FROM assignments
       WHERE task_id = $1 AND status IN ('offered', 'accepted', 'started')`,
      [task.id]
    );
    expect(Number(activeResult.rows[0].cnt)).toBe(1);
  });

  it('handles concurrent accept attempts on the same assignment', async () => {
    const agent = await createAgent('accepter');
    const task = await createTask('Accept Race Task');

    const insertResult = await pool.query(
      `INSERT INTO assignments (id, task_id, agent_id, status, lease_expires_at, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 'offered', now() + interval '30 seconds', now(), now())
       RETURNING id`,
      [task.id, agent.id]
    );
    await pool.query("UPDATE tasks SET state = 'assigned' WHERE id = $1", [task.id]);
    const assignmentId = insertResult.rows[0].id;

    const acceptResults = await Promise.all(
      Array.from({ length: 5 }, () =>
        post<AssignmentResp>(`/assignments/${assignmentId}/accept`, {})
      )
    );

    const succeeded = acceptResults.filter((r) => r.status === 200);
    expect(succeeded).toHaveLength(1);
    expect(succeeded[0]?.data.status).toBe('accepted');
  });
});

// ── chaos: worker restart simulation ─────────────────────────────

describe('chaos: worker restart simulation', () => {
  let testRunStart: Date;
  const createdAgentIds: string[] = [];
  const createdTaskIds: string[] = [];

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

  it('state remains consistent after simulated worker restart mid-processing', async () => {
    const agent = await createAgent('restart-agent');
    const tasks: TaskResp[] = [];
    for (let i = 0; i < 10; i++) {
      tasks.push(await createTask(`restart-task-${i}`));
    }

    for (let i = 0; i < 5; i++) {
      try {
        await pool.query(
          `INSERT INTO assignments (id, task_id, agent_id, status, lease_expires_at, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, 'offered', now() + interval '30 seconds', now(), now())`,
          [tasks[i]?.id, agent.id]
        );
        await pool.query("UPDATE tasks SET state = 'assigned' WHERE id = $1", [tasks[i]?.id]);
      } catch {
        // Ignore constraint violations
      }
    }

    // Verify only our tasks are in valid states
    const taskResult = await pool.query(
      'SELECT state, COUNT(*)::text as cnt FROM tasks WHERE id = ANY($1) GROUP BY state',
      [createdTaskIds]
    );

    const validStates = new Set(['queued', 'assigned', 'in_progress', 'review', 'done', 'blocked']);
    for (const row of taskResult.rows) {
      expect(validStates.has(row.state)).toBe(true);
    }

    // Every assigned task (among ours) should have exactly 1 active assignment
    const orphanCheck = await pool.query(
      `SELECT t.id, t.title FROM tasks t
       WHERE t.id = ANY($1)
         AND t.state = 'assigned'
         AND NOT EXISTS (
           SELECT 1 FROM assignments a
           WHERE a.task_id = t.id AND a.status IN ('offered', 'accepted', 'started')
         )`,
      [createdTaskIds]
    );
    expect(orphanCheck.rows).toHaveLength(0);

    // No task (among ours) should have multiple active assignments
    const doubleActive = await pool.query(
      `SELECT task_id, COUNT(*) as cnt
       FROM assignments
       WHERE task_id = ANY($1) AND status IN ('offered', 'accepted', 'started')
       GROUP BY task_id
       HAVING COUNT(*) > 1`,
      [createdTaskIds]
    );
    expect(doubleActive.rows).toHaveLength(0);
  });
});
