import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface StatusBadgeProps {
  status: string;
  className?: string;
}

// Map statuses to shadcn Badge variants
type BadgeVariant = 'default' | 'secondary' | 'outline' | 'destructive';

const STATUS_VARIANTS: Record<string, BadgeVariant> = {
  // Agent statuses
  online: 'default',
  offline: 'secondary',
  draining: 'outline',

  // Task states
  queued: 'outline',
  assigned: 'secondary',
  in_progress: 'default',
  review: 'secondary',
  done: 'default',
  blocked: 'destructive',

  // Assignment statuses
  offered: 'secondary',
  accepted: 'default',
  started: 'default',
  completed: 'default',
  expired: 'destructive',
  cancelled: 'secondary',

  // Notification statuses
  delivered: 'default',
  failed: 'destructive',
};

function formatStatus(status: string): string {
  return status.replace(/_/g, ' ');
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const variant = STATUS_VARIANTS[status] ?? 'outline';

  return (
    <Badge variant={variant} className={cn('capitalize', className)}>
      {formatStatus(status)}
    </Badge>
  );
}
