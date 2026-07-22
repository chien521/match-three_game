import { HEART_TYPE } from './constants';
import { elementName } from './team';
import { t, tr } from './i18n';

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

/** Readable label for a gem type index, honoring the Heart orb's special name. */
function gemTypeLabel(type: number): string {
  return type === HEART_TYPE ? t('elementHeart') : tr(elementName(type));
}

/** Every active rule on this level as a full sentence (for the pre-battle story intro). */
export function levelRuleLines(rules: LevelRules | undefined): string[] {
  if (!rules) return [];
  const lines: string[] = [];
  if (rules.turnLimit !== undefined) {
    lines.push(t('ruleTurnLimit', { n: rules.turnLimit }));
  }
  if (rules.gemColors !== undefined) {
    lines.push(t('ruleGemColors', { colors: rules.gemColors.map(gemTypeLabel).join(t('listSeparator')) }));
  }
  if (rules.moveTimeMs !== undefined) {
    lines.push(t('ruleMoveTime', { sec: Math.round((rules.moveTimeMs / 1000) * 10) / 10 }));
  }
  return lines;
}

/**
 * The one rule line worth keeping visible for the whole battle that ISN'T
 * already covered by the live turn counter (gemColors/moveTimeMs are static
 * for the fight; turnLimit gets its own live "Turn c/l" display instead).
 */
export function staticLevelRuleLine(rules: LevelRules | undefined): string | undefined {
  if (!rules) return undefined;
  if (rules.gemColors !== undefined) {
    return t('ruleGemColors', { colors: rules.gemColors.map(gemTypeLabel).join(t('listSeparator')) });
  }
  if (rules.moveTimeMs !== undefined) {
    return t('ruleMoveTime', { sec: Math.round((rules.moveTimeMs / 1000) * 10) / 10 });
  }
  return undefined;
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

/** A column of levels on the campaign map (prologue, one of the elemental branches, or the final chapter). */
export interface BranchInfo {
  id: string;
  title: string;
  /** Dominant enemy element of the branch (undefined for the prologue/final chapter). */
  element?: number;
  /** Level ids in play order within the branch. */
  levelIds: string[];
  /** Map column: 'single' spans the center; a number is this branch's 0-based
   * position among the parallel branches (left to right), letting the map
   * lay out any number of forks evenly instead of a fixed left/center/right. */
  column: 'single' | number;
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

  // Sky branch — The Skyward Talons.
  {
    id: 'sky-1',
    name: 'Talon Pass',
    story:
      'High above the other three fronts, harpies have claimed the mountain pass — their screeching cries send climbers reeling.',
    enemies: [
      {
        name: 'Harpy Screecher',
        maxHp: 190,
        attack: 14,
        element: 3,
        skills: [{ type: 'lock', lockCount: 2 }],
      },
    ],
    unlockRequires: ['prologue-2'],
  },
  {
    id: 'sky-2',
    name: 'Aerie Ambush',
    story: 'A storm-caller and her skirmisher escort turn the pass into a killing field, hope curdling into feathers.',
    enemies: [
      { name: 'Harpy Skirmisher', maxHp: 200, attack: 15, element: 3 },
      {
        name: 'Harpy Stormcaller',
        maxHp: 190,
        attack: 16,
        element: 3,
        skills: [{ type: 'convertGems', from: 5, to: 3, count: 3 }],
      },
    ],
    unlockRequires: ['sky-1'],
    rules: { turnLimit: 17 },
    starCriteria: { type: 'turns', threeStar: 12, twoStar: 15 },
  },
  {
    id: 'sky-3',
    name: 'Griffon Matriarch',
    story: 'The Griffon Matriarch descends from her aerie — the mountain pass belongs to her, and she means to keep it.',
    enemies: [
      {
        name: 'Griffon Matriarch',
        maxHp: 380,
        attack: 24,
        element: 3,
        skills: [
          { type: 'shield', damageReduction: 0.35, durationTurns: 3 },
          { type: 'lock', lockCount: 2 },
          { type: 'enrage', hpThreshold: 0.3, attackMultiplier: 1.5 },
        ],
        boss: true,
      },
    ],
    unlockRequires: ['sky-2'],
  },

  // Final chapter — unlocked only once all four branch bosses are down.
  {
    id: 'final-1',
    name: "Dragon's Foothills",
    story:
      'Goblins, naga, slimes, harpies — four warbands, one truth: all of them were gathering tribute for something waking beneath the mountain.',
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
    unlockRequires: ['fire-3', 'water-3', 'wood-3', 'sky-3'],
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

  // ===========================================================================
  // Chapter 2 — The Shattered Frontier. The Ancient Dragon's fall cracked the
  // mountain wide open, and the dark residue it left behind is stirring
  // something far greater: a fallen seraph.
  // ===========================================================================

  {
    id: 'ch2-prologue-1',
    name: 'Aftershock',
    story:
      "The Ancient Dragon's fall cracked the mountain to its roots, opening roads no one ever dared to walk.",
    enemies: [{ name: 'Tremor Whelp', maxHp: 750, attack: 30, element: 4 }],
    unlockRequires: ['final-3'],
  },
  {
    id: 'ch2-prologue-2',
    name: "Refugees' Warning",
    story: 'Survivors flee the cracked roads, warning of something vast stirring in the dark beneath.',
    enemies: [{ name: 'Tremor Stalker', maxHp: 850, attack: 34, element: 4, attackInterval: 2 }],
    unlockRequires: ['ch2-prologue-1'],
  },

  // Fire branch — Cinder Wastes.
  {
    id: 'ch2-fire-1',
    name: 'Ashfolk Raiders',
    story: 'Ashfolk raiders pour out of the cinder wastes, drawn by the mountain\'s new wounds.',
    enemies: [{ name: 'Ashfolk Skirmisher', maxHp: 950, attack: 40, element: 0 }],
    unlockRequires: ['ch2-prologue-2'],
  },
  {
    id: 'ch2-fire-2',
    name: 'Cinder Forge',
    story: 'A forge-warden stokes the cinder flats white-hot, daring you to cross.',
    enemies: [
      {
        name: 'Forge Warden',
        maxHp: 1050,
        attack: 44,
        element: 0,
        skills: [{ type: 'ignite', count: 2, durationTurns: 2 }],
      },
    ],
    unlockRequires: ['ch2-fire-1'],
    rules: { turnLimit: 17 },
    starCriteria: { type: 'turns', threeStar: 12, twoStar: 15 },
  },
  {
    id: 'ch2-fire-3',
    name: 'Salamander Warlord',
    story: 'The Salamander Warlord commands the cinder wastes — his charge could level a hillside.',
    enemies: [
      {
        name: 'Salamander Warlord',
        maxHp: 1700,
        attack: 58,
        element: 0,
        skills: [
          { type: 'charge', chargeTurns: 3, multiplier: 2.8, interruptRatio: 0.15 },
          { type: 'enrage', hpThreshold: 0.3, attackMultiplier: 1.5 },
        ],
        boss: true,
      },
    ],
    unlockRequires: ['ch2-fire-2'],
  },

  // Water branch — Frostmere Deep.
  {
    id: 'ch2-water-1',
    name: 'Frostfen Serpent',
    story: 'A serpent of black ice slithers beneath the frostmere, its bite numbing more than flesh.',
    enemies: [
      {
        name: 'Frostfen Serpent',
        maxHp: 980,
        attack: 42,
        element: 1,
        skills: [{ type: 'poison', damagePerTurn: 8, durationTurns: 3 }],
      },
    ],
    unlockRequires: ['ch2-prologue-2'],
  },
  {
    id: 'ch2-water-2',
    name: 'Glacial Warden',
    story: 'The glacial warden freezes everything it touches — including the gems beneath your fingers.',
    enemies: [
      {
        name: 'Glacial Warden',
        maxHp: 1100,
        attack: 45,
        element: 1,
        attackInterval: 2,
        skills: [{ type: 'petrify', count: 2 }],
      },
    ],
    unlockRequires: ['ch2-water-1'],
  },
  {
    id: 'ch2-water-3',
    name: 'Frost Leviathan',
    story: 'The Frost Leviathan surfaces from the deep — its hide shrugs off blows, and its bite never stops aching.',
    enemies: [
      {
        name: 'Frost Leviathan',
        maxHp: 1800,
        attack: 60,
        element: 1,
        skills: [
          { type: 'shield', damageReduction: 0.4, durationTurns: 3 },
          { type: 'selfHeal', amount: 90, everyTurns: 3 },
          { type: 'poison', damagePerTurn: 14, durationTurns: 3 },
        ],
        boss: true,
      },
    ],
    unlockRequires: ['ch2-water-2'],
  },

  // Wood branch — Blightwood.
  {
    id: 'ch2-wood-1',
    name: 'Blightling Swarm',
    story: 'A swarm of blightlings creeps out from the rot at the forest\'s heart.',
    enemies: [{ name: 'Blightling', maxHp: 1000, attack: 41, element: 2 }],
    unlockRequires: ['ch2-prologue-2'],
  },
  {
    id: 'ch2-wood-2',
    name: 'Fungal Broodmother',
    story: 'The Fungal Broodmother spores the air thick, turning hope itself to rot.',
    enemies: [
      {
        name: 'Fungal Broodmother',
        maxHp: 1120,
        attack: 46,
        element: 2,
        skills: [{ type: 'convertGems', from: 5, to: 2, count: 3 }],
      },
    ],
    unlockRequires: ['ch2-wood-1'],
  },
  {
    id: 'ch2-wood-3',
    name: 'Blightwood Colossus',
    story: 'A colossus of fused rot and root rises from the broodmother\'s nest, ancient and furious.',
    enemies: [
      {
        name: 'Blightwood Colossus',
        maxHp: 1900,
        attack: 62,
        element: 2,
        attackInterval: 2,
        skills: [
          { type: 'shield', damageReduction: 0.45, durationTurns: 3 },
          { type: 'selfHeal', amount: 70, everyTurns: 3 },
          { type: 'enrage', hpThreshold: 0.3, attackMultiplier: 1.5 },
        ],
        boss: true,
      },
    ],
    unlockRequires: ['ch2-wood-2'],
  },

  // Dark branch — Hollow Crypt.
  {
    id: 'ch2-dark-1',
    name: 'Crypt Wight',
    story: 'A wight claws its way out of the hollow crypt beneath the shattered peak.',
    enemies: [
      {
        name: 'Crypt Wight',
        maxHp: 1020,
        attack: 43,
        element: 4,
        skills: [{ type: 'lock', lockCount: 2 }],
      },
    ],
    unlockRequires: ['ch2-prologue-2'],
  },
  {
    id: 'ch2-dark-2',
    name: 'Bone Conjurer',
    story: 'A bone conjurer chants over the crypt\'s deepest vault, and the dead answer.',
    enemies: [
      {
        name: 'Bone Conjurer',
        maxHp: 1150,
        attack: 47,
        element: 4,
        skills: [{ type: 'poison', damagePerTurn: 10, durationTurns: 3 }],
      },
    ],
    unlockRequires: ['ch2-dark-1'],
    rules: { turnLimit: 17 },
    starCriteria: { type: 'turns', threeStar: 12, twoStar: 15 },
  },
  {
    id: 'ch2-dark-3',
    name: 'Lich Chancellor',
    story: 'The Lich Chancellor has ruled the hollow crypt for a thousand years — and means to rule it a thousand more.',
    enemies: [
      {
        name: 'Lich Chancellor',
        maxHp: 2000,
        attack: 64,
        element: 4,
        skills: [
          { type: 'lock', lockCount: 2 },
          { type: 'charge', chargeTurns: 3, multiplier: 3, interruptRatio: 0.15 },
        ],
        boss: true,
      },
    ],
    unlockRequires: ['ch2-dark-2'],
  },

  // Chapter 2 finale — The Sundered Seraph.
  {
    id: 'ch2-final-1',
    name: "Seraph's Descent",
    story: 'Four warbands, one truth: all of them were tribute-bearers for a seraph shattered and fallen from grace.',
    enemies: [
      {
        name: 'Fallen Seraph Herald',
        maxHp: 1600,
        attack: 50,
        element: 3,
        attackInterval: 2,
        skills: [{ type: 'poison', damagePerTurn: 12, durationTurns: 3 }],
      },
    ],
    unlockRequires: ['ch2-fire-3', 'ch2-water-3', 'ch2-wood-3', 'ch2-dark-3'],
  },
  {
    id: 'ch2-final-2',
    name: "Seraph's Gate",
    story: 'Wraiths of broken light guard the gate, the seraph\'s grief made manifest.',
    enemies: [
      {
        name: 'Seraph Wraith',
        maxHp: 1500,
        attack: 48,
        element: 3,
        skills: [{ type: 'ignite', count: 2, durationTurns: 2 }],
      },
      {
        name: 'Seraph Wraith',
        maxHp: 1500,
        attack: 48,
        element: 3,
        skills: [{ type: 'convertGems', from: 5, to: 3, count: 3 }],
      },
    ],
    unlockRequires: ['ch2-final-1'],
    rules: { turnLimit: 16 },
    starCriteria: { type: 'turns', threeStar: 11, twoStar: 14 },
  },
  {
    id: 'ch2-final-3',
    name: 'The Sundered Seraph',
    story: 'The Sundered Seraph awakens in full — not evil, only broken, and broken things lash out hardest.',
    enemies: [
      {
        name: 'The Sundered Seraph',
        maxHp: 3200,
        attack: 78,
        element: 3,
        skills: [
          { type: 'shield', damageReduction: 0.3, durationTurns: 3 },
          { type: 'charge', chargeTurns: 2, multiplier: 2.5, interruptRatio: 0.2 },
          { type: 'enrage', hpThreshold: 0.4, attackMultiplier: 1.4 },
          { type: 'ignite', count: 3, durationTurns: 2 },
        ],
        boss: true,
      },
    ],
    unlockRequires: ['ch2-final-2'],
    rules: { moveTimeMs: 4000 },
  },

  // ===========================================================================
  // Chapter 3 — Realm's End. The seraph's fall sent its grief rippling to the
  // deepest, oldest dark of all: something the realm has no name for but
  // "the Devourer."
  // ===========================================================================

  {
    id: 'ch3-prologue-1',
    name: "Seraph's Ashes",
    story: "Ash from the sundered seraph drifts down into caverns no map remembers, and something below breathes it in.",
    enemies: [{ name: 'Ash-Touched Revenant', maxHp: 3300, attack: 80, element: 4 }],
    unlockRequires: ['ch2-final-3'],
  },
  {
    id: 'ch3-prologue-2',
    name: 'Whispers Below',
    story: 'Voices rise from the deepest dark, whispering a name the world was never meant to speak.',
    enemies: [{ name: 'Whispering Husk', maxHp: 3600, attack: 85, element: 4, attackInterval: 2 }],
    unlockRequires: ['ch3-prologue-1'],
  },

  // Fire branch — Forge of Wrath.
  {
    id: 'ch3-fire-1',
    name: 'Demonic Stoker',
    story: 'Demons stoke a forge older than the mountain itself, feeding it with the realm\'s dying light.',
    enemies: [{ name: 'Demonic Stoker', maxHp: 4000, attack: 92, element: 0 }],
    unlockRequires: ['ch3-prologue-2'],
  },
  {
    id: 'ch3-fire-2',
    name: 'Wrathforge Sentinel',
    story: 'A sentinel of living flame guards the forge\'s heart, and it does not tire.',
    enemies: [
      {
        name: 'Wrathforge Sentinel',
        maxHp: 4300,
        attack: 98,
        element: 0,
        skills: [{ type: 'ignite', count: 3, durationTurns: 2 }],
      },
    ],
    unlockRequires: ['ch3-fire-1'],
    rules: { turnLimit: 17 },
    starCriteria: { type: 'turns', threeStar: 12, twoStar: 15 },
  },
  {
    id: 'ch3-fire-3',
    name: 'Archdemon of Wrath',
    story: 'The Archdemon of Wrath has stoked this forge since before the first dragon slept.',
    enemies: [
      {
        name: 'Archdemon of Wrath',
        maxHp: 6800,
        attack: 130,
        element: 0,
        attackInterval: 2,
        skills: [
          { type: 'shield', damageReduction: 0.35, durationTurns: 3 },
          { type: 'charge', chargeTurns: 2, multiplier: 2.8, interruptRatio: 0.2 },
          { type: 'enrage', hpThreshold: 0.3, attackMultiplier: 1.5 },
        ],
        boss: true,
      },
    ],
    unlockRequires: ['ch3-fire-2'],
  },

  // Water branch — Abyssal Trench.
  {
    id: 'ch3-water-1',
    name: 'Trench Stalker',
    story: 'Something vast and patient stalks the abyssal trench, venom trailing in its wake.',
    enemies: [
      {
        name: 'Trench Stalker',
        maxHp: 4100,
        attack: 94,
        element: 1,
        skills: [{ type: 'poison', damagePerTurn: 16, durationTurns: 3 }],
      },
    ],
    unlockRequires: ['ch3-prologue-2'],
  },
  {
    id: 'ch3-water-2',
    name: 'Abyssal Warden',
    story: 'The abyssal warden crushes stone into glass with every pulse of pressure it throws.',
    enemies: [
      {
        name: 'Abyssal Warden',
        maxHp: 4400,
        attack: 99,
        element: 1,
        attackInterval: 2,
        skills: [{ type: 'petrify', count: 2 }],
      },
    ],
    unlockRequires: ['ch3-water-1'],
  },
  {
    id: 'ch3-water-3',
    name: 'Kraken Sovereign',
    story: 'The Kraken Sovereign rules the trench absolute — nothing that sinks this far ever rises again.',
    enemies: [
      {
        name: 'Kraken Sovereign',
        maxHp: 7000,
        attack: 132,
        element: 1,
        skills: [
          { type: 'shield', damageReduction: 0.4, durationTurns: 3 },
          { type: 'selfHeal', amount: 140, everyTurns: 3 },
          { type: 'poison', damagePerTurn: 20, durationTurns: 3 },
        ],
        boss: true,
      },
    ],
    unlockRequires: ['ch3-water-2'],
  },

  // Wood branch — Thornspire.
  {
    id: 'ch3-wood-1',
    name: 'Thornspire Sentinel',
    story: 'A sentinel of living thorn guards the spire\'s roots, older than the forest around it.',
    enemies: [{ name: 'Thornspire Sentinel', maxHp: 4150, attack: 95, element: 2 }],
    unlockRequires: ['ch3-prologue-2'],
  },
  {
    id: 'ch3-wood-2',
    name: 'Root Warden',
    story: 'The root warden turns even hope to timber, weaving it into the spire\'s endless growth.',
    enemies: [
      {
        name: 'Root Warden',
        maxHp: 4450,
        attack: 100,
        element: 2,
        skills: [{ type: 'convertGems', from: 5, to: 2, count: 4 }],
      },
    ],
    unlockRequires: ['ch3-wood-1'],
  },
  {
    id: 'ch3-wood-3',
    name: 'The Thornspire Colossus',
    story: 'The Thornspire Colossus IS the spire — every thorn on the mountain is a piece of it.',
    enemies: [
      {
        name: 'The Thornspire Colossus',
        maxHp: 7200,
        attack: 134,
        element: 2,
        attackInterval: 2,
        skills: [
          { type: 'shield', damageReduction: 0.45, durationTurns: 3 },
          { type: 'selfHeal', amount: 120, everyTurns: 3 },
          { type: 'enrage', hpThreshold: 0.3, attackMultiplier: 1.5 },
        ],
        boss: true,
      },
    ],
    unlockRequires: ['ch3-wood-2'],
  },

  // Light branch — Seraphic Bastion.
  {
    id: 'ch3-light-1',
    name: 'Bastion Watcher',
    story: 'A watcher of the seraphic bastion still stands guard, loyal to a seraph long since fallen.',
    enemies: [
      {
        name: 'Bastion Watcher',
        maxHp: 4200,
        attack: 96,
        element: 3,
        skills: [{ type: 'lock', lockCount: 2 }],
      },
    ],
    unlockRequires: ['ch3-prologue-2'],
  },
  {
    id: 'ch3-light-2',
    name: 'Choir of Ash',
    story: 'A choir that once sang hymns of light now sings only of ash.',
    enemies: [
      {
        name: 'Choir Cantor',
        maxHp: 4500,
        attack: 101,
        element: 3,
        skills: [{ type: 'poison', damagePerTurn: 18, durationTurns: 3 }],
      },
    ],
    unlockRequires: ['ch3-light-1'],
    rules: { turnLimit: 17 },
    starCriteria: { type: 'turns', threeStar: 12, twoStar: 15 },
  },
  {
    id: 'ch3-light-3',
    name: 'Archon of the Bastion',
    story: 'The Archon of the Bastion has judged every soul that reached this height — and found them all wanting.',
    enemies: [
      {
        name: 'Archon of the Bastion',
        maxHp: 7500,
        attack: 138,
        element: 3,
        skills: [
          { type: 'lock', lockCount: 3 },
          { type: 'charge', chargeTurns: 3, multiplier: 3, interruptRatio: 0.15 },
        ],
        boss: true,
      },
    ],
    unlockRequires: ['ch3-light-2'],
  },

  // Chapter 3 finale — The Devourer Below. The true final boss of the campaign.
  {
    id: 'ch3-final-1',
    name: 'The Devourer Stirs',
    story: 'Demons, deep horrors, living thorn, fallen light — four guardians, one purpose: keep the Devourer asleep. They have failed.',
    enemies: [
      {
        name: 'Devourer Spawn',
        maxHp: 5800,
        attack: 115,
        element: 4,
        attackInterval: 2,
        skills: [{ type: 'poison', damagePerTurn: 22, durationTurns: 3 }],
      },
    ],
    unlockRequires: ['ch3-fire-3', 'ch3-water-3', 'ch3-wood-3', 'ch3-light-3'],
  },
  {
    id: 'ch3-final-2',
    name: 'Gates of Oblivion',
    story: 'The gates of oblivion stand open at last, and the dark beyond has a hunger with no bottom.',
    enemies: [
      {
        name: 'Oblivion Gatekeeper',
        maxHp: 5500,
        attack: 112,
        element: 4,
        skills: [{ type: 'ignite', count: 3, durationTurns: 2 }],
      },
      {
        name: 'Oblivion Gatekeeper',
        maxHp: 5500,
        attack: 112,
        element: 4,
        skills: [{ type: 'convertGems', from: 5, to: 4, count: 4 }],
      },
    ],
    unlockRequires: ['ch3-final-1'],
    rules: { turnLimit: 16 },
    starCriteria: { type: 'turns', threeStar: 11, twoStar: 14 },
  },
  {
    id: 'ch3-final-3',
    name: 'The Devourer Below',
    story: 'The Devourer Below wakes at last — the hunger beneath every tribute, every war, every fallen seraph. This is the last fight.',
    enemies: [
      {
        name: 'The Devourer Below',
        maxHp: 13000,
        attack: 185,
        element: 4,
        skills: [
          { type: 'shield', damageReduction: 0.35, durationTurns: 3 },
          { type: 'charge', chargeTurns: 2, multiplier: 2.8, interruptRatio: 0.2 },
          { type: 'enrage', hpThreshold: 0.35, attackMultiplier: 1.5 },
          { type: 'ignite', count: 3, durationTurns: 2 },
          { type: 'selfHeal', amount: 200, everyTurns: 3 },
        ],
        boss: true,
      },
    ],
    unlockRequires: ['ch3-final-2'],
    rules: { moveTimeMs: 4000 },
  },
];

/** Campaign map columns: prologue at the bottom, four parallel branches, final chapter on top. */
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
    column: 0,
  },
  {
    id: 'water',
    title: '🌊 The Drowned Tide',
    element: 1,
    levelIds: ['water-1', 'water-2', 'water-3'],
    column: 1,
  },
  {
    id: 'wood',
    title: '🌿 The Slime Outbreak',
    element: 2,
    levelIds: ['wood-1', 'wood-2', 'wood-3'],
    column: 2,
  },
  {
    id: 'sky',
    title: '🦅 The Skyward Talons',
    element: 3,
    levelIds: ['sky-1', 'sky-2', 'sky-3'],
    column: 3,
  },
  {
    id: 'final',
    title: "🐉 The Dragon's Return",
    levelIds: ['final-1', 'final-2', 'final-3'],
    column: 'single',
  },

  // --- Chapter 2 ---
  {
    id: 'ch2-prologue',
    title: 'Prologue',
    levelIds: ['ch2-prologue-1', 'ch2-prologue-2'],
    column: 'single',
  },
  {
    id: 'ch2-fire',
    title: '🔥 Cinder Wastes',
    element: 0,
    levelIds: ['ch2-fire-1', 'ch2-fire-2', 'ch2-fire-3'],
    column: 0,
  },
  {
    id: 'ch2-water',
    title: '🌊 Frostmere Deep',
    element: 1,
    levelIds: ['ch2-water-1', 'ch2-water-2', 'ch2-water-3'],
    column: 1,
  },
  {
    id: 'ch2-wood',
    title: '🌿 Blightwood',
    element: 2,
    levelIds: ['ch2-wood-1', 'ch2-wood-2', 'ch2-wood-3'],
    column: 2,
  },
  {
    id: 'ch2-dark',
    title: '💀 Hollow Crypt',
    element: 4,
    levelIds: ['ch2-dark-1', 'ch2-dark-2', 'ch2-dark-3'],
    column: 3,
  },
  {
    id: 'ch2-final',
    title: '🕊️ The Sundered Seraph',
    levelIds: ['ch2-final-1', 'ch2-final-2', 'ch2-final-3'],
    column: 'single',
  },

  // --- Chapter 3 ---
  {
    id: 'ch3-prologue',
    title: 'Prologue',
    levelIds: ['ch3-prologue-1', 'ch3-prologue-2'],
    column: 'single',
  },
  {
    id: 'ch3-fire',
    title: '🔥 Forge of Wrath',
    element: 0,
    levelIds: ['ch3-fire-1', 'ch3-fire-2', 'ch3-fire-3'],
    column: 0,
  },
  {
    id: 'ch3-water',
    title: '🌊 Abyssal Trench',
    element: 1,
    levelIds: ['ch3-water-1', 'ch3-water-2', 'ch3-water-3'],
    column: 1,
  },
  {
    id: 'ch3-wood',
    title: '🌿 Thornspire',
    element: 2,
    levelIds: ['ch3-wood-1', 'ch3-wood-2', 'ch3-wood-3'],
    column: 2,
  },
  {
    id: 'ch3-light',
    title: '✨ Seraphic Bastion',
    element: 3,
    levelIds: ['ch3-light-1', 'ch3-light-2', 'ch3-light-3'],
    column: 3,
  },
  {
    id: 'ch3-final',
    title: '🌑 The Devourer Below',
    levelIds: ['ch3-final-1', 'ch3-final-2', 'ch3-final-3'],
    column: 'single',
  },
];

/**
 * A campaign chapter: an ordered list of branch ids forming its own
 * prologue → parallel branches → final-boss graph, laid out on its own map
 * screen by LevelSelectScene (branchIds[0] = the chapter's prologue branch,
 * branchIds[branchIds.length-1] = its final branch, everything between is
 * parallel). Chapters unlock sequentially via the normal unlockRequires chain
 * (a chapter's first level requires the previous chapter's final-boss level)
 * — no separate chapter-unlock state is stored anywhere.
 */
export interface ChapterInfo {
  id: string;
  title: string;
  branchIds: string[];
}

export const CHAPTERS: ChapterInfo[] = [
  {
    id: 'ch1',
    title: 'Chapter 1 · The Dragon Stirs',
    branchIds: ['prologue', 'fire', 'water', 'wood', 'sky', 'final'],
  },
  {
    id: 'ch2',
    title: 'Chapter 2 · The Shattered Frontier',
    branchIds: ['ch2-prologue', 'ch2-fire', 'ch2-water', 'ch2-wood', 'ch2-dark', 'ch2-final'],
  },
  {
    id: 'ch3',
    title: "Chapter 3 · Realm's End",
    branchIds: ['ch3-prologue', 'ch3-fire', 'ch3-water', 'ch3-wood', 'ch3-light', 'ch3-final'],
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

/** The chapter a branch belongs to (every branch id appears in exactly one chapter). */
export function chapterForBranch(branchId: string): ChapterInfo | undefined {
  return CHAPTERS.find((chapter) => chapter.branchIds.includes(branchId));
}

/** The chapter a level belongs to, via its branch. */
export function chapterForLevel(levelId: string): ChapterInfo | undefined {
  const branch = branchForLevel(levelId);
  return branch ? chapterForBranch(branch.id) : undefined;
}

/** True when `levelId` is the last level of its chapter's final ('single', last-in-chapter) branch. */
export function isChapterFinale(levelId: string): boolean {
  const chapter = chapterForLevel(levelId);
  if (!chapter) return false;
  const finalBranchId = chapter.branchIds[chapter.branchIds.length - 1];
  const finalBranch = BRANCHES.find((b) => b.id === finalBranchId);
  return finalBranch?.levelIds[finalBranch.levelIds.length - 1] === levelId;
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
