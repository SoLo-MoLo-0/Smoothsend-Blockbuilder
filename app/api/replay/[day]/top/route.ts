import { NextRequest, NextResponse } from 'next/server';
import { getTopRun } from '@/lib/db';
import { getSeedForDay } from '@/lib/day';

export async function GET(
  _req: NextRequest,
  { params }: { params: { day: string } }
) {
  try {
    const day = parseInt(params.day, 10);
    if (isNaN(day) || day < 1) {
      return NextResponse.json({ error: 'Invalid day parameter' }, { status: 400 });
    }

    const topRun = await getTopRun(day);
    if (!topRun || !topRun.input_log) {
      return NextResponse.json({ day, found: false, topRun: null });
    }

    const seedInfo = getSeedForDay(day);

    return NextResponse.json({
      day,
      seed: seedInfo.seed,
      found: true,
      topRun: {
        player: topRun.player,
        score: topRun.score,
        lines: topRun.lines,
        epochs: topRun.epochs,
        ticks: topRun.ticks,
        logHash: topRun.log_hash,
        submittedAt: topRun.submitted_at,
        log: JSON.parse(topRun.input_log),
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 });
  }
}
