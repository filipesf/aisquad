/**
 * OpenClaw Assignment Dispatcher Worker
 *
 * Polls for offered assignments where the agent has openclaw capability enabled,
 * dispatches them to the OpenClaw gateway via POST /hooks/agent, and tracks
 * each attempt in openclaw_dispatch_attempts.
 *
 * Does NOT modify assignment state — Mission Control remains authoritative
 * for accept/complete transitions.
 */

import { randomUUID } from 'node:crypto';
import { query, close } from './lib/db.js';
import { openclawConfig } from './lib/openclaw-config.js';
import { OpenClawCapabilitySchema } from '@mc/shared';
import type { OpenClawHookRequest, OpenClawHookResponse } from '@mc/shared';

const POLL_INTERVAL_MS = openclawConfig.dispatchPollMs;
const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 20;

// ── Types ──────────────────────────────────────────────────────

interface OfferedAssignmentRow {
  assignment_id: string;
  task_id: string;
  task_title: string;
  task_description: string;
  agent_id: string;
  agent_name: string;
  capabilities: Record<string, unknown>;
}

interface DispatchAttemptRow {
  attempt: number;
}

// ── Core Logic ─────────────────────────────────────────────────

/**
 * Find offered assignments for OpenClaw-enabled agents that haven't been
 * successfully dispatched yet.
 */
async function findDispatchableAssignments(): Promise<OfferedAssignmentRow[]> {
  const result = await query<OfferedAssignmentRow>(
    `SELECT
       a.id AS assignment_id,
       a.task_id,
       t.title AS task_title,
       t.description AS task_description,
       a.agent_id,
       ag.name AS agent_name,
       ag.capabilities
     FROM assignments a
     JOIN tasks t ON t.id = a.task_id
     JOIN agents ag ON ag.id = a.agent_id
     WHERE a.status = 'offered'
       AND ag.capabilities->'openclaw'->>'enabled' = 'true'
       AND NOT EXISTS (
         SELECT 1 FROM openclaw_dispatch_attempts d
         WHERE d.assignment_id = a.id
           AND (d.status = 'succeeded' OR d.status = 'sent')
       )
       AND (
         SELECT COALESCE(MAX(d.attempt), 0)
         FROM openclaw_dispatch_attempts d
         WHERE d.assignment_id = a.id
       ) < $1
     ORDER BY a.created_at ASC
     LIMIT $2`,
    [MAX_ATTEMPTS, BATCH_SIZE],
  );
  return result.rows;
}

/**
 * Get the next attempt number for an assignment.
 */
async function getNextAttempt(assignmentId: string): Promise<number> {
  const result = await query<DispatchAttemptRow>(
    `SELECT COALESCE(MAX(attempt), 0) AS attempt
     FROM openclaw_dispatch_attempts
     WHERE assignment_id = $1`,
    [assignmentId],
  );
  return (result.rows[0]?.attempt ?? 0) + 1;
}

/**
 * Record a dispatch attempt.
 */
async function recordAttempt(
  assignmentId: string,
  attempt: number,
  status: 'queued' | 'sent' | 'succeeded' | 'failed',
  error?: string,
  responseExcerpt?: string,
): Promise<void> {
  await query(
    `INSERT INTO openclaw_dispatch_attempts (id, assignment_id, attempt, status, error, response_excerpt, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, now())
     ON CONFLICT (assignment_id, attempt)
     DO UPDATE SET status = $4, error = $5, response_excerpt = $6`,
    [randomUUID(), assignmentId, attempt, status, error ?? null, responseExcerpt ?? null],
  );
}

/**
 * Build the OpenClaw hook payload from assignment + task + agent context.
 */
function buildHookPayload(row: OfferedAssignmentRow): OpenClawHookRequest {
  const cap = OpenClawCapabilitySchema.safeParse(row.capabilities['openclaw']);
  const agentName = cap.success ? cap.data.agentName : row.agent_name;
  const model = cap.success ? cap.data.model : undefined;

  return {
    agent: agentName,
    model: model ?? openclawConfig.defaultModel,
    message: `Task: ${row.task_title}\n\n${row.task_description}`.trim(),
    metadata: {
      assignmentId: row.assignment_id,
      taskId: row.task_id,
      agentId: row.agent_id,
    },
  };
}

/**
 * Dispatch a single assignment to the OpenClaw gateway.
 * Returns the parsed response or throws on network/auth errors.
 */
async function dispatchToGateway(payload: OpenClawHookRequest): Promise<OpenClawHookResponse> {
  const res = await fetch(`${openclawConfig.gatewayUrl}/hooks/agent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openclawConfig.gatewayToken}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '(no body)');
    throw new Error(`HTTP ${res.status}: ${body.slice(0, 500)}`);
  }

  return (await res.json()) as OpenClawHookResponse;
}

/**
 * Post an OpenClaw response as a comment on the task via the Control API.
 * This triggers the full comment pipeline: subscriptions, @mention parsing, notifications.
 */
async function postComment(taskId: string, agentId: string, responseText: string): Promise<void> {
  const url = `${openclawConfig.controlApiUrl}/tasks/${taskId}/comments?author_id=${agentId}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body: responseText }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '(no body)');
    throw new Error(`Comment POST failed: HTTP ${res.status}: ${body.slice(0, 500)}`);
  }

  console.log(`openclaw-dispatcher: posted comment on task ${taskId} (agent: ${agentId})`);
}

/**
 * Process a single offered assignment: dispatch to OpenClaw and track the attempt.
 */
async function processAssignment(row: OfferedAssignmentRow): Promise<void> {
  const attempt = await getNextAttempt(row.assignment_id);

  // Record queued attempt
  await recordAttempt(row.assignment_id, attempt, 'queued');

  const payload = buildHookPayload(row);

  try {
    // Mark as sent before the call
    await recordAttempt(row.assignment_id, attempt, 'sent');

    const response = await dispatchToGateway(payload);

    if (response.ok) {
      const excerpt = response.response?.slice(0, 1000) ?? '';
      await recordAttempt(row.assignment_id, attempt, 'succeeded', undefined, excerpt);
      console.log(
        `openclaw-dispatcher: assignment ${row.assignment_id} attempt ${attempt}/${MAX_ATTEMPTS} succeeded (task: "${row.task_title}", agent: "${row.agent_name}")`,
      );

      // Persist OpenClaw response as a task comment
      if (response.response) {
        try {
          await postComment(row.task_id, row.agent_id, response.response);
        } catch (commentErr) {
          // Log but don't fail the dispatch — the response was already recorded
          console.error(
            `openclaw-dispatcher: failed to post comment for assignment ${row.assignment_id}:`,
            commentErr instanceof Error ? commentErr.message : commentErr,
          );
        }
      }
    } else {
      const errorMsg = response.error ?? 'unknown error from gateway';
      await recordAttempt(row.assignment_id, attempt, 'failed', errorMsg);
      console.warn(
        `openclaw-dispatcher: assignment ${row.assignment_id} attempt ${attempt}/${MAX_ATTEMPTS} — gateway returned error: ${errorMsg}`,
      );
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await recordAttempt(row.assignment_id, attempt, 'failed', errorMsg);
    console.error(
      `openclaw-dispatcher: assignment ${row.assignment_id} attempt ${attempt}/${MAX_ATTEMPTS} failed — ${errorMsg}`,
    );
  }
}

/**
 * Main poll: find dispatchable assignments and process them.
 */
async function pollDispatches(): Promise<number> {
  const assignments = await findDispatchableAssignments();
  if (assignments.length === 0) return 0;

  let dispatched = 0;
  for (const row of assignments) {
    try {
      await processAssignment(row);
      dispatched++;
    } catch (err) {
      console.error(
        `openclaw-dispatcher: unexpected error processing assignment ${row.assignment_id}`,
        err,
      );
    }
  }

  return dispatched;
}

// ── Worker Loop ────────────────────────────────────────────────

let running = true;

async function run(): Promise<void> {
  if (!openclawConfig.enabled) {
    console.log('openclaw-dispatcher: OPENCLAW_ENABLED is false, exiting');
    await close();
    return;
  }

  console.log(
    `openclaw-dispatcher: starting (poll every ${POLL_INTERVAL_MS}ms, max ${MAX_ATTEMPTS} attempts, batch ${BATCH_SIZE})`,
  );

  while (running) {
    try {
      const count = await pollDispatches();
      if (count > 0) {
        console.log(`openclaw-dispatcher: processed ${count} assignment(s)`);
      }
    } catch (err) {
      console.error('openclaw-dispatcher: error during poll', err);
    }

    await sleep(POLL_INTERVAL_MS);
  }

  console.log('openclaw-dispatcher: shutting down');
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
  console.error('openclaw-dispatcher: fatal error', err);
  process.exit(1);
});

// Export for testing
export {
  findDispatchableAssignments,
  getNextAttempt,
  recordAttempt,
  buildHookPayload,
  dispatchToGateway,
  postComment,
  processAssignment,
  pollDispatches,
};
