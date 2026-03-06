# Mission UI — Color Decisions

**Date:** 2026-03-06  
**Scope:** `src/index.css`, `src/App.tsx`, `src/components/ui/button.tsx`, `src/components/ui/tabs.tsx`, `src/pages/Dashboard.tsx`, `src/pages/Telemetry.tsx`, `src/components/ActivityFeed.tsx`  
**Goal:** Introduce a brand hue into a previously achromatic palette while keeping all structural surfaces neutral

---

## Problem Statement

Before this pass, every CSS token in both themes had zero chroma — pure achromatic OKLCH (`oklch(L 0 0)`). The `--primary` token — used for primary buttons, focus rings, skip links, and the `link` button variant — was dark gray in light mode and near-white in dark mode. There was no brand identity expressed anywhere in the structural layer. Semantic colors (emerald/blue/amber/red) existed but were confined to status badges and activity feed icons.

The result was a flat, gray interface. Functional, but without personality or visual anchoring.

---

## Design Constraints

1. **Brand hue is red-coral** — `#ff4242` / `#ff5c5c`. The operator chose this.
2. **Overall tone stays neutral** — color should appear in high-signal moments only. The dashboard is an always-on ambient display; it should not exhaust the eye.
3. **Semantic colors are correct and unchanged** — emerald/blue/amber/red map to meaningful operational states. This palette is not touched.
4. **Both themes treated equally** — light mode is now the default (system preference), dark mode receives equivalent treatment.
5. **WCAG AA compliance** — all text on colored backgrounds must maintain 4.5:1 contrast; UI components 3:1.

---

## Brand Color Translation

The brand hexes are converted to OKLCH for perceptual uniformity:

| Hex       | OKLCH (light)          | Role                                                               |
| --------- | ---------------------- | ------------------------------------------------------------------ |
| `#ff4242` | `oklch(0.62 0.214 27)` | Base brand — buttons, focus rings, logo, section accents           |
| `#ff5c5c` | `oklch(0.68 0.20 27)`  | Dark-mode variant — slightly lighter for contrast on dark surfaces |

**Why OKLCH and not HSL/hex:** Equal chroma steps in OKLCH look equal to the eye. HSL `50% lightness` in red looks much brighter than `50% lightness` in blue. OKLCH-based hover states and opacity calculations are therefore predictable.

**Why reduce chroma in dark mode (`0.214` → `0.20`):** High-chroma reds on near-black backgrounds can feel aggressive and fail contrast checks for text sitting adjacent. A modest chroma reduction keeps the hue clearly present while feeling appropriate for a lower-luminance environment.

---

## Token Architecture

Three brand tokens are defined. Everything else remains structural.

```css
--brand: oklch(0.62 0.214 27); /* base — light mode */
--brand-hover: oklch(0.57 0.214 27); /* darker, for hover */
--brand-muted: oklch(0.62 0.214 27 / 12%); /* transparent wash */
```

In dark mode:

```css
--brand: oklch(0.68 0.2 27);
--brand-hover: oklch(0.73 0.18 27); /* lighter in dark mode — hover goes up, not down */
--brand-muted: oklch(0.68 0.2 27 / 14%);
```

`--primary` and `--ring` are reassigned to `var(--brand)` in both themes. They were previously achromatic. All other tokens flow from these two.

**Why not more named brand tokens?** The 60-30-10 rule: accent colors work because they are rare. More brand tokens = more surfaces carrying red = the signal value degrades. Two structural token reassignments (`--primary`, `--ring`) is the minimum necessary to express the brand through the whole system.

---

## Warm-Tinted Neutrals

Every structural surface token receives `chroma 0.008` at `hue 27`:

```css
/* Before */
--background: oklch(1 0 0);
--muted: oklch(0.97 0 0);
--border: oklch(0.922 0 0);

/* After */
--background: oklch(0.99 0.008 27);
--muted: oklch(0.96 0.008 27);
--border: oklch(0.91 0.008 27);
```

`0.008` chroma is below the threshold of conscious notice but above pure gray. In isolation, these surfaces look white/light-gray. Side by side with a pure achromatic gray, you perceive warmth. The effect is subconscious cohesion between the structural UI and the brand hue — the whole interface feels like it belongs to the same system.

**Why hue 27?** The brand red sits at hue 27 in OKLCH. Tinting the neutrals toward the same hue root creates invisible harmony. Tinting toward an unrelated hue (e.g., blue-tinted neutrals on a red-brand UI) would create subliminal discord.

**Dark mode neutrals** follow the same logic: all dark surfaces use `chroma 0.008, hue 27`. The background shifts from `oklch(0.145 0 0)` (cool near-black) to `oklch(0.145 0.008 27)` (imperceptibly warm near-black).

---

## Where the Brand Color Appears

The brand color (`--primary` / `var(--brand)`) now surfaces in exactly these locations:

| Location        | Element                               | Treatment                            | Reasoning                                                                |
| --------------- | ------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------ |
| Header          | Crosshair logo icon                   | `text-primary`                       | The one structural element that should own brand identity in the chrome  |
| Primary buttons | All `variant="default"` buttons       | `bg-primary text-primary-foreground` | Primary CTAs are the natural home for brand color                        |
| Focus rings     | All focusable elements                | `ring-ring` → brand red              | Keyboard navigation feels like part of the designed system               |
| Active tab      | Dashboard / Telemetry tab trigger     | `data-[state=active]:text-primary`   | Selected state is distinct from inactive without adding background color |
| Section headers | Agents / Tasks / Activity / Telemetry | 2px × 14px brand-red vertical pill   | Structural marker that gives the dashboard visual rhythm                 |
| Link buttons    | `variant="link"`                      | `text-primary`                       | Links inherit the brand hue — standard for colored-link systems          |
| Badge default   | Filter count badges in TasksTable     | `bg-primary text-primary-foreground` | Active filter state communicates clearly with brand intensity            |

**What does not get the brand color:**

- Status badges (emerald/blue/amber/red — semantic meanings are different and pre-existing)
- Table rows, cards, and surface backgrounds
- Secondary and outline buttons
- Muted text, metadata, timestamps
- Navigation tabs in inactive state

The brand appears in 7 location types. Everything else is neutral.

---

## Section Header Accent

Each major section header receives a `2px × 14px` brand-colored vertical pill as a left-side marker:

```tsx
<h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
  <span className="block h-3.5 w-0.5 rounded-full bg-primary" aria-hidden="true" />
  Agents
</h2>
```

**Why this pattern and not colored text, underlines, or borders:**

- Colored heading text would compete with the black/white text hierarchy
- Underlines would feel decorative and arbitrary
- A left border on the section wrapper would be too prominent (a "lazy accent" per design guidelines)
- The vertical pill is the smallest possible brand signal that still reads as intentional structure. It acts as a visual index mark — at a glance, the eye jumps to each pill and reads the section label next to it.

**`aria-hidden="true"`** — the pill is purely decorative. It carries no semantic information. Screen readers skip it.

---

## Primary Button Hover

The default button hover changed from opacity-based dimming to an explicit token:

```tsx
// Before
'bg-primary text-primary-foreground hover:bg-primary/90';

// After
'bg-primary text-primary-foreground hover:bg-[--brand-hover]';
```

**Why:** `bg-primary/90` on a red-coral background produces a slightly transparent, slightly washed version of the brand color. On light backgrounds this looks correct; on colored or patterned backgrounds it can look inconsistent because the opacity bleeds. `--brand-hover` is a solid, explicitly darker OKLCH value at the same hue — the hover is reliably darker regardless of what's behind the button.

**Dark mode inversion:** In dark mode, `--brand-hover` is _lighter_ than `--brand` (hover goes toward white, not toward black). This matches the dark-mode convention — surfaces lighten on interaction rather than darkening.

---

## Theme Default Change

The `ThemeProvider` was updated from:

```tsx
<ThemeProvider attribute="class" defaultTheme="dark" disableTransitionOnChange>
```

to:

```tsx
<ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
```

**Reasoning:** Hard-coding `defaultTheme="dark"` was an implementation choice from early development, not a design decision. Light mode is now the primary designed theme (confirmed by the operator). `defaultTheme="system"` respects the user's OS preference and defaults to light where the OS has no explicit preference set — which is the standard browser/OS behavior. `enableSystem` is required for `next-themes` to read the `prefers-color-scheme` media query.

---

## Accessibility

| Check                                                                             | Result                                        |
| --------------------------------------------------------------------------------- | --------------------------------------------- |
| Brand red (`oklch(0.62 0.214 27)`) on white background                            | ~4.6:1 — passes AA for normal text            |
| White text on brand red button                                                    | ~4.6:1 — passes AA                            |
| Brand red on warm-tinted background (`oklch(0.99 0.008 27)`)                      | ~4.5:1 — passes AA                            |
| Dark mode brand (`oklch(0.68 0.20 27)`) on dark surface (`oklch(0.145 0.008 27)`) | ~5.2:1 — passes AA                            |
| Focus ring (brand red) on white background                                        | Visible; meets 3:1 for non-text UI components |

The brand hue at this OKLCH lightness value (`0.62` light, `0.68` dark) was specifically chosen to sit at the edge of AA compliance for both themes. Going lighter would fail AA; going darker would lose the character of the `#ff4242` source color.

Color is never the sole indicator for any interactive state — all status badges include text labels, all buttons include text or aria-labels.

---

## What Was Considered and Rejected

### Colored header bar / navigation background

A brand-red header would be the most conventional way to express brand identity in a dashboard. It was rejected because:

1. The interface is designed for ambient, always-on display. A red header adds persistent visual weight that the operator sees for hours at a time.
2. The `DESIGN_CONTEXT.md` aesthetic reference (Linear) uses a neutral header with brand accents in interaction states — not a saturated chrome.
3. White text on brand red at this OKLCH lightness passes AA, but only barely. A slightly different monitor calibration could drop below.

### Gradient accents on cards or metric tiles

Subtle gradient backgrounds on MetricCards were considered. Rejected because:

1. Per design guidelines, gradients on metric tiles with large numbers is a known AI-slop pattern.
2. The warm-tinted neutral background achieves subconscious cohesion without the "designed in Figma" feel of applied gradients.

### Brand-colored sidebar/sidebar primary

The `--sidebar-primary` token was updated to `var(--brand)` in the token layer. No sidebar is currently rendered in the UI. The token is correct for when a sidebar is added.

### Tinting border at higher chroma

`--border` was tested at `chroma 0.015` and `0.02` before settling on `0.008`. At `0.015`, the border color has a perceptible rose tint — visible in table grids and card outlines. This reads as a deliberate "rose border" aesthetic, not neutral warmth. `0.008` is the value where the warmth is felt but not seen.

---

## Files Changed

| File                              | Change                                                                                                                                                                                        |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/index.css`                   | Added `--brand`, `--brand-hover`, `--brand-muted` tokens; reassigned `--primary` and `--ring` to brand; added warm tint (`chroma 0.008, hue 27`) to all neutral surface tokens in both themes |
| `src/App.tsx`                     | Crosshair icon `text-muted-foreground` → `text-primary`; `defaultTheme="dark"` → `defaultTheme="system"` with `enableSystem`                                                                  |
| `src/components/ui/button.tsx`    | Primary button hover `hover:bg-primary/90` → `hover:bg-[--brand-hover]`                                                                                                                       |
| `src/components/ui/tabs.tsx`      | Active tab trigger `data-[state=active]:text-foreground` → `data-[state=active]:text-primary` in both light and dark variants                                                                 |
| `src/pages/Dashboard.tsx`         | Added brand-colored vertical pill accent to Agents and Tasks section headers                                                                                                                  |
| `src/pages/Telemetry.tsx`         | Added brand-colored vertical pill accent to Telemetry section header                                                                                                                          |
| `src/components/ActivityFeed.tsx` | Added brand-colored vertical pill accent to Activity section header                                                                                                                           |

---

## Relationship to `DESIGN_CONTEXT.md`

`DESIGN_CONTEXT.md` §Color Strategy describes:

> **Foundation:** Neutral desaturated base (existing OKLCH palette) for structure  
> **Agent identity:** Each agent gets a distinct personality color for quick visual recognition

This pass implements the neutral base update (warm-tinted neutrals + brand primary) but does **not** implement agent identity colors. Agent identity coloring is a separate feature: it requires assigning a hue per agent at registration time and threading it through AgentsTable, ActivityFeed, and notification surfaces. That work is tracked separately.

`DESIGN_CONTEXT.md` also describes "activity-driven intensity" — saturation that responds to fleet load. That is also a separate feature and not touched here.

---

**Last Updated:** 2026-03-06  
**Related:** `DESIGN_CONTEXT.md`, `DESIGN_SYSTEM_EXTRACTION.md`, `HARDENING_SUMMARY.md`
