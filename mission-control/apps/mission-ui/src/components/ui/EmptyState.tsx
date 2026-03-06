import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon: LucideIcon;
  /** Short headline. */
  message: string;
  /**
   * Optional longer explanation shown below the headline.
   * Use to explain *why* this section exists and *what value* it provides.
   */
  description?: React.ReactNode;
  /**
   * Optional call-to-action rendered below the description.
   * Pass a `<Button>` or any other element.
   */
  action?: React.ReactNode;
  className?: string;
}

/**
 * Centred empty-state placeholder with an icon, headline, optional
 * description, and optional CTA.
 *
 * The basic variant (icon + message only) is backward-compatible with all
 * existing call sites. Rich variants add `description` and/or `action`.
 *
 * @example
 * // Basic (existing call sites are unchanged)
 * <EmptyState icon={Users} message="No agents connected yet" />
 *
 * // Rich — with description and CTA
 * <EmptyState
 *   icon={Users}
 *   message="No agents connected yet"
 *   description="Agents register via the API and send heartbeats to stay online."
 *   action={<Button size="sm" onClick={…}>View setup guide</Button>}
 * />
 *
 * // Inside a table body
 * <TableRow>
 *   <TableCell colSpan={columns.length}>
 *     <EmptyState icon={ClipboardList} message="No tasks yet." />
 *   </TableCell>
 * </TableRow>
 */
export function EmptyState({
  icon: Icon,
  message,
  description,
  action,
  className
}: EmptyStateProps) {
  return (
    <div
      className={cn('flex flex-col items-center justify-center gap-2 py-12 text-center', className)}
    >
      <Icon className="h-8 w-8 text-muted-foreground/40" aria-hidden="true" />
      <p className="font-medium text-foreground/70 text-sm">{message}</p>
      {description && (
        <p className="max-w-md whitespace-normal text-balance text-muted-foreground text-xs leading-relaxed">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
