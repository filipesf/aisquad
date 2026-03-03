import { describe, it, expect } from 'vitest';
import { assertTransition, getValidTransitions, InvalidTransitionError } from '../domain/tasks.js';

describe('task state machine', () => {
  describe('valid transitions', () => {
    const validCases: [string, string][] = [
      ['queued', 'assigned'],
      ['assigned', 'in_progress'],
      ['assigned', 'blocked'],
      ['assigned', 'queued'],
      ['in_progress', 'review'],
      ['in_progress', 'blocked'],
      ['review', 'done'],
      ['review', 'blocked'],
      ['review', 'in_progress'],
      ['blocked', 'queued'],
      ['blocked', 'assigned'],
      ['blocked', 'in_progress'],
      ['blocked', 'review'],
    ];

    for (const [from, to] of validCases) {
      it(`allows ${from} → ${to}`, () => {
        expect(() => assertTransition(from, to)).not.toThrow();
      });
    }
  });

  describe('invalid transitions', () => {
    const invalidCases: [string, string][] = [
      ['queued', 'in_progress'],
      ['queued', 'review'],
      ['queued', 'done'],
      ['queued', 'blocked'],
      ['assigned', 'done'],
      ['assigned', 'review'],
      ['in_progress', 'queued'],
      ['in_progress', 'assigned'],
      ['in_progress', 'done'],
      ['review', 'queued'],
      ['review', 'assigned'],
      ['done', 'queued'],
      ['done', 'assigned'],
      ['done', 'in_progress'],
      ['done', 'review'],
      ['done', 'blocked'],
    ];

    for (const [from, to] of invalidCases) {
      it(`rejects ${from} → ${to}`, () => {
        expect(() => assertTransition(from, to)).toThrow(InvalidTransitionError);
      });
    }
  });

  describe('getValidTransitions', () => {
    it('returns valid transitions for queued', () => {
      expect(getValidTransitions('queued')).toEqual(['assigned']);
    });

    it('returns valid transitions for assigned', () => {
      expect(getValidTransitions('assigned')).toEqual(['in_progress', 'blocked', 'queued']);
    });

    it('returns valid transitions for in_progress', () => {
      expect(getValidTransitions('in_progress')).toEqual(['review', 'blocked']);
    });

    it('returns valid transitions for review', () => {
      expect(getValidTransitions('review')).toEqual(['done', 'blocked', 'in_progress']);
    });

    it('returns valid transitions for blocked', () => {
      expect(getValidTransitions('blocked')).toEqual(['queued', 'assigned', 'in_progress', 'review']);
    });

    it('returns empty for done (terminal)', () => {
      expect(getValidTransitions('done')).toEqual([]);
    });

    it('returns empty for unknown state', () => {
      expect(getValidTransitions('unknown')).toEqual([]);
    });
  });
});
