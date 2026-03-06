import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  message: string;
  className?: string;
}

/**
 * Centred empty-state placeholder with an icon and a short message.
 *
 * Replaces the repeated inline pattern used in AgentsTable and ActivityFeed:
 * ```tsx
 * <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
 *   <Icon className="h-8 w-8 text-muted-foreground/40" />
 *   <p className="text-sm text-muted-foreground">…</p>
 * </div>
 * ```
 *
 * When used inside a Table, wrap with `<TableRow><TableCell colSpan={n}>` yourself.
 *
 * @example
 * // Standalone (e.g. AgentsTable)
 * <EmptyState icon={Users} message="No agents connected yet" />
 *
 * // Inside a table body
 * <TableRow>
 *   <TableCell colSpan={columns.length}>
 *     <EmptyState icon={ClipboardList} message="No tasks yet." />
 *   </TableCell>
 * </TableRow>
 */
export function EmptyState({ icon: Icon, message, className }: EmptyStateProps) {
  return (
    <div
      className={cn('flex flex-col items-center justify-center gap-2 py-12 text-center', className)}
    >
      <Icon className="h-8 w-8 text-muted-foreground/40" aria-hidden="true" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
