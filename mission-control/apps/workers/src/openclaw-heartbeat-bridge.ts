/**
 * OpenClaw Heartbeat Bridge Worker
 *
 * Keeps OpenClaw-backed agents represented and alive in Mission Control
 * by emitting periodic heartbeats on their behalf.
 *
 * Reads agent mappings from the DB (agents with capabilities.openclaw.enabled = true)
 * and sends heartbeats to keep them online.
 *
 * Does NOT touch assignment semantics.
 */

import { randomUUID } from 'node:crypto';
import { OpenClawCapabilitySchema } from '@mc/shared';
import { close, query } from './lib/db.js';
import { openclawConfig } from './lib/openclaw-config.js';

const POLL_INTERVAL_MS = openclawConfig.dispatchPollMs;

interface AgentRow {
  id: string;
  name: string;
  status: string;
  capabilities: Record<string, unknown>;
  last_seen_at: string | null;
}

/**
 * Find all agents that have openclaw capability enabled.
 */
async function findOpenClawAgents(): Promise<AgentRow[]> {
  const result = await query<AgentRow>(
    `SELECT id, name, status, capabilities, last_seen_at::text
     FROM agents
     WHERE capabilities->'openclaw'->>'enabled' = 'true'`
  );
  return result.rows;
}

/**
 * Parse and validate the openclaw capability from an agent's capabilities JSON.
 * Returns null if parsing fails.
 */
function parseOpenClawCapability(capabilities: Record<string, unknown>) {
  const raw = capabilities.openclaw;
  if (!raw || typeof raw !== 'object') return null;
  const result = OpenClawCapabilitySchema.safeParse(raw);
  return result.success ? result.data : null;
}

/**
 * Send a heartbeat for an agent. Transitions offline→online and updates last_seen_at.
 * Uses a deterministic sequence_id per agent per interval to allow idempotent processing.
 */
async function sendHeartbeat(agentId: string): Promise<void> {
  const now = new Date();
  const sequenceId = `bridge-${agentId}-${Math.floor(now.getTime() / POLL_INTERVAL_MS)}`;

  // Check current agent status
  const agentResult = await query<{ status: string }>('SELECT status FROM agents WHERE id = $1', [
    agentId
  ]);

  const agent = agentResult.rows[0];
  if (!agent) return;

  const wasOffline = agent.status === 'offline';

  if (wasOffline) {
    // Transition to online
    await query(
      `UPDATE agents SET status = 'online', last_seen_at = $2, updated_at = $2
       WHERE id = $1`,
      [agentId, now.toISOString()]
    );

    await query(
      `INSERT INTO activities (id, type, actor_id, payload, created_at)
       VALUES ($1, 'agent.online', NULL, $2, now())`,
      [randomUUID(), JSON.stringify({ agentId, source: 'openclaw-bridge' })]
    );

    console.log(`openclaw-heartbeat-bridge: agent ${agentId} transitioned to online`);
  } else {
    // Update last_seen_at
    await query(`UPDATE agents SET last_seen_at = $2, updated_at = $2 WHERE id = $1`, [
      agentId,
      now.toISOString()
    ]);
  }

  // Suppress unused variable warning — sequenceId is used for future Redis dedup
  void sequenceId;
}

/**
 * Main poll: find all OpenClaw agents and send heartbeats.
 */
async function pollHeartbeats(): Promise<number> {
  const agents = await findOpenClawAgents();

  if (agents.length === 0) return 0;

  let count = 0;
  for (const agent of agents) {
    const cap = parseOpenClawCapability(agent.capabilities);
    if (!cap || !cap.enabled) continue;

    try {
      await sendHeartbeat(agent.id);
      count++;
    } catch (err) {
      console.error(
        `openclaw-heartbeat-bridge: failed heartbeat for agent ${agent.name} (${agent.id})`,
        err
      );
    }
  }

  return count;
}

// ── Worker Loop ────────────────────────────────────────────────

let running = true;

async function run(): Promise<void> {
  if (!openclawConfig.enabled) {
    console.log('openclaw-heartbeat-bridge: OPENCLAW_ENABLED is false, exiting');
    await close();
    return;
  }

  console.log(`openclaw-heartbeat-bridge: starting (poll every ${POLL_INTERVAL_MS}ms)`);

  while (running) {
    try {
      const count = await pollHeartbeats();
      if (count > 0) {
        console.log(`openclaw-heartbeat-bridge: sent ${count} heartbeat(s)`);
      }
    } catch (err) {
      console.error('openclaw-heartbeat-bridge: error during poll', err);
    }

    await sleep(POLL_INTERVAL_MS);
  }

  console.log('openclaw-heartbeat-bridge: shutting down');
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
  console.error('openclaw-heartbeat-bridge: fatal error', err);
  process.exit(1);
});

// Export for testing
export { findOpenClawAgents, parseOpenClawCapability, sendHeartbeat, pollHeartbeats };
