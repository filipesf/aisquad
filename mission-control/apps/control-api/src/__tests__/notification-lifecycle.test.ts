import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock DB ────────────────────────────────────────────────────
const notifications = new Map<string, {
  id: string;
  target_agent_id: string;
  source_type: string;
  source_id: string;
  payload: Record<string, unknown>;
  status: string;
  delivered_at: string | null;
  retry_count: number;
  created_at: string;
}>();

vi.mock('../services/db.js', () => ({
  query: vi.fn(async (text: string, params?: unknown[]) => {
    const sql = text.trim();

    if (sql.startsWith('INSERT INTO notifications')) {
      const id = params![0] as string;
      const row = {
        id,
        target_agent_id: params![1] as string,
        source_type: params![2] as string,
        source_id: params![3] as string,
        payload: JSON.parse(params![4] as string) as Record<string, unknown>,
        status: 'queued',
        delivered_at: null,
        retry_count: 0,
        created_at: new Date().toISOString(),
      };
      notifications.set(id, row);
      return { rows: [row], rowCount: 1 };
    }

    if (sql.startsWith('UPDATE notifications') && sql.includes("status = 'delivered'")) {
      const id = params![0] as string;
      const notif = notifications.get(id);
      if (notif) {
        notif.status = 'delivered';
        notif.delivered_at = new Date().toISOString();
        return { rows: [notif], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }

    if (sql.startsWith('UPDATE notifications') && sql.includes('retry_count = retry_count + 1')) {
      const id = params![0] as string;
      const notif = notifications.get(id);
      if (notif) {
        notif.retry_count++;
        notif.status = notif.retry_count >= 5 ? 'failed' : 'queued';
        return { rows: [notif], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }

    if (sql.startsWith('SELECT * FROM notifications') && sql.includes('target_agent_id')) {
      const agentId = params![0] as string;
      const result = [...notifications.values()].filter(
        (n) => n.target_agent_id === agentId && (n.status !== 'delivered' || true),
      );
      return { rows: result, rowCount: result.length };
    }

    if (sql.startsWith('SELECT * FROM notifications') && sql.includes('WHERE id')) {
      const id = params![0] as string;
      const notif = notifications.get(id);
      return { rows: notif ? [notif] : [], rowCount: notif ? 1 : 0 };
    }

    if (sql.startsWith('SELECT * FROM notifications') && sql.includes("status = 'queued'")) {
      const limit = params![1] as number;
      const result = [...notifications.values()]
        .filter((n) => n.status === 'queued' && n.retry_count < 5)
        .slice(0, limit);
      return { rows: result, rowCount: result.length };
    }

    return { rows: [], rowCount: 0 };
  }),
}));

// ── Mock Redis ─────────────────────────────────────────────────
const redisStore = new Map<string, string>();

vi.mock('../services/redis.js', () => ({
  redis: {
    set: vi.fn(async (key: string, value: string, _ex: string, _ttl: number, _nx: string) => {
      if (redisStore.has(key)) return null;
      redisStore.set(key, value);
      return 'OK';
    }),
  },
}));

import * as notificationDomain from '../domain/notifications.js';

describe('notification lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    notifications.clear();
    redisStore.clear();
  });

  it('enqueues a notification', async () => {
    const notif = await notificationDomain.enqueue(
      'agent-1',
      'comment',
      'comment-1',
      { body: 'hello' },
    );

    expect(notif).not.toBeNull();
    expect(notif!.status).toBe('queued');
    expect(notif!.target_agent_id).toBe('agent-1');
    expect(notif!.source_type).toBe('comment');
    expect(notif!.retry_count).toBe(0);
  });

  it('deduplicates notifications within window', async () => {
    const first = await notificationDomain.enqueue(
      'agent-1',
      'comment',
      'comment-1',
      { body: 'hello' },
    );
    const second = await notificationDomain.enqueue(
      'agent-1',
      'comment',
      'comment-1',
      { body: 'hello' },
    );

    expect(first).not.toBeNull();
    expect(second).toBeNull(); // Deduped
  });

  it('allows notifications for different sources', async () => {
    const n1 = await notificationDomain.enqueue(
      'agent-1',
      'comment',
      'comment-1',
      { body: 'first' },
    );
    const n2 = await notificationDomain.enqueue(
      'agent-1',
      'comment',
      'comment-2',
      { body: 'second' },
    );

    expect(n1).not.toBeNull();
    expect(n2).not.toBeNull();
  });

  it('allows notifications for different targets', async () => {
    const n1 = await notificationDomain.enqueue(
      'agent-1',
      'comment',
      'comment-1',
      { body: 'hello' },
    );
    const n2 = await notificationDomain.enqueue(
      'agent-2',
      'comment',
      'comment-1',
      { body: 'hello' },
    );

    expect(n1).not.toBeNull();
    expect(n2).not.toBeNull();
  });

  it('acknowledges a notification', async () => {
    const notif = await notificationDomain.enqueue(
      'agent-1',
      'comment',
      'comment-1',
      { body: 'hello' },
    );

    const acked = await notificationDomain.acknowledge(notif!.id);
    expect(acked).not.toBeNull();
    expect(acked!.status).toBe('delivered');
    expect(acked!.delivered_at).not.toBeNull();
  });

  it('returns null when acknowledging non-existent notification', async () => {
    const acked = await notificationDomain.acknowledge('non-existent');
    expect(acked).toBeNull();
  });

  it('increments retry count on failure', async () => {
    const notif = await notificationDomain.enqueue(
      'agent-1',
      'comment',
      'comment-1',
      { body: 'hello' },
    );

    await notificationDomain.incrementRetry(notif!.id);
    const updated = notifications.get(notif!.id);
    expect(updated!.retry_count).toBe(1);
    expect(updated!.status).toBe('queued');
  });

  it('marks as failed after max retries', async () => {
    const notif = await notificationDomain.enqueue(
      'agent-1',
      'comment',
      'comment-1',
      { body: 'hello' },
    );

    // Retry 5 times
    for (let i = 0; i < 5; i++) {
      await notificationDomain.incrementRetry(notif!.id);
    }

    const updated = notifications.get(notif!.id);
    expect(updated!.retry_count).toBe(5);
    expect(updated!.status).toBe('failed');
  });

  it('gets a notification by ID', async () => {
    const notif = await notificationDomain.enqueue(
      'agent-1',
      'comment',
      'comment-1',
      { body: 'hello' },
    );

    const found = await notificationDomain.getNotification(notif!.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(notif!.id);
  });
});
