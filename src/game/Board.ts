import { BOARD_COLS, BOARD_ROWS, EMPTY, GEM_TYPE_COUNT } from './constants';

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
   * Locks up to `count` random non-empty, currently unlocked cells (enemy
   * lock skill). Returns the cells that were locked.
   */
  lockRandomCells(count: number, rng: () => number = Math.random): Vec2[] {
    const candidates: Vec2[] = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.grid[r][c] !== EMPTY && !this.isLocked(r, c)) {
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

  /** Fills the whole board with random gems that contain no pre-existing matches. */
  fillRandomNoMatches(rng: () => number = Math.random): void {
    this.locked.clear();
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        let type: number;
        do {
          type = Math.floor(rng() * GEM_TYPE_COUNT);
        } while (this.wouldMatchAt(r, c, type));
        this.grid[r][c] = type;
      }
    }
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

    // Horizontal runs.
    for (let r = 0; r < this.rows; r++) {
      let runStart = 0;
      for (let c = 1; c <= this.cols; c++) {
        const prev = this.grid[r][c - 1];
        const cur = c < this.cols ? this.grid[r][c] : EMPTY;
        if (cur !== prev || prev === EMPTY) {
          const runLength = c - runStart;
          if (runLength >= 3 && prev !== EMPTY) {
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
        if (cur !== prev || prev === EMPTY) {
          const runLength = r - runStart;
          if (runLength >= 3 && prev !== EMPTY) {
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
   * centroid for floating damage text) — purely additive, doesn't change the
   * element/size grouping logic or any damage math that consumes it.
   */
  groupMatches(matched: Set<string>): { element: number; size: number; cells: Vec2[] }[] {
    const visited = new Set<string>();
    const groups: { element: number; size: number; cells: Vec2[] }[] = [];

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

      groups.push({ element: type, size: cells.length, cells });
    }

    return groups;
  }

  /** Clears matched cells (sets EMPTY). Clearing a locked cell removes its lock. */
  clearCells(cells: Set<string>): void {
    for (const key of cells) {
      const [r, c] = key.split(',').map(Number);
      this.grid[r][c] = EMPTY;
      this.locked.delete(key);
    }
  }

  /**
   * Applies gravity: gems fall down to fill empty cells within each column,
   * then new random gems spawn at the top. Returns the list of moves made
   * (for animating falling gems) and newly spawned cells.
   */
  applyGravityAndRefill(rng: () => number = Math.random): {
    moves: { from: Vec2; to: Vec2 }[];
    spawns: Vec2[];
  } {
    const moves: { from: Vec2; to: Vec2 }[] = [];
    const spawns: Vec2[] = [];

    for (let c = 0; c < this.cols; c++) {
      let writeRow = this.rows - 1;
      for (let r = this.rows - 1; r >= 0; r--) {
        if (this.grid[r][c] !== EMPTY) {
          if (r !== writeRow) {
            this.grid[writeRow][c] = this.grid[r][c];
            this.grid[r][c] = EMPTY;
            // The lock travels with the falling gem.
            if (this.locked.delete(`${r},${c}`)) {
              this.locked.add(`${writeRow},${c}`);
            }
            moves.push({ from: { row: r, col: c }, to: { row: writeRow, col: c } });
          }
          writeRow--;
        }
      }
      for (let r = writeRow; r >= 0; r--) {
        this.grid[r][c] = Math.floor(rng() * GEM_TYPE_COUNT);
        spawns.push({ row: r, col: c });
      }
    }

    return { moves, spawns };
  }
}
