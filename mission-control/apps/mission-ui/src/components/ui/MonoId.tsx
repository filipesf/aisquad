import { cn } from '@/lib/utils';

interface MonoIdProps {
  /** The full identifier string. */
  children: string;
  /**
   * When provided, only the first `slice` characters are shown with a trailing ellipsis.
   * The full value is always accessible via the `title` tooltip.
   * @default undefined — shows the full string
   */
  slice?: number;
  className?: string;
}

/**
 * Renders an identifier (UUID, agent id, task id…) in a compact monospace style.
 *
 * Replaces the repeated inline pattern:
 *   `<span className="font-mono text-xs text-muted-foreground truncate" title={value}>`
 *
 * @example
 * <MonoId>{agent.id}</MonoId>
 * <MonoId slice={8}>{assignment.task_id}</MonoId>
 */
export function MonoId({ children, slice, className }: MonoIdProps) {
  const display = slice !== undefined ? `${children.slice(0, slice)}…` : children;

  return (
    <span
      className={cn('truncate font-mono text-muted-foreground text-xs', className)}
      title={children}
    >
      {display}
    </span>
  );
}
