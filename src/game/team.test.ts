import { describe, expect, it } from 'vitest';
import {
  comboMultiplier,
  computeHealAmount,
  computeMatchDamage,
  elementMultiplier,
  groupSizeMultiplier,
} from './team';
import type { Character } from './team';
import { HEART_TYPE } from './constants';

const fireCharacter: Character = {
  id: 'test-fire',
  name: 'Test Fire',
  rarity: 'Rare',
  element: 0,
  maxHp: 50,
  attack: 100,
  skillName: 'Test Skill',
  skillCooldownTurns: 3,
  skillEffect: 'damage',
  skillPower: 100,
};

describe('elementMultiplier', () => {
  it('gives +50% for a favorable matchup (Fire beats Wood)', () => {
    expect(elementMultiplier(0, 2)).toBe(1.5);
  });

  it('gives -50% for an unfavorable matchup (attacking into a resisted element)', () => {
    // Wood(2) beats Water(1), so attacking Water(1) with Wood(2)... wait: Fire(0) beats Wood(2),
    // so attacking Wood(2) with Water(1) is resisted (Wood doesn't beat Water... use Fire attacked by Wood).
    expect(elementMultiplier(2, 0)).toBe(0.5); // Wood attacking Fire is resisted (Fire beats Wood)
  });

  it('gives +50% both ways between Light and Dark', () => {
    expect(elementMultiplier(3, 4)).toBe(1.5);
    expect(elementMultiplier(4, 3)).toBe(1.5);
  });

  it('gives 1x for a neutral matchup', () => {
    expect(elementMultiplier(0, 3)).toBe(1); // Fire vs Light: no relation
  });
});

describe('groupSizeMultiplier', () => {
  it('is 1x for a normal 3-match', () => {
    expect(groupSizeMultiplier(3)).toBe(1);
  });

  it('is 1.25x for a 4-match', () => {
    expect(groupSizeMultiplier(4)).toBe(1.25);
  });

  it('is 2x for a 5-or-more match', () => {
    expect(groupSizeMultiplier(5)).toBe(2);
    expect(groupSizeMultiplier(8)).toBe(2);
  });
});

describe('comboMultiplier', () => {
  it('is 1x for a single combo', () => {
    expect(comboMultiplier(1)).toBe(1);
  });

  it('adds +25% per extra combo', () => {
    expect(comboMultiplier(2)).toBe(1.25);
    expect(comboMultiplier(5)).toBe(2);
  });

  it('never drops below 1x', () => {
    expect(comboMultiplier(0)).toBe(1);
  });
});

describe('computeMatchDamage', () => {
  it('sums attack from team members sharing the matched element', () => {
    const damage = computeMatchDamage([{ element: 0, size: 3 }], 1, [fireCharacter], 3);
    // attack(100) * size(3) * combo(1) * elementMultiplier(Fire vs Light = 1) * groupBonus(1) = 300
    expect(damage).toBe(300);
  });

  it('applies elemental advantage multiplier against the target element', () => {
    const damage = computeMatchDamage([{ element: 0, size: 3 }], 1, [fireCharacter], 2); // vs Wood
    expect(damage).toBe(450); // 100 * 3 * 1 * 1.5
  });

  it('ignores Heart-type matches (handled by computeHealAmount instead)', () => {
    const damage = computeMatchDamage([{ element: HEART_TYPE, size: 4 }], 1, [fireCharacter], 3);
    expect(damage).toBe(0);
  });

  it('applies the leader skill bonus when its conditions are met', () => {
    const leaderCharacter: Character = {
      ...fireCharacter,
      leaderSkill: { name: 'Test Leader', description: 'x2 fire dmg', multiplier: 2, element: 0 },
    };
    const damage = computeMatchDamage([{ element: 0, size: 3 }], 1, [leaderCharacter], 3);
    expect(damage).toBe(600); // 300 base * 2 leader multiplier
  });

  it('returns 0 when no team member shares the matched element', () => {
    const damage = computeMatchDamage([{ element: 1, size: 3 }], 1, [fireCharacter], 3);
    expect(damage).toBe(0);
  });

  it('scales the whole turn by the combo multiplier (each group = one combo)', () => {
    const groups = [
      { element: 0, size: 3 },
      { element: 0, size: 3 },
      { element: 0, size: 3 },
    ];
    // Base per group: 100 * 3 = 300; three groups = 900; combo 3 => x1.5 = 1350.
    const damage = computeMatchDamage(groups, 3, [fireCharacter], 3);
    expect(damage).toBe(1350);
  });

  it('meets the leader minCombo condition via the total combo count', () => {
    const leaderCharacter: Character = {
      ...fireCharacter,
      leaderSkill: { name: 'Test Leader', description: 'x2 at 3+ combo', multiplier: 2, minCombo: 3 },
    };
    const groups = [
      { element: 0, size: 3 },
      { element: 0, size: 3 },
      { element: 0, size: 3 },
    ];
    // 900 base * leader x2 * combo x1.5 = 2700.
    expect(computeMatchDamage(groups, 3, [leaderCharacter], 3)).toBe(2700);
    // Below minCombo the leader bonus does not apply: 300 * x1 combo = 300.
    expect(computeMatchDamage([{ element: 0, size: 3 }], 1, [leaderCharacter], 3)).toBe(300);
  });

  it('enhanced gems add +0.5 effective size each to the attack factor, but the group-size multiplier still uses the real size', () => {
    // effectiveSize = 3 + 0.5*2 = 4; groupSizeMultiplier(3) = 1 (not 4's 1.25).
    // 100 attack * 4 effectiveSize * elementMultiplier(Fire vs Light = 1) * 1 = 400.
    const damage = computeMatchDamage(
      [{ element: 0, size: 3, enhancedCount: 2 }],
      1,
      [fireCharacter],
      3,
    );
    expect(damage).toBe(400);
  });

  it('a plain (unenhanced) group is unaffected — enhancedCount defaults to 0', () => {
    const damage = computeMatchDamage([{ element: 0, size: 3, enhancedCount: 0 }], 1, [fireCharacter], 3);
    expect(damage).toBe(300);
  });

  it('extraMultiplier (e.g. an active teamBuff skill) scales the whole-turn total on top of everything else', () => {
    const damage = computeMatchDamage([{ element: 0, size: 3 }], 1, [fireCharacter], 3, undefined, 2);
    expect(damage).toBe(600); // 300 base * 2 extraMultiplier
  });

  it('extraMultiplier defaults to 1x when omitted', () => {
    const damage = computeMatchDamage([{ element: 0, size: 3 }], 1, [fireCharacter], 3, undefined);
    expect(damage).toBe(300);
  });
});

describe('computeHealAmount', () => {
  it('computes healing from Heart-type groups only', () => {
    const heal = computeHealAmount([{ element: HEART_TYPE, size: 3 }, { element: 0, size: 3 }], 1);
    // size(3) * HEAL_PER_GEM(20) * combo(1) * groupBonus(1) = 60
    expect(heal).toBe(60);
  });

  it('returns 0 when there are no Heart-type groups', () => {
    expect(computeHealAmount([{ element: 0, size: 4 }], 2)).toBe(0);
  });

  it('scales healing by the combo multiplier', () => {
    // 3 hearts * 20 = 60 base; combo 2 => x1.25 = 75.
    expect(computeHealAmount([{ element: HEART_TYPE, size: 3 }, { element: 0, size: 3 }], 2)).toBe(75);
  });

  it('enhanced heart gems boost healing the same way damage is boosted', () => {
    // effectiveSize = 3 + 0.5*2 = 4; groupSizeMultiplier(3) = 1.
    // 4 * HEAL_PER_GEM(20) * combo(1) * groupBonus(1) = 80.
    const heal = computeHealAmount([{ element: HEART_TYPE, size: 3, enhancedCount: 2 }], 1);
    expect(heal).toBe(80);
  });
});
