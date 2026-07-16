import { describe, expect, it } from 'vitest';
import type { PlayerData } from './playerData';
import {
  isLevelUnlocked,
  migrateLevelStars,
  recordLevelClear,
  starsForClear,
  starsForLevel,
} from './playerData';

function makeData(levelStars: Record<string, number> = {}): PlayerData {
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

describe('starsForLevel', () => {
  it('delegates to starsForClear (hpRatio rule) when criteria is undefined', () => {
    expect(starsForLevel(undefined, { hpRatio: 1, turnsUsed: 999 })).toBe(3);
    expect(starsForLevel(undefined, { hpRatio: 0.5, turnsUsed: 1 })).toBe(2);
    expect(starsForLevel(undefined, { hpRatio: 0, turnsUsed: 1 })).toBe(1);
  });

  it('delegates to starsForClear when criteria is explicitly {type: "hpRatio"}', () => {
    expect(starsForLevel({ type: 'hpRatio' }, { hpRatio: 0.8, turnsUsed: 50 })).toBe(3);
    expect(starsForLevel({ type: 'hpRatio' }, { hpRatio: 0.2, turnsUsed: 1 })).toBe(1);
  });

  it('gives 3 stars for a "turns" criteria when turnsUsed is at or under threeStar', () => {
    const criteria = { type: 'turns' as const, threeStar: 10, twoStar: 15 };
    expect(starsForLevel(criteria, { hpRatio: 0, turnsUsed: 5 })).toBe(3);
    expect(starsForLevel(criteria, { hpRatio: 0, turnsUsed: 10 })).toBe(3);
  });

  it('gives 2 stars for a "turns" criteria between threeStar and twoStar', () => {
    const criteria = { type: 'turns' as const, threeStar: 10, twoStar: 15 };
    expect(starsForLevel(criteria, { hpRatio: 0, turnsUsed: 11 })).toBe(2);
    expect(starsForLevel(criteria, { hpRatio: 0, turnsUsed: 15 })).toBe(2);
  });

  it('gives 1 star for a "turns" criteria beyond twoStar, regardless of hpRatio', () => {
    const criteria = { type: 'turns' as const, threeStar: 10, twoStar: 15 };
    expect(starsForLevel(criteria, { hpRatio: 1, turnsUsed: 16 })).toBe(1);
  });
});

describe('recordLevelClear', () => {
  it('records stars for a fresh level by id', () => {
    const data = recordLevelClear(makeData(), 'wood-1', 3);
    expect(data.levelStars).toEqual({ 'wood-1': 3 });
  });

  it('keeps the best rating across repeat clears', () => {
    let data = recordLevelClear(makeData(), 'wood-1', 3);
    data = recordLevelClear(data, 'wood-1', 1);
    expect(data.levelStars['wood-1']).toBe(3);
    data = recordLevelClear(data, 'wood-1', 2);
    expect(data.levelStars['wood-1']).toBe(3);
  });

  it('clamps stars to 1-3', () => {
    expect(recordLevelClear(makeData(), 'wood-1', 9).levelStars['wood-1']).toBe(3);
    expect(recordLevelClear(makeData(), 'wood-1', 0).levelStars['wood-1']).toBe(1);
  });

  it('does not mutate the input data', () => {
    const original = makeData({ 'wood-1': 1 });
    recordLevelClear(original, 'wood-2', 2);
    expect(original.levelStars).toEqual({ 'wood-1': 1 });
  });
});

describe('isLevelUnlocked (branch graph)', () => {
  it('the prologue entry is always unlocked', () => {
    expect(isLevelUnlocked(makeData(), 'prologue-1')).toBe(true);
  });

  it('branch levels need their unlockRequires cleared', () => {
    expect(isLevelUnlocked(makeData(), 'prologue-2')).toBe(false);
    expect(isLevelUnlocked(makeData({ 'prologue-1': 2 }), 'prologue-2')).toBe(true);
    expect(isLevelUnlocked(makeData({ 'prologue-1': 2 }), 'fire-1')).toBe(false);
  });

  it('clearing the prologue opens all three branches at once', () => {
    const data = makeData({ 'prologue-1': 1, 'prologue-2': 1 });
    expect(isLevelUnlocked(data, 'fire-1')).toBe(true);
    expect(isLevelUnlocked(data, 'water-1')).toBe(true);
    expect(isLevelUnlocked(data, 'wood-1')).toBe(true);
    expect(isLevelUnlocked(data, 'fire-2')).toBe(false); // still needs fire-1
  });

  it('the final chapter needs all three branch bosses, in any clear order', () => {
    let stars: Record<string, number> = { 'fire-3': 1, 'wood-3': 2 };
    expect(isLevelUnlocked(makeData(stars), 'final-1')).toBe(false);
    stars = { ...stars, 'water-3': 3 };
    expect(isLevelUnlocked(makeData(stars), 'final-1')).toBe(true);
  });

  it('unknown level ids are never unlocked', () => {
    expect(isLevelUnlocked(makeData(), 'no-such-level')).toBe(false);
  });

  it('a cleared level stays unlocked (replayable) even if its requirements are not met', () => {
    // e.g. a migrated legacy save cleared fire-1 without the new prologue existing.
    expect(isLevelUnlocked(makeData({ 'fire-1': 2 }), 'fire-1')).toBe(true);
  });
});

describe('migrateLevelStars', () => {
  it('maps a legacy position-indexed array onto level ids (old order: Slime, Goblin, Dragon arcs)', () => {
    expect(migrateLevelStars([3, 2, 1, 3, 0, 2])).toEqual({
      'wood-1': 3,
      'wood-2': 2,
      'wood-3': 1,
      'fire-1': 3,
      // index 4 was 0 = not cleared, omitted
      'fire-3': 2,
    });
  });

  it('a fully-cleared legacy save unlocks the final chapter after migration', () => {
    const migrated = migrateLevelStars([3, 3, 3, 3, 3, 3, 3, 3, 3]);
    expect(isLevelUnlocked(makeData(migrated), 'final-1')).toBe(true);
    expect(isLevelUnlocked(makeData(migrated), 'water-1')).toBe(false); // new branch needs the new prologue
  });

  it('passes through the new id-keyed shape and drops junk values', () => {
    expect(migrateLevelStars({ 'wood-1': 2, 'fire-1': 0, bogus: 'x' })).toEqual({ 'wood-1': 2 });
  });

  it('falls back to empty on garbage', () => {
    expect(migrateLevelStars(undefined)).toEqual({});
    expect(migrateLevelStars(null)).toEqual({});
    expect(migrateLevelStars(42)).toEqual({});
    expect(migrateLevelStars('stars')).toEqual({});
  });
});
