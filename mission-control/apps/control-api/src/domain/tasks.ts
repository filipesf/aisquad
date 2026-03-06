import { randomUUID } from 'node:crypto';
import type { CreateTaskInput, Task, TaskState } from '@mc/shared';
import { query } from '../services/db.js';
import * as activities from './activities.js';

interface TaskRow {
  id: string;
  title: string;
  description: string;
  state: string;
  priority: number;
  required_capabilities: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

function rowToTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    state: row.state as TaskState,
    priority: row.priority,
    required_capabilities: row.required_capabilities,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

// ── State Machine ──────────────────────────────────────────────

/**
 * Valid state transitions:
 *   queued → assigned
 *   assigned → in_progress | blocked | queued (requeue)
 *   in_progress → review | blocked
 *   review → done | blocked | in_progress
 *   blocked → queued | assigned | in_progress | review (return to previous)
 *   done → (terminal)
 */
const VALID_TRANSITIONS: Record<string, string[]> = {
  queued: ['assigned'],
  assigned: ['in_progress', 'blocked', 'queued'],
  in_progress: ['review', 'blocked'],
  review: ['done', 'blocked', 'in_progress'],
  blocked: ['queued', 'assigned', 'in_progress', 'review']
};

export class InvalidTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`Invalid state transition: ${from} → ${to}`);
    this.name = 'InvalidTransitionError';
  }
}

export function assertTransition(from: string, to: string): void {
  const allowed = VALID_TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) {
    throw new InvalidTransitionError(from, to);
  }
}

export function getValidTransitions(state: string): string[] {
  return VALID_TRANSITIONS[state] ?? [];
}

// ── CRUD ───────────────────────────────────────────────────────

export async function createTask(input: CreateTaskInput): Promise<Task> {
  const id = randomUUID();
  const now = new Date().toISOString();

  const result = await query<TaskRow>(
    `INSERT INTO tasks (id, title, description, state, priority, required_capabilities, created_at, updated_at)
     VALUES ($1, $2, $3, 'queued', $4, $5, $6, $6)
     RETURNING *`,
    [
      id,
      input.title,
      input.description,
      input.priority,
      JSON.stringify(input.required_capabilities),
      now
    ]
  );

  await activities.emit('task.created', { taskId: id, title: input.title });
  return rowToTask(result.rows[0]!);
}

export async function getTask(id: string): Promise<Task | null> {
  const result = await query<TaskRow>('SELECT * FROM tasks WHERE id = $1', [id]);
  return result.rows[0] ? rowToTask(result.rows[0]) : null;
}

export async function listTasks(state?: string): Promise<Task[]> {
  if (state) {
    const result = await query<TaskRow>(
      'SELECT * FROM tasks WHERE state = $1 ORDER BY priority DESC, created_at ASC',
      [state]
    );
    return result.rows.map(rowToTask);
  }
  const result = await query<TaskRow>('SELECT * FROM tasks ORDER BY priority DESC, created_at ASC');
  return result.rows.map(rowToTask);
}

export async function transitionState(id: string, newState: TaskState): Promise<Task> {
  const task = await getTask(id);
  if (!task) {
    throw new Error(`Task ${id} not found`);
  }

  assertTransition(task.state, newState);

  const result = await query<TaskRow>(
    `UPDATE tasks SET state = $2, updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [id, newState]
  );

  await activities.emit('task.state_changed', {
    taskId: id,
    from: task.state,
    to: newState
  });

  return rowToTask(result.rows[0]!);
}

export async function deleteTask(id: string): Promise<void> {
  const result = await query<TaskRow>('DELETE FROM tasks WHERE id = $1 RETURNING id', [id]);
  if (!result.rows[0]) {
    throw new Error(`Task ${id} not found`);
  }
  await activities.emit('task.deleted', { taskId: id });
}

export async function requeue(id: string): Promise<Task> {
  const result = await query<TaskRow>(
    `UPDATE tasks SET state = 'queued', updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [id]
  );

  if (!result.rows[0]) {
    throw new Error(`Task ${id} not found`);
  }

  await activities.emit('task.requeued', { taskId: id });
  return rowToTask(result.rows[0]);
}
