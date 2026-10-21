'use client';

import React, { useEffect, useRef, useState } from 'react';
import { countTo, isReducedMotion } from '@/lib/leaderboard/motion';
import { soundManager } from '@/lib/leaderboard/sound';
import {
  formatAddress,
  formatValue,
  LeaderboardEntry,
  LeaderboardTab,
} from '@/lib/leaderboard';

interface PodiumTowerProps {
  entries: LeaderboardEntry[];
  tab: LeaderboardTab;
  isActive?: boolean;
}

interface ColumnConfig {
  rank: number;
  entryIndex: number;
  tileCount: number;
  colClass: string;
  delayMs: number;
}

// Columns ordered 2, 1, 3. Build sequence order: 3rd (delay 0), 2nd (delay 250), 1st (delay 500)
const COLUMNS: ColumnConfig[] = [
  { rank: 2, entryIndex: 1, tileCount: 4, colClass: 'c2', delayMs: 250 },
  { rank: 1, entryIndex: 0, tileCount: 5, colClass: 'c1', delayMs: 500 },
  { rank: 3, entryIndex: 2, tileCount: 3, colClass: 'c3', delayMs: 0 },
];

export default function PodiumTower({ entries, tab, isActive = true }: PodiumTowerProps) {
  const [isBuilt, setIsBuilt] = useState<boolean>(false);
  const [displayScores, setDisplayScores] = useState<Record<number, number>>({
    1: 0,
    2: 0,
    3: 0,
  });

  const timeoutsRef = useRef<NodeJS.Timeout[]>([]);
  const cancelAnimatorsRef = useRef<(() => void)[]>([]);

  useEffect(() => {
    // Clear previous build timers and animations
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
    cancelAnimatorsRef.current.forEach((cancel) => cancel());
    cancelAnimatorsRef.current = [];

    // When leaderboard is not actively viewed, never schedule sounds or animations
    if (!isActive) {
      setIsBuilt(true);
      setDisplayScores({
        1: entries[0]?.value || 0,
        2: entries[1]?.value || 0,
        3: entries[2]?.value || 0,
      });
      return;
    }

    const reduced = isReducedMotion();

    if (reduced) {
      setIsBuilt(true);
      setDisplayScores({
        1: entries[0]?.value || 0,
        2: entries[1]?.value || 0,
        3: entries[2]?.value || 0,
      });
      return;
    }

    setIsBuilt(false);
    setDisplayScores({ 1: 0, 2: 0, 3: 0 });

    // Schedule drop sounds and score count-ups per column
    COLUMNS.forEach(({ rank, entryIndex, tileCount, delayMs }) => {
      const entry = entries[entryIndex];
      if (!entry) return;

      // 1. Landing audio blips: 170 + k*45 + (2 - colIndex)*20 Hz, 70ms, fired del + k*90 + 430ms
      for (let k = 0; k < tileCount; k++) {
        const soundTime = delayMs + k * 90 + 430;
        const timer = setTimeout(() => {
          soundManager.playTileLanding(entryIndex, k);
        }, soundTime);
        timeoutsRef.current.push(timer);
      }

      // 2. Score count-up: 900ms ease-out cubic, starting after the column's last tile starts
      const scoreStartDelay = delayMs + tileCount * 90;
      const cancelAnim = countTo(
        0,
        entry.value,
        900,
        scoreStartDelay,
        (currentValue) => {
          setDisplayScores((prev) => ({
            ...prev,
            [rank]: currentValue,
          }));
        }
      );
      cancelAnimatorsRef.current.push(cancelAnim);
    });

    // 3. Mark podium built after build animation settles (~1700ms)
    const builtTimer = setTimeout(() => {
      setIsBuilt(true);
    }, 1700);
    timeoutsRef.current.push(builtTimer);

    return () => {
      timeoutsRef.current.forEach(clearTimeout);
      cancelAnimatorsRef.current.forEach((cancel) => cancel());
    };
  }, [entries, tab, isActive]);

  return (
    <div
      id="pod"
      className={isBuilt ? 'built' : ''}
      role="region"
      aria-label="The Tower Podium — Top 3 players"
    >
      {COLUMNS.map(({ rank, entryIndex, tileCount, colClass, delayMs }) => {
        const entry = entries[entryIndex];

        // Handling fewer than 3 players: missing columns are dashed placeholders
        if (!entry) {
          return (
            <div
              key={rank}
              className="col-dashed"
              aria-label={`Rank ${rank}: No entry yet`}
            >
              <span style={{ fontSize: '24px', fontWeight: 700, color: 'var(--mute)' }}>
                {rank}
              </span>
              <span style={{ fontSize: '11px', marginTop: '4px' }}>Empty</span>
            </div>
          );
        }

        const formattedWallet = formatAddress(entry.wallet);
        const currentScore = isBuilt ? entry.value : (displayScores[rank] ?? 0);
        const formattedScore = formatValue(currentScore, tab);
        const detailsText = entry.details || '100 pieces · Replay verified';

        const handleOpenProof = (e?: React.SyntheticEvent) => {
          if (e) {
            e.preventDefault();
            e.stopPropagation();
          }
          if (entry?.proofUrl) {
            window.open(entry.proofUrl, '_blank', 'noopener,noreferrer');
          }
        };

        return (
          <button
            key={rank}
            className={`col ${colClass}`}
            aria-label={`Rank ${rank}, ${formattedWallet}, ${formattedScore}`}
            type="button"
            onClick={handleOpenProof}
          >
            <span className="rn">{rank}</span>
            <span className="w">{entry.isMe ? `YOU · ${formattedWallet}` : formattedWallet}</span>
            <b className="sv">{formattedScore}</b>

            {/* Expandable Details on Hover / Focus */}
            <span className="det">
              <span>
                {detailsText}
                <br />
                {entry?.proofUrl ? (
                  <span
                    role="link"
                    tabIndex={0}
                    className="podium-proof-link"
                    aria-label={`View on-chain proof for rank ${rank}`}
                    onClick={handleOpenProof}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        handleOpenProof(e);
                      }
                    }}
                  >
                    Proof ↗
                  </span>
                ) : (
                  <span>Proof ↗</span>
                )}
              </span>
            </span>

            {/* Stacked Tower Tiles (rendered bottom-to-top with 90ms stagger) */}
            <span className="tw" aria-hidden="true">
              {Array.from({ length: tileCount })
                .map((_, idx) => tileCount - 1 - idx) // Render top down in DOM so k=0 is bottom
                .map((k) => (
                  <i
                    key={k}
                    className="t"
                    style={
                      {
                        '--i': k,
                        animationDelay: `${delayMs + k * 90}ms`,
                      } as React.CSSProperties
                    }
                  />
                ))}
            </span>
          </button>
        );
      })}
    </div>
  );
}
