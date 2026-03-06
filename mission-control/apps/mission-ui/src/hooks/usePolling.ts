import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Hook that polls a function at regular intervals.
 *
 * Fetches immediately on mount, then every `intervalMs`.
 *
 * Visibility-aware: the interval is suspended while the browser tab is hidden
 * (document.visibilityState === 'hidden') and resumes — with an immediate
 * catch-up fetch — when the tab becomes visible again. This eliminates wasted
 * network requests when the user has switched to another tab.
 */
export function usePolling<T>(
  fetcher: () => Promise<T>,
  intervalMs: number
): { data: T | null; error: Error | null; loading: boolean; refresh: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const doFetch = useCallback(async () => {
    try {
      const result = await fetcherRef.current();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;

    function startPolling() {
      if (intervalId !== null) return;
      intervalId = setInterval(() => void doFetch(), intervalMs);
    }

    function stopPolling() {
      if (intervalId === null) return;
      clearInterval(intervalId);
      intervalId = null;
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        stopPolling();
      } else {
        // Tab became visible: fetch immediately then resume interval
        void doFetch();
        startPolling();
      }
    }

    // Initial fetch + start interval (only if tab is currently visible)
    void doFetch();
    if (document.visibilityState !== 'hidden') {
      startPolling();
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [doFetch, intervalMs]);

  return { data, error, loading, refresh: doFetch };
}
