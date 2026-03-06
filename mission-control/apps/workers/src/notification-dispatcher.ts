import { close, query } from './lib/db.js';

const POLL_INTERVAL_MS = Number(process.env.NOTIF_POLL_MS ?? 5_000);
const MAX_RETRIES = 5;
const BATCH_SIZE = 50;

interface NotificationRow {
  id: string;
  target_agent_id: string;
  source_type: string;
  source_id: string;
  payload: Record<string, unknown>;
  status: string;
  retry_count: number;
  created_at: string;
}

interface AgentRow {
  id: string;
  status: string;
}

/**
 * Poll queued notifications and attempt delivery.
 * A notification is "delivered" if the target agent is online.
 * If the agent is offline, increment retry count with exponential backoff.
 * After MAX_RETRIES, mark as failed.
 */
async function dispatchNotifications(): Promise<number> {
  // Fetch queued notifications respecting exponential backoff
  const result = await query<NotificationRow>(
    `SELECT * FROM notifications
     WHERE status = 'queued'
       AND retry_count < $1
       AND created_at + (power(2, retry_count) || ' seconds')::interval <= now()
     ORDER BY created_at ASC
     LIMIT $2`,
    [MAX_RETRIES, BATCH_SIZE]
  );

  if (result.rows.length === 0) return 0;

  let dispatched = 0;

  for (const notification of result.rows) {
    // Check if target agent is online
    const agentResult = await query<AgentRow>('SELECT id, status FROM agents WHERE id = $1', [
      notification.target_agent_id
    ]);

    const agent = agentResult.rows[0];

    if (agent && agent.status === 'online') {
      // Deliver the notification
      await query(
        `UPDATE notifications
         SET status = 'delivered', delivered_at = now()
         WHERE id = $1`,
        [notification.id]
      );
      console.log(
        `notification-dispatcher: delivered ${notification.id} to agent ${notification.target_agent_id}`
      );
      dispatched++;
    } else {
      // Agent offline or not found — increment retry
      const newRetryCount = notification.retry_count + 1;
      const newStatus = newRetryCount >= MAX_RETRIES ? 'failed' : 'queued';

      await query(
        `UPDATE notifications
         SET retry_count = $2, status = $3
         WHERE id = $1`,
        [notification.id, newRetryCount, newStatus]
      );

      if (newStatus === 'failed') {
        console.log(
          `notification-dispatcher: failed ${notification.id} after ${MAX_RETRIES} retries`
        );
      } else {
        console.log(
          `notification-dispatcher: retry ${newRetryCount}/${MAX_RETRIES} for ${notification.id}`
        );
      }
    }
  }

  return dispatched;
}

let running = true;

async function run(): Promise<void> {
  console.log(`notification-dispatcher: starting (poll every ${POLL_INTERVAL_MS}ms)`);

  while (running) {
    try {
      await dispatchNotifications();
    } catch (err) {
      console.error('notification-dispatcher: error during poll', err);
    }

    await sleep(POLL_INTERVAL_MS);
  }

  console.log('notification-dispatcher: shutting down');
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
  console.error('notification-dispatcher: fatal error', err);
  process.exit(1);
});

// Export for testing
export { dispatchNotifications };
