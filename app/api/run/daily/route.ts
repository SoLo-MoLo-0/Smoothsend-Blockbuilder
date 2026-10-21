import { NextResponse } from 'next/server';
import { getCurrentDayNumber, getSeedForDay, getNextUtcMidnight } from '@/lib/day';

export const dynamic = 'force-dynamic';

export async function GET() {
  const day = getCurrentDayNumber();
  const { seed } = getSeedForDay(day);
  return NextResponse.json({
    day,
    seed,
    resetsAt: getNextUtcMidnight(),
  });
}
