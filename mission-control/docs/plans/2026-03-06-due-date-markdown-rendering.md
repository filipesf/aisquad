# Due Date + Markdown Rendering Implementation Plan

## Overview

Add `due_date` support to tasks (nullable, displayed everywhere tasks appear) and add `react-markdown` rendering for task descriptions and comment bodies in the detail view. Input remains plain textarea; markdown is render-only.

## Current State Analysis

- **DB**: `tasks` table has no `due_date` column. Only `created_at` / `updated_at` timestamps exist (`db/migrations/001_init.sql:39-40`).
- **Shared schema**: `CreateTaskSchema` / `UpdateTaskSchema` / `TaskSchema` in `packages/shared/src/schemas.ts:39-64` — no due date field.
- **API**: `PATCH /tasks/:id` handles `title`, `description`, `priority` only (`routes/tasks.ts:53`). Domain `updateTask` builds SQL dynamically for those three fields (`domain/tasks.ts:149-188`).
- **UI types**: `Task` interface in `apps/mission-ui/src/types/domain.ts:28` mirrors the shared schema — no due date.
- **Task table columns**: `title`, `state`, `priority`, `updated_at`, `actions` (`components/tasks/columns.tsx:34`).
- **Task forms**: `CreateTaskDialog` and `EditTaskDialog` both have `title`, `description`, `priority` — no date picker (`CreateTaskDialog.tsx:89`, `EditTaskDialog.tsx:118`).
- **Detail view**: Description rendered as `<p className="whitespace-pre-wrap">` (plain text, `TaskDetailSheet.tsx:290`). Comment bodies rendered as `<p className="whitespace-pre-wrap text-muted-foreground">{c.body}</p>` (plain text, `TaskDetailSheet.tsx:344`).
- **No markdown library** exists anywhere in the project. `apps/mission-ui/package.json` has no `react-markdown`, `marked`, `remark`, or any rich-text dependency.
- **Date utilities**: Custom `TimeAgo` component (`components/TimeAgo.tsx`) for relative timestamps. No `date-fns` or similar library in the project.

## Desired End State

### Due Date
- `tasks.due_date TIMESTAMPTZ NULL` column exists in the database.
- `CreateTaskSchema`, `UpdateTaskSchema`, `TaskSchema` include `due_date?: string | null`.
- `POST /tasks` and `PATCH /tasks/:id` accept and persist `due_date`.
- `CreateTaskDialog` and `EditTaskDialog` include a date picker for `due_date` (optional field, clearable).
- `TasksTable` has a "Due" column showing absolute date + relative hint (e.g. "Mar 12 · in 3 days" or "Mar 10 · 2 days overdue" in red).
- `TaskDetailSheet` shows due date in the metadata section with overdue styling.
- `normalizeTask` in `lib/api.ts` passes through `due_date`.

### Markdown Rendering
- `react-markdown` + `rehype-sanitize` installed in `apps/mission-ui`.
- A `MarkdownBody` component wraps `react-markdown` with consistent prose styling.
- Description in `TaskDetailSheet` renders through `MarkdownBody` instead of `<p>`.
- Comment bodies in `TaskDetailSheet` render through `MarkdownBody` instead of `<p>`.
- Input textareas (create/edit dialogs, comment composer) remain plain `<Textarea>` — no preview mode.

### Verification
- `make mc-up` starts cleanly, migration `007` applies without error.
- Type checking passes: `pnpm --filter @mc/mission-ui typecheck` and `pnpm --filter @mc/control-api typecheck`.
- API accepts `due_date` on create/update and returns it in responses.
- UI renders due date in table and detail view with correct absolute + relative formatting and overdue styling.
- Markdown in task description and comment bodies renders with proper heading, bold, italic, code, and link formatting.

## Key Discoveries

- Migration numbering: next file is `007_*.sql` (current last is `006_clean_slate.sql`).
- `updateTask` in `domain/tasks.ts:149` uses a dynamic SQL builder — adding `due_date` follows the exact same pattern as `title`/`description`/`priority`.
- `normalizeTask` in `lib/api.ts:103` must be updated; otherwise the frontend will silently drop `due_date` from API responses.
- The `Task` type is duplicated across `packages/shared/src/schemas.ts` (Zod) and `apps/mission-ui/src/types/domain.ts` (hand-written interface) — **both must be updated**.
- No date picker component exists in the shadcn-style `components/ui/` folder. We will use a native `<input type="date">` styled to match, avoiding any new heavy dependency.
- `react-markdown` must be added to `apps/mission-ui/package.json` only (not shared or API packages).
- `rehype-sanitize` ships with `react-markdown` as a peer — install together.

## What We're NOT Doing

- No due date filtering/sorting in the table toolbar (can be added later).
- No due date on the `TaskDetailSheet` state-change flow or assignment logic.
- No markdown preview in create/edit dialogs or the comment composer.
- No comment editing endpoint or UI.
- No `date-fns` or heavy date library — only native `Date` APIs for formatting.
- No calendar popover/date picker component — native `<input type="date">` only.
- No due date notifications or automated overdue transitions.

---

## Phase 1: Database + Shared Schema + API

### Overview
Add `due_date TIMESTAMPTZ NULL` to the `tasks` table, propagate it through the shared Zod schema, backend domain, and API route. At the end of this phase the API fully supports due dates.

### Changes Required

#### 1. Database Migration
**File**: `mission-control/db/migrations/007_task_due_date.sql`

```sql
-- Add optional due date to tasks
ALTER TABLE tasks ADD COLUMN due_date TIMESTAMPTZ NULL;
```

#### 2. Shared Zod Schemas
**File**: `mission-control/packages/shared/src/schemas.ts`

Add `due_date` to all three task schemas:

```typescript
// CreateTaskSchema (line 39) — add inside z.object({...}):
due_date: z.string().datetime({ offset: true }).nullable().optional()

// UpdateTaskSchema (line 47) — add inside z.object({...}):
due_date: z.string().datetime({ offset: true }).nullable().optional()

// TaskSchema (line 54) — add inside z.object({...}):
due_date: z.string().nullable()
```

`due_date` in `TaskSchema` is `string | null` (not optional) because the DB always returns the column, just as null when unset. In `CreateTaskSchema` and `UpdateTaskSchema` it is `?.string | null` — clients may omit it or explicitly pass `null` to clear it.

#### 3. Backend Domain — `TaskRow` interface + `rowToTask` + `createTask` + `updateTask`
**File**: `mission-control/apps/control-api/src/domain/tasks.ts`

```typescript
// TaskRow interface (line 6) — add field:
due_date: string | null;

// rowToTask (line 17) — add mapping:
due_date: row.due_date,

// createTask INSERT (line 74) — add column + placeholder:
INSERT INTO tasks (id, title, description, state, priority, required_capabilities, due_date, created_at, updated_at)
VALUES ($1, $2, $3, 'queued', $4, $5, $6, $7, $7)
// values array: add input.due_date ?? null before `now`

// updateTask dynamic builder (line 149) — add after priority block:
if (input.due_date !== undefined) {
  values.push(input.due_date);     // string ISO or null
  fields.push(`due_date = $${values.length}`);
}
```

#### 4. Backend Type — `UpdateTaskInput` accepts `due_date`
Already handled by the Zod schema change in step 2. The `UpdateTaskInput` type is inferred from `UpdateTaskSchema`, so it will include `due_date` automatically once the schema is updated.

### Success Criteria

#### Automated Verification
- [ ] Migration applies cleanly: `cd mission-control && node db/migrate.js` (or via `make mc-up` which runs migrations on start)
- [ ] Shared package type-checks: `pnpm --filter @mc/shared build`
- [ ] API type-checks: `pnpm --filter @mc/control-api typecheck`
- [ ] `POST /tasks` with `due_date: "2026-04-01T00:00:00Z"` returns task with `due_date` field
- [ ] `PATCH /tasks/:id` with `due_date: null` clears the due date
- [ ] `GET /tasks/:id` returns `due_date` field (null or ISO string)

#### Manual Verification
- [ ] `make mc-up` starts without errors
- [ ] Migration `007` appears in `_migrations` table
- [ ] `curl -X POST localhost:3000/tasks -H "Authorization: Bearer ..." -d '{"title":"test","due_date":"2026-04-01T00:00:00Z"}'` returns task with correct `due_date`

**Implementation Note**: After Phase 1 automated and manual verification pass, confirm before moving to Phase 2.

---

## Phase 2: Frontend — Due Date in Forms, Table, and Detail View

### Overview
Wire the `due_date` field through the frontend: update types, `normalizeTask`, both dialogs, the task table column, and the detail sheet metadata section. No new library dependencies needed for this phase.

### Changes Required

#### 1. Frontend Domain Type
**File**: `mission-control/apps/mission-ui/src/types/domain.ts`

```typescript
// Task interface (line 28) — add field:
due_date: string | null;
```

#### 2. `normalizeTask` in API layer
**File**: `mission-control/apps/mission-ui/src/lib/api.ts`

```typescript
// TaskLike type (line 70) — add field:
due_date?: string | null;

// normalizeTask (line 103) — add field:
due_date: raw.due_date ?? null,

// createTask input type (line 172) — add field:
due_date?: string | null;

// updateTask input type (line 184) — add field:
due_date?: string | null;
```

#### 3. Due Date Utility Functions
**File**: `mission-control/apps/mission-ui/src/lib/dueDate.ts` *(new file)*

```typescript
/**
 * Format a due_date string for display.
 * Returns { absolute, relative, isOverdue } or null if no due date.
 *
 * absolute: "Mar 12, 2026"
 * relative: "in 3 days" | "2 days overdue" | "today" | "tomorrow" | "yesterday"
 * isOverdue: true when due date is in the past (past midnight of due day)
 */
export function formatDueDate(dueDateIso: string | null | undefined): {
  absolute: string;
  relative: string;
  isOverdue: boolean;
} | null {
  if (!dueDateIso) return null;

  const due = new Date(dueDateIso);
  const now = new Date();

  // Compare at day granularity (local time)
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const todayDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((dueDay.getTime() - todayDay.getTime()) / (1000 * 60 * 60 * 24));

  const absolute = due.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: due.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
  });

  let relative: string;
  if (diffDays === 0) relative = 'today';
  else if (diffDays === 1) relative = 'tomorrow';
  else if (diffDays === -1) relative = 'yesterday';
  else if (diffDays > 1) relative = `in ${diffDays} days`;
  else relative = `${Math.abs(diffDays)} days overdue`;

  return { absolute, relative, isOverdue: diffDays < 0 };
}

/**
 * Convert a Date (or null) to an ISO date string for <input type="date"> value.
 * Returns "" when null.
 */
export function toDateInputValue(dueDateIso: string | null | undefined): string {
  if (!dueDateIso) return '';
  const d = new Date(dueDateIso);
  // YYYY-MM-DD in local time
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Convert a YYYY-MM-DD string from <input type="date"> to a UTC ISO string.
 * Returns null when value is empty.
 */
export function fromDateInputValue(value: string): string | null {
  if (!value) return null;
  // Treat the date as local midnight, store as ISO
  const d = new Date(`${value}T00:00:00`);
  return d.toISOString();
}
```

#### 4. `CreateTaskDialog` — add due date field
**File**: `mission-control/apps/mission-ui/src/components/tasks/CreateTaskDialog.tsx`

- Add `dueDate` state: `const [dueDate, setDueDate] = useState('');`
- Add to submit payload: `due_date: fromDateInputValue(dueDate)`
- Add to reset on close: `setDueDate('')`
- Add form field after priority:

```tsx
<div className="space-y-2">
  <Label htmlFor="task-due-date">Due date <span className="text-muted-foreground text-xs">(optional)</span></Label>
  <input
    id="task-due-date"
    type="date"
    value={dueDate}
    onChange={(e) => setDueDate(e.target.value)}
    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
  />
</div>
```

#### 5. `EditTaskDialog` — add due date field
**File**: `mission-control/apps/mission-ui/src/components/tasks/EditTaskDialog.tsx`

- Import `toDateInputValue`, `fromDateInputValue` from `@/lib/dueDate`
- Add `dueDate` state: `const [dueDate, setDueDate] = useState('')`
- Sync on task change in `useEffect`: `setDueDate(toDateInputValue(task.due_date))`
- Update `isDirty` check to include `fromDateInputValue(dueDate) !== task.due_date`
- Reset on cancel: `setDueDate(toDateInputValue(task.due_date))`
- Add to submit payload: `due_date: fromDateInputValue(dueDate)`
- Add same form field (identical to CreateTaskDialog) after priority

#### 6. `TasksTable` columns — "Due" column
**File**: `mission-control/apps/mission-ui/src/components/tasks/columns.tsx`

Add a new column definition after `updated_at` and before `actions`:

```typescript
import { formatDueDate } from '@/lib/dueDate';

// Inside getTaskColumns return array, after updated_at column:
{
  accessorKey: 'due_date',
  header: 'Due',
  cell: ({ row }) => {
    const fmt = formatDueDate(row.getValue<string | null>('due_date'));
    if (!fmt) return <span className="text-muted-foreground text-sm">—</span>;
    return (
      <span className={cn('text-sm', fmt.isOverdue ? 'text-destructive' : 'text-muted-foreground')}>
        {fmt.absolute}
        <span className="ml-1.5 text-xs opacity-70">· {fmt.relative}</span>
      </span>
    );
  }
},
```

#### 7. `TaskDetailSheet` — due date in metadata section
**File**: `mission-control/apps/mission-ui/src/components/tasks/TaskDetailSheet.tsx`

Import `formatDueDate` from `@/lib/dueDate`. In the metadata section (after `updated_at` display, around line 392):

```tsx
{/* Meta */}
<div className="space-y-1 text-muted-foreground text-xs">
  {(() => {
    const fmt = formatDueDate(data.task.due_date);
    if (!fmt) return null;
    return (
      <div className={fmt.isOverdue ? 'text-destructive' : undefined}>
        Due: {fmt.absolute}
        <span className="ml-1.5 opacity-70">· {fmt.relative}</span>
      </div>
    );
  })()}
  <div>Created: <TimeAgo date={data.task.created_at} /></div>
  <div>Updated: <TimeAgo date={data.task.updated_at} /></div>
</div>
```

### Success Criteria

#### Automated Verification
- [ ] Frontend type-checks: `pnpm --filter @mc/mission-ui typecheck`
- [ ] Frontend linting passes: `pnpm --filter @mc/mission-ui lint`
- [ ] UI builds: `pnpm --filter @mc/mission-ui build`

#### Manual Verification
- [ ] "New task" dialog shows "Due date" field; creating with a date persists it correctly
- [ ] "Edit task" dialog pre-fills due date when task has one; clearing it sends `null`
- [ ] Tasks table shows "Due" column: `—` when no due date, absolute + relative hint when set
- [ ] Overdue tasks display in red (`text-destructive`) in both table and detail sheet
- [ ] Task detail sheet metadata shows due date with correct absolute + relative formatting
- [ ] Task with no due date shows nothing in the due date section of the detail sheet

**Implementation Note**: Pause here for manual confirmation before moving to Phase 3.

---

## Phase 3: Markdown Rendering for Description and Comments

### Overview
Install `react-markdown` + `rehype-sanitize`, create a shared `MarkdownBody` component, and swap the plain `<p>` renderers in `TaskDetailSheet` for markdown-rendered output. Input surfaces (dialogs, comment composer) remain plain `<Textarea>`.

### Changes Required

#### 1. Install Dependencies
**Directory**: `mission-control/apps/mission-ui`

```bash
pnpm --filter @mc/mission-ui add react-markdown rehype-sanitize
```

`react-markdown` is the renderer; `rehype-sanitize` strips dangerous HTML (XSS protection) since comment bodies can be authored by agents.

#### 2. `MarkdownBody` Component
**File**: `mission-control/apps/mission-ui/src/components/ui/MarkdownBody.tsx` *(new file)*

```tsx
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
        'text-sm break-words',
        // Prose-like spacing without the full typography plugin
        '[&>p]:mb-2 [&>p:last-child]:mb-0',
        '[&>ul]:mb-2 [&>ul]:list-disc [&>ul]:pl-4',
        '[&>ol]:mb-2 [&>ol]:list-decimal [&>ol]:pl-4',
        '[&>li]:mb-0.5',
        '[&>h1]:font-semibold [&>h1]:text-base [&>h1]:mb-1',
        '[&>h2]:font-semibold [&>h2]:text-sm [&>h2]:mb-1',
        '[&>h3]:font-medium [&>h3]:text-sm [&>h3]:mb-1',
        '[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs',
        '[&>pre]:rounded [&>pre]:bg-muted [&>pre]:p-3 [&>pre]:mb-2 [&>pre]:overflow-x-auto',
        '[&>pre_code]:bg-transparent [&>pre_code]:p-0',
        '[&_a]:underline [&_a]:underline-offset-2',
        '[&>blockquote]:border-l-2 [&>blockquote]:border-border [&>blockquote]:pl-3 [&>blockquote]:text-muted-foreground',
        '[&>hr]:border-border [&>hr]:my-2',
        className
      )}
    >
      <ReactMarkdown rehypePlugins={[rehypeSanitize]}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
```

#### 3. Task Description — swap renderer in `TaskDetailSheet`
**File**: `mission-control/apps/mission-ui/src/components/tasks/TaskDetailSheet.tsx`

Import `MarkdownBody`:
```typescript
import { MarkdownBody } from '@/components/ui/MarkdownBody';
```

Replace description render (line 287-292):
```tsx
// Before:
{data.task.description && (
  <div>
    <SectionLabel className="mb-1.5">Description</SectionLabel>
    <p className="whitespace-pre-wrap break-words text-sm">{data.task.description}</p>
  </div>
)}

// After:
{data.task.description && (
  <div>
    <SectionLabel className="mb-1.5">Description</SectionLabel>
    <MarkdownBody className="text-foreground">{data.task.description}</MarkdownBody>
  </div>
)}
```

#### 4. Comment Bodies — swap renderer in `TaskDetailSheet`
**File**: `mission-control/apps/mission-ui/src/components/tasks/TaskDetailSheet.tsx`

Replace comment body render (line 344):
```tsx
// Before:
<p className="whitespace-pre-wrap text-muted-foreground">{c.body}</p>

// After:
<MarkdownBody className="text-muted-foreground">{c.body}</MarkdownBody>
```

### Success Criteria

#### Automated Verification
- [ ] `pnpm --filter @mc/mission-ui add react-markdown rehype-sanitize` installs without peer errors
- [ ] Frontend type-checks: `pnpm --filter @mc/mission-ui typecheck`
- [ ] Frontend linting passes: `pnpm --filter @mc/mission-ui lint`
- [ ] UI builds without errors: `pnpm --filter @mc/mission-ui build`
- [ ] Docker image rebuilds: `docker compose build mission-ui && docker compose up -d mission-ui`

#### Manual Verification
- [ ] Task description with `**bold**`, `_italic_`, `` `code` ``, and `- list items` renders correctly in the detail sheet
- [ ] Comment body with markdown syntax renders correctly (not as raw `**text**`)
- [ ] Plain text description/comments (no markdown syntax) still render cleanly
- [ ] No XSS: a comment body containing `<script>alert(1)</script>` does not execute (renders as escaped text or is stripped)
- [ ] Description and comment input textareas remain plain text (no live preview)
- [ ] Code blocks render with monospace font and muted background

**Implementation Note**: Rebuild the mission-ui Docker container after this phase (`docker compose build mission-ui && docker compose up -d mission-ui`) — it is a static nginx-served build and hot reload is not available in production mode.

---

## Testing Strategy

### Unit Tests
- `lib/dueDate.ts` utility functions are pure and straightforward to unit test:
  - `formatDueDate(null)` returns `null`
  - `formatDueDate(futureIso)` returns correct `relative: "in N days"`, `isOverdue: false`
  - `formatDueDate(pastIso)` returns correct `relative: "N days overdue"`, `isOverdue: true`
  - `formatDueDate(todayIso)` returns `relative: "today"`, `isOverdue: false`
  - `toDateInputValue` / `fromDateInputValue` round-trip correctly
- Add tests to `apps/mission-ui/src/lib/dueDate.test.ts`

### Manual Testing Steps
1. Create a task with a future due date → verify it appears in the table "Due" column with green/neutral text
2. Edit a task to set a past due date → verify it appears in red with "N days overdue"
3. Edit a task to clear the due date (clear the date input) → verify the "Due" column shows "—"
4. Open a task with a description containing `# Heading`, `**bold**`, and `- list` → verify markdown renders in the detail sheet
5. Post a comment with backtick code → verify it renders as inline code in the detail sheet
6. Verify the description textarea in "Edit task" dialog still shows raw markdown text, not rendered HTML

## Performance Considerations

- `react-markdown` + `rehype-sanitize` bundle is ~30-40kB gzipped. Acceptable for a dashboard app with no bundle-size budget constraints.
- The `MarkdownBody` component does not memoize — each render re-parses markdown. Given the polling interval is 5s and comment lists are small, this is not a concern. If a task accumulates many comments (50+), consider memoizing comment bodies with `React.memo` on the list item.

## Migration Notes

- `007_task_due_date.sql` is a non-destructive `ALTER TABLE ADD COLUMN` — safe to apply to existing data. All existing tasks will have `due_date = NULL`.
- No rollback migration file is provided — to revert, manually `ALTER TABLE tasks DROP COLUMN due_date` and remove the schema/code changes.

## References

- Task DB schema: `mission-control/db/migrations/001_init.sql:30-44`
- Shared task schemas: `mission-control/packages/shared/src/schemas.ts:34-64`
- Backend domain: `mission-control/apps/control-api/src/domain/tasks.ts`
- API routes: `mission-control/apps/control-api/src/routes/tasks.ts`
- Frontend types: `mission-control/apps/mission-ui/src/types/domain.ts:28-37`
- API client + normalizeTask: `mission-control/apps/mission-ui/src/lib/api.ts:70-114`
- Task table columns: `mission-control/apps/mission-ui/src/components/tasks/columns.tsx`
- Create dialog: `mission-control/apps/mission-ui/src/components/tasks/CreateTaskDialog.tsx`
- Edit dialog: `mission-control/apps/mission-ui/src/components/tasks/EditTaskDialog.tsx`
- Detail sheet: `mission-control/apps/mission-ui/src/components/tasks/TaskDetailSheet.tsx`
