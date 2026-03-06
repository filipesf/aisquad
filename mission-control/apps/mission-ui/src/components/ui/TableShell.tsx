import { cn } from '@/lib/utils';

interface TableShellProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Bordered, rounded container that wraps a `<Table>` and gives it the standard
 * collapsed-border / rounded-corner treatment used across all data tables.
 *
 * Replaces the repeated inline pattern:
 *   `<div className="rounded-md border">`
 *
 * @example
 * <TableShell>
 *   <Table>…</Table>
 * </TableShell>
 */
export function TableShell({ children, className }: TableShellProps) {
  return <div className={cn('rounded-md border', className)}>{children}</div>;
}
