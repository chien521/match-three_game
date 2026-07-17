import type { EnemyConfig, EnemySkillConfig } from './levels';
import type { Character } from './team';
import { DEFAULT_TEAM, teamTotalHp } from './team';
import { CHARACTER_POOL, findCharacterTemplate } from './characterPool';
import { MAX_TEAM_SIZE } from './playerData';
import type { Relic } from './relics';
import { RELICS, aggregateRelics } from './relics';

export type NodeType = 'battle' | 'elite' | 'rest' | 'treasure' | 'boss';

export interface RunNode {
  id: string;
  type: NodeType;
  row: number; // 0 = first row of the floor; last row is always the boss
  col: number; // position within the row (for layout + connections)
  next: string[]; // ids of reachable nodes in the next row
  /** Battle nodes flagged to offer a recruit choice after victory. */
  recruit?: boolean;
}

export interface FloorMap {
  nodes: RunNode[];
  rowCount: number;
}

/** Reward choice pending on the run map after a node is resolved. */
export type PendingReward = 'relic' | 'recruit' | null;

/** Lifetime stats for the current run, shown on the end-of-run summary screen. */
export interface RunStats {
  battlesWon: number;
  elitesKilled: number;
  floorsCleared: number;
  /** Names of relics collected this run, in pickup order. */
  relicsCollected: string[];
}

export interface RunState {
  floor: number; // 0-based; FLOOR_COUNT floors total
  map: FloorMap;
  /** Row the player currently stands on (-1 = floor entrance, before row 0). */
  currentRow: number;
  currentNodeId: string | null;
  /** Nodes entered on the current floor, in order (for drawing the path taken). */
  visitedNodeIds: string[];
  team: Character[];
  teamHp: number;
  /** Skill cooldowns carried across battles/nodes (1:1 index-aligned with `team`); see recruit(). */
  skillCooldowns: number[];
  relics: Relic[];
  pendingReward: PendingReward;
  stats: RunStats;
}

export const FLOOR_COUNT = 3;
export const ROWS_PER_FLOOR = 5; // 4 normal rows + 1 boss row
export const REST_HEAL_FRACTION = 0.3;
export const RUN_STARTING_TEAM_SIZE = 3;
export const RUN_WIN_CURRENCY = 50;
export const RUN_LOSS_CURRENCY = 5;

const RUN_STORAGE_KEY = 'match3-active-run';

/** Plain-serializable stand-in for RunState: relics/team stored by id instead of full objects. */
interface RunSnapshot {
  floor: number;
  map: FloorMap;
  currentRow: number;
  currentNodeId: string | null;
  visitedNodeIds: string[];
  teamIds: string[];
  teamHp: number;
  skillCooldowns: number[];
  relicIds: string[];
  pendingReward: PendingReward;
  stats: RunStats;
}

/**
 * Serializes the run to sessionStorage under RUN_STORAGE_KEY (relics/team
 * stored by id), or clears any stored snapshot when `run` is null. Guarded
 * with try/catch for private-browsing/storage-disabled environments, same
 * pattern as game/playerData.ts.
 */
export function saveRunSnapshot(run: RunState | null): void {
  try {
    if (!run) {
      sessionStorage.removeItem(RUN_STORAGE_KEY);
      return;
    }
    const snapshot: RunSnapshot = {
      floor: run.floor,
      map: run.map,
      currentRow: run.currentRow,
      currentNodeId: run.currentNodeId,
      visitedNodeIds: run.visitedNodeIds,
      teamIds: run.team.map((c) => c.id),
      teamHp: run.teamHp,
      skillCooldowns: run.skillCooldowns,
      relicIds: run.relics.map((r) => r.id),
      pendingReward: run.pendingReward,
      stats: run.stats,
    };
    sessionStorage.setItem(RUN_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Storage unavailable (e.g. private browsing) — the run just won't persist across reloads.
  }
}

/**
 * Restores a run previously saved by saveRunSnapshot(), rebuilding relics via
 * RELICS lookup and characters via findCharacterTemplate() (falling back to
 * DEFAULT_TEAM entries for starter characters). Returns null if there is no
 * stored snapshot, the snapshot is malformed, or storage is unavailable.
 */
export function loadRunSnapshot(): RunState | null {
  try {
    const raw = sessionStorage.getItem(RUN_STORAGE_KEY);
    if (!raw) return null;
    const snapshot = JSON.parse(raw) as RunSnapshot;

    const team = snapshot.teamIds
      .map((id) => findCharacterTemplate(id) ?? DEFAULT_TEAM.find((c) => c.id === id))
      .filter((c): c is Character => c !== undefined);
    if (team.length === 0) return null;

    const relics = snapshot.relicIds
      .map((id) => RELICS.find((r) => r.id === id))
      .filter((r): r is Relic => r !== undefined);

    return {
      floor: snapshot.floor,
      map: snapshot.map,
      currentRow: snapshot.currentRow,
      currentNodeId: snapshot.currentNodeId,
      visitedNodeIds: snapshot.visitedNodeIds,
      team,
      teamHp: snapshot.teamHp,
      // Older snapshots predate skillCooldowns; pad/truncate to stay index-aligned with team.
      skillCooldowns: Array.isArray(snapshot.skillCooldowns)
        ? team.map((_, i) => snapshot.skillCooldowns[i] ?? 0)
        : team.map(() => 0),
      relics,
      pendingReward: snapshot.pendingReward,
      stats: snapshot.stats ?? { battlesWon: 0, elitesKilled: 0, floorsCleared: 0, relicsCollected: [] },
    };
  } catch {
    return null;
  }
}

/** Persists the given run state (e.g. after a caller mutates it directly, such as GameScene writing teamHp back). */
export function persistRun(run: RunState): void {
  saveRunSnapshot(run);
}

/** The run currently in progress (module-level; lazily restored from sessionStorage on first access). */
let activeRun: RunState | null = null;

export function getActiveRun(): RunState | null {
  if (activeRun === null) {
    activeRun = loadRunSnapshot();
  }
  return activeRun;
}

export function setActiveRun(run: RunState | null): void {
  activeRun = run;
  saveRunSnapshot(run);
}

export function createRun(rng: () => number = Math.random): RunState {
  return {
    floor: 0,
    map: generateFloorMap(rng),
    currentRow: -1,
    currentNodeId: null,
    visitedNodeIds: [],
    team: DEFAULT_TEAM.slice(0, RUN_STARTING_TEAM_SIZE),
    teamHp: teamTotalHp(DEFAULT_TEAM.slice(0, RUN_STARTING_TEAM_SIZE)),
    skillCooldowns: DEFAULT_TEAM.slice(0, RUN_STARTING_TEAM_SIZE).map(() => 0),
    relics: [],
    pendingReward: null,
    stats: { battlesWon: 0, elitesKilled: 0, floorsCleared: 0, relicsCollected: [] },
  };
}

/** The run team's max HP, including relic bonuses. */
export function runTeamMaxHp(run: RunState): number {
  const mods = aggregateRelics(run.relics);
  return Math.round(teamTotalHp(run.team) * mods.maxHpMultiplier);
}

function rollNodeType(rng: () => number): NodeType {
  const roll = rng();
  if (roll < 0.5) return 'battle';
  if (roll < 0.65) return 'elite';
  if (roll < 0.85) return 'rest';
  return 'treasure';
}

/**
 * Generates one floor: ROWS_PER_FLOOR rows of 2-3 nodes each (boss row has
 * exactly one). Each node connects to next-row nodes at index i-1..i+1
 * (clamped), which keeps every node reachable. Row 0 is always plain battles
 * so a run never opens with an elite; 1-2 battle nodes per floor are flagged
 * to offer a recruit after winning.
 */
export function generateFloorMap(rng: () => number = Math.random): FloorMap {
  const rowWidths: number[] = [];
  for (let r = 0; r < ROWS_PER_FLOOR - 1; r++) {
    rowWidths.push(2 + Math.floor(rng() * 2)); // 2-3
  }
  rowWidths.push(1); // boss row

  const nodes: RunNode[] = [];
  for (let r = 0; r < ROWS_PER_FLOOR; r++) {
    for (let c = 0; c < rowWidths[r]; c++) {
      const isBossRow = r === ROWS_PER_FLOOR - 1;
      nodes.push({
        id: `${r}-${c}`,
        type: isBossRow ? 'boss' : r === 0 ? 'battle' : rollNodeType(rng),
        row: r,
        col: c,
        next: [],
      });
    }
  }

  for (const node of nodes) {
    if (node.row === ROWS_PER_FLOOR - 1) continue;
    const nextWidth = rowWidths[node.row + 1];
    for (let j = node.col - 1; j <= node.col + 1; j++) {
      if (j >= 0 && j < nextWidth) node.next.push(`${node.row + 1}-${j}`);
    }
  }

  // Flag 1-2 battle nodes (beyond row 0's guaranteed battles) as recruit stops.
  const battleNodes = nodes.filter((n) => n.type === 'battle');
  const recruitCount = Math.min(battleNodes.length, 1 + Math.floor(rng() * 2));
  for (let i = 0; i < recruitCount && battleNodes.length > 0; i++) {
    const index = Math.floor(rng() * battleNodes.length);
    battleNodes.splice(index, 1)[0].recruit = true;
  }

  return { nodes, rowCount: ROWS_PER_FLOOR };
}

export function findNode(map: FloorMap, id: string): RunNode | undefined {
  return map.nodes.find((n) => n.id === id);
}

/** Nodes the player may enter next: all of row 0 at the floor entrance, otherwise the current node's connections. */
export function availableNodes(run: RunState): RunNode[] {
  if (run.currentNodeId === null) {
    return run.map.nodes.filter((n) => n.row === 0);
  }
  const current = findNode(run.map, run.currentNodeId);
  if (!current) return [];
  return current.next
    .map((id) => findNode(run.map, id))
    .filter((n): n is RunNode => n !== undefined);
}

/** Moves onto a node if it is reachable. Returns the node, or null if the move is illegal. */
export function moveToNode(run: RunState, nodeId: string): RunNode | null {
  const target = availableNodes(run).find((n) => n.id === nodeId);
  if (!target) return null;
  run.currentNodeId = target.id;
  run.currentRow = target.row;
  run.visitedNodeIds.push(target.id);
  saveRunSnapshot(run);
  return target;
}

/** True when the current node is the floor boss and it has been beaten (caller advances the floor). */
export function isLastFloor(run: RunState): boolean {
  return run.floor >= FLOOR_COUNT - 1;
}

/**
 * Records a won battle in run.stats: every victory counts toward battlesWon,
 * elite kills also bump elitesKilled, and boss kills also bump floorsCleared
 * (one boss per floor). Call once per battle resolution, before any map
 * navigation (advanceFloor/moveToNode).
 */
export function recordVictory(run: RunState, nodeType: NodeType): void {
  run.stats.battlesWon++;
  if (nodeType === 'elite') run.stats.elitesKilled++;
  if (nodeType === 'boss') run.stats.floorsCleared++;
  saveRunSnapshot(run);
}

/** Moves to the next floor with a fresh map. */
export function advanceFloor(run: RunState, rng: () => number = Math.random): void {
  run.floor++;
  run.map = generateFloorMap(rng);
  run.currentRow = -1;
  run.currentNodeId = null;
  run.visitedNodeIds = [];
  saveRunSnapshot(run);
}

export function applyRest(run: RunState): number {
  const max = runTeamMaxHp(run);
  const healed = Math.min(max, run.teamHp + Math.round(max * REST_HEAL_FRACTION));
  const gained = healed - run.teamHp;
  run.teamHp = healed;
  saveRunSnapshot(run);
  return gained;
}

const TRAIN_ATTACK_MULTIPLIER = 1.15;
const TRAIN_HP_MULTIPLIER = 1.15;

/** Outcome of trainRandomMember(), for UI display. */
export interface TrainResult {
  character: Character;
  attackGain: number;
  hpGain: number;
}

/**
 * Permanently boosts one random team member's attack and maxHp by 15% each,
 * for the rest of this run. Replaces the member in run.team with an upgraded
 * copy — never mutates the shared character template (run.team members are
 * the same object references as in CHARACTER_POOL/DEFAULT_TEAM) — and raises
 * run.teamHp by the same absolute HP gain, capped at the new max.
 */
export function trainRandomMember(run: RunState, rng: () => number = Math.random): TrainResult {
  const index = Math.floor(rng() * run.team.length);
  const original = run.team[index];
  const newAttack = Math.round(original.attack * TRAIN_ATTACK_MULTIPLIER);
  const newMaxHp = Math.round(original.maxHp * TRAIN_HP_MULTIPLIER);
  const attackGain = newAttack - original.attack;
  const hpGain = newMaxHp - original.maxHp;

  const trained: Character = { ...original, attack: newAttack, maxHp: newMaxHp };
  run.team[index] = trained;
  run.teamHp = Math.min(runTeamMaxHp(run), run.teamHp + hpGain);
  saveRunSnapshot(run);

  return { character: trained, attackGain, hpGain };
}

/** Up to `count` relics the player does not own yet, randomly picked. */
export function relicChoices(run: RunState, count = 3, rng: () => number = Math.random): Relic[] {
  const ownedIds = new Set(run.relics.map((r) => r.id));
  const pool = RELICS.filter((r) => !ownedIds.has(r.id));
  const choices: Relic[] = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    choices.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  }
  return choices;
}

export function addRelic(run: RunState, relic: Relic): void {
  if (run.relics.some((r) => r.id === relic.id)) return;
  run.relics.push(relic);
  run.stats.relicsCollected.push(relic.name);
  // Max-HP relics grant their bonus immediately as current HP too.
  if (relic.effect.type === 'maxHp') {
    run.teamHp = Math.min(runTeamMaxHp(run), Math.round(run.teamHp * relic.effect.multiplier));
  }
  saveRunSnapshot(run);
}

/** Up to `count` recruit candidates not already on the team. */
export function recruitChoices(run: RunState, count = 3, rng: () => number = Math.random): Character[] {
  const teamIds = new Set(run.team.map((c) => c.id));
  const pool = CHARACTER_POOL.filter((c) => !teamIds.has(c.id));
  const choices: Character[] = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    choices.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  }
  return choices;
}

/**
 * Adds a recruit to the team (they join at full personal HP, raising current
 * team HP by their maxHp). If the team is full, replaces the member at
 * `replaceIndex` instead (current HP is clamped to the new max).
 */
export function recruit(run: RunState, character: Character, replaceIndex?: number): void {
  if (run.team.length < MAX_TEAM_SIZE) {
    run.team.push(character);
    run.skillCooldowns.push(0); // fresh recruit always starts with a ready skill
    run.teamHp = Math.min(runTeamMaxHp(run), run.teamHp + character.maxHp);
    saveRunSnapshot(run);
    return;
  }
  const index = replaceIndex ?? run.team.length - 1;
  run.team[index] = character;
  run.skillCooldowns[index] = 0; // replacing a member resets that slot's cooldown, not inherited
  run.teamHp = Math.min(runTeamMaxHp(run), run.teamHp);
  saveRunSnapshot(run);
}

// ---------------------------------------------------------------------------
// Encounter generation
// ---------------------------------------------------------------------------

/** Grunt name/element pools per floor (index-capped, so extra floors reuse the last pool).
 * Exported for the i18n coverage test (every name needs a translation). */
export const FLOOR_GRUNTS: { name: string; element: number }[][] = [
  [
    { name: 'Slime', element: 2 },
    { name: 'Big Slime', element: 2 },
    { name: 'Cave Bat', element: 4 },
  ],
  [
    { name: 'Goblin', element: 0 },
    { name: 'Goblin Shaman', element: 1 },
    { name: 'Hobgoblin', element: 0 },
  ],
  [
    { name: 'Wyvern', element: 4 },
    { name: 'Dragon Whelp', element: 4 },
    { name: 'Drake Rider', element: 3 },
  ],
];

export const FLOOR_BOSSES: EnemyConfig[] = [
  {
    name: 'Slime Overlord',
    maxHp: 2100,
    attack: 34,
    element: 2,
    attackInterval: 2,
    skills: [
      { type: 'shield', damageReduction: 0.5, durationTurns: 3 },
      { type: 'selfHeal', amount: 60, everyTurns: 3 },
    ],
    boss: true,
  },
  {
    name: 'Goblin Warlord',
    maxHp: 3300,
    attack: 30,
    element: 0,
    skills: [
      { type: 'lock', lockCount: 2 },
      { type: 'charge', chargeTurns: 3, multiplier: 2.5, interruptRatio: 0.15 },
    ],
    boss: true,
  },
  {
    name: 'Elder Dragon',
    maxHp: 4450,
    attack: 74,
    element: 4,
    attackInterval: 2,
    skills: [
      { type: 'shield', damageReduction: 0.3, durationTurns: 4 },
      { type: 'ignite', count: 2, durationTurns: 2 },
    ],
    boss: true,
  },
];

/**
 * Builds the enemy list for a node. Battles are 1-2 grunts scaled by floor
 * and row depth; elites are a single beefed-up grunt with a random
 * interference skill; bosses are fixed per floor.
 */
export function generateEncounter(
  run: RunState,
  node: RunNode,
  rng: () => number = Math.random,
): EnemyConfig[] {
  if (node.type === 'boss') {
    return [FLOOR_BOSSES[Math.min(run.floor, FLOOR_BOSSES.length - 1)]];
  }

  const pool = FLOOR_GRUNTS[Math.min(run.floor, FLOOR_GRUNTS.length - 1)];
  // Tuned so a floor-1 row-0 battle takes ~2-3 matches against a ~210-attack
  // team with a 1.5x leader skill (~500-700 effective HP), and floor-3 grunts
  // take 4+ matches. Attack is tuned so an unanswered hit costs roughly
  // 8-12% of a typical 300-HP team on floor 1, scaling up on deeper floors.
  const baseHp = 600 + run.floor * 500 + node.row * 100;
  const baseAttack = 26 + run.floor * 14 + node.row * 3;

  const grunt = (scaleHp: number, scaleAtk: number): EnemyConfig => {
    const template = pool[Math.floor(rng() * pool.length)];
    return {
      name: template.name,
      element: template.element,
      maxHp: Math.round(baseHp * scaleHp),
      attack: Math.round(baseAttack * scaleAtk),
    };
  };

  if (node.type === 'elite') {
    const elite = grunt(1.8, 1.5);
    elite.name = `Elite ${elite.name}`;

    const roll = rng();
    let skill: EnemySkillConfig;
    if (roll < 0.2) {
      skill = { type: 'shield', damageReduction: 0.4, durationTurns: 3 };
      elite.attackInterval = 2;
    } else if (roll < 0.4) {
      skill = { type: 'lock', lockCount: 2 };
    } else if (roll < 0.6) {
      skill = { type: 'poison', damagePerTurn: Math.round(elite.attack * 0.5), durationTurns: 3 };
    } else if (roll < 0.8) {
      skill = { type: 'petrify', count: 2 };
    } else {
      skill = { type: 'ignite', count: 2, durationTurns: 2 };
    }

    elite.skills = [skill];
    elite.skill = skill; // deprecated one-element alias, kept for backward compatibility
    return [elite];
  }

  // Plain battle: 1 enemy on row 0, otherwise 1-2. From floor 2 onward,
  // ~30% of plain battles are "slow and heavy": attackInterval 2 with a
  // ~1.7x attack spike, so the ATK-in-N countdown matters outside elites.
  const count = node.row === 0 ? 1 : 1 + Math.floor(rng() * 2);
  const slowAndHeavy = run.floor >= 1 && rng() < 0.3;
  const enemies: EnemyConfig[] = [];
  for (let i = 0; i < count; i++) {
    const enemy = grunt(1, slowAndHeavy ? 1.7 : 1);
    if (slowAndHeavy) enemy.attackInterval = 2;
    enemies.push(enemy);
  }
  return enemies;
}
