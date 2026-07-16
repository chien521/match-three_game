/**
 * Maps enemy names to a representative emoji "sprite". Pure lookup so it can
 * be unit-tested; scenes render the emoji as a large Text object (Windows /
 * macOS render color emoji natively, no image assets needed).
 *
 * Order matters: more specific creature words are checked before generic
 * boss-title words so e.g. "Slime King" stays a slime (bosses get a crown
 * overlay from the scene instead).
 */
const EMOJI_RULES: [RegExp, string][] = [
  [/slime queen/i, '👑'],
  [/goblin pyro/i, '🔥'],
  [/goblin geomancer/i, '🪨'],
  [/venom wyvern/i, '🐍'],
  [/dragon|wyvern|whelp/i, '🐉'],
  [/drake/i, '🐲'],
  [/bat/i, '🦇'],
  [/slime|ooze/i, '🟢'],
  [/shaman|witch|mage/i, '🧙'],
  [/chief|warlord|ogre/i, '👹'],
  [/goblin|hob/i, '👺'],
  [/wolf/i, '🐺'],
  [/spider/i, '🕷️'],
  [/skeleton|bone/i, '💀'],
  [/ghost|wraith|specter/i, '👻'],
];

export const DEFAULT_ENEMY_EMOJI = '👾';

export function enemyEmoji(name: string): string {
  for (const [pattern, emoji] of EMOJI_RULES) {
    if (pattern.test(name)) return emoji;
  }
  return DEFAULT_ENEMY_EMOJI;
}
