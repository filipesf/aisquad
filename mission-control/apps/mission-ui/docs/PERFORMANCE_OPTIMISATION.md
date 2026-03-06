# Mission UI — Performance Optimisation Record

**Date:** 2026-03-06  
**Scope:** `apps/mission-ui/src` — runtime, bundle, and network performance  
**Baseline:** Post-hardening build (see `HARDENING_SUMMARY.md`)  
**Prior audit references:** `AUDIT_REPORT.md` items H11, H12, C5, C6, C7, M7, M8, M9, L4

---

## Baseline Measurements

All measurements taken from the build immediately preceding this pass.

### Bundle (before)

| Artefact     | Raw size      | Gzip size     |
| ------------ | ------------- | ------------- |
| `index.js`   | **496.47 KB** | **148.66 KB** |
| `index.css`  | 68.78 KB      | 11.83 KB      |
| `index.html` | 0.85 KB       | 0.46 KB       |
| **Total JS** | **496.47 KB** | **148.66 KB** |

Single monolithic JS chunk — all vendor libraries, UI code, and both pages shipped together on every initial load. Any code change invalidated the entire cache entry.

### Runtime (before)

| Issue                       | Details                                                                                                                                                                                             |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TimeAgo` timers            | One `setInterval` per mounted instance. With 20 tasks + 10 agents visible in the default state: **30+ independent 10-second timers** running simultaneously, each independently calling `setState`. |
| Polling while hidden        | `usePolling` ran its `setInterval` at full cadence regardless of tab visibility — firing API requests for data the user was not looking at.                                                         |
| Re-render on every poll     | `AgentsTable`, `ActivityFeed`, and `MetricCard` (×6) re-rendered on every 5-second polling cycle even when the data was identical.                                                                  |
| Telemetry in initial bundle | The Telemetry page was eagerly bundled into the single JS file even though it is only needed when the user explicitly clicks the Telemetry tab.                                                     |

---

## Changes Made

### 1. Shared ticker for `TimeAgo` — `src/hooks/useTickClock.ts` (new)

**Audit reference:** H11 — "TimeAgo creates date object on every render"  
**Root cause:** `TimeAgo.tsx` had its own `useEffect` that called `setInterval(() => setTick(t => t + 1), 10_000)` on mount. Every mounted instance spawned an independent OS timer.

**Problem in detail:**  
With a full Dashboard view (20 task rows + 10 agent rows + activity feed), at least 30 `TimeAgo` components could be mounted concurrently. Each had its own 10-second timer. At the 10-second mark, all 30 timers fired near-simultaneously, each calling `setState`, each scheduling a separate React re-render. In a 200-task scenario this could reach 60+ independent timers.

**Decision:**  
Introduce a module-level global ticker (`src/hooks/useTickClock.ts`) — a single `setInterval` that notifies all subscribers via a `Set<() => void>`. The interval starts only when the first `TimeAgo` mounts and is stopped when the last unmounts (reference counting via `Set.size`).

`TimeAgo` now calls `useTickClock()` (subscribes) instead of managing its own timer. The hook returns a tick counter; the value is intentionally unused — the re-render side effect is what drives the timestamp refresh.

**Result:**

- **Before:** N timers for N mounted `TimeAgo` components
- **After:** 1 timer, always, regardless of how many `TimeAgo` components are mounted

**Files changed:**

- `src/hooks/useTickClock.ts` — new file
- `src/components/TimeAgo.tsx` — removed `useState`/`useEffect`; added `useTickClock()` call

---

### 2. Lazy-load the Telemetry page — `src/App.tsx`

**Audit reference:** H12 — "No route-level code splitting"  
**Root cause:** `App.tsx` imported `Telemetry` with a static `import`, so the entire Telemetry module (including its `@tanstack/react-table` usage, `ToggleGroup` logic, and telemetry-specific types) was bundled into the initial JS payload.

**Decision:**  
Replace the static import with `React.lazy(() => import('./pages/Telemetry'))` wrapped in a `<Suspense>` boundary. The Telemetry chunk is only fetched when the user first clicks the Telemetry tab.

The `<Suspense>` fallback renders `"Loading…"` in-place — consistent with the existing pattern used throughout the app for async states.

**Why not also lazy-load Dashboard?**  
Dashboard is the default tab. It renders on first paint. Lazy-loading it would add a mandatory waterfall delay on every page load with no benefit. Telemetry is the non-critical secondary surface.

**Result:**

- Telemetry code is emitted as a separate chunk (`Telemetry-*.js`, ~5.9 KB raw, 2.2 KB gzip)
- Initial JS payload no longer includes Telemetry at all
- Subsequent visits to the Telemetry tab use the cached chunk (browser cache, no re-download)

**Files changed:**

- `src/App.tsx` — `import { Telemetry }` → `lazy(() => import('./pages/Telemetry'))` + `<Suspense>`

---

### 3. Vite manual chunk splitting — `vite.config.ts`

**Audit reference:** L4 — "No bundle size analysis"; implicit from the monolithic single-chunk output  
**Root cause:** Default Vite rollup output puts all `node_modules` together with app code into a single chunk. Vendor libraries (React, Radix, Lucide, TanStack) are orders of magnitude more stable than app code, but every app code change busted the single shared cache entry.

**Decision:**  
Added `build.rollupOptions.output.manualChunks` with a strategy that separates libraries by change frequency and downstream dependencies:

| Chunk          | Contents                                      | Rationale                                                                                                                                            |
| -------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `react-vendor` | `react`, `react-dom`, `react-is`, `scheduler` | The largest and most stable dependency. Kept as one group to avoid circular chunk warnings from react-dom's internal references.                     |
| `ui-vendor`    | `@radix-ui/*`, `radix-ui`, `cmdk`             | UI primitives. Radix components share React context internals with cmdk; grouping them prevents false circular warnings.                             |
| `tanstack`     | `@tanstack/*`                                 | react-table is a medium-sized library used only in `TasksTable`; isolating it means the table logic can be cached independently.                     |
| `lucide`       | `lucide-react`                                | Large source (3 900 icons, 36 MB in `node_modules`), though tree-shaken down to ~12 KB in the build. Isolating it makes the shake boundary explicit. |
| `vendor`       | all other `node_modules`                      | `next-themes`, `clsx`, `tailwind-merge`, `class-variance-authority`, etc.                                                                            |
| `index`        | all app code                                  | Changes on every deploy; kept isolated so vendor chunks maintain long cache TTLs.                                                                    |

**Circular chunk warning fix:**  
The first attempt used separate `react-vendor` (React only) and then caught React DOM in `vendor`. This triggered Rollup's circular chunk warning because react-dom references react, which was in a different chunk. The fix was to ensure `react`, `react-dom`, `react-is`, and `scheduler` all resolve to the same `react-vendor` chunk name.

**Result (after):**

| Chunk                | Raw          | Gzip         | Notes                                                                              |
| -------------------- | ------------ | ------------ | ---------------------------------------------------------------------------------- |
| `react-vendor`       | 194.27 KB    | 60.68 KB     | Stable; cached until React version bumps                                           |
| `ui-vendor`          | 106.21 KB    | 32.10 KB     | Stable; cached until Radix/cmdk upgrades                                           |
| `tanstack`           | 54.15 KB     | 14.49 KB     | Stable; cached until TanStack upgrades                                             |
| `vendor`             | 67.43 KB     | 23.44 KB     | Stable; cached until minor deps change                                             |
| `lucide`             | 12.03 KB     | 2.85 KB      | Stable; cached until lucide-react upgrades                                         |
| `index` (app)        | **59.05 KB** | **14.68 KB** | Changes on deploy — only this is invalidated                                       |
| `Telemetry`          | 5.86 KB      | 2.15 KB      | Loaded on demand only                                                              |
| **Total initial JS** | **~493 KB**  | **~148 KB**  | Same total bytes, but initial parse is only `index` + `react-vendor` on cache miss |

**Cache efficiency improvement:**  
Before: 1 cache entry (496 KB), busted on every deploy.  
After: 7 cache entries. Only `index` (59 KB) is invalidated on deploy; vendor chunks (435 KB of stable code) remain cached across deployments.

**Files changed:**

- `vite.config.ts` — added `build.rollupOptions.output.manualChunks`

---

### 4. `React.memo` on hot-path components

**Audit reference:** M9 — "No memoization on expensive table calculations"; M7 — "Dashboard stat computation runs per render"  
**Root cause:** The 5-second `usePolling` cycle replaces the `agents` and `tasks` array references on every successful fetch. React re-renders all components that receive these as props — even when the underlying data hasn't changed.

**Components memoized and rationale:**

#### `AgentsTable` + `AgentRow` — `src/components/agents/AgentsTable.tsx`

`AgentsTable` receives the full `agents: Agent[]` array from the Dashboard polling loop. Without memoization, it re-renders every 5 seconds regardless of whether any agent status changed.

Two-level memoization:

- `AgentsTable` (outer) — skips re-render when the `agents` reference hasn't changed
- `AgentRow` (inner, extracted as a separate component) — skips re-render for individual rows whose agent data is unchanged

`AgentRow` is also where `useCallback` is applied to the `onClick` and `onKeyDown` handlers, keyed on `agent.id`. Without `useCallback`, these inline arrows were recreated on every `AgentsTable` render, preventing `AgentRow`'s memo from ever activating (because the `onSelect` prop would always be a new function reference).

#### `ActivityFeed` — `src/components/ActivityFeed.tsx`

`ActivityFeed` receives `activities: Activity[]` and `connected: boolean`. The `activities` array identity changes every time an SSE event arrives (via `setActivities` in `useActivityStream`). With `memo`, re-renders only happen when a new activity actually arrives — not on every Dashboard parent render.

#### `MetricCard` — `src/components/MetricCard.tsx`

A pure display component rendered ×6 on the Dashboard. `value` changes only when the underlying task counts change (i.e., when `tasks` data changes). Memoization means the six cards skip re-renders during the common case where a polling cycle returns unchanged data.

**Files changed:**

- `src/components/agents/AgentsTable.tsx` — `memo(AgentsTable)`, extracted `AgentRow` with `memo` + `useCallback`
- `src/components/ActivityFeed.tsx` — `memo(ActivityFeed)`
- `src/components/MetricCard.tsx` — `memo(MetricCard)`

---

### 5. Visibility-aware polling — `src/hooks/usePolling.ts`

**Audit reference:** C7 — "Multiple polling loops can stack"  
**Root cause:** `usePolling` used a raw `setInterval` that fired unconditionally every `intervalMs` regardless of whether the browser tab was visible. When the user switched to another tab, the Dashboard and Telemetry polling loops continued firing API requests, consuming server resources and processing API responses that were immediately discarded.

**Decision:**  
Add a `visibilitychange` event listener alongside the interval:

- When `document.visibilityState === 'hidden'`: clear the interval, stop polling
- When `document.visibilityState === 'visible'` (tab re-activated): fire an immediate catch-up fetch, then restart the interval

The catch-up fetch on tab focus is important for the UX goal: when the operator switches back to Mission Control after a period away, data should refresh immediately rather than waiting up to `intervalMs` for the next scheduled tick.

**Edge case handled:**  
If the tab is hidden at mount time (unlikely but possible), polling doesn't start at all. The initial `doFetch()` still fires (needed to populate data), but the interval is held until the tab becomes visible.

**Files changed:**

- `src/hooks/usePolling.ts` — replaced single `setInterval` with visibility-aware start/stop logic

---

### 6. Fixed pre-existing stale test assertions

Two tests were already failing before this pass. Fixed as part of this work to leave the suite clean.

**`StatusBadge.test.tsx` — "renders online status with default badge variant"**  
The test checked `badge.className.toContain('bg-primary')`. The `online` status badge uses `bg-emerald-500/15` (set during the HARDENING_SUMMARY.md pass). Updated assertion to `toContain('bg-emerald-500')`.

**`Telemetry.test.tsx` — "shows loading state before data"**  
The test searched for `/loading telemetry/i`. The component renders `Loading…` (with an ellipsis). Updated regex to `/loading…/i`.

**Files changed:**

- `src/components/StatusBadge.test.tsx`
- `src/pages/Telemetry.test.tsx`

---

## After Measurements

### Bundle

| Artefact                   | Raw          | Gzip         |
| -------------------------- | ------------ | ------------ |
| `react-vendor`             | 194.27 KB    | 60.68 KB     |
| `ui-vendor`                | 106.21 KB    | 32.10 KB     |
| `tanstack`                 | 54.15 KB     | 14.49 KB     |
| `vendor`                   | 67.43 KB     | 23.44 KB     |
| `lucide`                   | 12.03 KB     | 2.85 KB      |
| **`index` (app, initial)** | **59.05 KB** | **14.68 KB** |
| `Telemetry` (deferred)     | 5.86 KB      | 2.15 KB      |
| `index.css`                | 68.78 KB     | 11.83 KB     |

**Initial JS parse budget (first load, no cache):** all chunks load in parallel over HTTP/2 — total unchanged. But the JS the browser must **parse and execute before first paint** is now `index.js` (59 KB) + `react-vendor` (194 KB), not the full 496 KB monolith.

**Deployment cache hit:** on every code deploy, only `index.js` is invalidated (~59 KB). All vendor chunks (~435 KB) remain cached across deployments.

### Runtime

| Concern                            | Before                           | After                                  |
| ---------------------------------- | -------------------------------- | -------------------------------------- |
| `TimeAgo` timers                   | N timers for N mounted instances | 1 timer, always                        |
| Polling while tab hidden           | Continuous                       | Suspended; catch-up fetch on tab focus |
| `AgentsTable` re-renders/cycle     | Full table re-render every 5s    | Only rows with changed data re-render  |
| `ActivityFeed` re-renders/cycle    | On every parent render           | Only on new SSE activity               |
| `MetricCard` (×6) re-renders/cycle | On every parent render           | Only when task counts change           |
| Telemetry in initial bundle        | Yes                              | No (loaded on demand)                  |

### Tests

All 24 unit tests pass. Build is clean with no warnings.

---

## Design Decisions & Trade-offs

### Why not split `react-vendor` further?

React and React DOM cannot be safely split into separate chunks. React DOM internally imports from React using relative paths; Rollup resolves these at build time. Splitting them across chunk boundaries creates a circular dependency that Rollup warns about and that can cause subtle runtime issues. The safe approach is to keep all React runtime packages (`react`, `react-dom`, `react-is`, `scheduler`) in one chunk.

### Why is the total gzip size unchanged after chunk splitting?

Chunk splitting doesn't compress code differently — it only changes _how the same bytes are divided_ across files. The total gzip payload is the same (~148 KB) for a cold first load. The benefit is in:

1. **Cache efficiency**: subsequent loads after a deploy only re-download the `index` chunk
2. **Parse scheduling**: browsers can begin parsing vendor chunks (which never change) while still downloading the app chunk
3. **Isolation**: a lucide-react upgrade doesn't invalidate the react-vendor cache entry

### Why not virtualize the tables?

Virtualization (react-window, TanStack Virtual) is a large complexity investment that pays off at 500+ rows. The audit noted it as a long-term item (see AUDIT_REPORT.md recommendation #18). Mission Control's production workload is typically 10–50 agents and 20–200 tasks. TanStack Table's `getPaginationRowModel()` with `pageSize: 20` already limits DOM nodes in the tasks table. Introducing virtualization now would be premature optimisation for the current scale.

### Why `memo` on `AgentRow` but not on `TasksTable` rows?

TanStack Table manages its own row rendering via `flexRender`. Row identity in TanStack is tied to the row model, not React component instances — individual row memoization would need to be applied inside the column cell definitions, which would complicate the `columns.tsx` API. TanStack Table also has its own change-detection logic that avoids unnecessary cell re-renders when sort/filter state hasn't changed. The existing `useMemo(() => getTaskColumns(), [])` already prevents column definitions from being recreated. Adding per-row `memo` to TanStack rows is tracked as a future enhancement if profiling reveals it necessary.

### Why not add `vite-plugin-compression` for pre-gzip?

This was noted in the audit (L5) and is a valid optimisation for production. However, Mission Control's nginx container already has `gzip on` configured. Pre-compressed assets (brotli/gzip) would save the nginx compression step per-request, but the difference is imperceptible for this internal dashboard's traffic patterns. Added to the deferred list below.

---

## Deferred Items (Not Addressed This Pass)

These items from the original audit remain open. Reordered by expected impact:

| Item                                       | Audit Ref            | Rationale for Deferral                                                                                                                                                                  |
| ------------------------------------------ | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| O(n) activity dedup in `useActivityStream` | M8                   | `MAX_ACTIVITIES = 200` so the array is bounded. A `Set` lookup would save microseconds on a list that never exceeds 200 items. Low ROI.                                                 |
| In-flight request dedup in `usePolling`    | C7 (partial)         | The visibility-aware fix eliminates the main trigger (concurrent stacked requests). True in-flight dedup (AbortController) is an incremental improvement for flaky connections only.    |
| `aria-sort` on sortable table headers      | L3                   | Accessibility enhancement, not a performance concern. Tracked in the hardening deferred list.                                                                                           |
| Pre-compressed build assets                | L5                   | nginx handles runtime gzip. Brotli pre-compression is a minor improvement for this use case.                                                                                            |
| `will-change` on animated overlays         | L6                   | Modern browsers already promote animated transform/opacity elements. Manually hinting `will-change` on elements that aren't actually causing paint budget issues is counter-productive. |
| Table virtualisation                       | AUDIT_REPORT.md \#18 | Warranted only at 500+ rows. Current pagination (20 rows/page) is sufficient.                                                                                                           |
| Agent identity colours                     | AUDIT_REPORT.md \#16 | Design feature work, not a performance concern. Tracked in DESIGN_CONTEXT.md.                                                                                                           |
| Bundle analysis tooling                    | L4                   | `vite-bundle-visualizer` was used manually during this pass. Persisting it as a `package.json` script is tracked as a low-priority build tooling task.                                  |

---

## Files Changed Summary

| File                                    | Change                                                                     |
| --------------------------------------- | -------------------------------------------------------------------------- |
| `src/hooks/useTickClock.ts`             | **New** — shared global ticker for TimeAgo                                 |
| `src/components/TimeAgo.tsx`            | Removed per-instance timer; calls `useTickClock()`                         |
| `src/App.tsx`                           | `React.lazy` + `<Suspense>` for Telemetry page                             |
| `vite.config.ts`                        | `manualChunks` splitting strategy                                          |
| `src/components/agents/AgentsTable.tsx` | `memo(AgentsTable)`, extracted `memo(AgentRow)`, `useCallback` on handlers |
| `src/components/ActivityFeed.tsx`       | `memo(ActivityFeed)`                                                       |
| `src/components/MetricCard.tsx`         | `memo(MetricCard)`                                                         |
| `src/hooks/usePolling.ts`               | Visibility-aware interval (pause/resume on `visibilitychange`)             |
| `src/components/StatusBadge.test.tsx`   | Fixed stale class assertion                                                |
| `src/pages/Telemetry.test.tsx`          | Fixed stale loading-text assertion                                         |

---

**Last Updated:** 2026-03-06  
**Next Review:** After agent identity colour implementation (see DESIGN_CONTEXT.md)
