import { ELEMENT_NAMES, HEAL_PER_GEM, HEART_TYPE } from './constants';
import type { RelicModifiers } from './relics';

export type SkillEffect = 'damage' | 'heal' | 'convert' | 'extendTime';
export type Rarity = 'Common' | 'Rare' | 'SSR';

/**
 * A passive bonus provided by the team's leader (team[0]) at all times —
 * no cooldown, no manual activation. Modeled after Puzzle & Dragons' "Leader
 * Skill": e.g. "Fire attribute damage x1.5" or "x2 damage at 5+ combo".
 */
export interface LeaderSkill {
  name: string;
  description: string;
  multiplier: number;
  element?: number; // restrict the bonus to one element; omit to apply to all
  minCombo?: number; // only applies once combo reaches this count
}

interface DamageSkill {
  skillEffect: 'damage';
  /** Flat damage dealt to the current enemy. */
  skillPower: number;
}

interface HealSkill {
  skillEffect: 'heal';
  /** Flat HP restored to the player. */
  skillPower: number;
}

/** Converts every gem of `skillConvertFrom` on the board to `skillConvertTo`. */
interface ConvertSkill {
  skillEffect: 'convert';
  skillConvertFrom: number;
  skillConvertTo: number;
}

/** Adds `skillPower` milliseconds to the current turn's move time limit. */
interface ExtendTimeSkill {
  skillEffect: 'extendTime';
  /** Bonus move time in milliseconds. */
  skillPower: number;
}

/** Discriminated union on `skillEffect` — each variant only carries the fields it needs. */
export type CharacterSkill = DamageSkill | HealSkill | ConvertSkill | ExtendTimeSkill;

export type Character = {
  id: string;
  name: string;
  rarity: Rarity;
  element: number; // index into ELEMENT_NAMES / GEM_COLORS (0=Fire,1=Water,2=Wood,3=Light,4=Dark)
  maxHp: number;
  attack: number;
  skillName: string;
  skillCooldownTurns: number;
  leaderSkill?: LeaderSkill;
} & CharacterSkill;

/** Default starting team: one character per element, each with an active skill. */
export const DEFAULT_TEAM: Character[] = [
  {
    id: 'firebrand',
    name: 'Firebrand',
    rarity: 'Rare',
    element: 0,
    maxHp: 60,
    attack: 80,
    skillName: 'Fireball',
    skillCooldownTurns: 3,
    skillEffect: 'damage',
    skillPower: 150,
    leaderSkill: {
      name: 'Blazing Command',
      description: 'Fire attribute damage x1.5',
      multiplier: 1.5,
      element: 0,
    },
  },
  {
    id: 'aqua-knight',
    name: 'Aqua Knight',
    rarity: 'Rare',
    element: 1,
    maxHp: 70,
    attack: 60,
    skillName: 'Healing Tide',
    skillCooldownTurns: 4,
    skillEffect: 'heal',
    skillPower: 80,
  },
  {
    id: 'woodland-archer',
    name: 'Woodland Archer',
    rarity: 'Rare',
    element: 2,
    maxHp: 65,
    attack: 70,
    skillName: 'Piercing Shot',
    skillCooldownTurns: 3,
    skillEffect: 'damage',
    skillPower: 120,
  },
  {
    id: 'solaris',
    name: 'Solaris',
    rarity: 'Rare',
    element: 3,
    maxHp: 55,
    attack: 90,
    skillName: 'Radiant Burst',
    skillCooldownTurns: 5,
    skillEffect: 'damage',
    skillPower: 220,
  },
  {
    id: 'nightshade',
    name: 'Nightshade',
    rarity: 'Rare',
    element: 4,
    maxHp: 55,
    attack: 85,
    skillName: 'Shadow Strike',
    skillCooldownTurns: 4,
    skillEffect: 'damage',
    skillPower: 170,
  },
];

export function teamTotalHp(team: Character[]): number {
  return team.reduce((sum, c) => sum + c.maxHp, 0);
}

// Elemental advantage cycle: Fire > Wood > Water > Fire. Light and Dark deal
// bonus damage to each other. Bidirectional: attacking into a favorable
// matchup deals +50%, attacking into an unfavorable one (i.e. the defender's
// element beats yours) deals -50% (resisted).
const ADVANTAGE: Record<number, number> = { 0: 2, 2: 1, 1: 0 }; // attacker -> element it beats

export function elementMultiplier(attackerElement: number, defenderElement: number): number {
  if (ADVANTAGE[attackerElement] === defenderElement) return 1.5;
  if ((attackerElement === 3 && defenderElement === 4) || (attackerElement === 4 && defenderElement === 3)) {
    return 1.5;
  }
  if (ADVANTAGE[defenderElement] === attackerElement) return 0.5;
  return 1;
}

export function elementName(element: number): string {
  return ELEMENT_NAMES[element] ?? '?';
}

/** Short, unambiguous 2-letter codes for compact UI labels. */
const ELEMENT_ABBR = ['Fi', 'Wa', 'Wd', 'Li', 'Da'];
export function elementAbbr(element: number): string {
  return ELEMENT_ABBR[element] ?? '?';
}

export interface MatchGroup {
  element: number;
  size: number;
  /** How many gems in this group are "enhanced" (+50% power each). */
  enhancedCount?: number;
}

/**
 * Bonus multiplier for a single connected group of matched gems, based on
 * how many gems it contains (a simplified stand-in for Puzzle & Dragons'
 * 4/5-match and cross/L-shape "jewel combo" bonuses): 3 gems = normal,
 * 4 = +25%, 5+ = double.
 */
export function groupSizeMultiplier(size: number): number {
  if (size >= 5) return 2;
  if (size === 4) return 1.25;
  return 1;
}

/**
 * Puzzle & Dragons-style combo multiplier applied to the whole turn's damage
 * and healing. Each connected matched group counts as one combo (including
 * groups cleared by cascades), so a well-planned multi-match move is rewarded:
 * 1 combo = 1x, each extra combo adds +25%.
 */
export function comboMultiplier(combo: number): number {
  return 1 + 0.25 * Math.max(0, combo - 1);
}

/**
 * Base damage contribution of a single matched group: summed attack of team
 * members sharing the group's element, scaled by its size, the group-size
 * bonus, and elemental advantage against the target — before the whole-turn
 * combo multiplier, leader skill, or relic modifiers are applied (those only
 * make sense across the whole turn, see computeMatchDamage). Returns 0 for
 * Heart groups (they heal, not damage) or when no team member shares the
 * element. Exported purely for visual feedback (e.g. a per-group floating
 * damage number) — computeMatchDamage below reuses this exact calculation
 * internally, so this does not change any existing damage math.
 */
export function computeGroupBaseDamage(
  group: MatchGroup,
  team: Character[],
  targetElement: number,
): number {
  if (group.element === HEART_TYPE) return 0;
  const attack = team
    .filter((c) => c.element === group.element)
    .reduce((sum, c) => sum + c.attack, 0);
  if (attack === 0) return 0;
  // Enhanced gems add +50% power each to the attack*size factor; the
  // group-size bonus below still uses the group's real (unenhanced) size.
  const effectiveSize = group.size + 0.5 * (group.enhancedCount ?? 0);
  return (
    attack * effectiveSize * elementMultiplier(group.element, targetElement) * groupSizeMultiplier(group.size)
  );
}

/**
 * Computes total damage for the whole turn: `groups` holds every matched
 * group across all cascade waves and `combo` is the total group count. For
 * every group, sums the attack of team members sharing that group's element,
 * scaled by the group's size, the group-size bonus, and elemental advantage
 * against the target's element; the grand total is then scaled by the combo
 * multiplier and the leader's passive bonus (team[0].leaderSkill), if its
 * conditions are met.
 */
export function computeMatchDamage(
  groups: MatchGroup[],
  combo: number,
  team: Character[],
  targetElement: number,
  relicMods?: RelicModifiers,
): number {
  const leaderSkill = team[0]?.leaderSkill;
  let total = 0;
  for (const group of groups) {
    const { element } = group;
    let amount = computeGroupBaseDamage(group, team, targetElement);
    if (amount === 0) continue;

    if (
      leaderSkill &&
      (leaderSkill.element === undefined || leaderSkill.element === element) &&
      (leaderSkill.minCombo === undefined || combo >= leaderSkill.minCombo)
    ) {
      amount *= leaderSkill.multiplier;
    }

    if (relicMods) {
      amount *= relicMods.elementDamageMultiplier[element] ?? 1;
    }

    total += amount;
  }
  const allMultiplier = relicMods?.allDamageMultiplier ?? 1;
  return Math.round(total * comboMultiplier(combo) * allMultiplier);
}


/** Total HP restored for the whole turn from matched Heart orb groups, scaled by the combo multiplier. */
export function computeHealAmount(
  groups: MatchGroup[],
  combo: number,
  relicMods?: RelicModifiers,
): number {
  let total = 0;
  for (const group of groups) {
    if (group.element !== HEART_TYPE) continue;
    const effectiveSize = group.size + 0.5 * (group.enhancedCount ?? 0);
    total += effectiveSize * HEAL_PER_GEM * groupSizeMultiplier(group.size);
  }
  return Math.round(total * comboMultiplier(combo) * (relicMods?.healMultiplier ?? 1));
}

