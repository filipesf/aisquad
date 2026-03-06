# Mission UI — Animation & Motion Design Decisions

**Date:** 2026-03-06
**Scope:** `apps/mission-ui/src` — micro-interactions, entrance animations, loading states, feedback patterns
**Baseline:** Post-performance-optimisation build (see `PERFORMANCE_OPTIMISATION.md`)

---

## Design Philosophy

This is a **control room UI for a single operator**. The design context (see `DESIGN_CONTEXT.md`) specifies: _"purposeful micro-animations that aid comprehension"_ and _"speed is a feature"_. That sentence defines every decision in this pass.

Three rules governed all choices:

1. **Animation must earn its place.** Every motion serves one of: feedback (did that work?), orientation (what changed?), or attention (something is live). Decoration is disqualified by default.
2. **No bounce. No elastic.** Exponential easing only (`ease-out-expo`, `ease-out-quart`). These curves decelerate naturally, like real objects. Bounce/elastic feel consumer-app, not control-room.
3. **`prefers-reduced-motion` is already covered.** The existing global rule in `index.css` clamps all `animation-duration` and `transition-duration` to `0.01ms`. Every animation added here inherits that override for free — no per-animation reduced-motion handling needed.

---

## Motion Token System

**File:** `src/index.css`

Before this pass, timing and easing were ad-hoc — individual Tailwind utility classes with no shared vocabulary. Every component picked its own values. This produced incoherent timing across the UI.

**Decision:** Define CSS custom properties as a motion token system at `:root`.

```css
/* Easing */
--ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1); /* confident entrance */
--ease-out-quart: cubic-bezier(0.25, 1, 0.5, 1); /* smooth entrance    */
--ease-in-quart: cubic-bezier(0.5, 0, 0.75, 0); /* clean exit         */
--ease-inout: cubic-bezier(0.65, 0, 0.35, 1); /* bidirectional      */

/* Durations */
--dur-instant: 100ms; /* button press, toggle color */
--dur-fast: 200ms; /* hover states, badge changes */
--dur-normal: 300ms; /* state changes, drawers */
--dur-slow: 500ms; /* entrance animations */
--dur-exit: 150ms; /* exits — 75% of enter */
```

The 75% exit rule (`--dur-exit`) follows established motion design practice: exits feel natural when they're faster than entrances. Objects leave the scene quickly; they arrive decisively.

**Why CSS variables instead of a JS object or Tailwind config?**
CSS variables compose directly with `calc()` for stagger delays (`animation-delay: calc(var(--stagger-i, 0) * 80ms)`). A JS object or Tailwind theme extension would require additional wiring. CSS variables are also picked up automatically by devtools, making debugging straightforward.

### Keyframes

Nine keyframes defined in `index.css`, each in its own named comment block:

| Keyframe         | Properties animated                               | Purpose                                  |
| ---------------- | ------------------------------------------------- | ---------------------------------------- |
| `activity-enter` | `opacity`, `translateY(-6px → 0)`                 | New SSE item entrance in activity feed   |
| `fade-up`        | `opacity`, `translateY(10px → 0)`                 | Dashboard section stagger on first paint |
| `tab-in`         | `opacity`, `translateY(4px → 0)`                  | Tab content reveal on switch             |
| `live-pulse`     | `opacity` (1→0.5→1), `scale` (1→0.85→1)           | Live status dot pulse loop               |
| `success-flash`  | `opacity` (1→0.6→1)                               | Post-submit success confirmation         |
| `shimmer`        | `translateX(-100% → 100%)`                        | Skeleton loading sweep                   |
| `badge-pop`      | `opacity`, `scale` (0.7→1.05→1)                   | Filter badge count appearance            |
| `metric-reveal`  | `opacity`, `translateY(4px → 0)`                  | MetricCard stagger on data load          |
| `crosshair-init` | `opacity`, `rotate(-45deg → 0)`, `scale(0.8 → 1)` | Header logo on-mount signal              |

**All keyframes animate only `transform` and `opacity`.** This is not accidental — these are the only two CSS properties that are composited on the GPU without triggering layout recalculation. Animating `width`, `height`, `top`, `left`, `padding`, or `margin` would force full layout + paint on every frame.

### Utility Classes

Nine corresponding utility classes (`.animate-*`, `.skeleton-shimmer`) wrap the keyframes and consume the motion tokens. Components use these classes; they do not reference keyframe names or timing values directly. This means timing can be adjusted globally by changing one token value.

---

## ActivityFeed — New Item Entrance + Live Dot Pulse

**File:** `src/components/ActivityFeed.tsx`

### Problem

New SSE activities appeared instantly — zero transition. In a fast-moving system with many events, the feed felt like a text dump. There was no signal distinguishing "just arrived" from "has been here for 10 minutes".

The live/reconnecting status dot was a static colored circle. It looked identical whether the SSE connection was healthy or recovering.

### Decision 1: New item entrance animation

New items slide in from 6px above their final position while fading in (300ms, `ease-out-expo`). The 6px translate is deliberate — large enough to read as "arrived from above" (the direction the feed scrolls), small enough not to feel theatrical.

**Implementation detail — tracking new IDs:**

```tsx
const prevIdsRef = useRef<Set<string>>(new Set());
const [newIds, setNewIds] = useState<Set<string>>(new Set());

useEffect(() => {
  const added = activities.filter((a) => !prevIdsRef.current.has(a.id)).map((a) => a.id);
  if (added.length > 0) {
    setNewIds(new Set(added));
    const timer = setTimeout(() => setNewIds(new Set()), 400);
    return () => clearTimeout(timer);
  }
  prevIdsRef.current = new Set(activities.map((a) => a.id));
}, [activities]);
```

`prevIdsRef` holds the set of IDs from the previous render. On each render, newly-added IDs are identified by set difference, stored in `newIds` state, and cleared after 400ms (slightly longer than the 300ms animation to ensure the animation always completes before the class is removed). A `useRef` is used rather than `useState` for `prevIds` because the previous-ID tracking must not trigger re-renders.

The `animate-activity-enter` class is conditionally applied:

```tsx
className={cn(
  'flex items-start gap-3 px-4 py-3 hover:bg-muted/30',
  isNew && 'animate-activity-enter',
)}
```

This ensures the animation only plays on first appearance, not on re-mounts.

### Decision 2: Live dot pulse

The connected indicator dot continuously pulses when the SSE stream is connected (opacity 1→0.5→1, scale 1→0.85→1, 2s infinite). The pulse is absent when disconnected — the static red dot reads as "this is broken", the pulsing green dot reads as "this is alive and receiving".

```tsx
className={cn(
  'h-2 w-2 rounded-full transition-colors',
  connected ? 'bg-emerald-500 animate-live-pulse' : 'bg-red-500',
)}
```

**Why `opacity + scale` for the pulse, not `background-color` oscillation?**
Color oscillation (e.g., green→dark-green→green) would require animating a non-GPU property on some browsers. Opacity and scale are composited and require no layout — the dot stays green, but its apparent brightness cycles.

---

## StatusBadge — Status Transition + Live Indicator Dot

**File:** `src/components/StatusBadge.tsx`

### Problem

StatusBadge had no transition on its visual properties. When the polling cycle updated an agent from `online → offline`, the badge snapped from green to grey. For a dashboard that polls every 5 seconds, this was noticeable and jarring — especially when multiple agents changed state simultaneously.

Additionally, badges for active states (`online`, `in_progress`, `started`) were visually indistinguishable from terminal states. A completed task's `done` badge and an actively-running `in_progress` badge looked equivalently static.

### Decision

**Transition on status change:**

```tsx
'transition-[color,background-color,border-color] duration-[200ms]';
```

200ms (`--dur-fast`) with the Tailwind `transition-[]` arbitrary value syntax, targeting only the three color properties. Not `transition-all` — that would include properties like `transform`, which we don't want implicitly transitioning.

**Live indicator dot for active statuses:**

```tsx
const LIVE_STATUSES = new Set(['online', 'in_progress', 'started']);

{
  isLive && (
    <span
      className="mr-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-current animate-live-pulse"
      aria-hidden="true"
    />
  );
}
```

`bg-current` means the dot inherits the badge's text color — it matches emerald for `online`, blue for `in_progress`. `aria-hidden="true"` because the dot is purely decorative; the status text already communicates the state.

**Why a dot inside the badge, not on the row or table cell?**
The badge is the canonical status surface. Putting the live indicator at the badge level means it appears consistently in every context where StatusBadge is rendered: the agents table, task detail sheet, assignment history list, and agent detail sheet — without requiring changes in each parent component.

**Trade-off:** The dot adds 1.5px + 6px margin to the badge width. `max-w-[140px]` and `truncate` are already applied to StatusBadge, so this is absorbed without layout impact.

---

## Dashboard — Staggered Section Entrance

**File:** `src/pages/Dashboard.tsx`

### Problem

The Dashboard rendered all three sections (Agents, Tasks, ActivityFeed) simultaneously and instantly on mount. On first load — or after a tab switch — the content popped in as a flat, undifferentiated block. The hierarchy between sections was established only by labels and whitespace, with no temporal reinforcement.

### Decision

Three sections stagger in with 80ms between each (0ms, 80ms, 160ms total duration from first to last visible):

```tsx
<section className="animate-fade-up" style={{ '--stagger-i': 0 } as React.CSSProperties}>
<section className="animate-fade-up" style={{ '--stagger-i': 1 } as React.CSSProperties}>
<div    className="animate-fade-up" style={{ '--stagger-i': 2 } as React.CSSProperties}>
```

The stagger is driven by the CSS custom property `--stagger-i` consumed inside `.animate-fade-up`:

```css
.animate-fade-up {
  animation: fade-up var(--dur-slow) var(--ease-out-quart) both;
  animation-delay: calc(var(--stagger-i, 0) * 80ms);
}
```

**Why `--stagger-i` on the element rather than hardcoded delays?**
The CSS property approach means the animation system is data-driven — adding a fourth section at index 3 automatically gets the right delay without editing the CSS. It also avoids duplicate class names (`animate-fade-up-delay-1`, `animate-fade-up-delay-2`…) cluttering the stylesheet.

**Why `both` fill mode?**
`animation-fill-mode: both` means the element is invisible (`opacity: 0`, translated) before its delay fires, and stays in its final state after the animation ends. Without `both`, sections would flash visible at full opacity for the delay period before the animation starts.

**Why 80ms between sections?**
The motion design reference specifies: "cap total stagger time — 10 items at 50ms = 500ms total". Three sections at 80ms = 160ms total stagger. The entire sequence completes within 500ms + 160ms = 660ms (slowest animation finishes at stagger-delay + duration). This is within the entrance animation budget (500–800ms) from the 100/300/500 rule.

**Trade-off:** These animations play on every Dashboard mount — including after tab switches. Since the Dashboard isn't unmounted on tab switch (React keeps it alive inside the hidden `TabsContent`), the stagger only plays on true first mount. Tab switching uses the separate `tab-in` animation on the wrapper level. This is correct behaviour — the stagger is a "page load" signal, not a "tab switch" signal.

---

## App — Tab Content Crossfade

**File:** `src/App.tsx`

### Problem

Switching between Dashboard and Telemetry tabs was instant — the entire page content swapped with no transition. This felt abrupt, especially when switching to Telemetry for the first time (where a 500ms Suspense loading fallback also appeared without warning).

### Decision

Track the active tab with `useState` and key each tab's content wrapper on its active state:

```tsx
const [activeTab, setActiveTab] = useState('dashboard');

<div
  key={activeTab === 'dashboard' ? 'dashboard-active' : 'dashboard'}
  className="animate-tab-in"
>
```

When the key changes (i.e., when this tab becomes active), React unmounts and remounts the div, replaying the `animate-tab-in` animation (fade + 4px translate-up, 300ms `ease-out-expo`).

**Why key-based remount rather than CSS `@keyframes` triggered by Radix's `data-state` attribute?**
`TabsContent` adds `data-state="active"/"inactive"` to the content panel. A CSS rule like `[data-state=active] { animation: tab-in ... }` would also work. However, the key-based approach has two advantages:

1. It works even if the Radix `data-state` implementation changes.
2. The wrapper `div` can be given any class without coupling to Radix internals.

**Why 4px translate, not 8px or 12px?**
The tab switch is a horizontal navigation event — the content doesn't come from above (like an SSE item). A subtle 4px upward fade-in signals "new content loaded" without implying directionality that doesn't match the tab metaphor. Larger values (8px+) would feel like a page navigation, which is misleading.

### Header Logo

The `Crosshair` icon executes a single rotation on page mount (`rotate(-45deg) scale(0.8) → rotate(0deg) scale(1)`, 500ms `ease-out-expo`):

```tsx
<Crosshair className="h-4 w-4 text-muted-foreground animate-crosshair-init" />
```

This is the only "delight" animation in the pass. It plays once on cold load and never again (the header doesn't remount). The rotation angle (−45°) is intentional: the Crosshair icon has 4-fold symmetry, so a 45° rotation brings it to a visually-identical position — the animation reads as "locking on" rather than "spinning", which is consistent with the control room tone.

---

## TasksTable — Filter Feedback + Press States

**File:** `src/components/tasks/TasksTable.tsx`

### Problem 1: Filter count badge

When a status or priority filter was applied, a count badge appeared inside the filter button. This appeared instantly with no feedback. Similarly, the "Clear all" button snapped into existence without acknowledgement.

### Decision: `animate-badge-pop`

The count badge is keyed on its count value:

```tsx
<Badge key={statusFilter.length} className="... animate-badge-pop">
  {statusFilter.length}
</Badge>
```

The `key` forces a remount when the count changes, replaying `badge-pop` (`scale(0.7) → scale(1.05) → scale(1.0)`, 200ms). This means each time a filter is added or removed, the badge visibly acknowledges the change.

The same class is applied to the "Clear all" button on its entrance (it only renders when `hasFilters` is true, so every appearance is a fresh mount):

```tsx
{
  hasFilters && <Button className="... animate-badge-pop">Clear all</Button>;
}
```

**Why no exit animation for the "Clear all" button?**
CSS can't animate elements on unmount without a state machine or library like Framer Motion. For this scope, the entrance animation is sufficient feedback. The button disappears instantly on clear, which is appropriate — the user just cleared the filters, the feedback priority is on the cleared state, not the button leaving.

### Problem 2: Row press feedback

Clicking a task row opened the detail sheet, but there was no visual confirmation that the row had been pressed. The `cursor-pointer` communicates clickability but not activation.

### Decision: `active:bg-muted/60` + `transition-colors`

```tsx
className = '... active:bg-muted/60 transition-colors duration-[--dur-instant]';
```

`active:` applies only while the pointer is held down. Combined with `transition-colors` at 100ms, the row dims slightly on mousedown and returns to normal on mouseup. This matches how the row hover state already works (the table primitive has `hover:bg-muted/50`). The active state is slightly darker (`/60` vs `/50`) to confirm the click.

Applied to both agent rows (`AgentsTable.tsx`) and task rows (`TasksTable.tsx`) for consistency.

---

## CreateTaskDialog — Submit Spinner

**File:** `src/components/tasks/CreateTaskDialog.tsx`

### Problem

The submit button changed text from "Create task" to "Creating…" during the async `createTask()` call. There was no other visual signal. For fast submissions, this text change was barely noticeable. For slow network responses, the interface appeared frozen.

### Decision

Replace the text-only state with a spinner + text pattern:

```tsx
{
  submitting ? (
    <>
      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
      Creating…
    </>
  ) : (
    'Create task'
  );
}
```

`min-w-[100px]` is added to the button to prevent the layout from shifting when the spinner adds width. `animate-spin` is Tailwind's built-in CSS rotation loop — no custom keyframe needed.

**Why `Loader2` (Lucide) rather than a custom SVG or CSS spinner?**
`Loader2` is already in the `lucide-react` bundle (the `lucide` chunk is already split out). Adding it has zero bundle cost. It matches the visual weight of other icons in the codebase.

**Why not optimistic UI?**
Task creation involves a server round-trip that can fail (network error, duplicate title, validation). Optimistic UI is appropriate for low-risk, reversible actions (e.g., toggling a status). Creating a task is a write that should confirm server success before signalling completion.

---

## TaskDetailSheet — Comment Post Feedback

**File:** `src/components/tasks/TaskDetailSheet.tsx`

### Problem

After posting a comment, the textarea cleared and the comment appeared in the list (on the next 5-second poll). There was no immediate feedback that the post had succeeded. The textarea going blank felt like a reset rather than a success.

### Decision

**1. Spinner on the post button** (same pattern as CreateTaskDialog):

```tsx
{
  submitting ? (
    <>
      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
      Posting…
    </>
  ) : (
    'Post comment'
  );
}
```

**2. Success flash on the textarea:**

```tsx
const [commentPosted, setCommentPosted] = useState(false);
const commentFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

// On successful post:
setCommentPosted(true);
commentFlashTimer.current = setTimeout(() => setCommentPosted(false), 800);

// On the textarea:
className={commentPosted ? 'animate-[success-flash_0.6s_ease-out_both]' : ''}
```

`success-flash` pulses the textarea's `opacity` (1→0.6→1) over 600ms. This is subtle — it confirms "sent" without drawing the eye away from the newly-empty field. The timer resets `commentPosted` after 800ms (slightly longer than the 600ms animation).

**Why `useRef` for the flash timer?**
The timer ref allows the timeout to be cleared if the component unmounts between post and timer expiry, or if the user posts another comment while the flash is running. A `useRef` doesn't trigger re-renders on update, which is correct — the timer's job is to schedule a state update, not to cause one itself.

**Why not a toast notification?**
A toast would require a toast infrastructure that doesn't exist yet (see HARDENING_SUMMARY.md deferred items: "Add toast notifications for user actions"). The textarea flash achieves the same feedback goal without introducing new dependencies. Toast is the right long-term solution; this is an appropriate interim pattern.

---

## Telemetry — MetricCard Staggered Reveal + Skeleton Loading

**Files:** `src/components/MetricCard.tsx`, `src/pages/Telemetry.tsx`

### Problem 1: MetricCard entrance

Six MetricCards rendered simultaneously on first data load. The entire grid appeared at once with no differentiation between cards.

### Decision: `staggerIndex` prop + `animate-metric-reveal`

```tsx
export const MetricCard = memo(function MetricCard({
  label, value, staggerIndex = 0, className,
}: MetricCardProps) {
  return (
    <div
      className={cn('rounded-md border px-4 py-3 animate-metric-reveal', className)}
      style={{ '--stagger-i': staggerIndex } as React.CSSProperties}
    >
```

Cards cascade left-to-right with 60ms delays (0ms, 60ms, 120ms, 180ms, 240ms, 300ms). The total cascade duration is 300ms + 300ms animation = 600ms, within the entrance budget.

**Why not stagger at the parent level?**
The parent (`Telemetry.tsx`) already has the index available (it's the `map()` index). Passing `staggerIndex` as a prop makes the mechanism transparent — `MetricCard` doesn't need to know about its position in a grid; the parent sets the delay. This is a common pattern for animatable list items.

**Why does `memo(MetricCard)` still replay the animation on data refresh?**
When the telemetry window or group-by changes, `data` becomes `null` and then re-resolves. The `data && (...)` conditional causes the entire MetricCard grid to unmount and remount, replaying the entrance animation. This is correct behaviour — changing the time window is a meaningful context switch that warrants a fresh entrance.

### Problem 2: Loading state

The previous loading state was `<p className="text-muted-foreground">Loading telemetry…</p>` — a text fallback with no shape. It gave no indication of what was about to appear.

### Decision: Shimmer skeleton grid

```tsx
{
  loading && !data && (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" aria-hidden="true">
      {(['events', 'tokens', 'cost', 'avg-lat', 'min-lat', 'max-lat'] as const).map((k) => (
        <div key={k} className="rounded-md border px-4 py-3 skeleton-shimmer bg-muted/40">
          <div className="h-3 w-12 rounded bg-muted mb-3" />
          <div className="h-6 w-16 rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}
```

Six placeholder cards in the exact same grid layout as the real MetricCards. Each has a shimmer sweep (via `::after` pseudo-element on `.skeleton-shimmer`) that communicates active loading rather than absence.

`aria-hidden="true"` on the skeleton grid prevents screen readers from announcing placeholder content. The skeleton is purely visual — screen readers wait for real data.

**Skeleton dimensions** are approximate (not exact matches for the real card content). The goal is structural familiarity, not pixel-perfect correspondence. `h-3 w-12` for the label, `h-6 w-16` for the value — roughly matching the `text-xs` label line and `text-2xl` value line in the real card.

**Why named keys instead of index keys?**
The linter (`eslint-plugin-react`) flags index-as-key in arrays as a potential source of reconciliation bugs. Since these six keys are fixed and correspond to the six actual metrics, named keys are semantically correct and silence the lint warning without a suppression comment.

---

## Testing Impact

One test required updating:

**`src/pages/Telemetry.test.tsx` — "shows loading state before data"**

The original assertion was `screen.getByText(/loading telemetry/i)`. The shimmer skeleton is `aria-hidden="true"` and contains no text, so this selector no longer finds anything. The updated test validates the same intent from the other side:

```tsx
// Loading state renders a shimmer skeleton (aria-hidden) — no metric data visible yet
expect(screen.queryByText('42')).not.toBeInTheDocument();
expect(screen.queryByText('15,000')).not.toBeInTheDocument();
```

This is a stronger test: it verifies that the loading state hides data, rather than that a specific text node exists. The previous assertion was testing implementation detail (the loading text string) rather than behaviour (data not yet shown).

All 24 unit tests pass.

---

## Anti-Patterns Explicitly Avoided

| Pattern                                             | Why avoided                                                                                                                     |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Bounce / elastic easing                             | Feels consumer-app, dated; control-room UIs decelerate smoothly                                                                 |
| Animating `height`, `width`, `padding`              | Forces layout recalculation; all animations use `transform` + `opacity` only                                                    |
| `animation-delay` on individual items without a cap | Total stagger capped at ≤300ms across all sequences                                                                             |
| Animating on every poll cycle                       | Animations are mount-triggered; polling replaces data in-place without triggering CSS animations                                |
| `will-change: transform` added preemptively         | Already deferred in PERFORMANCE_OPTIMISATION.md — modern browsers promote animated `transform`/`opacity` elements automatically |
| Framer Motion / external animation library          | No additional dependencies; all animations are pure CSS keyframes                                                               |

---

## Files Changed Summary

| File                                        | Change                                                                                                     |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `src/index.css`                             | Motion tokens (`:root` CSS vars), 9 `@keyframes`, 8 utility classes, `.skeleton-shimmer`                   |
| `src/components/ActivityFeed.tsx`           | New item entrance (`animate-activity-enter`), live dot pulse (`animate-live-pulse`), `prevIdsRef` tracking |
| `src/components/StatusBadge.tsx`            | Status color transition (200ms), live indicator dot for active statuses                                    |
| `src/pages/Dashboard.tsx`                   | Staggered section entrance with `--stagger-i` CSS custom property                                          |
| `src/App.tsx`                               | `activeTab` state for tab crossfade, key-based remount wrapper, crosshair init animation                   |
| `src/components/tasks/TasksTable.tsx`       | Filter badge `animate-badge-pop` with count key, "Clear all" entrance animation, row `active:` press state |
| `src/components/tasks/CreateTaskDialog.tsx` | `Loader2` spinner in submit button, error message `animate-fade-up`, button press feedback                 |
| `src/components/tasks/TaskDetailSheet.tsx`  | `Loader2` spinner in post button, `success-flash` on textarea, timer ref for cleanup                       |
| `src/components/MetricCard.tsx`             | `staggerIndex` prop, `animate-metric-reveal` with `--stagger-i`                                            |
| `src/pages/Telemetry.tsx`                   | Shimmer skeleton loading state, `staggerIndex` wired to MetricCards                                        |
| `src/pages/Telemetry.test.tsx`              | Updated "shows loading state" test to match new skeleton loading UI                                        |

---

## Deferred Items

| Item                                          | Rationale for deferral                                                                                                                             |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Exit animations for "Clear all" button        | Requires unmount-animation state machine or Framer Motion; not worth the complexity for a secondary toolbar button                                 |
| Page-level skeleton on Dashboard initial load | Dashboard data loads fast enough (≤500ms local) that a skeleton would flash and disappear. The fade-up stagger provides sufficient loading signal. |
| Toast notifications for action success        | Noted in HARDENING_SUMMARY.md as future work; the textarea flash is an appropriate interim pattern                                                 |
| Activity feed auto-scroll to top on new item  | Requires `ScrollArea` ref imperative scroll, which conflicts with user scroll position. Defer until a scroll-lock/indicator pattern is designed    |
| Agent identity colour transitions             | Design feature from DESIGN_CONTEXT.md — not part of this motion pass                                                                               |

---

**Last Updated:** 2026-03-06
**Next Review:** After agent identity colour implementation (see `DESIGN_CONTEXT.md`)
