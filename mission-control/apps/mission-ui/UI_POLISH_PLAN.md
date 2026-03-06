# Mission Control UI — Polish Plan

> Generated: 2026-03-06
> Scope: Incremental polish across inconsistencies found in a full codebase audit. Not a redesign.

---

## PR 1 — Semantic & Token Fixes

> Pure component changes. No layout risk. All changes are isolated to their own file.

---

### Spec 1.1 — `StatusBadge`: semantic colour system

**File:** `src/components/StatusBadge.tsx`

**Problem:** 7 distinct statuses all render as `variant="default"` (same dark filled pill). Operators can't visually scan the difference between `done`, `in_progress`, and `online` at a glance.

**Approach:** Replace the 4-variant shadcn mapping with direct className injection using design-token-safe Tailwind classes. Keep the `Badge` component shell but override with colour classes.

**Full replacement:**

```tsx
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface StatusBadgeProps {
  status: string;
  className?: string;
}

// Semantic colour groups — each maps to a distinct visual tier
const STATUS_STYLES: Record<string, string> = {
  // ── Positive / active ─────────────────────────────────────────
  online:    'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  accepted:  'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  delivered: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',

  // ── In-flight / working ────────────────────────────────────────
  in_progress: 'border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400',
  started:     'border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400',
  assigned:    'border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400',

  // ── Pending / waiting ──────────────────────────────────────────
  review:  'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  offered: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  queued:  'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400',

  // ── Resolved / terminal ────────────────────────────────────────
  done:      'border-border bg-muted text-muted-foreground',
  completed: 'border-border bg-muted text-muted-foreground',
  cancelled: 'border-border bg-muted text-muted-foreground',

  // ── Degraded / offline ─────────────────────────────────────────
  offline:  'border-border bg-muted/50 text-muted-foreground',
  draining: 'border-border bg-muted/50 text-muted-foreground',

  // ── Error / blocked ────────────────────────────────────────────
  blocked: 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400',
  expired: 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400',
  failed:  'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400',
};

const FALLBACK = 'border-border text-foreground';

function formatStatus(status: string): string {
  return status.replace(/_/g, ' ');
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const style = STATUS_STYLES[status] ?? FALLBACK;

  return (
    <Badge
      variant="outline"
      className={cn('capitalize border font-medium', style, className)}
    >
      {formatStatus(status)}
    </Badge>
  );
}
```

**What changes:**
- Removes the `BadgeVariant` type and `STATUS_VARIANTS` map entirely
- All statuses now use `variant="outline"` as the base (neutral, no fill from shadcn)
- Colour is injected purely via `className` — stays within design token system for text/border, uses transparent fills for the colour groups
- `font-medium` replaces the implicit default weight

**Verification:** Visually check all 6 task states in the Tasks table, agent `online`/`offline` in the Fleet table, and assignment statuses in TaskDetailSheet.

---

### Spec 1.2 — `TimeAgo`: fix token violation

**File:** `src/components/TimeAgo.tsx`

**Problem:** The `null` branch hardcodes `text-gray-500`, which bypasses the design token system and may render incorrectly in dark mode.

**Add `cn` import:**

```tsx
import { cn } from '@/lib/utils';
```

**Change line 36:**

```tsx
// BEFORE
return <span className={`text-gray-500 ${className}`}>never</span>;

// AFTER
return <span className={cn('text-muted-foreground', className)}>never</span>;
```

**Full file after change:**

```tsx
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface TimeAgoProps {
  date: string | null;
  className?: string;
}

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffS = Math.floor(diffMs / 1000);

  if (diffS < 5) return 'just now';
  if (diffS < 60) return `${diffS}s ago`;

  const diffM = Math.floor(diffS / 60);
  if (diffM < 60) return `${diffM}m ago`;

  const diffH = Math.floor(diffM / 60);
  if (diffH < 24) return `${diffH}h ago`;

  const diffD = Math.floor(diffH / 24);
  return `${diffD}d ago`;
}

export function TimeAgo({ date, className = '' }: TimeAgoProps) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 10_000);
    return () => clearInterval(id);
  }, []);

  if (!date) {
    return <span className={cn('text-muted-foreground', className)}>never</span>;
  }

  return (
    <span className={className} title={new Date(date).toLocaleString()}>
      {formatTimeAgo(date)}
    </span>
  );
}
```

**Verification:** Check the "never" state for an agent with no `last_seen_at`, toggle dark/light mode.

---

### Spec 1.3 — `ActivityFeed`: replace emoji with Lucide icons

**File:** `src/components/ActivityFeed.tsx`

**Problem:** Raw emoji are inconsistent with the Lucide icon system used everywhere else. They render differently across OS/font stacks and have no theming control.

**Full replacement:**

```tsx
import { useRef } from 'react';
import type { Activity } from '@/types/domain';
import { TimeAgo } from './TimeAgo';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import {
  CircleDot,
  CircleOff,
  ClipboardList,
  RefreshCw,
  RotateCcw,
  Send,
  CheckCircle2,
  Flag,
  Clock,
  MessageSquare,
  Bell,
  Pin,
} from 'lucide-react';

interface ActivityFeedProps {
  activities: Activity[];
  connected: boolean;
  maxHeight?: string;
}

interface ActivityMeta {
  icon: React.ElementType;
  colour: string;
}

const ACTIVITY_META: Record<string, ActivityMeta> = {
  'agent.online':             { icon: CircleDot,      colour: 'text-emerald-500' },
  'agent.offline':            { icon: CircleOff,      colour: 'text-muted-foreground' },
  'task.created':             { icon: ClipboardList,  colour: 'text-blue-500' },
  'task.state_changed':       { icon: RefreshCw,      colour: 'text-amber-500' },
  'task.requeued':            { icon: RotateCcw,      colour: 'text-amber-500' },
  'assignment.offered':       { icon: Send,           colour: 'text-blue-500' },
  'assignment.accepted':      { icon: CheckCircle2,   colour: 'text-emerald-500' },
  'assignment.completed':     { icon: Flag,           colour: 'text-muted-foreground' },
  'assignment.expired':       { icon: Clock,          colour: 'text-red-500' },
  'comment.created':          { icon: MessageSquare,  colour: 'text-foreground' },
  'notification.dispatched':  { icon: Bell,           colour: 'text-foreground' },
};

const FALLBACK_META: ActivityMeta = { icon: Pin, colour: 'text-muted-foreground' };

function getActivityMeta(type: string): ActivityMeta {
  return ACTIVITY_META[type] ?? FALLBACK_META;
}

function getActivityDescription(activity: Activity): string {
  const p = activity.payload;

  switch (activity.type) {
    case 'agent.online':         return 'Agent came online';
    case 'agent.offline':        return 'Agent went offline';
    case 'task.created':         return `Task created: ${String(p['title'] ?? '')}`;
    case 'task.state_changed':   return `Task state: ${String(p['from'] ?? '?')} → ${String(p['to'] ?? '?')}`;
    case 'task.requeued':        return 'Task requeued';
    case 'assignment.offered':   return 'Assignment offered';
    case 'assignment.accepted':  return 'Assignment accepted';
    case 'assignment.completed': return 'Assignment completed';
    case 'assignment.expired':   return 'Assignment expired (lease timeout)';
    case 'comment.created':      return 'Comment posted';
    default:                     return activity.type;
  }
}

export function ActivityFeed({ activities, connected, maxHeight = '400px' }: ActivityFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm font-semibold">Activity Feed</CardTitle>
        <div className="flex items-center gap-2">
          <div
            className={cn(
              'h-2 w-2 rounded-full',
              connected ? 'bg-emerald-500' : 'bg-red-500',
            )}
            title={connected ? 'Connected' : 'Disconnected'}
          />
          <span className="text-xs text-muted-foreground">
            {connected ? 'Live' : 'Reconnecting...'}
          </span>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea style={{ height: maxHeight }} ref={scrollRef}>
          {activities.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <Bell className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No activities yet</p>
            </div>
          ) : (
            <ul className="divide-y">
              {activities.map((activity) => {
                const { icon: Icon, colour } = getActivityMeta(activity.type);
                return (
                  <li
                    key={activity.id}
                    className="flex items-start gap-3 px-4 py-3 hover:bg-muted/30"
                  >
                    <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', colour)} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">{getActivityDescription(activity)}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        <TimeAgo date={activity.created_at} />
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
```

**What changes:**
- `ACTIVITY_ICONS: Record<string, string>` → `ACTIVITY_META: Record<string, ActivityMeta>` with `icon` and `colour`
- Icon colours mirror the same semantic tiers as `StatusBadge`
- `<span>` with emoji → `<Icon>` with `h-4 w-4` (consistent with all other Lucide usage)
- Empty state gets icon treatment (also fixes spec 2.8 for this component)

---

### Spec 1.4 — `TaskDetailSheet`: priority number → label

**File:** `src/components/tasks/TaskDetailSheet.tsx`

**Problem:** The detail sheet renders `Priority 8` while the table renders `High` for the same field.

**Add import:**

```tsx
import { priorityLabel } from './columns';
```

**Change the priority badge (lines 123-125):**

```tsx
// BEFORE
<Badge variant="outline" className="text-xs">
  Priority {data.task.priority}
</Badge>

// AFTER
<Badge variant="outline" className="text-xs capitalize">
  {priorityLabel(data.task.priority)}
</Badge>
```

**Verification:** Open any task with priority 8 — detail sheet should show "High", not "Priority 8".

---

## PR 2 — Layout & Structure Polish

---

### Spec 2.1 — Extract shared `MetricCard` component + fix Card padding

**Problem:** `StatCard` in `Dashboard.tsx` and `MetricCard` in `Telemetry.tsx` are structurally identical but duplicated. Both inherit `py-6 gap-6` from the base `Card` component, which is too much vertical padding for a dense stat grid.

**New file:** `src/components/MetricCard.tsx`

```tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface MetricCardProps {
  label: string;
  value: string | number;
  className?: string;
}

export function MetricCard({ label, value, className }: MetricCardProps) {
  return (
    <Card className={cn('gap-2 py-4', className)}>
      <CardHeader className="px-4 pb-0">
        <CardTitle className="text-xs font-medium text-muted-foreground">
          {String(label).replace(/_/g, ' ')}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4">
        <div className="text-2xl font-bold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}
```

**Notes:**
- `gap-2 py-4` on `Card`: reduces from `gap-6 py-6` — appropriate for stat cards
- `px-4` on header/content: reduces from `px-6`
- `tabular-nums`: prevents layout jitter as numbers update during polling

**Update `Dashboard.tsx`** — remove `StatCard` function (lines 12-25), add import, update usage:

```tsx
import { MetricCard } from '@/components/MetricCard';

// BEFORE
{TASK_STATES.map((state) => (
  <StatCard key={state} label={state} count={stateCounts[state] ?? 0} />
))}

// AFTER
{TASK_STATES.map((state) => (
  <MetricCard
    key={state}
    label={state.replace(/_/g, ' ')}
    value={stateCounts[state] ?? 0}
  />
))}
```

**Update `Telemetry.tsx`** — remove `MetricCard` function (lines 63-76), add import:

```tsx
import { MetricCard } from '@/components/MetricCard';
// All six MetricCard call sites stay identical — just change the source
```

---

### Spec 2.2 — Normalise section headers

**Problem:** Section `<h2>` tags have inconsistent margins, inconsistent font size (`text-base` is too prominent for a dense ops dashboard), and no standard treatment.

**Rule:** Every section heading → `text-sm font-semibold tracking-tight`.

**Changes in `Dashboard.tsx`:**

```tsx
// BEFORE — Fleet
<h2 className="text-base font-semibold">Fleet</h2>
<span className="text-sm text-muted-foreground">{onlineCount}/{totalAgents} online</span>

// AFTER
<h2 className="text-sm font-semibold tracking-tight">Fleet</h2>
<span className="text-xs text-muted-foreground">{onlineCount}/{totalAgents} online</span>
```

```tsx
// BEFORE — Tasks Overview + Tasks
<h2 className="mb-4 text-base font-semibold">Tasks Overview</h2>
<h2 className="mb-4 text-base font-semibold">Tasks</h2>

// AFTER
<h2 className="mb-4 text-sm font-semibold tracking-tight">Tasks Overview</h2>
<h2 className="mb-4 text-sm font-semibold tracking-tight">Tasks</h2>
```

**Changes in `Telemetry.tsx`:**

```tsx
// BEFORE
<h2 className="text-base font-semibold">Telemetry</h2>

// AFTER
<h2 className="text-sm font-semibold tracking-tight">Telemetry</h2>
```

---

### Spec 2.3 — Fix Sheet content padding misalignment

**Problem:** `SheetHeader` has built-in `p-4`. The content `div` below it has no matching horizontal padding, so content aligns to the raw sheet edge, not to the header.

**File:** `src/components/tasks/TaskDetailSheet.tsx`

```tsx
// BEFORE — loading/error states
{loading && !data && (
  <p className="text-sm text-muted-foreground">Loading…</p>
)}
{error && (
  <p className="text-sm text-destructive">{error}</p>
)}

// AFTER
{loading && !data && (
  <p className="px-4 text-sm text-muted-foreground">Loading…</p>
)}
{error && (
  <p className="px-4 text-sm text-destructive">{error}</p>
)}
```

```tsx
// BEFORE — content wrapper
{data && (
  <div className="space-y-5">

// AFTER
{data && (
  <div className="space-y-5 px-4 pb-6">
```

**File:** `src/components/agents/AgentDetailSheet.tsx` — same pattern:

```tsx
// Loading/error states — add px-4:
{loading && !data && (
  <p className="px-4 text-sm text-muted-foreground">Loading…</p>
)}
{error && (
  <p className="px-4 text-sm text-destructive">{error}</p>
)}

// Content wrapper:
// BEFORE
{data && (
  <div className="space-y-6">

// AFTER
{data && (
  <div className="space-y-6 px-4 pb-6">
```

---

### Spec 2.4 — Consolidate auth/error banner into shared component

**Problem:** `ApiAuthBanner.tsx` and the inline `TelemetryAuthBanner` in `Telemetry.tsx` duplicate the same `<Alert>` structure. `ApiAuthBanner` also uses `bg-black/20` for its code block while `TelemetryAuthBanner` uses `bg-muted` — different tokens for the same element.

**New file:** `src/components/ErrorBanner.tsx`

```tsx
import { AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface ErrorBannerProps {
  title: string;
  description: React.ReactNode;
  variant?: 'default' | 'destructive';
}

export function ErrorBanner({ title, description, variant = 'destructive' }: ErrorBannerProps) {
  return (
    <Alert variant={variant}>
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{description}</AlertDescription>
    </Alert>
  );
}
```

**Replace `ApiAuthBanner.tsx`** entirely:

```tsx
import { ApiError } from '@/lib/api';
import { ErrorBanner } from '@/components/ErrorBanner';

export function ApiAuthBanner({ error }: { error: unknown }) {
  if (!(error instanceof ApiError) || error.status !== 401) return null;

  return (
    <ErrorBanner
      title="Mission Control API authorization required"
      description={
        <>
          Set an agent token in browser storage and reload:{' '}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
            localStorage.setItem('MC_AGENT_TOKEN', '&lt;token&gt;')
          </code>
        </>
      }
    />
  );
}
```

Note: `bg-black/20` → `bg-muted` (token-safe, now consistent with Telemetry banner).

**Replace `TelemetryAuthBanner` in `Telemetry.tsx`** — remove the inline function (lines 22-61), add import, replace with:

```tsx
import { ErrorBanner } from '@/components/ErrorBanner';

function TelemetryAuthBanner({ error }: { error: unknown }) {
  if (!(error instanceof ApiError)) return null;

  if (error.status === 401 || error.status === 403) {
    return (
      <ErrorBanner
        variant="default"
        title="Telemetry API authorization required"
        description={
          <>
            Set a telemetry token in browser storage and reload:{' '}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
              localStorage.setItem('MC_TELEMETRY_TOKEN', '&lt;token&gt;')
            </code>
          </>
        }
      />
    );
  }

  if (error.status === 503) {
    return (
      <ErrorBanner
        title="Telemetry service unavailable"
        description={
          <>
            The server telemetry token is not configured. Check{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono">
              CONTROL_API_TELEMETRY_TOKEN
            </code>{' '}
            on the server.
          </>
        }
      />
    );
  }

  return <ErrorBanner title="Telemetry error" description={error.message} />;
}
```

---

### Spec 2.5 — Remove redundant actions dropdown from Tasks columns

**Problem:** The `MoreHorizontal` dropdown in `columns.tsx` has exactly one item ("View details"), and the entire row is already clickable via `onClick` in `TasksTable.tsx`. The dropdown is pure redundancy.

**File:** `src/components/tasks/columns.tsx`

Remove the entire `actions` column definition:

```tsx
// REMOVE this entire column:
{
  id: 'actions',
  cell: ({ row }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
          <span className="sr-only">Open menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onView(row.original)}>
          View details
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
},
```

Remove unused imports:

```tsx
// BEFORE
import { ArrowUpDown, MoreHorizontal } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// AFTER
import { ArrowUpDown } from 'lucide-react';
// Remove the entire DropdownMenu import block
```

Remove the now-unused `ColumnOptions` interface and `onView` parameter:

```tsx
// REMOVE:
interface ColumnOptions {
  onView: (task: Task) => void;
}

// BEFORE
export function getTaskColumns({ onView }: ColumnOptions): ColumnDef<Task>[] {

// AFTER
export function getTaskColumns(): ColumnDef<Task>[] {
```

**File:** `src/components/tasks/TasksTable.tsx` — update `useMemo` call:

```tsx
// BEFORE
const columns = useMemo(
  () => getTaskColumns({ onView: setSelectedTask }),
  [],
);

// AFTER
const columns = useMemo(
  () => getTaskColumns(),
  [],
);
```

**File:** `src/components/agents/AgentsTable.tsx` — make rows clickable, remove explicit View button:

```tsx
// BEFORE — TableHead
<TableHead className="w-16" />

// REMOVE that TableHead entirely

// BEFORE — TableRow
<TableRow key={agent.id}>

// AFTER
<TableRow
  key={agent.id}
  className="cursor-pointer"
  onClick={() => setSelectedAgentId(agent.id)}
>

// REMOVE the entire last TableCell (the View button):
<TableCell>
  <Button variant="ghost" size="sm" onClick={() => setSelectedAgentId(agent.id)}>
    View
  </Button>
</TableCell>

// REMOVE unused import:
import { Button } from '@/components/ui/button';
```

---

### Spec 2.6 — Form field spacing normalisation

**File:** `src/components/tasks/CreateTaskDialog.tsx`

```tsx
// BEFORE (×3 occurrences)
<div className="space-y-1.5">

// AFTER (×3 occurrences — use replaceAll)
<div className="space-y-2">
```

---

### Spec 2.7 — Add brand icon to App header + favicon

**File:** `src/App.tsx`

```tsx
// Add Crosshair to lucide import
import { Crosshair } from 'lucide-react';

// BEFORE
<span className="text-base font-semibold tracking-tight">Mission Control</span>

// AFTER
<div className="flex items-center gap-2">
  <Crosshair className="h-4 w-4 text-muted-foreground" />
  <span className="text-sm font-semibold tracking-tight">Mission Control</span>
</div>
```

Note: `text-base` → `text-sm` (nav title should not outweigh content headings).

**File:** `index.html` — add favicon via inline SVG data URI:

```html
<!-- Add inside <head>: -->
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23ffffff' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><circle cx='12' cy='12' r='10'/><circle cx='12' cy='12' r='3'/><line x1='22' y1='12' x2='19' y2='12'/><line x1='5' y1='12' x2='2' y2='12'/><line x1='12' y1='2' x2='12' y2='5'/><line x1='12' y1='19' x2='12' y2='22'/></svg>" />
```

---

### Spec 2.8 — Consistent empty states

**Rule:** Empty states → centred container with muted icon above text, inside a bordered region where the table would appear.

**File:** `src/components/agents/AgentsTable.tsx`

```tsx
// Add import:
import { Users } from 'lucide-react';

// BEFORE
if (agents.length === 0) {
  return <p className="text-sm text-muted-foreground">No agents registered.</p>;
}

// AFTER
if (agents.length === 0) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-md border py-12 text-center">
      <Users className="h-8 w-8 text-muted-foreground/40" />
      <p className="text-sm text-muted-foreground">No agents registered</p>
    </div>
  );
}
```

**File:** `src/components/ActivityFeed.tsx` — covered by spec 1.3 (the full replacement already includes the icon-based empty state using `Bell`).

---

### Spec 2.9 — Loading state copy normalisation

**Rule:** All loading states use `"Loading…"` (with `…`, not `...`). No component-specific copy.

**File:** `src/components/agents/AgentDetailSheet.tsx`

```tsx
// SheetDescription fallback (line 80):
// BEFORE
'Loading agent details...'

// AFTER
'Loading…'
```

**File:** `src/pages/Telemetry.tsx`

```tsx
// BEFORE
{loading && !data && (
  <p className="text-sm text-muted-foreground">Loading telemetry…</p>
)}

// AFTER
{loading && !data && (
  <p className="text-sm text-muted-foreground">Loading…</p>
)}
```

---

### Spec 2.10 — Truncate raw UUIDs in detail sheets

**Problem:** Assignment and agent ID fields in detail sheets show full 36-char UUIDs, which are opaque and overflow truncation at fixed widths.

**Fix:** Show first 8 chars + `…` with full UUID on hover via `title`.

**File:** `src/components/agents/AgentDetailSheet.tsx` — assignments list:

```tsx
// BEFORE
<li key={a.id} className="flex items-center justify-between text-sm">
  <span className="font-mono text-xs text-muted-foreground truncate max-w-[160px]">
    {a.task_id}
  </span>
  <StatusBadge status={a.status} />
</li>

// AFTER
<li key={a.id} className="flex items-center justify-between gap-3 text-sm">
  <span
    className="font-mono text-xs text-muted-foreground truncate"
    title={a.task_id}
  >
    {a.task_id.slice(0, 8)}…
  </span>
  <StatusBadge status={a.status} />
</li>
```

**File:** `src/components/tasks/TaskDetailSheet.tsx` — current assignment + assignment history:

```tsx
// Current assignment (line ~167):
// BEFORE
<span className="font-mono text-xs text-muted-foreground truncate max-w-[200px]">
  {data.task.current_assignment.agent_id}
</span>

// AFTER
<span
  className="font-mono text-xs text-muted-foreground truncate"
  title={data.task.current_assignment.agent_id}
>
  {data.task.current_assignment.agent_id.slice(0, 8)}…
</span>

// Assignment history list (line ~186):
// BEFORE
<span className="font-mono text-xs text-muted-foreground truncate max-w-[160px]">
  {a.agent_id}
</span>

// AFTER
<span
  className="font-mono text-xs text-muted-foreground truncate"
  title={a.agent_id}
>
  {a.agent_id.slice(0, 8)}…
</span>
```

---

## File Change Index

| Spec | Files touched | Operation |
|------|--------------|-----------|
| 1.1 | `src/components/StatusBadge.tsx` | Full replacement |
| 1.2 | `src/components/TimeAgo.tsx` | Full replacement |
| 1.3 | `src/components/ActivityFeed.tsx` | Full replacement (also covers spec 2.8 for this file) |
| 1.4 | `src/components/tasks/TaskDetailSheet.tsx` | Surgical edit |
| 2.1 | **new** `src/components/MetricCard.tsx`, `src/pages/Dashboard.tsx`, `src/pages/Telemetry.tsx` | New file + surgical edits |
| 2.2 | `src/pages/Dashboard.tsx`, `src/pages/Telemetry.tsx` | Surgical edits |
| 2.3 | `src/components/tasks/TaskDetailSheet.tsx`, `src/components/agents/AgentDetailSheet.tsx` | Surgical edits |
| 2.4 | **new** `src/components/ErrorBanner.tsx`, `src/components/ApiAuthBanner.tsx`, `src/pages/Telemetry.tsx` | New file + replacements |
| 2.5 | `src/components/tasks/columns.tsx`, `src/components/tasks/TasksTable.tsx`, `src/components/agents/AgentsTable.tsx` | Delete + refactor |
| 2.6 | `src/components/tasks/CreateTaskDialog.tsx` | replaceAll `space-y-1.5` → `space-y-2` |
| 2.7 | `src/App.tsx`, `index.html` | Surgical edits |
| 2.8 | `src/components/agents/AgentsTable.tsx` | Surgical edit (ActivityFeed covered by 1.3) |
| 2.9 | `src/components/agents/AgentDetailSheet.tsx`, `src/pages/Telemetry.tsx` | Surgical edits |
| 2.10 | `src/components/agents/AgentDetailSheet.tsx`, `src/components/tasks/TaskDetailSheet.tsx` | Surgical edits |
