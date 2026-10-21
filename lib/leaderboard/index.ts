export * from './types';
export * from './utils';
export * from './config';
export * from './mockService';
export * from './liveService';
export * from './useCountdown';
export * from './useLeaderboard';

import { LEADERBOARD_CONFIG } from './config';
import { mockLeaderboardService } from './mockService';
import { liveLeaderboardService } from './liveService';
import { LeaderboardService } from './types';

export function getLeaderboardService(
  useMock = LEADERBOARD_CONFIG.useMock
): LeaderboardService {
  if (useMock) {
    return mockLeaderboardService;
  }
  return liveLeaderboardService;
}
