import { describe, expect, it } from 'vitest';
import { DEFAULT_ENEMY_EMOJI, enemyEmoji } from './enemyArt';
import { LEVELS } from './levels';

describe('enemyEmoji', () => {
  it('maps creature families case-insensitively', () => {
    expect(enemyEmoji('Slime')).toBe('🟢');
    expect(enemyEmoji('Goblin Shaman')).toBe('🧙');
    expect(enemyEmoji('Goblin')).toBe('👺');
    expect(enemyEmoji('Ancient Dragon')).toBe('🐉');
    expect(enemyEmoji('Cave Bat')).toBe('🦇');
  });

  it('keeps boss slimes looking like slimes (creature word wins over title)', () => {
    expect(enemyEmoji('Slime King')).toBe('🟢');
    expect(enemyEmoji('Slime Overlord')).toBe('🟢');
  });

  it('falls back to the default for unknown names', () => {
    expect(enemyEmoji('Mysterious Entity')).toBe(DEFAULT_ENEMY_EMOJI);
  });

  it('covers every story-campaign enemy with a non-default emoji', () => {
    for (const level of LEVELS) {
      for (const enemy of level) {
        expect(enemyEmoji(enemy.name)).not.toBe(DEFAULT_ENEMY_EMOJI);
      }
    }
  });
});
