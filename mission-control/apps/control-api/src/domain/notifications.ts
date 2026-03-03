import { randomUUID } from 'node:crypto';
import { query } from '../services/db.js';
import { redis } from '../services/redis.js';
import type { Notification, NotificationStatus } from '@mc/shared';

interface NotificationRow {
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

function rowToNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    target_agent_id: row.target_agent_id,
    source_type: row.source_type,
    source_id: row.source_id,
    payload: row.payload,
    status: row.status as NotificationStatus,
    delivered_at: row.delivered_at,
    retry_count: row.retry_count,
    created_at: row.created_at,
  };
}

const DEDUP_WINDOW_SECONDS = 5;

/**
 * Enqueue a notification for an agent, with dedup within a 5s window.
 * Uses Redis SET NX to prevent duplicate notifications for the same
 * (target, source_type, source_id) within the window.
 */
export async function enqueue(
  targetAgentId: string,
  sourceType: string,
  sourceId: string,
  payload: Record<string, unknown>,
): Promise<Notification | null> {
  // Dedup key: prevent same notification within window
  const dedupKey = `notif:dedup:${targetAgentId}:${sourceType}:${sourceId}`;
  const wasSet = await redis.set(dedupKey, '1', 'EX', DEDUP_WINDOW_SECONDS, 'NX');

  if (wasSet === null) {
    // Duplicate within dedup window
    return null;
  }

  const id = randomUUID();
  const result = await query<NotificationRow>(
    `INSERT INTO notifications (id, target_agent_id, source_type, source_id, payload, status, retry_count, created_at)
     VALUES ($1, $2, $3, $4, $5, 'queued', 0, now())
     RETURNING *`,
    [id, targetAgentId, sourceType, sourceId, JSON.stringify(payload)],
  );

  return rowToNotification(result.rows[0]!);
}

/**
 * List notifications for an agent: undelivered + recently delivered (last 24h).
 */
export async function listForAgent(agentId: string): Promise<Notification[]> {
  const result = await query<NotificationRow>(
    `SELECT * FROM notifications
     WHERE target_agent_id = $1
       AND (status != 'delivered' OR delivered_at > now() - interval '24 hours')
     ORDER BY created_at DESC`,
    [agentId],
  );
  return result.rows.map(rowToNotification);
}

/**
 * Acknowledge (mark as delivered) a notification.
 */
export async function acknowledge(notificationId: string): Promise<Notification | null> {
  const result = await query<NotificationRow>(
    `UPDATE notifications
     SET status = 'delivered', delivered_at = now()
     WHERE id = $1
     RETURNING *`,
    [notificationId],
  );
  return result.rows[0] ? rowToNotification(result.rows[0]) : null;
}

/**
 * Get queued notifications ready for dispatch.
 * Respects exponential backoff: only pick notifications whose
 * next retry time has passed.
 */
export async function getQueuedForDispatch(limit: number): Promise<Notification[]> {
  const result = await query<NotificationRow>(
    `SELECT * FROM notifications
     WHERE status = 'queued'
       AND retry_count < 5
       AND created_at + (power(2, retry_count) || ' seconds')::interval <= now()
     ORDER BY created_at ASC
     LIMIT $1`,
    [limit],
  );
  return result.rows.map(rowToNotification);
}

/**
 * Mark a notification as delivered by the dispatcher.
 */
export async function markDelivered(notificationId: string): Promise<void> {
  await query(
    `UPDATE notifications
     SET status = 'delivered', delivered_at = now()
     WHERE id = $1`,
    [notificationId],
  );
}

/**
 * Increment retry count for a failed delivery attempt.
 * If retry_count reaches 5, mark as failed.
 */
export async function incrementRetry(notificationId: string): Promise<void> {
  await query(
    `UPDATE notifications
     SET retry_count = retry_count + 1,
         status = CASE WHEN retry_count + 1 >= 5 THEN 'failed' ELSE 'queued' END
     WHERE id = $1`,
    [notificationId],
  );
}

/**
 * Get a single notification by ID.
 */
export async function getNotification(id: string): Promise<Notification | null> {
  const result = await query<NotificationRow>(
    'SELECT * FROM notifications WHERE id = $1',
    [id],
  );
  return result.rows[0] ? rowToNotification(result.rows[0]) : null;
}
