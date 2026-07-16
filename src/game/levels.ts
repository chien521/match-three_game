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
 * Level structure: an ordered list of enemies to fight. Levels form a graph,
 * not a line — each level names the level ids that must be cleared before it
 * unlocks (`unlockRequires`), which is what lets the campaign fan out into
 * three parallel elemental branches after the prologue and converge again
 * for the final chapter. Difficulty is baked directly into each level's
 * stats — the campaign IS the difficulty curve.
 */
export interface LevelConfig {
  /** Stable id used for unlock requirements and star-progress storage. */
  id: string;
  name: string;
  story: string;
  enemies: EnemyConfig[];
  /** Level ids that must all be cleared before this level unlocks (empty = always open). */
  unlockRequires: string[];
  /** Board/turn rules for this level; omit for the default battle. */
  rules?: LevelRules;
  /** Star-rating rule for clearing this level; omit for the default (remaining-HP) rule. */
  starCriteria?: StarCriteria;
}

/** A column of levels on the campaign map (prologue, one of the three elemental branches, or the final chapter). */
export interface BranchInfo {
  id: string;
  title: string;
  /** Dominant enemy element of the branch (undefined for the prologue/final chapter). */
  element?: number;
  /** Level ids in play order within the branch. */
  levelIds: string[];
  /** Map column: 'single' spans the center; left/center/right are the parallel branches. */
  column: 'single' | 'left' | 'center' | 'right';
}

export const LEVELS: LevelConfig[] = [
  // Prologue — shared tutorial levels, always the entry point.
  {
    id: 'prologue-1',
    name: 'Sleepy Slime Path',
    story:
      'A lone slime dozes on the road out of town — the gentlest possible start to a very bad month.',
    enemies: [{ name: 'Slime', maxHp: 60, attack: 4, element: 2 }],
    unlockRequires: [],
  },
  {
    id: 'prologue-2',
    name: "Warband's Warning",
    story:
      'A slime scout watches you from the treeline, biding its time — strike before its countdown reaches zero.',
    enemies: [{ name: 'Slime Scout', maxHp: 80, attack: 6, element: 2, attackInterval: 2 }],
    unlockRequires: ['prologue-1'],
  },

  // Fire branch — the Goblin Uprising.
  {
    id: 'fire-1',
    name: 'Goblin Outpost',
    story:
      'Goblin war-drums echo from the burning hills to the west — one of three warbands rising at once.',
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
    unlockRequires: ['prologue-2'],
  },
  {
    id: 'fire-2',
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
    unlockRequires: ['fire-1'],
    rules: { turnLimit: 18 },
    starCriteria: { type: 'turns', threeStar: 12, twoStar: 15 },
  },
  {
    id: 'fire-3',
    name: 'Goblin Chief',
    story: 'The Goblin Chief himself steps forward, wielding a blade forged from stolen village iron.',
    enemies: [
      {
        name: 'Goblin Chief',
        maxHp: 400,
        attack: 20,
        element: 0,
        skills: [
          { type: 'lock', lockCount: 2 },
          { type: 'charge', chargeTurns: 3, multiplier: 3, interruptRatio: 0.15 },
        ],
        boss: true,
      },
    ],
    unlockRequires: ['fire-2'],
  },

  // Water branch — the Drowned Tide.
  {
    id: 'water-1',
    name: 'Tideway Naga',
    story:
      'Meanwhile, along the flooded coast, a naga scout laces the tidewater with venom — outlast the poison.',
    enemies: [
      {
        name: 'Naga Scout',
        maxHp: 190,
        attack: 14,
        element: 1,
        skills: [{ type: 'poison', damagePerTurn: 5, durationTurns: 3 }],
      },
    ],
    unlockRequires: ['prologue-2'],
  },
  {
    id: 'water-2',
    name: 'Coral Sentinel',
    story: 'A warden of living coral bars the reef path, turning gems to stone with every crashing wave.',
    enemies: [
      {
        name: 'Coral Warden',
        maxHp: 210,
        attack: 16,
        element: 1,
        attackInterval: 2,
        skills: [{ type: 'petrify', count: 1 }],
      },
    ],
    unlockRequires: ['water-1'],
  },
  {
    id: 'water-3',
    name: 'Leviathan Queen',
    story:
      'The queen of the drowned tide surfaces at last — she cannot burst you down, but her venom and healing will outlast the careless.',
    enemies: [
      {
        name: 'Leviathan Queen',
        maxHp: 420,
        attack: 22,
        element: 1,
        skills: [
          { type: 'shield', damageReduction: 0.4, durationTurns: 3 },
          { type: 'selfHeal', amount: 40, everyTurns: 3 },
          { type: 'poison', damagePerTurn: 8, durationTurns: 3 },
        ],
        boss: true,
      },
    ],
    unlockRequires: ['water-2'],
  },

  // Wood branch — the Slime Outbreak.
  {
    id: 'wood-1',
    name: 'Slime Meadow',
    story:
      'Strange tremors shake the meadow at the edge of town. Slimes are massing in numbers no one has seen before.',
    enemies: [{ name: 'Slime', maxHp: 100, attack: 6, element: 2 }],
    unlockRequires: ['prologue-2'],
  },
  {
    id: 'wood-2',
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
    unlockRequires: ['wood-1'],
  },
  {
    id: 'wood-3',
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
    unlockRequires: ['wood-2'],
  },

  // Final chapter — unlocked only once all three branch bosses are down.
  {
    id: 'final-1',
    name: "Dragon's Foothills",
    story:
      'Goblins, naga, slimes — three warbands, one truth: all of them were gathering tribute for something waking beneath the mountain.',
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
    unlockRequires: ['fire-3', 'water-3', 'wood-3'],
    rules: { gemColors: [0, 2, 4, 5] },
  },
  {
    id: 'final-2',
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
    unlockRequires: ['final-1'],
    rules: { turnLimit: 16 },
    starCriteria: { type: 'turns', threeStar: 11, twoStar: 14 },
  },
  {
    id: 'final-3',
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
    unlockRequires: ['final-2'],
    rules: { moveTimeMs: 4000 },
  },
];

/** Campaign map columns: prologue at the bottom, three parallel branches, final chapter on top. */
export const BRANCHES: BranchInfo[] = [
  {
    id: 'prologue',
    title: 'Prologue',
    levelIds: ['prologue-1', 'prologue-2'],
    column: 'single',
  },
  {
    id: 'fire',
    title: '🔥 The Goblin Uprising',
    element: 0,
    levelIds: ['fire-1', 'fire-2', 'fire-3'],
    column: 'left',
  },
  {
    id: 'water',
    title: '🌊 The Drowned Tide',
    element: 1,
    levelIds: ['water-1', 'water-2', 'water-3'],
    column: 'center',
  },
  {
    id: 'wood',
    title: '🌿 The Slime Outbreak',
    element: 2,
    levelIds: ['wood-1', 'wood-2', 'wood-3'],
    column: 'right',
  },
  {
    id: 'final',
    title: "🐉 The Dragon's Return",
    levelIds: ['final-1', 'final-2', 'final-3'],
    column: 'single',
  },
];

/** Looks up a level by its stable id. */
export function levelById(id: string): LevelConfig | undefined {
  return LEVELS.find((level) => level.id === id);
}

/** The branch a level belongs to (every level id appears in exactly one branch). */
export function branchForLevel(levelId: string): BranchInfo | undefined {
  return BRANCHES.find((branch) => branch.levelIds.includes(levelId));
}

/** The id of the next level within the same branch, or null at a branch's end. */
export function nextLevelIdInBranch(levelId: string): string | null {
  const branch = branchForLevel(levelId);
  if (!branch) return null;
  const index = branch.levelIds.indexOf(levelId);
  return index >= 0 && index < branch.levelIds.length - 1 ? branch.levelIds[index + 1] : null;
}

/** Display names, index-aligned with LEVELS (array order is for readability only — unlocks use ids). */
export const LEVEL_NAMES = LEVELS.map((level) => level.name);

/** Narration shown before each level starts, index-aligned with LEVELS. */
export const LEVEL_STORY = LEVELS.map((level) => level.story);
