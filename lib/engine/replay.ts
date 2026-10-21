import { Action, LogEntry, ReplayResult } from './types';
import { applyAction, createInitialState, stepTick } from './game';

/**
 * Replays an input log deterministically given a random seed.
 * Within each tick:
 *   1. All logged actions for that tick apply in log order.
 *   2. The engine advances by one tick (lock delay or gravity).
 * Execution terminates when the game ends (100 pieces locked or top out)
 * or when all logged actions and natural ticks finish.
 */
export function replay(
  seed: number,
  log: LogEntry[],
  maxPieces = 100
): ReplayResult {
  const state = createInitialState(seed, maxPieces);

  // Group actions by tick for fast lookup
  const actionsByTick = new Map<number, Action[]>();
  let maxTickInLog = 0;

  for (const [tick, action] of log) {
    if (!actionsByTick.has(tick)) {
      actionsByTick.set(tick, []);
    }
    actionsByTick.get(tick)!.push(action);
    if (tick > maxTickInLog) {
      maxTickInLog = tick;
    }
  }

  // Step tick-by-tick
  while (!state.stats.isGameOver && state.stats.ticks <= maxTickInLog + 60) {
    const currentTick = state.stats.ticks;

    // 1. Actions apply in log order before gravity/lock tick
    const actions = actionsByTick.get(currentTick);
    if (actions) {
      for (const action of actions) {
        if (state.stats.isGameOver) break;
        applyAction(state, action);
      }
    }

    if (state.stats.isGameOver) break;

    // 2. Step tick (gravity or lock delay timer)
    stepTick(state);
  }

  return {
    score: state.stats.score,
    lines: state.stats.lines,
    epochs: state.stats.epochs,
    pieces: state.stats.piecesLocked,
    ticks: state.stats.ticks,
  };
}
