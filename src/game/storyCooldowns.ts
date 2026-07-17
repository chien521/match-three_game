/**
 * One-shot "baton pass" for skill cooldowns between story-mode levels within
 * the same branch chain. `scene.restart()` (the "Next Level ▶" flow) always
 * rebuilds a brand-new BattleState, whose constructor zeroes skillCooldowns —
 * without this, spamming skills every fresh level would make matching gems
 * optional. carryCooldownsForward() is called right before the restart;
 * takeCarriedCooldowns() is called right after building the new BattleState
 * and immediately clears the stored value, so it can only ever apply once.
 * Every other entry into GameScene (a fresh node click from the level map,
 * retrying after defeat) never writes this key, so cooldowns correctly stay
 * at their fresh-zero default in those cases.
 */

const STORAGE_KEY = 'match3-carry-cooldowns';

export function carryCooldownsForward(cooldowns: number[]): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(cooldowns));
  } catch {
    // Storage unavailable — cooldowns just won't carry into the next level.
  }
}

export function takeCarriedCooldowns(): number[] | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(STORAGE_KEY);
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every((n) => typeof n === 'number')) return null;
    return parsed;
  } catch {
    return null;
  }
}
