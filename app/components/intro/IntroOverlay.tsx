'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { soundManager } from '@/lib/leaderboard/sound';
import { musicManager } from '@/lib/audio/MusicManager';
import { startIntroAudioPlayback, IntroAudioPlayback } from '@/lib/intro/introAudio';

export type IntroThemeSetting = 'auto' | 'dark' | 'light';

export interface IntroOverlayProps {
  onFinish?: () => void;
  skipGate?: boolean;
}

export const REQUIRE_SOUND_GATE = true;

/**
 * Resolves the effective theme ('dark' | 'light') based on:
 * 1. Saved localStorage 'bb-intro-theme' ('auto' | 'dark' | 'light')
 * 2. If 'auto', matches the app theme (document data-theme or prefers-color-scheme)
 */
function getEffectiveTheme(): 'dark' | 'light' {
  if (typeof window === 'undefined') return 'dark';

  let savedTheme: IntroThemeSetting = 'auto';
  try {
    const stored = localStorage.getItem('bb-intro-theme');
    if (stored === 'dark' || stored === 'light' || stored === 'auto') {
      savedTheme = stored;
    }
  } catch {}

  if (savedTheme === 'dark') return 'dark';
  if (savedTheme === 'light') return 'light';

  // 'auto': match app theme
  const appTheme = document.documentElement.getAttribute('data-theme');
  if (appTheme === 'dark') return 'dark';
  if (appTheme === 'light') return 'light';

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export default function IntroOverlay({ onFinish, skipGate = false }: IntroOverlayProps) {
  const [effectiveTheme, setEffectiveTheme] = useState<'dark' | 'light'>('dark');
  const [gateActive, setGateActive] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const rm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (rm) return false;
    if (skipGate) return false;
    const soundEnabled = soundManager.isEnabled();
    if (!soundEnabled) return false;
    return REQUIRE_SOUND_GATE;
  });
  const [showSoundChip, setShowSoundChip] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isReducedMotion, setIsReducedMotion] = useState<boolean>(false);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const gateBtnRef = useRef<HTMLButtonElement | null>(null);
  const stripsRef = useRef<HTMLDivElement | null>(null);
  const stgRef = useRef<HTMLDivElement | null>(null);
  const barRef = useRef<HTMLElement | null>(null);
  const counterRef = useRef<HTMLSpanElement | null>(null);

  const gateActiveRef = useRef<boolean>(gateActive);
  gateActiveRef.current = gateActive;
  const isPlayingRef = useRef<boolean>(isPlaying);
  isPlayingRef.current = isPlaying;
  const dismissedRef = useRef<boolean>(false);

  const goRef = useRef<boolean>(false);
  const doneRef = useRef<boolean>(false);
  const webAnimationsRef = useRef<Animation[]>([]);
  const beginTimerRef = useRef<NodeJS.Timeout | null>(null);
  const finishTimerRef = useRef<NodeJS.Timeout | null>(null);
  const transitionTimerRef = useRef<NodeJS.Timeout | null>(null);
  const enterCleanupTimerRef = useRef<NodeJS.Timeout | null>(null);
  const rafRef = useRef<number | null>(null);
  const audioPlaybackRef = useRef<IntroAudioPlayback | null>(null);
  const t0PerfRef = useRef<number>(0);

  // Compute theme and reduced motion on mount
  useEffect(() => {
    setEffectiveTheme(getEffectiveTheme());
    const rm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setIsReducedMotion(rm);

    const observer = new MutationObserver(() => {
      setEffectiveTheme(getEffectiveTheme());
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    const darkMq = window.matchMedia('(prefers-color-scheme: dark)');
    const handleDarkChange = () => setEffectiveTheme(getEffectiveTheme());
    darkMq.addEventListener('change', handleDarkChange);

    const rmMq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleRmChange = (e: MediaQueryListEvent) => setIsReducedMotion(e.matches);
    rmMq.addEventListener('change', handleRmChange);

    const handleThemeUpdate = () => setEffectiveTheme(getEffectiveTheme());
    window.addEventListener('storage', handleThemeUpdate);
    window.addEventListener('bb-intro-theme-change', handleThemeUpdate);

    (window as any).__setIntroTheme = (theme: IntroThemeSetting) => {
      try {
        localStorage.setItem('bb-intro-theme', theme);
      } catch {}
      setEffectiveTheme(getEffectiveTheme());
    };

    return () => {
      observer.disconnect();
      darkMq.removeEventListener('change', handleDarkChange);
      rmMq.removeEventListener('change', handleRmChange);
      window.removeEventListener('storage', handleThemeUpdate);
      window.removeEventListener('bb-intro-theme-change', handleThemeUpdate);
      delete (window as any).__setIntroTheme;
    };
  }, []);

  // Lock scroll while intro is visible
  useEffect(() => {
    const originalOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.documentElement.style.overflow = originalOverflow;
    };
  }, []);

  // Clean finish routine: clean up every timer, listener, animation, and AudioNode
  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;

    if (beginTimerRef.current) clearTimeout(beginTimerRef.current);
    if (finishTimerRef.current) clearTimeout(finishTimerRef.current);
    if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    webAnimationsRef.current.forEach((anim) => {
      try {
        anim.cancel();
      } catch {}
    });
    webAnimationsRef.current.length = 0;

    if (audioPlaybackRef.current) {
      audioPlaybackRef.current.cleanup();
      audioPlaybackRef.current = null;
    }

    document.documentElement.style.overflow = '';
    document.documentElement.classList.remove('bb-intro-pending');

    if (enterCleanupTimerRef.current) clearTimeout(enterCleanupTimerRef.current);
    enterCleanupTimerRef.current = setTimeout(() => {
      document.body.classList.remove('enter');
    }, 1200);

    if (onFinish) {
      onFinish();
    }
  }, [onFinish]);

  // Begin transition: stage lifts and fades, strips collapse, panels enter
  const beginTransition = useCallback(() => {
    if (goRef.current) return;
    goRef.current = true;

    // Swell menu track from 25% to 100% over 1200ms per MUSIC.md Section 4
    musicManager.handleIntroTransition();

    // Remove pending class so game elements become visible under collapsing strips
    document.documentElement.classList.remove('bb-intro-pending');

    if (beginTimerRef.current) clearTimeout(beginTimerRef.current);

    // Cancel ongoing intro Web Animations
    webAnimationsRef.current.forEach((anim) => {
      try {
        anim.cancel();
      } catch {}
    });

    // prefers-reduced-motion: immediately finish with no animations or transition sounds
    const rm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (rm) {
      finish();
      return;
    }

    // Play transition sounds (fades intro sound out in ~60ms if skipping early < 2.3s)
    if (audioPlaybackRef.current) {
      audioPlaybackRef.current.onTransition();
    }

    // Stage lifts and fades out
    if (stgRef.current) {
      stgRef.current.classList.add('out');
    }

    // 200ms delay: strips collapse bottom-to-top & panels enter
    transitionTimerRef.current = setTimeout(() => {
      if (stripsRef.current) {
        stripsRef.current.classList.add('go');
      }
      document.body.classList.add('enter');

      // Strips collapse finishes in ~1020ms (19 * 30ms + 450ms) -> remove at 1100ms
      finishTimerRef.current = setTimeout(finish, 1100);
    }, 200);
  }, [finish]);

  // Starts the main animated intro and sound
  const startPlay = useCallback(() => {
    setIsPlaying(true);
    setGateActive(false);
    t0PerfRef.current = performance.now();

    if (skipGate) {
      musicManager.handleGateDismiss();
    }

    const rm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (rm) {
      // Per spec: show title statically for 0.9s (900ms), then remove, with no sound
      beginTimerRef.current = setTimeout(finish, 900);
      return;
    }

    const soundEnabled = soundManager.isEnabled();
    const ac = soundManager.getAudioContext();
    const isLive = soundEnabled && ac !== null && ac.state === 'running';

    if (isLive) {
      audioPlaybackRef.current = startIntroAudioPlayback(t0PerfRef.current);
    } else if (soundEnabled) {
      // When REQUIRE_SOUND_GATE is false, show small "Sound off · tap to enable" chip instead
      setShowSoundChip(true);
    }

    // Single begin-transition timer at 2.4s (2400ms)
    beginTimerRef.current = setTimeout(beginTransition, 2400);
  }, [beginTransition, finish, skipGate]);

  // Audio start gate check on mount:
  // If AudioContext is locked and sound is on: show start gate (or chip if REQUIRE_SOUND_GATE is false)
  // Skip gate if audio is already running, skipGate is true, sound is off, or reduced motion is active
  useEffect(() => {
    const rm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const soundEnabled = soundManager.isEnabled();

    // Ensure audio context is ready
    soundManager.initAudioContext();
    if (musicManager.isEnabled() && REQUIRE_SOUND_GATE && !skipGate) {
      musicManager.handleIntroGate();
    }

    if (rm || !soundEnabled || skipGate || !REQUIRE_SOUND_GATE) {
      setGateActive(false);
      startPlay();
      return;
    }
  }, [skipGate, startPlay]);

  // Handle gate dismiss: any key or tap resumes audio and starts intro with sound
  const handleGateDismiss = useCallback(() => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    setGateActive(false);
    startPlay();

    try {
      musicManager.handleGateDismiss();
    } catch (e) {
      console.warn('[Intro] musicManager.handleGateDismiss failed:', e);
    }

    try {
      const ac = soundManager.getAudioContext();
      if (ac && ac.state !== 'running') {
        ac.resume().catch(() => {});
      }
    } catch (e) {
      console.warn('[Intro] audioContext resume failed:', e);
    }
  }, [startPlay]);

  // Focus the start gate on mount so keyboard events are immediately captured
  useEffect(() => {
    if (gateActive) {
      gateBtnRef.current?.focus();
    }
  }, [gateActive]);

  // Global keydown capture:
  // Ignores ALL game input while gate or intro is showing; key that dismisses gate or skips never reaches game
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') return;
      // Ignore modifier keys alone
      if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key) || e.metaKey || e.ctrlKey || e.altKey) {
        return;
      }

      // Stop propagation completely so event never reaches GameBoard
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      if (gateActiveRef.current) {
        handleGateDismiss();
      } else if (isPlayingRef.current) {
        beginTransition();
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [handleGateDismiss, beginTransition]);

  // Web Animations API for stage jolts, smooth progress bar, and 0-100 counter
  useEffect(() => {
    if (!isPlaying) return;

    const rm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (rm) return;

    const stg = stgRef.current;
    const bar = barRef.current;
    const counter = counterRef.current;
    let startTimeout: NodeJS.Timeout | null = null;

    // Stage jolts on tile landings: 2px (450ms), 2px (600ms), 3px (750ms), 4px (900ms)
    if (stg) {
      const jolts: [number, number][] = [
        [450, 2],
        [600, 2],
        [750, 3],
        [900, 4],
      ];
      jolts.forEach(([delayMs, amountPx]) => {
        const anim = stg.animate(
          [
            { transform: 'translateY(0)' },
            { transform: `translateY(${amountPx}px)`, offset: 0.3 },
            { transform: 'translateY(0)' },
          ],
          { duration: 150, delay: delayMs }
        );
        webAnimationsRef.current.push(anim);
      });
    }

    // Smooth GPU progress bar (scaleX, 1250ms, cubic-bezier(.65,0,.35,1), delay 1150ms)
    if (bar) {
      const barAnim = bar.animate(
        [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }],
        {
          duration: 1250,
          delay: 1150,
          easing: 'cubic-bezier(.65,0,.35,1)',
          fill: 'both',
        }
      );
      webAnimationsRef.current.push(barAnim);

      barAnim.onfinish = () => {
        bar.style.background = 'var(--ia)';
        if (counter) counter.textContent = '100';
      };

      startTimeout = setTimeout(() => {
        if (doneRef.current) return;
        const updateCounter = () => {
          if (doneRef.current) return;
          const progress = barAnim.effect?.getComputedTiming().progress ?? 0;
          if (counter) {
            counter.textContent = String(Math.round(progress * 100));
          }
          if (progress < 1) {
            rafRef.current = requestAnimationFrame(updateCounter);
          }
        };
        rafRef.current = requestAnimationFrame(updateCounter);
      }, 1150);
    }

    return () => {
      if (startTimeout) clearTimeout(startTimeout);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying]);

  // Sound Chip click to enable sound and restart with audio
  const handleSoundChipClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const ac = soundManager.getAudioContext();
    if (ac && ac.resume) {
      ac.resume().then(() => {
        if (ac.state === 'running') {
          setShowSoundChip(false);
          if (audioPlaybackRef.current) {
            audioPlaybackRef.current.cleanup();
          }
          audioPlaybackRef.current = startIntroAudioPlayback(performance.now());
        }
      }).catch(() => {});
    }
  }, []);

  const titleChars = Array.from('BLOCK BUILDER');

  return (
    <div
      id="intro"
      ref={rootRef}
      tabIndex={-1}
      data-it={effectiveTheme}
      role="dialog"
      aria-modal="true"
      aria-label="Block Builder introduction"
      onClick={() => {
        if (gateActiveRef.current) {
          handleGateDismiss();
        } else if (isPlayingRef.current) {
          beginTransition();
        }
      }}
    >
      {/* 20 equal-height horizontal rows layer for line-clear transition */}
      {!isReducedMotion && (
        <div id="strips" ref={stripsRef} aria-hidden="true">
          {Array.from({ length: 20 }, (_, i) => (
            <i key={i} style={{ '--n': 19 - i } as React.CSSProperties} />
          ))}
        </div>
      )}

      {/* Start Gate: logo with pulsing accent tile, "PRESS ANY KEY TO START" with blinking accent block, "Best with sound on" */}
      {gateActive && (
        <button
          id="gate"
          ref={gateBtnRef}
          type="button"
          aria-label="Start with sound"
          onClick={handleGateDismiss}
          onPointerDown={handleGateDismiss}
          onKeyDown={(e) => {
            if (e.key !== 'Tab') {
              e.preventDefault();
              e.stopPropagation();
              handleGateDismiss();
            }
          }}
        >
          {/* Animated Orange Perimeter Border: starts at top-left, travels smoothly around screen, ends at start point */}
          <svg className="gate-border-svg" aria-hidden="true" width="100%" height="100%">
            <rect
              className="gate-border-rect"
              x="1"
              y="1"
              width="calc(100% - 2px)"
              height="calc(100% - 2px)"
              pathLength="100"
            />
          </svg>
          <div className="gl">
            <i />
            <i />
            <i />
            <i />
          </div>
          <p>
            Press any key to start
            <small>Best with sound on</small>
          </p>
        </button>
      )}

      {/* Stage container with complete Mono Ink visuals */}
      {isPlaying && (
        <div id="stg" ref={stgRef}>
          {/* 4 dropping logo tiles in 2x2 grid (hidden on reduced motion) */}
          {!isReducedMotion && (
            <div id="il" aria-hidden="true">
              <i style={{ background: 'var(--ia)' }} />
              <i />
              <i />
              <i style={{ background: 'none', border: '3px solid var(--it)' }} />
            </div>
          )}

          <div className="wel">Welcome to</div>

          <div className="tw">
            <h1 className="ttl">
              {titleChars.map((char, idx) =>
                char === ' ' ? (
                  <span key={idx} className="sp" style={{ '--i': idx } as React.CSSProperties} />
                ) : (
                  <span key={idx} style={{ '--i': idx } as React.CSSProperties}>
                    {char}
                  </span>
                )
              )}
            </h1>
            {!isReducedMotion && <i className="ul" aria-hidden="true" />}
          </div>

          <div className="tag">100 pieces. One seed. The whole world.</div>

          {/* Smooth GPU progress bar with live 0 / 100 piece counter (hidden on reduced motion) */}
          {!isReducedMotion && (
            <div className="pw">
              <div className="prog">
                <b ref={barRef} />
              </div>
              <div className="pc">
                <span>PIECES</span>
                <span>
                  <span ref={counterRef} id="pn">0</span> / 100
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Skip button per spec (hidden on reduced motion) */}
      {isPlaying && !isReducedMotion && (
        <button
          id="skip"
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            beginTransition();
          }}
          aria-label="Skip intro"
        >
          Skip ›
        </button>
      )}

      {/* Sound Off Tap to Enable Chip */}
      {showSoundChip && isPlaying && !isReducedMotion && (
        <button
          id="sndchip"
          type="button"
          onClick={handleSoundChipClick}
          aria-label="Enable sound"
        >
          Sound off · tap to enable
        </button>
      )}
    </div>
  );
}
