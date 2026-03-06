# Mission Control — Agent Design Context

## Design Context

### Users

**Who:** Single operator managing a personal fleet of AI agents for various tasks.

**Context:** Dashboard is always on (second monitor) for ambient awareness and active queue management. The user switches between glancing at status and actively managing the task queue — creating tasks, monitoring agent assignments, and drilling into comments/notifications when needed.

**Job to be done:** Orchestrate work across multiple AI agents with confidence. The interface must make it effortless to see what's happening, queue new work, and understand why something is blocked or failed — all while staying out of the way during normal operation.

### Brand Personality

**Modern, Minimal, Confident**

**Voice & Tone:**

- **Precise, not verbose** — Every element earns its space. Labels are concise. Actions are direct.
- **Technical but not cryptic** — Speaks the language of systems (states, assignments, heartbeats) without unnecessary abstraction.
- **Assured competence** — The interface doesn't apologize or over-explain. It presents information with quiet authority.

**Emotional Goals:**

- **Normal operation:** Technical precision — a calm, neutral surface that fades into the background. Nothing demands attention unnecessarily.
- **During issues:** Analytical focus — when something fails or blocks, the interface shifts to provide context and data without alarm. More detail, not louder volume.

### Aesthetic Direction

**Reference:** Linear — speed, typography, spacing, keyboard-first interactions, purposeful animations. The complete package.

**Visual Tone:**

- Clean information hierarchy with generous negative space
- Compact but breathable typography (text-xs/sm labels, clear headings)
- Subtle borders and elevation (no heavy shadows)
- Monochromatic foundation with strategic color for identity and activity
- Fast, responsive interactions with optimistic updates
- Purposeful micro-animations that aid comprehension

**Color Strategy:**

- **Foundation:** Neutral desaturated base (existing OKLCH palette) for structure
- **Semantic states:** Keep current color system (emerald=positive, blue=in-flight, amber=pending, red=error, muted=terminal)
- **Agent identity:** Each agent gets a distinct personality color for quick visual recognition across tasks, assignments, and notifications
- **Activity-driven intensity:** Visual weight and saturation respond to system load — busier fleet = slightly richer colors; idle state = more muted

**Anti-References:**

- No cluttered enterprise dashboards with excessive chrome or visual noise
- No generic admin templates or off-the-shelf aesthetics
- No overwhelming toolbars or option paralysis
- No retro terminal or cyberpunk affectations

### Design Principles

**1. Ambient First, Active When Needed**

The interface is designed for an always-on second monitor. Most of the time, it should provide ambient awareness without demanding attention. When action is required, the relevant information should come forward clearly, but never through alarm or urgency — through clarity and context.

_In practice:_ Neutral backdrop with semantic status colors. Agent identity colors provide visual landmarks. Activity-driven intensity means the dashboard "breathes" with the fleet's workload. No blinking, no red alerts, no modal interruptions unless explicitly invoked.

**2. Identity Through Color**

Agents are not interchangeable units — each has a distinct personality color that follows them across every surface: task assignments, activity feed entries, notification avatars, and agent detail views. This creates instant recognition and visual continuity.

_In practice:_ Generate or assign a unique hue for each agent on registration. Use consistent saturation/lightness adjusted for context (badges, avatars, table rows). Never rely on color alone — always pair with labels/icons for accessibility.

**3. Speed is a Feature**

Every interaction should feel instant. Loading states should be rare. Animations should be purposeful, not decorative — they should aid understanding of what changed and why.

_In practice:_ Optimistic updates for state transitions. SSE streaming for real-time activity. Keyboard shortcuts for common actions. Command palette for rapid navigation. Hover/focus states that respond without delay.

**4. Density with Clarity**

Pack a lot of information into a small space, but never at the expense of readability. Compact layouts, tabular numbers, and tight spacing — but with breathing room and clear hierarchy.

_In practice:_ Use text-xs/sm for labels and metadata. Reserve text-base for primary content. Rely on weight, color, and spacing to establish hierarchy. Generous padding within interactive elements. Tables with subtle zebra striping or hover highlights.

**5. Progressive Disclosure, Zero Hidden Affordances**

All interactive elements should be discoverable at a glance. Power user features (keyboard shortcuts, bulk actions) can be progressive, but basic affordances should never be hidden behind hover-only icons or unclear gestures.

_In practice:_ Buttons look like buttons. Links have underlines or clear hover states. Sheet/dialog triggers have explicit labels. Keyboard shortcuts are visible in tooltips and command palette. Drag-and-drop has clear visual feedback.

---

## Implementation Notes

### Color System

**Base Palette:** Continue using the existing OKLCH-based neutral system with CSS variables. No changes to structural colors.

**Semantic Status Colors:** No changes to existing StatusBadge implementation.

**Agent Identity Palette:**

Generate distinct agent colors on registration. Suggested hue distribution for up to 12 agents:

- 0° (red), 30° (orange), 60° (yellow), 90° (lime), 150° (green), 180° (cyan), 210° (blue), 240° (indigo), 270° (purple), 300° (magenta), 330° (pink), 360° (red-orange)

Use OKLCH with fixed lightness (60% light, 70% dark mode) and saturation (0.15-0.2 chroma) for consistency.

**Activity-Driven Intensity:**

Track active/in_progress task count and online agent count. Map to saturation multiplier:

- Idle (0-2 active tasks): 0.7x saturation (more muted)
- Normal (3-10): 1.0x saturation (baseline)
- Busy (11+): 1.2x saturation (richer)

Apply globally via CSS variable, re-calculate on task state change.

### Accessibility

- **WCAG 2.1 AA minimum** for all text contrast
- Agent identity colors must pass 3:1 contrast against background
- Never rely on color alone — always include text labels or icons
- Respect `prefers-reduced-motion` for all animations
- Ensure all interactive elements are keyboard accessible
- ARIA labels for status badges and icon-only buttons

### Typography

Continue using system font stack. No custom web fonts needed.

### Animation Principles

- **Duration:** 150-250ms for micro-interactions, 300-400ms for sheet/dialog transitions
- **Easing:** `ease-out` for entrances, `ease-in-out` for position changes
- **Purpose:** Animate only properties that aid comprehension (opacity, transform, color). No animation on layout shifts.
- **Reduced motion:** Disable all animations, preserve instant state changes.

---

**Last Updated:** 2026-03-06
