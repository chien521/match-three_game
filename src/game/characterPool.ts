import { DEFAULT_TEAM } from './team';
import type { Character } from './team';
import { HEART_TYPE } from './constants';

/**
 * Extra characters obtainable only through the gacha (in addition to the
 * starter DEFAULT_TEAM, which every player already owns).
 */
const GACHA_ONLY_CHARACTERS: Character[] = [
  {
    id: 'ember-pup',
    name: 'Ember Pup',
    rarity: 'Common',
    element: 0,
    maxHp: 40,
    attack: 45,
    skillName: 'Spark',
    skillCooldownTurns: 3,
    skillEffect: 'damage',
    skillPower: 60,
  },
  {
    id: 'tide-sprite',
    name: 'Tide Sprite',
    rarity: 'Common',
    element: 1,
    maxHp: 45,
    attack: 40,
    skillName: 'Tidal Shift',
    skillCooldownTurns: 4,
    skillEffect: 'convert',
    skillConvertFrom: 1, // Water
    skillConvertTo: HEART_TYPE, // Heart
  },
  {
    id: 'sprout-scout',
    name: 'Sprout Scout',
    rarity: 'Common',
    element: 2,
    maxHp: 42,
    attack: 42,
    skillName: 'Vine Whip',
    skillCooldownTurns: 3,
    skillEffect: 'damage',
    skillPower: 55,
  },
  {
    id: 'chrono-imp',
    name: 'Chrono Imp',
    rarity: 'Common',
    element: 3,
    maxHp: 38,
    attack: 38,
    skillName: 'Temporal Boost',
    skillCooldownTurns: 4,
    skillEffect: 'extendTime',
    skillPower: 3000, // +3s move time
  },
  {
    id: 'phoenix-empress',
    name: 'Phoenix Empress',
    rarity: 'SSR',
    element: 0,
    maxHp: 90,
    attack: 130,
    skillName: 'Inferno Nova',
    skillCooldownTurns: 6,
    skillEffect: 'damage',
    skillPower: 350,
    leaderSkill: {
      name: 'Sovereign Flame',
      description: 'Fire attribute damage x2',
      multiplier: 2,
      element: 0,
    },
  },
  {
    id: 'abyssal-queen',
    name: 'Abyssal Queen',
    rarity: 'SSR',
    element: 4,
    maxHp: 85,
    attack: 125,
    skillName: 'Void Reaping',
    skillCooldownTurns: 6,
    skillEffect: 'damage',
    skillPower: 320,
    leaderSkill: {
      name: 'Umbral Pact',
      description: 'x2 damage at 5+ combo',
      multiplier: 2,
      minCombo: 5,
    },
  },
  {
    id: 'astral-sorceress',
    name: 'Astral Sorceress',
    rarity: 'SSR',
    element: 3,
    maxHp: 80,
    attack: 115,
    skillName: 'Astral Rewrite',
    skillCooldownTurns: 5,
    skillEffect: 'convert',
    skillConvertFrom: 2, // Wood
    skillConvertTo: 3, // Light
    leaderSkill: {
      name: 'Radiant Ascendancy',
      description: 'Light attribute damage x1.5',
      multiplier: 1.5,
      element: 3,
    },
  },
];

/** Full pool of gacha-pullable characters: starters + gacha-only. */
export const CHARACTER_POOL: Character[] = [...DEFAULT_TEAM, ...GACHA_ONLY_CHARACTERS];

export function findCharacterTemplate(id: string): Character | undefined {
  return CHARACTER_POOL.find((c) => c.id === id);
}
