import { LeaderboardEntry } from './types';

/**
 * Compare two leaderboard entries following the authoritative ranking rule:
 * - Rank by score/value, descending.
 * - Tie-break: earlier submission time wins (ascending submittedAt).
 * - Fallback: alphabetical wallet address comparison to ensure strictly unique order.
 */
export function compareEntries(a: LeaderboardEntry, b: LeaderboardEntry): number {
  if (b.value !== a.value) {
    return b.value - a.value;
  }
  const timeA = new Date(a.submittedAt).getTime();
  const timeB = new Date(b.submittedAt).getTime();
  if (timeA !== timeB) {
    return timeA - timeB;
  }
  return a.wallet.localeCompare(b.wallet);
}

/**
 * Sort entries and assign strictly unique sequential ranks (1, 2, 3...).
 */
export function sortAndAssignRanks(entries: LeaderboardEntry[]): LeaderboardEntry[] {
  const sorted = [...entries].sort(compareEntries);
  return sorted.map((entry, index) => ({
    ...entry,
    rank: index + 1,
  }));
}

/**
 * Format a full wallet address as: 0x + 4 chars + … + 4 chars (e.g. 0x9f3a…c21e).
 */
export function formatAddress(address: string): string {
  if (!address) return '';
  if (address.length <= 12) return address;
  const clean = address.startsWith('0x') ? address : `0x${address}`;
  return `${clean.slice(0, 6)}…${clean.slice(-4)}`;
}

/**
 * Get next UTC 00:00:00 midnight relative to a given Date.
 */
export function getNextUtcMidnight(from: Date = new Date()): Date {
  const next = new Date(from);
  next.setUTCHours(24, 0, 0, 0);
  return next;
}

/**
 * Calculate countdown details to next UTC midnight.
 */
export function getTimeUntilNextUtcMidnight(from: Date = new Date()): {
  totalSeconds: number;
  hours: number;
  minutes: number;
  seconds: number;
  formatted: string;
  resetsAt: string;
} {
  const next = getNextUtcMidnight(from);
  const diffMs = Math.max(0, next.getTime() - from.getTime());
  const totalSeconds = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  const formatted = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;

  return {
    totalSeconds,
    hours,
    minutes,
    seconds,
    formatted,
    resetsAt: next.toISOString(),
  };
}

/**
 * Format leaderboard score / streak values according to the active tab.
 */
export function formatValue(value: number, tab?: string): string {
  if (tab === 'streak') {
    return `${value} days`;
  }
  return value.toLocaleString('en-US');
}
