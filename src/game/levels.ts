/**
 * Simple enemy interference skills (Tower of Saviors-style):
 * - shield: reduces all damage the enemy takes by `damageReduction` for the
 *   first `durationTurns` player turns of the fight.
 * - lock: every time the enemy attacks, it also locks `lockCount` random gems
 *   on the board; locked gems can't be dragged (clearing them unlocks them).
 */
export type EnemySkillConfig =
  | { type: 'shield'; damageReduction: number; durationTurns: number }
  | { type: 'lock'; lockCount: number };

export interface EnemyConfig {
  name: string;
  maxHp: number;
  attack: number;
  element: number; // 0=Fire,1=Water,2=Wood,3=Light,4=Dark
  /** Turns between enemy attacks (default 1 = attacks every turn). */
  attackInterval?: number;
  skill?: EnemySkillConfig;
  /** Marks a boss enemy (bigger sprite, BOSS splash on entry). */
  boss?: boolean;
}

export interface ChapterInfo {
  title: string;
  /** Indices into LEVELS/LEVEL_NAMES/LEVEL_STORY that belong to this chapter. */
  levelIndices: number[];
}

/**
 * Level structure: an ordered list of enemies to fight. Clearing the last
 * enemy in a level completes it and advances to the next level. Difficulty
 * is baked directly into each level's stats (no separate difficulty
 * multiplier) — the story campaign IS the difficulty curve.
 */
export const LEVELS: EnemyConfig[][] = [
  // Chapter 1: The Slime Outbreak
  [{ name: 'Slime', maxHp: 100, attack: 6, element: 2 }],
  [
    { name: 'Slime', maxHp: 110, attack: 7, element: 2 },
    { name: 'Big Slime', maxHp: 160, attack: 10, element: 2 },
  ],
  [
    {
      name: 'Slime King',
      maxHp: 280,
      attack: 26,
      element: 2,
      attackInterval: 2,
      skill: { type: 'shield', damageReduction: 0.5, durationTurns: 3 },
      boss: true,
    },
  ],

  // Chapter 2: The Goblin Uprising
  [{ name: 'Goblin', maxHp: 180, attack: 14, element: 0 }],
  [
    { name: 'Goblin', maxHp: 190, attack: 15, element: 0 },
    { name: 'Goblin Shaman', maxHp: 170, attack: 18, element: 1 },
  ],
  [
    {
      name: 'Goblin Chief',
      maxHp: 380,
      attack: 24,
      element: 1,
      skill: { type: 'lock', lockCount: 2 },
      boss: true,
    },
  ],

  // Chapter 3: The Dragon's Return
  [{ name: 'Wyvern', maxHp: 350, attack: 22, element: 4 }],
  [
    { name: 'Dragon Whelp', maxHp: 300, attack: 20, element: 4 },
    { name: 'Dragon Whelp', maxHp: 300, attack: 20, element: 4 },
  ],
  [
    {
      name: 'Ancient Dragon',
      maxHp: 650,
      attack: 62,
      element: 4,
      attackInterval: 2,
      skill: { type: 'shield', damageReduction: 0.3, durationTurns: 4 },
      boss: true,
    },
  ],
];

/** Display names for the level-select menu, index-aligned with LEVELS. */
export const LEVEL_NAMES = [
  'Slime Meadow',
  "Slime Queen's Nest",
  'Slime King',
  'Goblin Outpost',
  'Goblin War Camp',
  'Goblin Chief',
  "Dragon's Foothills",
  "Dragon's Lair Entrance",
  'Ancient Dragon',
];

/** Narration shown before each level starts, index-aligned with LEVELS. */
export const LEVEL_STORY = [
  'Strange tremors shake the meadow at the edge of town. Slimes are massing in numbers no one has seen before.',
  'Deeper in the forest, the slimes have built a nest around something... or someone.',
  'A towering Slime King rises from the nest, absorbing every lesser slime in its path.',
  "With the slimes cleared, scouts report goblin war-drums echoing from the northern hills.",
  'The goblin camp is larger than expected — and a shaman channels dark magic from its center.',
  'The Goblin Chief himself steps forward, wielding a blade forged from stolen village iron.',
  'Smoke rises over the mountains. Something ancient has stirred in its lair.',
  'Whelps circle the cave entrance, guarding the path to their sleeping parent.',
  'The Ancient Dragon awakens. This is the fight your team was assembled for.',
];

/** Chapter groupings for the level-select map. */
export const CHAPTERS: ChapterInfo[] = [
  { title: 'Ch.1 — The Slime Outbreak', levelIndices: [0, 1, 2] },
  { title: 'Ch.2 — The Goblin Uprising', levelIndices: [3, 4, 5] },
  { title: "Ch.3 — The Dragon's Return", levelIndices: [6, 7, 8] },
];
