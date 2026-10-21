'use client';

import React from 'react';
import { soundManager } from '@/lib/leaderboard/sound';
import { formatAddress, formatValue, LeaderboardEntry, LeaderboardTab } from '@/lib/leaderboard';

interface LeaderboardRowProps {
  entry: LeaderboardEntry;
  tab: LeaderboardTab;
  isOpen: boolean;
  onToggle: () => void;
  isCurrentUser?: boolean;
  staggerDelayIndex?: number;
}

export default function LeaderboardRow({
  entry,
  tab,
  isOpen,
  onToggle,
  isCurrentUser = false,
  staggerDelayIndex = 0,
}: LeaderboardRowProps) {
  const formattedWallet = formatAddress(entry.wallet);
  const formattedScore = formatValue(entry.value, tab);
  const playerLabel = isCurrentUser ? `YOU · ${formattedWallet}` : formattedWallet;

  const handleRowClick = () => {
    soundManager.playRowToggle(!isOpen);
    onToggle();
  };

  const isMainnet = process.env.NEXT_PUBLIC_SMOOTHSEND_NETWORK === 'mainnet' || process.env.NEXT_PUBLIC_CHAIN_ID === '43114';
  const defaultDetails = `Replay verified · ${isMainnet ? 'Avalanche C-Chain' : 'Avalanche Fuji'}`;

  return (
    <div
      className={`rw ${isCurrentUser ? 'mine' : ''} ${isOpen ? 'open' : ''}`}
      data-rank={entry.rank}
      style={{ '--d': staggerDelayIndex } as React.CSSProperties}
    >
      <button
        className="row"
        type="button"
        aria-expanded={isOpen}
        onClick={handleRowClick}
      >
        <span className="rk">{entry.rank}</span>
        <span>{playerLabel}</span>
        <span className="sc">{formattedScore}</span>
        {entry.proofUrl ? (
          <span
            className="pf"
            role="link"
            tabIndex={0}
            aria-label={`View on-chain proof for rank ${entry.rank}`}
            onClick={(e) => {
              e.stopPropagation();
              window.open(entry.proofUrl, '_blank', 'noopener,noreferrer');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.stopPropagation();
                window.open(entry.proofUrl, '_blank', 'noopener,noreferrer');
              }
            }}
          >
            ↗
          </span>
        ) : (
          <span className="pf">·</span>
        )}
      </button>

      {/* Accordion Details */}
      <div className="ex" aria-hidden={!isOpen}>
        <div>
          <div className="exi">
            <span>{entry.details || defaultDetails}</span>
            {entry.proofUrl ? (
              <a
                href={entry.proofUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
              >
                Proof ↗
              </a>
            ) : (
              <span>Verified ↗</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
