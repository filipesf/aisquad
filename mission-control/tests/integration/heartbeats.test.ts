import { Redis } from 'ioredis';
import pg from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

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

async function cleanRedis() {
  const keys = await redis.keys('hb:seq:*');
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}

describe('heartbeats integration', () => {
  // Track IDs created in each test so cleanup is scoped to what we made
  let testRunStart: Date;
  const createdAgentIds: string[] = [];

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
  });

  afterEach(async () => {
    // Deleting agents cascades: assignments, comments, notifications, subscriptions
    if (createdAgentIds.length > 0) {
      await pool.query('DELETE FROM agents WHERE id = ANY($1)', [createdAgentIds]);
    }
    await pool.query('DELETE FROM activities WHERE created_at >= $1', [testRunStart]);
    await cleanRedis();
  });

  async function createAgent(body: Record<string, unknown>): Promise<AgentResponse> {
    const { data } = await post<AgentResponse>('/agents', body);
    createdAgentIds.push(data.id);
    return data;
  }

  it('registers an agent and returns it', async () => {
    const { status, data } = await post<AgentResponse>('/agents', {
      name: 'agent-alpha',
      session_key: 'sk-alpha',
      capabilities: { code: true },
      heartbeat_interval_ms: 5000
    });
    createdAgentIds.push(data.id);

    expect(status).toBe(201);
    expect(data.name).toBe('agent-alpha');
    expect(data.status).toBe('offline');
    expect(data.capabilities).toEqual({ code: true });
  });

  it('lists all agents', async () => {
    await createAgent({ name: 'a1', session_key: 'sk-1' });
    await createAgent({ name: 'a2', session_key: 'sk-2' });

    const { data } = await get<AgentResponse[]>('/agents');
    // Filter to only our test agents to avoid depending on pre-existing DB state
    const ours = data.filter((a) => createdAgentIds.includes(a.id));
    expect(ours).toHaveLength(2);
  });

  it('transitions offline → online on first heartbeat', async () => {
    const agent = await createAgent({ name: 'agent-hb', session_key: 'sk-hb' });

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
    const agent = await createAgent({ name: 'agent-act', session_key: 'sk-act' });

    await post<HeartbeatResponse>(`/agents/${agent.id}/heartbeat`, {});

    const result = await pool.query(
      "SELECT * FROM activities WHERE type = 'agent.online' AND payload->>'agentId' = $1 ORDER BY created_at DESC LIMIT 1",
      [agent.id]
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].payload.agentId).toBe(agent.id);
  });

  it('rejects duplicate heartbeats with same sequence_id', async () => {
    const agent = await createAgent({ name: 'agent-dup', session_key: 'sk-dup' });

    const r1 = await post<HeartbeatResponse>(`/agents/${agent.id}/heartbeat`, {
      sequence_id: 'seq-001'
    });
    expect(r1.data.duplicate).toBe(false);

    const r2 = await post<HeartbeatResponse>(`/agents/${agent.id}/heartbeat`, {
      sequence_id: 'seq-001'
    });
    expect(r2.data.duplicate).toBe(true);
  });

  it('allows different sequence_ids', async () => {
    const agent = await createAgent({ name: 'agent-seq', session_key: 'sk-seq' });

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
    const agent = await createAgent({
      name: 'agent-offline',
      session_key: 'sk-offline',
      heartbeat_interval_ms: 1000
    });

    await post<HeartbeatResponse>(`/agents/${agent.id}/heartbeat`, {});
    const { data: online } = await get<AgentResponse>(`/agents/${agent.id}`);
    expect(online.status).toBe('online');

    await pool.query(
      "UPDATE agents SET last_seen_at = now() - interval '5 seconds' WHERE id = $1",
      [agent.id]
    );

    const stale = await pool.query(
      `SELECT id FROM agents
       WHERE id = $1
         AND status = 'online'
         AND last_seen_at IS NOT NULL
         AND EXTRACT(EPOCH FROM (now() - last_seen_at)) * 1000 > heartbeat_interval_ms * 3`,
      [agent.id]
    );
    expect(stale.rows).toHaveLength(1);

    await pool.query("UPDATE agents SET status = 'offline', updated_at = now() WHERE id = $1", [
      agent.id
    ]);

    const { data: offlineAgent } = await get<AgentResponse>(`/agents/${agent.id}`);
    expect(offlineAgent.status).toBe('offline');
  });

  it('agent recovers from offline to online when heartbeats resume', async () => {
    const agent = await createAgent({ name: 'agent-recover', session_key: 'sk-recover' });

    await post<HeartbeatResponse>(`/agents/${agent.id}/heartbeat`, {});
    let { data: check } = await get<AgentResponse>(`/agents/${agent.id}`);
    expect(check.status).toBe('online');

    await pool.query("UPDATE agents SET status = 'offline' WHERE id = $1", [agent.id]);
    ({ data: check } = await get<AgentResponse>(`/agents/${agent.id}`));
    expect(check.status).toBe('offline');

    await post<HeartbeatResponse>(`/agents/${agent.id}/heartbeat`, {});
    ({ data: check } = await get<AgentResponse>(`/agents/${agent.id}`));
    expect(check.status).toBe('online');

    const result = await pool.query(
      "SELECT * FROM activities WHERE type = 'agent.online' AND payload->>'agentId' = $1 ORDER BY created_at DESC",
      [agent.id]
    );
    expect(result.rows.length).toBeGreaterThanOrEqual(2);
  });
});
