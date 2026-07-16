import type { Character, Rarity } from './team';
import { CHARACTER_POOL } from './characterPool';

export const PULL_COST = 5;

const RARITY_WEIGHTS: Record<Rarity, number> = {
  Common: 0.6,
  Rare: 0.3,
  SSR: 0.1,
};

function rollRarity(rng: () => number): Rarity {
  const roll = rng();
  let cumulative = 0;
  for (const rarity of Object.keys(RARITY_WEIGHTS) as Rarity[]) {
    cumulative += RARITY_WEIGHTS[rarity];
    if (roll < cumulative) return rarity;
  }
  return 'Common';
}

/** Draws one random character from the pool, weighted by rarity. */
export function rollGacha(rng: () => number = Math.random): Character {
  const rarity = rollRarity(rng);
  const candidates = CHARACTER_POOL.filter((c) => c.rarity === rarity);
  const pool = candidates.length > 0 ? candidates : CHARACTER_POOL;
  const index = Math.floor(rng() * pool.length);
  return pool[index];
}

/** Draws `count` independent gacha pulls (duplicates allowed). */
export function rollGachaMulti(count: number, rng: () => number = Math.random): Character[] {
  const results: Character[] = [];
  for (let i = 0; i < count; i++) results.push(rollGacha(rng));
  return results;
}
