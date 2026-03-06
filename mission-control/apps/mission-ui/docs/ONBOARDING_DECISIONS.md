# Mission UI — Onboarding Design Decisions

**Date:** 2026-03-06  
**Scope:** `apps/mission-ui/src` — first-visit orientation, empty states, contextual guidance, and discoverability improvements  
**Baseline:** Post-delight pass (see `DELIGHT_DECISIONS.md`)

---

## Design Philosophy

Mission Control is a **control room for a single technical operator**. Its design context (see `DESIGN_CONTEXT.md`) describes a user who manages an AI agent fleet — a person who registers agents via an API, creates tasks programmatically, and monitors assignment flow. This is not a consumer onboarding problem.

The challenge, then, is not converting an uncertain stranger into a user. It is getting a technically-capable operator — possibly brand new to this specific stack — to their **operational moment of clarity** as quickly as possible. The "aha moment" for Mission Control is the instant a user sees agents online, a task queued, and activity flowing in the feed simultaneously. Everything before that is friction.

Three rules governed all decisions in this pass:

1. **Never block access to the product.** No setup wizards, no forced tours, no modals the user must dismiss before working. The product is always fully usable.
2. **Teach with context, not ceremony.** Instructions live where they are needed — inside the empty state that appears because there is no data, next to the button that triggers the shortcut, at the moment of the error. Not in a separate intro screen.
3. **Respect the operator's intelligence.** One sentence of orientation, not a paragraph of explanation. Assume they can read API docs; help them find the right one.

---

## `useOnboarding` Hook

**File:** `src/hooks/useOnboarding.ts` _(new)_

### Problem

Any component that wants to show a one-time hint needs to independently manage localStorage read/write, handle storage exceptions (private browsing, quota exceeded), and expose a `dismiss` callback. Without a shared primitive, this logic would be duplicated — or worse, done inconsistently, causing hints to re-appear on reload.

### Decision

Extract a minimal `useOnboarding(key: string)` hook that encapsulates the full lifecycle:

```ts
export function useOnboarding(key: string): {
  dismissed: boolean;
  dismiss: () => void;
  reset: () => void; // useful for debugging / dev tooling
};
```

**Key namespacing:** Every key is stored as `mc_ob_{key}` to prevent collisions with other `localStorage` entries (e.g., `MC_AGENT_TOKEN`, `MC_TELEMETRY_TOKEN`). The `mc_ob_` prefix makes onboarding keys identifiable at a glance in DevTools.

**Lazy initialisation:** `dismissed` state is initialised with a lazy function passed to `useState`, which reads from `localStorage` exactly once on mount. This avoids repeated storage reads across re-renders.

**Exception safety:** Both `dismiss` and `reset` wrap their `localStorage` calls in `try/catch`. Private browsing mode in Safari throws `SecurityError` on storage access; storage quota exceeded throws `QuotaExceededError`. Either error results in a graceful fallback: `dismiss` still sets local React state (so the component hides for the session), `reset` silently no-ops. The hint will reappear on the next page load in these environments, which is the correct degraded behaviour.

**Why `reset()`?**  
It is not used in production code — but it provides a safe escape hatch for developers who want to test onboarding behaviour without manually clearing storage. In the future, a dev panel or console utility could expose it.

**Why not a Context provider?**  
Each hint's dismissed state is independent. A shared context would create unnecessary coupling between unrelated components and require wrapping a provider high in the tree. The hook reads directly from `localStorage` on mount — fast, synchronous, and requires no coordination.

---

## `EmptyState` Component — Rich Variant

**File:** `src/components/ui/EmptyState.tsx`

### Problem

The existing `EmptyState` component accepted only `icon` and `message`. This was adequate when empty states were purely status indicators ("no data yet"), but insufficient for onboarding contexts where the empty state is also the primary instruction surface for new operators.

The existing signature:

```tsx
<EmptyState icon={Users} message="No agents connected yet" />
```

Produces: an icon and a single line of text. No explanation of what to do next. No action to take. A new operator seeing this has no idea what "connected" means or how to make an agent appear.

### Decision

Extend `EmptyState` with two optional props — `description` and `action` — while keeping the existing call sites completely unchanged:

```tsx
interface EmptyStateProps {
  icon: LucideIcon;
  message: string; // Short headline — unchanged
  description?: React.ReactNode; // Why this exists + what to do
  action?: React.ReactNode; // CTA button or link
  className?: string;
}
```

**Why `React.ReactNode` for `description`?**  
Some descriptions reference inline code (`InlineCode` component for API endpoints). A string prop cannot render JSX. `React.ReactNode` allows the caller to compose rich content while keeping the component itself agnostic about formatting.

**Why `React.ReactNode` for `action`?**  
Action buttons differ by context: the Agents empty state needs an external link; the Tasks empty state needs a button that calls `setCreateOpen(true)`. A `React.ReactNode` prop lets each call site pass the right button variant, size, and handler without the `EmptyState` component knowing anything about navigation or dialog state.

**Backward compatibility:** All three existing call sites (`AgentsTable`, `TasksTable`, `ActivityFeed`) use only `icon` and `message`. They continue to work without modification. The `description` and `action` props are strictly additive.

**Visual hierarchy change:** The `message` text class changed from `text-muted-foreground` to `text-foreground/70`. This makes the headline slightly more prominent when `description` text follows it at full `text-muted-foreground` — creating a two-level hierarchy (headline → explanatory text) without introducing a size difference that would feel disproportionate at the small scale of an empty state.

---

## Agents Table — Contextual Empty State

**File:** `src/components/agents/AgentsTable.tsx`

### Problem

**Before:**

```tsx
<EmptyState icon={Users} message="No agents connected yet" />
```

This tells the operator that no agents are connected. It does not tell them:

- What "connected" means (registered + heartbeating)
- How to make an agent appear (call `POST /agents`)
- That this is expected on first run (not an error)

A new operator on their first run sees this and has nowhere to go. They must open separate documentation to understand the next step.

### Decision

**After:**

```tsx
<EmptyState
  icon={Users}
  message="No agents connected yet"
  description={
    <>
      Agents register via <InlineCode>POST /agents</InlineCode> and send heartbeats to stay online.
      Once connected, they appear here with live status.
    </>
  }
/>
```

The description teaches two things in two sentences:

1. The registration mechanism (API endpoint)
2. The liveness model (heartbeats keep agents online)

The `InlineCode` component renders the endpoint in a monospace chip, making it immediately scannable and copy-friendly. It is not a link — the operator is technical; they know where to find the API documentation. The goal is orientation, not hand-holding.

**Why no CTA button here?**  
Agent registration is a programmatic operation performed outside the UI (via `curl`, an SDK, or another agent). A button in the UI cannot meaningfully help. Adding a "View docs" link was considered but rejected — there is no canonical documentation URL to link to (the docs are in the repo's RUNBOOK.md, not a hosted URL the UI can reference). The inline `POST /agents` endpoint reference is sufficient.

---

## Tasks Table — Contextual Empty States

**File:** `src/components/tasks/TasksTable.tsx`

### Problem

Two distinct empty states shared identical presentation:

```tsx
// Before:
{
  hasFilters ? 'No tasks match your filters.' : 'No tasks yet.';
}
```

Both were rendered as plain text inside a `<TableCell>` with `text-center text-muted-foreground`. Neither had an action. Neither explained anything.

The "no tasks yet" case was particularly problematic: the "New task" button exists in the toolbar directly above the table, but a new operator scanning an empty table has no visual connection between the empty state and the button that fixes it.

The "no match" case was a dead end: the operator sees no results, but has no affordance to clear the filters causing the problem.

### Decision: Two distinct rich empty states

**Case 1 — No tasks exist:**

```tsx
<EmptyState
  icon={ClipboardList}
  message="No tasks yet"
  description="Tasks move through a state machine — from queued through assigned,
               in progress, review, and done. Create your first task to get started."
  action={
    <Button size="sm" className="text-xs" onClick={() => setCreateOpen(true)}>
      <PlusCircle className="mr-1.5 h-3.5 w-3.5" />
      Create first task
    </Button>
  }
/>
```

The description introduces the state machine concept in plain language. This is the one place in the UI where the task lifecycle is explained upfront — everywhere else it is assumed knowledge. The CTA calls `setCreateOpen(true)`, which is the same function wired to the "New task" toolbar button and the `N` keyboard shortcut. There is no separate path — the empty state reuses existing infrastructure.

**Case 2 — Filters active, no results:**

```tsx
<EmptyState
  icon={ClipboardList}
  message="No tasks match your filters"
  description="Try adjusting the status or priority filters, or clear them to see all tasks."
  action={
    <Button
      variant="outline"
      size="sm"
      className="text-xs"
      onClick={() => {
        table.getColumn('state')?.setFilterValue(undefined);
        table.getColumn('priority')?.setFilterValue(undefined);
      }}
    >
      Clear filters
    </Button>
  }
/>
```

The CTA clears both active filters simultaneously with one click — the same action as the "Clear all" toolbar button. This eliminates the dead end: the operator can recover from a zero-result filter state without scrolling back to the toolbar.

**Why `period` not `h-24 text-center` for the cell?**  
The original cell used `h-24` (96px fixed height) for the empty row. The new rich empty state (with icon, headline, description, and button) is taller than 96px. Removing the height constraint and setting `p-0` on the cell lets the `EmptyState` component control its own padding via its internal `py-12` class. The table still visually reads as a table cell; the height is just correct for the content.

---

## Keyboard Shortcut Discovery — `N` Hint

**File:** `src/components/tasks/TasksTable.tsx`

### Problem

The `N` keyboard shortcut to open the create-task dialog has been wired in `Dashboard.tsx` since the animation pass. It is invisible — there is no indication anywhere in the UI that pressing `N` does anything.

Keyboard shortcuts that are not discoverable are effectively unavailable to most users. The only discovery mechanism was reading documentation or accidentally pressing the key.

### Decision

A `<kbd>` chip is rendered immediately to the left of the "New task" button:

```tsx
<div className="ml-auto flex items-center gap-1.5">
  <kbd
    className="hidden sm:inline-flex items-center rounded border border-border
               bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground
               select-none"
    title="Keyboard shortcut"
    aria-label="Keyboard shortcut: N"
  >
    N
  </kbd>
  <Button size="sm" className="h-8 text-xs ..." onClick={() => setCreateOpen(true)}>
    <PlusCircle className="mr-1.5 h-3.5 w-3.5" />
    New task
  </Button>
</div>
```

**Semantic element:** `<kbd>` is the correct HTML element for keyboard input. Screen readers announce it as keyboard input, and browsers may apply default monospace styling. The custom classes override browser defaults to match the design system.

**Hidden on mobile (`hidden sm:inline-flex`):** The `N` shortcut handler checks for focus in editable fields and fires only on keydown — this is a desktop keyboard-driven interaction. On small screens where a physical keyboard is unlikely, the chip adds no value and costs horizontal space in an already-compact toolbar.

**`select-none`:** Prevents the chip from being included in text selections, which would look odd if the user tries to select the button label.

**Why not a tooltip?**  
A tooltip requires hover, which is a secondary discovery mechanism. The `<kbd>` chip is always visible — it teaches the shortcut the first time the operator looks at the toolbar, without requiring any interaction. This matches the design principle from `DESIGN_CONTEXT.md`: "Zero Hidden Affordances."

**Why no `aria-keyshortcuts` on the button?**  
`aria-keyshortcuts` is poorly supported across screen readers and assistive technology as of this writing. The explicit `aria-label="Keyboard shortcut: N"` on the `<kbd>` element is more reliably announced.

---

## `WelcomeBanner` — First-Visit Orientation

**File:** `src/components/WelcomeBanner.tsx` _(new)_

### Problem

A new operator opening Mission Control for the first time sees three labelled tables (Agents, Tasks, Activity) that are all empty. Nothing in the interface explains:

- What Mission Control is for
- What agents are, or how they relate to tasks
- What the activity feed will show when things are working

The `ApiAuthBanner` covers the auth failure case. The empty state improvements cover the "I'm here and need to do something" case. But neither covers the "I just arrived and don't know where to start" case — the true first-visit moment.

### Decision

A dismissable inline banner rendered at the top of the Dashboard that explains Mission Control in exactly three concepts:

```tsx
export function WelcomeBanner() {
  const { dismissed, dismiss } = useOnboarding('welcome-banner-v1');
  if (dismissed) return null;
  // ...
}
```

**Structure:**

1. **Headline** — "Welcome to Mission Control" with the Crosshair logo icon for visual continuity with the header.
2. **Three bullet concepts** — each a single sentence with a bold term:
   - **Agents** — what they are and how they stay online
   - **Tasks** — what they are and how they move through the system
   - **Activity feed** — what it shows and why it's the live signal
3. **CTA row** — "Got it" button (which dismisses) + a short prompt pointing down to the sections below.

**Why exactly three concepts?**  
The three sections on the Dashboard map 1:1 to the three concepts: Agents section → Agents bullet; Tasks section → Tasks bullet; Activity section → Activity feed bullet. After reading the banner, the operator can look directly below each concept and see the corresponding section. The spatial correspondence reinforces orientation.

**Why an inline banner, not a modal?**  
A modal blocks access to the product until dismissed. The Design Principles section of `DESIGN_CONTEXT.md` specifies "No modal interruptions unless explicitly invoked." An inline banner above the sections allows the operator to read it while seeing the actual UI it describes — or to ignore it entirely and work immediately.

**Why no multi-step tour?**  
Mission Control has two tabs and three sections. A multi-step tour is disproportionate to the complexity. Three bullets in one card is faster to read and easier to dismiss than a five-step walkthrough with spotlight overlays.

**Dismissal persistence:**  
State is stored via `useOnboarding('welcome-banner-v1')` — key `mc_ob_welcome-banner-v1` in `localStorage`. The key is versioned (`v1`) so that a future redesign of the banner can show it again to existing operators by bumping the version, without affecting other onboarding keys.

**Dual dismiss paths:**  
Both the `×` button (top-right) and the "Got it" button call `dismiss`. The `×` is for operators who want to dismiss immediately without reading; "Got it" is for operators who read it and want to confirm completion. Both call the same function — the distinction is presentational, not functional.

**Stagger index:** The banner uses `--stagger-i: 0` for its fade-up animation, causing it to animate in first. The Dashboard sections below it (Agents, Tasks, Activity) were updated to `--stagger-i: 1`, `2`, `3` respectively to maintain the correct cascade order.

**Why `<section>` not `<div>`?**  
The banner contains a semantically meaningful region (orientation instructions). `<section>` with `aria-label="Welcome to Mission Control"` makes this region discoverable in screen reader document outlines. The `aria-label` is identical to the visible heading text, which is the correct pattern when the section's heading is not an `<h*>` element.

---

## `ApiAuthBanner` — Step-by-Step Format

**File:** `src/components/ApiAuthBanner.tsx`

### Problem

**Before:**

```tsx
<ErrorBanner
  title="API access token required"
  description={
    <>
      Paste your agent token in the browser console, then reload the page:{' '}
      <InlineCode>localStorage.setItem('MC_AGENT_TOKEN', '&lt;token&gt;')</InlineCode>
    </>
  }
/>
```

Three actions are compressed into a single sentence: open the console, paste a command, reload. An operator in a stressed state (the page is broken, nothing is loading) reads this as one continuous instruction and may miss a step. Additionally, `<token>` was not explained — it is not obvious that it refers to the `session_key` from the agent registration response.

### Decision

**After:**

```tsx
<ol className="mt-1.5 space-y-1 text-sm list-decimal list-inside">
  <li>
    Open your browser's developer console{' '}
    <span className="text-xs opacity-75">(⌥⌘I on Mac, F12 on Windows)</span>
  </li>
  <li>
    Paste and run: <InlineCode>localStorage.setItem('MC_AGENT_TOKEN', '&lt;your-token&gt;')</InlineCode>
  </li>
  <li>Reload the page</li>
</ol>
<p className="mt-2 text-xs opacity-75">
  Your token is the <InlineCode>session_key</InlineCode> from the agent registration response.
</p>
```

Three changes:

1. **Numbered list:** Steps 1–3 are visually separated. An operator can check off each step mentally as they complete it.
2. **OS keyboard hints:** `(⌥⌘I on Mac, F12 on Windows)` next to step 1 removes the sub-task of remembering how to open DevTools. Rendered at `text-xs opacity-75` so it reads as supplementary, not equal to the main instruction.
3. **Token clarification:** A follow-up paragraph explains that `<your-token>` refers to the `session_key` from the registration API response. This closes the loop for operators who registered an agent programmatically and may have forgotten which field to use.

**Why `ErrorBanner` replaced directly rather than extending it?**  
The `ErrorBanner` component wraps `Alert` from the UI library and accepts only a `title` and `description` string or ReactNode. The new layout (numbered list + follow-up paragraph) fits naturally inside `AlertDescription` as a direct `Alert` render, which is simpler and more explicit than adding new props to `ErrorBanner`.

**Why not inline the console command as a copy button?**  
A copy-to-clipboard button requires a clipboard API call and error handling for browsers that deny clipboard access. For a two-line command that the operator needs to understand (not just run), reading it is more instructive than copying it blindly. A copy button treats the command as opaque; the current approach treats it as comprehensible.

---

## Stagger Index Adjustment

**File:** `src/pages/Dashboard.tsx`

The addition of `WelcomeBanner` above the three Dashboard sections required updating the stagger indices to maintain correct cascade ordering:

| Section          | Before   | After   |
| ---------------- | -------- | ------- |
| `WelcomeBanner`  | _(none)_ | index 0 |
| Agents section   | index 0  | index 1 |
| Tasks section    | index 1  | index 2 |
| Activity section | index 2  | index 3 |

The total stagger duration is now 3 × 80ms = 240ms across the visible sections (the banner at index 0 appears first; the Activity feed at index 3 appears last at 240ms delay + 500ms animation = 740ms total). This is within the acceptable entrance animation budget.

After the `WelcomeBanner` is dismissed, indices 1–3 remain. The banner renders `null` — it is not in the DOM — so the stagger indices of the remaining sections are unchanged. There is no visual jump or re-ordering after dismissal.

---

## Anti-Patterns Explicitly Avoided

| Pattern                                    | Why avoided                                                                                                                                                                                                                                                                           |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mandatory onboarding modal                 | Blocks access to the product. Violates `DESIGN_CONTEXT.md` principle "No modal interruptions unless explicitly invoked."                                                                                                                                                              |
| Multi-step guided tour with spotlights     | Disproportionate to a two-tab, three-section product. More friction than value for a technical operator.                                                                                                                                                                              |
| Onboarding that re-appears after dismissal | Dismissed state is persisted in `localStorage` via `useOnboarding`. Operators who dismiss never see it again (same session or across reloads).                                                                                                                                        |
| Showing onboarding on every empty state    | Only the Agents and Tasks empty states have explanatory content — because those sections are the primary action surfaces. The ActivityFeed empty state keeps its existing dry-wit copy, which is appropriate: the operator knows what the feed is for once they have read the banner. |
| Auto-playing tour on first login           | No login exists in Mission Control. First-visit state is detected by `localStorage` absence — a lightweight, dependency-free mechanism.                                                                                                                                               |
| Patronising explanations                   | Descriptions are one sentence each. They name the mechanism, not the concept. "Agents register via `POST /agents`" not "Agents are AI workers. To add an agent, you will need to call the agents endpoint. Here is how to do that step by step."                                      |
| Toast notifications for banner dismissal   | Dismissing a banner is not a significant enough event to warrant a toast. The banner disappearing is the confirmation.                                                                                                                                                                |

---

## Files Changed Summary

| File                                    | Change                                                                                                                                         |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/hooks/useOnboarding.ts`            | **New.** localStorage-backed hook for persistent hint dismissal state.                                                                         |
| `src/components/ui/EmptyState.tsx`      | **Extended.** Added optional `description` and `action` props. Backward-compatible.                                                            |
| `src/components/WelcomeBanner.tsx`      | **New.** First-visit orientation banner: three core concepts, two dismiss paths, `localStorage`-gated.                                         |
| `src/components/ApiAuthBanner.tsx`      | **Rewritten.** Numbered step list, OS keyboard hints, token field clarification.                                                               |
| `src/components/agents/AgentsTable.tsx` | **Updated.** Rich empty state with `POST /agents` guidance and `InlineCode` endpoint reference.                                                |
| `src/components/tasks/TasksTable.tsx`   | **Updated.** Two rich empty states (no tasks / no results), `ClipboardList` icon import, `<kbd>N</kbd>` shortcut chip next to New Task button. |
| `src/pages/Dashboard.tsx`               | **Updated.** `WelcomeBanner` added above sections; stagger indices incremented by 1 for Agents, Tasks, Activity.                               |

---

## Deferred Items

| Item                                    | Rationale for deferral                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Telemetry tab onboarding                | The Telemetry page has its own auth banner (covers the 401/503 failure path) and shows skeleton loading. A welcome state for Telemetry would be for explaining what metrics mean — deferred until the metric definitions are stable and the tab has more users.                                                                            |
| Agent detail sheet onboarding           | New agents have no assignments or notifications, which shows "No assignments yet" / "No notifications yet" plain empty states. These could be enriched (e.g., explaining that agents receive assignments automatically via the Assigner worker). Deferred — this is a secondary surface visited after connection, not a first-run surface. |
| Task state machine diagram              | The task state machine description in the Tasks empty state is prose. A visual diagram would be more scannable. Deferred — requires SVG/diagram infrastructure not currently in the project.                                                                                                                                               |
| Contextual tooltips on column headers   | The Agents table columns (Status, Last Seen, Capabilities) could have `?` icon tooltips explaining each field. Deferred — not needed until operators report confusion about specific columns.                                                                                                                                              |
| Command palette with shortcut discovery | `DESIGN_CONTEXT.md` specifies "keyboard shortcuts visible in command palette." A full command palette (`⌘K`) would be the canonical discoverability surface for all shortcuts. The `<kbd>` chip on the New Task button is an interim measure.                                                                                              |
| `reset()` exposed in dev panel          | `useOnboarding` exports `reset()` but it is unused in production. A development-only panel (`?debug=onboarding` or `localStorage.removeItem('mc_ob_welcome-banner-v1')`) would make testing easier without console access.                                                                                                                 |

---

**Last Updated:** 2026-03-06  
**Next Review:** After command palette implementation (see `DESIGN_CONTEXT.md` — keyboard-first interactions)
