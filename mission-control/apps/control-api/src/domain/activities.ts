import { randomUUID } from 'node:crypto';
import { query } from '../services/db.js';

interface ActivityRow {
  id: string;
  type: string;
  actor_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

export async function emit(
  type: string,
  payload: Record<string, unknown>,
  actorId?: string,
): Promise<ActivityRow> {
  const id = randomUUID();
  const result = await query<ActivityRow>(
    `INSERT INTO activities (id, type, actor_id, payload, created_at)
     VALUES ($1, $2, $3, $4, now())
     RETURNING *`,
    [id, type, actorId ?? null, JSON.stringify(payload)],
  );
  return result.rows[0]!;
}

export async function listRecent(limit = 50): Promise<ActivityRow[]> {
  const result = await query<ActivityRow>(
    'SELECT * FROM activities ORDER BY created_at DESC LIMIT $1',
    [limit],
  );
  return result.rows;
}

/**
 * List activities created after a given activity ID.
 * Returns in ascending chronological order (oldest first).
 */
export async function listSince(afterId: string): Promise<ActivityRow[]> {
  if (!afterId) {
    return [];
  }

  const result = await query<ActivityRow>(
    `SELECT a.* FROM activities a
     WHERE a.created_at > (SELECT created_at FROM activities WHERE id = $1)
        OR (a.created_at = (SELECT created_at FROM activities WHERE id = $1) AND a.id > $1)
     ORDER BY a.created_at ASC, a.id ASC
     LIMIT 100`,
    [afterId],
  );
  return result.rows;
}
