import { describe, expect, it } from 'vitest';
import { Board } from './Board';
import { EMPTY, GEM_TYPE_COUNT } from './constants';

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
});
