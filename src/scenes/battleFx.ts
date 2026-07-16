import Phaser from 'phaser';
import { GEM_COLORS } from '../game/constants';
import { enemyEmoji } from '../game/enemyArt';
import { lighten, sparkKeyFor } from './gemArt';

/**
 * Scene-side battle presentation toolkit: themed gradient backgrounds,
 * tween-based spark bursts (portable, no ParticleEmitter dependency),
 * damage projectiles, wave/boss banners, and the enemy "sprite" (a large
 * emoji with entrance/idle/hit/lunge/death animations).
 */

// ---------------------------------------------------------------------------
// Themed background
// ---------------------------------------------------------------------------

export interface BattleTheme {
  top: number;
  bottom: number;
  ambient: number;
}

/** One theme per run floor: meadow, war camp, dragon lair. */
const THEMES: BattleTheme[] = [
  { top: 0x0d2b1c, bottom: 0x10131d, ambient: 0x2ecc71 },
  { top: 0x33190d, bottom: 0x10131d, ambient: 0xe67e22 },
  { top: 0x1d0f33, bottom: 0x10131d, ambient: 0x9b59b6 },
];

export function themeForChapter(chapterIndex: number): BattleTheme {
  return THEMES[Math.max(0, Math.min(chapterIndex, THEMES.length - 1))];
}

/** Per-campaign-branch backdrops: fire=embers, water=deep sea, wood/prologue=meadow, final=dragon lair. */
const BRANCH_THEMES: Record<string, BattleTheme> = {
  prologue: THEMES[0],
  fire: THEMES[1],
  water: { top: 0x0b2338, bottom: 0x10131d, ambient: 0x3498db },
  wood: THEMES[0],
  final: THEMES[2],
};

export function themeForBranch(branchId: string | undefined): BattleTheme {
  return (branchId && BRANCH_THEMES[branchId]) || THEMES[0];
}

/**
 * Fills the whole scene with a vertical gradient and slow-drifting ambient
 * motes. Call first in create() so everything else renders above it.
 */
export function drawThemedBackground(scene: Phaser.Scene, theme: BattleTheme): void {
  const { width, height } = scene.scale;
  const g = scene.add.graphics();
  g.fillGradientStyle(theme.top, theme.top, theme.bottom, theme.bottom, 1);
  g.fillRect(0, 0, width, height);

  // Ambient motes: soft dots drifting upward on endless loops.
  for (let i = 0; i < 14; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const mote = scene.add
      .circle(x, y, 1.5 + Math.random() * 2.5, lighten(theme.ambient, 0.3), 0.1 + Math.random() * 0.15)
      .setDepth(1);
    scene.tweens.add({
      targets: mote,
      y: y - 90 - Math.random() * 80,
      x: x + (Math.random() - 0.5) * 60,
      alpha: 0,
      duration: 6000 + Math.random() * 6000,
      delay: Math.random() * 4000,
      repeat: -1,
      onRepeat: () => {
        mote.y = height + 10;
        mote.x = Math.random() * width;
        mote.alpha = 0.1 + Math.random() * 0.15;
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Spark bursts & projectiles (tween-based "particles")
// ---------------------------------------------------------------------------

/**
 * Explodes a small spray of element-colored sparks at a point. Pass `tint`
 * to recolor the sparks (e.g. gray for a shattering stone) instead of using
 * the element's natural color.
 */
export function burstAt(
  scene: Phaser.Scene,
  x: number,
  y: number,
  element: number,
  count = 7,
  tint?: number,
): void {
  const key = sparkKeyFor(element);
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 40 + Math.random() * 90;
    const spark = scene.add
      .image(x, y, key)
      .setScale(0.7 + Math.random() * 0.7)
      .setDepth(140)
      .setBlendMode(Phaser.BlendModes.ADD);
    if (tint !== undefined) spark.setTint(tint);
    scene.tweens.add({
      targets: spark,
      x: x + Math.cos(angle) * speed,
      y: y + Math.sin(angle) * speed - 18, // slight upward bias
      scale: 0,
      alpha: 0.2,
      duration: 320 + Math.random() * 180,
      ease: 'Quad.easeOut',
      onComplete: () => spark.destroy(),
    });
  }
}

/**
 * Fires a glowing orb from one point to another along a curved arc.
 * Resolves when the orb arrives (caller then plays the impact).
 */
export function fireProjectile(
  scene: Phaser.Scene,
  from: { x: number; y: number },
  to: { x: number; y: number },
  element: number,
  delayMs = 0,
): Promise<void> {
  return new Promise((resolve) => {
    const orb = scene.add
      .image(from.x, from.y, sparkKeyFor(element))
      .setScale(2.2)
      .setDepth(160)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setVisible(false);

    // Curve control point: perpendicular offset from the midpoint.
    const midX = (from.x + to.x) / 2;
    const midY = (from.y + to.y) / 2;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const norm = Math.max(1, Math.hypot(dx, dy));
    const side = Math.random() < 0.5 ? 1 : -1;
    const bend = 40 + Math.random() * 50;
    const ctrlX = midX + (-dy / norm) * bend * side;
    const ctrlY = midY + (dx / norm) * bend * side;

    scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 340,
      delay: delayMs,
      ease: 'Sine.easeIn',
      onStart: () => orb.setVisible(true),
      onUpdate: (tween) => {
        const t = tween.getValue() ?? 0;
        const inv = 1 - t;
        orb.x = inv * inv * from.x + 2 * inv * t * ctrlX + t * t * to.x;
        orb.y = inv * inv * from.y + 2 * inv * t * ctrlY + t * t * to.y;
      },
      onComplete: () => {
        burstAt(scene, to.x, to.y, element, 5);
        orb.destroy();
        resolve();
      },
    });
  });
}

// ---------------------------------------------------------------------------
// Banners / splashes
// ---------------------------------------------------------------------------

/** Slides a horizontal banner through the center of the screen. */
export function showBanner(
  scene: Phaser.Scene,
  text: string,
  accentColor = 0x7dd3fc,
  holdMs = 650,
): Promise<void> {
  return new Promise((resolve) => {
    const { width, height } = scene.scale;
    const cy = height * 0.42;

    const strip = scene.add.rectangle(width / 2, cy, width, 66, 0x000000, 0.72).setDepth(250);
    const lineTop = scene.add.rectangle(width / 2, cy - 33, width, 2, accentColor, 0.9).setDepth(251);
    const lineBottom = scene.add.rectangle(width / 2, cy + 33, width, 2, accentColor, 0.9).setDepth(251);
    const label = scene.add
      .text(-width / 2, cy, text, {
        fontSize: '30px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(252);

    strip.setScale(1, 0);
    scene.tweens.add({ targets: strip, scaleY: 1, duration: 140, ease: 'Quad.easeOut' });
    scene.tweens.add({
      targets: label,
      x: width / 2,
      duration: 260,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        scene.time.delayedCall(holdMs, () => {
          scene.tweens.add({
            targets: [strip, lineTop, lineBottom, label],
            alpha: 0,
            duration: 220,
            onComplete: () => {
              strip.destroy();
              lineTop.destroy();
              lineBottom.destroy();
              label.destroy();
              resolve();
            },
          });
        });
      },
    });
  });
}

/** Big red BOSS splash: dark pulse + scale-in text + shake. */
export function showBossSplash(scene: Phaser.Scene): Promise<void> {
  return new Promise((resolve) => {
    const { width, height } = scene.scale;
    const overlay = scene.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0).setDepth(250);
    const label = scene.add
      .text(width / 2, height * 0.42, 'B O S S', {
        fontSize: '72px',
        color: '#ff4444',
        fontStyle: 'bold',
        stroke: '#2b0000',
        strokeThickness: 10,
      })
      .setOrigin(0.5)
      .setDepth(251)
      .setScale(3)
      .setAlpha(0);

    scene.tweens.add({ targets: overlay, fillAlpha: 0.55, duration: 200, yoyo: true, hold: 700 });
    scene.tweens.add({
      targets: label,
      scale: 1,
      alpha: 1,
      duration: 280,
      ease: 'Back.easeIn',
      onComplete: () => {
        scene.cameras.main.shake(180, 0.006);
        scene.time.delayedCall(650, () => {
          scene.tweens.add({
            targets: [label, overlay],
            alpha: 0,
            duration: 240,
            onComplete: () => {
              label.destroy();
              overlay.destroy();
              resolve();
            },
          });
        });
      },
    });
  });
}

/** Brief red vignette flash when the player takes a hit. */
export function flashDangerEdges(scene: Phaser.Scene): void {
  const { width, height } = scene.scale;
  const edge = scene.add.graphics().setDepth(240);
  edge.lineStyle(26, 0xff2222, 0.4);
  edge.strokeRect(6, 6, width - 12, height - 12);
  edge.lineStyle(10, 0xff2222, 0.6);
  edge.strokeRect(3, 3, width - 6, height - 6);
  scene.tweens.add({
    targets: edge,
    alpha: 0,
    duration: 380,
    ease: 'Quad.easeOut',
    onComplete: () => edge.destroy(),
  });
}

// ---------------------------------------------------------------------------
// Enemy sprite (emoji-based)
// ---------------------------------------------------------------------------

export class EnemySprite {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private glowOuter: Phaser.GameObjects.Arc;
  private glowInner: Phaser.GameObjects.Ellipse;
  private emojiText: Phaser.GameObjects.Text;
  private crown: Phaser.GameObjects.Text;
  private idleTween: Phaser.Tweens.Tween | null = null;
  private baseY: number;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene;
    this.baseY = y;

    this.glowOuter = scene.add.circle(0, 0, 62, 0xffffff, 0.12);
    this.glowInner = scene.add.ellipse(0, 44, 130, 30, 0x000000, 0.35);
    this.emojiText = scene.add.text(0, 0, '', { fontSize: '84px' }).setOrigin(0.5);
    this.crown = scene.add.text(0, -58, '👑', { fontSize: '30px' }).setOrigin(0.5).setVisible(false);

    this.container = scene.add.container(x, y, [
      this.glowInner,
      this.glowOuter,
      this.emojiText,
      this.crown,
    ]);
    this.container.setDepth(20);
  }

  get x(): number {
    return this.container.x;
  }

  get y(): number {
    return this.container.y;
  }

  /** Sets the look for a new enemy and plays the entrance animation. */
  spawn(enemy: { name: string; element: number; boss: boolean }): Promise<void> {
    this.stopIdle();
    const color = GEM_COLORS[enemy.element] ?? 0xffffff;
    this.emojiText.setText(enemyEmoji(enemy.name));
    this.emojiText.setFontSize(enemy.boss ? 116 : 84);
    this.crown.setVisible(enemy.boss);
    this.crown.setY(enemy.boss ? -78 : -58);
    this.glowOuter.setFillStyle(color, 0.16);
    this.glowOuter.setRadius(enemy.boss ? 82 : 62);

    this.container.setAlpha(0);
    this.container.setScale(0.2);
    this.container.y = this.baseY - 36;

    return new Promise((resolve) => {
      this.scene.tweens.add({
        targets: this.container,
        alpha: 1,
        scale: 1,
        y: this.baseY,
        duration: 380,
        ease: 'Back.easeOut',
        onComplete: () => {
          this.startIdle();
          resolve();
        },
      });
    });
  }

  private startIdle(): void {
    this.stopIdle();
    this.idleTween = this.scene.tweens.add({
      targets: this.container,
      y: this.baseY - 7,
      duration: 1100,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private stopIdle(): void {
    this.idleTween?.remove();
    this.idleTween = null;
    this.container.y = this.baseY;
  }

  /** Impact reaction: white flash pop + horizontal shudder. */
  hit(element: number): void {
    burstAt(this.scene, this.container.x, this.container.y, element, 8);

    const flash = this.scene.add
      .circle(this.container.x, this.container.y, this.glowOuter.radius * 0.9, 0xffffff, 0.55)
      .setDepth(150)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.scene.tweens.add({
      targets: flash,
      alpha: 0,
      scale: 1.4,
      duration: 180,
      onComplete: () => flash.destroy(),
    });

    this.scene.tweens.add({
      targets: this.container,
      x: this.container.x + 9,
      duration: 45,
      yoyo: true,
      repeat: 3,
    });
  }

  /** Attack wind-up: lunge down toward the player, then recover. */
  lunge(): Promise<void> {
    this.stopIdle();
    return new Promise((resolve) => {
      this.scene.tweens.add({
        targets: this.container,
        y: this.baseY + 46,
        scale: 1.12,
        duration: 150,
        ease: 'Quad.easeIn',
        yoyo: true,
        onYoyo: () => resolve(),
        onComplete: () => this.startIdle(),
      });
    });
  }

  /** Death: burst + shrink/fade. Resolves when gone. */
  die(element: number): Promise<void> {
    this.stopIdle();
    burstAt(this.scene, this.container.x, this.container.y, element, 16);
    return new Promise((resolve) => {
      this.scene.tweens.add({
        targets: this.container,
        scale: 0,
        alpha: 0,
        angle: 20,
        duration: 380,
        ease: 'Back.easeIn',
        onComplete: () => {
          this.container.setAngle(0);
          resolve();
        },
      });
    });
  }
}
