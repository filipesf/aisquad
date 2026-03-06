# Mission UI — Simplification Summary

**Date:** 2026-03-06  
**Scope:** `apps/mission-ui/src` — information architecture, visual chrome, and component complexity  
**Basis:** Design principle review against the "ambient first, density with clarity" goals in `DESIGN_CONTEXT.md`

---

## Premise

The dashboard is an always-on second-monitor tool for a single operator. Its primary goal is _ambient awareness_: is the fleet healthy, are tasks moving, what just happened? Anything that consumes screen space or mental overhead without serving that goal is complexity to remove.

This pass applied one question to every element: **does removing this make the dashboard worse at its primary job?** If not, it was removed.

---

## Changes Made

### 1. Removed Task Summary metric cards section — `Dashboard.tsx`

**What was there:** Six `MetricCard` components rendering counts per task state (`queued`, `assigned`, `in_progress`, `review`, `blocked`, `done`). They occupied a full grid row between the Agents table and the Tasks table, under a "Task Summary" section heading.

**Why it was removed:**

The TasksTable directly below it showed every task with its current state via `StatusBadge`. An operator who wants to know "how many tasks are queued" can scan the table — or use the Status filter to isolate that state. The six cards added zero information not already present in the table; they were a summary of data sitting one scroll position below.

They also introduced a structural lie: the heading "All Tasks" below them implied the table and the summary were separate sections of the same data. They were the same data, counted twice.

**What was also cleaned up:**

- Removed the `TASK_STATES` import (only used for stat card iteration)
- Removed the `stateCounts` `useMemo` computation (only fed the stat cards)
- The `onlineCount`/`totalAgents` memo was retained — it drives the "N of N online" inline stat in the Agents section header, which is genuinely additive information not visible elsewhere

**Deferred:** If a future requirement calls for a true summary view (e.g., click a state card to jump to filtered tasks), the pattern should be re-added with click-through navigation. Without that affordance, the cards are display-only noise.

---

### 2. Simplified `MetricCard` component — `MetricCard.tsx`

**What was there:** A `Card > CardHeader > CardTitle + CardContent > div` structure — four nested shadcn components to render a label and a number.

**Why it was changed:**

The Card component carries visual chrome (background, shadow, border-radius) that's appropriate when grouping heterogeneous content. For a single label–value pair in a uniform grid, that chrome is structural noise with no semantic purpose. Each of the six stat cards had its own border, background fill, and padding stack from three nested components.

**What replaced it:**

A single `div` with `rounded-md border px-4 py-3`, two `p` tags, and no component imports. Visually equivalent — a bordered box with a label above a large number — but without the Card system's abstraction overhead.

**Note on `MetricCard` usage:** The component is now used only in the Telemetry page (six aggregate stat cards). Its visual character is unchanged.

---

### 3. Removed Columns visibility dropdown — `TasksTable.tsx`

**What was there:** A `DropdownMenu` with `DropdownMenuCheckboxItem` entries, one per table column, allowing the operator to hide or show columns. Triggered by a "Columns" button with a `SlidersHorizontal` icon and `ChevronDown`.

**Why it was removed:**

The Tasks table has four fixed columns: Title, Status, Priority, Updated. These are not configurable — there is no situation where hiding "Status" or "Priority" improves operator experience on this dashboard. Column visibility controls are appropriate for wide enterprise data grids where 12+ columns compete for space. For a focused four-column monitoring table, the control was visual complexity with no achievable benefit.

**What was also cleaned up:**

- Removed `VisibilityState` from the `@tanstack/react-table` import
- Removed `columnVisibility` state and `onColumnVisibilityChange` binding from the table instance
- Removed the `DropdownMenu`, `DropdownMenuCheckboxItem`, `DropdownMenuContent`, `DropdownMenuTrigger` imports
- Removed the `SlidersHorizontal` and `ChevronDown` icon imports
- Moved the "New task" button to `ml-auto` to maintain right-alignment now that "Columns" is gone

---

### 4. Removed Avatar from `AgentsTable` rows — `AgentsTable.tsx`

**What was there:** An `Avatar` component showing agent name initials (via `getInitials()`) to the left of each agent name in the table.

**Why it was removed:**

Agent avatars with initials are useful for social contexts — recognising a person in a message thread, distinguishing authors in a comment list. In a monitoring table where agents are programmatic entities (not people) and names already serve as identifiers, the initials circle is decorative. It added visual weight and padding to every row without aiding identification.

The agent name — already in the cell, already monospace-adjacent in style — is the identifier. Doubling it as initials adds nothing.

**What was also cleaned up:**

- Removed the `Avatar` and `AvatarFallback` component imports
- Removed the `getInitials()` helper function entirely
- The `TableCell` now contains only the `<span>` with the agent name

**Note on AUDIT_REPORT.md item M3** ("Avatar fallback may display empty string"): This issue is now moot — the Avatar was removed.

---

### 5. Unwrapped `ActivityFeed` from `Card` — `ActivityFeed.tsx`

**What was there:** The entire feed was wrapped in `<Card>` with a `<CardHeader>` containing the "Live Activity" title and connection indicator, and `<CardContent>` containing the `<ScrollArea>`.

**Why it was changed:**

The Card wrapper created a second layer of surface (its own background, border, and rounded corners) on top of the scroll area's own bordered container. On the Dashboard, it also forced a visual hierarchy mismatch — the feed section had no `h2` heading of its own (the Card header was acting as one), while every other section used the consistent `h2 + section content` pattern.

**What replaced it:**

The standard Dashboard section pattern: a `div` with `mb-4 flex items-center justify-between` containing an `h2` and the Live/Reconnecting indicator, followed by a `div.rounded-md.border` containing the `ScrollArea`. This matches Agents and Tasks sections structurally.

The section title changed from "Live Activity" to "Activity" — consistent with the other section headings (Agents, Tasks) which don't use adjectives.

**In `Dashboard.tsx`:** The wrapping `<section>` around `ActivityFeed` was removed since the component now owns its own heading, matching how other sections are structured from within their components rather than from the page.

---

## What Was Explicitly Not Changed

- **Status/Priority filter popovers in TasksTable** — retained. These serve a real filtering use case and are appropriately compact.
- **Search input** — retained. Title search is the primary query mechanism for operators with large task lists.
- **Pagination** — retained. Pages of 20 tasks with Previous/Next navigation is appropriate for the current scale.
- **All detail sheets** — retained. Agent and Task detail sheets are progressive disclosure of information that would bloat the main table.
- **The "Columns" button copy** — the control was removed. If re-added, the copy decision in `COPY_DECISIONS.md` ("Columns" not "View") stands.

---

## Impact on `COPY_DECISIONS.md`

Two entries in the Dashboard Section Headings table referenced sections that no longer exist:

| Heading        | Previous rationale                   | Status                        |
| -------------- | ------------------------------------ | ----------------------------- |
| `Task Summary` | Names the six metric cards           | **Removed** — section deleted |
| `All Tasks`    | Distinguishes table from cards above | **Replaced** with `Tasks`     |

The heading above the TasksTable is now simply `Tasks`. There is no longer a disambiguation need — it is the only task-related section on the page.

---

## Files Changed

| File                                    | Change                                                                                                                             |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `src/pages/Dashboard.tsx`               | Removed `stateCounts` useMemo, `TASK_STATES` import, Task Summary section, MetricCard import; simplified ActivityFeed wrapper      |
| `src/components/MetricCard.tsx`         | Replaced `Card/CardHeader/CardContent` with plain `div`; removed card component imports                                            |
| `src/components/tasks/TasksTable.tsx`   | Removed Columns dropdown, `VisibilityState`, `columnVisibility` state/binding, related imports; `ml-auto` moved to New task button |
| `src/components/agents/AgentsTable.tsx` | Removed `Avatar`/`AvatarFallback` imports and usage; removed `getInitials()` helper                                                |
| `src/components/ActivityFeed.tsx`       | Unwrapped from `Card`; replaced with standard section header + bordered scroll area; title "Live Activity" → "Activity"            |
| `src/pages/Dashboard.test.tsx`          | Updated "shows task state counters" test — states are now verified via the TasksTable StatusBadges, not stat card labels           |

---

## Complexity Removed (Quantified)

| Element                                                            | Before                                                       | After                                               |
| ------------------------------------------------------------------ | ------------------------------------------------------------ | --------------------------------------------------- |
| DOM layers to render a stat number                                 | 4 (Card > CardHeader > CardTitle + CardContent > div)        | 2 (div > p)                                         |
| Sections on Dashboard                                              | 4 (Agents, Task Summary, All Tasks, Activity)                | 3 (Agents, Tasks, Activity)                         |
| Toolbar buttons in TasksTable                                      | 5 (Search, Status, Priority, Clear all\*, Columns, New task) | 4 (Search, Status, Priority, Clear all\*, New task) |
| Imports in `AgentsTable.tsx`                                       | 9 component/hook imports                                     | 7                                                   |
| `useMemo` calls in `Dashboard.tsx`                                 | 2 (`stateCounts`, agent counts)                              | 1 (agent counts)                                    |
| Active `setInterval` timers per Dashboard view (stat card related) | 0 additional (cards were display-only)                       | 0 — no regression                                   |

\* "Clear all" appears conditionally when filters are active.

---

**Last Updated:** 2026-03-06
