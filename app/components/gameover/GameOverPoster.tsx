'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PieceType, PIECE_SHAPES, feel } from '@/lib/engine';
import { soundManager } from '@/lib/leaderboard/sound';
import { getLeaderboardService } from '@/lib/leaderboard';

export interface GameOverPosterProps {
  score: number;
  lines: number;
  piecesLocked: number;
  maxPieces?: number;
  level: number;
  bestScore: number;
  previousBest: number;
  durationMs: number;
  mode: 'practice' | 'daily';
  dayNumber?: number;
  playerWallet?: string;
  isVerified?: boolean;
  isDone?: boolean;
  boardElement?: HTMLElement | null;
  gridSnapshot?: (PieceType | null)[][];
  failedPieceType?: PieceType | null;
  onRetry: () => void;
  onOpenLeaderboard?: () => void;
  txHash?: string | null;
  userOpHash?: string | null;
  submissionPhase?: 'idle' | 'sponsoring' | 'confirming' | 'success' | 'error';
  isAuth?: boolean;
  onLogin?: () => void;
}

interface PhysicsTile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  a: number; // angle in radians
  va: number; // angular velocity
  s: number; // size in px
  al: number; // shade alpha
  acc: boolean; // is accent color
  rest: boolean;
  cur: number; // current opacity (0.9 to 0.18 lerp)
}

const PIECE_TYPE_INDEX: Record<PieceType, number> = {
  I: 0,
  O: 1,
  T: 2,
  S: 3,
  Z: 4,
  J: 5,
  L: 6,
};

function getPieceAlpha(type: PieceType): number {
  const idx = PIECE_TYPE_INDEX[type] ?? 0;
  return Math.max(0.35, 1 - idx * 0.13);
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Letter drop keyframes matching GAMEOVER.md §4 & design/gameover-reference.html
const DROP_KEYFRAMES: Keyframe[] = [
  { transform: 'translateY(-110vh) scaleY(1.5)', opacity: 0, easing: 'cubic-bezier(.55,0,1,.45)' },
  { transform: 'translateY(0) scaleY(1)', opacity: 1, offset: 0.6 },
  { transform: 'translateY(0) scaleY(0.8)', offset: 0.74 },
  { transform: 'translateY(0) scaleY(1.06)', offset: 0.88 },
  { transform: 'translateY(0) scaleY(1)' },
];

/**
 * Web Audio tone synthesizer per GAMEOVER.md §6
 */
function tn(
  ac: AudioContext,
  freq: number,
  startTime: number,
  duration: number,
  type: OscillatorType,
  vol: number,
  freqTo?: number
) {
  try {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, startTime);
    if (freqTo) {
      o.frequency.exponentialRampToValueAtTime(Math.max(1, freqTo), startTime + duration * 0.8);
    }
    const dest = soundManager.getMasterNode() || ac.destination;
    g.gain.setValueAtTime(0.0001, startTime);
    g.gain.linearRampToValueAtTime(vol, startTime + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    o.connect(g);
    g.connect(dest);
    o.start(startTime);
    o.stop(startTime + duration + 0.05);
  } catch {}
}

/**
 * Web Audio noise sweep synthesizer per GAMEOVER.md §6
 */
function nz(
  ac: AudioContext,
  startTime: number,
  duration: number,
  f0: number,
  f1: number,
  vol: number,
  type: BiquadFilterType = 'lowpass'
) {
  try {
    const dest = soundManager.getMasterNode() || ac.destination;
    const sampleRate = ac.sampleRate;
    const bufferSize = Math.max(1, Math.floor(sampleRate * duration));
    const buffer = ac.createBuffer(1, bufferSize, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const source = ac.createBufferSource();
    source.buffer = buffer;
    const filter = ac.createBiquadFilter();
    filter.type = type;
    if (type === 'bandpass') {
      filter.Q.value = 1.2;
    }
    filter.frequency.setValueAtTime(f0, startTime);
    filter.frequency.exponentialRampToValueAtTime(Math.max(1, f1), startTime + duration);
    const gain = ac.createGain();
    gain.gain.setValueAtTime(vol, startTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(dest);
    source.start(startTime);
  } catch {}
}

function GameOverPosterModal({
  score,
  lines,
  piecesLocked,
  maxPieces = 100,
  level,
  bestScore,
  previousBest,
  durationMs,
  mode,
  dayNumber = 1,
  isVerified = false,
  isDone = false,
  boardElement,
  gridSnapshot,
  failedPieceType,
  onRetry,
  playerWallet,
  onOpenLeaderboard,
  txHash,
  userOpHash,
  submissionPhase = 'idle',
  isAuth = false,
  onLogin,
}: GameOverPosterProps) {
  const isMainnet =
    process.env.NEXT_PUBLIC_SMOOTHSEND_NETWORK === 'mainnet' ||
    process.env.NEXT_PUBLIC_CHAIN_ID === '43114';
  const explorerBase = isMainnet ? 'https://snowtrace.io' : 'https://testnet.snowtrace.io';
  const [isReady, setIsReady] = useState<boolean>(false);
  const [showFill, setShowFill] = useState<boolean>(true);
  const [shareText, setShareText] = useState<string>('Share');
  const [rankInfo, setRankInfo] = useState<{ rank: number; total: number; percentile: string } | null>(null);

  const goRef = useRef<HTMLDivElement | null>(null);
  const bgRef = useRef<HTMLDivElement | null>(null);
  const flashRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const topRef = useRef<HTMLDivElement | null>(null);
  const barRef = useRef<HTMLElement | null>(null);
  const statsRef = useRef<HTMLDivElement | null>(null);
  const stampRef = useRef<HTMLDivElement | null>(null);
  const retryBtnRef = useRef<HTMLButtonElement | null>(null);
  const secondaryBtnRef = useRef<HTMLButtonElement | null>(null);
  const fillRef = useRef<HTMLElement | null>(null);

  // Stat value element refs for smooth RAF count-up
  const scoreValRef = useRef<HTMLDivElement | null>(null);
  const linesValRef = useRef<HTMLDivElement | null>(null);
  const piecesValRef = useRef<HTMLDivElement | null>(null);
  const bestValRef = useRef<HTMLDivElement | null>(null);

  const partsRef = useRef<PhysicsTile[]>([]);
  const floorRef = useRef<number | null>(null);
  const shakeRef = useRef<number>(0);
  const mouseRef = useRef<{ x: number; y: number }>({ x: -9999, y: -9999 });
  const isActiveRef = useRef<boolean>(true);
  const isReadyRef = useRef<boolean>(false);
  isReadyRef.current = isReady;

  const rafRef = useRef<number>(0);
  const timeoutsRef = useRef<NodeJS.Timeout[]>([]);
  const computedInkRef = useRef<string>('#111');
  const computedAccRef = useRef<string>('#ff3b1f');

  // Sound helper: silent when locked or muted, no prompts
  const sfx = useCallback((fn: (ac: AudioContext, t: number) => void) => {
    if (!soundManager.isEnabled()) return;
    const ac = soundManager.getAudioContext();
    if (!ac || ac.state !== 'running') return;
    fn(ac, ac.currentTime + 0.01);
  }, []);

  // Hit-stop helper: freezes feel clock and pauses poster animations per GAMEOVER.md §4b
  const hs = useCallback((ms: number) => {
    const a = feel.hitStop(ms);
    if (a > 0 && goRef.current) {
      goRef.current.getAnimations({ subtree: true }).forEach((x) => {
        if (x.playState === 'running') {
          x.pause();
          setTimeout(() => {
            try {
              x.play();
            } catch {}
          }, a);
        }
      });
    }
  }, []);

  // Ensure AudioContext is unlocked/resumed on first pointer OR key press for keyboard-only players
  useEffect(() => {
    const unlockAudio = () => {
      try {
        const ac = soundManager.getAudioContext();
        if (ac && ac.state === 'suspended') {
          ac.resume().catch(() => {});
        }
      } catch {}
    };

    window.addEventListener('pointerdown', unlockAudio, { capture: true, passive: true });
    window.addEventListener('keydown', unlockAudio, { capture: true, passive: true });
    return () => {
      window.removeEventListener('pointerdown', unlockAudio, { capture: true });
      window.removeEventListener('keydown', unlockAudio, { capture: true });
    };
  }, []);

  // When Retry unlocks (isReady === true), move focus to the Retry button per GAMEOVER.md §9
  useEffect(() => {
    if (isReady && retryBtnRef.current) {
      try {
        retryBtnRef.current.focus({ preventScroll: true });
      } catch {}
    }
  }, [isReady]);

  // Fetch today's rank and percentile from LeaderboardService when in daily mode
  useEffect(() => {
    if (mode !== 'daily') return;

    let cancelled = false;
    const fetchRank = async () => {
      try {
        const service = getLeaderboardService();
        if (!service) return;

        const page = await service.getPage('today', { wallet: playerWallet });
        if (cancelled) return;

        if (page && page.me && typeof page.me.rank === 'number' && page.totalPlayers > 0) {
          const rank = page.me.rank;
          const total = page.totalPlayers;
          const rawPct = (rank / total) * 100;
          let pctStr: string;
          if (rawPct < 0.1) {
            pctStr = '0.1%';
          } else if (rawPct < 10) {
            pctStr = `${rawPct.toFixed(1)}%`;
          } else {
            pctStr = `${Math.round(rawPct)}%`;
          }

          setRankInfo({
            rank,
            total,
            percentile: pctStr,
          });
        }
      } catch (err) {
        // Show nothing if unavailable (GAMEOVER.md §8)
        console.warn('Could not load leaderboard rank for game over screen:', err);
      }
    };

    fetchRank();

    return () => {
      cancelled = true;
    };
  }, [mode, playerWallet]);

  // Resize canvas according to device pixel ratio (capped at 2)
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }, []);

  // Spawn tiles from snapshot: locked cells + failed piece
  const spawnTiles = useCallback(() => {
    const boardEl = boardElement || (typeof document !== 'undefined' ? document.getElementById('tetris-canvas') : null);
    const newParts: PhysicsTile[] = [];

    let left = typeof window !== 'undefined' ? Math.max(0, (window.innerWidth - 380) / 2) : 100;
    let top = 80;
    let width = 380;
    if (boardEl) {
      const rect = boardEl.getBoundingClientRect();
      if (rect.width > 0) {
        width = rect.width;
        left = rect.left;
        top = rect.top;
      }
    }
    const cs = width / 10;
    const cx0 = left + width / 2;
    const up = isDone ? 1.5 : 1;

    const addTile = (x: number, y: number, alpha: number, isAccent: boolean) => {
      const vx = (x - cx0) * (1.1 + Math.random()) + (Math.random() - 0.5) * 180;
      const vy = -(120 + Math.random() * 520) * up;
      const va = (Math.random() - 0.5) * 11;
      newParts.push({
        x,
        y,
        vx,
        vy,
        a: 0,
        va,
        s: cs - 3,
        al: isAccent ? 1 : alpha,
        acc: isAccent,
        rest: false,
        cur: 0.9,
      });
    };

    // 1. Locked blocks from gridSnapshot
    if (gridSnapshot && gridSnapshot.length > 0) {
      const startRow = gridSnapshot.length > 20 ? 2 : 0;
      for (let y = startRow; y < gridSnapshot.length; y++) {
        for (let x = 0; x < 10; x++) {
          const cell = gridSnapshot[y][x];
          if (cell) {
            const row = y - startRow;
            const col = x;
            const px = left + (col + 0.5) * cs;
            const py = top + (row + 0.5) * cs;
            addTile(px, py, getPieceAlpha(cell), false);
          }
        }
      }
    }

    // 2. The piece that failed to spawn in accent color
    if (!isDone && failedPieceType && PIECE_SHAPES[failedPieceType]) {
      const shape = PIECE_SHAPES[failedPieceType][0];
      for (const pt of shape) {
        const col = 3 + pt.x;
        const row = Math.max(0, pt.y);
        const px = left + (col + 0.5) * cs;
        const py = top + (row + 0.5) * cs;
        addTile(px, py, 1, true);
      }
    }

    // 3. Fallback: ensure breaking tiles exist even if snapshot was empty
    if (newParts.length === 0) {
      for (let row = 14; row < 20; row++) {
        for (let col = 1; col < 9; col++) {
          if (Math.random() < 0.75) {
            const px = left + (col + 0.5) * cs;
            const py = top + (row + 0.5) * cs;
            addTile(px, py, 0.7, Math.random() < 0.25);
          }
        }
      }
    }

    partsRef.current = newParts;
  }, [boardElement, gridSnapshot, failedPieceType, isDone]);

  // Main lifecycle for physics loop, timeline reveal, Web Audio, and mouse tracking
  useEffect(() => {
    isActiveRef.current = true;
    floorRef.current = null;
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];

    if (typeof window === 'undefined') return;

    const computed = getComputedStyle(document.documentElement);
    computedInkRef.current = computed.getPropertyValue('--ink').trim() || '#111';
    computedAccRef.current = computed.getPropertyValue('--acc').trim() || '#ff3b1f';

    const isReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isFeelOff = !feel.on();
    const skipAnimations = isReducedMotion || isFeelOff;
    const isNewBest = score > 0 && score > previousBest;
    const currentBest = Math.max(bestScore, score, previousBest);

    resizeCanvas();

    // 0ms BOOM Crash/Done sound per GAMEOVER.md §6
    if (!isDone) {
      soundManager.playGameOverCrash();
    } else {
      soundManager.playDoneArpeggio();
    }

    if (skipAnimations) {
      // Reduced motion or Feel Off: poster appears at once with final values; no shake or drops
      setShowFill(false);
      if (bgRef.current) bgRef.current.style.opacity = '0.95';
      if (topRef.current) {
        topRef.current.style.opacity = '1';
        topRef.current.style.transform = 'none';
      }
      if (statsRef.current) {
        statsRef.current.style.opacity = '1';
        statsRef.current.style.transform = 'none';
      }
      if (barRef.current) {
        barRef.current.style.transform = 'none';
      }
      if (scoreValRef.current) scoreValRef.current.textContent = score.toLocaleString();
      if (linesValRef.current) linesValRef.current.textContent = lines.toLocaleString();
      if (piecesValRef.current) piecesValRef.current.textContent = `${piecesLocked} / ${maxPieces}`;
      if (bestValRef.current) bestValRef.current.textContent = currentBest.toLocaleString();
      if (isNewBest && stampRef.current) {
        stampRef.current.style.opacity = '1';
        stampRef.current.style.transform = 'rotate(-8deg) scale(1)';
      }

      // Reduced motion: Retry unlocks after 450ms (GAMEOVER.md §7)
      const rmTimer = setTimeout(() => {
        setIsReady(true);
        isReadyRef.current = true;
        soundManager.playRetryReady();
        try {
          retryBtnRef.current?.focus({ preventScroll: true });
        } catch {}
      }, 450);
      timeoutsRef.current.push(rmTimer);
      return;
    }

    // Normal motion: spawn exploding physics tiles
    spawnTiles();

    // Timeline at 0ms:
    // Accent flash (opacity .5 to 0, 200ms; .25 for done)
    if (flashRef.current) {
      flashRef.current.animate(
        [{ opacity: isDone ? 0.25 : 0.5 }, { opacity: 0 }],
        { duration: 200, fill: 'forwards' }
      );
    }

    // Feel effects at 0ms per GAMEOVER.md §4b:
    // Shake 16px (done: 3px), rotation up to ~1 deg, no vertical bias;
    // Zoom punch +5% (done: none);
    // Slow-motion at 35% speed for 450ms for tile physics (done: none)
    if (!isDone) {
      feel.addPx(16, 0);
      feel.punch(0.05);
      feel.slowMs(450);
    } else {
      feel.addPx(3, 0);
    }

    // Retry bottom fill: 4px accent fill grows along button bottom edge over 900ms, linear
    if (fillRef.current) {
      fillRef.current.animate(
        [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }],
        { duration: 900, easing: 'linear', fill: 'forwards' }
      );
    }

    // Timeline at 300ms:
    // Poster background fades in 0 to .95 over 450ms behind the tiles
    if (bgRef.current) {
      bgRef.current.animate(
        [{ opacity: 0 }, { opacity: 0.95 }],
        { duration: 450, delay: 300, fill: 'forwards' }
      );
    }

    // Timeline at 350ms + i*70ms:
    // Title letters drop in one by one (line 2 letters start 120ms later)
    const letterEls = goRef.current?.querySelectorAll<HTMLElement>('.gc');
    if (letterEls) {
      const line1Length = isDone ? 3 : 4;
      letterEls.forEach((el, i) => {
        const isLine2 = i >= line1Length;
        const d = 350 + i * 70 + (isLine2 ? 120 : 0);
        el.animate(DROP_KEYFRAMES, {
          duration: 650,
          delay: d,
          fill: 'backwards',
        });

        // Letter landing effect at delay + 390ms per GAMEOVER.md §4b:
        // Shake 3px (line 1) or 6px (line 2); LAST letter: 9px shake, +2% zoom punch, 70ms hit stop, 70Hz sub hit
        const isLast = i === letterEls.length - 1;
        const landingTimer = setTimeout(() => {
          feel.addPx(isLast ? 9 : (isLine2 ? 6 : 3), 0);
          if (isLast) {
            hs(70);
            feel.punch(0.02);
          }
          soundManager.playLetterLanding(i, isLast);
        }, d + 390);
        timeoutsRef.current.push(landingTimer);
      });
    }

    // Timeline at 900ms:
    // 1. Top label and meta fade up 8px over 500ms
    if (topRef.current) {
      topRef.current.animate(
        [
          { opacity: 0, transform: 'translateY(8px)' },
          { opacity: 1, transform: 'none' },
        ],
        { duration: 500, delay: 900, fill: 'forwards' }
      );
    }

    // 2. Retry unlocks: accent fill wipes away and is REMOVED from DOM, button pulses and takes focus
    const unlockTimer = setTimeout(() => {
      setIsReady(true);
      isReadyRef.current = true;

      const btn = retryBtnRef.current;
      const fill = fillRef.current;

      if (fill) {
        fill.style.transformOrigin = 'right';
        const wipeAnim = fill.animate(
          [{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }],
          { duration: 240, easing: 'cubic-bezier(.7,0,.2,1)', fill: 'forwards' }
        );
        wipeAnim.onfinish = () => {
          setShowFill(false); // Completely REMOVED from the DOM!
        };
      } else {
        setShowFill(false);
      }

      // Button pulse (scale 1 to 1.07 to 1, 260ms)
      if (btn) {
        btn.animate(
          [{ transform: 'scale(1)' }, { transform: 'scale(1.07)' }, { transform: 'scale(1)' }],
          { duration: 260 }
        );
        try {
          btn.focus({ preventScroll: true });
        } catch {}
      }

      // Retry ready chime (Triangle 988Hz, 250ms, vol .07 per GAMEOVER.md §6)
      soundManager.playRetryReady();
    }, 900);
    timeoutsRef.current.push(unlockTimer);

    // Timeline at 1000ms: Stats row fades up 10px over 500ms
    if (statsRef.current) {
      statsRef.current.animate(
        [
          { opacity: 0, transform: 'translateY(10px)' },
          { opacity: 1, transform: 'none' },
        ],
        { duration: 500, delay: 1000, fill: 'forwards' }
      );
    }

    // Timeline at 1100ms + n*120ms:
    // Stat n counts up from 0 to its value over 900ms, ease-out cubic
    const statsConfig = [
      { ref: scoreValRef, target: score, suffix: '' },
      { ref: linesValRef, target: lines, suffix: '' },
      { ref: piecesValRef, target: piecesLocked, suffix: ` / ${maxPieces}` },
      { ref: bestValRef, target: currentBest, suffix: '' },
    ];

    statsConfig.forEach((stat, n) => {
      const delay = 1100 + n * 120;
      const countTimer = setTimeout(() => {
        const t0 = performance.now();
        const dur = 900;
        let lastStep = -1;
        const step = (now: number) => {
          const k = Math.min(1, (now - t0) / dur);
          const e = 1 - Math.pow(1 - k, 3); // ease-out cubic
          const val = Math.round(stat.target * e);
          if (stat.ref.current) {
            stat.ref.current.textContent = val.toLocaleString() + stat.suffix;
          }

          // 16 ticks while counting Score (n === 0) per GAMEOVER.md §6
          if (n === 0 && k < 1) {
            const sN = Math.floor(k * 16);
            if (sN !== lastStep) {
              lastStep = sN;
              soundManager.playCountUpTick(sN);
            }
          }

          if (k < 1 && isActiveRef.current) {
            requestAnimationFrame(step);
          } else if (stat.ref.current) {
            stat.ref.current.textContent = stat.target.toLocaleString() + stat.suffix;
          }
        };
        requestAnimationFrame(step);
      }, delay);
      timeoutsRef.current.push(countTimer);
    });

    // Timeline at 1250ms: Accent bar draws left to right over 500ms, cubic-bezier(.7,0,.2,1)
    if (barRef.current) {
      barRef.current.animate(
        [
          { transform: 'scaleX(0)' },
          { transform: 'scaleX(1)' },
        ],
        {
          duration: 500,
          delay: 1250,
          easing: 'cubic-bezier(.7,0,.2,1)',
          fill: 'forwards',
        }
      );
    }

    // Timeline at 2100ms: If score > previous best and score > 0: NEW BEST stamp slams in
    if (isNewBest && stampRef.current) {
      stampRef.current.animate(
        [
          { opacity: 0, transform: 'rotate(-8deg) scale(2.6)' },
          { opacity: 1, transform: 'rotate(-8deg) scale(1)' },
        ],
        {
          duration: 260,
          delay: 2100,
          easing: 'cubic-bezier(.5,0,1,.6)',
          fill: 'forwards',
        }
      );

      // At 2360ms per GAMEOVER.md §4b: 90ms hit stop, 8px shake, +3% zoom punch, stamp sound
      const stampShakeTimer = setTimeout(() => {
        hs(90);
        feel.addPx(8, 0);
        feel.punch(0.03);
        soundManager.playNewBestStamp();
      }, 2360);
      timeoutsRef.current.push(stampShakeTimer);
    }

    // Mouse tracking for tile repel
    const handlePointerMove = (e: PointerEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener('pointermove', handlePointerMove);

    // Resize listener
    const handleResize = () => {
      resizeCanvas();
    };
    window.addEventListener('resize', handleResize);

    // Physics RAF loop
    let lastTs = performance.now();
    const loop = (ts: number) => {
      if (!isActiveRef.current && partsRef.current.length === 0) {
        rafRef.current = 0;
        return;
      }

      const rawDtMs = Math.min(50, ts - lastTs || 16.666);
      lastTs = ts;
      feel.lr = ts;
      feel.step(rawDtMs);

      const dt = Math.min(0.033, rawDtMs / 1000) * feel.rate;

      const canvas = canvasRef.current;
      if (!canvas) {
        rafRef.current = 0;
        return;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        rafRef.current = 0;
        return;
      }

      const Wd = window.innerWidth;
      const Hd = window.innerHeight;
      const fl = floorRef.current == null ? Hd : floorRef.current;

      ctx.clearRect(0, 0, Wd, Hd);

      const ink = computedInkRef.current;
      const acc = computedAccRef.current;

      for (const p of partsRef.current) {
        if (!p.rest) {
          p.vy += 2000 * dt; // Gravity 2000 px/s^2
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.a += p.va * dt;

          // Floor bounce
          if (p.y > fl - p.s / 2 && floorRef.current == null) {
            p.y = fl - p.s / 2;
            if (Math.abs(p.vy) > 170) {
              p.vy *= -0.38;
              p.vx *= 0.72;
              p.va *= 0.5;
            } else {
              p.vy = 0;
              p.vx *= 0.8;
              p.va *= 0.6;
              if (Math.abs(p.vx) < 14) {
                p.rest = true;
              }
            }
          }

          // Side walls bounce
          if (p.x < p.s / 2) {
            p.x = p.s / 2;
            p.vx *= -0.5;
          }
          if (p.x > Wd - p.s / 2) {
            p.x = Wd - p.s / 2;
            p.vx *= -0.5;
          }
        } else {
          // Resting tiles snap rotation to nearest 90 deg (lerp 0.2)
          const q = Math.PI / 2;
          const target = Math.round(p.a / q) * q;
          p.a += (target - p.a) * 0.2;

          // Mouse repel: within 90px (8100 px^2)
          const dx = p.x - mouseRef.current.x;
          const dy = p.y - mouseRef.current.y;
          if (dx * dx + dy * dy < 8100 && isActiveRef.current) {
            p.rest = false;
            p.vx = dx * 4;
            p.vy = -(180 + Math.random() * 160);
            p.va = (Math.random() - 0.5) * 8;
          }
        }

        // Opacity lerp: resting .18, flying .9 (lerp .12)
        p.cur += ((p.rest ? 0.18 : 0.9) - p.cur) * 0.12;

        // Render physics tile
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.a);
        ctx.globalAlpha = p.cur * (p.acc ? 1 : Math.max(0.35, p.al));
        ctx.fillStyle = p.acc ? acc : ink;
        ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s);
        ctx.restore();
      }

      ctx.globalAlpha = 1;

      // Filter tiles that have fallen below screen when floor is removed
      if (floorRef.current != null) {
        partsRef.current = partsRef.current.filter((p) => p.y < Hd + 200);
      }

      // Apply unified feel transform (smooth noise shake, rotation, and zoom spring) per GAMEOVER.md §4b & §5
      feel.apply(null, goRef.current);

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('resize', handleResize);
      timeoutsRef.current.forEach(clearTimeout);
      timeoutsRef.current = [];
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
    };
  }, [
    resizeCanvas,
    spawnTiles,
    sfx,
    isDone,
    score,
    lines,
    piecesLocked,
    maxPieces,
    bestScore,
    previousBest,
  ]);

  // Handle letter click hop (GAMEOVER.md §7: translateY -34px, rotate -6deg, 340ms, with square blip)
  const handleTitleClick = useCallback(
    (e: React.MouseEvent<HTMLHeadingElement>) => {
      const isReducedMotion =
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (isReducedMotion) return;

      const target = (e.target as HTMLElement).closest<HTMLElement>('.gc');
      if (!target) return;

      target.animate(
        [
          { transform: 'translateY(0) rotate(0)' },
          { transform: 'translateY(-34px) rotate(-6deg)' },
          { transform: 'translateY(0) rotate(0)' },
        ],
        { duration: 340, easing: 'ease-out' }
      );

      // Blip sound (Square 300 to 500Hz random, 80ms, vol .04 per GAMEOVER.md §6)
      soundManager.playLetterClick();
    },
    []
  );

  // Handle Retry click/key: floor removed, fade out 320ms, start new game immediately
  const handleRetry = useCallback(() => {
    if (!isActiveRef.current || !isReadyRef.current) return;
    isActiveRef.current = false;
    floorRef.current = window.innerHeight + 700;
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];

    // Retry exit whoosh per GAMEOVER.md §6
    soundManager.playRetryExit();

    const isReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (goRef.current && !isReducedMotion) {
      goRef.current.animate(
        [{ opacity: 1 }, { opacity: 0 }],
        { duration: 320, fill: 'forwards' }
      );
    }

    // Start new game immediately without waiting for exit animation (GAMEOVER.md §7)
    onRetry();

    // Clear tile list after 1100ms
    setTimeout(() => {
      partsRef.current = [];
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
    }, 1100);
  }, [onRetry]);

  // Swallow ALL game keyboard input in capture phase while screen is visible,
  // allow Tab focus cycling and modifier combos, trigger retry on R / Space / Enter only after unlock
  useEffect(() => {
    const handleKeyDownCapture = (e: KeyboardEvent) => {
      if (!isActiveRef.current) return;

      // Allow modifier combos (Ctrl+R, Cmd+R, Alt, etc.)
      if (e.metaKey || e.ctrlKey || e.altKey) {
        return;
      }

      // Tab navigation focus trap between secondary button and Retry
      if (e.key === 'Tab') {
        const secBtn = secondaryBtnRef.current;
        const retryBtn = retryBtnRef.current;
        if (!secBtn || !retryBtn) return;

        if (e.shiftKey) {
          // Shift + Tab: if on secondary button, wrap to Retry (if unlocked)
          if (document.activeElement === secBtn) {
            e.preventDefault();
            if (isReadyRef.current && !retryBtn.disabled) {
              retryBtn.focus();
            }
          } else if (document.activeElement === retryBtn) {
            e.preventDefault();
            secBtn.focus();
          }
        } else {
          // Tab: if on Retry, wrap to secondary button; if on secondary, wrap to Retry
          if (document.activeElement === retryBtn) {
            e.preventDefault();
            secBtn.focus();
          } else if (document.activeElement === secBtn) {
            e.preventDefault();
            if (isReadyRef.current && !retryBtn.disabled) {
              retryBtn.focus();
            }
          }
        }
        return;
      }

      // Swallow ALL game keyboard input during capture phase!
      e.stopImmediatePropagation();
      e.stopPropagation();

      // Only allow retry via R, Space, or Enter AFTER unlock (first 900ms is locked)
      const k = e.key.toLowerCase();
      if (isReadyRef.current && (k === 'r' || k === ' ' || k === 'enter')) {
        e.preventDefault();
        handleRetry();
      }
    };

    // Registered in the CAPTURE phase (third arg: true)
    window.addEventListener('keydown', handleKeyDownCapture, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDownCapture, true);
    };
  }, [handleRetry]);

  const handleShare = useCallback(() => {
    const text = `Block Builder: ${score.toLocaleString()} points, ${lines} lines`;
    const setFeedback = (msg: string) => {
      setShareText(msg);
      setTimeout(() => setShareText('Share'), 1400);
    };

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(
          () => setFeedback('Copied'),
          () => setFeedback('Copy blocked')
        );
      } else {
        setFeedback('Copy blocked');
      }
    } catch {
      setFeedback('Copy blocked');
    }
  }, [score, lines]);

  const handleOpenLeaderboard = useCallback(() => {
    if (onOpenLeaderboard) {
      isActiveRef.current = false;
      onOpenLeaderboard();
    }
  }, [onOpenLeaderboard]);


  const isNewBest = score > 0 && score > previousBest;
  const currentBest = Math.max(bestScore, score, previousBest);
  const isReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const topLabel = isDone
    ? 'Run complete · 100 / 100'
    : mode === 'daily'
    ? `Run ended · Daily 100 No. ${dayNumber}`
    : 'Run ended · Practice';

  const line1 = isDone ? 'RUN' : 'GAME';
  const line2 = isDone ? 'DONE' : 'OVER';

  const posterContent = (
    <div
      id="go"
      ref={goRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="gt"
      style={{ display: 'block' }}
    >
      {/* Screen-reader result announcement (GAMEOVER.md §9) */}
      <div className="sr-only" aria-live="polite">
        {isDone ? 'Run complete' : 'Game over'}. Score {score.toLocaleString()}. {lines} lines.
      </div>

      {/* Dim background behind tiles */}
      <div className="gbg" ref={bgRef} />

      {/* Physics Canvas behind UI text */}
      <canvas id="gc" ref={canvasRef} aria-hidden="true" />

      {/* Accent flash overlay */}
      <div className="gfl" ref={flashRef} aria-hidden="true" />

      {/* Main content wrapper */}
      <div className="gw" id="gw">
        {/* Top bar: Left mode label, Right meta stats */}
        <div className="gtop" ref={topRef}>
          <div className="glb" id="glb">
            {topLabel}
          </div>
          <div className="gmeta" id="gmt">
            <div>Time {formatDuration(durationMs)}</div>
            <div>Level {level}</div>
            {rankInfo && (
              <>
                <div id="gmeta-rank">Rank #{rankInfo.rank.toLocaleString()} of {rankInfo.total.toLocaleString()}</div>
                <div id="gmeta-pct">Top {rankInfo.percentile}</div>
              </>
            )}
            {isVerified && <div>Replay verified</div>}
            {mode === 'daily' && (
              <div id="gmeta-chain" style={{ color: 'var(--acc)', fontWeight: 500 }}>
                {submissionPhase === 'sponsoring' && 'Sponsoring (gasless)...'}
                {submissionPhase === 'confirming' && (isMainnet ? 'Confirming on Avalanche...' : 'Confirming on Fuji...')}
                {(submissionPhase === 'success' || (txHash && txHash.startsWith('0x'))) && (isMainnet ? 'Recorded on Avalanche ✓' : 'Recorded on Fuji ✓')}
              </div>
            )}
          </div>
        </div>

        {/* Big two-line title: line 1 outline, line 2 solid */}
        <h2
          className="gtt"
          id="gt"
          aria-label={isDone ? 'Run complete' : 'Game over'}
          onClick={handleTitleClick}
        >
          <div className="gln" id="g1">
            {[...line1].map((c, i) => (
              <span key={`l1-${i}`} className="gc">
                {c}
              </span>
            ))}
          </div>
          <div className="gln" id="g2">
            {[...line2].map((c, i) => (
              <span key={`l2-${i}`} className="gc">
                {c}
              </span>
            ))}
          </div>
        </h2>

        {/* Accent bar under title */}
        <i className="gbar" id="gbar" ref={barRef} aria-hidden="true" />

        {/* Bottom stats row & action buttons */}
        <div className="gst" id="gst" ref={statsRef}>
          <div className="gs">
            <div className="l">Score</div>
            <div className="gv" data-i="0" ref={scoreValRef}>
              {isReducedMotion ? score.toLocaleString() : '0'}
            </div>
            {isNewBest && (
              <div className="gstamp" id="gsp" ref={stampRef}>
                NEW BEST
              </div>
            )}
          </div>

          <div className="gs">
            <div className="l">Lines</div>
            <div className="gv" data-i="1" ref={linesValRef}>
              {isReducedMotion ? lines.toLocaleString() : '0'}
            </div>
          </div>

          <div className="gs">
            <div className="l">Pieces</div>
            <div className="gv" data-i="2" ref={piecesValRef}>
              {isReducedMotion ? `${piecesLocked} / ${maxPieces}` : `0 / ${maxPieces}`}
            </div>
          </div>

          <div className="gs">
            <div className="l">Best</div>
            <div className="gv" data-i="3" ref={bestValRef}>
              {isReducedMotion ? currentBest.toLocaleString() : '0'}
            </div>
          </div>

          <div className="gact">
            {mode === 'daily' && (
              <>
                {/* 1. View on SnowTrace Proof Button */}
                {txHash && txHash.startsWith('0x') && (
                  <a
                    id="view-snowtrace-btn"
                    className="btn"
                    href={
                      txHash.length === 66
                        ? `${explorerBase}/tx/${txHash}`
                        : `${explorerBase}/address/${playerWallet || '0x8e3be8a5a13a8fc89d8e04cc07447514f2bf2c40'}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      textDecoration: 'none',
                    }}
                    title="View verified on-chain proof on SnowTrace"
                  >
                    <span>View on SnowTrace</span>
                    <span aria-hidden="true">↗</span>
                  </a>
                )}

                {/* 2. Confirming UserOp link */}
                {!txHash && userOpHash && (
                  <a
                    id="view-userop-btn"
                    className="btn"
                    href={`https://jiffyscan.xyz/userOpHash/${userOpHash}?network=${isMainnet ? 'avalanche' : 'avalanche-fuji'}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      textDecoration: 'none',
                    }}
                    title="View ERC-4337 UserOp on JiffyScan"
                  >
                    <span>Confirming... (UserOp ↗)</span>
                  </a>
                )}

                {/* 3. Sponsoring state */}
                {!txHash && !userOpHash && submissionPhase === 'sponsoring' && (
                  <button className="btn" type="button" disabled title="SmoothSend gasless sponsorship in progress">
                    Sponsoring (gasless)...
                  </button>
                )}

                {/* 4. Prompt login if not logged in */}
                {!txHash && !userOpHash && !isAuth && submissionPhase !== 'sponsoring' && onLogin && (
                  <button
                    id="login-record-btn"
                    className="btn p"
                    type="button"
                    onClick={onLogin}
                    title={`Log in to record your run on ${isMainnet ? 'Avalanche' : 'Avalanche Fuji'} (gasless)`}
                  >
                    Log in to record
                  </button>
                )}
              </>
            )}

            {mode === 'daily' ? (
              <button
                className="btn"
                id="glb-btn"
                ref={secondaryBtnRef}
                type="button"
                onClick={handleOpenLeaderboard}
              >
                Leaderboard
              </button>
            ) : (
              <button
                className="btn"
                id="gsh"
                ref={secondaryBtnRef}
                type="button"
                onClick={handleShare}
              >
                {shareText}
              </button>
            )}
            <button
              className="btn p gretry"
              id="grt"
              ref={retryBtnRef}
              type="button"
              disabled={!isReady}
              onClick={(e) => {
                e.currentTarget.blur();
                handleRetry();
              }}
            >
              {showFill && <i className="gfill" id="gfl" ref={fillRef} aria-hidden="true" />}
              <span>Retry</span>
              <kbd>R</kbd>
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return posterContent;
}

export default function GameOverPoster(props: GameOverPosterProps) {
  const [mounted, setMounted] = useState<boolean>(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || typeof document === 'undefined') {
    return null;
  }

  return createPortal(<GameOverPosterModal {...props} />, document.body);
}
