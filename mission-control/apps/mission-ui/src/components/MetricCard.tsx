import { memo } from 'react';
import { cn } from '@/lib/utils';

interface MetricCardProps {
  label: string;
  value: string | number;
  /** Stagger index — drives animation delay so cards cascade in left-to-right */
  staggerIndex?: number;
  className?: string;
}

/** Pure display stat — memoized to skip re-renders when parent re-renders but value hasn't changed. */
export const MetricCard = memo(function MetricCard({
  label,
  value,
  staggerIndex = 0,
  className,
}: MetricCardProps) {
  return (
    <div
      className={cn('rounded-md border px-4 py-3 animate-metric-reveal', className)}
      style={{ '--stagger-i': staggerIndex } as React.CSSProperties}
    >
      <p className="text-xs text-muted-foreground mb-1">{String(label).replace(/_/g, ' ')}</p>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
});
