'use client';

import React, { useCallback, useEffect, useRef } from 'react';
import { LeaderboardTab } from '@/lib/leaderboard';

interface SubTabsProps {
  activeTab: LeaderboardTab;
  onChange: (tab: LeaderboardTab) => void;
  onPlaySound?: (freq: number, dur: number) => void;
}

const TABS: { id: LeaderboardTab; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'all', label: 'All time' },
  { id: 'streak', label: 'Streaks' },
];

export default function SubTabs({ activeTab, onChange, onPlaySound }: SubTabsProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const indicatorRef = useRef<HTMLElement | null>(null);
  const buttonRefs = useRef<Map<LeaderboardTab, HTMLButtonElement>>(new Map());

  // Move indicator to active tab element
  const updateIndicator = useCallback(() => {
    const activeBtn = buttonRefs.current.get(activeTab);
    const indicator = indicatorRef.current;
    if (activeBtn && indicator) {
      indicator.style.left = `${activeBtn.offsetLeft}px`;
      indicator.style.width = `${activeBtn.offsetWidth}px`;
    }
  }, [activeTab]);

  useEffect(() => {
    updateIndicator();
    window.addEventListener('resize', updateIndicator);

    if (typeof document !== 'undefined' && 'fonts' in document) {
      document.fonts.ready.then(updateIndicator).catch(() => {});
    }

    return () => {
      window.removeEventListener('resize', updateIndicator);
    };
  }, [updateIndicator]);

  const handleSelectTab = (tab: LeaderboardTab) => {
    if (tab !== activeTab) {
      if (onPlaySound) {
        onPlaySound(300, 0.05);
      }
      onChange(tab);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    let nextIndex = currentIndex;

    if (e.key === 'ArrowRight') {
      e.preventDefault();
      nextIndex = (currentIndex + 1) % TABS.length;
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      nextIndex = (currentIndex - 1 + TABS.length) % TABS.length;
    } else if (e.key === 'Home') {
      e.preventDefault();
      nextIndex = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      nextIndex = TABS.length - 1;
    } else {
      return;
    }

    const nextTab = TABS[nextIndex].id;
    handleSelectTab(nextTab);
    const nextBtn = buttonRefs.current.get(nextTab);
    if (nextBtn) {
      nextBtn.focus();
    }
  };

  return (
    <div
      ref={containerRef}
      className="st"
      role="tablist"
      aria-label="Leaderboard views"
    >
      {TABS.map((tab, idx) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              if (el) buttonRefs.current.set(tab.id, el);
              else buttonRefs.current.delete(tab.id);
            }}
            id={`subtab-${tab.id}`}
            role="tab"
            aria-selected={isActive}
            aria-controls={`panel-${tab.id}`}
            tabIndex={isActive ? 0 : -1}
            className={isActive ? 'on' : ''}
            data-t={tab.id}
            onClick={() => handleSelectTab(tab.id)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
          >
            {tab.label}
          </button>
        );
      })}
      <i id="ind" ref={indicatorRef} aria-hidden="true" />
    </div>
  );
}
