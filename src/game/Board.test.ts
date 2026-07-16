import { describe, expect, it } from 'vitest';
import { Board } from './Board';
import { EMPTY, GEM_TYPE_COUNT, STONE } from './constants';

describe('Board', () => {
  it('fillRandomNoMatches produces a grid with no pre-existing matches', () => {
    const board = new Board(8, 8);
    board.fillRandomNoMatches();
    expect(board.findMatches().size).toBe(0);
  });

  it('fillRandomNoMatches only uses valid gem types', () => {
    const board = new Board(8, 8);
    board.fillRandomNoMatches();
    for (let r = 0; r < board.rows; r++) {
      for (let c = 0; c < board.cols; c++) {
        const type = board.get(r, c);
        expect(type).toBeGreaterThanOrEqual(0);
        expect(type).toBeLessThan(GEM_TYPE_COUNT);
      }
    }
  });

  it('isAdjacent recognizes only orthogonal neighbors', () => {
    const board = new Board(8, 8);
    expect(board.isAdjacent({ row: 2, col: 2 }, { row: 2, col: 3 })).toBe(true);
    expect(board.isAdjacent({ row: 2, col: 2 }, { row: 3, col: 2 })).toBe(true);
    expect(board.isAdjacent({ row: 2, col: 2 }, { row: 3, col: 3 })).toBe(false); // diagonal
    expect(board.isAdjacent({ row: 2, col: 2 }, { row: 2, col: 2 })).toBe(false); // same cell
  });

  it('isNeighbor8 also accepts diagonal neighbors but not the same cell or distant cells', () => {
    const board = new Board(8, 8);
    expect(board.isNeighbor8({ row: 2, col: 2 }, { row: 2, col: 3 })).toBe(true);
    expect(board.isNeighbor8({ row: 2, col: 2 }, { row: 3, col: 3 })).toBe(true); // diagonal
    expect(board.isNeighbor8({ row: 2, col: 2 }, { row: 2, col: 2 })).toBe(false); // same cell
    expect(board.isNeighbor8({ row: 2, col: 2 }, { row: 2, col: 4 })).toBe(false); // too far
  });

  it('swap exchanges the gem types at two cells', () => {
    const board = new Board(3, 3);
    board.set(0, 0, 1);
    board.set(0, 1, 2);
    board.swap({ row: 0, col: 0 }, { row: 0, col: 1 });
    expect(board.get(0, 0)).toBe(2);
    expect(board.get(0, 1)).toBe(1);
  });

  it('findMatches detects a horizontal run of 3+', () => {
    const board = new Board(5, 5);
    board.fillRandomNoMatches();
    board.set(0, 0, 3);
    board.set(0, 1, 3);
    board.set(0, 2, 3);
    const matches = board.findMatches();
    expect(matches.has('0,0')).toBe(true);
    expect(matches.has('0,1')).toBe(true);
    expect(matches.has('0,2')).toBe(true);
  });

  /** Fills the board with an alternating 4/5 checkerboard: no runs of 3 anywhere. */
  function fillCheckerboard(board: Board): void {
    for (let r = 0; r < board.rows; r++) {
      for (let c = 0; c < board.cols; c++) {
        board.set(r, c, (r + c) % 2 === 0 ? 4 : 5);
      }
    }
  }

  it('groupMatches keeps differently-colored adjacent runs in separate groups', () => {
    const board = new Board(5, 5);
    fillCheckerboard(board);
    // Row 0: red run of 3, immediately followed by blue run of 3. Cap both
    // runs with a 3rd distinct color so the base fill can't extend them.
    board.set(0, 0, 0);
    board.set(0, 1, 0);
    board.set(0, 2, 0);
    board.set(0, 3, 3);
    board.set(1, 0, 1);
    board.set(1, 1, 1);
    board.set(1, 2, 1);
    board.set(1, 3, 3);
    const matches = board.findMatches();
    const groups = board.groupMatches(matches);
    expect(groups).toHaveLength(2);
    expect(groups.every((g) => g.size === 3)).toBe(true);
  });

  it('groupMatches merges an intersecting horizontal+vertical run of the same color into one group', () => {
    const board = new Board(5, 5);
    fillCheckerboard(board);
    // Plus/cross shape of color 4 centered at (2,2).
    board.set(2, 0, 4);
    board.set(2, 1, 4);
    board.set(2, 2, 4);
    board.set(2, 3, 4);
    board.set(0, 2, 4);
    board.set(1, 2, 4);
    // (3,2) already part of the vertical run through (0,2)-(2,2); extend it.
    board.set(3, 2, 4);
    const matches = board.findMatches();
    const groups = board.groupMatches(matches);
    // The horizontal run (2,0)-(2,3) and vertical run (0,2)-(3,2) share (2,2),
    // so they should merge into a single connected group.
    const merged = groups.find((g) => g.size >= 7);
    expect(merged).toBeDefined();
  });

  it('clearCells empties the given cells', () => {
    const board = new Board(3, 3);
    board.set(0, 0, 2);
    board.clearCells(new Set(['0,0']));
    expect(board.get(0, 0)).toBe(EMPTY);
  });

  it('lockRandomCells locks the requested number of non-empty cells', () => {
    const board = new Board(4, 4);
    board.fillRandomNoMatches();
    const locked = board.lockRandomCells(3);
    expect(locked).toHaveLength(3);
    for (const cell of locked) {
      expect(board.isLocked(cell.row, cell.col)).toBe(true);
    }
    expect(board.locked.size).toBe(3);
  });

  it('clearCells removes the lock from cleared cells', () => {
    const board = new Board(3, 3);
    board.fillRandomNoMatches();
    board.locked.add('0,0');
    board.clearCells(new Set(['0,0']));
    expect(board.isLocked(0, 0)).toBe(false);
  });

  it('locks travel with falling gems during gravity', () => {
    const board = new Board(1, 3);
    board.set(0, 0, 1);
    board.set(1, 0, EMPTY);
    board.set(2, 0, EMPTY);
    board.locked.add('0,0');
    board.applyGravityAndRefill();
    expect(board.isLocked(0, 0)).toBe(false);
    expect(board.isLocked(2, 0)).toBe(true); // the locked gem fell to the bottom
  });

  it('applyGravityAndRefill drops gems down and fills empties at the top', () => {
    const board = new Board(3, 3);
    board.fillRandomNoMatches();
    board.set(2, 0, EMPTY);
    board.set(1, 0, EMPTY);
    board.set(0, 0, 5);
    const { moves, spawns } = board.applyGravityAndRefill();
    expect(board.get(2, 0)).toBe(5); // fell to the bottom
    expect(board.get(0, 0)).not.toBe(EMPTY); // refilled
    expect(moves.length).toBeGreaterThan(0);
    expect(spawns.length).toBeGreaterThan(0);
    // No empty cells should remain anywhere on the board after refill.
    for (let r = 0; r < board.rows; r++) {
      for (let c = 0; c < board.cols; c++) {
        expect(board.get(r, c)).not.toBe(EMPTY);
      }
    }
  });

  describe('convertGems', () => {
    it('changes every cell of one type to another and returns the changed cells', () => {
      const board = new Board(3, 3);
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) board.set(r, c, 0);
      }
      board.set(0, 0, 1);
      board.set(1, 1, 1);
      board.set(2, 2, 0); // not type 1, should be untouched

      const changed = board.convertGems(1, 3);

      expect(board.get(0, 0)).toBe(3);
      expect(board.get(1, 1)).toBe(3);
      expect(board.get(2, 2)).toBe(0);
      expect(changed).toEqual(
        expect.arrayContaining([{ row: 0, col: 0 }, { row: 1, col: 1 }]),
      );
      expect(changed).toHaveLength(2);
    });

    it('converted cells that were locked stay locked', () => {
      const board = new Board(3, 3);
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) board.set(r, c, 0);
      }
      board.set(1, 1, 2);
      board.locked.add('1,1');

      board.convertGems(2, 4);

      expect(board.get(1, 1)).toBe(4);
      expect(board.isLocked(1, 1)).toBe(true);
    });

    it('returns an empty array when no cells match the source type', () => {
      const board = new Board(3, 3);
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) board.set(r, c, 0);
      }
      expect(board.convertGems(1, 2)).toEqual([]);
    });
  });

  describe('convertRandomGems', () => {
    it('converts exactly min(count, available) gems and only gems of the from type', () => {
      const board = new Board(3, 3);
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) board.set(r, c, 0);
      }
      board.set(0, 0, 1);
      board.set(1, 1, 1);
      board.set(2, 2, 1);

      const changed = board.convertRandomGems(1, 3, 2);

      expect(changed).toHaveLength(2);
      let convertedCount = 0;
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          if (board.get(r, c) === 3) convertedCount++;
        }
      }
      expect(convertedCount).toBe(2);
      // The untouched type-1 cell must still be type 1.
      const remainingOnes = [0, 1, 2].flatMap((r) =>
        [0, 1, 2].filter((c) => board.get(r, c) === 1).map((c) => ({ row: r, col: c })),
      );
      expect(remainingOnes).toHaveLength(1);
    });

    it('caps at the number of available matching cells when count exceeds them', () => {
      const board = new Board(3, 3);
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) board.set(r, c, 0);
      }
      board.set(0, 0, 1);

      const changed = board.convertRandomGems(1, 2, 5);

      expect(changed).toEqual([{ row: 0, col: 0 }]);
      expect(board.get(0, 0)).toBe(2);
    });

    it('returns an empty array when no cells match the source type', () => {
      const board = new Board(3, 3);
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) board.set(r, c, 0);
      }
      expect(board.convertRandomGems(1, 2, 3)).toEqual([]);
    });
  });
});

describe('Board petrified cells (stone)', () => {
  it('petrifyRandomCells destroys the gem, marks isPetrified, and clears lock/burning state', () => {
    const board = new Board(3, 3);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) board.set(r, c, EMPTY);
    }
    board.set(1, 1, 2);
    board.locked.add('1,1');
    board.burning.set('1,1', 3);

    const petrified = board.petrifyRandomCells(1);

    expect(petrified).toEqual([{ row: 1, col: 1 }]);
    expect(board.get(1, 1)).toBe(STONE);
    expect(board.isPetrified(1, 1)).toBe(true);
    expect(board.isLocked(1, 1)).toBe(false);
    expect(board.isBurning(1, 1)).toBe(false);
  });

  it('caps at the number of available non-empty, non-stone cells', () => {
    const board = new Board(3, 3);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) board.set(r, c, EMPTY);
    }
    board.set(0, 0, 1);

    const petrified = board.petrifyRandomCells(5);

    expect(petrified).toHaveLength(1);
    expect(board.get(0, 0)).toBe(STONE);
  });

  it('two adjacent stones never form a match, even though they share the same grid value', () => {
    const board = new Board(3, 3);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) board.set(r, c, STONE);
    }
    expect(board.findMatches().size).toBe(0);
  });

  it('a stone breaks a run in two instead of joining it', () => {
    const board = new Board(5, 1);
    board.set(0, 0, 3);
    board.set(0, 1, 3);
    board.set(0, 2, STONE);
    board.set(0, 3, 3);
    board.set(0, 4, 3);
    // Two separate runs of length 2 on either side of the stone — neither reaches 3.
    expect(board.findMatches().size).toBe(0);
  });

  it('destroyAdjacentStones shatters only orthogonal neighbors of cleared cells', () => {
    const board = new Board(3, 3);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) board.set(r, c, 0);
    }
    board.set(0, 1, STONE); // orthogonal neighbor of (1,1)
    board.set(1, 0, STONE); // orthogonal neighbor of (1,1)
    board.set(0, 0, STONE); // diagonal neighbor of (1,1) — must NOT shatter
    board.set(2, 2, STONE); // unrelated — must NOT shatter

    const destroyed = board.destroyAdjacentStones(new Set(['1,1']));

    expect(destroyed).toEqual(
      expect.arrayContaining([{ row: 0, col: 1 }, { row: 1, col: 0 }]),
    );
    expect(destroyed).toHaveLength(2);
    expect(board.get(0, 1)).toBe(EMPTY);
    expect(board.get(1, 0)).toBe(EMPTY);
    expect(board.get(0, 0)).toBe(STONE);
    expect(board.get(2, 2)).toBe(STONE);
  });
});

describe('Board segmented gravity (stones block falling)', () => {
  it('a gem above a stone settles at the bottom of its own segment and never crosses the stone', () => {
    const board = new Board(1, 5); // single column, 5 rows
    board.set(0, 0, EMPTY);
    board.set(1, 0, 3); // gem above the stone
    board.set(2, 0, STONE);
    board.set(3, 0, EMPTY);
    board.set(4, 0, EMPTY);

    const { moves, spawns } = board.applyGravityAndRefill(() => 0.5);

    expect(board.get(1, 0)).toBe(3); // stayed above the stone
    expect(board.isPetrified(2, 0)).toBe(true); // stone untouched
    expect(board.get(0, 0)).not.toBe(EMPTY); // refilled at the top of its segment
    expect(board.get(3, 0)).not.toBe(EMPTY); // segment below refilled independently
    expect(board.get(4, 0)).not.toBe(EMPTY);
    expect(spawns.some((s) => s.row === 2)).toBe(false); // the stone row itself never refills
    expect(spawns).toHaveLength(3);

    for (const move of moves) {
      const crossedStone = (move.from.row < 2 && move.to.row > 2) || (move.from.row > 2 && move.to.row < 2);
      expect(crossedStone).toBe(false);
    }
  });
});

describe('Board burning cells (ignite)', () => {
  it('igniteRandomCells sets a duration timer; re-igniting refreshes rather than stacking', () => {
    const board = new Board(3, 3);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) board.set(r, c, EMPTY);
    }
    board.set(1, 1, 2);

    const ignited = board.igniteRandomCells(1, 3);
    expect(ignited).toEqual([{ row: 1, col: 1 }]);
    expect(board.isBurning(1, 1)).toBe(true);
    expect(board.burning.get('1,1')).toBe(3);

    board.tickBurning(); // down to 2
    board.igniteRandomCells(1, 5); // refreshes to 5, doesn't add to the remaining 2
    expect(board.burning.get('1,1')).toBe(5);
  });

  it('igniteRandomCells never touches stone or empty cells', () => {
    const board = new Board(3, 3);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) board.set(r, c, EMPTY);
    }
    board.set(0, 0, STONE);
    board.set(1, 1, 2);

    const ignited = board.igniteRandomCells(5, 3);
    expect(ignited).toEqual([{ row: 1, col: 1 }]);
  });

  it('tickBurning decrements every cell, expires at 0, and returns the pre-tick count', () => {
    const board = new Board(3, 3);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) board.set(r, c, 0);
    }
    board.burning.set('0,0', 1);
    board.burning.set('1,1', 2);

    const before = board.tickBurning();
    expect(before).toBe(2);
    expect(board.isBurning(0, 0)).toBe(false); // expired
    expect(board.isBurning(1, 1)).toBe(true);
    expect(board.burning.get('1,1')).toBe(1);

    const before2 = board.tickBurning();
    expect(before2).toBe(1);
    expect(board.isBurning(1, 1)).toBe(false);
  });

  it('clearCells extinguishes burning on any cleared cell', () => {
    const board = new Board(3, 3);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) board.set(r, c, 0);
    }
    board.burning.set('1,1', 3);

    board.clearCells(new Set(['1,1']));

    expect(board.isBurning(1, 1)).toBe(false);
  });

  it('burning is fixed to the cell and does not move with gravity', () => {
    const board = new Board(1, 3);
    board.set(0, 0, EMPTY);
    board.set(1, 0, 4); // will fall to row 2
    board.set(2, 0, EMPTY);
    board.burning.set('2,0', 3); // the empty destination cell is burning

    board.applyGravityAndRefill(() => 0.5);

    // The gem moved into the burning cell, but the burning flag stayed fixed
    // to that cell rather than following the gem from its old position.
    expect(board.get(2, 0)).toBe(4);
    expect(board.isBurning(2, 0)).toBe(true);
    expect(board.isBurning(1, 0)).toBe(false);
  });
});

describe('Board fillRandomNoMatches resets cell-fixed state', () => {
  it('clears stones, burning, and locks for a fresh board', () => {
    const board = new Board(4, 4);
    board.fillRandomNoMatches();
    board.set(1, 1, STONE);
    board.burning.set('2,2', 3);
    board.locked.add('0,0');

    board.fillRandomNoMatches();

    expect(board.isPetrified(1, 1)).toBe(false);
    expect(board.burning.size).toBe(0);
    expect(board.locked.size).toBe(0);
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        expect(board.get(r, c)).toBeGreaterThanOrEqual(0);
        expect(board.get(r, c)).toBeLessThan(GEM_TYPE_COUNT);
      }
    }
  });
});

describe('Board enhanced gems (gravity spawn)', () => {
  it('enhanceChance=1 makes every refilled gem enhanced; enhanceChance=0 makes none', () => {
    const board = new Board(3, 3);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) board.set(r, c, EMPTY);
    }

    const { spawns } = board.applyGravityAndRefill(() => 0.5, { enhanceChance: 1 });
    expect(spawns).toHaveLength(9);
    for (const { row, col } of spawns) {
      expect(board.isEnhanced(row, col)).toBe(true);
    }

    const board2 = new Board(3, 3);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) board2.set(r, c, EMPTY);
    }
    const { spawns: spawns2 } = board2.applyGravityAndRefill(() => 0.5, { enhanceChance: 0 });
    for (const { row, col } of spawns2) {
      expect(board2.isEnhanced(row, col)).toBe(false);
    }
  });

  it('the enhanced flag travels with gravity, like locked', () => {
    const board = new Board(1, 3);
    board.set(0, 0, EMPTY);
    board.set(1, 0, 2);
    board.set(2, 0, EMPTY);
    board.enhanced.add('1,0');

    board.applyGravityAndRefill(() => 0.9, { enhanceChance: 0 });

    // The gem at row1 falls to the bottom of the column; its flag follows.
    expect(board.get(2, 0)).toBe(2);
    expect(board.isEnhanced(2, 0)).toBe(true);
    expect(board.isEnhanced(1, 0)).toBe(false);
  });

  it('groupMatches reports how many gems in a matched group are enhanced', () => {
    const board = new Board(3, 1);
    board.set(0, 0, 1);
    board.set(0, 1, 1);
    board.set(0, 2, 1);
    board.enhanced.add('0,0');
    board.enhanced.add('0,2');

    const matches = board.findMatches();
    const groups = board.groupMatches(matches);

    expect(groups).toHaveLength(1);
    expect(groups[0].enhancedCount).toBe(2);
  });
});

describe('Board bomb gems', () => {
  it('spawnBombsForGroups keeps the gem at the cell nearest the group centroid for a 5+ group', () => {
    const board = new Board(5, 1);
    board.set(0, 0, 3);
    board.set(0, 1, 3);
    board.set(0, 2, 3);
    board.set(0, 3, 3);
    board.set(0, 4, 3);

    const matches = board.findMatches();
    const groups = board.groupMatches(matches);
    expect(groups).toHaveLength(1);

    const kept = board.spawnBombsForGroups(groups);

    expect(kept).toEqual([{ row: 0, col: 2 }]); // centroid col = 2, dead center
    expect(board.isBomb(0, 2)).toBe(true);
    expect(board.get(0, 2)).toBe(3); // the gem stays, keeping its element
  });

  it('does not spawn a bomb for groups smaller than 5', () => {
    const board = new Board(4, 1);
    board.set(0, 0, 1);
    board.set(0, 1, 1);
    board.set(0, 2, 1);
    board.set(0, 3, EMPTY);

    const matches = board.findMatches();
    const groups = board.groupMatches(matches);
    const kept = board.spawnBombsForGroups(groups);

    expect(kept).toEqual([]);
  });

  it('explodeBombs clears the 3x3 area around a matched bomb, clipped at the board edges', () => {
    const board = new Board(3, 3);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) board.set(r, c, 0);
    }
    board.bombs.add('0,0'); // corner bomb: only a 2x2 blast fits on the board

    const result = board.explodeBombs(new Set(['0,0']));

    expect(result.blastCells).toEqual(new Set(['0,0', '0,1', '1,0', '1,1']));
    for (const key of result.blastCells) {
      const [r, c] = key.split(',').map(Number);
      expect(board.get(r, c)).toBe(EMPTY);
    }
    expect(board.get(2, 2)).not.toBe(EMPTY); // untouched, outside the blast
    expect(result.firstBombElement).toBe(0);
  });

  it('chained bombs inside a blast radius explode too (BFS)', () => {
    const board = new Board(5, 5);
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) board.set(r, c, 0);
    }
    board.bombs.add('2,2'); // bomb A, matched this wave
    board.bombs.add('3,3'); // bomb B, sits inside A's 3x3 blast (rows1-3,cols1-3)

    const result = board.explodeBombs(new Set(['2,2']));

    // B's own 3x3 (rows2-4,cols2-4) reaches (4,4), which A's blast alone never touches.
    expect(result.blastCells.has('4,4')).toBe(true);
    expect(board.get(4, 4)).toBe(EMPTY);
    expect(result.firstBombElement).toBe(0);
  });

  it('a blast destroys stones, removes locks, and extinguishes burning within its radius', () => {
    const board = new Board(3, 3);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) board.set(r, c, 0);
    }
    board.bombs.add('1,1');
    board.set(0, 0, STONE);
    board.locked.add('0,1');
    board.burning.set('1,0', 3);

    const result = board.explodeBombs(new Set(['1,1']));

    expect(result.destroyedStones).toEqual([{ row: 0, col: 0 }]);
    expect(board.get(0, 0)).toBe(EMPTY);
    expect(board.isLocked(0, 1)).toBe(false);
    expect(board.isBurning(1, 0)).toBe(false);
  });

  it('returns firstBombElement null and an empty blast when no bomb is involved', () => {
    const board = new Board(3, 3);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) board.set(r, c, 0);
    }

    const result = board.explodeBombs(new Set(['0,0']));

    expect(result.firstBombElement).toBeNull();
    expect(result.blastCells.size).toBe(0);
    expect(result.destroyedStones).toEqual([]);
  });

  it('bomb flags travel with gravity, like locked', () => {
    const board = new Board(1, 3);
    board.set(0, 0, EMPTY);
    board.set(1, 0, 4);
    board.set(2, 0, EMPTY);
    board.bombs.add('1,0');

    board.applyGravityAndRefill(() => 0.9, { enhanceChance: 0 });

    expect(board.get(2, 0)).toBe(4);
    expect(board.isBomb(2, 0)).toBe(true);
    expect(board.isBomb(1, 0)).toBe(false);
  });
});

describe('Board gemTypes palette', () => {
  it('fillRandomNoMatches only spawns gems from the given palette', () => {
    const board = new Board(6, 6);
    // 3+ colors guarantees wouldMatchAt() can always find a valid pick (at most
    // 2 values can be simultaneously forbidden by the horizontal/vertical runs).
    board.fillRandomNoMatches(Math.random, [0, 2, 4]);

    for (let r = 0; r < board.rows; r++) {
      for (let c = 0; c < board.cols; c++) {
        expect([0, 2, 4]).toContain(board.get(r, c));
      }
    }
    expect(board.findMatches().size).toBe(0);
  });

  it('fillRandomNoMatches uses the full default palette when gemTypes is omitted', () => {
    const board = new Board(8, 8);
    board.fillRandomNoMatches();
    for (let r = 0; r < board.rows; r++) {
      for (let c = 0; c < board.cols; c++) {
        expect(board.get(r, c)).toBeGreaterThanOrEqual(0);
        expect(board.get(r, c)).toBeLessThan(GEM_TYPE_COUNT);
      }
    }
  });

  it('applyGravityAndRefill only spawns gems from the given palette', () => {
    const board = new Board(3, 3);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) board.set(r, c, EMPTY);
    }

    const { spawns } = board.applyGravityAndRefill(Math.random, { gemTypes: [1, 3], enhanceChance: 0 });

    expect(spawns).toHaveLength(9);
    for (const { row, col } of spawns) {
      expect([1, 3]).toContain(board.get(row, col));
    }
  });

  it('applyGravityAndRefill falls back to the full palette when gemTypes is omitted', () => {
    const board = new Board(3, 3);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) board.set(r, c, EMPTY);
    }

    const { spawns } = board.applyGravityAndRefill(Math.random, { enhanceChance: 0 });

    for (const { row, col } of spawns) {
      const type = board.get(row, col);
      expect(type).toBeGreaterThanOrEqual(0);
      expect(type).toBeLessThan(GEM_TYPE_COUNT);
    }
  });
});
