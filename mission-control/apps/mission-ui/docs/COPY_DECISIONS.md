# Mission Control UI — Copy Decisions

**Date:** 2026-03-06  
**Scope:** All user-facing text in `apps/mission-ui/src`  
**Author:** Claude Code (UX Copy Audit & Improvement)

---

## Voice & Tone Principles

These rules govern every string in the interface. They follow from the brand personality defined in [`DESIGN_CONTEXT.md`](./DESIGN_CONTEXT.md).

| Principle                     | Rule                                                                                                                         | Anti-pattern                                  |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| **Precise, not verbose**      | Every word earns its place. Cut adjectives and filler.                                                                       | "Please wait while we are loading your data…" |
| **Technical but not cryptic** | Use domain terms operators understand (agent, task, assignment). Avoid raw system internals (lease, requeue, state machine). | "Assignment expired (lease timeout)"          |
| **Active voice**              | Subject acts on object.                                                                                                      | "Task has been created"                       |
| **Sentence case everywhere**  | Labels, headings, buttons — all sentence case. Title Case only for proper nouns.                                             | "New Task", "Change State"                    |
| **Human error messages**      | Explain what happened, then what to do. Never blame the user.                                                                | "Error 401: Unauthorized"                     |
| **Consistent terminology**    | One term per concept, used everywhere. Don't vary for variety.                                                               | Using "State" and "Status" interchangeably    |

---

## Terminology Decisions

These are canonical term choices. Use these words and no others for these concepts.

| Concept                    | Canonical term             | Rejected alternatives          | Rationale                                                                                                                |
| -------------------------- | -------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Task lifecycle position    | **Status**                 | ~~State~~                      | "Status" is the word on every badge in the UI. "State" is a code/database term that leaks implementation.                |
| AI agents                  | **Agents**                 | ~~Fleet~~                      | "Fleet" is evocative internal jargon. "Agents" is what the API calls them and what operators understand.                 |
| Agent registration event   | **Registered**             | ~~Created~~                    | In context of an agent joining the system, "registered" is semantically precise. "Created" implies file/object creation. |
| Time range selector        | **Period**                 | ~~Window~~                     | "Window" is a technical term from telemetry/monitoring engineering. "Period" is plain language for a time range.         |
| Assignment that timed out  | **Timed out**              | ~~Expired~~, ~~lease timeout~~ | "Lease timeout" is pure implementation detail. "Timed out" is universally understood.                                    |
| Returning a task to queue  | **Returned to queue**      | ~~Requeued~~                   | "Requeued" is a system verb with no plain-language equivalent for most operators.                                        |
| Assigning work to an agent | **Task assigned to agent** | ~~Assignment offered~~         | "Offered" reflects the internal offer/accept handshake, which is invisible to operators.                                 |
| Column visibility control  | **Columns**                | ~~View~~                       | "View" is vague — it could toggle anything. "Columns" tells you exactly what the menu controls.                          |

---

## Empty State Rules

Empty states must never be dead ends. Each one:

1. States the situation in plain language.
2. Uses "yet" where the emptiness is temporary/expected (not an error).
3. Optionally explains what will populate it (if not obvious).

| Location                              | Empty state text                                           | Notes                                                                            |
| ------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Agents table                          | `No agents connected yet`                                  | "Connected" implies an expected transient state, not a missing registration.     |
| Activity feed                         | `No activity yet. Events will appear here as agents work.` | Two sentences: state + explanation of what to expect.                            |
| Agent assignments (in detail sheet)   | `No assignments yet`                                       | "Yet" signals normal — agent hasn't been given work.                             |
| Agent notifications (in detail sheet) | `No notifications yet`                                     | Same reasoning.                                                                  |
| Task table (no filters active)        | `No tasks yet.`                                            | Simple; the action to fix it (New task button) is visible above.                 |
| Task table (filters active)           | `No tasks match your filters.`                             | Context-aware: distinguishes "nothing exists" from "nothing passes your filter". |
| Task comments                         | `No comments yet`                                          | No period — consistent with other single-line empty states.                      |
| Telemetry table                       | `No data for this time period.`                            | References the "Period" selector the user just interacted with.                  |

---

## Loading State Rules

Loading states must name what is loading when multiple things can be loading on screen simultaneously.

| Location                          | Loading text              | Rationale                                                                                   |
| --------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------- |
| Telemetry tab (Suspense fallback) | `Loading Telemetry…`      | Names the tab being lazy-loaded.                                                            |
| Agent detail sheet (body)         | `Loading agent…`          | Distinguishes from task loading on the same screen.                                         |
| Task detail sheet (body)          | `Loading task…`           | Mirror of agent loading.                                                                    |
| Telemetry page (data)             | `Loading telemetry…`      | Scopes what the spinner is waiting for.                                                     |
| Agent detail sheet (description)  | `—` (em dash placeholder) | A "Loading…" in the subtitle position looks like a stuck state. A dash holds space cleanly. |

Generic `Loading…` (no noun) is acceptable only where it's unambiguous from context (e.g. a button that just says "Posting…" on the comment submit).

---

## Error Message Rules

Error messages follow this template:

> **[What happened]** — [What to do next (if actionable)]

Never:

- Use HTTP status codes as the user-facing title.
- Use passive voice ("An error was encountered").
- Blame the user ("You entered an invalid token").
- End without a next step for actionable errors.

| Error                      | Displayed title                           | Displayed body                                                                                    | What changed                                                                                                                       |
| -------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| API 401 (main)             | `API access token required`               | `Paste your agent token in the browser console, then reload the page:`                            | Removed internal product name prefix. Active verb. Named the tool (browser console).                                               |
| Telemetry API 401/403      | `Telemetry access token required`         | `Paste your telemetry token in the browser console, then reload the page:`                        | Same pattern as main API error.                                                                                                    |
| Telemetry API 503          | `Telemetry not configured on the server`  | `The server is missing its telemetry token. Set CONTROL_API_TELEMETRY_TOKEN and restart the API.` | "Unavailable" implied downtime; this is a config issue — name it precisely. Added "restart the API" as the concrete recovery step. |
| Telemetry generic          | `Something went wrong loading telemetry`  | _(error message from server)_                                                                     | "Telemetry error" is terse to the point of uselessness. Named what was loading.                                                    |
| Agent detail fetch failure | `Couldn't load agent details`             | _(error message from server)_                                                                     | "Failed to load" is system-speak. "Couldn't load" is conversational.                                                               |
| Task detail fetch failure  | `Couldn't load task details`              | _(error message from server)_                                                                     | Mirror of agent error.                                                                                                             |
| Create task failure        | `Couldn't create task. Please try again.` | —                                                                                                 | Adds actionable next step.                                                                                                         |

---

## Activity Feed Descriptions

Each event type maps to a human-readable string. Rules:

- Active voice with a human or system as subject.
- No internal lifecycle terminology (offer, expire, requeue, lease).
- Present tense where possible; past tense for completed actions.

| Event type             | Display string                  | Before                               | What changed                                                                       |
| ---------------------- | ------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------- |
| `agent.online`         | `Agent came online`             | _(unchanged)_                        | Already clear.                                                                     |
| `agent.offline`        | `Agent went offline`            | _(unchanged)_                        | Already clear.                                                                     |
| `task.created`         | `New task: {title}`             | `Task created: {title}`              | "New task" is how operators think about it. "Task created" sounds like a log line. |
| `task.state_changed`   | `Status changed: {from} → {to}` | `Task state: {from} → {to}`          | "State" → "Status" (consistent terminology). Added verb "changed" for clarity.     |
| `task.requeued`        | `Task returned to queue`        | `Task requeued`                      | Plain language for "requeued".                                                     |
| `assignment.offered`   | `Task assigned to agent`        | `Assignment offered`                 | "Offered" is internal handshake language. Operators care that a task got an agent. |
| `assignment.accepted`  | `Agent accepted task`           | `Assignment accepted`                | Active voice with human subject.                                                   |
| `assignment.completed` | `Agent completed task`          | `Assignment completed`               | Active voice with human subject.                                                   |
| `assignment.expired`   | `Assignment timed out`          | `Assignment expired (lease timeout)` | "Lease timeout" is pure implementation. "Timed out" is universally understood.     |
| `comment.created`      | `New comment added`             | `Comment posted`                     | More natural; removes passive "posted".                                            |

---

## Button & CTA Rules

- **Sentence case.** Always.
- **Verb + noun** for primary actions (`Create task`, `Post comment`, not `Submit`).
- **In-flight state:** append `…` to the verb (`Creating…`, `Posting…`). Never "Please wait" or "Loading".
- **Destructive confirm dialogs** (if added in future): button label must name the thing being destroyed (`Delete task`, not `Confirm` or `Yes`).

| Button                  | Label          | In-flight label |
| ----------------------- | -------------- | --------------- |
| Open create task dialog | `New task`     | —               |
| Submit create task form | `Create task`  | `Creating…`     |
| Submit comment          | `Post comment` | `Posting…`      |
| Dismiss dialog          | `Cancel`       | —               |
| Clear all table filters | `Clear all`    | —               |

---

## Section Label Rules

Section labels (the small all-caps micro-headers inside sheets and cards) follow these rules:

- **All-caps with `tracking-wider`** — this is a visual style decision, not a copy rule. The text itself is written in title case (capitalized in code, transformed by CSS).
- **Name the content type, not the UI action.** `Assignments` not `View Assignments`. `Assignment History` not `Past Assignments`.
- **Include counts when the list has variable length.** `Assignments (3)` tells the operator how much to expect before scrolling.
- **"Recent" is implied** — don't add it unless distinguishing from a separate "all time" section. (Removed from `Recent Assignments`.)

| Section                             | Label                      | Rationale                                                                  |
| ----------------------------------- | -------------------------- | -------------------------------------------------------------------------- |
| Agent capabilities                  | `Capabilities`             | Clear; no change.                                                          |
| Agent assignments in detail sheet   | `Assignments ({n})`        | Removed "Recent" — it's always recent by nature of showing 10 most recent. |
| Agent notifications in detail sheet | `Notifications ({n})`      | Same.                                                                      |
| Task status change control          | `Change Status`            | "State" → "Status" (consistent terminology).                               |
| Task active assignment              | `Current Assignment`       | Clear; no change.                                                          |
| Task assignment history             | `Assignment History ({n})` | Added "History" to distinguish from `Current Assignment` above it.         |
| Task comments                       | `Comments ({n})`           | Clear; no change.                                                          |

---

## Meta Field Labels

Meta fields (small labels for timestamps, IDs, configuration values) follow these rules:

- **No trailing colon on standalone lines** — use `Created: <value>` inline but `Created` as a standalone label.
- **Name the event, not the attribute.** "Registered" not "Created" for agents. "Last seen" not "Last heartbeat".
- **Prefer natural language for intervals.** `Heartbeat every 500ms` not `Heartbeat interval: 500ms`.

| Field                       | Label                   | Rationale                                                  |
| --------------------------- | ----------------------- | ---------------------------------------------------------- |
| Agent creation timestamp    | `Registered:`           | More accurate than "Created" for agent onboarding context. |
| Agent last_seen_at          | `Last seen:`            | Clear; no change.                                          |
| Agent heartbeat_interval_ms | `Heartbeat every {n}ms` | "Interval" is jargon. "Every Xms" reads naturally.         |
| Task created_at             | `Created:`              | Generic enough to be clear in task context.                |
| Task updated_at             | `Updated:`              | Clear; no change.                                          |

---

## Dashboard Section Headings

Headings on the main dashboard orient the operator to three distinct content areas. Each should be distinct in meaning with no overlap.

| Heading    | Rationale                                                                                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Agents`   | Replaces "Fleet". Names what the table contains.                                                                                                              |
| `Tasks`    | The single task section. Formerly "All Tasks" (to distinguish it from the now-removed "Task Summary" stat cards above it). The qualifier is no longer needed. |
| `Activity` | The live event feed. Formerly "Live Activity" — "Live" was an adjective that duplicated the Live/Reconnecting status indicator already in the header row.     |

> **Note:** The "Task Summary" metric cards section (six per-state counters) was removed in the 2026-03-06 simplification pass. See `SIMPLIFICATION_SUMMARY.md`. The `All Tasks` heading rationale is now moot; the heading is `Tasks`.

---

**Last Updated:** 2026-03-06
