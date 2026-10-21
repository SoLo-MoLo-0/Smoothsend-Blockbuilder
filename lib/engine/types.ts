export type PieceType = 'I' | 'J' | 'L' | 'O' | 'S' | 'T' | 'Z';

export type Action = 'L' | 'R' | 'SOFT' | 'HARD' | 'CW' | 'CCW';

export type LogEntry = [tick: number, action: Action];

export interface Point {
  x: number;
  y: number;
}

export interface ActivePiece {
  type: PieceType;
  rotation: number; // 0, 1, 2, 3
  x: number;
  y: number;
}

export interface EngineConfig {
  boardWidth: number;
  boardHeight: number; // total height including hidden rows
  visibleHeight: number;
  hiddenRows: number;
  maxPieces: number;
  lockDelayTicks: number;
  maxLockResets: number;
}

export interface GameStats {
  score: number;
  lines: number;
  level: number;
  epochs: number;
  piecesLocked: number;
  ticks: number;
  isGameOver: boolean;
}

export interface ReplayResult {
  score: number;
  lines: number;
  epochs: number;
  pieces: number;
  ticks: number;
}
