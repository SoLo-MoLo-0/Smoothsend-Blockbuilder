import { NextRequest, NextResponse } from 'next/server';
import { updateRunTxHash } from '@/lib/db';

async function waitForUserOpReceipt(
  userOpHash: string,
  options: {
    apiKey: string;
    corsOrigin?: string;
    timeoutMs?: number;
    pollMs?: number;
  }
) {
  const baseUrl = 'https://proxy.smoothsend.xyz';
  const timeoutMs = options.timeoutMs ?? 15000;
  const pollMs = options.pollMs ?? 1500;
  const deadline = Date.now() + timeoutMs;
  let id = 1;

  while (Date.now() < deadline) {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-api-key': options.apiKey,
        'X-Chain': 'avalanche',
        'X-Sponsorship-Mode': 'developer-sponsored',
      };
      if (options.corsOrigin?.trim()) {
        headers['Origin'] = options.corsOrigin.trim();
      }

      const res = await fetch(`${baseUrl}/`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: id++,
          method: 'eth_getUserOperationReceipt',
          params: [userOpHash],
        }),
      });

      if (res.ok) {
        const envelope = (await res.json()) as { result?: any };
        if (envelope && envelope.result) {
          return envelope.result;
        }
      }
    } catch {
      // Continue polling until deadline
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { userOpHash, player, day, runId } = body;

    if (!userOpHash || typeof userOpHash !== 'string' || !userOpHash.startsWith('0x')) {
      return NextResponse.json({ error: 'Valid userOpHash is required' }, { status: 400 });
    }

    const apiKey = process.env.NEXT_PUBLIC_SMOOTHSEND_API_KEY || 'pk_nogas_dev';
    const corsOrigin =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.VERCEL_URL ||
      'http://localhost:3000';

    const res = await waitForUserOpReceipt(userOpHash, {
      apiKey,
      corsOrigin,
      timeoutMs: 15000,
      pollMs: 1500,
    });

    const onChainHash =
      (res as any)?.receipt?.transactionHash ||
      (res as any)?.transactionHash ||
      null;

    if (onChainHash && typeof onChainHash === 'string' && onChainHash.startsWith('0x')) {
      await updateRunTxHash({
        runId: typeof runId === 'string' ? runId : undefined,
        player: typeof player === 'string' ? player : undefined,
        day: typeof day === 'number' ? day : undefined,
        txHash: onChainHash,
      });

      return NextResponse.json({
        ok: true,
        userOpHash,
        txHash: onChainHash,
        success: (res as any)?.success ?? true,
      });
    }

    return NextResponse.json({
      ok: false,
      userOpHash,
      message: 'Receipt pending or not found yet',
    });
  } catch (err: any) {
    console.error('Error resolving userOp receipt:', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to resolve receipt' },
      { status: 500 }
    );
  }
}
