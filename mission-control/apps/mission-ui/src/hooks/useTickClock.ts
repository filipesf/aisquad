import { useEffect, useState } from 'react';

/**
 * Shared global ticker — one setInterval drives ALL TimeAgo components
 * instead of each instance spawning its own.
 *
 * Subscribers register/unregister themselves; the interval starts only
 * when the first subscriber attaches and is cleared when the last one
 * leaves.
 */
type Listener = () => void;

const listeners = new Set<Listener>();
let intervalId: ReturnType<typeof setInterval> | null = null;

function startIfNeeded() {
  if (intervalId !== null) return;
  intervalId = setInterval(() => {
    for (const fn of listeners) fn();
  }, 10_000);
}

function stopIfUnused() {
  if (listeners.size > 0) return;
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

function subscribe(fn: Listener) {
  listeners.add(fn);
  startIfNeeded();
  return () => {
    listeners.delete(fn);
    stopIfUnused();
  };
}

/**
 * Returns a tick counter that increments every ~10 seconds (shared clock).
 * Causes a re-render in the calling component so time-relative strings refresh.
 */
export function useTickClock(): number {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const unsubscribe = subscribe(() => setTick((t) => t + 1));
    return unsubscribe;
  }, []);

  return tick;
}
