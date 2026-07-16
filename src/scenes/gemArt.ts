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

    // Enhanced variant: the same base gem shape plus a golden rim and an
    // extra glint, signaling +50% power.
    const enhKey = `gem-enh-${index}`;
    if (!scene.textures.exists(enhKey)) {
      const g = scene.make.graphics({ x: 0, y: 0 }, false);
      const trace = TRACERS[index] ?? traceCircle;
      const gold = 0xffd76a;

      g.fillStyle(lighten(color, 0.15), 0.18);
      trace(g, center, center, radius * 1.1);
      g.fillPath();

      g.fillStyle(darken(color, 0.35), 1);
      trace(g, center, center, radius);
      g.fillPath();

      const steps = 4;
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        g.fillStyle(lighten(color, t * 0.42), 1);
        trace(g, center - t * radius * 0.1, center - t * radius * 0.12, radius * (1 - t * 0.52));
        g.fillPath();
      }

      g.fillStyle(0xffffff, 0.3);
      g.fillEllipse(center - radius * 0.28, center - radius * 0.38, radius * 0.66, radius * 0.4);
      g.fillStyle(0xffffff, 0.75);
      g.fillCircle(center - radius * 0.34, center - radius * 0.42, radius * 0.1);

      // Extra glint: a small four-point sparkle upper-right, on top of the
      // usual highlight.
      g.fillStyle(0xffffff, 0.9);
      g.fillCircle(center + radius * 0.4, center - radius * 0.3, radius * 0.07);
      g.lineStyle(1.5, 0xffffff, 0.8);
      g.beginPath();
      g.moveTo(center + radius * 0.4 - radius * 0.16, center - radius * 0.3);
      g.lineTo(center + radius * 0.4 + radius * 0.16, center - radius * 0.3);
      g.moveTo(center + radius * 0.4, center - radius * 0.3 - radius * 0.16);
      g.lineTo(center + radius * 0.4, center - radius * 0.3 + radius * 0.16);
      g.strokePath();

      // Golden rim instead of the base gem's elemental rim.
      g.lineStyle(3, gold, 0.95);
      trace(g, center, center, radius);
      g.strokePath();

      g.generateTexture(enhKey, size, size);
      g.destroy();
    }

    // Bomb variant: a darkened core disc over the base gem, plus a small
    // fuse spark on top.
    const bombKey = `gem-bomb-${index}`;
    if (!scene.textures.exists(bombKey)) {
      const g = scene.make.graphics({ x: 0, y: 0 }, false);
      const trace = TRACERS[index] ?? traceCircle;

      g.fillStyle(darken(color, 0.35), 1);
      trace(g, center, center, radius);
      g.fillPath();

      // Darkened core disc.
      g.fillStyle(darken(color, 0.7), 0.92);
      g.fillCircle(center, center + radius * 0.08, radius * 0.62);
      g.fillStyle(darken(color, 0.5), 0.6);
      g.fillCircle(center, center + radius * 0.08, radius * 0.42);

      // Fuse: a short curved line from the top with a spark tip.
      g.lineStyle(2.5, 0x8a6a3a, 0.9);
      g.beginPath();
      g.moveTo(center, center - radius * 0.55);
      g.lineTo(center + radius * 0.18, center - radius * 0.82);
      g.strokePath();
      g.fillStyle(0xffcc33, 0.95);
      g.fillCircle(center + radius * 0.2, center - radius * 0.86, radius * 0.12);
      g.fillStyle(0xffffff, 0.85);
      g.fillCircle(center + radius * 0.2, center - radius * 0.86, radius * 0.05);

      // Rim line.
      g.lineStyle(2.5, lighten(color, 0.55), 0.9);
      trace(g, center, center, radius);
      g.strokePath();

      g.generateTexture(bombKey, size, size);
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

  // Petrified-cell texture: a gray rock with lighter facets and crack lines,
  // reusing the same procedural style/helpers as the elemental gems.
  if (!scene.textures.exists('gem-stone')) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    const stoneColor = 0x6b7280;

    // Soft outer shadow.
    g.fillStyle(darken(stoneColor, 0.5), 0.3);
    traceHexagon(g, center, center, radius * 1.08);
    g.fillPath();

    // Base rock silhouette.
    g.fillStyle(darken(stoneColor, 0.15), 1);
    traceHexagon(g, center, center, radius);
    g.fillPath();

    // Lighter facets (two triangular highlights).
    g.fillStyle(lighten(stoneColor, 0.2), 0.55);
    g.fillTriangle(
      center - radius * 0.3,
      center - radius * 0.5,
      center + radius * 0.2,
      center - radius * 0.6,
      center - radius * 0.05,
      center - radius * 0.05,
    );
    g.fillStyle(lighten(stoneColor, 0.35), 0.45);
    g.fillTriangle(
      center + radius * 0.1,
      center + radius * 0.2,
      center + radius * 0.55,
      center + radius * 0.05,
      center + radius * 0.3,
      center + radius * 0.55,
    );

    // Crack lines.
    g.lineStyle(2, darken(stoneColor, 0.55), 0.8);
    g.beginPath();
    g.moveTo(center - radius * 0.4, center - radius * 0.2);
    g.lineTo(center - radius * 0.05, center + radius * 0.05);
    g.lineTo(center + radius * 0.35, center - radius * 0.15);
    g.strokePath();
    g.beginPath();
    g.moveTo(center - radius * 0.1, center + radius * 0.05);
    g.lineTo(center + radius * 0.05, center + radius * 0.5);
    g.strokePath();

    // Rim.
    g.lineStyle(2.5, lighten(stoneColor, 0.3), 0.9);
    traceHexagon(g, center, center, radius);
    g.strokePath();

    g.generateTexture('gem-stone', size, size);
    g.destroy();
  }

  // Burning-cell underlay: an orange/red radial glow disc drawn as
  // concentric circles of decreasing radius and increasing alpha (brightest
  // at the center), rendered beneath the gem occupying the cell.
  if (!scene.textures.exists('cell-burning')) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    const glowRadius = TILE_SIZE * 0.48;
    const glowSize = Math.ceil(glowRadius * 2.2);
    const glowCenter = glowSize / 2;
    const rings = 5;
    for (let i = 0; i < rings; i++) {
      const t = i / (rings - 1); // 0 = outer edge, 1 = center
      const ringRadius = glowRadius * (1 - t * 0.75);
      const alpha = 0.12 + t * 0.5;
      const color = t < 0.5 ? 0xff6a00 : 0xffcc33;
      g.fillStyle(color, alpha);
      g.fillCircle(glowCenter, glowCenter, ringRadius);
    }
    g.generateTexture('cell-burning', glowSize, glowSize);
    g.destroy();
  }
}

/** The spark texture key for a gem element (falls back to the heart spark). */
export function sparkKeyFor(element: number): string {
  return `spark-${element >= 0 && element < GEM_COLORS.length ? element : HEART_TYPE}`;
}
