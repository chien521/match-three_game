import { DEFAULT_TEAM } from './team';
import type { Character } from './team';
import { findCharacterTemplate } from './characterPool';
import type { StarCriteria } from './levels';
import { levelById } from './levels';

const STORAGE_KEY = 'match3-player-data';
const STARTING_CURRENCY = 20;
const MAX_TEAM_SIZE = 5;
const LEVEL_BONUS_PER_COPY = 0.1; // +10% maxHp/attack per extra copy owned
const MAX_LEVEL = 5;

// Currency rewards earned during battle (see GameScene.handleEnemyDefeated).
export const CURRENCY_PER_ENEMY_DEFEAT = 3;
export const CURRENCY_PER_LEVEL_CLEAR = 10;
export const CURRENCY_GAME_CLEAR_BONUS = 30;

export interface OwnedCharacter {
  id: string;
  copies: number;
}

export interface PlayerData {
  currency: number;
  owned: OwnedCharacter[];
  activeTeamIds: string[];
  /** Best star rating (1-3) earned per story level, keyed by level id; absent = not cleared. */
  levelStars: Record<string, number>;
}

/**
 * The flat 9-level order used before the campaign became a branch graph
 * (Slime arc, Goblin arc, Dragon arc). Old saves stored levelStars as an
 * array indexed by this order; migrateLevelStars maps them onto level ids.
 */
const LEGACY_LEVEL_ID_ORDER = [
  'wood-1',
  'wood-2',
  'wood-3',
  'fire-1',
  'fire-2',
  'fire-3',
  'final-1',
  'final-2',
  'final-3',
];

/** Converts any stored levelStars shape (legacy array, id map, or garbage) to the id-keyed map. */
export function migrateLevelStars(raw: unknown): Record<string, number> {
  if (Array.isArray(raw)) {
    const stars: Record<string, number> = {};
    raw.forEach((value, index) => {
      const id = LEGACY_LEVEL_ID_ORDER[index];
      if (id && typeof value === 'number' && value > 0) stars[id] = value;
    });
    return stars;
  }
  if (raw !== null && typeof raw === 'object') {
    const stars: Record<string, number> = {};
    for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof value === 'number' && value > 0) stars[id] = value;
    }
    return stars;
  }
  return {};
}

function defaultPlayerData(): PlayerData {
  const owned = DEFAULT_TEAM.map((c) => ({ id: c.id, copies: 1 }));
  return {
    currency: STARTING_CURRENCY,
    owned,
    activeTeamIds: DEFAULT_TEAM.map((c) => c.id),
    levelStars: {},
  };
}

export function loadPlayerData(): PlayerData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultPlayerData();
    const parsed = JSON.parse(raw) as PlayerData;
    if (!parsed.owned || !parsed.activeTeamIds) return defaultPlayerData();
    // Older saves stored levelStars as a position-indexed array (or not at all).
    parsed.levelStars = migrateLevelStars(parsed.levelStars);
    return parsed;
  } catch {
    return defaultPlayerData();
  }
}

export function savePlayerData(data: PlayerData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Storage unavailable (e.g. private browsing) — progress just won't persist.
  }
}

/** Adds currency (e.g. battle rewards), never below 0. */
export function addCurrency(data: PlayerData, amount: number): PlayerData {
  return { ...data, currency: Math.max(0, data.currency + amount) };
}

/** Star rating for clearing a story level, from remaining HP fraction. */
export function starsForClear(hpRatio: number): number {
  if (hpRatio >= 0.7) return 3;
  if (hpRatio >= 0.35) return 2;
  return 1;
}

/**
 * Star rating for clearing a story level under its configured criteria:
 * undefined or `{type:'hpRatio'}` delegates to the existing remaining-HP
 * rule (starsForClear); `{type:'turns'}` instead rewards finishing within a
 * turn budget (fewer turns used = more stars).
 */
export function starsForLevel(
  criteria: StarCriteria | undefined,
  r: { hpRatio: number; turnsUsed: number },
): number {
  if (!criteria || criteria.type === 'hpRatio') return starsForClear(r.hpRatio);
  if (r.turnsUsed <= criteria.threeStar) return 3;
  if (r.turnsUsed <= criteria.twoStar) return 2;
  return 1;
}

/** Records a story level clear, keeping the best star rating earned so far. */
export function recordLevelClear(data: PlayerData, levelId: string, stars: number): PlayerData {
  const clamped = Math.max(1, Math.min(3, stars));
  const levelStars = { ...data.levelStars };
  levelStars[levelId] = Math.max(levelStars[levelId] ?? 0, clamped);
  return { ...data, levelStars };
}

/**
 * A level unlocks once every level named in its `unlockRequires` has been
 * cleared. A level that has itself been cleared is always unlocked (it stays
 * replayable — this also keeps levels cleared under the old linear campaign
 * accessible for migrated saves that never played the new prologue).
 */
export function isLevelUnlocked(data: PlayerData, levelId: string): boolean {
  const level = levelById(levelId);
  if (!level) return false;
  if ((data.levelStars[levelId] ?? 0) > 0) return true;
  return level.unlockRequires.every((requiredId) => (data.levelStars[requiredId] ?? 0) > 0);
}

/** Adds one copy of a character to the player's collection (or increments copies if already owned). */
export function addCharacter(data: PlayerData, characterId: string): PlayerData {
  const existing = data.owned.find((o) => o.id === characterId);
  const owned = existing
    ? data.owned.map((o) => (o.id === characterId ? { ...o, copies: Math.min(o.copies + 1, MAX_LEVEL) } : o))
    : [...data.owned, { id: characterId, copies: 1 }];
  return { ...data, owned };
}

/** Character "level" = number of copies owned (capped), used to scale stats. */
export function levelFor(copies: number): number {
  return Math.max(1, Math.min(copies, MAX_LEVEL));
}

/** Returns a Character with maxHp/attack scaled up based on owned copies ("evolution"). */
export function leveledCharacter(template: Character, copies: number): Character {
  const level = levelFor(copies);
  const multiplier = 1 + (level - 1) * LEVEL_BONUS_PER_COPY;
  return {
    ...template,
    maxHp: Math.round(template.maxHp * multiplier),
    attack: Math.round(template.attack * multiplier),
  };
}

/** All characters the player owns, with level-scaled stats, for codex/team-formation UI. */
export function getOwnedCharacters(data: PlayerData): { character: Character; copies: number }[] {
  return data.owned
    .map((o) => {
      const template = findCharacterTemplate(o.id);
      if (!template) return undefined;
      return { character: leveledCharacter(template, o.copies), copies: o.copies };
    })
    .filter((entry): entry is { character: Character; copies: number } => entry !== undefined);
}

/** The player's active battle team, with level-scaled stats, honoring team-slot order. */
export function getActiveTeam(data: PlayerData): Character[] {
  const owned = getOwnedCharacters(data);
  const team = data.activeTeamIds
    .map((id) => owned.find((o) => o.character.id === id)?.character)
    .filter((c): c is Character => c !== undefined);
  return team.length > 0 ? team : DEFAULT_TEAM;
}

export function setActiveTeam(data: PlayerData, teamIds: string[]): PlayerData {
  return { ...data, activeTeamIds: teamIds.slice(0, MAX_TEAM_SIZE) };
}

export { MAX_TEAM_SIZE };
