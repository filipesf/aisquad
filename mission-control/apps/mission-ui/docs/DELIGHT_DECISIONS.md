# Mission UI — Delight & Polish Decisions

**Date:** 2026-03-06
**Scope:** `apps/mission-ui/src` — micro-interactions, personality copy, easter eggs, and satisfaction moments
**Baseline:** Post-animation pass (see `ANIMATION_DECISIONS.md`)

---

## Design Philosophy

This pass adds **moments of joy** to what was already a well-functioning control room UI. The governing constraint throughout: delight must be appropriate to the domain and audience.

The operator is a single technical user managing an AI agent fleet, casually reviewing task history. They are not a consumer app user expecting celebration animations — but they will notice (and appreciate) a UI that seems to have opinions about itself.

Three rules governed all choices:

1. **Dry wit, not whimsy.** The voice is that of a competent system that has a quiet sense of humour. Never silly. Never alarming. Just occasionally more interesting than strictly necessary.
2. **Delight is earned, not imposed.** Nothing plays automatically on every interaction. Moments are tied to real events (task created, state changed, agent went offline) and play once.
3. **Zero new dependencies.** All effects are pure CSS keyframes consuming the existing motion token system. `prefers-reduced-motion` coverage is automatic via the global rule in `index.css`.

---

## Motion Foundation: New Keyframes

**File:** `src/index.css`

Seven new `@keyframes` and corresponding `.animate-*` utility classes were added to the existing motion token system. All animate only `transform` and `opacity` — no layout properties.

| Keyframe                     | Properties                                                | Duration token | Purpose                              |
| ---------------------------- | --------------------------------------------------------- | -------------- | ------------------------------------ |
| `task-done`                  | `opacity`, `scale(0.85→1.04→1)`, `translateY(6px→−1px→0)` | `--dur-normal` | Submit button success state          |
| `state-change-pop`           | `translateX(0→−3px→2px→0)`, `scale(1→0.97→1.02→1)`        | `--dur-fast`   | Status badge on state switch         |
| `comment-land`               | `opacity`, `translateY(8px→0)`, `scale(0.98→1)`           | `--dur-normal` | New comment entrance                 |
| `agent-blink`                | `opacity` (1→0.3→0.8→1)                                   | 600ms fixed    | Offline agent badge attention signal |
| `row-nudge`                  | `translateY(0→−2px→0)`                                    | `--dur-fast`   | Row press confirmation (reserved)    |
| `spinner-in`                 | `opacity`, `scale(0.5→1)`, `rotate(−90°→0°)`              | `--dur-fast`   | Spinner reveal (reserved)            |
| _(existing)_ `success-flash` | `opacity` (1→0.6→1)                                       | 600ms          | Textarea post-submit pulse           |

**Why `scale` overshoot in `task-done`?**
A controlled overshoot (`scale(1.04)`) at 60% of the animation reads as "this went through." It's different from the bounce/elastic patterns explicitly banned in `ANIMATION_DECISIONS.md` because it's a single directional action (arrive → settle), not an oscillation. The overshoot value is 4% — enough to register, not enough to feel toy-like.

**Why `translateX` for `state-change-pop`?**
A state change is a lateral decision — moving from one position to another. A horizontal micro-nudge reinforces that metaphor. Vertical (fade-up) would imply "new arrival." Horizontal implies "shifted."

---

## CreateTaskDialog — "Task deployed."

**File:** `src/components/tasks/CreateTaskDialog.tsx`

### Problem

The dialog closed immediately after a successful task creation. The UX signal was: form clears → dialog disappears → nothing. The operator had to look at the tasks table to confirm anything happened. For a fast network response, this was invisible. For a slow response, the interface felt unresponsive.

### Decision

A 700ms **success moment** before close:

```tsx
// On successful createTask():
setSucceeded(true);
onCreated(); // trigger parent refresh immediately
closeTimer.current = setTimeout(() => {
  setTitle('');
  setDescription('');
  setPriority('5');
  setSucceeded(false);
  onOpenChange(false);
}, 700);
```

The submit button transitions through three states:

| State         | Button content                           |
| ------------- | ---------------------------------------- |
| Idle          | `Create task`                            |
| Submitting    | `⟳ Creating…` (existing spinner pattern) |
| **Succeeded** | `✓ Task deployed.` (animate-task-done)   |

**"Task deployed."** — not "Task created!", not "Success!". "Deployed" is the language of systems that dispatch things. It's precise without being jargon. The period at the end is intentional: it reads as a declarative statement, not an exclamation.

**Why 700ms?**
Long enough to read and register (two syllables at comfortable reading pace ≈ 500ms minimum). Short enough that it doesn't feel like a delay. The `onCreated()` callback fires immediately so the table refreshes underneath; the dialog closing is the cosmetic delay.

**Cleanup on manual dismiss:**
If the user clicks outside the dialog during the success state, `handleOpenChange` clears the pending timer and resets `succeeded` state. No orphaned state or stuck success button.

**New state variables:**

- `succeeded: boolean` — drives the button content swap
- `closeTimer: useRef<ReturnType<typeof setTimeout>>` — allows cleanup on unmount/manual dismiss

---

## TaskDetailSheet — Three Delight Moments

**File:** `src/components/tasks/TaskDetailSheet.tsx`

### Moment 1: Status Badge Micro-Pop on State Change

**Problem:** Changing a task's state via the Select updated the data on the next 5-second poll. The badge changed silently — no confirmation the action registered.

**Decision:** On `handleStateChange`, set `stateChangePop = true` and clear after 300ms. The StatusBadge wrapper is keyed on this state:

```tsx
<span
  key={stateChangePop ? 'pop' : 'idle'}
  className={stateChangePop ? 'animate-state-change-pop' : ''}
>
  <StatusBadge status={data.task.state} />
</span>
```

The `key` forces a remount when `stateChangePop` toggles true → the animation replays. This is the same key-remount pattern used in `ANIMATION_DECISIONS.md` for filter badge pop.

**Why key-based remount rather than adding/removing a class?**
A class toggle would only animate if the keyframe is triggered by a CSS `:is(.active)` rule or equivalent — which requires the element to be present and the class to change. A key-based remount is guaranteed to replay the keyframe regardless of prior state. It also avoids the need to track whether the animation has already completed.

**Timer cleanup:** `statePopTimer` ref allows clearing if state changes fire rapidly (user clicking through multiple states). Each change restarts the 300ms window.

---

### Moment 2: Comment Landing Animation

**Problem:** Comments posted by agents arrived via 5-second polling. They appeared as if they'd always been there — no signal distinguishing "just arrived from an agent" from "was here when you opened this sheet."

**Decision:** Track comment IDs across poll cycles using the same ref-plus-state pattern from `ActivityFeed` (documented in `ANIMATION_DECISIONS.md`):

```tsx
const trackNewComments = useCallback((comments: Comment[]) => {
  const currentIds = new Set(comments.map((c) => c.id));
  const added = comments
    .filter((c) => !prevCommentIdsRef.current.has(c.id) && prevCommentIdsRef.current.size > 0)
    .map((c) => c.id);
  if (added.length > 0) {
    setNewCommentIds(new Set(added));
    setTimeout(() => setNewCommentIds(new Set()), 500);
  }
  prevCommentIdsRef.current = currentIds;
}, []);
```

The `prevCommentIdsRef.current.size > 0` guard prevents the entire initial comment list from animating in when the sheet first opens — only comments that arrive during an open session get the entrance animation.

New comment `<li>` elements receive `animate-comment-land`:

```tsx
className={cn('text-sm', newCommentIds.has(c.id) && 'animate-comment-land')}
```

**Why `comment-land` (slide up from below) rather than `activity-enter` (slide from above)?**
Activity feed items arrive from the top of the feed (newest first, scrolling down). Comments accumulate at the bottom of the list (newest last). Direction signals where the item came from — comments land at the bottom of the stack, so they arrive from below.

---

### Moment 3: Dry-Wit Empty Comments State

**Problem:** "No comments yet" is correct but inert. It adds no information and no personality.

**Decision:** Replace with an inline message that acknowledges the context:

```
💬  Quiet so far. Agents are working silently.
```

A `MessageSquareDashed` icon (Lucide — an outlined speech bubble with a dashed border, implying absence) sits inline with the text. `aria-hidden="true"` since the text alone carries the meaning.

**Why this phrasing?**
"Quiet so far" — acknowledges that silence is the current state, not a permanent one. "Agents are working silently" — dry, slightly anthropomorphic. The agents aren't absent; they just haven't said anything yet. It respects operator intelligence without being cold.

**Import added:** `MessageSquareDashed` from `lucide-react`.
**Import added:** `cn` from `@/lib/utils` (previously not imported in this file).

---

## ActivityFeed — Rotating Empty States + Agent Event Blink

**File:** `src/components/ActivityFeed.tsx`

### Rotating Empty State Messages

**Problem:** "No activity yet. Events will appear here as agents work." is fine. But it's the same every time.

**Decision:** Five messages, selected by minute-of-hour:

```tsx
const EMPTY_STATE_LINES = [
  'No activity yet. Agents are thinking, presumably.',
  'All quiet. Either nothing is happening, or everything is fine.',
  'Events will appear here as agents work. Or as agents procrastinate.',
  'No activity yet. The agents are standing by.',
  'Waiting for something to happen. This could take a while.',
] as const;

const emptyMessage = useMemo(
  () => EMPTY_STATE_LINES[new Date().getMinutes() % EMPTY_STATE_LINES.length],
  [],
);
```

**Why minute-of-hour for rotation?**
Stable within a working session (doesn't change while you're watching the feed), but different across different sessions. The operator experiences one message per session, which feels intentional rather than random. A random selector would re-roll on every Dashboard mount, which feels inconsistent. A fixed index would never change.

**Why `useMemo` with empty deps `[]`?**
The message is set once on component mount. A new `ActivityFeed` instance (rare — it only unmounts if the Dashboard unmounts entirely) would recalculate. This is correct — if you open a new session, you might get a different message.

**Tone calibration:**
All five messages share the same dry observational register: something is or isn't happening, stated neutrally with mild editorial commentary. None of them express urgency or alarm. None of them use exclamation marks. The slight anthropomorphism ("agents are thinking, presumably") is warranted because agents are literal AI agents — attributing internal states to them is technically accurate.

---

### Agent Status Event Icon Blink

**Problem:** When an `agent.online` or `agent.offline` event arrives in the feed, it looks identical to every other event. Agent status changes are operationally significant — an agent coming online means capacity just increased; an agent going offline might mean something went wrong.

**Decision:** Agent status events that are "new" (just arrived this render cycle) receive `animate-agent-blink` on their icon:

```tsx
const isAgentStatusEvent =
  isNew && (activity.type === 'agent.online' || activity.type === 'agent.offline');

<Icon
  className={cn('mt-0.5 h-4 w-4 shrink-0', colour, isAgentStatusEvent && 'animate-agent-blink')}
/>;
```

**`agent-blink` keyframe:**
`opacity: 1 → 0.3 → 0.8 → 1` over 600ms. One pulse. Not a loop.

**Why one pulse, not a continuous animation like `live-pulse`?**
`live-pulse` communicates ongoing liveness — it's appropriate for the connection dot because it needs to constantly signal "I'm still alive." The agent event blink communicates a discrete moment — "this just changed." One pulse marks the transition; continuous pulsing would imply the event is still unresolved.

**Why only `agent.online` and `agent.offline`?**
These are the events that change fleet capacity. Other events (task created, comment posted) are work-in-progress signals that don't require special attention-drawing. An assignment expiring might seem urgent, but the assigner worker handles requeue automatically — no operator action needed. Agent status changes are the ones that might prompt the operator to investigate.

---

## AgentsTable — Staggered Row Entrance

**File:** `src/components/agents/AgentsTable.tsx`

### Problem

The agents table rendered all rows simultaneously on mount. With multiple agents, the list popped in as a block, making it harder to parse how many agents there were and what their states were.

### Decision

Each `AgentRow` receives a `staggerIndex` prop and applies `animate-fade-up` with the existing `--stagger-i` CSS variable mechanism:

```tsx
<TableRow
  className="... animate-fade-up"
  style={{ '--stagger-i': staggerIndex } as React.CSSProperties}
>
```

Passed from the parent:

```tsx
{
  agents.map((agent, i) => (
    <AgentRow
      key={agent.id}
      agent={agent}
      caps={caps}
      onSelect={setSelectedAgentId}
      staggerIndex={i}
    />
  ));
}
```

**Cascade timing:** 80ms between rows (inherited from the `.animate-fade-up` rule: `animation-delay: calc(var(--stagger-i, 0) * 80ms)`). For a typical 3–5 agent fleet: 0ms, 80ms, 160ms, 240ms, 320ms total. Entire table visible within 800ms.

**Why stagger rows and not just the table as a whole?**
The table itself already animates in via Dashboard's `animate-fade-up` stagger (stagger-i 0). Row-level stagger adds a second layer: the container arrives, then its contents resolve item by item. This creates a reading rhythm that implicitly counts the agents — the eye follows each row as it appears.

**`memo` compatibility:** `AgentRow` is already `memo`-wrapped. Adding `staggerIndex` to props is safe — it only changes if the agent list length changes, which is a legitimate re-render trigger anyway.

---

### Offline Agent Badge Blink

**Problem:** Offline agents appear in the table with their grey status badge. The badge is correct but passive — the operator has to actively scan for offline states.

**Decision:** The StatusBadge for offline agents is wrapped in a blinking span:

```tsx
<span className={agent.status === 'offline' ? 'animate-agent-blink inline-block' : undefined}>
  <StatusBadge status={agent.status} />
</span>
```

**Why `inline-block` on the wrapper?**
`animate-agent-blink` uses `opacity`. For the opacity to apply correctly to the badge (which has its own background color), the wrapper needs to create a compositing layer. `inline-block` ensures the element is block-formatted within the flow without breaking the table cell layout.

**Does the blink replay on every poll?**
No. `AgentRow` is `memo`-wrapped. The row only re-renders when `agent` data changes. If an agent is already offline and the poll returns the same offline status, the memo prevents re-render — no new blink. The blink only plays on the mount of the row or on a genuine status change to offline.

**Why not a continuous animation?**
The same reasoning as the activity feed icon: a one-shot blink marks the moment of transition. The grey badge persists as the ongoing indicator. Continuous blinking would be anxiety-inducing for an always-on ambient display.

---

## App Header — Uptime Easter Egg + Console Message

**File:** `src/App.tsx`

### Crosshair Uptime Tooltip

**Problem:** The crosshair icon animates on mount (documented in `ANIMATION_DECISIONS.md`) but is otherwise inert. Clicking it does nothing.

**Decision:** Wrap the crosshair in a `Tooltip` and a `<button>` trigger. The tooltip reveals a live session uptime counter:

```tsx
<Tooltip>
  <TooltipTrigger asChild>
    <button type="button" aria-label={`Mission Control — uptime ${formatUptime(uptimeSeconds)}`}>
      <Crosshair className="h-4 w-4 text-primary animate-crosshair-init" aria-hidden="true" />
    </button>
  </TooltipTrigger>
  <TooltipContent side="bottom" className="text-xs">
    <span className="text-muted-foreground">Uptime</span>{' '}
    <span className="font-mono">{formatUptime(uptimeSeconds)}</span>
  </TooltipContent>
</Tooltip>
```

**Uptime counter:**

```tsx
const [uptimeSeconds, setUptimeSeconds] = useState(0);
useEffect(() => {
  const startTime = Date.now();
  const ticker = setInterval(() => {
    setUptimeSeconds(Math.floor((Date.now() - startTime) / 1000));
  }, 1000);
  return () => clearInterval(ticker);
}, []);
```

**`formatUptime` helper:**

```
< 60s  →  "42s"
< 1h   →  "4m 23s"
≥ 1h   →  "2h 7m"
```

**Why uptime?**
An operator managing an always-on dashboard instinctively wants to know how long they've had eyes on the system. Uptime is the ambient control room metric — you glance at it to orient yourself. Putting it behind a tooltip on the logo is a discovery reward: most operators won't find it on day one, but the ones who do will use it.

**Accessibility:** The `<button>` has an `aria-label` that includes the uptime value, so screen reader users get the same information without the tooltip interaction.

**Performance:** One `setInterval` in `App.tsx`. Single re-render per second on the root component. The uptime string is only rendered in the tooltip content, which only mounts when the tooltip is open — so the 1-second re-render cascade does not propagate into the Dashboard or Telemetry pages.

---

### Console Easter Egg

**Decision:** On App mount, log a styled message to the browser console:

```tsx
console.log(
  '%c Mission Control %c online. Fleet standing by.',
  'background:#e83535;color:#fff;font-weight:bold;padding:2px 8px;border-radius:3px',
  'color:#888',
);
```

**Why:** Operators and developers who open devtools will see it immediately. It confirms the app mounted successfully and does so in the brand voice: declarative, operational, not celebratory. The brand red (`#e83535`) matches `--brand` from `COLOR_DECISIONS.md`.

**Precedent:** Linear, Vercel, and other developer-facing tools use styled console messages as a combination of branding and developer welcome. This is the right audience for it — Mission Control is built by and for technical operators.

---

## Test Impact

One test required updating:

**`src/components/ActivityFeed.test.tsx` — "shows empty state message when there are no activities"**

The original assertion checked for the exact previous string. The updated test uses a function matcher that accepts any of the five rotating messages:

```tsx
expect(
  screen.getByText(
    (text) =>
      text.includes('No activity yet') ||
      text.includes('All quiet') ||
      text.includes('agents work') ||
      text.includes('standing by') ||
      text.includes('Waiting for something'),
  ),
).toBeInTheDocument();
```

This tests the intent (an empty state message is shown) without coupling to a specific string. All 24 unit tests pass.

---

## Anti-Patterns Explicitly Avoided

| Pattern                                      | Why avoided                                                                                                                                                                   |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Confetti / particle burst on task creation   | Too celebratory for a control room. Task creation is routine work, not an achievement.                                                                                        |
| Toast notifications for success states       | Would require a new toast infrastructure (noted as deferred in `HARDENING_SUMMARY.md`). The in-button success state achieves the same feedback goal without new dependencies. |
| Playful loading messages ("Herding pixels…") | Wrong tone for this audience. Loading states name what is loading (per `COPY_DECISIONS.md` rules).                                                                            |
| Sound effects                                | No audio infrastructure; would require permission and respecting system audio preferences. Not worth it for a single operator dashboard.                                      |
| Animated illustrations in empty states       | The UI has no illustration system. A styled Lucide icon + dry-wit copy achieves the same personality without creating a design inconsistency.                                 |
| Continuous animations on agent badges        | Blink once on state change; hold steady thereafter. Always-on ambient displays should not have persistent motion that competes for attention.                                 |
| Re-animating on every poll cycle             | All animations are mount-triggered or key-triggered. Polling replaces data in-place without replaying entrance animations.                                                    |

---

## Files Changed

| File                                        | Change                                                                                                                                                                               |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/index.css`                             | 7 new `@keyframes`, 7 new `.animate-*` utility classes                                                                                                                               |
| `src/components/tasks/CreateTaskDialog.tsx` | `succeeded` state, `Check` icon import, "Task deployed." button, `handleOpenChange` cleanup, `closeTimer` ref                                                                        |
| `src/components/tasks/TaskDetailSheet.tsx`  | `trackNewComments`, `newCommentIds`, `stateChangePop`, `statePopTimer`, comment landing animation, state-change micro-pop, dry-wit empty state, `cn` + `MessageSquareDashed` imports |
| `src/components/ActivityFeed.tsx`           | `EMPTY_STATE_LINES` constant, `emptyMessage` useMemo, rotating empty state, `isAgentStatusEvent` detection, agent blink on icon, `useMemo` import                                    |
| `src/components/agents/AgentsTable.tsx`     | `staggerIndex` prop on `AgentRow`, staggered row entrance, offline badge blink wrapper                                                                                               |
| `src/App.tsx`                               | `uptimeSeconds` state + 1s ticker, `formatUptime` helper, crosshair Tooltip with uptime, console easter egg, `Tooltip`/`TooltipContent`/`TooltipTrigger` imports, `useEffect` import |
| `src/components/ActivityFeed.test.tsx`      | Updated empty state test to use function matcher for rotating messages                                                                                                               |

---

## Deferred Items

| Item                                 | Rationale for deferral                                                                                                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Agent identity colours               | Tracked in `DESIGN_CONTEXT.md` and `HARDENING_SUMMARY.md`. Requires hue generation on agent registration and threading through multiple surfaces. Separate feature work. |
| Activity-driven saturation intensity | Also tracked in `DESIGN_CONTEXT.md`. Requires tracking active task count and mapping to a CSS variable multiplier. Future pass.                                          |
| Toast notification infrastructure    | Noted in `HARDENING_SUMMARY.md`. Needed before any success/error toast moments can be added across the app.                                                              |
| Confetti on "done" task milestone    | Waiting for toast infrastructure; a task reaching `done` state should feel like a genuine milestone. Currently the state change just updates the badge.                  |
| Keyboard shortcut `N` for new task   | Would be a natural next step — `N` to open CreateTaskDialog from anywhere on the Dashboard. Requires global keydown handler with focus-trap awareness.                   |

---

**Last Updated:** 2026-03-06
**Related:** `ANIMATION_DECISIONS.md`, `COPY_DECISIONS.md`, `DESIGN_CONTEXT.md`, `HARDENING_SUMMARY.md`
