import { Redis } from 'ioredis';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

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
  current_assignment?: AssignmentResp | null;
}

interface AssignmentResp {
  id: string;
  task_id: string;
  agent_id: string;
  status: string;
  lease_expires_at: string | null;
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

async function patch<T>(
  path: string,
  body: Record<string, unknown>
): Promise<{ status: number; data: T }> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return { status: res.status, data: (await res.json()) as T };
}

async function get<T>(path: string): Promise<{ status: number; data: T }> {
  const res = await fetch(`${API_URL}${path}`);
  return { status: res.status, data: (await res.json()) as T };
}

async function cleanDb() {
  await pool.query('DELETE FROM activities');
  await pool.query('DELETE FROM subscriptions');
  await pool.query('DELETE FROM comments');
  await pool.query('DELETE FROM notifications');
  await pool.query('DELETE FROM assignments');
  await pool.query('DELETE FROM tasks');
  await pool.query('DELETE FROM agents');
}

async function cleanRedis() {
  const keys = await redis.keys('hb:seq:*');
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}

async function createAgent(
  name: string,
  capabilities: Record<string, unknown> = {}
): Promise<AgentResp> {
  const { data } = await post<AgentResp>('/agents', {
    name,
    session_key: `sk-${name}-${Date.now()}`,
    capabilities,
    heartbeat_interval_ms: 10000
  });
  // Send heartbeat to make online
  await post(`/agents/${data.id}/heartbeat`, {});
  return data;
}

async function createTask(
  title: string,
  requiredCapabilities: Record<string, unknown> = {}
): Promise<TaskResp> {
  const { data } = await post<TaskResp>('/tasks', {
    title,
    description: `Description for ${title}`,
    priority: 5,
    required_capabilities: requiredCapabilities
  });
  return data;
}

describe('assignment integration', () => {
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

  it('creates a task in queued state', async () => {
    const task = await createTask('Test Task');
    expect(task.state).toBe('queued');
  });

  it('lists tasks filtered by state', async () => {
    await createTask('Task A');
    await createTask('Task B');

    const { data: all } = await get<TaskResp[]>('/tasks');
    expect(all).toHaveLength(2);

    const { data: queued } = await get<TaskResp[]>('/tasks?state=queued');
    expect(queued).toHaveLength(2);

    const { data: done } = await get<TaskResp[]>('/tasks?state=done');
    expect(done).toHaveLength(0);
  });

  it('rejects invalid state transitions', async () => {
    const task = await createTask('No Skip');

    // queued → done is invalid
    const { status, data } = await patch<{ error: string }>(`/tasks/${task.id}/state`, {
      state: 'done'
    });
    expect(status).toBe(422);
    expect(data.error).toContain('Invalid state transition');
  });

  it('allows valid state transitions', async () => {
    const task = await createTask('Progressing');

    // queued → assigned (need to do via internal mechanism or direct)
    const { data: assigned } = await patch<TaskResp>(`/tasks/${task.id}/state`, {
      state: 'assigned'
    });
    expect(assigned.state).toBe('assigned');
  });

  it('full lifecycle: create → assign → accept → complete', async () => {
    const agent = await createAgent('worker-1', { code: true });
    const task = await createTask('Build feature', { code: true });

    // Manually offer assignment via DB (simulating assigner worker)
    const assignmentResult = await pool.query(
      `INSERT INTO assignments (id, task_id, agent_id, status, lease_expires_at, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 'offered', now() + interval '30 seconds', now(), now())
       RETURNING id`,
      [task.id, agent.id]
    );
    const assignmentId = assignmentResult.rows[0].id;

    // Update task state
    await pool.query("UPDATE tasks SET state = 'assigned' WHERE id = $1", [task.id]);

    // Accept
    const { data: accepted } = await post<AssignmentResp>(
      `/assignments/${assignmentId}/accept`,
      {}
    );
    expect(accepted.status).toBe('accepted');

    // Check task is in_progress
    const { data: inProgress } = await get<TaskResp>(`/tasks/${task.id}`);
    expect(inProgress.state).toBe('in_progress');

    // Complete
    const { data: completed } = await post<AssignmentResp>(
      `/assignments/${assignmentId}/complete`,
      {}
    );
    expect(completed.status).toBe('completed');

    // Check task is in review
    const { data: review } = await get<TaskResp>(`/tasks/${task.id}`);
    expect(review.state).toBe('review');
  });

  it('lease expiry requeues the task', async () => {
    const agent = await createAgent('worker-exp', { code: true });
    const task = await createTask('Expiring task', { code: true });

    // Create an assignment with an already-expired lease
    await pool.query(
      `INSERT INTO assignments (id, task_id, agent_id, status, lease_expires_at, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 'offered', now() - interval '1 second', now(), now())`,
      [task.id, agent.id]
    );
    await pool.query("UPDATE tasks SET state = 'assigned' WHERE id = $1", [task.id]);

    // Simulate what the assigner worker does: expire stale leases
    const expired = await pool.query(
      `SELECT id, task_id FROM assignments
       WHERE status IN ('offered', 'accepted') AND lease_expires_at < now()`
    );
    expect(expired.rows).toHaveLength(1);

    // Expire it
    await pool.query(
      "UPDATE assignments SET status = 'expired', updated_at = now() WHERE id = $1",
      [expired.rows[0].id]
    );
    await pool.query("UPDATE tasks SET state = 'queued', updated_at = now() WHERE id = $1", [
      task.id
    ]);

    // Verify task is back to queued
    const { data: requeued } = await get<TaskResp>(`/tasks/${task.id}`);
    expect(requeued.state).toBe('queued');
  });

  it('reassignment after agent crash (offline mid-task)', async () => {
    const agent1 = await createAgent('crash-agent', { code: true });
    const agent2 = await createAgent('backup-agent', { code: true });
    const task = await createTask('Critical task', { code: true });

    // Assign to agent1
    const a1Result = await pool.query(
      `INSERT INTO assignments (id, task_id, agent_id, status, lease_expires_at, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 'offered', now() - interval '1 second', now(), now())
       RETURNING id`,
      [task.id, agent1.id]
    );
    await pool.query("UPDATE tasks SET state = 'assigned' WHERE id = $1", [task.id]);

    // Agent1 "crashes" — expire the lease
    await pool.query(
      "UPDATE assignments SET status = 'expired', updated_at = now() WHERE id = $1",
      [a1Result.rows[0].id]
    );
    await pool.query("UPDATE tasks SET state = 'queued', updated_at = now() WHERE id = $1", [
      task.id
    ]);

    // Now assign to agent2
    const a2Result = await pool.query(
      `INSERT INTO assignments (id, task_id, agent_id, status, lease_expires_at, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 'offered', now() + interval '30 seconds', now(), now())
       RETURNING id`,
      [task.id, agent2.id]
    );
    await pool.query("UPDATE tasks SET state = 'assigned' WHERE id = $1", [task.id]);

    // Agent2 accepts and completes
    const { data: accepted } = await post<AssignmentResp>(
      `/assignments/${a2Result.rows[0].id}/accept`,
      {}
    );
    expect(accepted.status).toBe('accepted');

    const { data: completed } = await post<AssignmentResp>(
      `/assignments/${a2Result.rows[0].id}/complete`,
      {}
    );
    expect(completed.status).toBe('completed');

    const { data: finalTask } = await get<TaskResp>(`/tasks/${task.id}`);
    expect(finalTask.state).toBe('review');
  });
});
