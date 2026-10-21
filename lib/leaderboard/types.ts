export type LeaderboardTab = 'today' | 'all' | 'streak';

export interface LeaderboardEntry {
  rank: number;
  wallet: string; // full address; formatted only in UI
  value: number; // score for today/all, days for streak
  lines?: number;
  pieces?: number; // 100 for complete runs
  durationMs?: number;
  dayNumber?: number; // for all-time: day the best score was set
  submittedAt: string; // ISO string
  proofUrl?: string; // explorer link to on-chain proof
  verified: boolean;
  details?: string; // e.g. "38 lines · 100 pieces · 4m 12s"
  isMe?: boolean;
}

export interface LeaderboardPage {
  tab: LeaderboardTab;
  dayNumber: number;
  totalPlayers: number;
  label: string; // e.g. "Daily 100 · No. 104"
  title: string; // e.g. "The tower"
  unit: string; // e.g. "Score", "Best score", "Streak"
  entries: LeaderboardEntry[]; // sorted, starting at rank 1
  me?: LeaderboardEntry; // undefined if wallet has not played / not connected
  resetsAt: string; // ISO string, next 00:00 UTC
}

export interface RunRecord {
  wallet: string;
  dayNumber: number;
  seed: number;
  score: number;
  lines: number;
  inputs?: unknown[];
  durationMs?: number;
  txHash?: string;
}

export interface SubmitResult {
  accepted: boolean;
  entry?: LeaderboardEntry;
  previousRank?: number; // rank before submit (or totalPlayers + 1)
  reason?: 'already_submitted' | 'verification_failed' | 'day_ended' | 'network';
}

export interface LeaderboardService {
  getPage(tab: LeaderboardTab, opts?: { limit?: number; offset?: number; wallet?: string }): Promise<LeaderboardPage>;
  getAround(wallet: string, tab: LeaderboardTab, n: number): Promise<LeaderboardEntry[]>;
  submitRun(run: RunRecord): Promise<SubmitResult>;
}
