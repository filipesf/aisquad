import { useEffect, useRef, useCallback, useState } from 'react';

/**
 * Hook that polls a function at regular intervals.
 * Fetches immediately on mount, then every `intervalMs`.
 */
export function usePolling<T>(
  fetcher: () => Promise<T>,
  intervalMs: number,
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
    void doFetch();
    const id = setInterval(() => void doFetch(), intervalMs);
    return () => clearInterval(id);
  }, [doFetch, intervalMs]);

  return { data, error, loading, refresh: doFetch };
}
