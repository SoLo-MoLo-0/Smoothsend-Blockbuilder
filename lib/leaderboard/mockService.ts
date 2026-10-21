import {
  LeaderboardEntry,
  LeaderboardPage,
  LeaderboardService,
  LeaderboardTab,
  RunRecord,
  SubmitResult,
} from './types';
import { getNextUtcMidnight, sortAndAssignRanks } from './utils';

// Reference wallets (full 42-char addresses matching reference abbreviations)
const REFERENCE_WALLETS = [
  '0x9f3a00000000000000000000000000000000c21e',
  '0x31bd000000000000000000000000000000008a07',
  '0xc7e20000000000000000000000000000000019f4',
  '0x5a9000000000000000000000000000000000e3b1',
  '0x82d40000000000000000000000000000000070ac',
  '0x1e6f00000000000000000000000000000000b95d',
  '0xd3c8000000000000000000000000000000002e66',
  '0x7b4100000000000000000000000000000000f0a9',
];

const USER_WALLET = '0xa2f10000000000000000000000000000000044d8';

const LINES = [38, 37, 36, 33, 32, 31, 30, 28];
const TIMES = ['4m 12s', '4m 40s', '4m 05s', '5m 02s', '4m 51s', '5m 18s', '4m 33s', '5m 40s'];
const SCORES_TODAY = [48210, 46880, 45120, 41990, 40760, 39300, 38050, 36420];

const SCORES_ALL = [71250, 69880, 66410, 63200, 61980, 60120, 58870, 57340];
const DAYS_ALL = [87, 52, 101, 66, 93, 74, 12, 98];

const STREAKS = [64, 58, 51, 47, 45, 41, 39, 36];
const STREAK_START_DAYS = [40, 46, 53, 57, 59, 63, 65, 68];

function getSampleEntries(tab: LeaderboardTab): LeaderboardEntry[] {
  const baseTime = new Date('2026-10-09T18:00:00Z').getTime();

  if (tab === 'today') {
    return SCORES_TODAY.map((score, i) => ({
      rank: i + 1,
      wallet: REFERENCE_WALLETS[i],
      value: score,
      lines: LINES[i],
      pieces: 100,
      durationMs: (parseInt(TIMES[i][0], 10) * 60 + parseInt(TIMES[i].slice(3, 5), 10)) * 1000,
      submittedAt: new Date(baseTime - i * 180000).toISOString(),
      proofUrl: `https://testnet.snowtrace.io/tx/0xmock${i}`,
      verified: true,
      details: `${LINES[i]} lines · 100 pieces · ${TIMES[i]}`,
    }));
  }

  if (tab === 'all') {
    return SCORES_ALL.map((score, i) => ({
      rank: i + 1,
      wallet: REFERENCE_WALLETS[i],
      value: score,
      dayNumber: DAYS_ALL[i],
      submittedAt: new Date(baseTime - i * 86400000).toISOString(),
      proofUrl: `https://testnet.snowtrace.io/tx/0xmockall${i}`,
      verified: true,
      details: `Set on day No. ${DAYS_ALL[i]}`,
    }));
  }

  return STREAKS.map((streak, i) => ({
    rank: i + 1,
    wallet: REFERENCE_WALLETS[i],
    value: streak,
    submittedAt: new Date(baseTime - i * 43200000).toISOString(),
    proofUrl: `https://testnet.snowtrace.io/tx/0xmockstreak${i}`,
    verified: true,
    details: `Played every day since No. ${STREAK_START_DAYS[i]}`,
  }));
}

function getSampleUser(tab: LeaderboardTab): LeaderboardEntry {
  const baseTime = new Date('2026-10-09T17:30:00Z').toISOString();

  if (tab === 'today') {
    return {
      rank: 142,
      wallet: USER_WALLET,
      value: 28640,
      lines: 24,
      pieces: 100,
      durationMs: 228000,
      submittedAt: baseTime,
      proofUrl: 'https://testnet.snowtrace.io/tx/0xmockme',
      verified: true,
      details: '24 lines · 100 pieces · 3m 48s',
      isMe: true,
    };
  }

  if (tab === 'all') {
    return {
      rank: 1904,
      wallet: USER_WALLET,
      value: 33410,
      dayNumber: 63,
      submittedAt: new Date('2026-09-12T14:20:00Z').toISOString(),
      proofUrl: 'https://testnet.snowtrace.io/tx/0xmockmeall',
      verified: true,
      details: 'Set on day No. 63',
      isMe: true,
    };
  }

  return {
    rank: 380,
    wallet: USER_WALLET,
    value: 6,
    submittedAt: baseTime,
    proofUrl: 'https://testnet.snowtrace.io/tx/0xmockmestreak',
    verified: true,
    details: 'Played every day since No. 99',
    isMe: true,
  };
}

export class MockLeaderboardService implements LeaderboardService {
  private todayEntries: LeaderboardEntry[];
  private allEntries: LeaderboardEntry[];
  private streakEntries: LeaderboardEntry[];

  private todayMe: LeaderboardEntry;
  private allMe: LeaderboardEntry;
  private streakMe: LeaderboardEntry;

  private totalPlayersToday = 3208;
  private totalPlayersAll = 12946;
  private totalPlayersStreak = 2771;

  constructor() {
    this.todayEntries = getSampleEntries('today');
    this.allEntries = getSampleEntries('all');
    this.streakEntries = getSampleEntries('streak');

    this.todayMe = getSampleUser('today');
    this.allMe = getSampleUser('all');
    this.streakMe = getSampleUser('streak');
  }

  public reset(): void {
    this.todayEntries = getSampleEntries('today');
    this.allEntries = getSampleEntries('all');
    this.streakEntries = getSampleEntries('streak');

    this.todayMe = getSampleUser('today');
    this.allMe = getSampleUser('all');
    this.streakMe = getSampleUser('streak');

    this.totalPlayersToday = 3208;
    this.totalPlayersAll = 12946;
    this.totalPlayersStreak = 2771;
  }

  public async getPage(
    tab: LeaderboardTab,
    opts?: { limit?: number; offset?: number; wallet?: string }
  ): Promise<LeaderboardPage> {
    const limit = opts?.limit ?? 50;
    const offset = opts?.offset ?? 0;
    const targetWallet = opts?.wallet?.toLowerCase();

    // When running in client browser, sync with live /api/leaderboard from SQLite database
    if (typeof window !== 'undefined') {
      try {
        const queryUrl = `/api/leaderboard?tab=${tab}${targetWallet ? `&wallet=${encodeURIComponent(targetWallet)}` : ''}`;
        const res = await fetch(queryUrl);
        if (res.ok) {
          const liveData: LeaderboardPage = await res.json();
          if (liveData && Array.isArray(liveData.entries) && liveData.entries.length > 0) {
            if (tab === 'today') {
              this.todayEntries = liveData.entries;
              if (liveData.me) this.todayMe = liveData.me;
              this.totalPlayersToday = liveData.totalPlayers;
            } else if (tab === 'all') {
              this.allEntries = liveData.entries;
              if (liveData.me) this.allMe = liveData.me;
              this.totalPlayersAll = liveData.totalPlayers;
            } else {
              this.streakEntries = liveData.entries;
              if (liveData.me) this.streakMe = liveData.me;
              this.totalPlayersStreak = liveData.totalPlayers;
            }
            if (!liveData.me) {
              const fallbackMe = tab === 'today' ? this.todayMe : tab === 'all' ? this.allMe : this.streakMe;
              liveData.me = targetWallet ? { ...fallbackMe, wallet: targetWallet, isMe: true } : fallbackMe;
            }
            return liveData;
          }
        }
      } catch {
        // Fall back gracefully to local state if fetch fails or offline
      }
    }

    let entries: LeaderboardEntry[];
    let me: LeaderboardEntry | undefined;
    let dayNumber = 104;
    let totalPlayers: number;
    let label: string;
    let title: string;
    let unit: string;

    if (tab === 'today') {
      entries = this.todayEntries;
      const foundMe = targetWallet ? entries.find((e) => e.wallet.toLowerCase() === targetWallet) : undefined;
      me = foundMe || (targetWallet ? { ...this.todayMe, wallet: targetWallet, isMe: true } : this.todayMe);
      totalPlayers = this.totalPlayersToday;
      label = 'Daily 100 · No. 104';
      title = 'The tower';
      unit = 'Score';
    } else if (tab === 'all') {
      entries = this.allEntries;
      const foundMe = targetWallet ? entries.find((e) => e.wallet.toLowerCase() === targetWallet) : undefined;
      me = foundMe || (targetWallet ? { ...this.allMe, wallet: targetWallet, isMe: true } : this.allMe);
      totalPlayers = this.totalPlayersAll;
      label = 'Season 1';
      title = 'All-time tower';
      unit = 'Best score';
    } else {
      entries = this.streakEntries;
      const foundMe = targetWallet ? entries.find((e) => e.wallet.toLowerCase() === targetWallet) : undefined;
      me = foundMe || (targetWallet ? { ...this.streakMe, wallet: targetWallet, isMe: true } : this.streakMe);
      totalPlayers = this.totalPlayersStreak;
      label = 'Daily habit';
      title = 'Streak tower';
      unit = 'Streak';
    }

    const paginated = entries.slice(offset, offset + limit);

    return {
      tab,
      dayNumber,
      totalPlayers,
      label,
      title,
      unit,
      entries: paginated,
      me,
      resetsAt: getNextUtcMidnight().toISOString(),
    };
  }

  public async getAround(
    wallet: string,
    tab: LeaderboardTab,
    n: number
  ): Promise<LeaderboardEntry[]> {
    const page = await this.getPage(tab, { wallet, limit: 100, offset: 0 });
    const target = wallet.toLowerCase();
    const index = page.entries.findIndex((e) => e.wallet.toLowerCase() === target);

    if (index === -1) {
      if (page.me && page.me.wallet.toLowerCase() === target) {
        return [page.me];
      }
      return [];
    }

    const start = Math.max(0, index - n);
    const end = Math.min(page.entries.length, index + n + 1);
    return page.entries.slice(start, end);
  }

  public async submitRun(run: RunRecord): Promise<SubmitResult> {
    const previousRank = this.todayMe.rank;

    // Simulate failure scenarios if requested by test wallet
    if (run.wallet === 'error:already_submitted') {
      return { accepted: false, reason: 'already_submitted', previousRank };
    }
    if (run.wallet === 'error:verification_failed') {
      return { accepted: false, reason: 'verification_failed' };
    }
    if (run.wallet === 'error:day_ended') {
      return { accepted: false, reason: 'day_ended' };
    }
    if (run.wallet === 'error:network') {
      return { accepted: false, reason: 'network' };
    }

    // Use run's real score, lines, duration
    const newScore = run.score !== undefined ? run.score : 40010;
    const newLines = run.lines !== undefined ? run.lines : 31;
    const durationMs = run.durationMs || 260000;
    const minutes = Math.floor(durationMs / 60000);
    const seconds = Math.floor((durationMs % 60000) / 1000);
    const playerWallet = run.wallet || USER_WALLET;

    const updatedUserEntry: LeaderboardEntry = {
      rank: 0,
      wallet: playerWallet,
      value: newScore,
      lines: newLines,
      pieces: 100,
      durationMs,
      submittedAt: new Date().toISOString(),
      proofUrl: run.txHash && run.txHash.startsWith('0x')
        ? `https://testnet.snowtrace.io/tx/${run.txHash}`
        : 'https://testnet.snowtrace.io/tx/0xmock_submission_climb',
      verified: true,
      details: `${newLines} lines · 100 pieces · ${minutes}m ${String(seconds).padStart(2, '0')}s`,
      isMe: true,
    };

    // Filter out previous me entry from today's list if present, add new entry, and re-rank
    const filtered = this.todayEntries.filter((e) => !e.isMe && e.wallet.toLowerCase() !== playerWallet.toLowerCase());
    const combined = [...filtered, updatedUserEntry];
    this.todayEntries = sortAndAssignRanks(combined);

    const rankedEntry = this.todayEntries.find((e) => e.wallet.toLowerCase() === playerWallet.toLowerCase()) || this.todayEntries.find((e) => e.isMe);
    const finalEntry = rankedEntry ?? updatedUserEntry;

    this.todayMe = finalEntry;
    this.totalPlayersToday += 1;

    return {
      accepted: true,
      entry: finalEntry,
      previousRank,
    };
  }
}

export const mockLeaderboardService = new MockLeaderboardService();
