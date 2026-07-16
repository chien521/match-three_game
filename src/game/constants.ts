// Core tunables for the match-3 board. Adjust these to change board size/difficulty.
// 6x5 matches the classic Puzzle & Dragons / Tower of Saviors layout.
export const BOARD_COLS = 6;
export const BOARD_ROWS = 5;
export const TILE_SIZE = 96;
export const BOARD_MARGIN = 16;

// Number of distinct gem colors/types in play (5 elements + 1 heart/heal orb).
export const GEM_TYPE_COUNT = 6;

// Hex colors used to render placeholder gem textures (index = gem type).
export const GEM_COLORS: number[] = [
  0xe74c3c, // red (Fire)
  0x3498db, // blue (Water)
  0x2ecc71, // green (Wood)
  0xf1c40f, // yellow (Light)
  0x9b59b6, // purple (Dark)
  0xff6fae, // pink (Heart - heals instead of dealing damage)
];

// Elemental names, index-aligned with GEM_COLORS / gem type (0-4 only; index 5 is the Heart orb).
export const ELEMENT_NAMES = ['Fire', 'Water', 'Wood', 'Light', 'Dark'];

// Gem type index reserved for the non-elemental Heart/heal orb.
export const HEART_TYPE = 5;

// HP restored to the player per matched Heart orb (before combo scaling).
export const HEAL_PER_GEM = 20;

export const EMPTY = -1;

// Grid value for a petrified cell (enemy "petrify" skill). Stones are cell-
// fixed: they block gravity, can't be picked up/displaced, and never match.
export const STONE = -2;

// Player HP lost per burning cell each time BattleState.tickEnemyTurn causes
// GameScene to tick the board's burning state (enemy "ignite" skill).
export const BURN_DAMAGE_PER_CELL = 6;

// Chance (0-1) that a freshly spawned gem (gravity refill) is "enhanced"
// (+50% power, see game/team.ts's computeGroupBaseDamage/computeHealAmount).
export const ENHANCED_SPAWN_CHANCE = 0.06;

// Battle tuning: the delay before the enemy retaliates after the player's
// cascade finishes resolving. Damage itself comes from each team member's
// attack stat (see game/team.ts), scaled by matched gem count and combo.
export const ENEMY_ATTACK_DELAY_MS = 500;

// Time limit (ms) to drag a gem before the turn is forced to end.
export const TURN_TIME_MS = 5000;
