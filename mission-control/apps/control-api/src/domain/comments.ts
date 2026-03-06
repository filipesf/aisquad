import { randomUUID } from 'node:crypto';
import type { Comment, CreateCommentInput } from '@mc/shared';
import { query } from '../services/db.js';
import * as activities from './activities.js';
import * as notifications from './notifications.js';
import * as subscriptions from './subscriptions.js';

interface CommentRow {
  id: string;
  task_id: string;
  author_id: string;
  body: string;
  created_at: string;
}

function rowToComment(row: CommentRow): Comment {
  return {
    id: row.id,
    task_id: row.task_id,
    author_id: row.author_id,
    body: row.body,
    created_at: row.created_at
  };
}

// ── Mention Parsing ────────────────────────────────────────────

const MENTION_REGEX = /@([\w-]+)/g;

/**
 * Extract unique agent names from @mentions in text.
 */
export function parseMentions(text: string): string[] {
  const matches = text.matchAll(MENTION_REGEX);
  const names = new Set<string>();
  for (const match of matches) {
    names.add(match[1]!);
  }
  return [...names];
}

/**
 * Resolve agent names to IDs. Returns a map of name → id for agents that exist.
 */
export async function resolveMentions(names: string[]): Promise<Map<string, string>> {
  if (names.length === 0) return new Map();

  // Build parameterized query for IN clause
  const placeholders = names.map((_, i) => `$${i + 1}`).join(', ');
  const result = await query<{ id: string; name: string }>(
    `SELECT id, name FROM agents WHERE name IN (${placeholders})`,
    names
  );

  const map = new Map<string, string>();
  for (const row of result.rows) {
    map.set(row.name, row.id);
  }
  return map;
}

// ── CRUD ───────────────────────────────────────────────────────

/**
 * Create a comment on a task.
 * - Auto-subscribes the author to the task.
 * - Parses @mentions, auto-subscribes mentioned agents.
 * - Enqueues notifications for all subscribers (except author).
 */
export async function createComment(
  taskId: string,
  authorId: string,
  input: CreateCommentInput
): Promise<Comment> {
  const id = randomUUID();

  const result = await query<CommentRow>(
    `INSERT INTO comments (id, task_id, author_id, body, created_at)
     VALUES ($1, $2, $3, $4, now())
     RETURNING *`,
    [id, taskId, authorId, input.body]
  );

  const comment = rowToComment(result.rows[0]!);

  // Auto-subscribe the author
  await subscriptions.subscribe(taskId, authorId);

  // Parse mentions and subscribe mentioned agents
  const mentionedNames = parseMentions(input.body);
  const mentionMap = await resolveMentions(mentionedNames);

  for (const agentId of mentionMap.values()) {
    await subscriptions.subscribe(taskId, agentId);
  }

  // Enqueue notifications for all subscribers except the author
  const subscribers = await subscriptions.getSubscribers(taskId);
  const targets = subscribers.filter((agentId) => agentId !== authorId);

  for (const targetAgentId of targets) {
    await notifications.enqueue(targetAgentId, 'comment', comment.id, {
      taskId,
      commentId: comment.id,
      authorId,
      body: input.body,
      mentionedNames: [...mentionMap.keys()]
    });
  }

  // Emit activity
  await activities.emit('comment.created', {
    taskId,
    commentId: comment.id,
    authorId,
    mentionedAgentIds: [...mentionMap.values()]
  });

  return comment;
}

/**
 * List comments for a task, ordered by creation time ascending.
 */
export async function listComments(taskId: string): Promise<Comment[]> {
  const result = await query<CommentRow>(
    'SELECT * FROM comments WHERE task_id = $1 ORDER BY created_at ASC',
    [taskId]
  );
  return result.rows.map(rowToComment);
}
