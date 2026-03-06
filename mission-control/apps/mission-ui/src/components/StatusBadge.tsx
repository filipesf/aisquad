import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface StatusBadgeProps {
  status: string;
  className?: string;
}

// Semantic colour groups — each maps to a distinct visual tier
// Contrast ratios improved for WCAG AA compliance (4.5:1 for small text)
const STATUS_STYLES: Record<string, string> = {
  // ── Positive / active ─────────────────────────────────────────
  online: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  accepted: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  delivered: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',

  // ── In-flight / working ────────────────────────────────────────
  in_progress: 'border-blue-500/30 bg-blue-500/15 text-blue-700 dark:text-blue-400',
  started: 'border-blue-500/30 bg-blue-500/15 text-blue-700 dark:text-blue-400',
  assigned: 'border-blue-500/30 bg-blue-500/15 text-blue-700 dark:text-blue-400',

  // ── Pending / waiting ──────────────────────────────────────────
  // Increased background opacity and darker text for better contrast
  review: 'border-amber-500/30 bg-amber-500/20 text-amber-700 dark:text-amber-400',
  offered: 'border-amber-500/30 bg-amber-500/20 text-amber-700 dark:text-amber-400',
  queued: 'border-amber-500/30 bg-amber-500/20 text-amber-700 dark:text-amber-400',

  // ── Resolved / terminal ────────────────────────────────────────
  done: 'border-border bg-muted text-muted-foreground',
  completed: 'border-border bg-muted text-muted-foreground',
  cancelled: 'border-border bg-muted text-muted-foreground',

  // ── Degraded / offline ─────────────────────────────────────────
  offline: 'border-border bg-muted/50 text-muted-foreground',
  draining: 'border-border bg-muted/50 text-muted-foreground',

  // ── Error / blocked ────────────────────────────────────────────
  // Increased background opacity and darker text for better contrast
  blocked: 'border-red-500/30 bg-red-500/15 text-red-700 dark:text-red-400',
  expired: 'border-red-500/30 bg-red-500/15 text-red-700 dark:text-red-400',
  failed: 'border-red-500/30 bg-red-500/15 text-red-700 dark:text-red-400',
};

const FALLBACK = 'border-border text-foreground';

function formatStatus(status: string): string {
  return status.replace(/_/g, ' ');
}

// Statuses that have a "live" quality — rendered with a small pulsing indicator
const LIVE_STATUSES = new Set(['online', 'in_progress', 'started']);

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const style = STATUS_STYLES[status] ?? FALLBACK;
  const isLive = LIVE_STATUSES.has(status);

  return (
    <Badge
      variant="outline"
      className={cn(
        // Base: smooth color transition when status changes (e.g. online → offline on poll)
        'capitalize border font-medium truncate max-w-[140px]',
        'transition-[color,background-color,border-color] duration-[200ms]',
        style,
        className,
      )}
    >
      {/* Pulsing dot for live/active statuses — communicates "this is happening now" */}
      {isLive && (
        <span
          className="mr-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-current animate-live-pulse"
          aria-hidden="true"
        />
      )}
      {formatStatus(status)}
    </Badge>
  );
}
