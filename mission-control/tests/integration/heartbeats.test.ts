import { Redis } from 'ioredis';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const API_URL = process.env.API_URL ?? 'http://localhost:3000';

interface AgentResponse {
  id: string;
  name: string;
  session_key: string;
  status: string;
  capabilities: Record<string, unknown>;
  heartbeat_interval_ms: number;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
}

interface HeartbeatResponse {
  ok: boolean;
  duplicate: boolean;
}

interface ErrorResponse {
  error: string;
}

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

interface ApiResponse<T = Record<string, unknown>> {
  status: number;
  data: T;
}

async function post<T = Record<string, unknown>>(
  path: string,
  body: Record<string, unknown>
): Promise<ApiResponse<T>> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return { status: res.status, data: (await res.json()) as T };
}

async function get<T = Record<string, unknown>>(path: string): Promise<ApiResponse<T>> {
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

describe('heartbeats integration', () => {
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

  it('registers an agent and returns it', async () => {
    const { status, data } = await post<AgentResponse>('/agents', {
      name: 'agent-alpha',
      session_key: 'sk-alpha',
      capabilities: { code: true },
      heartbeat_interval_ms: 5000
    });

    expect(status).toBe(201);
    expect(data.name).toBe('agent-alpha');
    expect(data.status).toBe('offline');
    expect(data.capabilities).toEqual({ code: true });
  });

  it('lists all agents', async () => {
    await post<AgentResponse>('/agents', { name: 'a1', session_key: 'sk-1' });
    await post<AgentResponse>('/agents', { name: 'a2', session_key: 'sk-2' });

    const { data } = await get<AgentResponse[]>('/agents');
    expect(data).toHaveLength(2);
  });

  it('transitions offline → online on first heartbeat', async () => {
    const { data: agent } = await post<AgentResponse>('/agents', {
      name: 'agent-hb',
      session_key: 'sk-hb'
    });

    expect(agent.status).toBe('offline');

    // Send heartbeat
    const { data: hbResult } = await post<HeartbeatResponse>(`/agents/${agent.id}/heartbeat`, {});
    expect(hbResult.ok).toBe(true);

    // Check agent is now online
    const { data: updated } = await get<AgentResponse>(`/agents/${agent.id}`);
    expect(updated.status).toBe('online');
    expect(updated.last_seen_at).toBeTruthy();
  });

  it('emits agent.online activity on transition', async () => {
    const { data: agent } = await post<AgentResponse>('/agents', {
      name: 'agent-act',
      session_key: 'sk-act'
    });

    await post<HeartbeatResponse>(`/agents/${agent.id}/heartbeat`, {});

    // Check activities table
    const result = await pool.query(
      "SELECT * FROM activities WHERE type = 'agent.online' ORDER BY created_at DESC LIMIT 1"
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].payload.agentId).toBe(agent.id);
  });

  it('rejects duplicate heartbeats with same sequence_id', async () => {
    const { data: agent } = await post<AgentResponse>('/agents', {
      name: 'agent-dup',
      session_key: 'sk-dup'
    });

    // First heartbeat with sequence
    const r1 = await post<HeartbeatResponse>(`/agents/${agent.id}/heartbeat`, {
      sequence_id: 'seq-001'
    });
    expect(r1.data.duplicate).toBe(false);

    // Second heartbeat with same sequence
    const r2 = await post<HeartbeatResponse>(`/agents/${agent.id}/heartbeat`, {
      sequence_id: 'seq-001'
    });
    expect(r2.data.duplicate).toBe(true);
  });

  it('allows different sequence_ids', async () => {
    const { data: agent } = await post<AgentResponse>('/agents', {
      name: 'agent-seq',
      session_key: 'sk-seq'
    });

    const r1 = await post<HeartbeatResponse>(`/agents/${agent.id}/heartbeat`, {
      sequence_id: 'seq-001'
    });
    const r2 = await post<HeartbeatResponse>(`/agents/${agent.id}/heartbeat`, {
      sequence_id: 'seq-002'
    });

    expect(r1.data.duplicate).toBe(false);
    expect(r2.data.duplicate).toBe(false);
  });

  it('returns 404 for heartbeat on non-existent agent', async () => {
    const { status } = await post<ErrorResponse>(
      '/agents/00000000-0000-0000-0000-000000000099/heartbeat',
      {}
    );
    expect(status).toBe(404);
  });

  it('agent goes offline when heartbeats stop (offline detector simulation)', async () => {
    const { data: agent } = await post<AgentResponse>('/agents', {
      name: 'agent-offline',
      session_key: 'sk-offline',
      heartbeat_interval_ms: 1000 // 1 second interval
    });

    // Send heartbeat to go online
    await post<HeartbeatResponse>(`/agents/${agent.id}/heartbeat`, {});
    const { data: online } = await get<AgentResponse>(`/agents/${agent.id}`);
    expect(online.status).toBe('online');

    // Simulate time passing: update last_seen_at to 5 seconds ago
    await pool.query(
      "UPDATE agents SET last_seen_at = now() - interval '5 seconds' WHERE id = $1",
      [agent.id]
    );

    // Run what the offline detector would do
    const stale = await pool.query(
      `SELECT id FROM agents
       WHERE status = 'online'
         AND last_seen_at IS NOT NULL
         AND EXTRACT(EPOCH FROM (now() - last_seen_at)) * 1000 > heartbeat_interval_ms * 3`
    );
    expect(stale.rows).toHaveLength(1);

    // Mark offline
    await pool.query("UPDATE agents SET status = 'offline', updated_at = now() WHERE id = $1", [
      agent.id
    ]);

    const { data: offlineAgent } = await get<AgentResponse>(`/agents/${agent.id}`);
    expect(offlineAgent.status).toBe('offline');
  });

  it('agent recovers from offline to online when heartbeats resume', async () => {
    const { data: agent } = await post<AgentResponse>('/agents', {
      name: 'agent-recover',
      session_key: 'sk-recover'
    });

    // Go online
    await post<HeartbeatResponse>(`/agents/${agent.id}/heartbeat`, {});
    let { data: check } = await get<AgentResponse>(`/agents/${agent.id}`);
    expect(check.status).toBe('online');

    // Force offline
    await pool.query("UPDATE agents SET status = 'offline' WHERE id = $1", [agent.id]);
    ({ data: check } = await get<AgentResponse>(`/agents/${agent.id}`));
    expect(check.status).toBe('offline');

    // Resume heartbeats
    await post<HeartbeatResponse>(`/agents/${agent.id}/heartbeat`, {});
    ({ data: check } = await get<AgentResponse>(`/agents/${agent.id}`));
    expect(check.status).toBe('online');

    // Check agent.online activity was emitted again
    const result = await pool.query(
      "SELECT * FROM activities WHERE type = 'agent.online' AND payload->>'agentId' = $1 ORDER BY created_at DESC",
      [agent.id]
    );
    expect(result.rows.length).toBeGreaterThanOrEqual(2); // Initial + recovery
  });
});
