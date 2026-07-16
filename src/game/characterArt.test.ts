import { describe, expect, it } from 'vitest';
import { DEFAULT_CHARACTER_EMOJI, characterEmoji } from './characterArt';
import { CHARACTER_POOL } from './characterPool';

describe('characterEmoji', () => {
  it('covers every character in the pool with a non-default emoji', () => {
    for (const character of CHARACTER_POOL) {
      expect(characterEmoji(character.id), character.id).not.toBe(DEFAULT_CHARACTER_EMOJI);
    }
  });

  it('falls back to the default for unknown ids', () => {
    expect(characterEmoji('totally-new-hero')).toBe(DEFAULT_CHARACTER_EMOJI);
  });

  it('never uses ZWJ emoji sequences (broken rendering on older systems)', () => {
    for (const character of CHARACTER_POOL) {
      expect(characterEmoji(character.id)).not.toContain('‍');
    }
  });
});
