import { describe, expect, it } from 'vitest';
import type { PlayerData } from './playerData';
import { isLevelUnlocked, recordLevelClear, starsForClear } from './playerData';

function makeData(levelStars: number[] = []): PlayerData {
  return { currency: 0, owned: [], activeTeamIds: [], levelStars };
}

describe('starsForClear', () => {
  it('gives 3 stars at 70%+ remaining HP', () => {
    expect(starsForClear(1)).toBe(3);
    expect(starsForClear(0.7)).toBe(3);
  });

  it('gives 2 stars at 35%-70%', () => {
    expect(starsForClear(0.5)).toBe(2);
    expect(starsForClear(0.35)).toBe(2);
  });

  it('gives 1 star below 35%', () => {
    expect(starsForClear(0.1)).toBe(1);
    expect(starsForClear(0)).toBe(1);
  });
});

describe('recordLevelClear', () => {
  it('records stars for a fresh level, padding earlier levels with 0', () => {
    const data = recordLevelClear(makeData(), 2, 3);
    expect(data.levelStars).toEqual([0, 0, 3]);
  });

  it('keeps the best rating across repeat clears', () => {
    let data = recordLevelClear(makeData(), 0, 3);
    data = recordLevelClear(data, 0, 1);
    expect(data.levelStars[0]).toBe(3);
    data = recordLevelClear(data, 0, 2);
    expect(data.levelStars[0]).toBe(3);
  });

  it('clamps stars to 1-3', () => {
    expect(recordLevelClear(makeData(), 0, 9).levelStars[0]).toBe(3);
    expect(recordLevelClear(makeData(), 0, 0).levelStars[0]).toBe(1);
  });

  it('does not mutate the input data', () => {
    const original = makeData([1]);
    recordLevelClear(original, 1, 2);
    expect(original.levelStars).toEqual([1]);
  });
});

describe('isLevelUnlocked', () => {
  it('level 0 is always unlocked', () => {
    expect(isLevelUnlocked(makeData(), 0)).toBe(true);
  });

  it('later levels need the previous level cleared', () => {
    expect(isLevelUnlocked(makeData(), 1)).toBe(false);
    expect(isLevelUnlocked(makeData([2]), 1)).toBe(true);
    expect(isLevelUnlocked(makeData([2]), 2)).toBe(false);
    expect(isLevelUnlocked(makeData([2, 1, 3]), 3)).toBe(true);
  });
});
