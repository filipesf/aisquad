import { randomUUID } from 'node:crypto';
import { query } from '../services/db.js';
import type { CreateAgentInput, Agent, AgentStatus } from '@mc/shared';

interface AgentRow {
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

function rowToAgent(row: AgentRow): Agent {
  return {
    id: row.id,
    name: row.name,
    session_key: row.session_key,
    status: row.status as AgentStatus,
    capabilities: row.capabilities,
    heartbeat_interval_ms: row.heartbeat_interval_ms,
    last_seen_at: row.last_seen_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function createAgent(input: CreateAgentInput): Promise<Agent> {
  const id = randomUUID();
  const now = new Date().toISOString();

  const result = await query<AgentRow>(
    `INSERT INTO agents (id, name, session_key, status, capabilities, heartbeat_interval_ms, last_seen_at, created_at, updated_at)
     VALUES ($1, $2, $3, 'offline', $4, $5, NULL, $6, $6)
     RETURNING *`,
    [id, input.name, input.session_key, JSON.stringify(input.capabilities), input.heartbeat_interval_ms, now],
  );

  return rowToAgent(result.rows[0]!);
}

export async function getAgent(id: string): Promise<Agent | null> {
  const result = await query<AgentRow>('SELECT * FROM agents WHERE id = $1', [id]);
  return result.rows[0] ? rowToAgent(result.rows[0]) : null;
}

export async function listAgents(): Promise<Agent[]> {
  const result = await query<AgentRow>('SELECT * FROM agents ORDER BY created_at DESC');
  return result.rows.map(rowToAgent);
}

export async function markOnline(id: string, now: Date): Promise<Agent | null> {
  const result = await query<AgentRow>(
    `UPDATE agents SET status = 'online', last_seen_at = $2, updated_at = $2
     WHERE id = $1
     RETURNING *`,
    [id, now.toISOString()],
  );
  return result.rows[0] ? rowToAgent(result.rows[0]) : null;
}

export async function markOffline(id: string): Promise<Agent | null> {
  const result = await query<AgentRow>(
    `UPDATE agents SET status = 'offline', updated_at = now()
     WHERE id = $1 AND status != 'offline'
     RETURNING *`,
    [id],
  );
  return result.rows[0] ? rowToAgent(result.rows[0]) : null;
}

export async function updateLastSeen(id: string, now: Date): Promise<Agent | null> {
  const result = await query<AgentRow>(
    `UPDATE agents SET last_seen_at = $2, updated_at = $2
     WHERE id = $1
     RETURNING *`,
    [id, now.toISOString()],
  );
  return result.rows[0] ? rowToAgent(result.rows[0]) : null;
}

export interface StaleAgentRow {
  id: string;
  name: string;
  heartbeat_interval_ms: number;
  last_seen_at: string;
}

export async function findStaleAgents(now: Date): Promise<StaleAgentRow[]> {
  // Find agents that are online but haven't sent a heartbeat in 3x their interval
  const result = await query<StaleAgentRow>(
    `SELECT id, name, heartbeat_interval_ms, last_seen_at::text
     FROM agents
     WHERE status = 'online'
       AND last_seen_at IS NOT NULL
       AND EXTRACT(EPOCH FROM ($1::timestamptz - last_seen_at)) * 1000 > heartbeat_interval_ms * 3`,
    [now.toISOString()],
  );
  return result.rows;
}
