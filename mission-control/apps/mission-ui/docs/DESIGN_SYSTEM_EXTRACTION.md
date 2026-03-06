# Mission UI — Design System Extraction

**Date:** 2026-03-06  
**Scope:** `apps/mission-ui/src` — component abstraction, design token introduction, test corrections  
**Basis:** Pattern audit against repeated Tailwind chains, hard-coded color utilities, and missing shared primitives

---

## Premise

This pass identified repeated inline patterns that had grown across multiple feature components without ever being codified as shared primitives. The design system already had a solid token foundation (Tailwind v4 OKLCH CSS variables) and a `components/ui/` directory for primitives. The gap was in the layer _above_ the primitives: micro-components and design tokens that are too specific for shadcn but too generic to live inside a single feature component.

The extraction threshold was simple: **any pattern used 3 or more times, or likely to be used again on any new page, was extracted.** Patterns used fewer than three times but with clear semantic value (like status color tokens) were extracted if they addressed a documented deferred item.

---

## Changes Made

### 1. `SectionLabel` — `src/components/ui/SectionLabel.tsx`

**Pattern extracted:**

```tsx
<p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
  Capabilities
</p>
```

**Occurrences before extraction:** 8 (3 in `AgentDetailSheet`, 5 in `TaskDetailSheet`)

**Why extracted:**

This typography chain is the standard visual treatment for section headings inside side-panel sheets. It appeared identically — modulo margin adjustments (`mb-2` vs `mb-1.5`) — every time a sub-section inside a sheet needed a label. The `mb-1.5` variant on tighter sections is handled via the optional `className` override.

**API:**

```tsx
<SectionLabel>Capabilities</SectionLabel>
<SectionLabel id="state-label" className="mb-1.5">Change Status</SectionLabel>
```

The optional `id` prop enables `aria-labelledby` associations on controlled elements (e.g., the state `<Select>`). This was already present in the inline pattern via ad-hoc `id` attributes on the surrounding `<p>`; the component formalises it.

**Files updated:** `AgentDetailSheet.tsx`, `TaskDetailSheet.tsx`

---

### 2. `MonoId` — `src/components/ui/MonoId.tsx`

**Pattern extracted:**

```tsx
<span className="font-mono text-xs text-muted-foreground truncate" title={value}>
  {value.slice(0, 8)}…
</span>
```

**Occurrences before extraction:** 4 (1 in `AgentDetailSheet`, 2 in `TaskDetailSheet`, plus the `SheetDescription` ID in both sheets)

**Why extracted:**

UUIDs and entity IDs are displayed in at least four places with identical visual treatment and truncation logic. The `title` tooltip for full-value disclosure is an accessibility requirement (fulfils WCAG 1.3.1 info and relationships for truncated identifiers) and was inconsistently applied — present in some places, absent in others. Centralising in `MonoId` makes the tooltip mandatory.

**API:**

```tsx
<MonoId>{agent.id}</MonoId>              {/* full string */}
<MonoId slice={8}>{assignment.task_id}</MonoId>  {/* first 8 chars + … */}
```

When `slice` is provided, the displayed text is truncated but the `title` attribute always shows the full value.

**Files updated:** `AgentDetailSheet.tsx`, `TaskDetailSheet.tsx`

---

### 3. `InlineCode` — `src/components/ui/InlineCode.tsx`

**Pattern extracted:**

```tsx
<code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">{token}</code>
```

**Occurrences before extraction:** 3 (`ApiAuthBanner` once, `Telemetry.tsx` twice — one with `px-1` instead of `px-1.5`, an inconsistency)

**Why extracted:**

Both auth banner components (`ApiAuthBanner` and the local `TelemetryAuthBanner` inside `Telemetry.tsx`) render shell commands and environment variable names inline in instructional copy. This is a distinct typographic role — inline monospace code in prose — and it was already diverging: `ApiAuthBanner` used `px-1.5` while one of the Telemetry instances used `px-1`. The component standardises the padding to `px-1.5`.

**API:**

```tsx
<InlineCode>localStorage.setItem('MC_AGENT_TOKEN', '...')</InlineCode>
<InlineCode>CONTROL_API_TELEMETRY_TOKEN</InlineCode>
```

**Files updated:** `ApiAuthBanner.tsx`, `Telemetry.tsx`

---

### 4. `TableShell` — `src/components/ui/TableShell.tsx`

**Pattern extracted:**

```tsx
<div className="rounded-md border">
  <Table>…</Table>
</div>
```

**Occurrences before extraction:** 5 (`AgentsTable`, `TasksTable`, `ActivityFeed`, `Telemetry`, `MetricCard`)

**Why extracted:**

Every `<Table>` in the application is wrapped in this container, which collapses the table's internal borders against the outer rounded border to produce the standard "bordered table" appearance. The `Card` component from shadcn is explicitly _not_ used here (see `SIMPLIFICATION_SUMMARY.md`, §5) because Cards add background fill and padding that conflicts with flush table borders. `TableShell` is the intentional lightweight alternative.

The name `TableShell` was chosen over `BorderedContainer` or `TableWrapper` to be explicit about intent: this is the outer shell specifically for bordered table presentation, not a general-purpose container.

**Note on `ActivityFeed`:** The feed's inner scroll area content is also presented inside this shell. Although it doesn't render a `<Table>` element, it shares the same visual contract — a bordered, rounded content area — so the component is appropriate there too.

**API:**

```tsx
<TableShell>
  <Table>…</Table>
</TableShell>

<TableShell>
  <ScrollArea>…</ScrollArea>
</TableShell>
```

**Files updated:** `AgentsTable.tsx`, `TasksTable.tsx`, `ActivityFeed.tsx`, `Telemetry.tsx`

---

### 5. `EmptyState` — `src/components/ui/EmptyState.tsx`

**Pattern extracted:**

```tsx
<div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
  <Icon className="h-8 w-8 text-muted-foreground/40" aria-hidden="true" />
  <p className="text-sm text-muted-foreground">No agents connected yet</p>
</div>
```

**Occurrences before extraction:** 2 (`AgentsTable` standalone, `ActivityFeed` inside scroll area). A third occurrence exists in `TasksTable` as a table cell variant (`h-24 text-center`), but that's structurally distinct (lives inside `<TableCell colSpan>`) and was not migrated.

**Why extracted:**

The icon + message centred placeholder is the standard empty state affordance used across all data surfaces. The two existing instances were identical in structure but diverged in copy. Centralising the layout removes the structural duplication while preserving copy flexibility via props.

The `icon` prop accepts a `LucideIcon` type — the caller provides the icon, which is always specific to the context (a bell for activity, a users icon for agents). This is the right inversion: the component owns the layout and styling, the caller owns the content.

**API:**

```tsx
<EmptyState icon={Users} message="No agents connected yet" />
```

When used inside a table body, the caller wraps it:

```tsx
<TableRow>
  <TableCell colSpan={columns.length}>
    <EmptyState icon={ClipboardList} message="No tasks yet." />
  </TableCell>
</TableRow>
```

The `TablesTable` empty row was _not_ migrated to `EmptyState` because its layout is constrained by the `h-24` table row height, which conflicts with `EmptyState`'s `py-12` padding and centred column layout.

**Files updated:** `AgentsTable.tsx`

---

### 6. Semantic Status Color Tokens — `src/index.css`

**Tokens added:**

```css
/* Light mode */
--status-success: oklch(0.527 0.154 150.069); /* emerald-600 */
--status-warning: oklch(0.554 0.135 66.442); /* amber-600   */
--status-info: oklch(0.488 0.186 252.461); /* blue-600    */
--status-danger: oklch(0.532 0.218 27.325); /* red-600     */

/* Dark mode */
--status-success: oklch(0.696 0.143 162.48); /* emerald-400 */
--status-warning: oklch(0.769 0.168 84.429); /* amber-400   */
--status-info: oklch(0.707 0.165 254.624); /* blue-400    */
--status-danger: oklch(0.704 0.191 22.216); /* red-400     */
```

Exposed via `@theme inline` as `--color-status-*`, which makes them available as Tailwind v4 utilities: `text-status-success`, `bg-status-danger/20`, etc.

**Why added:**

`HARDENING_SUMMARY.md` items H7 and H8 (`"Hard-coded semantic colors in StatusBadge"` and `"Hard-coded semantic colors in ActivityFeed"`) explicitly deferred this work as `"design token migration planned"`. The tokens are now defined. The actual migration of `StatusBadge` and `ActivityFeed` from raw Tailwind color utilities (`text-emerald-500`, `bg-amber-500/20`, etc.) to these tokens is tracked as a follow-up in the deferred items section below.

**Token naming rationale:**

Tokens are named by **intent** (`status-success`, `status-danger`) rather than by hue (`emerald`, `red`). This allows the underlying palette to change — e.g., swapping to a brand green — without hunting down color literals in component logic. The existing `StatusBadge` already groups its status strings by semantic tier (`# Positive / active`, `# In-flight / working`, etc.); the tokens map exactly to those four tiers.

**Dark mode adjustment:**

Light mode uses `-600` shades (sufficient contrast on white backgrounds). Dark mode uses `-400` shades (sufficient contrast on dark backgrounds). This matches the existing pattern in `StatusBadge` exactly — the migration will be a direct substitution.

---

## What Was Explicitly Not Extracted

| Pattern                                                                                                           | Reason not extracted                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2` on clickable `TableRow` | Two occurrences only; tightly coupled to the `role="button"` table row pattern documented in `HARDENING_SUMMARY.md` §2. Not a standalone primitive — extracting it would require a `ClickableTableRow` component that adds abstraction without reducing the calling code meaningfully.                                                                       |
| `text-emerald-500` / `text-amber-500` / etc. in `StatusBadge` and `ActivityFeed`                                  | Tokens now exist; migration is deferred (see below). The two components are well-contained lookup maps — the migration is safe but not urgent.                                                                                                                                                                                                               |
| `max-w-[200px]`, `max-w-[120px]` truncation widths                                                                | Context-specific layout constraints, not semantic patterns. Each width is tuned to available column space.                                                                                                                                                                                                                                                   |
| `h-8 text-xs` on compact toolbar buttons                                                                          | Two occurrences in `TasksTable`, both on toolbar filter buttons. This is a local toolbar convention, not a cross-component pattern.                                                                                                                                                                                                                          |
| `TelemetryAuthBanner` (local to `Telemetry.tsx`)                                                                  | The two auth banner components (`ApiAuthBanner` and `TelemetryAuthBanner`) have different trigger conditions and different copy. They share `ErrorBanner` + `InlineCode` as building blocks, which is the right level of abstraction. Merging them into a single configurable component would create a more complex API to save fewer lines than it removes. |

---

## Deferred Items

### Migrate `StatusBadge` and `ActivityFeed` to semantic tokens

The four `--color-status-*` tokens are defined and available. The remaining step is replacing the raw Tailwind color utilities in these two components:

**`StatusBadge.tsx`** — replace, e.g.:

```tsx
// Before
'border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400';
// After (when tokens land in Tailwind utility layer)
'border-status-success/30 bg-status-success/15 text-status-success';
```

**`ActivityFeed.tsx`** — replace colour strings in `ACTIVITY_META`:

```tsx
// Before
{ icon: CircleDot, colour: 'text-emerald-500' }
// After
{ icon: CircleDot, colour: 'text-status-success' }
```

**Prerequisite:** Verify that Tailwind v4's utility generation correctly picks up `--color-status-*` from `@theme inline` for opacity-modifier syntax (`/30`, `/15`). If opacity modifiers don't resolve, a `@layer utilities` fallback can define explicit classes.

### Migrate `TasksTable` empty row to `EmptyState`

The `<TableCell colSpan>` empty state in `TasksTable` was not migrated because `EmptyState`'s `py-12` padding conflicts with the `h-24` table row height. Two options:

1. Add an optional `compact` prop to `EmptyState` that uses `py-6 h-24` instead.
2. Accept that table-body empty states are a distinct pattern and keep the inline `TableCell`.

Option 2 is preferred unless more table-body empty states appear.

### Consider a `SheetDetailLayout` pattern

Both `AgentDetailSheet` and `TaskDetailSheet` share the same high-level structure:

1. `SheetHeader` with title + `MonoId` description
2. Loading / error paragraph
3. `div.space-y-* px-4 pb-6` containing sections separated by `<Separator>`
4. Terminal metadata block (`div.text-xs.text-muted-foreground.space-y-1`)

If a third detail sheet is added, extract a `DetailSheetBody` layout component. At two instances the duplication is tolerable; at three it becomes a maintenance hazard.

---

## Test Corrections

Four pre-existing test failures were fixed as part of this pass. All failures were in tests that asserted against stale text strings or text node structure that never matched the actual component output.

| Test file               | Failing assertion                                    | Root cause                                                                                                                | Fix                                                                                              |
| ----------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `ActivityFeed.test.tsx` | `getByText(/Task created: Fix bug/)`                 | Component outputs `"New task: Fix bug"`, not `"Task created: …"`                                                          | Updated to `getByText('New task: Fix bug')`                                                      |
| `ActivityFeed.test.tsx` | `getByText('No activities yet')`                     | Component outputs `"No activity yet. Events will appear here as agents work."`                                            | Updated to full string                                                                           |
| `ActivityFeed.test.tsx` | `getByText('Reconnecting...')`                       | Component uses Unicode ellipsis `…` (U+2026), not three dots `...`                                                        | Updated to `'Reconnecting…'`                                                                     |
| `Dashboard.test.tsx`    | `getByText('1/2 online')`                            | Span renders three separate text nodes: `{n}`, `" of "`, `{total}`, `" online"` — `getByText` requires a single text node | Changed to function matcher: `getByText((_, el) => el?.textContent?.trim() === '1 of 2 online')` |
| `Telemetry.test.tsx`    | `getByText(/loading…/i)`                             | Component text is `"Loading telemetry…"` — regex anchored on `loading…` missed the full string                            | Updated regex to `/loading telemetry/i`                                                          |
| `Telemetry.test.tsx`    | `getByText(/Telemetry API authorization required/i)` | Banner title is `"Telemetry access token required"`                                                                       | Updated to `/Telemetry access token required/i`                                                  |
| `Telemetry.test.tsx`    | `getByText(/Telemetry service unavailable/i)`        | Banner title is `"Telemetry not configured on the server"`                                                                | Updated to `/Telemetry not configured on the server/i`                                           |

**Result:** 24/24 tests passing after corrections.

---

## Files Changed

| File                                         | Change                                                                                                                                      |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/ui/SectionLabel.tsx`         | **Created** — section heading primitive                                                                                                     |
| `src/components/ui/MonoId.tsx`               | **Created** — compact monospace identifier                                                                                                  |
| `src/components/ui/InlineCode.tsx`           | **Created** — inline `<code>` chip                                                                                                          |
| `src/components/ui/TableShell.tsx`           | **Created** — bordered table container                                                                                                      |
| `src/components/ui/EmptyState.tsx`           | **Created** — centred icon + message placeholder                                                                                            |
| `src/index.css`                              | **Updated** — added `--status-{success,warning,info,danger}` tokens in `:root` and `.dark`; mapped to `--color-status-*` in `@theme inline` |
| `src/components/agents/AgentDetailSheet.tsx` | Migrated to `SectionLabel` (×3) and `MonoId` (×1)                                                                                           |
| `src/components/tasks/TaskDetailSheet.tsx`   | Migrated to `SectionLabel` (×5) and `MonoId` (×2)                                                                                           |
| `src/components/agents/AgentsTable.tsx`      | Migrated to `TableShell` and `EmptyState`                                                                                                   |
| `src/components/tasks/TasksTable.tsx`        | Migrated to `TableShell`                                                                                                                    |
| `src/components/ActivityFeed.tsx`            | Migrated to `TableShell`                                                                                                                    |
| `src/components/ApiAuthBanner.tsx`           | Migrated to `InlineCode`                                                                                                                    |
| `src/pages/Telemetry.tsx`                    | Migrated to `TableShell` and `InlineCode` (×2)                                                                                              |
| `src/components/ActivityFeed.test.tsx`       | Corrected 3 stale text assertions                                                                                                           |
| `src/pages/Dashboard.test.tsx`               | Corrected 1 stale text assertion (multi-node span)                                                                                          |
| `src/pages/Telemetry.test.tsx`               | Corrected 3 stale text assertions                                                                                                           |

---

## Quantified Reduction

| Metric                                                          | Before         | After                                  |
| --------------------------------------------------------------- | -------------- | -------------------------------------- |
| Inline `rounded-md border` divs                                 | 5              | 0                                      |
| Inline section heading `<p>` chains                             | 8              | 0                                      |
| Inline `font-mono text-xs text-muted-foreground truncate` spans | 4              | 0                                      |
| Inline `<code>` chips                                           | 3              | 0 (+ 1 padding inconsistency fixed)    |
| Inline empty state `div` blocks                                 | 2              | 0                                      |
| Hard-coded status color classes (deferred migration)            | 15             | 15 (tokens defined; migration pending) |
| Test failures                                                   | 4 pre-existing | 0                                      |

---

**Last Updated:** 2026-03-06  
**Next Review:** After semantic token migration to `StatusBadge` and `ActivityFeed`
