'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { LeaderboardConfig, LEADERBOARD_CONFIG } from './config';
import { mockLeaderboardService } from './mockService';
import {
  LeaderboardEntry,
  LeaderboardPage,
  LeaderboardService,
  LeaderboardTab,
  RunRecord,
  SubmitResult,
} from './types';

import { getLeaderboardService } from './index';

export type LeaderboardStatus = 'loading' | 'ready' | 'empty' | 'error';

export interface UseLeaderboardResult {
  page: LeaderboardPage | null;
  status: LeaderboardStatus;
  error: Error | null;
  refetch: () => Promise<void>;
  submitRun: (run: RunRecord) => Promise<SubmitResult>;
}

const pageCache = new Map<string, LeaderboardPage>();

export function useLeaderboard(
  tab: LeaderboardTab,
  wallet?: string,
  customService?: LeaderboardService,
  config: LeaderboardConfig = LEADERBOARD_CONFIG,
  enabled: boolean = true
): UseLeaderboardResult {
  const service = customService || getLeaderboardService();
  const cacheKey = `${tab}:${wallet || ''}`;

  const [page, setPage] = useState<LeaderboardPage | null>(() => pageCache.get(cacheKey) || null);
  const [status, setStatus] = useState<LeaderboardStatus>(() => {
    const cached = pageCache.get(cacheKey);
    if (cached) {
      return cached.entries.length === 0 ? 'empty' : 'ready';
    }
    return 'loading';
  });
  const [error, setError] = useState<Error | null>(null);

  const isCancelledRef = useRef<boolean>(false);
  const pollingTimerRef = useRef<NodeJS.Timeout | null>(null);

  const fetchPage = useCallback(
    async (isBackgroundPoll = false) => {
      try {
        if (!isBackgroundPoll && !pageCache.has(cacheKey)) {
          setStatus('loading');
        }
        const data = await service.getPage(tab, { wallet });
        if (isCancelledRef.current) return;

        pageCache.set(cacheKey, data);
        setPage(data);
        setError(null);
        setStatus(data.entries.length === 0 ? 'empty' : 'ready');
      } catch (err) {
        if (isCancelledRef.current) return;
        const e = err instanceof Error ? err : new Error(String(err));
        setError(e);
        setStatus('error');
      }
    },
    [service, tab, wallet, cacheKey]
  );

  const refetch = useCallback(async () => {
    await fetchPage(false);
  }, [fetchPage]);

  const submitRun = useCallback(
    async (run: RunRecord): Promise<SubmitResult> => {
      try {
        const result = await service.submitRun(run);
        if (result.accepted) {
          // Re-fetch active page after submission
          await fetchPage(true);
        }
        return result;
      } catch (err) {
        return {
          accepted: false,
          reason: 'network',
        };
      }
    },
    [service, fetchPage]
  );

  useEffect(() => {
    isCancelledRef.current = false;

    if (!enabled) {
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current);
        pollingTimerRef.current = null;
      }
      return;
    }

    // 1. Initial fetch for selected tab
    fetchPage(false);

    // 2. 30s Polling management
    const stopPolling = () => {
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current);
        pollingTimerRef.current = null;
      }
    };

    const startPolling = () => {
      stopPolling();
      pollingTimerRef.current = setInterval(() => {
        if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
          fetchPage(true);
        }
      }, config.pollIntervalMs);
    };

    startPolling();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Refetch immediately on becoming visible and resume poll cycle
        fetchPage(true);
        startPolling();
      } else {
        // Pause polling when browser tab is hidden
        stopPolling();
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      isCancelledRef.current = true;
      stopPolling();
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [tab, wallet, fetchPage, config.pollIntervalMs, enabled]);

  return {
    page,
    status,
    error,
    refetch,
    submitRun,
  };
}
