import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface StatusBadgeProps {
  status: string;
  className?: string;
}

// Semantic colour groups — each maps to a distinct visual tier
const STATUS_STYLES: Record<string, string> = {
  // ── Positive / active ─────────────────────────────────────────
  online:    'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  accepted:  'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  delivered: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',

  // ── In-flight / working ────────────────────────────────────────
  in_progress: 'border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400',
  started:     'border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400',
  assigned:    'border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400',

  // ── Pending / waiting ──────────────────────────────────────────
  review:  'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  offered: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  queued:  'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400',

  // ── Resolved / terminal ────────────────────────────────────────
  done:      'border-border bg-muted text-muted-foreground',
  completed: 'border-border bg-muted text-muted-foreground',
  cancelled: 'border-border bg-muted text-muted-foreground',

  // ── Degraded / offline ─────────────────────────────────────────
  offline:  'border-border bg-muted/50 text-muted-foreground',
  draining: 'border-border bg-muted/50 text-muted-foreground',

  // ── Error / blocked ────────────────────────────────────────────
  blocked: 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400',
  expired: 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400',
  failed:  'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400',
};

const FALLBACK = 'border-border text-foreground';

function formatStatus(status: string): string {
  return status.replace(/_/g, ' ');
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const style = STATUS_STYLES[status] ?? FALLBACK;

  return (
    <Badge
      variant="outline"
      className={cn('capitalize border font-medium', style, className)}
    >
      {formatStatus(status)}
    </Badge>
  );
}
