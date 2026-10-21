import { NextResponse } from 'next/server';
import { getCurrentDayNumber, getSeedForDay, getCommitmentHash } from '@/lib/day';

export const dynamic = 'force-dynamic';

export interface DayProofItem {
  day: number;
  seed: number;
  salt: string;
  commitmentHash: string;
  revealed: boolean;
  matched: boolean;
  contractAddress: string;
  explorerUrl: string;
}

export async function GET() {
  try {
    const currentDay = getCurrentDayNumber();
    const isMainnet =
      process.env.NEXT_PUBLIC_SMOOTHSEND_NETWORK === 'mainnet' ||
      process.env.NEXT_PUBLIC_CHAIN_ID === '43114';
    const contractAddress =
      process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ||
      '0x8e3be8a5a13a8fc89d8e04cc07447514f2bf2c40';
    const explorerBase = isMainnet
      ? 'https://snowtrace.io'
      : 'https://testnet.snowtrace.io';

    const proofs: DayProofItem[] = [];

    // Provide proof for past days and current day (1 up to currentDay)
    for (let day = 1; day <= currentDay; day++) {
      const { seed, salt } = getSeedForDay(day);
      const commitmentHash = getCommitmentHash(day, seed, salt);

      proofs.push({
        day,
        seed,
        salt,
        commitmentHash,
        revealed: true,
        matched: true,
        contractAddress,
        explorerUrl: `${explorerBase}/address/${contractAddress}#readContract`,
      });
    }

    // Sort descending by day (current day first, then past days)
    proofs.sort((a, b) => b.day - a.day);

    return NextResponse.json({
      currentDay,
      contractAddress,
      proofs,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Failed to fetch proofs' },
      { status: 500 }
    );
  }
}
