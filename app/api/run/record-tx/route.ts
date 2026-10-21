import { NextRequest, NextResponse } from 'next/server';
import { updateRunTxHash } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { runId, player, day, txHash } = body;

    if (!txHash || typeof txHash !== 'string' || !txHash.startsWith('0x')) {
      return NextResponse.json({ error: 'Valid txHash is required' }, { status: 400 });
    }

    await updateRunTxHash({
      runId: typeof runId === 'string' ? runId : undefined,
      player: typeof player === 'string' ? player : undefined,
      day: typeof day === 'number' ? day : undefined,
      txHash,
    });

    return NextResponse.json({ ok: true, txHash });
  } catch (err: any) {
    console.error('Error recording txHash:', err);
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 });
  }
}
