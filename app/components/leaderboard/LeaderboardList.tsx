'use client';

import React, { useEffect, useRef, useState } from 'react';
import LeaderboardRow from './LeaderboardRow';
import { flipList } from '@/lib/leaderboard/motion';
import { LeaderboardEntry, LeaderboardTab } from '@/lib/leaderboard';

interface LeaderboardListProps {
  entries: LeaderboardEntry[];
  tab: LeaderboardTab;
  unit: string;
  currentUserWallet?: string;
  onUserVisibilityChange?: (isVisible: boolean) => void;
}

export default function LeaderboardList({
  entries,
  tab,
  unit,
  currentUserWallet,
}: LeaderboardListProps) {
  const [openRank, setOpenRank] = useState<number | null>(null);
  const [showAll, setShowAll] = useState<boolean>(false);
  const isFirstLoadRef = useRef<boolean>(true);
  const listContainerRef = useRef<HTMLDivElement | null>(null);

  // Ranks 4 and up (top 3 are in the podium)
  const listEntries = entries.filter((e) => e.rank >= 4);

  // Default: 7 rows (ranks 4 to 10). "Show more" reveals up to rank 50
  const visibleEntries = showAll ? listEntries.slice(0, 47) : listEntries.slice(0, 7);
  const hasMore = listEntries.length > 7;

  const isFirst = isFirstLoadRef.current;

  useEffect(() => {
    isFirstLoadRef.current = false;
  }, []);

  const handleToggleShowMore = () => {
    if (listContainerRef.current) {
      flipList(listContainerRef.current, () => {
        setShowAll((prev) => !prev);
      });
    } else {
      setShowAll((prev) => !prev);
    }
  };

  return (
    <div className="leaderboard-list-section" role="region" aria-label="Rankings list">
      {/* List Header */}
      <div className="row rh">
        <span>RANK</span>
        <span>PLAYER</span>
        <span className="sc">{unit.toUpperCase()}</span>
        <span className="pf">PROOF</span>
      </div>

      {/* List Rows */}
      <div id="list" ref={listContainerRef} role="list">
        {visibleEntries.map((entry, index) => {
          const walletList = currentUserWallet ? currentUserWallet.toLowerCase().split(',').map((w) => w.trim()).filter(Boolean) : [];
          const isCurrentUser =
            entry.isMe ||
            (walletList.length > 0 && walletList.includes(entry.wallet.toLowerCase()));

          // Stagger: first load delayed ~10 steps so podium finishes first, subsequent tab changes ~3 steps
          const staggerDelay = index + (isFirst ? 10 : 3);

          return (
            <LeaderboardRow
              key={entry.rank}
              entry={entry}
              tab={tab}
              isOpen={openRank === entry.rank}
              onToggle={() =>
                setOpenRank((curr) => (curr === entry.rank ? null : entry.rank))
              }
              isCurrentUser={isCurrentUser}
              staggerDelayIndex={staggerDelay}
            />
          );
        })}
      </div>

      {/* Show More / Show Less Button with FLIP transition */}
      {hasMore && (
        <div style={{ marginTop: '12px', textAlign: 'center' }}>
          <button
            type="button"
            className="btn"
            style={{ width: '100%', minHeight: '40px', fontSize: '13px' }}
            onClick={handleToggleShowMore}
          >
            {showAll ? 'Show top 10 only' : `Show more (up to rank 50 · ${listEntries.length - 7} more)`}
          </button>
        </div>
      )}
    </div>
  );
}
