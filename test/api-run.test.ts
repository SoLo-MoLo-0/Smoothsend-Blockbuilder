import { describe, it, expect, beforeEach } from 'vitest';
import { verifyInputLog } from '../lib/server/verify';
import { getSeedForDay, getCurrentDayNumber } from '../lib/day';
import { getDb, getRun, getTopRun, getDayStats } from '../lib/db';
import { POST as handleStart } from '../app/api/run/start/route';
import { POST as handleSubmit } from '../app/api/run/submit/route';
import { GET as handleTopReplay } from '../app/api/replay/[day]/top/route';
import { GET as handleStats } from '../app/api/stats/[day]/route';
import { NextRequest } from 'next/server';

describe('M3: Daily Run & Anti-Cheat API', () => {
  beforeEach(() => {
    // Ensure DB initialized
    getDb();
  });

  it('anti-cheat: validates input log structure and rates', () => {
    const seed = 20261010;
    const now = Date.now();

    // 1. Valid log
    const validLog = [
      [0, 'L'],
      [10, 'CW'],
      [30, 'HARD'],
    ];
    const res1 = verifyInputLog(validLog, seed, now - 5000, now, 100);
    expect(res1.valid).toBe(true);
    expect(res1.result).toBeDefined();
    expect(res1.result!.pieces).toBeGreaterThanOrEqual(1);

    // 2. Reject non-array
    const res2 = verifyInputLog('bad-data', seed, now - 5000, now, 100);
    expect(res2.valid).toBe(false);

    // 3. Reject rate limit (>10 actions at same tick)
    const spammedLog = Array.from({ length: 12 }, () => [5, 'L']);
    const res3 = verifyInputLog(spammedLog, seed, now - 5000, now, 100);
    expect(res3.valid).toBe(false);
    expect(res3.error).toContain('Action rate limit exceeded');

    // 4. Reject unrealistic speed (< 90% of game time)
    const longLog = Array.from({ length: 20 }, (_, i) => [i * 30, 'L']);
    longLog.push([1200, 'HARD']); // 1200 ticks = 20s
    const res4 = verifyInputLog(longLog, seed, now - 2000, now, 100); // only 2s elapsed
    expect(res4.valid).toBe(false);
    expect(res4.error).toContain('Submission too fast');
  });

  it('POST /api/run/start and POST /api/run/submit end-to-end', async () => {
    const player = ('0x' + crypto.randomUUID().replace(/-/g, '') + '11223344').slice(0, 42).toLowerCase();

    // 1. Start a daily run
    const startReq = new NextRequest('http://localhost:3000/api/run/start', {
      method: 'POST',
      body: JSON.stringify({ mode: 'daily', player }),
    });
    const startRes = await handleStart(startReq);
    expect(startRes.status).toBe(200);

    const startData = await startRes.json();
    expect(startData.runId).toBeDefined();
    expect(startData.seed).toBeDefined();
    expect(startData.mode).toBe('daily');

    // 2. Submit the run with moves
    const log = [
      [0, 'L'],
      [5, 'HARD'],
      [35, 'CW'],
      [40, 'HARD'],
    ];

    const submitReq = new NextRequest('http://localhost:3000/api/run/submit', {
      method: 'POST',
      body: JSON.stringify({
        runId: startData.runId,
        log,
        player,
      }),
    });
    const submitRes = await handleSubmit(submitReq);
    expect(submitRes.status).toBe(200);

    const submitData = await submitRes.json();
    expect(submitData.score).toBeGreaterThan(0);
    expect(submitData.logHash).toBeDefined();
    expect(submitData.signature).toBeDefined();

    // 3. Idempotent submission: submitting same runId returns identical result
    const submitReq2 = new NextRequest('http://localhost:3000/api/run/submit', {
      method: 'POST',
      body: JSON.stringify({
        runId: startData.runId,
        log,
        player,
      }),
    });
    const submitRes2 = await handleSubmit(submitReq2);
    expect(submitRes2.status).toBe(200);
    const submitData2 = await submitRes2.json();
    expect(submitData2.score).toBe(submitData.score);
    expect(submitData2.signature).toBe(submitData.signature);

    // 4. Repeated daily run start for same player is rejected (409)
    const duplicateStartReq = new NextRequest('http://localhost:3000/api/run/start', {
      method: 'POST',
      body: JSON.stringify({ mode: 'daily', player }),
    });
    const duplicateStartRes = await handleStart(duplicateStartReq);
    expect(duplicateStartRes.status).toBe(409);
    const dupData = await duplicateStartRes.json();
    expect(dupData.error).toBe('already_submitted');

    // 5. Query top replay and stats
    const topReq = new NextRequest(`http://localhost:3000/api/replay/${startData.day}/top`);
    const topRes = await handleTopReplay(topReq, { params: { day: String(startData.day) } });
    expect(topRes.status).toBe(200);
    const topData = await topRes.json();
    expect(topData.found).toBe(true);
    expect(topData.seed).toBeDefined();
    expect(typeof topData.seed).toBe('number');
    expect(topData.topRun.score).toBeGreaterThanOrEqual(submitData.score);

    const statsReq = new NextRequest(`http://localhost:3000/api/stats/${startData.day}?score=${submitData.score}&pieces=100`);
    const statsRes = await handleStats(statsReq, { params: { day: String(startData.day) } });
    expect(statsRes.status).toBe(200);
    const statsData = await statsRes.json();
    expect(statsData.count).toBeGreaterThanOrEqual(1);
    expect(statsData.funStat).toBeDefined();
    expect(typeof statsData.funStat).toBe('string');
  });

  it('M4: generates verifiable on-chain payload for ERC-4337 Smart Account and supports connect-after-run re-signing', async () => {
    // 1. Start run anonymously (default zero address)
    const anonymousPlayer = '0x0000000000000000000000000000000000000000';
    const startReq = new NextRequest('http://localhost:3000/api/run/start', {
      method: 'POST',
      body: JSON.stringify({ mode: 'daily', player: anonymousPlayer }),
    });
    const startRes = await handleStart(startReq);
    expect(startRes.status).toBe(200);
    const { runId } = await startRes.json();

    const log = [
      [0, 'L'],
      [10, 'HARD'],
    ];

    // 2. Initial anonymous submit
    const anonSubmitReq = new NextRequest('http://localhost:3000/api/run/submit', {
      method: 'POST',
      body: JSON.stringify({ runId, log, player: anonymousPlayer }),
    });
    const anonSubmitRes = await handleSubmit(anonSubmitReq);
    expect(anonSubmitRes.status).toBe(200);
    const anonData = await anonSubmitRes.json();
    expect(anonData.signature).toBeDefined();
    expect(anonData.player).toBe(anonymousPlayer);

    // 3. User logs in with ERC-4337 Smart Account on the PostRunSummary screen
    const userScw = '0x88f20000000000000000000000000000000012c4';
    const scwSubmitReq = new NextRequest('http://localhost:3000/api/run/submit', {
      method: 'POST',
      body: JSON.stringify({ runId, log, player: userScw }),
    });
    const scwSubmitRes = await handleSubmit(scwSubmitReq);
    expect(scwSubmitRes.status).toBe(200);
    const scwData = await scwSubmitRes.json();

    // Signature must be re-signed specifically for the smart account address
    expect(scwData.signature).toBeDefined();
    expect(scwData.player).toBe(userScw.toLowerCase());
    expect(scwData.signature.startsWith('0x')).toBe(true);
    expect(scwData.signature).not.toBe(anonData.signature); // re-signed for user SCW
    expect(scwData.logHash).toBe(anonData.logHash);
    expect(scwData.score).toBe(anonData.score);
  });
});
