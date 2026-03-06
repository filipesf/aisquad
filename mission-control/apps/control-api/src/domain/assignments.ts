import { randomUUID } from 'node:crypto';
import type { Assignment, AssignmentStatus } from '@mc/shared';
import { pool, query } from '../services/db.js';
import * as activities from './activities.js';
import * as taskDomain from './tasks.js';

interface AssignmentRow {
  id: string;
  task_id: string;
  agent_id: string;
  status: string;
  lease_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

function rowToAssignment(row: AssignmentRow): Assignment {
  return {
    id: row.id,
    task_id: row.task_id,
    agent_id: row.agent_id,
    status: row.status as AssignmentStatus,
    lease_expires_at: row.lease_expires_at,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

/**
 * Offer an assignment — creates an assignment with 'offered' status and a lease.
 * The unique partial index ux_assignments_active_task prevents multiple active assignments.
 */
export async function offer(
  taskId: string,
  agentId: string,
  leaseSeconds: number
): Promise<Assignment | null> {
  const id = randomUUID();
  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + leaseSeconds * 1000);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Try to create the assignment — unique partial index will reject if one already active
    try {
      const result = await client.query<AssignmentRow>(
        `INSERT INTO assignments (id, task_id, agent_id, status, lease_expires_at, created_at, updated_at)
         VALUES ($1, $2, $3, 'offered', $4, $5, $5)
         RETURNING *`,
        [id, taskId, agentId, leaseExpiresAt.toISOString(), now.toISOString()]
      );

      // Transition the task to 'assigned'
      await client.query(`UPDATE tasks SET state = 'assigned', updated_at = now() WHERE id = $1`, [
        taskId
      ]);

      await client.query('COMMIT');

      await activities.emit('assignment.offered', { taskId, agentId, assignmentId: id });
      return rowToAssignment(result.rows[0]!);
    } catch (err: unknown) {
      await client.query('ROLLBACK');
      // Unique constraint violation → already has active assignment
      if (err instanceof Error && 'code' in err && (err as { code: string }).code === '23505') {
        return null;
      }
      throw err;
    }
  } finally {
    client.release();
  }
}

/**
 * Agent accepts an offered assignment. Transitions assignment offered→accepted
 * and task assigned→in_progress.
 */
export async function accept(assignmentId: string): Promise<Assignment | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query<AssignmentRow>(
      `UPDATE assignments SET status = 'accepted', updated_at = now()
       WHERE id = $1 AND status = 'offered'
       RETURNING *`,
      [assignmentId]
    );

    if (!result.rows[0]) {
      await client.query('ROLLBACK');
      return null;
    }

    const assignment = result.rows[0];

    // Transition task to in_progress
    await client.query(`UPDATE tasks SET state = 'in_progress', updated_at = now() WHERE id = $1`, [
      assignment.task_id
    ]);

    await client.query('COMMIT');

    await activities.emit('assignment.accepted', {
      taskId: assignment.task_id,
      agentId: assignment.agent_id,
      assignmentId
    });

    return rowToAssignment(assignment);
  } finally {
    client.release();
  }
}

/**
 * Agent completes an assignment. Transitions assignment accepted→completed
 * and task in_progress→review.
 */
export async function complete(assignmentId: string): Promise<Assignment | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query<AssignmentRow>(
      `UPDATE assignments SET status = 'completed', updated_at = now()
       WHERE id = $1 AND status = 'accepted'
       RETURNING *`,
      [assignmentId]
    );

    if (!result.rows[0]) {
      await client.query('ROLLBACK');
      return null;
    }

    const assignment = result.rows[0];

    // Transition task to review
    await client.query(`UPDATE tasks SET state = 'review', updated_at = now() WHERE id = $1`, [
      assignment.task_id
    ]);

    await client.query('COMMIT');

    await activities.emit('assignment.completed', {
      taskId: assignment.task_id,
      agentId: assignment.agent_id,
      assignmentId
    });

    return rowToAssignment(assignment);
  } finally {
    client.release();
  }
}

/**
 * Expire a stale assignment. Marks it expired and requeues the task.
 */
export async function expire(assignmentId: string): Promise<Assignment | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query<AssignmentRow>(
      `UPDATE assignments SET status = 'expired', updated_at = now()
       WHERE id = $1 AND status IN ('offered', 'accepted')
       RETURNING *`,
      [assignmentId]
    );

    if (!result.rows[0]) {
      await client.query('ROLLBACK');
      return null;
    }

    const assignment = result.rows[0];

    // Requeue the task
    await client.query(`UPDATE tasks SET state = 'queued', updated_at = now() WHERE id = $1`, [
      assignment.task_id
    ]);

    await client.query('COMMIT');

    await activities.emit('assignment.expired', {
      taskId: assignment.task_id,
      agentId: assignment.agent_id,
      assignmentId
    });

    return rowToAssignment(assignment);
  } finally {
    client.release();
  }
}

/**
 * Find assignments with expired leases.
 */
export async function findExpiredLeases(now: Date): Promise<Assignment[]> {
  const result = await query<AssignmentRow>(
    `SELECT * FROM assignments
     WHERE status IN ('offered', 'accepted')
       AND lease_expires_at < $1`,
    [now.toISOString()]
  );
  return result.rows.map(rowToAssignment);
}

/**
 * Get the current active assignment for a task.
 */
export async function getActiveForTask(taskId: string): Promise<Assignment | null> {
  const result = await query<AssignmentRow>(
    `SELECT * FROM assignments
     WHERE task_id = $1 AND status IN ('offered', 'accepted', 'started')
     LIMIT 1`,
    [taskId]
  );
  return result.rows[0] ? rowToAssignment(result.rows[0]) : null;
}

/**
 * Get assignment by ID.
 */
export async function getAssignment(id: string): Promise<Assignment | null> {
  const result = await query<AssignmentRow>('SELECT * FROM assignments WHERE id = $1', [id]);
  return result.rows[0] ? rowToAssignment(result.rows[0]) : null;
}

/**
 * List all assignments for a task (history), ordered by creation time descending.
 */
export async function listForTask(taskId: string): Promise<Assignment[]> {
  const result = await query<AssignmentRow>(
    'SELECT * FROM assignments WHERE task_id = $1 ORDER BY created_at DESC',
    [taskId]
  );
  return result.rows.map(rowToAssignment);
}

/**
 * List active assignments for an agent.
 */
export async function listActiveForAgent(agentId: string): Promise<Assignment[]> {
  const result = await query<AssignmentRow>(
    `SELECT * FROM assignments
     WHERE agent_id = $1 AND status IN ('offered', 'accepted', 'started')
     ORDER BY created_at DESC`,
    [agentId]
  );
  return result.rows.map(rowToAssignment);
}

// Suppress unused import warning — taskDomain is used for requeue in future phases
void taskDomain;
