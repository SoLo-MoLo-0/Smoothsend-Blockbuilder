import { NextRequest, NextResponse } from 'next/server';
import { getDayStats } from '@/lib/db';

export async function GET(
  _req: NextRequest,
  { params }: { params: { day: string } }
) {
  try {
    const day = parseInt(params.day, 10);
    if (isNaN(day) || day < 1) {
      return NextResponse.json({ error: 'Invalid day parameter' }, { status: 400 });
    }

    const stats = await getDayStats(day);
    const userScore = _req.nextUrl.searchParams.get('score');
    const userPieces = _req.nextUrl.searchParams.get('pieces');
    let funStat = stats.funStat;

    if (userScore !== null && stats.scores.length > 0) {
      const s = parseInt(userScore, 10);
      if (!isNaN(s)) {
        const belowCount = stats.scores.filter((sc) => sc < s).length;
        const beatPct = Math.round((belowCount / stats.scores.length) * 100);
        const pieces = userPieces ? parseInt(userPieces, 10) : 100;

        if (pieces >= 100) {
          funStat = `You survived all 100 blocks today. Only ${Math.max(1, Math.round((1 / Math.max(1, stats.count)) * 100))}% of players did.`;
        } else if (beatPct > 50) {
          funStat = `You outscored ${beatPct}% of players on today's bag sequence.`;
        } else {
          const bucket = Math.min(90, Math.max(20, Math.ceil(pieces / 10) * 10));
          funStat = `38% of players also topped out before block ${bucket} today.`;
        }
      }
    }

    return NextResponse.json({
      day,
      ...stats,
      funStat,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 });
  }
}
