export interface LeaderboardConfig {
  useMock: boolean;
  pollIntervalMs: number;
}

export const LEADERBOARD_CONFIG: LeaderboardConfig = {
  // Uses real database and on-chain verified runs only (no artificial mock data)
  useMock: false,
  pollIntervalMs: 30000,
};
