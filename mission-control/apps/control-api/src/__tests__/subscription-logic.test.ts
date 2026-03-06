import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('../services/db.js', () => {
  const subscriptions = new Map<
    string,
    { id: string; task_id: string; agent_id: string; created_at: string }
  >();
  return {
    query: vi.fn(async (text: string, params?: unknown[]) => {
      const sql = text.trim();

      if (sql.startsWith('INSERT INTO subscriptions')) {
        const id = params?.[0] as string;
        const taskId = params?.[1] as string;
        const agentId = params?.[2] as string;
        const key = `${taskId}:${agentId}`;

        if (subscriptions.has(key)) {
          // ON CONFLICT DO NOTHING
          return { rows: [], rowCount: 0 };
        }

        const row = {
          id,
          task_id: taskId,
          agent_id: agentId,
          created_at: new Date().toISOString()
        };
        subscriptions.set(key, row);
        return { rows: [row], rowCount: 1 };
      }

      if (sql.startsWith('SELECT * FROM subscriptions WHERE task_id')) {
        const taskId = params?.[0] as string;
        const agentId = params?.[1] as string;
        const key = `${taskId}:${agentId}`;
        const row = subscriptions.get(key);
        return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
      }

      if (sql.startsWith('SELECT agent_id FROM subscriptions')) {
        const taskId = params?.[0] as string;
        const result: { agent_id: string }[] = [];
        for (const [key, row] of subscriptions) {
          if (key.startsWith(`${taskId}:`)) {
            result.push({ agent_id: row.agent_id });
          }
        }
        return { rows: result, rowCount: result.length };
      }

      if (sql.startsWith('SELECT id FROM subscriptions')) {
        const taskId = params?.[0] as string;
        const agentId = params?.[1] as string;
        const key = `${taskId}:${agentId}`;
        const row = subscriptions.get(key);
        return { rows: row ? [{ id: row.id }] : [], rowCount: row ? 1 : 0 };
      }

      return { rows: [], rowCount: 0 };
    }),
    _subscriptions: subscriptions,
    _reset: () => {
      subscriptions.clear();
    }
  };
});

import * as subscriptionDomain from '../domain/subscriptions.js';

// Access mock internals
const dbModule = (await import('../services/db.js')) as unknown as {
  _subscriptions: Map<string, unknown>;
  _reset: () => void;
};

describe('subscription logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbModule._reset();
  });

  it('subscribes an agent to a task', async () => {
    const result = await subscriptionDomain.subscribe('task-1', 'agent-1');
    expect(result.task_id).toBe('task-1');
    expect(result.agent_id).toBe('agent-1');
  });

  it('is idempotent — subscribing twice returns same subscription', async () => {
    const first = await subscriptionDomain.subscribe('task-1', 'agent-1');
    const second = await subscriptionDomain.subscribe('task-1', 'agent-1');
    expect(second.task_id).toBe(first.task_id);
    expect(second.agent_id).toBe(first.agent_id);
  });

  it('returns all subscribers for a task', async () => {
    await subscriptionDomain.subscribe('task-1', 'agent-1');
    await subscriptionDomain.subscribe('task-1', 'agent-2');
    await subscriptionDomain.subscribe('task-2', 'agent-3'); // Different task

    const subs = await subscriptionDomain.getSubscribers('task-1');
    expect(subs).toHaveLength(2);
    expect(subs).toContain('agent-1');
    expect(subs).toContain('agent-2');
  });

  it('checks if an agent is subscribed', async () => {
    await subscriptionDomain.subscribe('task-1', 'agent-1');

    const yes = await subscriptionDomain.isSubscribed('task-1', 'agent-1');
    const no = await subscriptionDomain.isSubscribed('task-1', 'agent-99');

    expect(yes).toBe(true);
    expect(no).toBe(false);
  });
});
