import { cn } from '@/lib/utils';

interface SectionLabelProps {
  children: React.ReactNode;
  className?: string;
  /** Pass an id to pair with aria-labelledby on the controlled element. */
  id?: string;
}

/**
 * Uppercase, tracking-wider section heading used inside sheets and detail panels.
 *
 * Replaces the repeated inline pattern:
 *   `className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"`
 *
 * @example
 * <SectionLabel>Capabilities</SectionLabel>
 * <SectionLabel id="state-label" className="mb-1.5">Change Status</SectionLabel>
 */
export function SectionLabel({ children, className, id }: SectionLabelProps) {
  return (
    <p
      id={id}
      className={cn(
        'mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground',
        className,
      )}
    >
      {children}
    </p>
  );
}
