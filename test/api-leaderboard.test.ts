import { describe, it, expect, beforeEach } from 'vitest';
import { GET } from '@/app/api/leaderboard/route';
import { NextRequest } from 'next/server';
import { createRunSession, updateRunCompleted } from '@/lib/db';

describe('Live Leaderboard API (/api/leaderboard)', () => {
  const testWallet = '0x1234567890123456789012345678901234567890';
  const testDay = 104;

  beforeEach(async () => {
    // Insert a test completed run into SQLite
    const runId = `test_lb_${Date.now()}`;
    await createRunSession(runId, testWallet, testDay, 'daily', Date.now() - 60000);
    await updateRunCompleted(runId, {
      submittedAt: Date.now(),
      ticks: 3600,
      score: 55000,
      lines: 42,
      epochs: 3,
      logHash: '0x1111222233334444555566667777888899990000111122223333444455556666',
      deadline: Math.floor(Date.now() / 1000) + 600,
      signature: '0xtestsig',
      inputLog: '[]',
    });
  });

  it('GET /api/leaderboard?tab=today returns live rankings with the submitted run', async () => {
    const req = new NextRequest(`http://localhost:3000/api/leaderboard?tab=today&day=${testDay}&wallet=${testWallet}`);
    const res = await GET(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.tab).toBe('today');
    expect(data.dayNumber).toBe(testDay);
    expect(data.title).toBe('The tower');
    expect(Array.isArray(data.entries)).toBe(true);
    expect(data.entries.length).toBeGreaterThan(0);

    // Score 55,000 beats reference #1 (48,210), so it should rank #1!
    expect(data.entries[0].wallet.toLowerCase()).toBe(testWallet.toLowerCase());
    expect(data.entries[0].value).toBe(55000);
    expect(data.entries[0].rank).toBe(1);
    expect(data.entries[0].isMe).toBe(true);

    // Pinned user entry should match
    expect(data.me).toBeDefined();
    expect(data.me?.wallet.toLowerCase()).toBe(testWallet.toLowerCase());
    expect(data.me?.rank).toBe(1);
  });

  it('GET /api/leaderboard?tab=all returns all-time best scores', async () => {
    const req = new NextRequest(`http://localhost:3000/api/leaderboard?tab=all&wallet=${testWallet}`);
    const res = await GET(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.tab).toBe('all');
    expect(data.unit).toBe('Best score');
    expect(data.entries.length).toBeGreaterThan(0);
  });

  it('GET /api/leaderboard?tab=streak returns streaks', async () => {
    const req = new NextRequest('http://localhost:3000/api/leaderboard?tab=streak');
    const res = await GET(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.tab).toBe('streak');
    expect(data.unit).toBe('Streak');
    expect(data.entries.length).toBeGreaterThan(0);
  });

  it('GET /api/proofs returns cryptographic commit-reveal proofs (COMMON §6)', async () => {
    const { GET: getProofs } = await import('@/app/api/proofs/route');
    const res = await getProofs();
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.proofs).toBeDefined();
    expect(Array.isArray(data.proofs)).toBe(true);
    expect(data.proofs.length).toBeGreaterThan(0);

    const first = data.proofs[0];
    expect(first.day).toBeGreaterThan(0);
    expect(first.seed).toBeGreaterThan(0);
    expect(first.salt).toMatch(/^0x[a-f0-9]{64}$/);
    expect(first.commitmentHash).toMatch(/^0x[a-f0-9]{64}$/);
    expect(first.matched).toBe(true);
    expect(first.revealed).toBe(true);
  });
});
