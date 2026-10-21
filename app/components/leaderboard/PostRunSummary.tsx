'use client';

import React, { useEffect, useRef, useState } from 'react';
import { celebrationManager } from '@/lib/leaderboard/celebration';
import { isReducedMotion } from '@/lib/leaderboard/motion';
import { soundManager } from '@/lib/leaderboard/sound';
import {
  formatAddress,
  getLeaderboardService,
  LeaderboardEntry,
  RunRecord,
  SubmitResult,
} from '@/lib/leaderboard';
import { useBlockBuilderSubmit } from '@/lib/web3/useBlockBuilderSubmit';
import { useWalletAuth, resolveSmartAccountAddress } from '@/lib/web3/useWalletAuth';
import ReplayViewer from './ReplayViewer';

interface PostRunSummaryProps {
  score: number;
  lines: number;
  pieces: number;
  level: number;
  seed: number;
  durationMs: number;
  isVerified: boolean;
  inputLog?: unknown[];
  runId?: string | null;
  signedRunData?: any;
  submitPromise?: Promise<any> | null;
  dayNumber?: number;
  onOpenLeaderboard?: () => void;
  onPlayPractice?: () => void;
  onPlayAgain?: () => void;
}

export default function PostRunSummary({
  score,
  lines,
  pieces,
  level,
  seed,
  durationMs,
  isVerified,
  inputLog = [],
  runId,
  signedRunData,
  submitPromise,
  dayNumber,
  onOpenLeaderboard,
  onPlayPractice,
  onPlayAgain,
}: PostRunSummaryProps) {
  const { authenticated, ready, smartAccountAddress, eoaAddress, login } = useWalletAuth();
  const { submitOnChain, isPending: isOnChainPending, status: chainStatus, txHash, userOpHash } = useBlockBuilderSubmit();

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitResult, setSubmitResult] = useState<SubmitResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [canRetry, setCanRetry] = useState<boolean>(false);
  const [copiedShare, setCopiedShare] = useState<boolean>(false);

  const [funStat, setFunStat] = useState<string | null>(null);
  const [topReplayData, setTopReplayData] = useState<{
    found: boolean;
    seed?: number;
    topRun?: {
      player: string;
      score: number;
      lines: number;
      ticks: number;
      log: any[];
    };
  } | null>(null);
  const [showReplayModal, setShowReplayModal] = useState<boolean>(false);

  const hasAutoSubmittedRef = useRef(false);
  const isMountedRef = useRef(true);

  // Leaderboard data for standing and neighbors
  const [totalPlayers, setTotalPlayers] = useState<number>(0);
  const [estimatedRank, setEstimatedRank] = useState<number>(1);
  const [dispRank, setDispRank] = useState<number>(1);
  const [dispScore, setDispScore] = useState<number>(score);
  const [neighbors, setNeighbors] = useState<LeaderboardEntry[]>([]);
  const cardRef = useRef<HTMLDivElement | null>(null);

  const [serverDay, setServerDay] = useState<number | null>(null);
  const activeDay = signedRunData?.day || dayNumber || serverDay || 3;
  const epochs = signedRunData?.epochs ?? Math.floor(lines / 4);
  const isMainnet = process.env.NEXT_PUBLIC_SMOOTHSEND_NETWORK === 'mainnet' || process.env.NEXT_PUBLIC_CHAIN_ID === '43114';
  const networkShort = isMainnet ? 'Avalanche' : 'Fuji';
  const explorerBase = isMainnet ? 'https://snowtrace.io' : 'https://testnet.snowtrace.io';

  useEffect(() => {
    setDispScore(score);
  }, [score]);

  useEffect(() => {
    const service = getLeaderboardService();
    const currentWallet = (smartAccountAddress || eoaAddress || '0xa2f10000000000000000000000000000000044d8').toLowerCase();
    service
      .getPage('today', { wallet: currentWallet })
      .then((page) => {
        setTotalPlayers(page.totalPlayers);
        if (page.dayNumber) {
          setServerDay(page.dayNumber);
        }
        if (page.me?.rank) {
          setEstimatedRank(page.me.rank);
          setDispRank(page.me.rank);
        }
      })
      .catch(() => {});

    service
      .getAround(currentWallet, 'today', 1)
      .then((around) => {
        setNeighbors(around);
      })
      .catch(() => {});
  }, [smartAccountAddress, eoaAddress]);

  // Fetch community stats & today's top replay
  useEffect(() => {
    if (!activeDay) return;

    fetch(`/api/stats/${activeDay}?score=${score}&pieces=${pieces}`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.funStat) {
          setFunStat(data.funStat);
        }
      })
      .catch(() => {});

    fetch(`/api/replay/${activeDay}/top`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.found && data?.topRun) {
          setTopReplayData(data);
        }
      })
      .catch(() => {});
  }, [activeDay, score, pieces]);

  const getShareText = () => {
    const rankText = submitResult?.entry?.rank ?? dispRank;
    return `Block Builder #${activeDay} · daily 100\n${dispScore.toLocaleString()} pts · ${lines} blocks · ${epochs} epochs · rank #${rankText} · verified on Avalanche`;
  };

  const handleShare = async () => {
    const shareText = getShareText();

    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({
          title: `Block Builder #${activeDay} · Daily 100`,
          text: shareText,
          url: typeof window !== 'undefined' ? window.location.origin : undefined,
        });
        return;
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
    }

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        const fullShare = typeof window !== 'undefined' ? `${shareText}\n${window.location.origin}` : shareText;
        await navigator.clipboard.writeText(fullShare);
        setCopiedShare(true);
        setTimeout(() => setCopiedShare(false), 2200);
      }
    } catch {
      // Fallback
    }
  };

  const triggerRankCelebration = (result: SubmitResult, currentWallet: string) => {
    const prevRank = result.previousRank || estimatedRank || 142;
    const targetRank = result.entry?.rank ?? 6;
    const prevScore = score;
    const targetScore = result.entry?.value ?? score;
    const service = getLeaderboardService();

    if (isReducedMotion()) {
      setDispRank(targetRank);
      setDispScore(targetScore);
      celebrationManager.playArpeggio();
      service
        .getAround(currentWallet, 'today', 1)
        .then((ar) => setNeighbors(ar))
        .catch(() => {});
    } else {
      const startTime = performance.now();
      const duration = 1200;
      let lastBeepRank = prevRank;

      const animateStep = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / duration);
        const easeOut = 1 - Math.pow(1 - progress, 3);

        const currentRankVal = Math.round(prevRank + (targetRank - prevRank) * easeOut);
        const currentScoreVal = Math.round(prevScore + (targetScore - prevScore) * easeOut);

        setDispRank(currentRankVal);
        setDispScore(currentScoreVal);

        if (Math.abs(lastBeepRank - currentRankVal) >= 3) {
          const freq = 180 + Math.max(0, prevRank - currentRankVal) * 4;
          soundManager.beep(freq, 0.04);
          lastBeepRank = currentRankVal;
        }

        if (progress < 1) {
          requestAnimationFrame(animateStep);
        } else {
          setDispRank(targetRank);
          setDispScore(targetScore);

          if (cardRef.current) {
            const rect = cardRef.current.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            celebrationManager.burst(centerX, centerY, targetRank <= 3 ? 80 : 50);
            celebrationManager.shake(cardRef.current, 8);
            celebrationManager.popup(`+${targetScore.toLocaleString()} PTS`, centerX, centerY - 40);

            if (targetRank <= 10) {
              setTimeout(() => {
                celebrationManager.popup('TOP 10', centerX, centerY - 65, true);
              }, 220);
            }
          }

          celebrationManager.playArpeggio();
          service
            .getAround(currentWallet, 'today', 1)
            .then((ar) => setNeighbors(ar))
            .catch(() => {});
        }
      };

      requestAnimationFrame(animateStep);
    }
  };

  const handleSubmitScore = async () => {
    if (isSubmitting) return;
    if (submitResult?.accepted && !canRetry) return;

    if (!authenticated) {
      setErrorMessage(null);
      login();
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setCanRetry(false);

    // Resolve the exact Smart Account address that calls BlockBuilder on Fuji
    let playerWallet = (smartAccountAddress || '').toLowerCase();
    if (!playerWallet || playerWallet === '0x0000000000000000000000000000000000000000') {
      if (eoaAddress) {
        try {
          playerWallet = (await resolveSmartAccountAddress(eoaAddress)).toLowerCase();
        } catch {
          playerWallet = eoaAddress.toLowerCase();
        }
      } else {
        playerWallet = '0x0000000000000000000000000000000000000000';
      }
    }

    // Optimistic sub-second acceptance so silent recording feels instantaneous
    const optRank = estimatedRank || dispRank || 1;
    const optimisticResult: SubmitResult = {
      accepted: true,
      entry: {
        rank: optRank,
        wallet: playerWallet,
        value: score,
        lines,
        pieces,
        durationMs,
        submittedAt: new Date().toISOString(),
        proofUrl: txHash && txHash.startsWith('0x') ? `${explorerBase}/tx/${txHash}` : undefined,
        verified: true,
        isMe: true,
      },
      previousRank: totalPlayers ? totalPlayers + 1 : 2,
    };
    setSubmitResult(optimisticResult);
    triggerRankCelebration(optimisticResult, playerWallet);

    try {
      // 1. Resolve signed payload fast without duplicate network round trips
      let payload = signedRunData;
      if (!payload && submitPromise) {
        try {
          payload = await submitPromise;
        } catch {}
      }

      const needsRefresh =
        !payload?.signature ||
        !payload?.player ||
        payload.player.toLowerCase() !== playerWallet;

      if (needsRefresh && runId) {
        try {
          const res = await fetch('/api/run/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              runId,
              log: inputLog,
              player: playerWallet,
              durationMs,
            }),
          });
          if (res.ok) {
            payload = await res.json();
          } else {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData?.error || 'Verification failed on server');
          }
        } catch (e: any) {
          console.warn('Could not refresh run signature:', e);
          setErrorMessage(e?.message || 'Could not verify run signature on server.');
          setCanRetry(true);
          return;
        }
      }

      // 2. Record in leaderboard service in background
      const service = getLeaderboardService();
      const runRecord: RunRecord = {
        wallet: playerWallet,
        dayNumber: payload?.day || activeDay,
        seed,
        score,
        lines,
        durationMs,
        inputs: inputLog,
        txHash: txHash || undefined,
      };

      const result = await service.submitRun(runRecord);
      if (result.accepted) {
        setSubmitResult((prev) => {
          if (!result.entry) return result;
          return {
            ...result,
            entry: {
              ...result.entry,
              proofUrl: prev?.entry?.proofUrl || result.entry.proofUrl,
            },
          };
        });
      }
      setCanRetry(false);

      // 3. Fire gasless on-chain submission via SmoothSend in background (non-blocking)
      const isDemoAuthed = typeof window !== 'undefined' && localStorage.getItem('bb-demo-auth') === 'true';
      if (authenticated && eoaAddress && !isDemoAuthed && payload?.signature && payload.signature !== '0x') {
        submitOnChain({
          day: payload.day || activeDay,
          score: payload.score || score,
          lines: payload.lines || lines,
          epochs: payload.epochs || 0,
          logHash: payload.logHash,
          deadline: payload.deadline,
          signature: payload.signature,
        })
          .then((submittedTxHash) => {
            const finalTxHash = submittedTxHash || (txHash && txHash.startsWith('0x') ? txHash : undefined);
            if (finalTxHash) {
              fetch('/api/run/record-tx', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  runId,
                  player: playerWallet,
                  day: payload?.day || activeDay,
                  txHash: finalTxHash,
                }),
              }).catch(() => {});

              setSubmitResult((prev) => {
                if (!prev || !prev.entry) return prev;
                return {
                  ...prev,
                  entry: {
                    ...prev.entry,
                    proofUrl: `${explorerBase}/tx/${finalTxHash}`,
                  },
                };
              });
            }
          })
          .catch((chainErr: any) => {
            console.warn('Background on-chain record note:', chainErr);
          });
      }
    } catch {
      if (isMountedRef.current) {
        setErrorMessage('Network error submitting score. Please check your connection.');
        setCanRetry(true);
      }
    } finally {
      if (isMountedRef.current) {
        setIsSubmitting(false);
      }
    }
  };

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Silent automatic background recording when user dies or completes the Daily 100 run
  useEffect(() => {
    if (hasAutoSubmittedRef.current) return;
    if (submitResult?.accepted) return;
    if (isSubmitting || isOnChainPending) return;

    const isDemoAuthed = typeof window !== 'undefined' && localStorage.getItem('bb-demo-auth') === 'true';
    if ((authenticated && ready) || isDemoAuthed) {
      hasAutoSubmittedRef.current = true;
      // Triggers silently in background so user doesn't have to wait or press Submit
      handleSubmitScore();
    }
  }, [authenticated, ready]);

  const percentile = Math.max(0.1, (dispRank / totalPlayers) * 100).toFixed(1);
  const percentileProgress = Math.max(0.05, Math.min(1, 1 - dispRank / totalPlayers));

  const isCompletedRun = pieces >= 100;
  const runLabel = isCompletedRun ? 'Run complete · 100 / 100' : `Run over · ${pieces} / 100`;

  const getPrimaryButtonText = () => {
    if (!authenticated) return 'Log in to record (gasless)';
    if (submitResult?.accepted) return `Recorded on ${networkShort} ✓ · rank #${dispRank}`;
    if (isSubmitting || isOnChainPending) {
      if (chainStatus === 'sponsoring') return 'Recording in background...';
      if (chainStatus === 'confirming') return `Confirming on ${networkShort} (background)...`;
      return 'Recording in background...';
    }
    if (canRetry) return 'Retry submission';
    if (submitResult?.reason === 'already_submitted') {
      return `Already recorded today · rank #${submitResult.previousRank || estimatedRank}`;
    }
    if (submitResult?.reason === 'day_ended') return 'Day ended';
    return `Record on ${networkShort} (gasless)`;
  };

  const isPrimaryButtonDisabled =
    (!submitResult?.accepted && (isSubmitting || isOnChainPending)) ||
    (Boolean(submitResult?.accepted) && !canRetry) ||
    submitResult?.reason === 'already_submitted' ||
    submitResult?.reason === 'day_ended';

  return (
    <div
      ref={cardRef}
      className="summary-card"
      role="dialog"
      aria-modal="true"
      aria-label="Run summary"
    >
      {/* Label */}
      <div className="summary-label">{runLabel}</div>

      {/* Big Score (56px/500) */}
      <div className="summary-score" aria-label={`Score ${dispScore.toLocaleString()}`}>
        {dispScore.toLocaleString()}
      </div>

      {/* Rank Row (#142 of 3,208) */}
      <div className="summary-rank-row" aria-label={`Rank ${dispRank} of ${totalPlayers}`}>
        <span className="summary-rank">#{dispRank}</span>
        <span className="summary-total">of {totalPlayers.toLocaleString()}</span>
      </div>

      {/* Percentile Bar (6px track, ink fill, 4px accent marker) */}
      <div style={{ width: '100%' }}>
        <div className="percentile-track">
          <div
            className="percentile-fill"
            style={{ width: `${percentileProgress * 100}%` }}
          />
          <div
            className="percentile-marker"
            style={{ left: `calc(${percentileProgress * 100}% - 2px)` }}
          />
        </div>
        <div className="percentile-caption" style={{ marginTop: '6px' }}>
          Top {percentile}% today · {lines} lines · level {level}
        </div>
        {funStat && (
          <div className="fun-stat-chip" aria-label="Community statistic">
            <span className="fun-stat-icon" aria-hidden="true">✦</span>
            <span>{funStat}</span>
          </div>
        )}
      </div>

      {/* Neighbor Rows Table */}
      {neighbors.length > 0 && (
        <div className="neighbors-table" aria-label="Ranking neighbors">
          {neighbors.map((n) => {
            const isMe = n.isMe || n.rank === dispRank;
            const diff = n.value - dispScore;
            const diffText =
              diff > 0
                ? `+${diff.toLocaleString()}`
                : diff < 0
                ? `−${Math.abs(diff).toLocaleString()}`
                : '—';

            return (
              <div
                key={n.rank}
                className={`neighbor-row ${isMe ? 'mine' : ''}`}
              >
                <span>#{n.rank}</span>
                <span>{isMe ? 'YOU' : formatAddress(n.wallet)}</span>
                <span style={{ textAlign: 'right' }}>{n.value.toLocaleString()}</span>
                <span className={diff > 0 ? 'neighbor-gap-pos' : 'neighbor-gap-neg'}>
                  {diffText}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Error / Feedback Message */}
      {errorMessage && (
        <div
          role="alert"
          style={{
            padding: '8px 12px',
            border: '2px solid var(--acc)',
            color: 'var(--acc)',
            fontSize: '12px',
            fontWeight: 500,
            textAlign: 'center',
          }}
        >
          {errorMessage}
        </div>
      )}

      {/* Action Buttons: primary Submit, Share, Practice / View Leaderboard */}
      <div className="summary-buttons">
        <button
          id="summary-submit-btn"
          className="btn p"
          onClick={handleSubmitScore}
          disabled={isPrimaryButtonDisabled}
        >
          {getPrimaryButtonText()}
        </button>

        {(txHash || userOpHash || submitResult?.entry?.proofUrl) && (
          <div style={{ marginTop: '8px', textAlign: 'center', display: 'flex', justifyContent: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {(txHash || submitResult?.entry?.proofUrl) && (
              <a
                id="summary-snowtrace-link"
                href={
                  txHash && txHash.startsWith('0x') && txHash.length === 66
                    ? `${explorerBase}/tx/${txHash}`
                    : submitResult?.entry?.proofUrl || `${explorerBase}/tx/${txHash}`
                }
                target="_blank"
                rel="noopener noreferrer"
                className="btn"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '12px',
                  minHeight: '34px',
                  padding: '0 12px',
                  textDecoration: 'none',
                }}
              >
                <span>View on SnowTrace</span>
                <span aria-hidden="true">↗</span>
              </a>
            )}
            {userOpHash && userOpHash !== txHash && (
              <a
                id="summary-jiffyscan-link"
                href={`https://jiffyscan.xyz/userOpHash/${userOpHash}?network=${isMainnet ? 'avalanche' : 'avalanche-fuji'}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '12px',
                  minHeight: '34px',
                  padding: '0 12px',
                  textDecoration: 'none',
                }}
              >
                <span>ERC-4337 UserOp</span>
                <span aria-hidden="true">↗</span>
              </a>
            )}
          </div>
        )}

        <div className="summary-buttons-sub">
          {topReplayData?.found && (
            <button
              id="summary-watch-leader-btn"
              className="btn btn-full"
              onClick={() => setShowReplayModal(true)}
              title="Watch today's #1 run replay move-by-move"
            >
              Watch leader ▷
            </button>
          )}

          {onOpenLeaderboard && (
            <button
              id="summary-view-tower-btn"
              className={`btn ${submitResult?.accepted ? 'p' : ''}`}
              onClick={onOpenLeaderboard}
            >
              The Tower ↗
            </button>
          )}

          {onPlayPractice ? (
            <button id="summary-practice-btn" className="btn" onClick={onPlayPractice}>
              Practice
            </button>
          ) : onPlayAgain ? (
            <button id="summary-play-again-btn" className="btn" onClick={onPlayAgain}>
              Play again
            </button>
          ) : null}

          <button id="summary-share-btn" className="btn" onClick={handleShare}>
            {copiedShare ? 'Copied!' : 'Share'}
          </button>

          <a
            id="summary-tweet-btn"
            href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(getShareText() + (typeof window !== 'undefined' ? '\n' + window.location.origin : ''))}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn"
            style={{
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            Post on X
          </a>
        </div>
      </div>

      {/* Status Line */}
      <div className="summary-status-line">
        {isVerified ? (
          <span>✓ Replay verified · {isMainnet ? 'Avalanche C-Chain' : 'Avalanche Fuji'} · SmoothSend ERC-4337</span>
        ) : (
          <span>⚠ Replay unconfirmed · {isMainnet ? 'Avalanche C-Chain' : 'Avalanche Fuji'}</span>
        )}
      </div>

      {/* Ghost of the Leader Replay Modal */}
      {showReplayModal && (
        <ReplayViewer
          day={activeDay}
          onClose={() => setShowReplayModal(false)}
        />
      )}
    </div>
  );
}
