import { redis } from './redis.js';
import * as agents from '../domain/agents.js';
import * as activities from '../domain/activities.js';

const SEQUENCE_TTL_SECONDS = 60;

/**
 * Record a heartbeat for an agent.
 * - Idempotency: if a sequence_id is provided and was already seen, skip processing.
 * - Transitions agent from offline→online and emits agent.online activity.
 * - Updates last_seen_at on every (non-duplicate) heartbeat.
 */
export async function recordHeartbeat(
  agentId: string,
  sequenceId?: string,
): Promise<{ ok: boolean; duplicate: boolean }> {
  // Idempotency guard: skip if we've already processed this sequence
  if (sequenceId) {
    const key = `hb:seq:${agentId}:${sequenceId}`;
    const wasSet = await redis.set(key, '1', 'EX', SEQUENCE_TTL_SECONDS, 'NX');
    if (wasSet === null) {
      return { ok: true, duplicate: true };
    }
  }

  const agent = await agents.getAgent(agentId);
  if (!agent) {
    return { ok: false, duplicate: false };
  }

  const now = new Date();
  const wasOffline = agent.status === 'offline';

  if (wasOffline) {
    await agents.markOnline(agentId, now);
    await activities.emit('agent.online', { agentId, name: agent.name });
  } else {
    await agents.updateLastSeen(agentId, now);
  }

  return { ok: true, duplicate: false };
}
