import { ClipboardList, Cpu, Crosshair, Radio, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useOnboarding } from '@/hooks/useOnboarding';

/**
 * First-visit welcome banner.
 *
 * Shown once to new operators to orient them in 10 seconds:
 *   - What Mission Control is (one line)
 *   - Three core concepts (Agents, Tasks, Activity) — each in a sentence
 *   - A single, clear next step
 *
 * Dismisses on close button or "Got it" CTA. State persists in localStorage
 * so returning operators never see it again.
 *
 * Design constraints:
 *   - No modal — never blocks access to the product
 *   - No multi-step flow — single card, 3 bullets, done
 *   - Respect operator intelligence — no patronising tone
 */
export function WelcomeBanner() {
  const { dismissed, dismiss } = useOnboarding('welcome-banner-v1');

  if (dismissed) return null;

  return (
    <section
      className="relative animate-fade-up rounded-lg border border-primary/20 bg-primary/5 p-4"
      style={{ '--stagger-i': 0 } as React.CSSProperties}
      aria-label="Welcome to Mission Control"
    >
      {/* Dismiss */}
      <button
        type="button"
        onClick={dismiss}
        className="absolute top-3 right-3 rounded p-1 text-muted-foreground outline-none transition-colors duration-[--dur-instant] hover:bg-muted/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
        aria-label="Dismiss welcome banner"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      {/* Headline */}
      <div className="mb-3 flex items-center gap-2">
        <Crosshair className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <span className="font-semibold text-sm tracking-tight">Welcome to Mission Control</span>
      </div>

      {/* Three core concepts */}
      <ul className="mb-4 space-y-2" aria-label="Core concepts">
        <li className="flex items-start gap-2.5">
          <Cpu className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/70" aria-hidden="true" />
          <p className="text-muted-foreground text-xs leading-relaxed">
            <span className="font-medium text-foreground">Agents</span> — AI workers that register
            via the API, send heartbeats, and receive task assignments.
          </p>
        </li>
        <li className="flex items-start gap-2.5">
          <ClipboardList
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/70"
            aria-hidden="true"
          />
          <p className="text-muted-foreground text-xs leading-relaxed">
            <span className="font-medium text-foreground">Tasks</span> — work items that flow
            through a state machine: queued → assigned → in progress → review → done.
          </p>
        </li>
        <li className="flex items-start gap-2.5">
          <Radio className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/70" aria-hidden="true" />
          <p className="text-muted-foreground text-xs leading-relaxed">
            <span className="font-medium text-foreground">Activity feed</span> — a live stream of
            every event: agents coming online, tasks changing state, assignments being offered.
          </p>
        </li>
      </ul>

      {/* CTA row */}
      <div className="flex items-center gap-3">
        <Button size="sm" className="h-7 text-xs" onClick={dismiss}>
          Got it
        </Button>
        <span className="text-muted-foreground text-xs">
          Start by connecting an agent or creating a task below.
        </span>
      </div>
    </section>
  );
}
