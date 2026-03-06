import { randomUUID } from 'node:crypto';
import { query } from '../services/db.js';

interface SubscriptionRow {
  id: string;
  task_id: string;
  agent_id: string;
  created_at: string;
}

/**
 * Subscribe an agent to a task. Uses ON CONFLICT to be idempotent.
 */
export async function subscribe(taskId: string, agentId: string): Promise<SubscriptionRow> {
  const id = randomUUID();
  const result = await query<SubscriptionRow>(
    `INSERT INTO subscriptions (id, task_id, agent_id, created_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (task_id, agent_id) DO NOTHING
     RETURNING *`,
    [id, taskId, agentId]
  );

  // If ON CONFLICT hit, fetch existing
  if (result.rows.length === 0) {
    const existing = await query<SubscriptionRow>(
      'SELECT * FROM subscriptions WHERE task_id = $1 AND agent_id = $2',
      [taskId, agentId]
    );
    return existing.rows[0]!;
  }

  return result.rows[0]!;
}

/**
 * Get all agent IDs subscribed to a task.
 */
export async function getSubscribers(taskId: string): Promise<string[]> {
  const result = await query<{ agent_id: string }>(
    'SELECT agent_id FROM subscriptions WHERE task_id = $1',
    [taskId]
  );
  return result.rows.map((r) => r.agent_id);
}

/**
 * Check if an agent is subscribed to a task.
 */
export async function isSubscribed(taskId: string, agentId: string): Promise<boolean> {
  const result = await query<{ id: string }>(
    'SELECT id FROM subscriptions WHERE task_id = $1 AND agent_id = $2',
    [taskId, agentId]
  );
  return result.rows.length > 0;
}
