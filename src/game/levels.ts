/**
 * Enemy interference skills (Tower of Saviors-style). All skills on one
 * enemy are independent and can coexist (e.g. shield + charge + ignite):
 * - shield: reduces all damage the enemy takes by `damageReduction` for the
 *   first `durationTurns` player turns of the fight.
 * - lock: every time the enemy attacks, it also locks `lockCount` random gems
 *   on the board; locked gems can't be dragged (clearing them unlocks them).
 * - charge: replaces the normal attack cycle. Counts down `chargeTurns`
 *   player turns, then hits for attack * `multiplier`. If cumulative damage
 *   dealt to the enemy during the current charge window reaches
 *   `interruptRatio` * maxHp, the charge breaks (no hit) and restarts.
 * - enrage: one-shot and permanent — the first time hp/maxHp drops below
 *   `hpThreshold`, attack is multiplied by `attackMultiplier`.
 * - selfHeal: every `everyTurns` player turns, the enemy heals `amount`
 *   (capped at maxHp), on its own independent countdown.
 * - convertGems: when the enemy attacks, converts up to `count` random gems
 *   of type `from` to `to` (the scene applies this to the board).
 * - poison: applied to the player when the enemy attacks; doesn't stack —
 *   keeps the larger `damagePerTurn` and resets `durationTurns`.
 * - petrify / ignite: when the enemy attacks, petrifies `count` gems into
 *   stones or ignites `count` gems for `durationTurns` (the scene applies
 *   this to the board — see game/Board.ts's petrifyRandomCells/igniteRandomCells).
 */
export type EnemySkillConfig =
  | { type: 'shield'; damageReduction: number; durationTurns: number }
  | { type: 'lock'; lockCount: number }
  | { type: 'charge'; chargeTurns: number; multiplier: number; interruptRatio: number }
  | { type: 'enrage'; hpThreshold: number; attackMultiplier: number }
  | { type: 'selfHeal'; amount: number; everyTurns: number }
  | { type: 'convertGems'; from: number; to: number; count: number }
  | { type: 'poison'; damagePerTurn: number; durationTurns: number }
  | { type: 'petrify'; count: number }
  | { type: 'ignite'; count: number; durationTurns: number };

export interface EnemyConfig {
  name: string;
  maxHp: number;
  attack: number;
  element: number; // 0=Fire,1=Water,2=Wood,3=Light,4=Dark
  /** Turns between enemy attacks (default 1 = attacks every turn). */
  attackInterval?: number;
  /** @deprecated use `skills` instead; kept as a one-element alias. */
  skill?: EnemySkillConfig;
  /** All interference skills this enemy has; independent and can coexist. */
  skills?: EnemySkillConfig[];
  /** Marks a boss enemy (bigger sprite, BOSS splash on entry). */
  boss?: boolean;
}

export interface ChapterInfo {
  title: string;
  /** Indices into LEVELS/LEVEL_NAMES/LEVEL_STORY that belong to this chapter. */
  levelIndices: number[];
}

/**
 * Per-level board/turn rules layered on top of the default battle (all
 * optional — omitting a field keeps the default behavior).
 */
export interface LevelRules {
  /** Lose ("Out of Turns") if the level isn't cleared within this many player turns. */
  turnLimit?: number;
  /** Subset of gem types (0..GEM_TYPE_COUNT-1) that spawn on the board; omit for all types. */
  gemColors?: number[];
  /** Overrides the drag/turn timer (ms) for this level. */
  moveTimeMs?: number;
}

/** How a level's star rating (1-3) is computed on clear. */
export type StarCriteria =
  | { type: 'hpRatio' }
  | { type: 'turns'; threeStar: number; twoStar: number };

/**
 * Level structure: an ordered list of enemies to fight. Clearing the last
 * enemy in a level completes it and advances to the next level. Difficulty
 * is baked directly into each level's stats (no separate difficulty
 * multiplier) — the story campaign IS the difficulty curve.
 */
export interface LevelConfig {
  name: string;
  story: string;
  enemies: EnemyConfig[];
  /** Board/turn rules for this level; omit for the default battle. */
  rules?: LevelRules;
  /** Star-rating rule for clearing this level; omit for the default (remaining-HP) rule. */
  starCriteria?: StarCriteria;
}

export const LEVELS: LevelConfig[] = [
  // Chapter 1: The Slime Outbreak
  {
    name: 'Slime Meadow',
    story:
      'Strange tremors shake the meadow at the edge of town. Slimes are massing in numbers no one has seen before.',
    enemies: [{ name: 'Slime', maxHp: 100, attack: 6, element: 2 }],
  },
  {
    name: "Slime Queen's Nest",
    story: 'Deeper in the forest, the slimes have built a nest around something... or someone.',
    enemies: [
      { name: 'Slime', maxHp: 110, attack: 7, element: 2 },
      {
        name: 'Slime Queen',
        maxHp: 170,
        attack: 10,
        element: 2,
        skills: [{ type: 'convertGems', from: 5, to: 2, count: 3 }],
      },
    ],
  },
  {
    name: 'Slime King',
    story: 'A towering Slime King rises from the nest, absorbing every lesser slime in its path.',
    enemies: [
      {
        name: 'Slime King',
        maxHp: 300,
        attack: 24,
        element: 2,
        attackInterval: 2,
        skills: [
          { type: 'shield', damageReduction: 0.5, durationTurns: 3 },
          { type: 'selfHeal', amount: 30, everyTurns: 3 },
          { type: 'enrage', hpThreshold: 0.3, attackMultiplier: 1.5 },
        ],
        boss: true,
      },
    ],
  },

  // Chapter 2: The Goblin Uprising
  {
    name: 'Goblin Outpost',
    story: "With the slimes cleared, scouts report goblin war-drums echoing from the northern hills.",
    enemies: [
      { name: 'Goblin', maxHp: 170, attack: 13, element: 0 },
      {
        name: 'Goblin Pyro',
        maxHp: 160,
        attack: 14,
        element: 0,
        attackInterval: 2,
        skills: [{ type: 'ignite', count: 2, durationTurns: 3 }],
      },
    ],
  },
  {
    name: 'Goblin War Camp',
    story: 'The goblin camp is larger than expected — and a geomancer channels the earth itself against you.',
    enemies: [
      { name: 'Goblin', maxHp: 180, attack: 14, element: 0 },
      {
        name: 'Goblin Geomancer',
        maxHp: 200,
        attack: 16,
        element: 2,
        attackInterval: 2,
        skills: [{ type: 'petrify', count: 1 }],
      },
    ],
    rules: { turnLimit: 18 },
    starCriteria: { type: 'turns', threeStar: 12, twoStar: 15 },
  },
  {
    name: 'Goblin Chief',
    story: 'The Goblin Chief himself steps forward, wielding a blade forged from stolen village iron.',
    enemies: [
      {
        name: 'Goblin Chief',
        maxHp: 400,
        attack: 20,
        element: 1,
        skills: [
          { type: 'lock', lockCount: 2 },
          { type: 'charge', chargeTurns: 3, multiplier: 3, interruptRatio: 0.15 },
        ],
        boss: true,
      },
    ],
  },

  // Chapter 3: The Dragon's Return
  {
    name: "Dragon's Foothills",
    story: 'Smoke rises over the mountains. A venomous wyvern coils across the only path forward.',
    enemies: [
      {
        name: 'Venom Wyvern',
        maxHp: 360,
        attack: 20,
        element: 4,
        attackInterval: 2,
        skills: [{ type: 'poison', damagePerTurn: 6, durationTurns: 3 }],
      },
    ],
    rules: { gemColors: [0, 2, 4, 5] },
  },
  {
    name: "Dragon's Lair Entrance",
    story: 'Whelps circle the cave entrance, guarding the path to their sleeping parent.',
    enemies: [
      {
        name: 'Dragon Whelp',
        maxHp: 290,
        attack: 18,
        element: 4,
        skills: [{ type: 'ignite', count: 2, durationTurns: 2 }],
      },
      {
        name: 'Dragon Whelp',
        maxHp: 290,
        attack: 18,
        element: 4,
        skills: [{ type: 'convertGems', from: 5, to: 4, count: 3 }],
      },
    ],
    rules: { turnLimit: 16 },
    starCriteria: { type: 'turns', threeStar: 11, twoStar: 14 },
  },
  {
    name: 'Ancient Dragon',
    story: 'The Ancient Dragon awakens. This is the fight your team was assembled for.',
    enemies: [
      {
        name: 'Ancient Dragon',
        maxHp: 700,
        attack: 34,
        element: 4,
        skills: [
          { type: 'shield', damageReduction: 0.3, durationTurns: 3 },
          { type: 'charge', chargeTurns: 2, multiplier: 2.5, interruptRatio: 0.2 },
          { type: 'enrage', hpThreshold: 0.4, attackMultiplier: 1.4 },
          { type: 'ignite', count: 3, durationTurns: 2 },
        ],
        boss: true,
      },
    ],
    rules: { moveTimeMs: 4000 },
  },
];

/** Display names for the level-select menu, index-aligned with LEVELS. */
export const LEVEL_NAMES = LEVELS.map((level) => level.name);

/** Narration shown before each level starts, index-aligned with LEVELS. */
export const LEVEL_STORY = LEVELS.map((level) => level.story);

/** Chapter groupings for the level-select map. */
export const CHAPTERS: ChapterInfo[] = [
  { title: 'Ch.1 — The Slime Outbreak', levelIndices: [0, 1, 2] },
  { title: 'Ch.2 — The Goblin Uprising', levelIndices: [3, 4, 5] },
  { title: "Ch.3 — The Dragon's Return", levelIndices: [6, 7, 8] },
];
