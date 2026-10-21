'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import SubTabs from './SubTabs';
import PodiumTower from './PodiumTower';
import LeaderboardList from './LeaderboardList';
import PinnedMeRow from './PinnedMeRow';
import {
  LEADERBOARD_CONFIG,
  LeaderboardEntry,
  LeaderboardTab,
  useLeaderboard,
} from '@/lib/leaderboard';
import { celebrationManager } from '@/lib/leaderboard/celebration';
import { flipList, isReducedMotion } from '@/lib/leaderboard/motion';
import { soundManager } from '@/lib/leaderboard/sound';
import { useWalletAuth } from '@/lib/web3';
import ReplayViewer from './ReplayViewer';
import ProofPanel from './ProofPanel';

interface LeaderboardViewProps {
  onSwitchToDaily?: () => void;
  isActive?: boolean;
}

export default function LeaderboardView({ onSwitchToDaily, isActive = true }: LeaderboardViewProps) {
  const [activeTab, setActiveTab] = useState<LeaderboardTab>('today');
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isSoundEnabled, setIsSoundEnabled] = useState<boolean>(() =>
    soundManager.isEnabled()
  );
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [showLeaderReplay, setShowLeaderReplay] = useState<boolean>(false);
  const [showProofPanel, setShowProofPanel] = useState<boolean>(false);

  // Web3 Auth connection
  const { authenticated, smartAccountAddress, eoaAddress, login } = useWalletAuth();
  const cachedScw = typeof window !== 'undefined' ? localStorage.getItem('bb_last_scw') : null;
  const lastRun = typeof window !== 'undefined' ? (() => {
    try {
      return JSON.parse(localStorage.getItem('bb_last_run') || 'null');
    } catch { return null; }
  })() : null;
  const lastRunPlayer = lastRun?.player ? String(lastRun.player).toLowerCase() : null;

  const playerWallets = Array.from(
    new Set([smartAccountAddress, eoaAddress, cachedScw, lastRunPlayer].filter(Boolean).map((w) => w!.toLowerCase()))
  ).join(',');
  const playerWallet = (smartAccountAddress || cachedScw || lastRunPlayer || eoaAddress || '').toLowerCase();
  const isWalletConnected = authenticated || Boolean(cachedScw) || Boolean(lastRunPlayer) || Boolean(eoaAddress);

  // Rank-climb states
  const [climbingMe, setClimbingMe] = useState<{ rank: number; score: number } | null>(null);
  const [climbDone, setClimbDone] = useState<boolean>(false);
  const [liveAnnouncement, setLiveAnnouncement] = useState<string>('');

  const toggleSound = () => {
    const next = soundManager.toggle();
    setIsSoundEnabled(next);
  };

  // Sync with global sound changes
  useEffect(() => {
    const handleSoundChange = (e: Event) => {
      const custom = e as CustomEvent<boolean>;
      setIsSoundEnabled(custom.detail);
    };
    window.addEventListener('bb-sound-change', handleSoundChange);
    return () => window.removeEventListener('bb-sound-change', handleSoundChange);
  }, []);

  // Online / Offline tracking
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    if (typeof window !== 'undefined') {
      setIsOnline(navigator.onLine);
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      }
    };
  }, []);

  // Leaderboard service integration (disabled when tab is not actively viewed)
  const { page, status, error, refetch, submitRun } = useLeaderboard(
    activeTab,
    playerWallets || playerWallet,
    undefined,
    LEADERBOARD_CONFIG,
    isActive
  );

  const handleSimulateSubmit = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setSubmissionError(null);
    setClimbDone(false);

    try {
      const prevRank = page?.me?.rank || 142;
      const prevScore = page?.me?.value || 28640;
      const targetScore = 40010;

      const result = await submitRun({
        wallet: playerWallet || '0xa2f10000000000000000000000000000000044d8',
        dayNumber: page?.dayNumber || 104,
        seed: 987654321,
        score: targetScore,
        lines: 31,
      });

      if (!result.accepted) {
        if (result.reason === 'already_submitted') {
          setSubmissionError(`Already submitted today · rank #${result.previousRank || prevRank}`);
        } else if (result.reason === 'verification_failed') {
          setSubmissionError('Replay verification failed. Score could not be confirmed.');
        } else if (result.reason === 'day_ended') {
          setSubmissionError("This day's competition has ended. Resets at 00:00 UTC.");
        } else {
          setSubmissionError('Network error submitting score. Please check your connection.');
        }
        return;
      }

      const targetRank = result.entry?.rank || 6;
      if (targetRank >= prevRank) {
        // Skip climb if rank did not improve
        return;
      }

      if (isReducedMotion()) {
        celebrationManager.playArpeggio();
        setClimbDone(true);
        return;
      }

      // Step 1: Pinned row score & rank counting over 1300ms ease-out cubic
      const startTime = performance.now();
      const duration = 1300;
      let lastBeepRank = prevRank;

      const animateStep = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / duration);
        const easeOut = 1 - Math.pow(1 - progress, 3);

        const currentRank = Math.round(prevRank + (targetRank - prevRank) * easeOut);
        const currentScore = Math.round(prevScore + (targetScore - prevScore) * easeOut);

        setClimbingMe({ rank: currentRank, score: currentScore });

        // Blip every 3rd rank change: 180 + (previousRank - rank)*4 Hz
        if (Math.abs(lastBeepRank - currentRank) >= 3) {
          const freq = 180 + Math.max(0, prevRank - currentRank) * 4;
          soundManager.beep(freq, 0.04);
          lastBeepRank = currentRank;
        }

        if (progress < 1) {
          requestAnimationFrame(animateStep);
        } else {
          // Landing moment!
          setClimbingMe({ rank: targetRank, score: targetScore });

          // Step 2: Insert row using FLIP
          const listEl = document.getElementById('list');
          if (listEl) {
            flipList(
              listEl,
              () => {
                setClimbDone(true);
              },
              'data-rank'
            );
          } else {
            setClimbDone(true);
          }

          // Step 3 & 4: 50 square particles, shake 8px, popups, arpeggio
          requestAnimationFrame(() => {
            const rowEl = document.querySelector(`.rw[data-rank="${targetRank}"]`) as HTMLElement | null;
            const cardEl = document.getElementById('card') || document.body;
            let centerX = window.innerWidth / 2;
            let centerY = window.innerHeight / 2;

            if (rowEl) {
              const rect = rowEl.getBoundingClientRect();
              centerX = rect.left + rect.width / 2;
              centerY = rect.top + rect.height / 2;
            }

            celebrationManager.burst(centerX, centerY, 50);
            celebrationManager.shake(cardEl, 8);

            const places = prevRank - targetRank;
            celebrationManager.popup(`+${places} places`, centerX, centerY - 20);

            if (targetRank <= 10) {
              setTimeout(() => {
                celebrationManager.popup('TOP 10', centerX, centerY - 65, true);
              }, 220);
            }

            // Step 4: Rising 4-note arpeggio
            celebrationManager.playArpeggio();

            // Announce final rank result to screen readers per Section 11
            setLiveAnnouncement(
              `Rank climb complete. Your new rank is #${targetRank} with ${targetScore.toLocaleString()} points. +${places} places.${
                targetRank <= 10 ? ' Top 10.' : ''
              }`
            );
          });
        }
      };

      requestAnimationFrame(animateStep);
    } catch {
      setSubmissionError('Network error submitting score. Please check your connection.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getPlayerCountText = () => {
    if (!page) return '';
    if (page.totalPlayers === 0) return '0 players';
    if (page.tab === 'streak') {
      return `${page.totalPlayers.toLocaleString()} ${page.totalPlayers === 1 ? 'active streak' : 'active streaks'}`;
    }
    return `${page.totalPlayers.toLocaleString()} ${page.totalPlayers === 1 ? 'player' : 'players'}`;
  };

  return (
    <div id="card" className="leaderboard-card">
      {/* Heading Row */}
      <div className="hd">
        <div className="hd-left">
          <div className="hd-label-row">
            <span className="l">{page?.label || 'Daily 100 · The tower'}</span>
            {LEADERBOARD_CONFIG.useMock && (
              <span className="badge-demo" title="Mock dataset active until on-chain backend is deployed">
                Demo data
              </span>
            )}
          </div>
          <h1 className="big" style={{ margin: 0 }}>
            {page?.title || 'The tower'}
          </h1>
        </div>
        <div className="np">{getPlayerCountText()}</div>
      </div>

      {/* Sub-Tabs (Today / All time / Streaks) with Sliding Indicator */}
      <SubTabs
        activeTab={activeTab}
        onChange={(tab) => {
          setActiveTab(tab);
          setClimbDone(false);
          setClimbingMe(null);
          setLiveAnnouncement(
            `Viewing ${tab === 'all' ? 'All time' : tab === 'streak' ? 'Streaks' : 'Today'} leaderboard`
          );
        }}
        onPlaySound={() => soundManager.playTabSwitch()}
      />

      {/* Controls Row */}
      <div className="ctl" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button
          id="leaderboard-watch-leader-btn"
          className="btn"
          onClick={() => setShowLeaderReplay(true)}
          title="Watch today's #1 player replay move-by-move"
        >
          Watch leader ▷
        </button>
        <button
          id="leaderboard-seed-proof-btn"
          className="btn"
          onClick={() => setShowProofPanel(true)}
          title="View on-chain commit-reveal seed proofs (COMMON §6)"
        >
          Seed proof ⚿
        </button>
        <button
          id="leaderboard-sound-btn"
          className="btn"
          aria-pressed={isSoundEnabled}
          onClick={toggleSound}
        >
          {isSoundEnabled ? 'Sound on' : 'Sound off'}
        </button>
      </div>

      {/* Submission Error Banner */}
      {submissionError && (
        <div
          role="alert"
          style={{
            padding: '8px 14px',
            border: '2px solid var(--acc)',
            color: 'var(--acc)',
            fontSize: '12px',
            fontWeight: 500,
            marginTop: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
          }}
        >
          <span>{submissionError}</span>
          <button
            className="btn"
            style={{ minHeight: '36px', padding: '2px 10px', fontSize: '11px' }}
            onClick={() => setSubmissionError(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Offline Alert */}
      {!isOnline && (
        <div
          style={{
            padding: '8px 14px',
            border: '2px solid var(--acc)',
            color: 'var(--acc)',
            fontSize: '12px',
            fontWeight: 700,
            marginTop: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span>⚠</span>
          <span>You&apos;re offline. Showing last cached data.</span>
        </div>
      )}

      {/* State Rendering: Loading */}
      {status === 'loading' && (
        <div aria-busy="true" aria-label="Loading rankings">
          {/* Skeleton Podium Columns: Rank 2 (4 tiles), Rank 1 (5 tiles), Rank 3 (3 tiles) */}
          <div className="skeleton-podium" id="pod" style={{ opacity: 0.9 }}>
            <div className="skeleton-col" style={{ height: '220px' }}>
              <span className="rn" style={{ color: 'var(--mute)' }}>2</span>
              <span className="w">···</span>
              <div className="tw" style={{ marginTop: '8px', width: '100%' }}>
                {[0, 1, 2, 3].map((k) => (
                  <div key={k} className="skeleton-col-tile" />
                ))}
              </div>
            </div>
            <div className="skeleton-col" style={{ height: '280px', borderColor: 'var(--acc)' }}>
              <span className="rn" style={{ color: 'var(--acc)' }}>1</span>
              <span className="w">···</span>
              <div className="tw" style={{ marginTop: '8px', width: '100%' }}>
                {[0, 1, 2, 3, 4].map((k) => (
                  <div key={k} className="skeleton-col-tile" style={{ borderColor: 'var(--acc)' }} />
                ))}
              </div>
            </div>
            <div className="skeleton-col" style={{ height: '170px' }}>
              <span className="rn" style={{ color: 'var(--mute)' }}>3</span>
              <span className="w">···</span>
              <div className="tw" style={{ marginTop: '8px', width: '100%' }}>
                {[0, 1, 2].map((k) => (
                  <div key={k} className="skeleton-col-tile" />
                ))}
              </div>
            </div>
          </div>

          {/* Table Header matching real table */}
          <div className="row rh">
            <span>RANK</span>
            <span>PLAYER</span>
            <span style={{ textAlign: 'right' }}>SCORE</span>
            <span style={{ textAlign: 'right' }}>PROOF</span>
          </div>

          {/* Skeleton Hairline Rows */}
          <div className="skeleton-rows" id="list">
            {[4, 5, 6, 7, 8].map((idx) => (
              <div key={idx} className="skeleton-row">
                <span className="rk" style={{ color: 'var(--mute)', fontSize: '13px' }}>{idx}</span>
                <div className="skeleton-line" style={{ width: '120px' }} />
                <div className="skeleton-line" style={{ width: '45px', marginLeft: 'auto' }} />
                <span className="pf" style={{ opacity: 0.25 }}>↗</span>
              </div>
            ))}
          </div>

          {/* Skeleton Pinned Row */}
          <div id="mew">
            <div className="gap" aria-hidden="true">···</div>
            <div className="me skeleton-me" role="status">
              <span style={{ color: 'var(--mute)' }}>—</span>
              <div className="skeleton-line" style={{ width: '130px' }} />
              <div className="skeleton-line" style={{ width: '50px', marginLeft: 'auto' }} />
              <span className="pf" style={{ opacity: 0.25 }}>↗</span>
            </div>
          </div>
        </div>
      )}

      {/* State Rendering: Empty */}
      {status === 'empty' && (
        <div className="state-box">
          {/* Dashed Empty Podium */}
          <div className="skeleton-podium" style={{ margin: '8px 0', opacity: 0.6 }}>
            <div className="skeleton-col" style={{ height: '70%' }} />
            <div className="skeleton-col" style={{ height: '100%' }} />
            <div className="skeleton-col" style={{ height: '55%' }} />
          </div>
          <h2 className="state-title">No scores yet. Be the first.</h2>
          <p className="state-desc">
            The day just started. Play today&apos;s 100 pieces to place the first block on the tower.
          </p>
          <button
            className="btn p"
            onClick={onSwitchToDaily}
          >
            Play Daily 100
          </button>
        </div>
      )}

      {/* State Rendering: Error with stale data preserved */}
      {status === 'error' && page && (
        <div
          role="alert"
          style={{
            padding: '10px 14px',
            border: '2px solid var(--acc)',
            color: 'var(--acc)',
            fontSize: '12px',
            fontWeight: 500,
            marginTop: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
          }}
        >
          <span>Couldn&apos;t load latest rankings. Showing cached data.</span>
          <button
            className="btn"
            style={{ minHeight: '36px', padding: '0 12px', fontSize: '11px' }}
            onClick={() => refetch()}
          >
            Retry
          </button>
        </div>
      )}

      {/* State Rendering: Error without any cached data */}
      {status === 'error' && !page && (
        <div className="state-box">
          <h2 className="state-title">Couldn&apos;t load rankings.</h2>
          <p className="state-desc">
            {error?.message || 'Network request failed or rankings server is temporarily unreachable.'}
          </p>
          <button
            className="btn p"
            onClick={() => refetch()}
          >
            Retry
          </button>
        </div>
      )}

      {/* State Rendering: Ready or Stale data fallback */}
      {(status === 'ready' || (status === 'error' && page)) && page && (() => {
        // While counting climb animation, keep pinned row visible
        const candidateWalletList = (playerWallets || playerWallet)
          .toLowerCase()
          .split(',')
          .map((w) => w.trim())
          .filter(Boolean);
        const isUserVisibleInTop =
          (climbDone || !climbingMe) &&
          page.entries
            .slice(3, 10)
            .some(
              (e) =>
                e.isMe ||
                (Boolean(page.me) && e.wallet.toLowerCase() === page.me?.wallet.toLowerCase()) ||
                candidateWalletList.includes(e.wallet.toLowerCase())
            );

        // Find effective "me" entry (from page.me, or user entry in entries, or localStorage)
        const effectiveMe =
          page.me ||
          page.entries.find(
            (e) =>
              e.isMe ||
              (candidateWalletList.length > 0 && candidateWalletList.includes(e.wallet.toLowerCase()))
          );

        const resolvedMe: LeaderboardEntry | undefined = effectiveMe
          ? {
              ...effectiveMe,
              wallet: playerWallet || effectiveMe.wallet,
              isMe: true,
            }
          : undefined;

        return (
          <div id={`panel-${activeTab}`} role="tabpanel" aria-labelledby={`subtab-${activeTab}`}>
            {/* The Tower: Podium Ranks 2, 1, 3 */}
            <PodiumTower entries={page.entries} tab={activeTab} isActive={isActive} />

            {/* Rankings List for Ranks 4+ */}
            <LeaderboardList
              entries={page.entries}
              tab={activeTab}
              unit={page.unit}
              currentUserWallet={playerWallets || playerWallet || resolvedMe?.wallet}
            />

            {/* Pinned "You" Row (shown at bottom if player is not in visible top list) */}
            <PinnedMeRow
              me={resolvedMe}
              tab={activeTab}
              isUserInVisibleList={isUserVisibleInTop}
              isWalletConnected={isWalletConnected}
              climbingRank={climbingMe?.rank}
              climbingScore={climbingMe?.score}
              onSwitchToDaily={onSwitchToDaily}
              onConnectWallet={login}
            />

            {/* Footnote */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', margin: '14px 0 6px 0' }}>
              <p className="k" style={{ margin: 0 }}>
                Everyone gets the same pieces today. Ties go to the earlier submission. Hover a column or tap a row for details.
              </p>
              <button
                type="button"
                id="leaderboard-footnote-proof-btn"
                className="btn"
                style={{ minHeight: '30px', padding: '0 10px', fontSize: '11px', whiteSpace: 'nowrap' }}
                onClick={() => setShowProofPanel(true)}
              >
                Fairness proof panel ↗
              </button>
            </div>
          </div>
        );
      })()}

      {/* Screen Reader Live Region for Announcements (Section 11) */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {liveAnnouncement}
      </div>

      {/* Ghost of the Leader Replay Modal */}
      {showLeaderReplay && (
        <ReplayViewer
          day={page?.dayNumber || 1}
          onClose={() => setShowLeaderReplay(false)}
        />
      )}

      {/* Cryptographic Seed Commit-Reveal Proof Panel (COMMON §6) */}
      <ProofPanel
        isOpen={showProofPanel}
        onClose={() => setShowProofPanel(false)}
      />
    </div>
  );
}
