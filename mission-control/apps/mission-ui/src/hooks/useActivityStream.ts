import { useCallback, useEffect, useRef, useState } from 'react';
import { createActivityStream, listActivities } from '../lib/api.ts';
import type { Activity } from '../types/domain.ts';

const MAX_ACTIVITIES = 200;

/**
 * Hook that subscribes to the SSE activity stream and maintains
 * a list of recent activities.
 */
export function useActivityStream(): {
  activities: Activity[];
  connected: boolean;
} {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [connected, setConnected] = useState(false);
  const sourceRef = useRef<EventSource | null>(null);

  const addActivity = useCallback((activity: Activity) => {
    setActivities((prev) => {
      // Deduplicate by id
      if (prev.some((a) => a.id === activity.id)) return prev;
      const next = [activity, ...prev];
      return next.slice(0, MAX_ACTIVITIES);
    });
  }, []);

  useEffect(() => {
    // Load initial activities
    void listActivities(50).then((initial) => {
      setActivities(initial);
    });

    // Connect to SSE stream
    const source = createActivityStream((activity) => {
      addActivity(activity);
    });

    const markConnected = () => setConnected(true);
    const markDisconnected = () => {
      if (source.readyState === EventSource.CLOSED) {
        setConnected(false);
      }
    };

    source.addEventListener('open', markConnected);
    source.addEventListener('ping', markConnected);
    source.addEventListener('activity', markConnected);
    source.addEventListener('error', markDisconnected);

    sourceRef.current = source;

    return () => {
      source.close();
      sourceRef.current = null;
      setConnected(false);
    };
  }, [addActivity]);

  return { activities, connected };
}
