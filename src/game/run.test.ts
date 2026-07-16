import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FLOOR_COUNT,
  ROWS_PER_FLOOR,
  addRelic,
  advanceFloor,
  applyRest,
  availableNodes,
  createRun,
  generateEncounter,
  generateFloorMap,
  loadRunSnapshot,
  moveToNode,
  recruit,
  recruitChoices,
  relicChoices,
  runTeamMaxHp,
  saveRunSnapshot,
  recordVictory,
  trainRandomMember,
} from './run';
import { RELICS, aggregateRelics } from './relics';
import { MAX_TEAM_SIZE } from './playerData';

/** Minimal in-memory Storage stand-in for globalThis.sessionStorage in tests. */
function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => (store.has(key) ? (store.get(key) as string) : null),
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
}

/** Deterministic rng from a fixed sequence (cycles). */
function seqRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe('generateFloorMap', () => {
  it('creates the expected row structure with a single boss at the end', () => {
    const map = generateFloorMap(Math.random);
    expect(map.rowCount).toBe(ROWS_PER_FLOOR);
    const bossRow = map.nodes.filter((n) => n.row === ROWS_PER_FLOOR - 1);
    expect(bossRow).toHaveLength(1);
    expect(bossRow[0].type).toBe('boss');
    for (let r = 0; r < ROWS_PER_FLOOR - 1; r++) {
      const width = map.nodes.filter((n) => n.row === r).length;
      expect(width).toBeGreaterThanOrEqual(2);
      expect(width).toBeLessThanOrEqual(3);
    }
  });

  it('keeps every node reachable from row 0 and row 0 all-battle', () => {
    for (let trial = 0; trial < 20; trial++) {
      const map = generateFloorMap(Math.random);
      for (const node of map.nodes.filter((n) => n.row === 0)) {
        expect(node.type).toBe('battle');
      }
      // Every node beyond row 0 must have at least one incoming edge.
      const reachable = new Set(map.nodes.filter((n) => n.row === 0).map((n) => n.id));
      for (let r = 0; r < ROWS_PER_FLOOR - 1; r++) {
        for (const node of map.nodes.filter((n) => n.row === r)) {
          if (!reachable.has(node.id)) continue;
          node.next.forEach((id) => reachable.add(id));
        }
      }
      expect(reachable.size).toBe(map.nodes.length);
    }
  });
});

describe('run navigation', () => {
  it('starts at the floor entrance with all row-0 nodes available', () => {
    const run = createRun();
    expect(run.currentNodeId).toBeNull();
    const options = availableNodes(run);
    expect(options.length).toBeGreaterThanOrEqual(2);
    expect(options.every((n) => n.row === 0)).toBe(true);
  });

  it('only allows moving along connections', () => {
    const run = createRun();
    const first = availableNodes(run)[0];
    expect(moveToNode(run, 'nonexistent')).toBeNull();
    expect(moveToNode(run, first.id)).toBe(first);
    expect(run.currentRow).toBe(0);

    const nextOptions = availableNodes(run);
    expect(nextOptions.every((n) => first.next.includes(n.id))).toBe(true);
    // A row-2 node is not reachable directly from row 0.
    const farNode = run.map.nodes.find((n) => n.row === 2)!;
    expect(moveToNode(run, farNode.id)).toBeNull();
  });

  it('advanceFloor resets position and regenerates the map', () => {
    const run = createRun();
    moveToNode(run, availableNodes(run)[0].id);
    advanceFloor(run);
    expect(run.floor).toBe(1);
    expect(run.currentNodeId).toBeNull();
    expect(run.currentRow).toBe(-1);
    expect(run.floor).toBeLessThan(FLOOR_COUNT);
  });
});

describe('rest / relics / recruiting', () => {
  it('applyRest heals 30% of max HP without overhealing', () => {
    const run = createRun();
    const max = runTeamMaxHp(run);
    run.teamHp = Math.round(max * 0.5);
    const gained = applyRest(run);
    expect(gained).toBe(Math.round(max * 0.3));
    run.teamHp = max;
    expect(applyRest(run)).toBe(0);
  });

  it('trainRandomMember boosts one member +15% ATK/HP and raises runTeamMaxHp consistently', () => {
    const run = createRun();
    const index = 1;
    const original = run.team[index];
    const originalAttack = original.attack;
    const originalMaxHp = original.maxHp;
    const maxBefore = runTeamMaxHp(run);

    const result = trainRandomMember(run, seqRng([(index + 0.5) / run.team.length]));

    expect(result.character).toBe(run.team[index]);
    expect(result.character.attack).toBe(Math.round(originalAttack * 1.15));
    expect(result.character.maxHp).toBe(Math.round(originalMaxHp * 1.15));
    expect(result.attackGain).toBe(result.character.attack - originalAttack);
    expect(result.hpGain).toBe(result.character.maxHp - originalMaxHp);
    expect(runTeamMaxHp(run)).toBe(maxBefore + result.hpGain);
  });

  it('trainRandomMember never mutates the shared character template', () => {
    const run = createRun();
    const templateBefore = { ...run.team[0] };
    trainRandomMember(run, seqRng([0]));
    // The original template object elsewhere (e.g. DEFAULT_TEAM/CHARACTER_POOL)
    // must be untouched — only run.team's slot was replaced with a new object.
    expect(templateBefore.attack).not.toBe(run.team[0].attack);
  });

  it("trainRandomMember raises current HP by the member's hp gain, capped at the new max", () => {
    const run = createRun();
    run.teamHp = runTeamMaxHp(run); // start at full HP
    trainRandomMember(run, seqRng([0]));
    expect(run.teamHp).toBe(runTeamMaxHp(run)); // capped, no overheal beyond the new max

    const run2 = createRun();
    const maxBefore = runTeamMaxHp(run2);
    run2.teamHp = Math.round(maxBefore * 0.4);
    const hpBefore = run2.teamHp;
    const result2 = trainRandomMember(run2, seqRng([0]));
    expect(run2.teamHp).toBe(hpBefore + result2.hpGain);
    expect(run2.teamHp).toBeLessThanOrEqual(runTeamMaxHp(run2));
  });

  it('relicChoices excludes owned relics and addRelic is idempotent', () => {
    const run = createRun();
    addRelic(run, RELICS[0]);
    addRelic(run, RELICS[0]);
    expect(run.relics).toHaveLength(1);
    const choices = relicChoices(run, 3);
    expect(choices).toHaveLength(3);
    expect(choices.every((r) => r.id !== RELICS[0].id)).toBe(true);
  });

  it('addRelic records the relic name in stats.relicsCollected, but not on repeat pickups', () => {
    const run = createRun();
    expect(run.stats.relicsCollected).toEqual([]);
    addRelic(run, RELICS[0]);
    addRelic(run, RELICS[1]);
    addRelic(run, RELICS[0]); // already owned, should be a no-op
    expect(run.stats.relicsCollected).toEqual([RELICS[0].name, RELICS[1].name]);
  });

  it("Giant's Belt raises max HP and current HP together", () => {
    const run = createRun();
    const beltRelic = RELICS.find((r) => r.id === 'giants-belt')!;
    const baseMax = runTeamMaxHp(run);
    addRelic(run, beltRelic);
    expect(runTeamMaxHp(run)).toBe(Math.round(baseMax * 1.2));
    expect(run.teamHp).toBe(runTeamMaxHp(run));
  });

  it('recruit adds members until the team is full, then replaces', () => {
    const run = createRun();
    const startSize = run.team.length;
    const startHp = run.teamHp;
    const candidates = recruitChoices(run, 3);
    expect(candidates.every((c) => !run.team.some((t) => t.id === c.id))).toBe(true);

    recruit(run, candidates[0]);
    expect(run.team).toHaveLength(startSize + 1);
    expect(run.teamHp).toBe(Math.min(runTeamMaxHp(run), startHp + candidates[0].maxHp));

    while (run.team.length < MAX_TEAM_SIZE) {
      recruit(run, recruitChoices(run, 1)[0]);
    }
    const replacement = recruitChoices(run, 1)[0];
    recruit(run, replacement, 0);
    expect(run.team).toHaveLength(MAX_TEAM_SIZE);
    expect(run.team[0].id).toBe(replacement.id);
  });
});

describe('generateEncounter', () => {
  it('returns the fixed floor boss for boss nodes', () => {
    const run = createRun();
    const bossNode = run.map.nodes.find((n) => n.type === 'boss')!;
    const enemies = generateEncounter(run, bossNode);
    expect(enemies).toHaveLength(1);
    expect(enemies[0].name).toBe('Slime Overlord');
  });

  it('elites are stronger than plain battles on the same row and carry a skill', () => {
    const run = createRun();
    const node = { id: 'x', type: 'battle' as const, row: 2, col: 0, next: [] };
    const eliteNode = { ...node, type: 'elite' as const };
    const rng = seqRng([0.1]);
    const battle = generateEncounter(run, node, rng)[0];
    const elite = generateEncounter(run, eliteNode, seqRng([0.1]))[0];
    expect(elite.maxHp).toBeGreaterThan(battle.maxHp);
    expect(elite.skill).toBeDefined();
    expect(elite.name.startsWith('Elite ')).toBe(true);
  });

  it('rolls all five elite skill types across the roll range, keeping skills[0] and skill in sync', () => {
    const run = createRun();
    const eliteNode = { id: 'x', type: 'elite' as const, row: 2, col: 0, next: [] };
    const expected: Array<[number, string]> = [
      [0.05, 'shield'],
      [0.25, 'lock'],
      [0.45, 'poison'],
      [0.65, 'petrify'],
      [0.85, 'ignite'],
    ];
    for (const [roll, type] of expected) {
      // Two rng() calls happen before the skill roll (template pick + attackInterval unused here);
      // seed the queue so the *second* call lands on our target roll.
      const elite = generateEncounter(run, eliteNode, seqRng([0.1, roll]))[0];
      expect(elite.skills?.[0].type).toBe(type);
      expect(elite.skill).toEqual(elite.skills?.[0]);
    }
  });

  it('boss encounters carry multiple skills via skills[]', () => {
    const run = createRun();
    const bossNode = run.map.nodes.find((n) => n.type === 'boss')!;
    const boss = generateEncounter(run, bossNode)[0];
    expect(boss.skills?.length).toBeGreaterThanOrEqual(2);
  });

  it('scales enemy stats with floor depth', () => {
    const run0 = createRun();
    const run2 = createRun();
    run2.floor = 2;
    const node = { id: 'x', type: 'battle' as const, row: 1, col: 0, next: [] };
    const rng = () => 0.1;
    const early = generateEncounter(run0, node, rng)[0];
    const late = generateEncounter(run2, node, rng)[0];
    expect(late.maxHp).toBeGreaterThan(early.maxHp);
    expect(late.attack).toBeGreaterThan(early.attack);
  });

  it('grunt HP and attack strictly increase with floor depth', () => {
    const node = { id: 'x', type: 'battle' as const, row: 0, col: 0, next: [] };
    const rng = () => 0.1;
    let prevHp = -Infinity;
    let prevAttack = -Infinity;
    for (let floor = 0; floor < FLOOR_COUNT; floor++) {
      const run = createRun();
      run.floor = floor;
      const enemy = generateEncounter(run, node, rng)[0];
      expect(enemy.maxHp).toBeGreaterThan(prevHp);
      expect(enemy.attack).toBeGreaterThan(prevAttack);
      prevHp = enemy.maxHp;
      prevAttack = enemy.attack;
    }
  });

  it('boss HP exceeds the strongest same-floor elite', () => {
    const rng = () => 0.1;
    for (let floor = 0; floor < FLOOR_COUNT; floor++) {
      const run = createRun();
      run.floor = floor;
      const eliteNode = { id: 'e', type: 'elite' as const, row: ROWS_PER_FLOOR - 2, col: 0, next: [] };
      const bossNode = { id: 'b', type: 'boss' as const, row: ROWS_PER_FLOOR - 1, col: 0, next: [] };
      const elite = generateEncounter(run, eliteNode, rng)[0];
      const boss = generateEncounter(run, bossNode, rng)[0];
      expect(boss.maxHp).toBeGreaterThan(elite.maxHp);
    }
  });
});

describe('run persistence (sessionStorage)', () => {
  beforeEach(() => {
    (globalThis as unknown as { sessionStorage: Storage }).sessionStorage = createMemoryStorage();
  });

  it('saveRunSnapshot/loadRunSnapshot round-trips relics, recruited characters, and progress fields', () => {
    const run = createRun();
    moveToNode(run, availableNodes(run)[0].id);
    addRelic(run, RELICS[0]);
    const candidate = recruitChoices(run, 1)[0];
    recruit(run, candidate);
    run.teamHp = 123;
    saveRunSnapshot(run);

    const restored = loadRunSnapshot();
    expect(restored).not.toBeNull();
    expect(restored!.floor).toBe(run.floor);
    expect(restored!.currentRow).toBe(run.currentRow);
    expect(restored!.currentNodeId).toBe(run.currentNodeId);
    expect(restored!.visitedNodeIds).toEqual(run.visitedNodeIds);
    expect(restored!.teamHp).toBe(123);
    expect(restored!.map).toEqual(run.map);
    // Relics are rebuilt from the RELICS lookup by id, not plain serialized objects.
    expect(restored!.relics).toHaveLength(1);
    expect(restored!.relics[0]).toBe(RELICS[0]);
    // The recruited character is restored by id via findCharacterTemplate/DEFAULT_TEAM fallback.
    expect(restored!.team.map((c) => c.id)).toEqual(run.team.map((c) => c.id));
    expect(restored!.team.some((c) => c.id === candidate.id)).toBe(true);
  });

  it('loadRunSnapshot returns null when nothing has been saved', () => {
    expect(loadRunSnapshot()).toBeNull();
  });

  it('saveRunSnapshot(null) clears any stored snapshot', () => {
    saveRunSnapshot(createRun());
    expect(loadRunSnapshot()).not.toBeNull();
    saveRunSnapshot(null);
    expect(loadRunSnapshot()).toBeNull();
  });

  it('getActiveRun lazily restores a persisted run after a simulated page reload', async () => {
    vi.resetModules();
    const fresh1 = await import('./run');
    const run = fresh1.createRun();
    fresh1.setActiveRun(run);

    // Simulate a reload: re-import the module so its module-level activeRun starts null again.
    vi.resetModules();
    const fresh2 = await import('./run');
    const restored = fresh2.getActiveRun();
    expect(restored).not.toBeNull();
    expect(restored!.team.map((c) => c.id)).toEqual(run.team.map((c) => c.id));
    expect(restored!.teamHp).toBe(run.teamHp);
  });

  it('setActiveRun(null) clears the stored snapshot so a later restore finds nothing', async () => {
    vi.resetModules();
    const fresh1 = await import('./run');
    fresh1.setActiveRun(fresh1.createRun());
    fresh1.setActiveRun(null);

    vi.resetModules();
    const fresh2 = await import('./run');
    expect(fresh2.getActiveRun()).toBeNull();
  });
});

describe('run stats', () => {
  it('createRun starts with all stats at zero/empty', () => {
    const run = createRun();
    expect(run.stats).toEqual({
      battlesWon: 0,
      elitesKilled: 0,
      floorsCleared: 0,
      relicsCollected: [],
    });
  });

  it('recordVictory increments battlesWon for every node type', () => {
    const run = createRun();
    recordVictory(run, 'battle');
    recordVictory(run, 'battle');
    recordVictory(run, 'elite');
    recordVictory(run, 'boss');
    expect(run.stats.battlesWon).toBe(4);
  });

  it('recordVictory only increments elitesKilled for elite nodes', () => {
    const run = createRun();
    recordVictory(run, 'battle');
    recordVictory(run, 'elite');
    recordVictory(run, 'elite');
    expect(run.stats.elitesKilled).toBe(2);
  });

  it('recordVictory only increments floorsCleared for boss nodes', () => {
    const run = createRun();
    recordVictory(run, 'battle');
    recordVictory(run, 'elite');
    expect(run.stats.floorsCleared).toBe(0);
    recordVictory(run, 'boss');
    recordVictory(run, 'boss');
    expect(run.stats.floorsCleared).toBe(2);
  });

  it('recordVictory persists the run (survives a snapshot round-trip)', () => {
    (globalThis as unknown as { sessionStorage: Storage }).sessionStorage = createMemoryStorage();
    const run = createRun();
    recordVictory(run, 'elite');
    saveRunSnapshot(run);
    const restored = loadRunSnapshot();
    expect(restored?.stats).toEqual(run.stats);
  });
});

describe('aggregateRelics', () => {
  it('stacks multiplicative and additive effects', () => {
    const mods = aggregateRelics(RELICS);
    expect(mods.moveTimeBonusMs).toBe(2000);
    expect(mods.elementDamageMultiplier[0]).toBeCloseTo(1.3);
    expect(mods.allDamageMultiplier).toBeCloseTo(1.15);
    expect(mods.healMultiplier).toBeCloseTo(1.5);
    expect(mods.postBattleHealFraction).toBeCloseTo(0.15);
    expect(mods.maxHpMultiplier).toBeCloseTo(1.2);
  });
});
