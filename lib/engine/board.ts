import { PieceType } from './types';
import { PIECE_SHAPES } from './pieces';

export const BOARD_WIDTH = 10;
export const BOARD_TOTAL_HEIGHT = 22; // 2 hidden + 20 visible
export const BOARD_VISIBLE_HEIGHT = 20;
export const HIDDEN_ROWS = 2;

export type Grid = (PieceType | null)[][];

/**
 * Creates an empty 10x22 grid filled with null.
 */
export function createEmptyGrid(): Grid {
  const grid: Grid = [];
  for (let y = 0; y < BOARD_TOTAL_HEIGHT; y++) {
    grid.push(new Array(BOARD_WIDTH).fill(null));
  }
  return grid;
}

/**
 * Checks if a piece in given rotation and (x, y) coordinates can fit on the grid
 * without colliding with existing locked blocks or going out of bounds.
 */
export function canPlace(
  grid: Grid,
  type: PieceType,
  rotation: number,
  x: number,
  y: number
): boolean {
  const shape = PIECE_SHAPES[type][rotation];
  for (const pt of shape) {
    const px = x + pt.x;
    const py = y + pt.y;

    if (px < 0 || px >= BOARD_WIDTH || py < 0 || py >= BOARD_TOTAL_HEIGHT) {
      return false;
    }
    if (grid[py][px] !== null) {
      return false;
    }
  }
  return true;
}

/**
 * Locks a piece into the grid.
 */
export function lockPiece(
  grid: Grid,
  type: PieceType,
  rotation: number,
  x: number,
  y: number
): Grid {
  const newGrid: Grid = grid.map((row) => [...row]);
  const shape = PIECE_SHAPES[type][rotation];
  for (const pt of shape) {
    const px = x + pt.x;
    const py = y + pt.y;
    if (py >= 0 && py < BOARD_TOTAL_HEIGHT && px >= 0 && px < BOARD_WIDTH) {
      newGrid[py][px] = type;
    }
  }
  return newGrid;
}

/**
 * Checks for filled rows, clears them, shifts upper rows down,
 * and adds new empty rows at the top.
 */
export function clearLines(grid: Grid): {
  newGrid: Grid;
  linesCleared: number;
  isEpoch: boolean;
} {
  const remainingRows: (PieceType | null)[][] = [];
  let linesCleared = 0;

  for (let y = 0; y < BOARD_TOTAL_HEIGHT; y++) {
    const isFull = grid[y].every((cell) => cell !== null);
    if (isFull) {
      linesCleared++;
    } else {
      remainingRows.push([...grid[y]]);
    }
  }

  // Prepend empty rows at top for each cleared line
  const newGrid: Grid = [];
  for (let i = 0; i < linesCleared; i++) {
    newGrid.push(new Array(BOARD_WIDTH).fill(null));
  }
  newGrid.push(...remainingRows);

  return {
    newGrid,
    linesCleared,
    isEpoch: linesCleared === 4,
  };
}

/**
 * Computes the ghost piece position (lowest valid Y before collision).
 */
export function getGhostY(
  grid: Grid,
  type: PieceType,
  rotation: number,
  x: number,
  currentY: number
): number {
  let y = currentY;
  while (canPlace(grid, type, rotation, x, y + 1)) {
    y++;
  }
  return y;
}
