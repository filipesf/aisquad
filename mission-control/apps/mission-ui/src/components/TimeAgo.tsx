import { cn } from '@/lib/utils';
import { useTickClock } from '@/hooks/useTickClock';

interface TimeAgoProps {
  date: string | null;
  className?: string;
}

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffS = Math.floor(diffMs / 1000);

  if (diffS < 5) return 'just now';
  if (diffS < 60) return `${diffS}s ago`;

  const diffM = Math.floor(diffS / 60);
  if (diffM < 60) return `${diffM}m ago`;

  const diffH = Math.floor(diffM / 60);
  if (diffH < 24) return `${diffH}h ago`;

  const diffD = Math.floor(diffH / 24);
  return `${diffD}d ago`;
}

/**
 * Renders a human-readable relative time string that updates every ~10s.
 *
 * All mounted TimeAgo instances share a single global setInterval via
 * useTickClock — no per-instance timers.
 */
export function TimeAgo({ date, className = '' }: TimeAgoProps) {
  // Subscribes to the shared 10-second clock — causes a re-render on each tick.
  // The actual tick value is unused; the side-effect (re-render) is what matters.
  useTickClock();

  if (!date) {
    return <span className={cn('text-muted-foreground', className)}>never</span>;
  }

  return (
    <span className={className} title={new Date(date).toLocaleString()}>
      {formatTimeAgo(date)}
    </span>
  );
}
