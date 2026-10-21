import { NextRequest, NextResponse } from 'next/server';
import { getRun, updateRunCompleted } from '@/lib/db';
import { getSeedForDay } from '@/lib/day';
import { verifyInputLog } from '@/lib/server/verify';
import { getEip712Domain, hashLog, signRunPayload } from '@/lib/signer';
import type { Hex } from 'viem';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { runId, log, player, durationMs } = body;

    if (!runId || typeof runId !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid runId' }, { status: 400 });
    }

    if (!Array.isArray(log)) {
      return NextResponse.json({ error: 'Missing or invalid log array' }, { status: 400 });
    }

    const run = await getRun(runId);
    if (!run) {
      return NextResponse.json({ error: 'Run session not found' }, { status: 404 });
    }

    // Idempotent: if already completed and player matches, return existing signed result
    const requestedPlayer = player ? player.toLowerCase() : null;
    const existingPlayer = run.player ? run.player.toLowerCase() : '0x0000000000000000000000000000000000000000';
    if (run.status === 'completed' && run.signature && (!requestedPlayer || requestedPlayer === existingPlayer)) {
      return NextResponse.json({
        runId: run.run_id,
        player: existingPlayer,
        day: run.day,
        score: run.score,
        lines: run.lines,
        epochs: run.epochs,
        ticks: run.ticks,
        logHash: run.log_hash,
        deadline: run.deadline,
        signature: run.signature,
      });
    }

    const signerKey = (process.env.SIGNER_KEY || '') as Hex;
    const contractAddress = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || '0x8e3be8a5a13a8fc89d8e04cc07447514f2bf2c40') as Hex;
    const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 43113);

    // If run was already completed with a placeholder/zero address and the user now connected their wallet:
    if (run.status === 'completed' && requestedPlayer && requestedPlayer !== existingPlayer && run.log_hash) {
      const resolvedPlayer = requestedPlayer as Hex;
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
      let signature = '0x';
      if (signerKey && signerKey.startsWith('0x')) {
        const domain = getEip712Domain(chainId, contractAddress);
        signature = await signRunPayload(
          {
            player: resolvedPlayer,
            day: BigInt(run.day),
            score: run.score ?? 0,
            lines: run.lines ?? 0,
            epochs: run.epochs ?? 0,
            logHash: run.log_hash as Hex,
            deadline,
          },
          signerKey,
          domain
        );
      }
      updateRunCompleted(runId, {
        player: resolvedPlayer,
        submittedAt: run.submitted_at || Date.now(),
        ticks: run.ticks ?? 0,
        score: run.score ?? 0,
        lines: run.lines ?? 0,
        epochs: run.epochs ?? 0,
        logHash: run.log_hash,
        deadline: Number(deadline),
        signature,
        inputLog: run.input_log || JSON.stringify(log),
      });
      return NextResponse.json({
        runId: run.run_id,
        player: resolvedPlayer,
        day: run.day,
        score: run.score,
        lines: run.lines,
        epochs: run.epochs,
        ticks: run.ticks,
        logHash: run.log_hash,
        deadline: Number(deadline),
        signature,
      });
    }

    const now = Date.now();
    const { seed } = getSeedForDay(run.day);

    // Verify input log deterministically with engine + anti-cheat timing checks
    const clientDurationMs = typeof durationMs === 'number' && durationMs > 0 ? durationMs : undefined;
    const verification = verifyInputLog(log, seed, run.started_at, now, 100, clientDurationMs);
    if (!verification.valid || !verification.result) {
      return NextResponse.json({ error: verification.error || 'Verification failed' }, { status: 400 });
    }

    const result = verification.result;
    const logString = JSON.stringify(log);
    const logHash = hashLog(logString);

    // EIP-712 Signing for Avalanche Fuji BlockBuilder contract
    const resolvedPlayer = (player || run.player || '0x0000000000000000000000000000000000000000').toLowerCase() as Hex;
    const deadline = BigInt(Math.floor(now / 1000) + 600); // 10 minutes

    let signature = '0x';
    if (signerKey && signerKey.startsWith('0x')) {
      const domain = getEip712Domain(chainId, contractAddress);
      signature = await signRunPayload(
        {
          player: resolvedPlayer,
          day: BigInt(run.day),
          score: result.score,
          lines: result.lines,
          epochs: result.epochs,
          logHash,
          deadline,
        },
        signerKey,
        domain
      );
    }

    // Persist verified run
    await updateRunCompleted(runId, {
      player: resolvedPlayer,
      submittedAt: now,
      ticks: result.ticks,
      score: result.score,
      lines: result.lines,
      epochs: result.epochs,
      logHash,
      deadline: Number(deadline),
      signature,
      inputLog: logString,
    });

    return NextResponse.json({
      runId: run.run_id,
      player: resolvedPlayer,
      day: run.day,
      score: result.score,
      lines: result.lines,
      epochs: result.epochs,
      pieces: result.pieces,
      ticks: result.ticks,
      logHash,
      deadline: Number(deadline),
      signature,
    });
  } catch (err: any) {
    console.error('Error submitting run:', err);
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 });
  }
}
