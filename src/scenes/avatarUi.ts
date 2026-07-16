import Phaser from 'phaser';
import { GEM_COLORS } from '../game/constants';
import { characterEmoji } from '../game/characterArt';
import { darken, lighten } from './gemArt';

/**
 * Shared character-avatar widget: an element-colored ring with a dark core
 * and the character's emoji portrait. Returned as a container so callers can
 * position/scale/tint it as one unit.
 */
export function drawAvatar(
  scene: Phaser.Scene,
  x: number,
  y: number,
  character: { id: string; element: number },
  radius = 20,
): Phaser.GameObjects.Container {
  const color = GEM_COLORS[character.element] ?? 0xffffff;

  const ring = scene.add.circle(0, 0, radius, darken(color, 0.55), 1);
  ring.setStrokeStyle(Math.max(2, radius * 0.14), lighten(color, 0.15), 1);

  const face = scene.add
    .text(0, 0, characterEmoji(character.id), { fontSize: `${Math.round(radius * 1.1)}px` })
    .setOrigin(0.5);

  return scene.add.container(x, y, [ring, face]);
}
