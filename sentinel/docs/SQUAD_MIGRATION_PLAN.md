# Squad Migration Plan — Sentinel × Flare Squads

> **Date:** 2026-02-27 (updated 2026-02-28)
> **Status:** Phase 2 in progress — Sentinel code complete (new agents, `/standup`, `/report`), pending OpenClaw agent setup + deployment
> **Goal:** Restructure the Flare Discord server to support the Growth Squad multi-agent workflow, remove stale channels, and improve how agents format output across channels.

---

## 1) Current State

**Server:** 4 categories, 17 channels (13 text, 4 voice)
**Agents:** 1 (Corven), model `gpt-5.2`
**OpenClaw:** Single binding (`discord → corven`), `groupPolicy: allowlist`, `requireMention: false`, no per-channel config
**Sentinel:** Fully built, all phases complete. Thread-based sessions via `/corven`.

**Usage pattern:** Filipe mostly uses `#corven` (freeform 1:1) and occasionally `#journal`. The PERSONAL and WORK categories have 10+ channels that sit unused. The server was designed for a future with team members and multiple agents — that future is now the Growth Squad.

---

## 2) What's Stale (Remove)

| Channel            | Category | Reason                                               |
| ------------------ | -------- | ---------------------------------------------------- |
| `#finance`         | PERSONAL | Financial planning doesn't happen in Discord threads |
| `#reminders`       | PERSONAL | Corven handles reminders via DM/WhatsApp             |
| `#health`          | PERSONAL | ADHD strategies live in workspace `MEMORY.md`        |
| `#journal`         | PERSONAL | Personal reflections happen via DM/WhatsApp          |
| `#marketing`       | WORK     | Superseded by squad-specific `#growth`               |
| `#operations`      | WORK     | Superseded by squad-specific `#ops`                  |
| `#tasks`           | WORK     | Task tracking belongs in Notion (Mission Control)    |
| `#agent-sandbox`   | AGENTS   | Testing phase complete, Corven is stable             |
| `#agent-to-agent`  | AGENTS   | No multi-agent comms yet; replaced by `#squad-feed`  |
| `Voice — Personal` | PERSONAL | Unused                                               |
| `Voice — Work`     | WORK     | Unused                                               |

**Keep as-is:**

- `#research` (WORK → SQUADS) — carried over, repurposed as blog-roll
- `#corven` (AGENTS) — freeform 1:1
- `Voice — Corven` (AGENTS) — voice works
- `#audit-log` (META) — infrastructure

**Remove entire categories:**

- 🧠 PERSONAL — removed entirely (all channels stale)
- 💼 WORK — replaced by 🚀 SQUADS

---

## 3) New Architecture

```
Flare
│
├── 🤖 AGENTS (pos 0)
│   ├── #corven          ← freeform 1:1 with Corven (personal companion)
│   └── 🔊 Voice — Corven
│
├── 🚀 SQUADS (pos 1)
│   ├── #growth          ← campaigns, outbound, ICP, lead lists
│   ├── #content         ← posts, copy, CTAs, content calendar
│   ├── #ops             ← checklists, tracking, weekly reports
│   ├── #research        ← blog-roll style: compact research summaries
│   └── #squad-feed      ← daily standups, agent status, Mission Control visibility
│
└── 🔧 META (pos 2)
    └── #audit-log
```

PERSONAL category and all its channels (`#journal`, `#finance`, `#reminders`, `#health`, voice) are removed entirely. The server starts with AGENTS at the top.

### Permissions

| Category  | `@everyone` | `@Guest` | `@Team` | `@Agent` | `@Corven` | `@Admin` | `@Owner` |
| --------- | ----------- | -------- | ------- | -------- | --------- | -------- | -------- |
| 🤖 AGENTS | ❌          | ❌       | ❌      | ❌\*     | ✅\*      | ❌       | ✅       |
| 🚀 SQUADS | ❌          | ❌       | ✅      | ❌\*     | ✅        | ✅       | ✅       |
| 🔧 META   | ❌          | ❌       | ❌      | ❌\*     | ❌        | ✅       | ✅       |

`*` = per-channel overwrites (same pattern as current setup)

---

## 4) Output Formatting Strategy

### The Problem

Agent output in Discord is a wall of markdown that's hard to scan — especially for repeated deliverables like research summaries, weekly reports, or lead lists. Discord has a 2000-char message limit and markdown rendering, but no native "card" layout for plain messages.

### Two Formatting Modes

The server has two types of content that need different treatment:

| Mode                     | Channels                           | Why                                                                                                               |
| ------------------------ | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Blog-roll** (markdown) | `#research`, `#growth`, `#content` | Agent-authored deliverables. One item = one message. Compact, scannable, copy-pasteable. The text IS the product. |
| **Dashboard** (embeds)   | `#squad-feed`, `#ops`              | Coordination & status. Multi-agent aggregation, metrics, color-coded sections. The structure IS the product.      |

### Blog-Roll Mode (Markdown)

Agents post plain-text messages following a strict template enforced by the channel's `systemPrompt`. Each deliverable is a single message, under 1500 chars, following a consistent skeleton:

```
## {emoji} {Title}
> {One-line takeaway}

{metadata line(s)}

{2-4 sentence body}

-# {timestamp} · via {agent}
```

This generalizes across content types — research, campaigns, content drafts, lead lists. The skeleton stays the same; only the metadata and body change per channel.

**Why markdown, not embeds:** The output in these channels is often copy-pasted into Notion, emails, or DMs. Raw markdown survives the copy. Embed text doesn't — it loses structure when copied out of Discord. Also, the content itself (campaign copy, post text, research summary) should be readable as-is, not wrapped in chrome.

### Dashboard Mode (Rich Embeds)

The coordination channels (`#squad-feed`, `#ops`) aggregate status from multiple agents or track metrics. Here, **embeds** are the right tool:

- **One embed per agent** — color-coded sidebar, emoji title, structured fields
- **Up to 10 embeds per message** — a full standup in a single post
- **Inline fields for metrics** — rendered side-by-side (max 3 per row)
- **Non-inline fields for text** — full-width for lists and prose
- **Footer for metadata** — timestamp, agent attribution

The visual result: opening `#squad-feed` shows color-coded status cards at a glance. No scrolling through walls of text. Each agent's section is immediately identifiable by color.

### How Agents Post Embeds

OpenClaw agents can use the `message` tool to post structured content:

```json
{
  "action": "send",
  "channel": "discord",
  "to": "channel:<id>",
  "message": "📡 **Standup — 2026-02-27**",
  "embeds": [
    {
      "title": "🪶 Corven",
      "color": 15247484,
      "fields": [
        {
          "name": "✅ Completed",
          "value": "- Researched ICP\n- Generated leads",
          "inline": false
        },
        {
          "name": "🔄 In Progress",
          "value": "- Campaign brief",
          "inline": false
        },
        { "name": "🚫 Blocked", "value": "Nothing blocked", "inline": false }
      ],
      "footer": { "text": "Last active: 14:32 UTC" }
    }
  ]
}
```

The `systemPrompt` for dashboard channels instructs the agent to always use this tool instead of plain-text replies.

### Discord Embed Limits

| Property           | Limit      |
| ------------------ | ---------- |
| Title              | 256 chars  |
| Description        | 4096 chars |
| Fields             | 25 max     |
| Field name         | 256 chars  |
| Field value        | 1024 chars |
| Footer text        | 2048 chars |
| Author name        | 256 chars  |
| Total embed        | 6000 chars |
| Embeds per message | 10         |

### Implementation: Per-Channel `systemPrompt` (OpenClaw)

The primary lever is OpenClaw's per-channel system prompt:

```json5
guilds: {
  "<GUILD_ID>": {
    channels: {
      research: {
        allow: true,
        systemPrompt: "<blog-roll template rules>"
      },
      "squad-feed": {
        allow: true,
        systemPrompt: "<embed dashboard rules — use message tool with embeds>"
      }
    }
  }
}
```

For blog-roll channels, the prompt constrains markdown format. For dashboard channels, the prompt instructs the agent to use the `message` tool with `embeds` arrays.

### Chunking Controls

OpenClaw's Discord integration provides:

```json5
channels: {
  discord: {
    textChunkLimit: 2000,     // Discord's hard limit
    maxLinesPerMessage: 17,   // Default; splits long plain-text replies
    chunkMode: "newline",     // Prefer paragraph boundaries when splitting
  }
}
```

Blog-roll cards are ~10-15 lines, well under the default. Embeds bypass line-count splitting entirely.

---

## 5) Channel Templates

### Agent Color Registry

Each agent gets a fixed color for consistent embed identity across all dashboard channels:

| Agent         | Emoji | Color (hex) | Color (decimal) | Role                  |
| ------------- | ----- | ----------- | --------------- | --------------------- |
| Corven        | 🪶    | `#e8a87c`   | `15247484`      | Personal companion    |
| flare-growth  | 🎯    | `#3498db`   | `3447003`       | Pipeline & outbound   |
| flare-content | 📝    | `#1f8b4c`   | `2067276`       | Content marketing     |
| flare-ops     | 📋    | `#e67e22`   | `15105570`      | Operations & tracking |
| flare-leads   | 🔍    | `#9b59b6`   | `10181046`      | Lead list builder     |

Colors are used in embed sidebars and should be referenced in each agent's workspace `IDENTITY.md`.

---

### Blog-Roll Templates (Markdown)

#### `#research` — Research Card

```
## 📰 {Title}
> {One-line takeaway — the "so what"}

**Source:** [{domain}]({url})
**Tags:** `{tag1}` `{tag2}` `{tag3}`

{2-4 sentence summary. What was found, why it matters for Flare, and one actionable implication. No fluff.}

-# 🕐 {date} · via {agent}
```

#### `#growth` — Campaign Brief Card

```
## 🎯 {Campaign Name} — {Segment}
> {One-line positioning — what we're testing}

**Sprint:** {week/date range} · **Offer:** {Spark/Ignite} · **Status:** `{draft|active|paused|done}`

**ICP:** {one line}
**Country:** {Ireland/Portugal/both}

**DM (A):** {copy}
**DM (B):** {copy}

**Follow-ups:** Day 1 → {action} · Day 3 → {action} · Day 7 → {action}

-# 🕐 {date} · via {agent}
```

#### `#content` — Content Item Card

```
## 📝 {Post Title/Hook}
> **Type:** {post|anchor|story} · **Platform:** {IG|LinkedIn|both} · **CTA:** {Spark/Ignite/none}

{The actual copy — ready to post or adapt.}

-# 🕐 {date} · `{draft|approved|posted}`
```

#### Blog-Roll systemPrompt Rules

These rules are included in the `systemPrompt` for all blog-roll channels (adjusted per channel for the specific template):

```
Rules for this channel:
- ONE deliverable per message. Never combine multiple items.
- Total message must be under 1500 characters.
- Start with ## and emoji. Use blockquote (>) for the one-line takeaway.
- Tags: lowercase, no spaces, max 3, wrapped in backticks.
- Summary must answer: what, so what, now what.
- Footer uses -# (subtext) with timestamp and agent attribution.
- No preamble ("Here's what I found"), no sign-offs ("Let me know").
- If the deliverable has a source URL, include it. If not, omit the Source line.
```

---

### Dashboard Templates (Rich Embeds)

#### `#squad-feed` — Daily Standup

A single message containing **one embed per agent**. Each embed uses the agent's color, emoji, and a consistent three-field structure. The plain-text header provides the date.

**Message structure:**

```
📡 **Standup — {YYYY-MM-DD}**

[Embed 1: Agent A]  [Embed 2: Agent B]  [Embed 3: Agent C]  ...
```

**Embed per agent:**

```json
{
  "title": "🪶 Corven",
  "color": 15247484,
  "fields": [
    {
      "name": "✅ Completed",
      "value": "- Researched ICP for segment A\n- Generated 25 leads",
      "inline": false
    },
    {
      "name": "🔄 In Progress",
      "value": "- Campaign brief for Ireland hotels",
      "inline": false
    },
    { "name": "🚫 Blocked", "value": "Nothing blocked", "inline": false }
  ],
  "footer": { "text": "Last active: 14:32 UTC" }
}
```

**Full standup message (agent posts via `message` tool):**

```json
{
  "action": "send",
  "channel": "discord",
  "to": "channel:<squad-feed-id>",
  "message": "📡 **Standup — 2026-02-27**",
  "embeds": [
    {
      "title": "🪶 Corven",
      "color": 15247484,
      "fields": [
        {
          "name": "✅ Completed",
          "value": "- Reviewed sprint brief\n- Updated WORKING.md",
          "inline": false
        },
        {
          "name": "🔄 In Progress",
          "value": "- Waiting for segment approval",
          "inline": false
        },
        { "name": "🚫 Blocked", "value": "Nothing blocked", "inline": false }
      ],
      "footer": { "text": "Last active: 14:32 UTC" }
    },
    {
      "title": "🎯 flare-growth",
      "color": 3447003,
      "fields": [
        {
          "name": "✅ Completed",
          "value": "- Generated 25 leads (Ireland hotels)\n- A/B copy for segment A",
          "inline": false
        },
        {
          "name": "🔄 In Progress",
          "value": "- A/B copy for segment B",
          "inline": false
        },
        {
          "name": "🚫 Blocked",
          "value": "- Waiting on DM copy approval",
          "inline": false
        }
      ],
      "footer": { "text": "Last active: 14:15 UTC" }
    },
    {
      "title": "📝 flare-content",
      "color": 2067276,
      "fields": [
        {
          "name": "✅ Completed",
          "value": "- 3 posts drafted for next week",
          "inline": false
        },
        {
          "name": "🔄 In Progress",
          "value": "- Anchor post on hotel digital presence",
          "inline": false
        },
        { "name": "🚫 Blocked", "value": "Nothing blocked", "inline": false }
      ],
      "footer": { "text": "Last active: 13:50 UTC" }
    },
    {
      "title": "📋 flare-ops",
      "color": 15105570,
      "fields": [
        {
          "name": "✅ Completed",
          "value": "- Monday checklist distributed\n- Lead tracking template updated",
          "inline": false
        },
        {
          "name": "🔄 In Progress",
          "value": "- Compiling weekly report",
          "inline": false
        },
        { "name": "🚫 Blocked", "value": "Nothing blocked", "inline": false }
      ],
      "footer": { "text": "Last active: 14:00 UTC" }
    }
  ]
}
```

Each embed renders as a colored card with a sidebar in the agent's color. Scrolling through `#squad-feed` shows a clean feed of standup posts, each visually distinct. Thread replies under a standup serve as comments/discussion.

#### `#squad-feed` — Decision Log (Embed)

Important decisions can also be posted as embeds with a distinct format:

```json
{
  "title": "⚖️ Decision: {short title}",
  "color": 16776960,
  "description": "{What was decided and why, in 2-3 sentences.}",
  "fields": [
    {
      "name": "Context",
      "value": "{What triggered this decision}",
      "inline": false
    },
    {
      "name": "Alternatives Considered",
      "value": "- Option A\n- Option B",
      "inline": false
    },
    { "name": "Impact", "value": "{What changes as a result}", "inline": false }
  ],
  "footer": { "text": "2026-02-27 · decided by Filipe" }
}
```

Decisions use a **gold color** (`#ffff00` / `16776960`) to stand out from agent standups.

#### `#ops` — Weekly Report (Embed)

```json
{
  "title": "📋 Week of Feb 24–28",
  "color": 15105570,
  "description": "Growth squad weekly summary.",
  "fields": [
    { "name": "📊 DMs Sent", "value": "47 / 50", "inline": true },
    { "name": "📧 Emails Sent", "value": "38 / 50", "inline": true },
    { "name": "💬 Responses", "value": "12", "inline": true },
    { "name": "🔥 Sparks Booked", "value": "2", "inline": true },
    { "name": "📈 Response Rate", "value": "14%", "inline": true },
    { "name": "💰 Pipeline Value", "value": "€2,400", "inline": true },
    {
      "name": "Highlights",
      "value": "- Hotel segment responding well\n- Email B outperforming A by 2x",
      "inline": false
    },
    {
      "name": "Blockers",
      "value": "- Need updated case study for restaurants",
      "inline": false
    },
    {
      "name": "Next Week",
      "value": "1. Launch restaurant segment\n2. Refresh DM copy",
      "inline": false
    }
  ],
  "footer": { "text": "2026-02-28 · via flare-ops" }
}
```

Metrics use `inline: true` (rendered in rows of 3, side-by-side). Text sections use `inline: false` (full-width). This gives a clean dashboard feel.

#### `#ops` — Daily Checklist (Embed)

```json
{
  "title": "📋 Checklist — {YYYY-MM-DD}",
  "color": 15105570,
  "description": "Today's execution tasks (30-60 min).",
  "fields": [
    {
      "name": "Outbound",
      "value": "☐ Send 10 DMs (segment A)\n☐ Send 10 emails (segment A)\n☐ Follow-up Day 3 batch",
      "inline": false
    },
    {
      "name": "Content",
      "value": "☐ Post 1 (scheduled)\n☐ Engage 5 comments",
      "inline": false
    },
    {
      "name": "Admin",
      "value": "☐ Log responses in HubSpot\n☐ Update Notion board",
      "inline": false
    }
  ],
  "footer": { "text": "Generated by flare-ops" }
}
```

#### Dashboard systemPrompt Rules

These rules are included in the `systemPrompt` for all dashboard channels:

```
Rules for this channel:
- ALWAYS use the message tool with action "send" and an "embeds" array. Do NOT reply with plain text.
- Each embed MUST have: title (with emoji), color (decimal integer from the Agent Color Registry), and footer with timestamp + attribution.
- For standups: one embed per agent. Consistent 3-field structure: ✅ Completed, 🔄 In Progress, 🚫 Blocked.
- For reports: use inline fields for metrics (max 3 per row), non-inline for text sections.
- For decisions: use gold color (16776960). Include Context, Alternatives, Impact fields.
- Total embed content must stay under 6000 chars per embed.
- Plain-text message (above embeds) is a one-line date/title header only.
- Do NOT use components and embeds together in the same message.
- If you have more than 10 embeds, split across multiple messages.
- Thread replies under a standup/report serve as discussion — those CAN be plain text.
```

---

## 6) OpenClaw Config Changes

### Phase 1: Now (Corven only)

Enable `threadBindings` and add per-channel system prompts:

```json5
{
  session: {
    threadBindings: {
      enabled: true,
      ttlHours: 24,
    },
  },
  channels: {
    discord: {
      enabled: true,
      groupPolicy: 'allowlist',
      streaming: 'partial',
      replyToMode: 'first',
      dmPolicy: 'allowlist',
      allowFrom: ['408373729358512128'],
      threadBindings: {
        enabled: true,
        ttlHours: 24,
        spawnSubagentSessions: false,
      },
      guilds: {
        '<GUILD_ID>': {
          requireMention: false,
          channels: {
            research: {
              allow: true,
              systemPrompt: '<research blog-roll template prompt>',
            },
            growth: {
              allow: true,
              systemPrompt: '<campaign brief template prompt>',
            },
            content: {
              allow: true,
              systemPrompt: '<content calendar template prompt>',
            },
            ops: {
              allow: true,
              systemPrompt: '<ops report template prompt>',
            },
            'squad-feed': {
              allow: true,
              systemPrompt: '<daily standup template prompt>',
            },
          },
        },
      },
      voice: {
        enabled: true,
        tts: {
          provider: 'openai',
          openai: { voice: 'ash' },
        },
      },
    },
  },
}
```

**Important:** Once a `channels` map is defined inside a guild, **only listed channels are allowed**. We must also list channels where Corven should still respond:

```json5
channels: {
  corven: { allow: true },
  research: { allow: true, systemPrompt: "..." },
  growth: { allow: true, systemPrompt: "..." },
  content: { allow: true, systemPrompt: "..." },
  ops: { allow: true, systemPrompt: "..." },
  "squad-feed": { allow: true, systemPrompt: "..." },
}
```

### Phase 2: Multi-Agent (when squad agents are created)

```json5
agents: {
  list: [
    { id: "corven", default: true, workspace: "/home/filipefernandes/.openclaw/workspace-corven" },
    { id: "flare-growth", workspace: "/home/filipefernandes/.openclaw/workspace-flare-growth" },
    { id: "flare-content", workspace: "/home/filipefernandes/.openclaw/workspace-flare-content" },
    { id: "flare-ops", workspace: "/home/filipefernandes/.openclaw/workspace-flare-ops" },
  ]
},
bindings: [
  // Squad channels route by channel ID (peer match — highest priority)
  { agentId: "flare-growth", match: { channel: "discord", peer: { kind: "group", id: "<#growth-channel-id>" } } },
  { agentId: "flare-content", match: { channel: "discord", peer: { kind: "group", id: "<#content-channel-id>" } } },
  { agentId: "flare-ops", match: { channel: "discord", peer: { kind: "group", id: "<#ops-channel-id>" } } },
  // Everything else → Corven (fallback)
  { agentId: "corven", match: { channel: "discord" } },
]
```

---

## 7) Slash Commands

### Design Principles

1. **Commands are global, output is routed.** A command can be typed in any channel. Routed commands always land in the designated destination channel — no accidental reports in `#research`.
2. **Commands are by activity, not by entity.** `/session`, `/report`, `/decision`, `/standup` — verb-first. Parameters narrow the action.
3. **Commands are fire-and-forget.** You type the command with a prompt, hit enter, and the work starts in the right place. No navigating, no @mentioning, no "go" messages. You stay where you are.
4. **Every session command takes a `prompt`.** The prompt is the initial instruction to the agent. It also determines the thread name. No empty threads, no generic "New session" titles.

### Command Taxonomy

Commands fall into two categories based on where their output goes:

| Type           | Behavior                                              | Examples                                      |
| -------------- | ----------------------------------------------------- | --------------------------------------------- |
| **Contextual** | Output goes to the **current channel**                | `/session`                                    |
| **Routed**     | Output always goes to a **fixed destination channel** | `/corven`, `/standup`, `/decision`, `/report` |

### Command Routing Map

Defined in `server-architecture.ts`:

```typescript
export const commandRouting: Record<string, string | null> = {
  // Contextual
  session: null, // → current channel

  // Sector shorthands (routed to home channel)
  corven: 'corven', // → always #corven
  growth: 'growth', // → always #growth
  content: 'content', // → always #content
  ops: 'ops', // → always #ops
  leads: 'growth', // → always #growth (leads are a growth activity)

  // Activity commands (routed to destination)
  standup: 'squad-feed', // → always #squad-feed
  decision: 'squad-feed', // → always #squad-feed
  report: 'ops', // → always #ops
};
```

When a routed command is invoked from a different channel, Sentinel:

1. Creates the thread/embed in the **destination channel**
2. Replies ephemerally in the **invoking channel** with a link to the result

### Channel-to-Agent Default Map

When `/session` is used without an `agent` parameter, the default agent is resolved from the channel:

```typescript
export const channelAgentDefaults: Record<string, string> = {
  corven: 'corven',
  research: 'corven', // → flare-growth in Phase 2
  growth: 'corven', // → flare-growth in Phase 2
  content: 'corven', // → flare-content in Phase 2
  ops: 'corven', // → flare-ops in Phase 2
  'squad-feed': 'corven', // → coordinator agent in Phase 2
};
```

In Phase 1, everything maps to Corven (he's the only agent). In Phase 2, each squad channel maps to its dedicated agent.

### How Commands Trigger Agents (OpenClaw Gateway WebSocket RPC)

Every session command (those that create threads) must kick off the agent immediately — no @mentioning, no "go" message.

**The problem:** Sentinel is a bot. OpenClaw ignores bot messages (`allowBots: false`). So Sentinel can't just post the user's prompt in the thread and expect the agent to respond.

**The solution:** Sentinel connects to OpenClaw's Gateway WebSocket (protocol v3) on startup and uses the `agent` RPC method to trigger sessions with explicit delivery targets. HTTP `POST /hooks/agent` is kept as a fallback if the WebSocket is disconnected.

**Primary path — WebSocket RPC:**

```typescript
// Sentinel sends this via the persistent WS connection
await openclawWs.callAgent({
  message: prompt, // user's prompt
  agentId: resolvedAgent, // e.g. "corven", "flare-growth"
  channel: 'discord', // deliver via Discord
  to: `channel:${thread.id}`, // target the newly created thread
  threadId: thread.id, // explicit thread targeting
  deliver: true, // agent response goes to Discord
});
```

**Fallback — HTTP hooks:**

```typescript
// Used only when WebSocket is disconnected
await fetch(`http://127.0.0.1:${OPENCLAW_PORT}/hooks/agent`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${OPENCLAW_HOOKS_TOKEN}`,
  },
  body: JSON.stringify({
    message: prompt,
    agentId: resolvedAgent,
    channel: 'discord',
    to: `channel:${thread.id}`,
    deliver: true,
  }),
});
```

**Why WebSocket RPC over HTTP hooks:** The HTTP hooks path goes through `cron → announce → session resolution`, which can route to the wrong session (e.g. `agent:corven:main` instead of the target thread). The WebSocket `agent` RPC method accepts explicit `sessionKey`, `threadId`, and `deliver` params and uses the same delivery pipeline as normal Discord inbound messages — reliable thread delivery every time. See `docs/HOOKS_THREAD_DELIVERY_RESOLUTION.md` for the full root cause analysis.

**What happens:**

1. OpenClaw receives the prompt via WebSocket RPC
2. The agent processes it using its workspace, model, and tools
3. The response is delivered to the Discord thread
4. The user sees the agent's reply in the thread (no @mention needed)
5. Follow-up messages in the thread are handled normally by OpenClaw's Discord integration

**Requirements:**

- Sentinel needs `OPENCLAW_GATEWAY_TOKEN` (for WebSocket auth) and `OPENCLAW_HOOKS_TOKEN` (for HTTP fallback) as environment variables
- Sentinel needs `OPENCLAW_GATEWAY_PORT` (default `18789`)
- The OpenClaw gateway must be reachable from Sentinel's network (both run on the same host, so `127.0.0.1` works)
- Node.js ≥ 22 (built-in WebSocket, no `ws` package needed)

**Thread name derivation:** Sentinel truncates the prompt to ~80 chars, strips markdown/special chars, and uses it as the thread name. Examples:

- Prompt: `"build outbound sequence for Dublin hotels"` → Thread: `build outbound sequence for Dublin hotels`
- Prompt: `"write me a blog post about the impact of AI on hotel marketing based on the research you did yesterday"` → Thread: `write me a blog post about the impact of AI on hotel marketing based on the re…`

---

### Command Reference

#### `/session prompt [agent]` — Start an agent session (Phase 1)

**Type:** Contextual (thread created in current channel)

Creates a thread in the current channel, sends the prompt to the agent, and the agent starts working immediately. If no agent is specified, uses the channel's default agent.

```
/session prompt:"analyze competitor X pricing"
/session prompt:"draft quarterly OKRs" agent:corven
/session prompt:"research hotel segment in Dublin" agent:flare-growth
```

**Parameters:**

| Param    | Type                  | Required | Description                                                      |
| -------- | --------------------- | -------- | ---------------------------------------------------------------- |
| `prompt` | String                | Yes      | Initial instruction to the agent. Also used to name the thread.  |
| `agent`  | String (autocomplete) | No       | Agent to start session with. Defaults to channel's mapped agent. |

**Behavior:**

1. Resolve agent from param or `channelAgentDefaults[currentChannel]`
2. Validate agent has access to current channel (via `agentConfigs.accessibleCategories`)
3. Derive thread name from prompt (first ~80 chars, cleaned up)
4. Create thread in current channel with derived name
5. Add invoker + agent bot account to thread
6. Trigger agent via OpenClaw Gateway WebSocket RPC (`agent` method):
   - `message`: the user's prompt
   - `agentId`: resolved agent
   - `channel`: `discord`
   - `to`: `channel:<thread-id>`
   - `threadId`: `<thread-id>`
   - `deliver`: `true`
   - Falls back to HTTP `POST /hooks/agent` if WebSocket is disconnected
7. Reply ephemeral to invoker: "Session started → [thread link]"

The agent receives the prompt and responds in the thread. The user never needs to navigate to the thread or @mention anyone. They can continue reading in the current channel and check the thread when ready.

**Replaces:** The current "create empty thread + manual @mention" behavior.

#### `/corven prompt` — Quick session with Corven (Phase 1)

**Type:** Routed → `#corven`

Personal shortcut. Always creates a thread in `#corven`, regardless of where it's invoked. The prompt kicks off the conversation immediately.

```
/corven prompt:"help me think through the pricing for Ignite"
/corven prompt:"I'm feeling overwhelmed, let's talk"
```

**Parameters:**

| Param    | Type   | Required | Description                                              |
| -------- | ------ | -------- | -------------------------------------------------------- |
| `prompt` | String | Yes      | Initial message to Corven. Also used to name the thread. |

**Behavior:**

1. Find `#corven` channel by name
2. Derive thread name from prompt (first ~80 chars)
3. Create thread in `#corven`
4. Add invoker + Corven bot to thread
5. Trigger agent via OpenClaw Gateway WS RPC (`agentId: "corven"`, `threadId`, `message: prompt`)
6. Reply ephemeral: "Session with Corven → [thread link]"

**Why keep this separate from `/session`?** Muscle memory. Corven is the primary companion. `/corven` is a zero-thought "I want to talk to Corven" action. No channel context to think about.

#### `/growth prompt`, `/content prompt`, `/ops prompt` — Sector shorthands (Phase 1)

**Type:** Routed → `#growth`, `#content`, `#ops` respectively

Same pattern as `/corven` but for squad sectors. Each always creates a thread in its home channel with the channel's default agent and sends the prompt immediately.

```
/growth prompt:"build outbound sequence for Dublin hotels"
/content prompt:"write 3 Instagram posts for the Spark offer"
/ops prompt:"generate this week's checklist based on the pipeline"
```

**Parameters:**

| Param    | Type   | Required | Description                                        |
| -------- | ------ | -------- | -------------------------------------------------- |
| `prompt` | String | Yes      | Initial instruction. Also used to name the thread. |

**Behavior:** Same as `/corven` — find destination channel, derive thread name from prompt, create thread, add invoker + agent, trigger agent via WS RPC (HTTP fallback), reply ephemeral with link.

**Why per-sector shorthands?** Same reason as `/corven`: zero-thought delegation. You're reading `#research`, you have an idea for a campaign — `/growth prompt:"..."` and it's done. You stay where you are, the work starts in the right place.

**Scaling note:** Shorthands are added per sector, not per agent. The number of sectors is bounded by the business (growth, content, ops, etc.) and will cap naturally.

#### `/leads prompt` — Start a lead generation session (Phase 1)

**Type:** Routed → `#growth`

Shorthand for lead-building work. Creates a thread in `#growth` and kicks off a lead generation task.

```
/leads prompt:"build a list of 25 boutique hotels in Cork with Instagram presence"
/leads prompt:"enrich the Ireland hotel list with email addresses"
```

**Parameters:**

| Param    | Type   | Required | Description                                                |
| -------- | ------ | -------- | ---------------------------------------------------------- |
| `prompt` | String | Yes      | Lead generation instruction. Also used to name the thread. |

**Behavior:**

1. Find `#growth` channel
2. Derive thread name from prompt (first ~80 chars)
3. Create thread in `#growth`
4. Add invoker + agent (Corven → `flare-leads` in Phase 2)
5. Trigger agent via OpenClaw Gateway WS RPC with prompt (HTTP fallback)
6. Reply ephemeral: "Lead session started → [thread link]"

#### `/decision` — Log a decision (Phase 1)

**Type:** Routed → `#squad-feed`

Posts a structured decision embed to `#squad-feed`. Useful for recording choices that affect the squad, even before multi-agent is live.

```
/decision title:"Use segment A first" context:"Higher response rate in tests" impact:"Delay segment B by 1 week"
```

**Parameters:**

| Param          | Type   | Required | Description                          |
| -------------- | ------ | -------- | ------------------------------------ |
| `title`        | String | Yes      | Short decision title (max 256 chars) |
| `context`      | String | No       | What triggered this decision         |
| `alternatives` | String | No       | Other options considered             |
| `impact`       | String | No       | What changes as a result             |

**Behavior:**

1. Build embed (gold color `#ffff00` / `16776960`):
   - Title: `⚖️ Decision: {title}`
   - Fields: Context, Alternatives (if provided), Impact (if provided)
   - Footer: `{date} · decided by {invoker.displayName}`
2. Post embed to `#squad-feed`
3. Reply ephemeral in invoking channel: "Decision logged → [message link]"

#### `/standup [agent]` — Post standup (Phase 2)

**Type:** Routed → `#squad-feed`

Posts a standup embed to `#squad-feed`. In Phase 2, collects status from agents automatically.

```
/standup                      → multi-embed standup (all agents)
/standup agent:flare-growth   → single-agent standup
```

**Parameters:**

| Param   | Type                  | Required | Description                          |
| ------- | --------------------- | -------- | ------------------------------------ |
| `agent` | String (autocomplete) | No       | Specific agent. Omit for all agents. |

**Phase 1 behavior (manual):**
Posts a template standup embed that the user fills in via thread reply.

**Phase 2 behavior (automated):**

1. Query each agent's `WORKING.md` (or heartbeat status) for completed/in-progress/blocked
2. Build one embed per agent (agent color, emoji, 3-field structure)
3. Post multi-embed message to `#squad-feed`
4. Reply ephemeral: "Standup posted → [message link]"

#### `/report type` — Post structured report (Phase 2)

**Type:** Routed → `#ops`

Posts a structured report embed to `#ops`.

```
/report type:weekly           → weekly summary embed
/report type:checklist        → daily checklist embed
```

**Parameters:**

| Param  | Type                            | Required | Description |
| ------ | ------------------------------- | -------- | ----------- |
| `type` | Choice: `weekly` \| `checklist` | Yes      | Report type |

**Phase 1 behavior:** Posts a template embed with placeholder fields.

**Phase 2 behavior:** Pulls metrics from agent state / Notion and populates fields automatically.

---

### Full Command Table

| Command                       | Type              | Destination     | Phase | What it does               |
| ----------------------------- | ----------------- | --------------- | ----- | -------------------------- |
| `/session [agent]`            | Contextual        | Current channel | 1     | Start agent session thread |
| `/corven`                     | Sector shorthand  | `#corven`       | 1     | Quick session with Corven  |
| `/growth`                     | Sector shorthand  | `#growth`       | 1     | Quick session in growth    |
| `/content`                    | Sector shorthand  | `#content`      | 1     | Quick session in content   |
| `/ops`                        | Sector shorthand  | `#ops`          | 1     | Quick session in ops       |
| `/leads`                      | Sector shorthand  | `#growth`       | 1     | Lead generation session    |
| `/decision`                   | Activity (routed) | `#squad-feed`   | 1     | Log a decision (embed)     |
| `/standup [agent]`            | Activity (routed) | `#squad-feed`   | 2     | Post standup (embeds)      |
| `/report type`                | Activity (routed) | `#ops`          | 2     | Post report (embed)        |
| `/setup full\|update\|verify` | Infrastructure    | Ephemeral       | —     | Server management          |
| `/create`                     | Infrastructure    | Ephemeral       | —     | One-off creation           |
| `/assign`                     | Infrastructure    | Ephemeral       | —     | Role assignment            |
| `/permissions`                | Infrastructure    | Ephemeral       | —     | Permission management      |
| `/audit`                      | Infrastructure    | `#audit-log`    | —     | Dump server structure      |
| `/status`                     | Infrastructure    | Ephemeral       | —     | Bot health check           |

**Total:** 15 commands (well under Discord's 100 command limit per app).

### Command Categories

| Category              | Pattern                          | Scaling                     | Examples                                           |
| --------------------- | -------------------------------- | --------------------------- | -------------------------------------------------- |
| **Contextual**        | Work here, in this channel       | 1 command (generic)         | `/session`                                         |
| **Sector shorthands** | Go to that domain                | Bounded by business sectors | `/corven`, `/growth`, `/content`, `/ops`, `/leads` |
| **Activity**          | Do this thing, output goes there | Bounded by workflow types   | `/decision`, `/standup`, `/report`                 |
| **Infrastructure**    | Manage the server                | Fixed set                   | `/setup`, `/create`, `/assign`, etc.               |

Sector shorthands cap naturally. You add one when a new business domain is established, not when a new agent is created. The number of sectors is small and stable.

### Two Bots, Two Command Sets (unchanged)

- **Sentinel** registers (Phase 1): `/session`, `/corven`, `/growth`, `/content`, `/ops`, `/leads`, `/decision`, `/setup`, `/create`, `/assign`, `/permissions`, `/audit`, `/status`
- **Sentinel** will add (Phase 2): `/standup`, `/report`
- **OpenClaw** registers: `/activation`, `/model`, `/focus`, `/unfocus`, `/agents`

They coexist. OpenClaw's `/focus` and `/agents` complement `/session` — you can `/session` to start a thread, then `/focus` to bind it to a different agent mid-conversation.

---

## 8) Sentinel Code Changes

### Phase 1 (now)

1. **Update `server-architecture.ts`:**
   - Remove PERSONAL and WORK categories entirely
   - AGENTS stays at pos 0 (#corven, Voice — Corven)
   - Add SQUADS category (pos 1) with growth, content, ops, research, squad-feed
   - META becomes pos 2
   - Remove stale channels (journal, finance, reminders, health, marketing, operations, tasks, agent-sandbox, agent-to-agent, voice channels)
   - Add `commandRouting` and `channelAgentDefaults` maps

2. **Add OpenClaw integration (WebSocket RPC + HTTP fallback):**
   - `openclaw-ws.ts` — Gateway WebSocket client (connect, auth protocol v3, auto-reconnect)
   - `openclaw-client.ts` — Dual-path agent trigger (WS RPC primary, HTTP hooks fallback)
   - `deriveThreadName(prompt)` — truncate + clean prompt for thread name
   - Requires `OPENCLAW_GATEWAY_TOKEN`, `OPENCLAW_HOOKS_TOKEN`, and `OPENCLAW_GATEWAY_PORT` in environment

3. **Refactor `/corven prompt`** — mandatory prompt, route to `#corven`, trigger agent via WS RPC (HTTP fallback)

4. **Add `/session prompt [agent]`** — contextual, mandatory prompt, agent autocomplete, trigger via WS RPC

5. **Add sector shorthands** — `/growth prompt`, `/content prompt`, `/ops prompt`, `/leads prompt`

6. **Add `/decision`** — embed builder that posts to `#squad-feed`

7. **Update `deploy-commands.ts`** — register new slash commands

8. **Update `SERVER_ARCHITECTURE.md`** — sync with code changes

### Phase 2 (when multi-agent)

7. **Add `/standup` command** — multi-embed builder, pulls from agent state
8. **Add `/report` command** — embed templates for weekly/checklist
9. **Add `GuildForum` support to `ChannelConfig`** — future-proof for forum channels
10. **Update executors** — handle forum channel creation (tags, layout, sort order)

---

## 9) Forum Channels (Future Enhancement)

Discord Forum Channels (`ChannelType.GuildForum`) are a natural fit for:

- **`#squad-feed`** — each standup is a post, tagged by type (`standup`, `blocker`, `decision`)
- **`#research`** — each research item is a post, tagged by topic, browsable and sortable

Benefits over regular text channels:

- Every post IS a thread (no manual thread creation)
- Tags for filtering (`campaign`, `lead-list`, `weekly-report`)
- Default sort order (latest activity or creation date)
- Required initial message (forces context)

**Sentinel needs:** Add `GuildForum` to `ChannelConfig.type`, add `availableTags`, `defaultForumLayout`, `defaultSortOrder` fields. Update executors.

**OpenClaw needs:** Forum threads work like regular guild threads — session key is `agent:<agentId>:discord:channel:<threadId>`. Should work, needs testing.

**Interaction with routed commands:** `/standup` and `/decision` would create forum posts (with tags) instead of regular messages. The routing behavior stays the same — command triggers, output goes to the designated forum channel.

---

## 10) Execution Checklist

### Phase 1: Restructure + New Commands (now)

**Server structure:**

- [x] Update `server-architecture.ts`: remove PERSONAL + WORK, AGENTS (pos 0), SQUADS (pos 1), META (pos 2)
- [x] Add `commandRouting`, `channelAgentDefaults` to architecture config
- [x] Deploy Sentinel (`npm run build` + `./deploy.sh`)
- [ ] Run `/setup full clean:True` — removes old PERSONAL/WORK categories
- [ ] Verify structure (`/setup verify`)

**OpenClaw integration (WebSocket RPC + HTTP fallback):**

- [x] Add `OPENCLAW_GATEWAY_TOKEN`, `OPENCLAW_HOOKS_TOKEN`, and `OPENCLAW_GATEWAY_PORT` to Sentinel's environment
- [x] Implement `openclaw-ws.ts` — Gateway WebSocket client (protocol v3, auto-reconnect)
- [x] Implement `openclaw-client.ts` — Dual-path agent trigger (WS RPC primary, HTTP hooks fallback)
- [x] Implement `deriveThreadName()` helper — truncate prompt to ~80 chars, strip markdown
- [x] Connect WebSocket on startup (`src/index.ts`)
- [x] Fix `operator.write` scope in WS connect params (was missing, caused RPC failures)

**Slash commands:**

- [x] Refactor `/corven prompt` — route to `#corven`, mandatory prompt, trigger agent via WS RPC
- [x] Implement `/session prompt [agent]` — contextual, mandatory prompt, trigger agent via WS RPC
- [x] Implement sector shorthands with prompt (`/growth`, `/content`, `/ops`, `/leads`)
- [x] Implement `/decision` with embed builder
- [x] Register new commands (`./deploy.sh commands`)
- [x] Test: `/corven prompt:"..."` → thread in `#corven`, Corven responds _(tested, worked via HTTP fallback before scope fix)_
- [ ] Test: `/corven prompt:"..."` via WS RPC (after scope fix) → verify no fallback needed
- [ ] Test: `/growth prompt:"test"` from `#corven` → thread in `#growth`, agent responds
- [ ] Test: `/leads prompt:"test"` from anywhere → thread in `#growth`, agent responds
- [ ] Test: `/session prompt:"test"` in `#research` → thread in `#research`, Corven responds
- [ ] Test: `/decision title:"Test"` from `#corven` → embed in `#squad-feed`
- [ ] Verify: user can continue conversation in thread without @mentioning

**OpenClaw config:**

- [x] Enable `threadBindings`
- [x] Add per-channel `systemPrompt` entries for squad channels
- [x] Add explicit channel allowlist in guild config (corven, growth, content, ops, research, squad-feed)
- [x] Restart OpenClaw gateway
- [x] Fix cron job delivery targets — research jobs → `#research`, checkpoints → `#corven` (were pointing to deleted channels)
- [x] Update research cron prompts to use Research Card template
- [x] Remove 2 disabled legacy checkpoint cron jobs
- [ ] Test: Corven responds with blog-roll format in `#research`
- [ ] Test: Corven responds with campaign brief format in `#growth`

**Docs:**

- [x] Update `SERVER_ARCHITECTURE.md` — synced with new 3-category structure, commands, WS RPC
- [x] Update `README.md` — synced with new structure, commands, WS integration, project tree
- [x] Create `HOOKS_THREAD_DELIVERY_RESOLUTION.md` — root cause analysis + protocol reference
- [x] Delete stale docs (BUILD_PLAN.md, SESSION_SUMMARY.md, DISCORD_JS_REFERENCE.md, HOOKS_THREAD_DELIVERY_DEBUG_REPORT.md)
- [x] Move remaining docs to `docs/` directory
- [x] Update `SQUAD_MIGRATION_PLAN.md` — sync hook refs to WS RPC, update execution checklist

### Phase 2: Multi-Agent + Automation (when ready)

- [ ] Create squad agent workspaces + identities
- [ ] Add agents to OpenClaw config + peer-based bindings
- [ ] Update `channelAgentDefaults` to map squad channels to dedicated agents _(code ready, reverted to Corven until agents exist in OpenClaw)_
- [x] Implement `/standup` command (multi-embed, agent status collection via webhooks)
- [x] Implement `/report` command (weekly/checklist templates)
- [x] Add new agents to `agentConfigs` in Sentinel
- [ ] Run `/setup update`
- [ ] Set up heartbeats (staggered, 15 min)
- [ ] Set up daily standup cron job

### Phase 3: Forum Channels (when tested)

- [ ] Add `GuildForum` support to Sentinel type system
- [ ] Convert `#squad-feed` to forum channel
- [ ] Update `/standup` and `/decision` to create forum posts with tags
- [ ] Test OpenClaw response in forum threads
- [ ] Optionally convert `#research` to forum channel
