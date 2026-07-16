import Phaser from 'phaser';
import { GEM_COLORS, HEART_TYPE, TILE_SIZE } from '../game/constants';

/**
 * Procedural gem textures — no image assets. Each element gets a distinct
 * silhouette (fire=flame drop, water=orb, wood=hexagon, light=four-point
 * star, dark=crescent, heart=heart) with a faux radial gradient (concentric
 * lightening fills), a top-left specular highlight, and a rim line.
 *
 * Registers per-gem textures `gem-<i>` plus small `spark-<i>` dots used by
 * particle-style effects (match bursts, damage projectiles).
 */

/** Mixes a 0xRRGGBB color toward white by t (0-1). */
export function lighten(color: number, t: number): number {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  const mix = (ch: number) => Math.round(ch + (255 - ch) * t);
  return (mix(r) << 16) | (mix(g) << 8) | mix(b);
}

/** Mixes a 0xRRGGBB color toward black by t (0-1). */
export function darken(color: number, t: number): number {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  const mix = (ch: number) => Math.round(ch * (1 - t));
  return (mix(r) << 16) | (mix(g) << 8) | mix(b);
}

type ShapeTracer = (g: Phaser.GameObjects.Graphics, cx: number, cy: number, r: number) => void;

/** Flame-drop: pointed top, round belly. */
const traceFlame: ShapeTracer = (g, cx, cy, r) => {
  g.beginPath();
  g.moveTo(cx, cy - r * 1.05);
  // Right side: curve out to the belly.
  g.arc(cx, cy + r * 0.25, r * 0.75, -Math.PI * 0.35, Math.PI * 0.5, false);
  // Bottom to left side back up to the tip.
  g.arc(cx, cy + r * 0.25, r * 0.75, Math.PI * 0.5, Math.PI * 1.35, false);
  g.closePath();
};

const traceCircle: ShapeTracer = (g, cx, cy, r) => {
  g.beginPath();
  g.arc(cx, cy, r * 0.92, 0, Math.PI * 2);
  g.closePath();
};

const traceHexagon: ShapeTracer = (g, cx, cy, r) => {
  g.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 3;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
};

const traceStar4: ShapeTracer = (g, cx, cy, r) => {
  const inner = r * 0.32;
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 4;
    const radius = i % 2 === 0 ? r * 1.05 : inner;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
};

/** Crescent moon: outer arc plus a reversed inner arc from an offset circle. */
const traceCrescent: ShapeTracer = (g, cx, cy, r) => {
  const R = r * 0.98;
  g.beginPath();
  // Outer edge: sweep the long way around the left side.
  g.arc(cx, cy, R, -Math.PI * 0.42, Math.PI * 0.42, false);
  // Inner edge: carved by a circle offset to the upper-right.
  g.arc(cx + R * 0.55, cy, R * 0.78, Math.PI * 0.55, -Math.PI * 0.55, true);
  g.closePath();
};

const traceHeart: ShapeTracer = (g, cx, cy, r) => {
  const lobeR = r * 0.52;
  const lobeY = cy - r * 0.35;
  g.beginPath();
  g.moveTo(cx, cy + r * 0.95); // bottom tip
  // Left lobe.
  g.arc(cx - lobeR * 0.95, lobeY, lobeR, Math.PI * 0.75, -Math.PI * 0.02, false);
  // Right lobe.
  g.arc(cx + lobeR * 0.95, lobeY, lobeR, -Math.PI * 0.98, Math.PI * 0.25, false);
  g.closePath();
};

const TRACERS: ShapeTracer[] = [
  traceFlame, // 0 Fire
  traceCircle, // 1 Water
  traceHexagon, // 2 Wood
  traceStar4, // 3 Light
  traceCrescent, // 4 Dark
  traceHeart, // 5 Heart (HEART_TYPE)
];

/**
 * Registers `gem-<i>` and `spark-<i>` textures on the scene (idempotent).
 * Call from a scene's preload/create before building gem sprites.
 */
export function createGemTextures(scene: Phaser.Scene): void {
  const radius = TILE_SIZE * 0.4;
  const size = Math.ceil(radius * 2.4);
  const center = size / 2;

  GEM_COLORS.forEach((color, index) => {
    const gemKey = `gem-${index}`;
    if (!scene.textures.exists(gemKey)) {
      const g = scene.make.graphics({ x: 0, y: 0 }, false);
      const trace = TRACERS[index] ?? traceCircle;

      // Soft outer glow ring.
      g.fillStyle(lighten(color, 0.15), 0.18);
      trace(g, center, center, radius * 1.1);
      g.fillPath();

      // Base silhouette (darker rim color).
      g.fillStyle(darken(color, 0.35), 1);
      trace(g, center, center, radius);
      g.fillPath();

      // Faux radial gradient: concentric, lighter, drifting up-left.
      const steps = 4;
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        g.fillStyle(lighten(color, t * 0.42), 1);
        trace(g, center - t * radius * 0.1, center - t * radius * 0.12, radius * (1 - t * 0.52));
        g.fillPath();
      }

      // Specular highlight: soft ellipse + hot dot, upper-left.
      g.fillStyle(0xffffff, 0.3);
      g.fillEllipse(center - radius * 0.28, center - radius * 0.38, radius * 0.66, radius * 0.4);
      g.fillStyle(0xffffff, 0.75);
      g.fillCircle(center - radius * 0.34, center - radius * 0.42, radius * 0.1);

      // Rim line.
      g.lineStyle(2.5, lighten(color, 0.55), 0.9);
      trace(g, center, center, radius);
      g.strokePath();

      g.generateTexture(gemKey, size, size);
      g.destroy();
    }

    const sparkKey = `spark-${index}`;
    if (!scene.textures.exists(sparkKey)) {
      const g = scene.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(lighten(color, 0.25), 0.55);
      g.fillCircle(7, 7, 7);
      g.fillStyle(lighten(color, 0.55), 1);
      g.fillCircle(7, 7, 4.5);
      g.fillStyle(0xffffff, 0.95);
      g.fillCircle(7, 7, 2);
      g.generateTexture(sparkKey, 14, 14);
      g.destroy();
    }
  });
}

/** The spark texture key for a gem element (falls back to the heart spark). */
export function sparkKeyFor(element: number): string {
  return `spark-${element >= 0 && element < GEM_COLORS.length ? element : HEART_TYPE}`;
}
