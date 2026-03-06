import { randomUUID } from 'node:crypto';
import { close, query } from './lib/db.js';

const POLL_INTERVAL_MS = Number(process.env.OFFLINE_POLL_MS ?? 10_000);

interface StaleAgent {
  id: string;
  name: string;
  heartbeat_interval_ms: number;
  last_seen_at: string;
}

interface ActiveAssignment {
  id: string;
  task_id: string;
}

async function findAndMarkStaleAgents(): Promise<number> {
  const now = new Date();

  const stale = await query<StaleAgent>(
    `SELECT id, name, heartbeat_interval_ms, last_seen_at::text
     FROM agents
     WHERE status = 'online'
       AND last_seen_at IS NOT NULL
       AND EXTRACT(EPOCH FROM ($1::timestamptz - last_seen_at)) * 1000 > heartbeat_interval_ms * 3`,
    [now.toISOString()]
  );

  for (const agent of stale.rows) {
    await query(
      `UPDATE agents SET status = 'offline', updated_at = now()
       WHERE id = $1 AND status = 'online'`,
      [agent.id]
    );

    await query(
      `INSERT INTO activities (id, type, actor_id, payload, created_at)
       VALUES ($1, 'agent.offline', NULL, $2, now())`,
      [randomUUID(), JSON.stringify({ agentId: agent.id, name: agent.name })]
    );

    console.log(`offline-detector: marked agent ${agent.name} (${agent.id}) as offline`);

    // Expire any accepted assignments for this agent and requeue their tasks.
    // Offered assignments are handled by the assigner's lease expiry; we only
    // need to recover work that was actively in progress.
    const activeAssignments = await query<ActiveAssignment>(
      `SELECT id, task_id FROM assignments
       WHERE agent_id = $1 AND status = 'accepted'`,
      [agent.id]
    );

    for (const assignment of activeAssignments.rows) {
      // Guard on status — another process could have transitioned this assignment
      // (e.g. agent completed just before being marked offline). Only proceed if
      // the UPDATE actually matched.
      const expireResult = await query(
        `UPDATE assignments SET status = 'expired', updated_at = now()
         WHERE id = $1 AND status = 'accepted'
         RETURNING id`,
        [assignment.id]
      );

      if (expireResult.rows.length === 0) {
        // Assignment was already transitioned — nothing to recover
        continue;
      }

      await query(
        `UPDATE tasks SET state = 'queued', updated_at = now()
         WHERE id = $1`,
        [assignment.task_id]
      );

      await query(
        `INSERT INTO activities (id, type, actor_id, payload, created_at)
         VALUES ($1, 'assignment.expired', NULL, $2, now())`,
        [
          randomUUID(),
          JSON.stringify({
            taskId: assignment.task_id,
            agentId: agent.id,
            assignmentId: assignment.id,
            agentName: agent.name,
            reason: 'agent_offline'
          })
        ]
      );

      console.log(
        `offline-detector: expired accepted assignment ${assignment.id}, requeued task ${assignment.task_id}`
      );
    }
  }

  return stale.rows.length;
}

let running = true;

async function run(): Promise<void> {
  console.log(`offline-detector: starting (poll every ${POLL_INTERVAL_MS}ms)`);

  while (running) {
    try {
      await findAndMarkStaleAgents();
    } catch (err) {
      console.error('offline-detector: error during poll', err);
    }

    await sleep(POLL_INTERVAL_MS);
  }

  console.log('offline-detector: shutting down');
  await close();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    // Allow the process to exit if `running` becomes false
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
  console.error('offline-detector: fatal error', err);
  process.exit(1);
});

// Export for testing
export { findAndMarkStaleAgents };
