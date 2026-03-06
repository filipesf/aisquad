/**
 * Toaster — mounts in App.tsx, renders all active toasts.
 *
 * Uses @radix-ui/react-toast (via the radix-ui umbrella package).
 * Styled to match the Mission Control design system: warm neutrals,
 * brand red for success variant, destructive red for errors.
 *
 * Viewport anchors to bottom-right — out of the way of the dashboard,
 * visible without obscuring the agent or task tables.
 */
import { Toast as ToastPrimitive } from 'radix-ui';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToastStore, type ToastVariant } from '@/hooks/useToast';

function variantClass(variant: ToastVariant = 'default'): string {
  if (variant === 'success')
    return 'bg-background border border-border text-foreground [&_[data-title]]:text-status-success';
  if (variant === 'destructive') return 'bg-destructive text-white border-0';
  return 'bg-background border border-border text-foreground';
}

export function Toaster() {
  const { toasts, removeToast } = useToastStore();

  return (
    <ToastPrimitive.Provider swipeDirection="right">
      {toasts.map((t) => (
        <ToastPrimitive.Root
          key={t.id}
          open
          onOpenChange={(open) => {
            if (!open) removeToast(t.id);
          }}
          duration={Infinity} /* we manage duration ourselves in the store */
          className={cn(
            // Layout
            'group pointer-events-auto relative flex w-full items-start gap-3 overflow-hidden',
            'rounded-lg p-4 shadow-lg',
            // Radix animation via data attributes — uses our motion tokens
            'data-[state=open]:animate-toast-in',
            'data-[state=closed]:animate-toast-out',
            'data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)]',
            'data-[swipe=cancel]:translate-x-0 data-[swipe=cancel]:transition-transform data-[swipe=cancel]:duration-200',
            'data-[swipe=end]:animate-toast-out',
            // Variant colours
            variantClass(t.variant),
          )}
        >
          <div className="flex-1 min-w-0">
            <ToastPrimitive.Title data-title className="text-sm font-medium leading-snug">
              {t.title}
            </ToastPrimitive.Title>
            {t.description && (
              <ToastPrimitive.Description className="mt-0.5 text-xs text-muted-foreground">
                {t.description}
              </ToastPrimitive.Description>
            )}
          </div>

          <ToastPrimitive.Close
            aria-label="Dismiss notification"
            className={cn(
              'shrink-0 rounded p-0.5 opacity-50 transition-opacity hover:opacity-100',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
              t.variant === 'destructive' ? 'text-white' : 'text-foreground',
            )}
          >
            <X className="h-3.5 w-3.5" />
          </ToastPrimitive.Close>
        </ToastPrimitive.Root>
      ))}

      {/* Viewport — fixed bottom-right, stacks toasts vertically */}
      <ToastPrimitive.Viewport
        className={cn(
          'fixed bottom-4 right-4 z-[200]',
          'flex flex-col gap-2',
          'w-[360px] max-w-[calc(100vw-2rem)]',
          // Focus outline for keyboard users
          'focus:outline-none',
        )}
      />
    </ToastPrimitive.Provider>
  );
}
