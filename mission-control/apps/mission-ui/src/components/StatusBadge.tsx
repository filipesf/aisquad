interface StatusBadgeProps {
  status: string;
  className?: string;
}

const STATUS_STYLES: Record<string, string> = {
  // Agent statuses
  online: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  offline: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  draining: 'bg-amber-500/20 text-amber-400 border-amber-500/30',

  // Task states
  queued: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  assigned: 'bg-violet-500/20 text-violet-400 border-violet-500/30',
  in_progress: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  review: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  done: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  blocked: 'bg-red-500/20 text-red-400 border-red-500/30',

  // Assignment statuses
  offered: 'bg-violet-500/20 text-violet-400 border-violet-500/30',
  accepted: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  started: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  completed: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  expired: 'bg-red-500/20 text-red-400 border-red-500/30',
  cancelled: 'bg-gray-500/20 text-gray-400 border-gray-500/30',

  // Notification statuses
  delivered: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  failed: 'bg-red-500/20 text-red-400 border-red-500/30',
};

const DEFAULT_STYLE = 'bg-gray-500/20 text-gray-400 border-gray-500/30';

function formatStatus(status: string): string {
  return status.replace(/_/g, ' ');
}

export function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  const style = STATUS_STYLES[status] ?? DEFAULT_STYLE;

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${style} ${className}`}
    >
      {formatStatus(status)}
    </span>
  );
}
