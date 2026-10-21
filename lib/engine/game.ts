import { Action, ActivePiece, GameStats, PieceType } from './types';
import { Seeded7Bag } from './prng';
import {
  canPlace,
  clearLines,
  createEmptyGrid,
  getGhostY,
  Grid,
  lockPiece,
} from './board';
import { ROTATION_KICKS, SPAWN_POSITION } from './pieces';

export const LOCK_DELAY_TICKS = 30;
export const MAX_LOCK_RESETS = 15;
export const MAX_PIECES_DEFAULT = 100;

export interface GameEngineState {
  grid: Grid;
  currentPiece: ActivePiece | null;
  nextQueue: PieceType[];
  bag: Seeded7Bag;
  stats: GameStats;
  gravityTimer: number;
  lockTimer: number;
  lockResets: number;
  isOnGround: boolean;
  maxPieces: number;
}

export function getGravityInterval(level: number): number {
  return Math.max(4, 40 - 4 * level);
}

export function createInitialState(
  seed: number,
  maxPieces = MAX_PIECES_DEFAULT
): GameEngineState {
  const bag = new Seeded7Bag(seed);
  const nextQueue: PieceType[] = [];
  while (nextQueue.length < 5) {
    nextQueue.push(bag.nextPiece());
  }

  const state: GameEngineState = {
    grid: createEmptyGrid(),
    currentPiece: null,
    nextQueue,
    bag,
    stats: {
      score: 0,
      lines: 0,
      level: 0,
      epochs: 0,
      piecesLocked: 0,
      ticks: 0,
      isGameOver: false,
    },
    gravityTimer: 0,
    lockTimer: 0,
    lockResets: 0,
    isOnGround: false,
    maxPieces,
  };

  spawnNextPiece(state);
  return state;
}

export function spawnNextPiece(state: GameEngineState): void {
  if (state.stats.piecesLocked >= state.maxPieces) {
    state.stats.isGameOver = true;
    state.currentPiece = null;
    return;
  }

  const nextType = state.nextQueue.shift()!;
  state.nextQueue.push(state.bag.nextPiece());

  const spawn = SPAWN_POSITION[nextType];
  const newPiece: ActivePiece = {
    type: nextType,
    rotation: 0,
    x: spawn.x,
    y: spawn.y,
  };

  if (!canPlace(state.grid, newPiece.type, newPiece.rotation, newPiece.x, newPiece.y)) {
    // Top out: cannot spawn
    state.stats.isGameOver = true;
    state.currentPiece = null;
    return;
  }

  state.currentPiece = newPiece;
  state.gravityTimer = 0;
  state.lockTimer = 0;
  state.lockResets = 0;
  state.isOnGround = !canPlace(
    state.grid,
    newPiece.type,
    newPiece.rotation,
    newPiece.x,
    newPiece.y + 1
  );
}

/**
 * Executes a single user action (L, R, SOFT, HARD, CW, CCW) on the active piece.
 */
export function applyAction(state: GameEngineState, action: Action): void {
  if (state.stats.isGameOver || !state.currentPiece) return;

  const piece = state.currentPiece;
  let moved = false;

  switch (action) {
    case 'L': {
      if (canPlace(state.grid, piece.type, piece.rotation, piece.x - 1, piece.y)) {
        piece.x -= 1;
        moved = true;
      }
      break;
    }
    case 'R': {
      if (canPlace(state.grid, piece.type, piece.rotation, piece.x + 1, piece.y)) {
        piece.x += 1;
        moved = true;
      }
      break;
    }
    case 'SOFT': {
      if (canPlace(state.grid, piece.type, piece.rotation, piece.x, piece.y + 1)) {
        piece.y += 1;
        state.stats.score += 1; // Soft drop: 1 pt per row
        state.gravityTimer = 0;
        moved = true;
      }
      break;
    }
    case 'HARD': {
      const dropY = getGhostY(state.grid, piece.type, piece.rotation, piece.x, piece.y);
      const rowsDropped = dropY - piece.y;
      piece.y = dropY;
      state.stats.score += rowsDropped * 2; // Hard drop: 2 pts per row
      // Hard drop locks immediately
      lockCurrentPiece(state);
      return;
    }
    case 'CW': {
      const newRotation = (piece.rotation + 1) % 4;
      for (const kick of ROTATION_KICKS) {
        if (canPlace(state.grid, piece.type, newRotation, piece.x + kick, piece.y)) {
          piece.rotation = newRotation;
          piece.x += kick;
          moved = true;
          break;
        }
      }
      break;
    }
    case 'CCW': {
      const newRotation = (piece.rotation + 3) % 4;
      for (const kick of ROTATION_KICKS) {
        if (canPlace(state.grid, piece.type, newRotation, piece.x + kick, piece.y)) {
          piece.rotation = newRotation;
          piece.x += kick;
          moved = true;
          break;
        }
      }
      break;
    }
  }

  // Update onGround status
  const onGround = !canPlace(
    state.grid,
    piece.type,
    piece.rotation,
    piece.x,
    piece.y + 1
  );

  if (moved && onGround && state.lockResets < MAX_LOCK_RESETS) {
    state.lockTimer = 0;
    state.lockResets += 1;
  }
  state.isOnGround = onGround;
}

/**
 * Locks the current piece into the grid, scores line clears, and spawns the next piece.
 */
export function lockCurrentPiece(state: GameEngineState): void {
  if (!state.currentPiece) return;

  const piece = state.currentPiece;
  state.grid = lockPiece(
    state.grid,
    piece.type,
    piece.rotation,
    piece.x,
    piece.y
  );
  state.stats.piecesLocked += 1;

  // Clear lines & update score
  const { newGrid, linesCleared, isEpoch } = clearLines(state.grid);
  state.grid = newGrid;

  if (linesCleared > 0) {
    state.stats.lines += linesCleared;
    state.stats.level = Math.floor(state.stats.lines / 10);
    if (isEpoch) {
      state.stats.epochs += 1;
    }
    const scoreMultipliers = [0, 100, 300, 500, 800];
    const baseScore = scoreMultipliers[linesCleared] ?? 800;
    state.stats.score += baseScore * (state.stats.level + 1);
  }

  // Spawn next piece
  spawnNextPiece(state);
}

/**
 * Advances the game simulation by 1 tick (1/60th second).
 */
export function stepTick(state: GameEngineState): void {
  if (state.stats.isGameOver || !state.currentPiece) return;

  state.stats.ticks += 1;
  const piece = state.currentPiece;

  const onGround = !canPlace(
    state.grid,
    piece.type,
    piece.rotation,
    piece.x,
    piece.y + 1
  );
  state.isOnGround = onGround;

  if (onGround) {
    state.lockTimer += 1;
    if (state.lockTimer >= LOCK_DELAY_TICKS) {
      lockCurrentPiece(state);
      return;
    }
  } else {
    // In the air: apply gravity
    state.gravityTimer += 1;
    const interval = getGravityInterval(state.stats.level);
    if (state.gravityTimer >= interval) {
      state.gravityTimer = 0;
      if (canPlace(state.grid, piece.type, piece.rotation, piece.x, piece.y + 1)) {
        piece.y += 1;
      }
    }
  }
}
