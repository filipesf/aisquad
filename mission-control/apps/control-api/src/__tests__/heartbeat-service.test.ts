import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the dependencies before importing the module under test
vi.mock('../services/redis.js', () => {
  const store = new Map<string, string>();
  return {
    redis: {
      set: vi.fn(async (key: string, value: string, _ex: string, _ttl: number, _nx: string) => {
        if (store.has(key)) return null; // Already exists → duplicate
        store.set(key, value);
        return 'OK';
      }),
      _store: store,
      _reset: () => store.clear(),
    },
  };
});

vi.mock('../domain/agents.js', () => ({
  getAgent: vi.fn(),
  markOnline: vi.fn(),
  updateLastSeen: vi.fn(),
}));

vi.mock('../domain/activities.js', () => ({
  emit: vi.fn(),
}));

import { recordHeartbeat } from '../services/heartbeat.js';
import * as agentDomain from '../domain/agents.js';
import * as activities from '../domain/activities.js';
import { redis } from '../services/redis.js';

const mockAgent = {
  id: '00000000-0000-0000-0000-000000000001',
  name: 'test-agent',
  session_key: 'key-1',
  status: 'offline' as const,
  capabilities: {},
  heartbeat_interval_ms: 10000,
  last_seen_at: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

describe('heartbeat service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the in-memory store
    const r = redis as unknown as { _reset: () => void };
    r._reset();
  });

  it('returns ok:false if agent does not exist', async () => {
    vi.mocked(agentDomain.getAgent).mockResolvedValue(null);

    const result = await recordHeartbeat('nonexistent-id');
    expect(result).toEqual({ ok: false, duplicate: false });
  });

  it('transitions offline agent to online on first heartbeat', async () => {
    vi.mocked(agentDomain.getAgent).mockResolvedValue({ ...mockAgent, status: 'offline' });
    vi.mocked(agentDomain.markOnline).mockResolvedValue({ ...mockAgent, status: 'online' });

    const result = await recordHeartbeat(mockAgent.id);

    expect(result).toEqual({ ok: true, duplicate: false });
    expect(agentDomain.markOnline).toHaveBeenCalledWith(mockAgent.id, expect.any(Date));
    expect(activities.emit).toHaveBeenCalledWith('agent.online', {
      agentId: mockAgent.id,
      name: mockAgent.name,
    });
  });

  it('updates last_seen_at for already-online agent', async () => {
    vi.mocked(agentDomain.getAgent).mockResolvedValue({ ...mockAgent, status: 'online' });
    vi.mocked(agentDomain.updateLastSeen).mockResolvedValue({ ...mockAgent, status: 'online' });

    const result = await recordHeartbeat(mockAgent.id);

    expect(result).toEqual({ ok: true, duplicate: false });
    expect(agentDomain.markOnline).not.toHaveBeenCalled();
    expect(agentDomain.updateLastSeen).toHaveBeenCalledWith(mockAgent.id, expect.any(Date));
  });

  it('rejects duplicate sequence IDs', async () => {
    vi.mocked(agentDomain.getAgent).mockResolvedValue({ ...mockAgent, status: 'online' });
    vi.mocked(agentDomain.updateLastSeen).mockResolvedValue({ ...mockAgent, status: 'online' });

    const seqId = 'seq-001';

    // First call — should process
    const r1 = await recordHeartbeat(mockAgent.id, seqId);
    expect(r1).toEqual({ ok: true, duplicate: false });

    // Second call with same sequence ID — should be duplicate
    const r2 = await recordHeartbeat(mockAgent.id, seqId);
    expect(r2).toEqual({ ok: true, duplicate: true });

    // Agent update should only have been called once
    expect(agentDomain.updateLastSeen).toHaveBeenCalledTimes(1);
  });

  it('allows different sequence IDs', async () => {
    vi.mocked(agentDomain.getAgent).mockResolvedValue({ ...mockAgent, status: 'online' });
    vi.mocked(agentDomain.updateLastSeen).mockResolvedValue({ ...mockAgent, status: 'online' });

    const r1 = await recordHeartbeat(mockAgent.id, 'seq-001');
    const r2 = await recordHeartbeat(mockAgent.id, 'seq-002');

    expect(r1.duplicate).toBe(false);
    expect(r2.duplicate).toBe(false);
    expect(agentDomain.updateLastSeen).toHaveBeenCalledTimes(2);
  });

  it('processes heartbeat without sequence_id (no idempotency check)', async () => {
    vi.mocked(agentDomain.getAgent).mockResolvedValue({ ...mockAgent, status: 'online' });
    vi.mocked(agentDomain.updateLastSeen).mockResolvedValue({ ...mockAgent, status: 'online' });

    const r1 = await recordHeartbeat(mockAgent.id);
    const r2 = await recordHeartbeat(mockAgent.id);

    expect(r1.duplicate).toBe(false);
    expect(r2.duplicate).toBe(false);
    expect(agentDomain.updateLastSeen).toHaveBeenCalledTimes(2);
  });
});
