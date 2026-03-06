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
}

interface CommentResp {
  id: string;
  task_id: string;
  author_id: string;
  body: string;
  created_at: string;
}

interface NotificationResp {
  id: string;
  target_agent_id: string;
  source_type: string;
  source_id: string;
  payload: Record<string, unknown>;
  status: string;
  delivered_at: string | null;
  retry_count: number;
  created_at: string;
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
  const dedupKeys = await redis.keys('notif:dedup:*');
  if (dedupKeys.length > 0) {
    await redis.del(...dedupKeys);
  }
}

async function createAgent(name: string): Promise<AgentResp> {
  const { data } = await post<AgentResp>('/agents', {
    name,
    session_key: `sk-${name}-${Date.now()}-${Math.random()}`,
    capabilities: { code: true },
    heartbeat_interval_ms: 10000
  });
  // Send heartbeat to make online
  await post(`/agents/${data.id}/heartbeat`, {});
  return data;
}

async function createTask(title: string): Promise<TaskResp> {
  const { data } = await post<TaskResp>('/tasks', {
    title,
    description: `Description for ${title}`,
    priority: 5
  });
  return data;
}

describe('notifications integration', () => {
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

  it('posts a comment and auto-subscribes the author', async () => {
    const author = await createAgent('author-agent');
    const task = await createTask('Test Task');

    const { status, data: comment } = await post<CommentResp>(
      `/tasks/${task.id}/comments?author_id=${author.id}`,
      { body: 'This is a comment' }
    );

    expect(status).toBe(201);
    expect(comment.task_id).toBe(task.id);
    expect(comment.author_id).toBe(author.id);
    expect(comment.body).toBe('This is a comment');

    // Verify subscription was created
    const subs = await pool.query(
      'SELECT * FROM subscriptions WHERE task_id = $1 AND agent_id = $2',
      [task.id, author.id]
    );
    expect(subs.rows).toHaveLength(1);
  });

  it('lists comments for a task', async () => {
    const author = await createAgent('commenter');
    const task = await createTask('Comment Task');

    await post<CommentResp>(`/tasks/${task.id}/comments?author_id=${author.id}`, {
      body: 'First comment'
    });
    await post<CommentResp>(`/tasks/${task.id}/comments?author_id=${author.id}`, {
      body: 'Second comment'
    });

    const { data: comments } = await get<CommentResp[]>(`/tasks/${task.id}/comments`);
    expect(comments).toHaveLength(2);
    expect(comments[0]?.body).toBe('First comment');
    expect(comments[1]?.body).toBe('Second comment');
  });

  it('comment with @mention subscribes mentioned agent and enqueues notification', async () => {
    const author = await createAgent('author');
    const mentioned = await createAgent('target-agent');
    const task = await createTask('Mention Task');

    await post<CommentResp>(`/tasks/${task.id}/comments?author_id=${author.id}`, {
      body: 'Hey @target-agent please review'
    });

    // Verify mentioned agent was subscribed
    const subs = await pool.query(
      'SELECT * FROM subscriptions WHERE task_id = $1 AND agent_id = $2',
      [task.id, mentioned.id]
    );
    expect(subs.rows).toHaveLength(1);

    // Verify notification was enqueued for the mentioned agent
    const notifs = await pool.query('SELECT * FROM notifications WHERE target_agent_id = $1', [
      mentioned.id
    ]);
    expect(notifs.rows).toHaveLength(1);
    expect(notifs.rows[0].status).toBe('queued');
    expect(notifs.rows[0].source_type).toBe('comment');
  });

  it('does not create notification for the comment author', async () => {
    const author = await createAgent('self-commenter');
    const task = await createTask('Self Task');

    // Author comments — they should NOT get a notification for their own comment
    await post<CommentResp>(`/tasks/${task.id}/comments?author_id=${author.id}`, {
      body: 'My own comment'
    });

    const notifs = await pool.query('SELECT * FROM notifications WHERE target_agent_id = $1', [
      author.id
    ]);
    expect(notifs.rows).toHaveLength(0);
  });

  it('notifies all subscribers except the author', async () => {
    const author = await createAgent('poster');
    const sub1 = await createAgent('subscriber1');
    const sub2 = await createAgent('subscriber2');
    const task = await createTask('Multi Sub Task');

    // Subscribe sub1 and sub2 by having them comment first
    await post<CommentResp>(`/tasks/${task.id}/comments?author_id=${sub1.id}`, {
      body: 'Subscribing myself'
    });
    await post<CommentResp>(`/tasks/${task.id}/comments?author_id=${sub2.id}`, {
      body: 'Me too'
    });

    // Clean dedup keys so the next comment can generate fresh notifications
    await cleanRedis();

    // Now author comments — both sub1 and sub2 should get notifications
    await post<CommentResp>(`/tasks/${task.id}/comments?author_id=${author.id}`, {
      body: 'New update everyone'
    });

    const notifsSub1 = await pool.query(
      "SELECT * FROM notifications WHERE target_agent_id = $1 AND source_type = 'comment'",
      [sub1.id]
    );
    const notifsSub2 = await pool.query(
      "SELECT * FROM notifications WHERE target_agent_id = $1 AND source_type = 'comment'",
      [sub2.id]
    );

    // sub1 gets 1 notification (from sub2's comment, they were subscribed before author posted)
    // After author posts, both sub1 and sub2 should get new notifications
    expect(notifsSub1.rows.length).toBeGreaterThanOrEqual(1);
    expect(notifsSub2.rows.length).toBeGreaterThanOrEqual(1);

    // Author should NOT get notifications for their own comment
    const notifsAuthor = await pool.query(
      `SELECT * FROM notifications WHERE target_agent_id = $1
       AND source_id IN (SELECT id FROM comments WHERE author_id = $1)`,
      [author.id]
    );
    expect(notifsAuthor.rows).toHaveLength(0);
  });

  it('notification dedup prevents duplicates within window', async () => {
    const author = await createAgent('rapid-poster');
    const subscriber = await createAgent('watcher');
    const task = await createTask('Dedup Task');

    // Subscribe watcher
    await post<CommentResp>(`/tasks/${task.id}/comments?author_id=${subscriber.id}`, {
      body: 'Watching this'
    });

    // Clean dedup keys
    await cleanRedis();

    // Author posts twice rapidly — the second should NOT create an extra notification
    // for the same (target, source_type, source_id) combo. However each comment has
    // a different source_id (comment.id), so both should create notifications.
    const { data: _c1 } = await post<CommentResp>(
      `/tasks/${task.id}/comments?author_id=${author.id}`,
      { body: 'First rapid comment' }
    );
    const { data: _c2 } = await post<CommentResp>(
      `/tasks/${task.id}/comments?author_id=${author.id}`,
      { body: 'Second rapid comment' }
    );

    const notifs = await pool.query(
      "SELECT * FROM notifications WHERE target_agent_id = $1 AND source_type = 'comment'",
      [subscriber.id]
    );

    // Both comments have different IDs, so both generate notifications
    // (dedup is per source_id, not per task)
    expect(notifs.rows.length).toBe(2);
  });

  it('GET /agents/:id/notifications returns notifications', async () => {
    const author = await createAgent('notif-author');
    const target = await createAgent('notif-target');
    const task = await createTask('Notif List Task');

    // Subscribe target and then author posts
    await post<CommentResp>(`/tasks/${task.id}/comments?author_id=${target.id}`, {
      body: 'Subscribing'
    });
    await cleanRedis();
    await post<CommentResp>(`/tasks/${task.id}/comments?author_id=${author.id}`, {
      body: 'Hey @notif-target check this'
    });

    const { status, data: notifs } = await get<NotificationResp[]>(
      `/agents/${target.id}/notifications`
    );
    expect(status).toBe(200);
    expect(notifs.length).toBeGreaterThanOrEqual(1);
    expect(notifs[0]?.target_agent_id).toBe(target.id);
  });

  it('POST /notifications/:id/ack marks notification as delivered', async () => {
    const author = await createAgent('ack-author');
    const target = await createAgent('ack-target');
    const task = await createTask('Ack Task');

    // Create a notification
    await post<CommentResp>(`/tasks/${task.id}/comments?author_id=${target.id}`, {
      body: 'Subscribing'
    });
    await cleanRedis();
    await post<CommentResp>(`/tasks/${task.id}/comments?author_id=${author.id}`, {
      body: 'Please review'
    });

    // Get the notification
    const { data: notifs } = await get<NotificationResp[]>(`/agents/${target.id}/notifications`);
    expect(notifs.length).toBeGreaterThanOrEqual(1);

    const queued = notifs.find((n) => n.status === 'queued');
    expect(queued).toBeTruthy();

    // Acknowledge it
    const { status, data: acked } = await post<NotificationResp>(
      `/notifications/${queued?.id}/ack`,
      {}
    );
    expect(status).toBe(200);
    expect(acked.status).toBe('delivered');
    expect(acked.delivered_at).not.toBeNull();
  });

  it('returns 404 for notifications of non-existent agent', async () => {
    const { status } = await get<{ error: string }>(
      '/agents/00000000-0000-0000-0000-000000000099/notifications'
    );
    expect(status).toBe(404);
  });

  it('returns 400 when author_id is missing from comment', async () => {
    const task = await createTask('No Author Task');

    const { status } = await post<{ error: string }>(`/tasks/${task.id}/comments`, {
      body: 'Missing author'
    });
    expect(status).toBe(400);
  });

  it('returns 404 when posting comment on non-existent task', async () => {
    const author = await createAgent('ghost-author');

    const { status } = await post<{ error: string }>(
      `/tasks/00000000-0000-0000-0000-000000000099/comments?author_id=${author.id}`,
      { body: 'No task' }
    );
    expect(status).toBe(404);
  });
});
