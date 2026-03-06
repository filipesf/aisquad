import { cn } from '@/lib/utils';

interface InlineCodeProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Renders a short code snippet inline within prose — useful in banners, descriptions,
 * and instructional copy.
 *
 * Replaces the repeated inline pattern:
 *   `<code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">`
 *
 * @example
 * <InlineCode>localStorage.setItem('MC_AGENT_TOKEN', '&lt;token&gt;')</InlineCode>
 * <InlineCode>CONTROL_API_TELEMETRY_TOKEN</InlineCode>
 */
export function InlineCode({ children, className }: InlineCodeProps) {
  return (
    <code className={cn('rounded bg-muted px-1.5 py-0.5 text-xs font-mono', className)}>
      {children}
    </code>
  );
}
