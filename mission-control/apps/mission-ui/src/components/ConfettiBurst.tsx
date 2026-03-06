/**
 * ConfettiBurst — 12 CSS-animated confetti particles.
 *
 * Pure CSS. No canvas. No library. Each particle is a coloured <span>
 * that flies outward from the origin and fades over ~500–800ms.
 *
 * Usage: mount when a milestone is reached, unmount after ~900ms.
 * The parent is responsible for lifecycle (setTimeout + conditional render).
 *
 * Particle positions are deterministic — computed from index, not random —
 * so no hydration mismatches and no re-renders trigger different visuals.
 *
 * Colors: drawn from the semantic status palette + brand red.
 * Motion: only transform + opacity (GPU composited, no layout paint).
 * Reduced-motion: inherits the global prefers-reduced-motion rule — all
 * animation-duration collapses to 0.01ms, particles appear then immediately
 * vanish, which is fine (the milestone still registered).
 */
import type { CSSProperties } from 'react';

// 6 particle colours — alternates between brand and status palette
const COLOURS = [
  'oklch(0.62 0.214 27)', // brand red
  'oklch(0.527 0.154 150)', // success green
  'oklch(0.488 0.186 252)', // info blue
  'oklch(0.554 0.135 66)', // warning amber
  'oklch(0.62 0.214 27)', // brand red (repeat for density)
  'oklch(0.527 0.154 150)', // success green (repeat)
];

/** Generate particle motion values from its index (0-based). */
function particleStyle(i: number): CSSProperties {
  // Spread particles in a full circle by dividing 360° across 12 positions,
  // offset by 15° so no particle fires exactly horizontally or vertically.
  const angleDeg = (i / 12) * 360 + 15;
  const angleRad = (angleDeg * Math.PI) / 180;

  // Vary radius 40–80px based on whether index is even/odd
  const radius = i % 2 === 0 ? 72 : 52;

  const x = Math.round(Math.cos(angleRad) * radius);
  const y = Math.round(Math.sin(angleRad) * radius);

  // Rotation: alternates direction, scales with index
  const rot = i % 2 === 0 ? 90 + i * 15 : -(90 + i * 15);

  // Duration + delay: stagger slightly for an organic burst feel
  const dur = 500 + (i % 4) * 75; // 500, 575, 650, 725ms cycling
  const delay = (i % 3) * 30; // 0, 30, 60ms cycling

  const colour = COLOURS[i % COLOURS.length];

  return {
    '--confetti-x': `${x}px`,
    '--confetti-y': `${y}px`,
    '--confetti-rot': `${rot}deg`,
    '--confetti-dur': `${dur}ms`,
    '--confetti-delay': `${delay}ms`,
    backgroundColor: colour,
  } as CSSProperties;
}

const PARTICLES = Array.from({ length: 12 }, (_, i) => i);

export function ConfettiBurst() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 flex items-center justify-center"
    >
      {PARTICLES.map((i) => (
        <span
          key={i}
          className="absolute h-1.5 w-1.5 rounded-[1px] animate-confetti-burst"
          style={particleStyle(i)}
        />
      ))}
    </span>
  );
}
