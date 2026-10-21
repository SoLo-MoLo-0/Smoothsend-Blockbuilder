'use client';

import React from 'react';
import { formatAddress, formatValue, LeaderboardEntry, LeaderboardTab } from '@/lib/leaderboard';

interface PinnedMeRowProps {
  me?: LeaderboardEntry;
  tab: LeaderboardTab;
  isUserInVisibleList: boolean;
  isWalletConnected?: boolean;
  climbingRank?: number | null;
  climbingScore?: number | null;
  onSwitchToDaily?: () => void;
  onConnectWallet?: () => void;
}

export default function PinnedMeRow({
  me,
  tab,
  isUserInVisibleList,
  isWalletConnected = true,
  climbingRank,
  climbingScore,
  onSwitchToDaily,
}: PinnedMeRowProps) {
  // Hide pinned row if user's row is already visible in the list or podium
  if (isUserInVisibleList) {
    return <div id="mew" className="gone" aria-hidden="true" />;
  }

  // If no user entry exists:
  if (!me) {
    if (!isWalletConnected) {
      return (
        <div id="mew">
          <div className="gap" aria-hidden="true">···</div>
          <div className="me" role="status">
            <span>—</span>
            <span>Connect wallet to see your rank</span>
            <span></span>
            <span className="pf">🔒</span>
          </div>
        </div>
      );
    }

    return (
      <div id="mew">
        <div className="gap" aria-hidden="true">···</div>
        <div className="me" role="status">
          <span>—</span>
          <span>You haven&apos;t played today</span>
          <span></span>
          {onSwitchToDaily && (
            <button
              type="button"
              className="btn p"
              style={{ minHeight: '44px', padding: '0 14px', fontSize: '12px' }}
              onClick={onSwitchToDaily}
            >
              Play Daily 100
            </button>
          )}
        </div>
      </div>
    );
  }

  const formattedWallet = formatAddress(me.wallet);
  const formattedScore = formatValue(me.value, tab);
  const displayedRank = climbingRank !== undefined && climbingRank !== null ? climbingRank : me.rank;
  const displayedScore =
    climbingScore !== undefined && climbingScore !== null
      ? climbingScore.toLocaleString()
      : formattedScore;

  return (
    <div id="mew">
      <div className="gap" aria-hidden="true">···</div>
      <div
        className="me"
        id="me"
        role="status"
        aria-label={`Your current rank: #${displayedRank}, score: ${displayedScore}`}
      >
        <span id="mr">{displayedRank}</span>
        <span>YOU · {formattedWallet}</span>
        <span id="ms" className="sc">{displayedScore}</span>
        {me.proofUrl ? (
          <a
            href={me.proofUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="pf"
            style={{ textDecoration: 'none', color: 'inherit' }}
            aria-label="View on-chain proof"
            onClick={(e) => e.stopPropagation()}
          >
            ↗
          </a>
        ) : (
          <span className="pf">·</span>
        )}
      </div>
    </div>
  );
}
