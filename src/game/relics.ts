/**
 * Passive relics picked up during a roguelike run. Each relic plugs into an
 * existing numeric pipeline (damage, healing, move time, HP) — no new battle
 * mechanics are required to honor them.
 */
export type RelicEffect =
  | { type: 'moveTime'; bonusMs: number }
  | { type: 'elementDamage'; element: number; multiplier: number }
  | { type: 'allDamage'; multiplier: number }
  | { type: 'healBoost'; multiplier: number }
  | { type: 'postBattleHeal'; fraction: number }
  | { type: 'maxHp'; multiplier: number };

export interface Relic {
  id: string;
  name: string;
  description: string;
  effect: RelicEffect;
}

export const RELICS: Relic[] = [
  {
    id: 'hourglass',
    name: 'Hourglass of Haste',
    description: '+2s move time',
    effect: { type: 'moveTime', bonusMs: 2000 },
  },
  {
    id: 'ember-sigil',
    name: 'Ember Sigil',
    description: 'Fire damage x1.3',
    effect: { type: 'elementDamage', element: 0, multiplier: 1.3 },
  },
  {
    id: 'tidal-charm',
    name: 'Tidal Charm',
    description: 'Water damage x1.3',
    effect: { type: 'elementDamage', element: 1, multiplier: 1.3 },
  },
  {
    id: 'verdant-idol',
    name: 'Verdant Idol',
    description: 'Wood damage x1.3',
    effect: { type: 'elementDamage', element: 2, multiplier: 1.3 },
  },
  {
    id: 'sun-fragment',
    name: 'Sun Fragment',
    description: 'Light damage x1.3',
    effect: { type: 'elementDamage', element: 3, multiplier: 1.3 },
  },
  {
    id: 'moon-fragment',
    name: 'Moon Fragment',
    description: 'Dark damage x1.3',
    effect: { type: 'elementDamage', element: 4, multiplier: 1.3 },
  },
  {
    id: 'blessed-chalice',
    name: 'Blessed Chalice',
    description: 'Heart healing x1.5',
    effect: { type: 'healBoost', multiplier: 1.5 },
  },
  {
    id: 'field-rations',
    name: 'Field Rations',
    description: 'Heal 15% max HP after each battle',
    effect: { type: 'postBattleHeal', fraction: 0.15 },
  },
  {
    id: 'war-banner',
    name: 'War Banner',
    description: 'All damage x1.15',
    effect: { type: 'allDamage', multiplier: 1.15 },
  },
  {
    id: 'giants-belt',
    name: "Giant's Belt",
    description: 'Max HP +20%',
    effect: { type: 'maxHp', multiplier: 1.2 },
  },
];

/** Flattened, stackable view of a relic collection for the battle pipeline. */
export interface RelicModifiers {
  moveTimeBonusMs: number;
  allDamageMultiplier: number;
  /** Index 0-4 by element. */
  elementDamageMultiplier: number[];
  healMultiplier: number;
  postBattleHealFraction: number;
  maxHpMultiplier: number;
}

export function aggregateRelics(relics: Relic[]): RelicModifiers {
  const mods: RelicModifiers = {
    moveTimeBonusMs: 0,
    allDamageMultiplier: 1,
    elementDamageMultiplier: [1, 1, 1, 1, 1],
    healMultiplier: 1,
    postBattleHealFraction: 0,
    maxHpMultiplier: 1,
  };
  for (const relic of relics) {
    const effect = relic.effect;
    switch (effect.type) {
      case 'moveTime':
        mods.moveTimeBonusMs += effect.bonusMs;
        break;
      case 'allDamage':
        mods.allDamageMultiplier *= effect.multiplier;
        break;
      case 'elementDamage':
        mods.elementDamageMultiplier[effect.element] *= effect.multiplier;
        break;
      case 'healBoost':
        mods.healMultiplier *= effect.multiplier;
        break;
      case 'postBattleHeal':
        mods.postBattleHealFraction += effect.fraction;
        break;
      case 'maxHp':
        mods.maxHpMultiplier *= effect.multiplier;
        break;
    }
  }
  return mods;
}
