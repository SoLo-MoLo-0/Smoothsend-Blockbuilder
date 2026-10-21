'use client';

import React, { useState } from 'react';
import GameBoard from './components/GameBoard';
import CountdownClock from './components/leaderboard/CountdownClock';
import LeaderboardView from './components/leaderboard/LeaderboardView';
import WalletHeader from './components/web3/WalletHeader';
import { soundManager } from '@/lib/leaderboard/sound';
import { musicManager } from '@/lib/audio/MusicManager';
import IntroOverlay from './components/intro/IntroOverlay';
import { HeaderMusicToggle } from './components/audio/MusicControls';

export default function Home() {
  const [activeTab, setActiveTab] = useState<'practice' | 'daily' | 'leaderboard'>('practice');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [soundOn, setSoundOn] = useState<boolean>(true);
  const [showIntro, setShowIntro] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('nointro') === '1') {
        return false;
      }
    }
    return true;
  });
  const [skipGateOnReplay, setSkipGateOnReplay] = useState<boolean>(false);
  const [dailyInfo, setDailyInfo] = useState<{ day: number; seed: number }>({
    day: 3,
    seed: 20261012,
  });

  React.useEffect(() => {
    fetch('/api/run/daily')
      .then((r) => r.json())
      .then((data) => {
        if (data?.day && data?.seed) {
          setDailyInfo({ day: data.day, seed: data.seed });
        }
      })
      .catch(() => {});
  }, []);

  React.useEffect(() => {
    try {
      const saved = localStorage.getItem('bb-theme');
      if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        setTheme('dark');
        document.documentElement.setAttribute('data-theme', 'dark');
      } else {
        setTheme('light');
        document.documentElement.setAttribute('data-theme', 'light');
      }
    } catch {}

    // Check if intro should be skipped via URL parameter (e.g. ?nointro=1 for test automation)
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('nointro') === '1') {
      setShowIntro(false);
      document.documentElement.classList.add('bb-intro-done');
    } else {
      setShowIntro(true);
      document.documentElement.classList.remove('bb-intro-done');
    }

    const triggerReplay = () => {
      setSkipGateOnReplay(true);
      setShowIntro(true);
    };

    (window as any).__replayIntro = triggerReplay;
    (window as any).replayIntro = triggerReplay;
    window.addEventListener('bb-replay-intro', triggerReplay);

    setSoundOn(soundManager.isEnabled());
    const handleSoundChange = (e: Event) => {
      const custom = e as CustomEvent<boolean>;
      setSoundOn(custom.detail);
    };
    window.addEventListener('bb-sound-change', handleSoundChange);
    return () => {
      window.removeEventListener('bb-sound-change', handleSoundChange);
      window.removeEventListener('bb-replay-intro', triggerReplay);
      delete (window as any).__replayIntro;
      delete (window as any).replayIntro;
    };
  }, []);

  React.useEffect(() => {
    if (!showIntro) {
      musicManager.handleTabChange(activeTab);
    }
  }, [activeTab, showIntro]);

  const handleIntroFinish = () => {
    setShowIntro(false);
    setSkipGateOnReplay(false);
    if (typeof document !== 'undefined') {
      document.documentElement.classList.remove('bb-intro-pending');
      document.documentElement.classList.add('bb-intro-done');
    }
    musicManager.handleTabChange(activeTab);
  };

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('bb-theme', next);
    } catch {}
  };

  const toggleSound = () => {
    const next = soundManager.toggle();
    setSoundOn(next);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top Bar matching reference .bar */}
      <header className="top-bar-wrapper">
        <div className="bar">
          <div className="lg">BLOCK BUILDER</div>
          <nav className="tabs" role="tablist" aria-label="Main navigation">
            <button
              id="practice-tab-btn"
              onClick={(e) => {
                e.currentTarget.blur();
                setActiveTab('practice');
              }}
              className={`tab ${activeTab === 'practice' ? 'on' : ''}`}
              aria-pressed={activeTab === 'practice'}
            >
              Practice
            </button>
            <button
              id="daily-tab-btn"
              onClick={(e) => {
                e.currentTarget.blur();
                setActiveTab('daily');
              }}
              className={`tab ${activeTab === 'daily' ? 'on' : ''}`}
              aria-pressed={activeTab === 'daily'}
            >
              Daily 100
            </button>
            <button
              id="leaderboard-tab-btn"
              onClick={(e) => {
                e.currentTarget.blur();
                setActiveTab('leaderboard');
              }}
              className={`tab ${activeTab === 'leaderboard' ? 'on' : ''}`}
              aria-pressed={activeTab === 'leaderboard'}
            >
              Leaderboard
            </button>
          </nav>

          {/* Right side: Live Countdown, Badges & Theme Toggle */}
          <div className="clk">
            <CountdownClock />
            <WalletHeader />

            <button
              id="theme-toggle-btn"
              className="btn"
              style={{ minHeight: '32px', padding: '0 8px', fontSize: '11px' }}
              onClick={toggleTheme}
              aria-label={`Toggle theme, currently ${theme} mode`}
            >
              {theme === 'dark' ? 'Light' : 'Dark'}
            </button>

            <button
              id="global-sound-toggle-btn"
              className="btn"
              style={{
                minHeight: '32px',
                minWidth: '34px',
                padding: '0 8px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              onClick={(e) => {
                e.currentTarget.blur();
                toggleSound();
              }}
              aria-label={soundOn ? 'Mute sound' : 'Unmute sound'}
              aria-pressed={soundOn}
              title={soundOn ? 'Sound on (click to mute)' : 'Sound off (click to unmute)'}
            >
              {soundOn ? (
                /* Crisp Mono Ink Sound On Icon */
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="square" aria-hidden="true">
                  <path d="M2 5.5h3l3.5-3v11l-3.5-3H2v-5z" fill="currentColor" stroke="none" />
                  <path d="M11.5 5.5c1 1 1 4 0 5" />
                  <path d="M13.5 3.5c2 2.5 2 6.5 0 9" />
                </svg>
              ) : (
                /* Crisp Mono Ink Sound Muted Icon */
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="square" aria-hidden="true">
                  <path d="M2 5.5h3l3.5-3v11l-3.5-3H2v-5z" fill="currentColor" stroke="none" />
                  <line x1="11.5" y1="5.5" x2="15" y2="10.5" stroke="var(--acc)" strokeWidth="2" />
                  <line x1="15" y1="5.5" x2="11.5" y2="10.5" stroke="var(--acc)" strokeWidth="2" />
                </svg>
              )}
            </button>

            <HeaderMusicToggle />
          </div>
        </div>
      </header>

      {/* Main View */}
      {activeTab === 'practice' && (
        <GameBoard
          key="practice"
          mode="practice"
          maxPieces={100}
          soundEnabled={soundOn}
          introActive={showIntro}
        />
      )}

      {activeTab === 'daily' && (
        <GameBoard
          key={`daily-${dailyInfo.day}`}
          mode="daily"
          maxPieces={100}
          seed={dailyInfo.seed}
          day={dailyInfo.day}
          soundEnabled={soundOn}
          introActive={showIntro}
          onOpenLeaderboard={() => setActiveTab('leaderboard')}
          onPlayPractice={() => setActiveTab('practice')}
        />
      )}

      {activeTab === 'leaderboard' && (
        <LeaderboardView
          isActive={true}
          onSwitchToDaily={() => setActiveTab('daily')}
        />
      )}

      {/* Full-screen Intro Overlay (Line Clear Open) */}
      {showIntro && <IntroOverlay onFinish={handleIntroFinish} skipGate={skipGateOnReplay} />}
    </div>
  );
}

