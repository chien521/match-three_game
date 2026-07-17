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
  [/naga/i, '🧜'],
  [/coral/i, '🪸'],
  [/leviathan/i, '🐋'],
  [/salamander/i, '🦎'],
  [/dragon|wyvern|whelp/i, '🐉'],
  [/drake/i, '🐲'],
  [/griffon/i, '🦅'],
  [/harpy/i, '🦅'],
  [/bat/i, '🦇'],
  [/slime|ooze/i, '🟢'],
  [/shaman|witch|mage/i, '🧙'],
  [/chief|warlord|ogre/i, '👹'],
  [/goblin|hob/i, '👺'],
  [/wolf/i, '🐺'],
  [/spider/i, '🕷️'],
  [/lich/i, '💀'],
  [/wight/i, '🧟'],
  [/skeleton|bone/i, '💀'],
  [/seraph/i, '😇'],
  [/ghost|revenant|husk|wraith|specter/i, '👻'],
  // Chapter 2 & 3 additions.
  [/demon/i, '😈'],
  [/kraken/i, '🐙'],
  [/serpent/i, '🐍'],
  [/glacial|frost/i, '🧊'],
  [/blight|fungal|broodmother/i, '🍄'],
  [/thornspire|thorn|root/i, '🌳'],
  [/tremor/i, '🪨'],
  [/trench|abyssal/i, '🌊'],
  [/forge/i, '🔥'],
  [/bastion|watcher|archon/i, '🛡️'],
  [/choir|cantor/i, '🎼'],
  [/devourer|oblivion|gatekeeper/i, '🌑'],
  [/colossus/i, '🗿'],
  [/ashfolk/i, '🔥'],
];

export const DEFAULT_ENEMY_EMOJI = '👾';

export function enemyEmoji(name: string): string {
  for (const [pattern, emoji] of EMOJI_RULES) {
    if (pattern.test(name)) return emoji;
  }
  return DEFAULT_ENEMY_EMOJI;
}
