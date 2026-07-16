import { describe, expect, it } from 'vitest';
import { PULL_COST, rollGacha, rollGachaMulti } from './gacha';
import { CHARACTER_POOL } from './characterPool';

/** Deterministic rng from a fixed sequence (cycles). */
function seq(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe('rollGacha', () => {
  it('always returns a character from the pool', () => {
    for (let i = 0; i < 50; i++) {
      const character = rollGacha();
      expect(CHARACTER_POOL.some((c) => c.id === character.id)).toBe(true);
    }
  });

  it('maps low rolls to Common and high rolls to SSR (weights 0.6/0.3/0.1)', () => {
    // First rng call picks rarity, second picks the index within that rarity.
    expect(rollGacha(seq([0.1, 0])).rarity).toBe('Common');
    expect(rollGacha(seq([0.7, 0])).rarity).toBe('Rare');
    expect(rollGacha(seq([0.95, 0])).rarity).toBe('SSR');
  });
});

describe('rollGachaMulti', () => {
  it('returns exactly the requested number of pulls', () => {
    expect(rollGachaMulti(5)).toHaveLength(5);
    expect(rollGachaMulti(0)).toHaveLength(0);
  });

  it('is equivalent to repeated single pulls on the same rng stream', () => {
    const values = [0.1, 0.2, 0.7, 0.4, 0.95, 0.6, 0.3, 0.8, 0.5, 0.05];
    const multi = rollGachaMulti(5, seq(values));
    const stream = seq(values);
    const singles = Array.from({ length: 5 }, () => rollGacha(stream));
    expect(multi.map((c) => c.id)).toEqual(singles.map((c) => c.id));
  });
});

describe('PULL_COST', () => {
  it('is a positive integer (scene buttons multiply it for multi-pulls)', () => {
    expect(PULL_COST).toBeGreaterThan(0);
    expect(Number.isInteger(PULL_COST)).toBe(true);
  });
});
