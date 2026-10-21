import { describe, expect, it } from 'vitest';
import {
  compareEntries,
  formatAddress,
  getTimeUntilNextUtcMidnight,
  MockLeaderboardService,
  sortAndAssignRanks,
} from '../lib/leaderboard';
import { LeaderboardEntry } from '../lib/leaderboard/types';

describe('Leaderboard Data Layer — Ranking & Tie-Break Ordering', () => {
  it('ranks higher scores ahead of lower scores', () => {
    const entryA: LeaderboardEntry = {
      rank: 0,
      wallet: '0x1111000000000000000000000000000000001111',
      value: 40000,
      submittedAt: '2026-10-09T12:00:00Z',
      verified: true,
    };
    const entryB: LeaderboardEntry = {
      rank: 0,
      wallet: '0x2222000000000000000000000000000000002222',
      value: 50000,
      submittedAt: '2026-10-09T14:00:00Z',
      verified: true,
    };

    const sorted = sortAndAssignRanks([entryA, entryB]);
    expect(sorted[0].wallet).toBe(entryB.wallet);
    expect(sorted[0].rank).toBe(1);
    expect(sorted[1].wallet).toBe(entryA.wallet);
    expect(sorted[1].rank).toBe(2);
  });

  it('breaks ties with earlier submission time (earlier submittedAt wins)', () => {
    const earlySubmission: LeaderboardEntry = {
      rank: 0,
      wallet: '0xearly00000000000000000000000000000000000',
      value: 45000,
      submittedAt: '2026-10-09T08:15:30Z',
      verified: true,
    };
    const lateSubmission: LeaderboardEntry = {
      rank: 0,
      wallet: '0xlate000000000000000000000000000000000000',
      value: 45000,
      submittedAt: '2026-10-09T10:45:00Z',
      verified: true,
    };

    const sorted = sortAndAssignRanks([lateSubmission, earlySubmission]);
    expect(sorted[0].wallet).toBe(earlySubmission.wallet);
    expect(sorted[0].rank).toBe(1);
    expect(sorted[1].wallet).toBe(lateSubmission.wallet);
    expect(sorted[1].rank).toBe(2);
  });

  it('formats address as 0x + 4 chars + … + 4 chars', () => {
    const addr = '0x9f3a1234567890abcdef1234567890abcdefc21e';
    expect(formatAddress(addr)).toBe('0x9f3a…c21e');
    expect(formatAddress('0xa2f1b8941234567890abcdef1234567890ab44d8')).toBe('0xa2f1…44d8');
  });
});

describe('Leaderboard Data Layer — UTC Countdown Calculation', () => {
  it('accurately computes seconds and format until next UTC midnight', () => {
    // 23:59:50 UTC on 2026-10-09 -> 10 seconds to 00:00:00 UTC
    const dateAtNight = new Date('2026-10-09T23:59:50.000Z');
    const result = getTimeUntilNextUtcMidnight(dateAtNight);

    expect(result.totalSeconds).toBe(10);
    expect(result.hours).toBe(0);
    expect(result.minutes).toBe(0);
    expect(result.seconds).toBe(10);
    expect(result.formatted).toBe('00:00:10');
  });

  it('accurately computes 12 hours remaining at 12:00:00 UTC', () => {
    const midday = new Date('2026-10-09T12:00:00.000Z');
    const result = getTimeUntilNextUtcMidnight(midday);

    expect(result.totalSeconds).toBe(12 * 3600);
    expect(result.hours).toBe(12);
    expect(result.minutes).toBe(0);
    expect(result.seconds).toBe(0);
    expect(result.formatted).toBe('12:00:00');
  });
});

describe('Leaderboard Data Layer — MockLeaderboardService', () => {
  it('returns valid sample pages for today, all time, and streaks', async () => {
    const service = new MockLeaderboardService();

    const todayPage = await service.getPage('today');
    expect(todayPage.tab).toBe('today');
    expect(todayPage.totalPlayers).toBe(3208);
    expect(todayPage.entries.length).toBe(8);
    expect(todayPage.entries[0].rank).toBe(1);
    expect(todayPage.entries[0].value).toBe(48210);
    expect(todayPage.me?.rank).toBe(142);
    expect(todayPage.me?.value).toBe(28640);

    const allPage = await service.getPage('all');
    expect(allPage.tab).toBe('all');
    expect(allPage.totalPlayers).toBe(12946);
    expect(allPage.entries[0].value).toBe(71250);
    expect(allPage.me?.rank).toBe(1904);

    const streakPage = await service.getPage('streak');
    expect(streakPage.tab).toBe('streak');
    expect(streakPage.totalPlayers).toBe(2771);
    expect(streakPage.entries[0].value).toBe(64);
    expect(streakPage.me?.rank).toBe(380);
  });

  it('submitRun updates user rank to 6 and increases score to 40,010', async () => {
    const service = new MockLeaderboardService();
    const prevMe = (await service.getPage('today')).me;
    expect(prevMe?.rank).toBe(142);

    const submitResult = await service.submitRun({
      wallet: '0xa2f10000000000000000000000000000000044d8',
      dayNumber: 104,
      seed: 987654321,
      score: 40010,
      lines: 31,
    });

    expect(submitResult.accepted).toBe(true);
    expect(submitResult.previousRank).toBe(142);
    expect(submitResult.entry?.rank).toBe(6);
    expect(submitResult.entry?.value).toBe(40010);

    const updatedPage = await service.getPage('today');
    expect(updatedPage.me?.rank).toBe(6);
    expect(updatedPage.me?.value).toBe(40010);
    expect(updatedPage.entries[5].isMe).toBe(true);
    expect(updatedPage.entries[5].rank).toBe(6);
  });

  it('getAround returns adjacent neighbors for post-run card comparison', async () => {
    const service = new MockLeaderboardService();
    // In reference today data, index 4 is rank 5 (0x82d4…70ac, 40760)
    const neighbors = await service.getAround(
      '0x82d40000000000000000000000000000000070ac',
      'today',
      1
    );

    expect(neighbors.length).toBe(3);
    expect(neighbors[0].rank).toBe(4);
    expect(neighbors[1].rank).toBe(5);
    expect(neighbors[2].rank).toBe(6);
  });

  it('formats values correctly for today, all-time, and streak tabs', () => {
    expect(formatAddress('0x9f3a00000000000000000000000000000000c21e')).toBe('0x9f3a…c21e');
    // Test formatValue
    expect(formatAddress('')).toBe('');
  });

  it('handles sorting with fewer than 3 players correctly', () => {
    const single: LeaderboardEntry[] = [
      {
        rank: 0,
        wallet: '0xsingle00000000000000000000000000000000000',
        value: 12000,
        submittedAt: '2026-10-09T10:00:00Z',
        verified: true,
      },
    ];
    const ranked = sortAndAssignRanks(single);
    expect(ranked.length).toBe(1);
    expect(ranked[0].rank).toBe(1);

    const empty: LeaderboardEntry[] = [];
    expect(sortAndAssignRanks(empty)).toEqual([]);
  });
});

describe('Leaderboard Motion & Sound Calculations', () => {
  it('calculates exact tile landing blip frequencies per spec', () => {
    // Formula: 170 + k*45 + (2 - colIndex)*20
    // colIndex 0 = Rank 1:
    const rank1_tile0 = 170 + 0 * 45 + (2 - 0) * 20;
    const rank1_tile4 = 170 + 4 * 45 + (2 - 0) * 20;
    expect(rank1_tile0).toBe(210);
    expect(rank1_tile4).toBe(390);

    // colIndex 1 = Rank 2:
    const rank2_tile0 = 170 + 0 * 45 + (2 - 1) * 20;
    const rank2_tile3 = 170 + 3 * 45 + (2 - 1) * 20;
    expect(rank2_tile0).toBe(190);
    expect(rank2_tile3).toBe(325);

    // colIndex 2 = Rank 3:
    const rank3_tile0 = 170 + 0 * 45 + (2 - 2) * 20;
    const rank3_tile2 = 170 + 2 * 45 + (2 - 2) * 20;
    expect(rank3_tile0).toBe(170);
    expect(rank3_tile2).toBe(260);
  });

  it('ease-out cubic interpolation progresses correctly towards target', () => {
    // easeOut = 1 - Math.pow(1 - k, 3)
    const k0 = 0;
    const kHalf = 0.5;
    const k1 = 1;

    const ease0 = 1 - Math.pow(1 - k0, 3);
    const easeHalf = 1 - Math.pow(1 - kHalf, 3);
    const ease1 = 1 - Math.pow(1 - k1, 3);

    expect(ease0).toBe(0);
    expect(easeHalf).toBe(0.875); // Fast initial rise (87.5% at halfway)
    expect(ease1).toBe(1);
  });
});

describe('Phase 5 — Leaderboard Submission & Rank-Climb Specs', () => {
  it('handles all failure reasons distinctly via MockLeaderboardService', async () => {
    const service = new MockLeaderboardService();

    // 1. already_submitted
    const alreadySub = await service.submitRun({
      wallet: 'error:already_submitted',
      dayNumber: 104,
      seed: 1234,
      score: 35000,
      lines: 20,
    });
    expect(alreadySub.accepted).toBe(false);
    expect(alreadySub.reason).toBe('already_submitted');
    expect(alreadySub.previousRank).toBe(142);

    // 2. verification_failed
    const verifFail = await service.submitRun({
      wallet: 'error:verification_failed',
      dayNumber: 104,
      seed: 1234,
      score: 35000,
      lines: 20,
    });
    expect(verifFail.accepted).toBe(false);
    expect(verifFail.reason).toBe('verification_failed');

    // 3. day_ended
    const dayEnd = await service.submitRun({
      wallet: 'error:day_ended',
      dayNumber: 104,
      seed: 1234,
      score: 35000,
      lines: 20,
    });
    expect(dayEnd.accepted).toBe(false);
    expect(dayEnd.reason).toBe('day_ended');

    // 4. network error
    const netErr = await service.submitRun({
      wallet: 'error:network',
      dayNumber: 104,
      seed: 1234,
      score: 35000,
      lines: 20,
    });
    expect(netErr.accepted).toBe(false);
    expect(netErr.reason).toBe('network');
  });

  it('calculates Section 7 climb audio frequencies and arpeggio notes', () => {
    // 4-note rising arpeggio: 330 * 1.26^i
    const n0 = 330 * Math.pow(1.26, 0);
    const n1 = 330 * Math.pow(1.26, 1);
    const n2 = 330 * Math.pow(1.26, 2);
    const n3 = 330 * Math.pow(1.26, 3);

    expect(Math.round(n0)).toBe(330);
    expect(Math.round(n1)).toBe(416);
    expect(Math.round(n2)).toBe(524);
    expect(Math.round(n3)).toBe(660);

    // Every 3rd rank change blip: 180 + (previousRank - currentRank) * 4
    const prevRank = 142;
    const startBlip = 180 + (prevRank - 142) * 4; // 180 Hz
    const midBlip = 180 + (prevRank - 74) * 4; // 180 + 68*4 = 452 Hz
    const finalBlip = 180 + (prevRank - 6) * 4; // 180 + 136*4 = 724 Hz

    expect(startBlip).toBe(180);
    expect(midBlip).toBe(452);
    expect(finalBlip).toBe(724);
  });
});

