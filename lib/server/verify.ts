import { Action, LogEntry, ReplayResult, replay } from '../engine';

const VALID_ACTIONS = new Set<string>(['L', 'R', 'SOFT', 'HARD', 'CW', 'CCW']);

export interface VerificationResult {
  valid: boolean;
  error?: string;
  result?: ReplayResult;
}

export function verifyInputLog(
  log: unknown,
  seed: number,
  startedAtMs: number,
  submittedAtMs: number,
  maxPieces = 100,
  clientDurationMs?: number
): VerificationResult {
  if (!Array.isArray(log)) {
    return { valid: false, error: 'Input log must be an array' };
  }

  const typedLog: LogEntry[] = [];
  const actionCountByTick = new Map<number, number>();

  let previousTick = 0;
  for (let i = 0; i < log.length; i++) {
    const item = log[i];
    if (!Array.isArray(item) || item.length !== 2) {
      return { valid: false, error: `Invalid entry format at index ${i}` };
    }

    const [tick, action] = item;
    if (typeof tick !== 'number' || tick < 0 || !Number.isInteger(tick)) {
      return { valid: false, error: `Invalid tick value at index ${i}: ${tick}` };
    }

    if (tick < previousTick) {
      return { valid: false, error: `Non-monotonic tick progression at index ${i}: ${tick} < ${previousTick}` };
    }
    previousTick = tick;

    if (typeof action !== 'string' || !VALID_ACTIONS.has(action)) {
      return { valid: false, error: `Unknown action '${action}' at index ${i}` };
    }

    const count = (actionCountByTick.get(tick) || 0) + 1;
    if (count > 10) {
      return { valid: false, error: `Action rate limit exceeded: >10 actions at tick ${tick}` };
    }
    actionCountByTick.set(tick, count);

    typedLog.push([tick, action as Action]);
  }

  // Replay using pure deterministic engine
  const result = replay(seed, typedLog, maxPieces);

  // Anti-cheat timing sanity check:
  // Wall-clock time between start and submit.
  // Allow for network latency on start session, high-refresh displays, and fast hard-dropping human players.
  const wallElapsedMs = Math.max(0, submittedAtMs - startedAtMs);
  let effectiveElapsedMs = wallElapsedMs;

  if (typeof clientDurationMs === 'number' && clientDurationMs > 0) {
    // Allow up to 15s latency window for slow mobile networks during start session
    const cappedClient = Math.min(clientDurationMs, wallElapsedMs + 15000);
    effectiveElapsedMs = Math.max(wallElapsedMs, cappedClient);
  }

  const gameDurationMs = (result.ticks / 60) * 1000;
  // Realistic minimum allowed: 60% of engine time with 3s latency margin
  const minimumAllowedMs = Math.max(1000, gameDurationMs * 0.6 - 3000);

  // Allow a grace margin for short tests / immediate early top-outs (< 3 seconds)
  if (result.ticks > 180 && effectiveElapsedMs < minimumAllowedMs) {
    return {
      valid: false,
      error: `Submission too fast: elapsed ${Math.round(effectiveElapsedMs)}ms, required >= ${Math.round(minimumAllowedMs)}ms (simulated ${Math.round(gameDurationMs)}ms)`,
    };
  }

  return {
    valid: true,
    result,
  };
}
