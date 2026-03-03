import { describe, it, expect } from 'vitest';
import { AgentStatus } from '@mc/shared';

describe('agent status', () => {
  it('defines valid statuses', () => {
    expect(AgentStatus.options).toEqual(['online', 'offline', 'draining']);
  });

  it('validates online status', () => {
    expect(AgentStatus.parse('online')).toBe('online');
  });

  it('validates offline status', () => {
    expect(AgentStatus.parse('offline')).toBe('offline');
  });

  it('validates draining status', () => {
    expect(AgentStatus.parse('draining')).toBe('draining');
  });

  it('rejects invalid status', () => {
    expect(() => AgentStatus.parse('unknown')).toThrow();
  });

  describe('status transition rules', () => {
    // Define valid transitions
    const validTransitions: Record<string, string[]> = {
      offline: ['online'],
      online: ['offline', 'draining'],
      draining: ['offline'],
    };

    function isValidTransition(from: string, to: string): boolean {
      return validTransitions[from]?.includes(to) ?? false;
    }

    it('allows offline → online', () => {
      expect(isValidTransition('offline', 'online')).toBe(true);
    });

    it('allows online → offline', () => {
      expect(isValidTransition('online', 'offline')).toBe(true);
    });

    it('allows online → draining', () => {
      expect(isValidTransition('online', 'draining')).toBe(true);
    });

    it('allows draining → offline', () => {
      expect(isValidTransition('draining', 'offline')).toBe(true);
    });

    it('rejects offline → draining', () => {
      expect(isValidTransition('offline', 'draining')).toBe(false);
    });

    it('rejects draining → online', () => {
      expect(isValidTransition('draining', 'online')).toBe(false);
    });
  });
});
