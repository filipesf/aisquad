import { randomUUID } from 'node:crypto';
import { close, query } from './lib/db.js';

const POLL_INTERVAL_MS = Number(process.env.ASSIGNER_POLL_MS ?? 10_000);
const LEASE_SECONDS = Number(process.env.LEASE_SECONDS ?? 30);

interface QueuedTask {
  id: string;
  title: string;
  required_capabilities: Record<string, unknown>;
}

interface OnlineAgent {
  id: string;
  name: string;
  capabilities: Record<string, unknown>;
}

/**
 * Check if an agent's capabilities satisfy a task's required capabilities.
 * Each key in required_capabilities must exist in agent capabilities.
 */
function capabilitiesMatch(
  agentCaps: Record<string, unknown>,
  requiredCaps: Record<string, unknown>
): boolean {
  const required = Object.keys(requiredCaps);
  if (required.length === 0) return true;
  return required.every((key) => key in agentCaps);
}

async function assignQueuedTasks(): Promise<number> {
  // Find queued tasks ordered by priority
  const tasksResult = await query<QueuedTask>(
    `SELECT id, title, required_capabilities
     FROM tasks
     WHERE state = 'queued'
     ORDER BY priority DESC, created_at ASC
     LIMIT 50`
  );

  if (tasksResult.rows.length === 0) return 0;

  // Find online agents
  const agentsResult = await query<OnlineAgent>(
    `SELECT id, name, capabilities
     FROM agents
     WHERE status = 'online'`
  );

  if (agentsResult.rows.length === 0) return 0;

  let assigned = 0;

  for (const task of tasksResult.rows) {
    // Find an eligible agent (has matching capabilities and no active assignment)
    for (const agent of agentsResult.rows) {
      if (!capabilitiesMatch(agent.capabilities, task.required_capabilities)) {
        continue;
      }

      // Check if agent already has an active assignment
      const activeResult = await query(
        `SELECT 1 FROM assignments
         WHERE agent_id = $1 AND status IN ('offered', 'accepted')
         LIMIT 1`,
        [agent.id]
      );

      if (activeResult.rows.length > 0) continue;

      // Try to assign
      const assignmentId = randomUUID();
      const now = new Date();
      const leaseExpiresAt = new Date(now.getTime() + LEASE_SECONDS * 1000);

      try {
        await query('BEGIN');

        await query(
          `INSERT INTO assignments (id, task_id, agent_id, status, lease_expires_at, created_at, updated_at)
           VALUES ($1, $2, $3, 'offered', $4, $5, $5)`,
          [assignmentId, task.id, agent.id, leaseExpiresAt.toISOString(), now.toISOString()]
        );

        await query(`UPDATE tasks SET state = 'assigned', updated_at = now() WHERE id = $1`, [
          task.id
        ]);

        await query(
          `INSERT INTO activities (id, type, actor_id, payload, created_at)
           VALUES ($1, 'assignment.offered', NULL, $2, now())`,
          [
            randomUUID(),
            JSON.stringify({ taskId: task.id, agentId: agent.id, assignmentId, agentName: agent.name })
          ]
        );

        await query('COMMIT');

        console.log(`assigner: assigned task "${task.title}" to agent "${agent.name}"`);
        assigned++;
        break; // Move to next task
      } catch (err: unknown) {
        await query('ROLLBACK');
        // Unique constraint violation — task already has active assignment
        if (err instanceof Error && 'code' in err && (err as { code: string }).code === '23505') {
          console.log(`assigner: task "${task.title}" already has an active assignment, skipping`);
          break;
        }
        throw err;
      }
    }
  }

  return assigned;
}

async function expireStaleLeases(): Promise<number> {
  const now = new Date();

  const expired = await query<{ id: string; task_id: string; agent_id: string }>(
    `SELECT id, task_id, agent_id FROM assignments
     WHERE status IN ('offered', 'accepted')
       AND lease_expires_at < $1`,
    [now.toISOString()]
  );

  for (const assignment of expired.rows) {
    const agentNameResult = await query<{ name: string }>(
      'SELECT name FROM agents WHERE id = $1',
      [assignment.agent_id]
    );
    const agentName = agentNameResult.rows[0]?.name;

    await query('BEGIN');

    await query(`UPDATE assignments SET status = 'expired', updated_at = now() WHERE id = $1`, [
      assignment.id
    ]);

    await query(`UPDATE tasks SET state = 'queued', updated_at = now() WHERE id = $1`, [
      assignment.task_id
    ]);

    await query(
      `INSERT INTO activities (id, type, actor_id, payload, created_at)
       VALUES ($1, 'assignment.expired', NULL, $2, now())`,
      [
        randomUUID(),
        JSON.stringify({
          taskId: assignment.task_id,
          agentId: assignment.agent_id,
          assignmentId: assignment.id,
          agentName
        })
      ]
    );

    await query('COMMIT');

    console.log(
      `assigner: expired lease for assignment ${assignment.id}, requeued task ${assignment.task_id}`
    );
  }

  return expired.rows.length;
}

let running = true;

async function run(): Promise<void> {
  console.log(`assigner: starting (poll every ${POLL_INTERVAL_MS}ms, lease ${LEASE_SECONDS}s)`);

  while (running) {
    try {
      await expireStaleLeases();
      await assignQueuedTasks();
    } catch (err) {
      console.error('assigner: error during poll', err);
    }

    await sleep(POLL_INTERVAL_MS);
  }

  console.log('assigner: shutting down');
  await close();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    if (typeof timer === 'object' && 'unref' in timer) {
      timer.unref();
    }
  });
}

const shutdown = () => {
  running = false;
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

run().catch((err) => {
  console.error('assigner: fatal error', err);
  process.exit(1);
});

export { assignQueuedTasks, expireStaleLeases, capabilitiesMatch };
