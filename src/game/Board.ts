import { BOARD_COLS, BOARD_ROWS, EMPTY, ENHANCED_SPAWN_CHANCE, GEM_TYPE_COUNT, STONE } from './constants';

export interface Vec2 {
  row: number;
  col: number;
}

/**
 * Pure data model for the match-3 board. Holds no rendering/Phaser references
 * so it can be unit-tested and reasoned about independently of the scene.
 */
export class Board {
  grid: number[][];
  cols: number;
  rows: number;
  /**
   * Cells ("row,col" keys) locked by enemy skills. Locked gems can't be
   * dragged or displaced, but clearing them in a match removes the lock.
   */
  locked: Set<string> = new Set();
  /**
   * Cells ("row,col" keys) currently on fire, mapped to turns remaining
   * (enemy "ignite" skill). Burning is fixed to the CELL, not the gem: it
   * never moves with gravity, unlike `locked` which travels with the gem.
   */
  burning: Map<string, number> = new Map();
  /**
   * Cells ("row,col" keys) holding an "enhanced" gem (+50% power). Assigned
   * only at spawn time (gravity refill); travels with the gem like `locked`.
   */
  enhanced: Set<string> = new Set();
  /**
   * Cells ("row,col" keys) holding a bomb gem (the gem keeps its element in
   * the grid; exploding clears the surrounding 3x3 area). Travels with the
   * gem like `locked`.
   */
  bombs: Set<string> = new Set();

  constructor(cols: number = BOARD_COLS, rows: number = BOARD_ROWS) {
    this.cols = cols;
    this.rows = rows;
    this.grid = [];
    for (let r = 0; r < rows; r++) {
      const row: number[] = [];
      for (let c = 0; c < cols; c++) {
        row.push(EMPTY);
      }
      this.grid.push(row);
    }
  }

  inBounds(row: number, col: number): boolean {
    return row >= 0 && row < this.rows && col >= 0 && col < this.cols;
  }

  get(row: number, col: number): number {
    return this.grid[row][col];
  }

  set(row: number, col: number, value: number): void {
    this.grid[row][col] = value;
  }

  isAdjacent(a: Vec2, b: Vec2): boolean {
    const dr = Math.abs(a.row - b.row);
    const dc = Math.abs(a.col - b.col);
    return (dr === 1 && dc === 0) || (dr === 0 && dc === 1);
  }

  /** True if b is one of a's 8 surrounding cells (orthogonal or diagonal). */
  isNeighbor8(a: Vec2, b: Vec2): boolean {
    const dr = Math.abs(a.row - b.row);
    const dc = Math.abs(a.col - b.col);
    return dr <= 1 && dc <= 1 && dr + dc > 0;
  }

  swap(a: Vec2, b: Vec2): void {
    const tmp = this.grid[a.row][a.col];
    this.grid[a.row][a.col] = this.grid[b.row][b.col];
    this.grid[b.row][b.col] = tmp;
  }

  isLocked(row: number, col: number): boolean {
    return this.locked.has(`${row},${col}`);
  }

  isEnhanced(row: number, col: number): boolean {
    return this.enhanced.has(`${row},${col}`);
  }

  isBomb(row: number, col: number): boolean {
    return this.bombs.has(`${row},${col}`);
  }

  /**
   * Changes every gem of type `from` to `to` (e.g. a "convert" active skill).
   * Locked cells still convert and remain locked — this never touches the
   * `locked` set. Returns the cells that changed.
   */
  convertGems(from: number, to: number): Vec2[] {
    const changed: Vec2[] = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.grid[r][c] === from) {
          this.grid[r][c] = to;
          changed.push({ row: r, col: c });
        }
      }
    }
    return changed;
  }

  /**
   * Converts up to `count` random gems of type `from` to `to` (e.g. an enemy
   * "convertGems" skill). Unlike convertGems() above, this only touches a
   * random subset, not every matching cell. Returns the cells that changed.
   */
  convertRandomGems(from: number, to: number, count: number, rng: () => number = Math.random): Vec2[] {
    const candidates: Vec2[] = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.grid[r][c] === from) candidates.push({ row: r, col: c });
      }
    }
    const changed: Vec2[] = [];
    for (let i = 0; i < count && candidates.length > 0; i++) {
      const index = Math.floor(rng() * candidates.length);
      const cell = candidates.splice(index, 1)[0];
      this.grid[cell.row][cell.col] = to;
      changed.push(cell);
    }
    return changed;
  }

  /**
   * Locks up to `count` random non-empty, currently unlocked cells (enemy
   * lock skill). Returns the cells that were locked.
   */
  lockRandomCells(count: number, rng: () => number = Math.random): Vec2[] {
    const candidates: Vec2[] = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.grid[r][c] !== EMPTY && this.grid[r][c] !== STONE && !this.isLocked(r, c)) {
          candidates.push({ row: r, col: c });
        }
      }
    }
    const picked: Vec2[] = [];
    for (let i = 0; i < count && candidates.length > 0; i++) {
      const index = Math.floor(rng() * candidates.length);
      const cell = candidates.splice(index, 1)[0];
      this.locked.add(`${cell.row},${cell.col}`);
      picked.push(cell);
    }
    return picked;
  }

  /** Unlocks every currently locked cell (e.g. a player "cleanse" skill). Returns the cells unlocked. */
  clearAllLocks(): Vec2[] {
    const cells = [...this.locked].map((key) => {
      const [row, col] = key.split(',').map(Number);
      return { row, col };
    });
    this.locked.clear();
    return cells;
  }

  /**
   * Petrifies up to `count` random non-empty, non-stone cells (enemy
   * "petrify" skill): the gem standing there is destroyed and the cell
   * becomes a fixed STONE that blocks gravity until shattered. Any lock or
   * burning state on the cell is cleared. Returns the cells petrified.
   */
  petrifyRandomCells(count: number, rng: () => number = Math.random): Vec2[] {
    const candidates: Vec2[] = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.grid[r][c] !== EMPTY && this.grid[r][c] !== STONE) candidates.push({ row: r, col: c });
      }
    }
    const picked: Vec2[] = [];
    for (let i = 0; i < count && candidates.length > 0; i++) {
      const index = Math.floor(rng() * candidates.length);
      const cell = candidates.splice(index, 1)[0];
      const key = `${cell.row},${cell.col}`;
      this.grid[cell.row][cell.col] = STONE;
      this.locked.delete(key);
      this.burning.delete(key);
      this.enhanced.delete(key);
      this.bombs.delete(key);
      picked.push(cell);
    }
    return picked;
  }

  isPetrified(row: number, col: number): boolean {
    return this.grid[row][col] === STONE;
  }

  /**
   * Shatters any stone orthogonally adjacent to a cleared cell (called right
   * after clearCells() with the same matched-cell set). Shattered stones
   * become EMPTY so the next gravity pass refills them like any other empty
   * cell. Returns the cells that shattered.
   */
  destroyAdjacentStones(clearedCells: Set<string>): Vec2[] {
    const toDestroy = new Set<string>();
    for (const key of clearedCells) {
      const [r, c] = key.split(',').map(Number);
      const neighbors: Vec2[] = [
        { row: r - 1, col: c },
        { row: r + 1, col: c },
        { row: r, col: c - 1 },
        { row: r, col: c + 1 },
      ];
      for (const n of neighbors) {
        if (this.inBounds(n.row, n.col) && this.grid[n.row][n.col] === STONE) {
          toDestroy.add(`${n.row},${n.col}`);
        }
      }
    }
    const destroyed: Vec2[] = [];
    for (const key of toDestroy) {
      const [r, c] = key.split(',').map(Number);
      this.grid[r][c] = EMPTY;
      destroyed.push({ row: r, col: c });
    }
    return destroyed;
  }

  /**
   * Ignites up to `count` random cells holding a normal gem (not stone or
   * empty) for `durationTurns` (enemy "ignite" skill). Re-igniting an
   * already-burning cell refreshes its timer rather than stacking. Returns
   * the cells ignited.
   */
  igniteRandomCells(count: number, durationTurns: number, rng: () => number = Math.random): Vec2[] {
    const candidates: Vec2[] = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.grid[r][c] !== EMPTY && this.grid[r][c] !== STONE) candidates.push({ row: r, col: c });
      }
    }
    const picked: Vec2[] = [];
    for (let i = 0; i < count && candidates.length > 0; i++) {
      const index = Math.floor(rng() * candidates.length);
      const cell = candidates.splice(index, 1)[0];
      this.burning.set(`${cell.row},${cell.col}`, durationTurns);
      picked.push(cell);
    }
    return picked;
  }

  isBurning(row: number, col: number): boolean {
    return this.burning.has(`${row},${col}`);
  }

  /**
   * Decrements every burning cell's timer by one turn, removing any that
   * expire. Returns the number of cells that were burning BEFORE the tick
   * (the caller multiplies this by BURN_DAMAGE_PER_CELL for player damage).
   */
  tickBurning(): number {
    const burningBefore = this.burning.size;
    for (const [key, turnsLeft] of this.burning) {
      const remaining = turnsLeft - 1;
      if (remaining <= 0) {
        this.burning.delete(key);
      } else {
        this.burning.set(key, remaining);
      }
    }
    return burningBefore;
  }

  /** Extinguishes every currently burning cell (e.g. a player "cleanse" skill). Returns the cells extinguished. */
  extinguishAllBurning(): Vec2[] {
    const cells = [...this.burning.keys()].map((key) => {
      const [row, col] = key.split(',').map(Number);
      return { row, col };
    });
    this.burning.clear();
    return cells;
  }

  /**
   * Fills the whole board with random gems that contain no pre-existing
   * matches. `gemTypes` restricts which gem types can spawn (e.g. a level
   * rule that removes Water/Light); omit or pass an empty array for the
   * full default palette (every type 0..GEM_TYPE_COUNT-1).
   */
  fillRandomNoMatches(rng: () => number = Math.random, gemTypes?: number[]): void {
    this.locked.clear();
    this.burning.clear();
    this.enhanced.clear();
    this.bombs.clear();
    const palette = this.resolvePalette(gemTypes);
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        let type: number;
        do {
          type = palette[Math.floor(rng() * palette.length)];
        } while (this.wouldMatchAt(r, c, type));
        this.grid[r][c] = type;
      }
    }
  }

  /** Resolves an optional gem-type palette to a concrete array (default: every gem type). */
  private resolvePalette(gemTypes?: number[]): number[] {
    if (gemTypes && gemTypes.length > 0) return gemTypes;
    const all: number[] = [];
    for (let i = 0; i < GEM_TYPE_COUNT; i++) all.push(i);
    return all;
  }

  private wouldMatchAt(row: number, col: number, type: number): boolean {
    // Check two cells to the left.
    if (
      col >= 2 &&
      this.grid[row][col - 1] === type &&
      this.grid[row][col - 2] === type
    ) {
      return true;
    }
    // Check two cells above.
    if (
      row >= 2 &&
      this.grid[row - 1][col] === type &&
      this.grid[row - 2][col] === type
    ) {
      return true;
    }
    return false;
  }

  /**
   * Finds every cell that participates in a run of 3+ same-type gems,
   * horizontally or vertically. Returns a Set of "row,col" keys.
   */
  findMatches(): Set<string> {
    const matched = new Set<string>();

    // Horizontal runs. Stones (like empty cells) never form or extend a run —
    // two adjacent stones share the same grid value but must never "match".
    for (let r = 0; r < this.rows; r++) {
      let runStart = 0;
      for (let c = 1; c <= this.cols; c++) {
        const prev = this.grid[r][c - 1];
        const cur = c < this.cols ? this.grid[r][c] : EMPTY;
        if (cur !== prev || prev === EMPTY || prev === STONE) {
          const runLength = c - runStart;
          if (runLength >= 3 && prev !== EMPTY && prev !== STONE) {
            for (let k = runStart; k < c; k++) matched.add(`${r},${k}`);
          }
          runStart = c;
        }
      }
    }

    // Vertical runs.
    for (let c = 0; c < this.cols; c++) {
      let runStart = 0;
      for (let r = 1; r <= this.rows; r++) {
        const prev = this.grid[r - 1][c];
        const cur = r < this.rows ? this.grid[r][c] : EMPTY;
        if (cur !== prev || prev === EMPTY || prev === STONE) {
          const runLength = r - runStart;
          if (runLength >= 3 && prev !== EMPTY && prev !== STONE) {
            for (let k = runStart; k < r; k++) matched.add(`${k},${c}`);
          }
          runStart = r;
        }
      }
    }

    return matched;
  }

  /**
   * Groups a matched-cell set (from findMatches) into connected components of
   * the same gem type. Two matched runs of different colors that happen to
   * sit next to each other stay in separate groups; a horizontal run and a
   * vertical run of the same color sharing a cell merge into one group
   * (e.g. a plus/L shape). Must be called before clearCells() clears the grid.
   * Each group also reports its member `cells` (e.g. for UI to compute a
   * centroid for floating damage text) and `enhancedCount` (how many of its
   * gems are "enhanced", for the +50%-power damage/heal bonus) — both purely
   * additive, don't change the element/size grouping logic itself.
   */
  groupMatches(matched: Set<string>): { element: number; size: number; cells: Vec2[]; enhancedCount: number }[] {
    const visited = new Set<string>();
    const groups: { element: number; size: number; cells: Vec2[]; enhancedCount: number }[] = [];

    for (const key of matched) {
      if (visited.has(key)) continue;
      const [startRow, startCol] = key.split(',').map(Number);
      const type = this.grid[startRow][startCol];

      const cells: Vec2[] = [];
      const stack: Vec2[] = [{ row: startRow, col: startCol }];
      visited.add(key);

      while (stack.length > 0) {
        const cell = stack.pop()!;
        const { row, col } = cell;
        cells.push(cell);
        const neighbors: Vec2[] = [
          { row: row - 1, col },
          { row: row + 1, col },
          { row, col: col - 1 },
          { row, col: col + 1 },
        ];
        for (const n of neighbors) {
          const nKey = `${n.row},${n.col}`;
          if (
            matched.has(nKey) &&
            !visited.has(nKey) &&
            this.inBounds(n.row, n.col) &&
            this.grid[n.row][n.col] === type
          ) {
            visited.add(nKey);
            stack.push(n);
          }
        }
      }

      const enhancedCount = cells.reduce(
        (count, cell) => count + (this.enhanced.has(`${cell.row},${cell.col}`) ? 1 : 0),
        0,
      );
      groups.push({ element: type, size: cells.length, cells, enhancedCount });
    }

    return groups;
  }

  /**
   * Clears matched cells (sets EMPTY). Clearing a locked cell removes its
   * lock; clearing a burning cell puts the fire out early; clearing an
   * enhanced or bomb cell removes those flags too.
   */
  clearCells(cells: Set<string>): void {
    for (const key of cells) {
      const [r, c] = key.split(',').map(Number);
      this.grid[r][c] = EMPTY;
      this.locked.delete(key);
      this.burning.delete(key);
      this.enhanced.delete(key);
      this.bombs.delete(key);
    }
  }

  /**
   * Applies gravity: gems fall down to fill empty cells within each column,
   * then new random gems spawn at the top (each with `enhanceChance` odds of
   * spawning "enhanced"). Stones are gravity barriers — each column is split
   * into independent segments between stones (and the column's top/bottom
   * edges), so nothing falls through a stone and empty cells below one
   * refill in place rather than pulling gems down from above it. Returns the
   * list of moves made (for animating falling gems) and newly spawned cells.
   */
  applyGravityAndRefill(
    rng: () => number = Math.random,
    { enhanceChance = ENHANCED_SPAWN_CHANCE, gemTypes }: { enhanceChance?: number; gemTypes?: number[] } = {},
  ): {
    moves: { from: Vec2; to: Vec2 }[];
    spawns: Vec2[];
  } {
    const moves: { from: Vec2; to: Vec2 }[] = [];
    const spawns: Vec2[] = [];
    const palette = this.resolvePalette(gemTypes);

    for (let c = 0; c < this.cols; c++) {
      let segStart = 0;
      for (let r = 0; r <= this.rows; r++) {
        const isBoundary = r === this.rows || this.grid[r][c] === STONE;
        if (isBoundary) {
          this.applyGravityToSegment(c, segStart, r - 1, moves, spawns, rng, enhanceChance, palette);
          segStart = r + 1;
        }
      }
    }

    return { moves, spawns };
  }

  /** Gravity for a single column segment (rows `top`..`bottom` inclusive, no stones inside). */
  private applyGravityToSegment(
    col: number,
    top: number,
    bottom: number,
    moves: { from: Vec2; to: Vec2 }[],
    spawns: Vec2[],
    rng: () => number,
    enhanceChance: number,
    palette: number[],
  ): void {
    if (bottom < top) return; // zero-length segment (e.g. two adjacent stones)

    let writeRow = bottom;
    for (let r = bottom; r >= top; r--) {
      if (this.grid[r][col] !== EMPTY) {
        if (r !== writeRow) {
          this.grid[writeRow][col] = this.grid[r][col];
          this.grid[r][col] = EMPTY;
          const fromKey = `${r},${col}`;
          const toKey = `${writeRow},${col}`;
          // Locked/enhanced/bomb travel with the falling gem; burning stays on the cell.
          if (this.locked.delete(fromKey)) this.locked.add(toKey);
          if (this.enhanced.delete(fromKey)) this.enhanced.add(toKey);
          if (this.bombs.delete(fromKey)) this.bombs.add(toKey);
          moves.push({ from: { row: r, col }, to: { row: writeRow, col } });
        }
        writeRow--;
      }
    }
    for (let r = writeRow; r >= top; r--) {
      this.grid[r][col] = palette[Math.floor(rng() * palette.length)];
      if (rng() < enhanceChance) {
        this.enhanced.add(`${r},${col}`);
      }
      spawns.push({ row: r, col });
    }
  }

  /**
   * When a single matched group of size >= 5 clears, the cell nearest the
   * group's centroid becomes a bomb instead of being cleared (the gem stays,
   * its element unchanged in the grid). Call this BEFORE clearCells() so the
   * caller can exclude the kept cells from whatever it clears. A cell that's
   * already been cleared by something else this wave (e.g. a bomb blast) is
   * skipped rather than resurrected. Returns the cells kept as bombs.
   */
  spawnBombsForGroups(groups: { size: number; cells: Vec2[] }[]): Vec2[] {
    const kept: Vec2[] = [];
    for (const group of groups) {
      if (group.size < 5 || group.cells.length === 0) continue;

      let sumRow = 0;
      let sumCol = 0;
      for (const cell of group.cells) {
        sumRow += cell.row;
        sumCol += cell.col;
      }
      const centroidRow = sumRow / group.cells.length;
      const centroidCol = sumCol / group.cells.length;

      let best: Vec2 | null = null;
      let bestDistSq = Infinity;
      for (const cell of group.cells) {
        const dr = cell.row - centroidRow;
        const dc = cell.col - centroidCol;
        const distSq = dr * dr + dc * dc;
        if (distSq < bestDistSq) {
          bestDistSq = distSq;
          best = cell;
        }
      }

      if (best && this.grid[best.row][best.col] !== EMPTY) {
        this.bombs.add(`${best.row},${best.col}`);
        kept.push(best);
      }
    }
    return kept;
  }

  /**
   * Resolves bomb explosions for the current matched-cell set: any bomb gem
   * that's part of `matchedCells` detonates, clearing the 3x3 area around it
   * (bombs caught inside another bomb's blast chain-explode via BFS). Blasts
   * also remove locks, extinguish burning, and shatter petrified stones in
   * range (both are cleared to EMPTY; `destroyedStones` reports the subset
   * that were stones, for the caller's shatter VFX). `firstBombElement` is
   * the element of the first bomb that triggered (the caller uses it to
   * build one extra "explosion" damage group), or null if no bomb was
   * involved.
   */
  explodeBombs(matchedCells: Set<string>): {
    blastCells: Set<string>;
    destroyedStones: Vec2[];
    firstBombElement: number | null;
  } {
    const queue: Vec2[] = [];
    const queued = new Set<string>();
    let firstBombElement: number | null = null;

    for (const key of matchedCells) {
      if (this.bombs.has(key)) {
        const [row, col] = key.split(',').map(Number);
        if (firstBombElement === null) firstBombElement = this.grid[row][col];
        queue.push({ row, col });
        queued.add(key);
      }
    }

    const blastCells = new Set<string>();
    const destroyedStoneKeys = new Set<string>();

    while (queue.length > 0) {
      const bomb = queue.shift()!;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const row = bomb.row + dr;
          const col = bomb.col + dc;
          if (!this.inBounds(row, col)) continue;
          const key = `${row},${col}`;
          blastCells.add(key);

          if (this.grid[row][col] === STONE) {
            destroyedStoneKeys.add(key);
          } else if (this.bombs.has(key) && !queued.has(key)) {
            queued.add(key);
            queue.push({ row, col });
          }
        }
      }
    }

    for (const key of blastCells) {
      const [row, col] = key.split(',').map(Number);
      this.grid[row][col] = EMPTY;
      this.locked.delete(key);
      this.burning.delete(key);
      this.enhanced.delete(key);
      this.bombs.delete(key);
    }

    const destroyedStones: Vec2[] = [...destroyedStoneKeys].map((key) => {
      const [row, col] = key.split(',').map(Number);
      return { row, col };
    });

    return { blastCells, destroyedStones, firstBombElement };
  }
}
