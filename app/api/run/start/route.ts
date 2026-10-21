import { NextRequest, NextResponse } from 'next/server';
import { createRunSession, getPlayerDailyRun } from '@/lib/db';
import { getCurrentDayNumber, getSeedForDay } from '@/lib/day';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const mode = body.mode === 'daily' ? 'daily' : 'practice';
    const player = (body.player || '0x0000000000000000000000000000000000000000').toLowerCase();
    const day = getCurrentDayNumber();

    if (mode === 'daily') {
      // Check if player has already submitted for this UTC day
      if (player !== '0x0000000000000000000000000000000000000000') {
        const existing = await getPlayerDailyRun(player, day);
        if (existing) {
          return NextResponse.json(
            {
              error: 'already_submitted',
              message: 'Already completed a daily run for today',
              day,
              previousScore: existing.score,
            },
            { status: 409 }
          );
        }
      }

      const { seed } = getSeedForDay(day);
      const runId = crypto.randomUUID();
      const now = Date.now();
      const startedAt =
        typeof body.startedAt === 'number' &&
        body.startedAt > 0 &&
        body.startedAt <= now + 1000 &&
        body.startedAt >= now - 30000
          ? body.startedAt
          : now;

      await createRunSession(runId, player, day, 'daily', startedAt);

      return NextResponse.json({
        runId,
        seed,
        day,
        mode: 'daily',
        startedAt,
      });
    }

    // Practice mode: fresh random seed, unscored
    const practiceSeed = Math.floor(Math.random() * 100000000);
    const runId = crypto.randomUUID();
    const practiceNow = Date.now();
    const startedAt =
      typeof body.startedAt === 'number' &&
      body.startedAt > 0 &&
      body.startedAt <= practiceNow + 1000 &&
      body.startedAt >= practiceNow - 30000
        ? body.startedAt
        : practiceNow;

    await createRunSession(runId, player, day, 'practice', startedAt);

    return NextResponse.json({
      runId,
      seed: practiceSeed,
      day,
      mode: 'practice',
      startedAt,
    });
  } catch (err: any) {
    console.error('Error starting run:', err);
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 });
  }
}
