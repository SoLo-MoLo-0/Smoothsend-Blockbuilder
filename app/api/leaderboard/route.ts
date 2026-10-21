import { NextRequest, NextResponse } from 'next/server';
import { getDailyLeaderboard, getAllTimeLeaderboard, getStreaksLeaderboard, upsertCompletedRun } from '@/lib/db';
import { getCurrentDayNumber, getNextUtcMidnight } from '@/lib/day';
import { sortAndAssignRanks } from '@/lib/leaderboard/utils';
import type { LeaderboardEntry, LeaderboardPage, LeaderboardTab } from '@/lib/leaderboard/types';
import { createPublicClient, http, type Hex } from 'viem';
import { avalanche, avalancheFuji } from 'viem/chains';
import { BLOCK_BUILDER_ABI } from '@/lib/web3/abi';

export const dynamic = 'force-dynamic';

const FACTORY_ABI = [
  {
    type: 'function',
    name: 'getAddress',
    inputs: [
      { name: 'owner', type: 'address', internalType: 'address' },
      { name: 'salt', type: 'uint256', internalType: 'uint256' },
    ],
    outputs: [{ name: '', type: 'address', internalType: 'address' }],
    stateMutability: 'view',
  },
] as const;

function isValidPlayerWallet(address: string | null | undefined): boolean {
  if (!address) return false;
  const clean = address.toLowerCase();
  if (clean === '0x0000000000000000000000000000000000000000') return false;
  return /^0x[a-f0-9]{40}$/.test(clean);
}

const scwCache = new Map<string, string>();

async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeoutPromise = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tab = (searchParams.get('tab') || 'today') as LeaderboardTab;
    const currentDay = getCurrentDayNumber();
    const day = parseInt(searchParams.get('day') || String(currentDay), 10);
    const rawWallets = searchParams.get('wallet')?.toLowerCase() || '';
    const wallets = rawWallets.split(',').map((w) => w.trim()).filter((w) => isValidPlayerWallet(w));

    const isMainnet = process.env.NEXT_PUBLIC_SMOOTHSEND_NETWORK === 'mainnet' || process.env.NEXT_PUBLIC_CHAIN_ID === '43114';
    const explorerBase = isMainnet ? 'https://snowtrace.io' : 'https://testnet.snowtrace.io';
    const chain = isMainnet ? avalanche : avalancheFuji;
    const fujiRpc = 'https://api.avax-test.network/ext/bc/C/rpc';
    const mainnetRpc = 'https://api.avax.network/ext/bc/C/rpc';
    const rpc = process.env.RPC_URL || (isMainnet ? mainnetRpc : fujiRpc);
    const contractAddress = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || '0x8e3be8a5a13a8fc89d8e04cc07447514f2bf2c40') as Hex;
    const factoryAddress = (isMainnet ? '0x863b8E15D37Abf33d5177108f6a07D541a698D25' : '0x55326f005a0959F75496cdd692505fFB520972f5') as Hex;

    const publicClient = createPublicClient({
      chain,
      transport: (http as any)(rpc, { timeout: 1500, retryCount: 0 }),
    });

    // Expand candidate wallets to include both EOA and counterfactual ERC-4337 Smart Account
    const candidateWallets = new Set<string>(wallets.map((w) => w.toLowerCase()));
    if (wallets.length > 0) {
      await Promise.allSettled(
        wallets.map(async (w) => {
          if (w.startsWith('0x') && w.length === 42) {
            const cached = scwCache.get(w);
            if (cached) {
              candidateWallets.add(cached);
              return;
            }
            try {
              const scw = (await withTimeout(
                publicClient.readContract({
                  address: factoryAddress,
                  abi: FACTORY_ABI,
                  functionName: 'getAddress',
                  args: [w as Hex, 0n],
                }),
                350,
                null
              )) as string | null;
              if (scw && typeof scw === 'string' && isValidPlayerWallet(scw)) {
                const lower = scw.toLowerCase();
                scwCache.set(w, lower);
                candidateWallets.add(lower);
              }
            } catch {}
          }
        })
      );
    }

    if (tab === 'today') {
      const dbRuns = await getDailyLeaderboard(day);
      // Keep only each player's highest score for the day (one official run per wallet)
      const playerBestMap = new Map<string, typeof dbRuns[0]>();
      for (const r of dbRuns) {
        if (!isValidPlayerWallet(r.player)) continue;
        const p = r.player.toLowerCase();
        if (!playerBestMap.has(p) || (r.score ?? 0) > (playerBestMap.get(p)!.score ?? 0)) {
          playerBestMap.set(p, r);
        }
      }
      const uniqueRuns = Array.from(playerBestMap.values());

      const liveEntries: LeaderboardEntry[] = uniqueRuns.map((r) => {
        const durationMs = r.ticks ? Math.round(r.ticks * 16.666) : 240000;
        const minutes = Math.floor(durationMs / 60000);
        const seconds = Math.floor((durationMs % 60000) / 1000);
        const isUser = candidateWallets.has(r.player.toLowerCase());

        return {
          rank: 0,
          wallet: r.player,
          value: r.score ?? 0,
          lines: r.lines ?? 0,
          pieces: 100,
          durationMs,
          submittedAt: r.submitted_at ? new Date(r.submitted_at).toISOString() : new Date().toISOString(),
          proofUrl: r.tx_hash ? `${explorerBase}/tx/${r.tx_hash}` : `${explorerBase}/address/${r.player}`,
          verified: r.status === 'completed',
          details: `${r.lines ?? 0} lines · 100 pieces · ${minutes}m ${String(seconds).padStart(2, '0')}s`,
          isMe: isUser,
        };
      });

      // If user's candidate wallets aren't found in DB, check on-chain contract
      if (candidateWallets.size > 0 && !liveEntries.some((e) => candidateWallets.has(e.wallet.toLowerCase()))) {
        const onChainRuns = await Promise.allSettled(
          Array.from(candidateWallets).map(async (wallet) => {
            if (!isValidPlayerWallet(wallet)) return null;
            try {
              const res = await withTimeout(
                publicClient.readContract({
                  address: contractAddress,
                  abi: BLOCK_BUILDER_ABI,
                  functionName: 'runs',
                  args: [BigInt(day), wallet as Hex],
                }),
                350,
                null
              );
              if (!res) return null;
              return {
                wallet: wallet.toLowerCase(),
                score: Number(res[0]),
                lines: Number(res[1]),
                epochs: Number(res[2]),
                logHash: res[3],
                submittedAt: Number(res[4]),
              };
            } catch {
              return null;
            }
          })
        );

        for (const item of onChainRuns) {
          if (item.status === 'fulfilled' && item.value && item.value.score > 0) {
            const oc = item.value;
            const submittedTime = oc.submittedAt > 0 ? oc.submittedAt * 1000 : Date.now();
            const durationMs = 240000;
            const minutes = Math.floor(durationMs / 60000);
            const seconds = Math.floor((durationMs % 60000) / 1000);

            liveEntries.push({
              rank: 0,
              wallet: oc.wallet,
              value: oc.score,
              lines: oc.lines,
              pieces: 100,
              durationMs,
              submittedAt: new Date(submittedTime).toISOString(),
              proofUrl: `${explorerBase}/address/${oc.wallet}`,
              verified: true,
              details: `${oc.lines} lines · 100 pieces · ${minutes}m ${String(seconds).padStart(2, '0')}s`,
              isMe: true,
            });

            // Cache to DB so subsequent calls in this lambda have it
            try {
              await upsertCompletedRun({
                player: oc.wallet,
                day,
                submittedAt: submittedTime,
                score: oc.score,
                lines: oc.lines,
                epochs: oc.epochs,
                logHash: oc.logHash,
              });
            } catch {}
          }
        }
      }

      // Rank real player runs only
      const ranked = sortAndAssignRanks(liveEntries).map((e) => ({
        ...e,
        isMe: candidateWallets.has(e.wallet.toLowerCase()),
      }));

      // Find user entry if connected wallet specified
      let me: LeaderboardEntry | undefined;
      if (candidateWallets.size > 0) {
        me = ranked.find((e) => candidateWallets.has(e.wallet.toLowerCase()));
        if (me) {
          me = { ...me, isMe: true };
        }
      }

      const page: LeaderboardPage = {
        tab: 'today',
        dayNumber: day,
        totalPlayers: ranked.length,
        label: `Daily 100 · No. ${day}`,
        title: 'The tower',
        unit: 'Score',
        entries: ranked,
        me,
        resetsAt: getNextUtcMidnight(),
      };

      return NextResponse.json(page);
    }

    if (tab === 'all') {
      const dbAllTime = await getAllTimeLeaderboard();
      const liveAllEntries: LeaderboardEntry[] = dbAllTime
        .filter((r) => isValidPlayerWallet(r.player))
        .map((r) => {
          const isUser = candidateWallets.has(r.player.toLowerCase());
          return {
            rank: 0,
            wallet: r.player,
            value: r.score ?? 0,
            dayNumber: r.day,
            submittedAt: r.submitted_at ? new Date(r.submitted_at).toISOString() : new Date().toISOString(),
            proofUrl: r.tx_hash ? `${explorerBase}/tx/${r.tx_hash}` : `${explorerBase}/address/${r.player}`,
            verified: true,
            details: `Set on day No. ${r.day}`,
            isMe: isUser,
          };
        });

      // Check on-chain if user not present in DB
      if (candidateWallets.size > 0 && !liveAllEntries.some((e) => candidateWallets.has(e.wallet.toLowerCase()))) {
        const onChainRuns = await Promise.allSettled(
          Array.from(candidateWallets).map(async (wallet) => {
            if (!isValidPlayerWallet(wallet)) return null;
            try {
              const res = await withTimeout(
                publicClient.readContract({
                  address: contractAddress,
                  abi: BLOCK_BUILDER_ABI,
                  functionName: 'runs',
                  args: [BigInt(day), wallet as Hex],
                }),
                350,
                null
              );
              if (!res) return null;
              return {
                wallet: wallet.toLowerCase(),
                score: Number(res[0]),
                lines: Number(res[1]),
                submittedAt: Number(res[4]),
              };
            } catch {
              return null;
            }
          })
        );

        for (const item of onChainRuns) {
          if (item.status === 'fulfilled' && item.value && item.value.score > 0) {
            const oc = item.value;
            const submittedTime = oc.submittedAt > 0 ? oc.submittedAt * 1000 : Date.now();
            liveAllEntries.push({
              rank: 0,
              wallet: oc.wallet,
              value: oc.score,
              dayNumber: day,
              submittedAt: new Date(submittedTime).toISOString(),
              proofUrl: `${explorerBase}/address/${oc.wallet}`,
              verified: true,
              details: `Set on day No. ${day}`,
              isMe: true,
            });
          }
        }
      }

      const ranked = sortAndAssignRanks(liveAllEntries).map((e) => ({
        ...e,
        isMe: candidateWallets.has(e.wallet.toLowerCase()),
      }));

      let me: LeaderboardEntry | undefined;
      if (candidateWallets.size > 0) {
        me = ranked.find((e) => candidateWallets.has(e.wallet.toLowerCase()));
        if (me) {
          me = { ...me, isMe: true };
        }
      }

      const page: LeaderboardPage = {
        tab: 'all',
        dayNumber: day,
        totalPlayers: ranked.length,
        label: `Daily 100 · All time`,
        title: 'The tower',
        unit: 'Best score',
        entries: ranked,
        me,
        resetsAt: getNextUtcMidnight(),
      };

      return NextResponse.json(page);
    }

    // tab === 'streak'
    const dbStreaks = await getStreaksLeaderboard();
    const liveStreakEntries: LeaderboardEntry[] = dbStreaks
      .filter((r) => isValidPlayerWallet(r.player))
      .map((r) => {
        const isUser = candidateWallets.has(r.player.toLowerCase());
        return {
          rank: 0,
          wallet: r.player,
          value: r.streak,
          submittedAt: new Date().toISOString(),
          proofUrl: `${explorerBase}/address/${r.player}`,
          verified: true,
          details: `Played ${r.streak} consecutive ${r.streak === 1 ? 'day' : 'days'}`,
          isMe: isUser,
        };
      });

    // Check on-chain if user not present in DB
    if (candidateWallets.size > 0 && !liveStreakEntries.some((e) => candidateWallets.has(e.wallet.toLowerCase()))) {
      const onChainRuns = await Promise.allSettled(
        Array.from(candidateWallets).map(async (wallet) => {
          if (!isValidPlayerWallet(wallet)) return null;
          try {
            const res = await withTimeout(
              publicClient.readContract({
                address: contractAddress,
                abi: BLOCK_BUILDER_ABI,
                functionName: 'streaks',
                args: [wallet as Hex],
              }),
              350,
              null
            );
            if (!res) return null;
            return {
              wallet: wallet.toLowerCase(),
              streak: Number(res[0]),
              lastDay: Number(res[2]),
            };
          } catch {
            return null;
          }
        })
      );

      for (const item of onChainRuns) {
        if (item.status === 'fulfilled' && item.value && item.value.streak > 0) {
          const oc = item.value;
          liveStreakEntries.push({
            rank: 0,
            wallet: oc.wallet,
            value: oc.streak,
            submittedAt: new Date().toISOString(),
            proofUrl: `${explorerBase}/address/${oc.wallet}`,
            verified: true,
            details: `Played ${oc.streak} consecutive ${oc.streak === 1 ? 'day' : 'days'}`,
            isMe: true,
          });
        }
      }
    }

    const ranked = sortAndAssignRanks(liveStreakEntries).map((e) => ({
      ...e,
      isMe: candidateWallets.has(e.wallet.toLowerCase()),
    }));

    let me: LeaderboardEntry | undefined;
    if (candidateWallets.size > 0) {
      me = ranked.find((e) => candidateWallets.has(e.wallet.toLowerCase()));
      if (me) {
        me = { ...me, isMe: true };
      }
    }

    const page: LeaderboardPage = {
      tab: 'streak',
      dayNumber: day,
      totalPlayers: ranked.length,
      label: `Daily 100 · Streaks`,
      title: 'The tower',
      unit: 'Streak',
      entries: ranked,
      me,
      resetsAt: getNextUtcMidnight(),
    };

    return NextResponse.json(page);
  } catch (err: any) {
    console.error('Error fetching leaderboard:', err);
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 });
  }
}
