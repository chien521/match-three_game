/**
 * Maps character ids to an emoji "portrait". Pure lookup so it can be
 * unit-tested; scenes wrap the emoji in an element-colored ring (see
 * scenes/avatarUi.ts). Deliberately uses only single-code-point emoji (plus
 * optional VS16) — no ZWJ sequences, which render as broken pairs on older
 * systems.
 *
 * This is the single swap point if portraits ever upgrade to real art:
 * replace the emoji with texture keys and update drawAvatar.
 */
const CHARACTER_EMOJI: Record<string, string> = {
  firebrand: '⚔️',
  'aqua-knight': '🛡️',
  'woodland-archer': '🏹',
  solaris: '☀️',
  nightshade: '🌙',
  'ember-pup': '🐶',
  'tide-sprite': '🧚',
  'sprout-scout': '🌱',
  'chrono-imp': '⏳',
  'phoenix-empress': '🦅',
  'abyssal-queen': '🦑',
  'astral-sorceress': '🔮',
};

export const DEFAULT_CHARACTER_EMOJI = '👤';

export function characterEmoji(id: string): string {
  return CHARACTER_EMOJI[id] ?? DEFAULT_CHARACTER_EMOJI;
}
