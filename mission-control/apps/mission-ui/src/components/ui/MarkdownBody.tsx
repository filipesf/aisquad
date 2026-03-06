import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import { cn } from '@/lib/utils';

interface MarkdownBodyProps {
  children: string;
  className?: string;
}

/**
 * Renders markdown content with consistent prose styling.
 * Uses rehype-sanitize to prevent XSS from agent-authored content.
 *
 * Intentionally minimal styling — no @tailwindcss/typography dependency.
 */
export function MarkdownBody({ children, className }: MarkdownBodyProps) {
  return (
    <div
      className={cn(
        'break-words text-sm',
        // Prose-like spacing without the full typography plugin
        '[&>p:last-child]:mb-0 [&>p]:mb-2',
        '[&>ul]:mb-2 [&>ul]:list-disc [&>ul]:pl-4',
        '[&>ol]:mb-2 [&>ol]:list-decimal [&>ol]:pl-4',
        '[&>li]:mb-0.5',
        '[&>h1]:mb-1 [&>h1]:font-semibold [&>h1]:text-base',
        '[&>h2]:mb-1 [&>h2]:font-semibold [&>h2]:text-sm',
        '[&>h3]:mb-1 [&>h3]:font-medium [&>h3]:text-sm',
        '[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs',
        '[&>pre]:mb-2 [&>pre]:overflow-x-auto [&>pre]:rounded [&>pre]:bg-muted [&>pre]:p-3',
        '[&>pre_code]:bg-transparent [&>pre_code]:p-0',
        '[&_a]:underline [&_a]:underline-offset-2',
        '[&>blockquote]:border-border [&>blockquote]:border-l-2 [&>blockquote]:pl-3 [&>blockquote]:text-muted-foreground',
        '[&>hr]:my-2 [&>hr]:border-border',
        className
      )}
    >
      <ReactMarkdown rehypePlugins={[rehypeSanitize]}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
