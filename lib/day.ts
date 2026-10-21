import { getDailySeed, setDailySeed } from './db';
import { encodeAbiParameters, parseAbiParameters, keccak256, toHex, type Hex } from 'viem';

export const DEFAULT_LAUNCH_DAY = 20736;

export function getLaunchDay(): number {
  if (process.env.LAUNCH_DAY_INDEX) {
    const parsed = parseInt(process.env.LAUNCH_DAY_INDEX, 10);
    if (!isNaN(parsed) && parsed >= 20000) return parsed;
  }
  return DEFAULT_LAUNCH_DAY;
}

export function getCurrentDayNumber(): number {
  if (process.env.DAY_OVERRIDE) {
    const parsed = parseInt(process.env.DAY_OVERRIDE, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  const launchDay = getLaunchDay();
  const todayUtc = Math.floor(Date.now() / 86400000);
  if (todayUtc >= launchDay) {
    return todayUtc - launchDay + 1;
  }
  return 1;
}

export function getNextUtcMidnight(): string {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0));
  return next.toISOString();
}

/**
 * Returns today's public seed for the 100-piece sequence.
 * Uses stored seed from DB or derives and commits a deterministic seed.
 */
export function getSeedForDay(day: number): { day: number; seed: number; salt: string } {
  const existing = getDailySeed(day);
  if (existing) {
    return existing;
  }

  // Deterministic seed for day (e.g. 20261010 for day 1)
  const baseSeed = 20261010;
  const seed = baseSeed + (day - 1);
  const salt = keccak256(toHex(`salt_blockbuilder_day_${day}`));

  setDailySeed(day, seed, salt);
  return { day, seed, salt };
}

/**
 * Calculates the on-chain commit hash for a day: keccak256(abi.encode(day, seed, salt))
 */
export function getCommitmentHash(day: number, seed: number, salt: string): Hex {
  return keccak256(
    encodeAbiParameters(
      parseAbiParameters('uint256, uint256, bytes32'),
      [BigInt(day), BigInt(seed), (salt.startsWith('0x') ? salt : `0x${salt}`) as Hex]
    )
  );
}

