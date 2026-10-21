'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Action,
  applyAction,
  BOARD_TOTAL_HEIGHT,
  BOARD_VISIBLE_HEIGHT,
  BOARD_WIDTH,
  canPlace,
  createInitialState,
  feel,
  FeelMode,
  GameEngineState,
  getGhostY,
  HIDDEN_ROWS,
  lockPiece,
  LogEntry,
  PieceType,
  PIECE_COLORS,
  PIECE_SHAPES,
  replay,
  stepTick,
} from '@/lib/engine';
import GameOverPoster from './gameover/GameOverPoster';
import { useWalletAuth, resolveSmartAccountAddress } from '@/lib/web3/useWalletAuth';
import { useBlockBuilderSubmit } from '@/lib/web3/useBlockBuilderSubmit';
import { soundManager } from '@/lib/leaderboard/sound';
import { musicManager } from '@/lib/audio/MusicManager';
import { SidebarAudioControls } from './audio/MusicControls';

interface GameBoardProps {
  mode: 'practice' | 'daily';
  seed?: number;
  day?: number;
  maxPieces?: number;
  soundEnabled?: boolean;
  onOpenLeaderboard?: () => void;
  onPlayPractice?: () => void;
  introActive?: boolean;
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

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  s: number;
  life: number;
  max: number;
  isAccent: boolean;
}

export default function GameBoard({
  mode = 'practice',
  seed: propSeed,
  day: propDay,
  maxPieces = 100,
  soundEnabled,
  onOpenLeaderboard,
  onPlayPractice,
  introActive,
}: GameBoardProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const nextCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [seed, setSeed] = useState<number>(() => propSeed ?? Math.floor(Math.random() * 10000000));
  const [currentDay, setCurrentDay] = useState<number>(() => propDay ?? 3);
  const [gameState, setGameState] = useState<'ready' | 'play' | 'pause' | 'over' | 'done'>('ready');
  const [isMuted, setIsMuted] = useState<boolean>(() => (soundEnabled !== undefined ? !soundEnabled : false));
  const [scoreBump, setScoreBump] = useState<boolean>(false);

  useEffect(() => {
    if (propSeed !== undefined) {
      setSeed(propSeed);
    }
  }, [propSeed]);

  useEffect(() => {
    if (propDay !== undefined) {
      setCurrentDay(propDay);
    }
  }, [propDay]);

  useEffect(() => {
    if (soundEnabled !== undefined) {
      setIsMuted(!soundEnabled);
    }
  }, [soundEnabled]);

  // HUD stats for React rendering
  const [score, setScore] = useState<number>(0);
  const [lines, setLines] = useState<number>(0);
  const [level, setLevel] = useState<number>(0);
  const [epochs, setEpochs] = useState<number>(0);
  const [piecesLocked, setPiecesLocked] = useState<number>(0);
  const [replayVerification, setReplayVerification] = useState<{
    matches: boolean;
    replayedScore: number;
  } | null>(null);
  const [bestScore, setBestScore] = useState<number>(0);
  const { smartAccountAddress, eoaAddress, authenticated, ready: authReady, login } = useWalletAuth();
  const {
    submitOnChain,
    submissionPhase,
    txHash: chainTxHash,
    userOpHash: chainUserOpHash,
  } = useBlockBuilderSubmit();
  const [onChainTxHash, setOnChainTxHash] = useState<string | null>(null);
  const [onChainUserOpHash, setOnChainUserOpHash] = useState<string | null>(null);
  const [currentSubmissionPhase, setCurrentSubmissionPhase] = useState<'idle' | 'sponsoring' | 'confirming' | 'success' | 'error'>('idle');

  useEffect(() => {
    if (chainTxHash && chainTxHash.startsWith('0x')) {
      setOnChainTxHash(chainTxHash);
    }
  }, [chainTxHash]);

  useEffect(() => {
    if (chainUserOpHash) {
      setOnChainUserOpHash(chainUserOpHash);
    }
  }, [chainUserOpHash]);

  useEffect(() => {
    if (submissionPhase && submissionPhase !== 'idle') {
      setCurrentSubmissionPhase(submissionPhase);
    }
  }, [submissionPhase]);
  const [signedRunData, setSignedRunData] = useState<any>(null);
  const [gameOverKey, setGameOverKey] = useState<number>(0);
  const [prevBestScore, setPrevBestScore] = useState<number>(0);
  const [isPosterVisible, setIsPosterVisible] = useState(false);
  const [isFreezeActive, setIsFreezeActive] = useState(false);
  const isFreezeActiveRef = useRef(false);
  const freezeStartTimeRef = useRef(0);
  const freezeTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [feelMode, setFeelMode] = useState<FeelMode>(() => feel.getMode());

  const flashBoardRef = useRef<HTMLElement | null>(null);
  const debugRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return feel.subscribe((m) => setFeelMode(m));
  }, []);

  useEffect(() => {
    feel.setFlashElement(flashBoardRef.current);
    feel.setDebugElement(debugRef.current);
  }, []);

  // Pre-resolve Smart Account address for instant signature verification on game over
  const playerSmartAccountRef = useRef<string | null>(null);
  const submitPromiseRef = useRef<Promise<any> | null>(null);

  useEffect(() => {
    if (smartAccountAddress) {
      playerSmartAccountRef.current = smartAccountAddress.toLowerCase();
    } else if (eoaAddress) {
      resolveSmartAccountAddress(eoaAddress)
        .then((addr) => {
          playerSmartAccountRef.current = addr.toLowerCase();
        })
        .catch(() => {
          playerSmartAccountRef.current = eoaAddress.toLowerCase();
        });
    }
  }, [smartAccountAddress, eoaAddress]);

  // Time & duration tracking
  const startTimeRef = useRef<number>(0);
  const durationMsRef = useRef<number>(0);
  const previousBestRef = useRef<number>(0);
  const lastQueueHeadRef = useRef<PieceType | null>(null);
  const gridSnapshotRef = useRef<(PieceType | null)[][] | null>(null);
  const failedPieceRef = useRef<PieceType | null>(null);
  const runIdRef = useRef<string | null>(null);
  const bestScoreRef = useRef<number>(0);

  // Simulation tracking refs (persistent across re-renders to prevent spurious re-triggers)
  const prevLevelRef = useRef<number>(0);
  const prevLinesRef = useRef<number>(0);
  const prevPiecesLockedRef = useRef<number>(0);
  const prevLoopScoreRef = useRef<number>(0);
  const prevEpochsRef = useRef<number>(0);
  const handleEndRunRef = useRef<(engine: GameEngineState, isDone: boolean) => void>(() => {});

  // Logo rotation ref & mobile pad repeat interval ref
  const logoRef = useRef<SVGSVGElement | null>(null);
  const logoDegRef = useRef<number>(0);
  const padRepeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isFirstRunRef = useRef<boolean>(true);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const fxRef = useRef<HTMLDivElement | null>(null);
  const scoreElRef = useRef<HTMLElement | null>(null);
  const dispScoreRef = useRef<number>(0);
  const flashRef = useRef<{ cells: [number, number][]; t: number } | null>(null);
  const trailsRef = useRef<{ x: number; w: number; y0: number; y1: number; t: number }[]>([]);
  const clearingRef = useRef<{ rows: number[]; t: number; prevGrid: (PieceType | null)[][] } | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const comboRef = useRef<number>(-1);
  const shakeRef = useRef<number>(0);

  // Show floating popup helper (+score, SINGLE/DOUBLE/TRIPLE/TETRIS, combo xN, LEVEL N)
  const showPopup = useCallback((text: string, row: number, className: string = '') => {
    const fx = fxRef.current;
    if (!fx) return;
    const el = document.createElement('div');
    el.className = `pop ${className}`.trim();
    el.textContent = text;
    el.style.top = `${((row + 0.5) / BOARD_VISIBLE_HEIGHT) * 100}%`;
    const timer = setTimeout(() => el.remove(), 1100);
    el.onanimationend = () => {
      clearTimeout(timer);
      el.remove();
    };
    fx.appendChild(el);
  }, []);

  // Load best score on mount & clean up touch pad repeat interval
  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem('bb-best')) || 0;
      setBestScore(saved);
      bestScoreRef.current = saved;
      previousBestRef.current = saved;
      setPrevBestScore(saved);
    } catch { }
    return () => {
      if (padRepeatIntervalRef.current) {
        clearInterval(padRepeatIntervalRef.current);
      }
    };
  }, []);

  // Score bump animation on increase
  const prevScoreRef = useRef<number>(0);
  useEffect(() => {
    if (score > prevScoreRef.current) {
      setScoreBump(true);
      const timer = setTimeout(() => setScoreBump(false), 280);
      prevScoreRef.current = score;
      return () => clearTimeout(timer);
    }
    prevScoreRef.current = score;
  }, [score]);

  // Engine state and input log refs for 60 ticks/sec loop
  const engineRef = useRef<GameEngineState | null>(null);
  const logRef = useRef<LogEntry[]>([]);
  const pendingActionsRef = useRef<Action[]>([]);
  const animationFrameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const tickAccumulatorRef = useRef<number>(0);

  // Lazy AudioContext ref (instantiated only after first user input)
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Initialize or resume AudioContext on user interaction using shared soundManager context
  const initAudio = useCallback(() => {
    if (typeof window === 'undefined') return;
    const ac = soundManager.getAudioContext();
    audioCtxRef.current = ac;
  }, []);

  // Web Audio Synth for crisp sound effects exactly as listed in DESIGN.md section 6
  const beep = useCallback(
    (
      f: number,
      d: number = 0.06,
      t: OscillatorType = 'square',
      v: number = 0.045,
      s: number = 0
    ) => {
      if (isMuted) return;
      try {
        if (!audioCtxRef.current) {
          initAudio();
        }
        const ac = audioCtxRef.current;
        if (!ac) return;
        if (ac.state === 'suspended') {
          ac.resume().catch(() => { });
        }
        const o = ac.createOscillator();
        const g = ac.createGain();
        const T = ac.currentTime + s;
        o.type = t;
        o.frequency.value = f;
        g.gain.setValueAtTime(v, T);
        g.gain.exponentialRampToValueAtTime(0.0001, T + d);
        o.connect(g);
        g.connect(ac.destination);
        o.start(T);
        o.stop(T + d + 0.02);
      } catch {
        // Audio error or not allowed
      }
    },
    [isMuted, initAudio]
  );

  // Initialize AudioContext only after the first user input (pointer / keydown / touch)
  useEffect(() => {
    const handleFirstInput = () => {
      initAudio();
      window.removeEventListener('pointerdown', handleFirstInput);
      window.removeEventListener('keydown', handleFirstInput);
      window.removeEventListener('touchstart', handleFirstInput);
    };
    window.addEventListener('pointerdown', handleFirstInput, { passive: true });
    window.addEventListener('keydown', handleFirstInput, { passive: true });
    window.addEventListener('touchstart', handleFirstInput, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', handleFirstInput);
      window.removeEventListener('keydown', handleFirstInput);
      window.removeEventListener('touchstart', handleFirstInput);
    };
  }, [initAudio]);

  // Hook MusicManager into GameBoard state machine per MUSIC.md Section 4
  useEffect(() => {
    musicManager.handleGameState(gameState, Boolean(introActive));
    return () => {
      musicManager.clearStateTimers();
    };
  }, [gameState, introActive]);

  // Global pointerup/cancel to ensure touch pad hold-to-repeat is always stopped
  useEffect(() => {
    const handleGlobalPointerUp = () => {
      if (padRepeatIntervalRef.current) {
        clearInterval(padRepeatIntervalRef.current);
        padRepeatIntervalRef.current = null;
      }
    };
    window.addEventListener('pointerup', handleGlobalPointerUp);
    window.addEventListener('pointercancel', handleGlobalPointerUp);
    return () => {
      window.removeEventListener('pointerup', handleGlobalPointerUp);
      window.removeEventListener('pointercancel', handleGlobalPointerUp);
    };
  }, []);

  // Initialize new game run
  const initGame = useCallback(
    (newSeed: number, startState: 'ready' | 'play' = 'ready') => {
      engineRef.current = createInitialState(newSeed, maxPieces);
      logRef.current = [];
      pendingActionsRef.current = [];
      tickAccumulatorRef.current = 0;
      lastTimeRef.current = 0;
      logoDegRef.current = 0;
      flashRef.current = null;
      trailsRef.current = [];
      clearingRef.current = null;
      particlesRef.current = [];
      comboRef.current = -1;
      shakeRef.current = 0;
      dispScoreRef.current = 0;
      if (freezeTimerRef.current) {
        clearTimeout(freezeTimerRef.current);
        freezeTimerRef.current = null;
      }
      isFreezeActiveRef.current = false;
      setIsFreezeActive(false);
      setIsPosterVisible(false);
      setOnChainTxHash(null);
      setOnChainUserOpHash(null);
      setCurrentSubmissionPhase('idle');
      feel.reset();
      if (fxRef.current) {
        fxRef.current.innerHTML = '';
      }
      if (scoreElRef.current) {
        scoreElRef.current.textContent = '0';
        scoreElRef.current.classList.remove('bump');
      }
      if (wrapRef.current) {
        wrapRef.current.style.transform = '';
        wrapRef.current.classList.remove('lvup');
      }
      if (logoRef.current) {
        logoRef.current.style.transform = 'rotate(0deg)';
      }
      if (startState === 'play') {
        startTimeRef.current = Date.now();
        durationMsRef.current = 0;
        previousBestRef.current = bestScore;
        setGameState('play');
      } else {
        startTimeRef.current = 0;
        durationMsRef.current = 0;
        setGameState('ready');
      }
      prevEpochsRef.current = 0;
      prevLinesRef.current = 0;
      prevPiecesLockedRef.current = 0;
      prevLevelRef.current = 0;
      prevLoopScoreRef.current = 0;
      setScore(0);
      setLines(0);
      setLevel(0);
      setEpochs(0);
      setPiecesLocked(0);
      setReplayVerification(null);
    },
    [maxPieces]
  );

  // Dev-only Line-Clear Lab per FEEL.md §9
  const labSetup = useCallback((n: 1 | 2 | 3 | 4) => {
    const engine = engineRef.current;
    if (!engine) return;

    // Reset grid to empty
    engine.grid = Array.from({ length: BOARD_TOTAL_HEIGHT }, () =>
      Array(BOARD_WIDTH).fill(null)
    );

    // Fill bottom n rows except last column (column 9)
    for (let r = 0; r < n; r++) {
      const y = BOARD_TOTAL_HEIGHT - 1 - r;
      for (let x = 0; x < BOARD_WIDTH - 1; x++) {
        engine.grid[y][x] = 'T';
      }
      engine.grid[y][BOARD_WIDTH - 1] = null;
    }

    // Spawn vertical I-piece above column 9
    // In PIECE_SHAPES['I'][1], rotation 1 has points at x + 2.
    // With piece.x = 7, 7 + 2 = 9 (gap column).
    engine.currentPiece = {
      type: 'I',
      rotation: 1,
      x: 7,
      y: HIDDEN_ROWS,
    };
    engine.gravityTimer = 0;
    engine.lockTimer = 0;
    engine.lockResets = 0;
    engine.isOnGround = false;

    renderCanvas(feel.vt, 16.666);
  }, []);

  // Shared end run handler for natural game over and dev preview
  const handleEndRun = useCallback(
    (engine: GameEngineState, isDone: boolean) => {
      durationMsRef.current = startTimeRef.current > 0 ? Date.now() - startTimeRef.current : 260000;
      gridSnapshotRef.current = engine.grid.map((r) => [...r]);
      failedPieceRef.current = !isDone ? (lastQueueHeadRef.current || 'T') : null;

      // 1. Immediately save best score (GAMEOVER.md §2)
      if (engine.stats.score > bestScoreRef.current) {
        bestScoreRef.current = engine.stats.score;
        setBestScore(engine.stats.score);
        try {
          localStorage.setItem('bb-best', String(engine.stats.score));
        } catch { }
      }

      // 2. Immediately run client replay verification (GAMEOVER.md §2)
      const verifyResult = replay(seed, logRef.current, maxPieces);
      setReplayVerification({
        matches: verifyResult.score === engine.stats.score,
        replayedScore: verifyResult.score,
      });

      // 3. Immediately submit to server for Daily 100 (GAMEOVER.md §2)
      if (mode === 'daily' && runIdRef.current) {
        const currentRunId = runIdRef.current;
        const currentLog = [...logRef.current];
        const playerAddr =
          playerSmartAccountRef.current ||
          smartAccountAddress ||
          eoaAddress ||
          '0x0000000000000000000000000000000000000000';

        const submitPromise = fetch('/api/run/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            runId: currentRunId,
            log: currentLog,
            player: playerAddr,
            durationMs: durationMsRef.current,
          }),
        })
          .then((r) => r.json())
          .then((data) => {
            if (data.score !== undefined) {
              setReplayVerification({
                matches: data.score === engine.stats.score,
                replayedScore: data.score,
              });
              setSignedRunData(data);

              // Silent on-chain recording via SmoothSend ERC-4337
              const isDemoAuthed = typeof window !== 'undefined' && localStorage.getItem('bb-demo-auth') === 'true';
              if (authenticated && authReady && eoaAddress && !isDemoAuthed) {
                if (data.signature && data.signature !== '0x') {
                  setCurrentSubmissionPhase('sponsoring');
                  submitOnChain({
                    day: data.day || currentDay || propDay || 8,
                    score: data.score,
                    lines: data.lines ?? engine.stats.lines,
                    epochs: data.epochs ?? 0,
                    logHash: data.logHash,
                    deadline: data.deadline,
                    signature: data.signature,
                  })
                    .then((submittedTx) => {
                      if (submittedTx && submittedTx.startsWith('0x')) {
                        setOnChainTxHash(submittedTx);
                        setCurrentSubmissionPhase('success');
                        fetch('/api/run/record-tx', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            runId: currentRunId,
                            player: (data.player || playerAddr).toLowerCase(),
                            day: data.day || currentDay || propDay || 8,
                            txHash: submittedTx,
                          }),
                        }).catch(() => {});
                      }
                    })
                    .catch((chainErr) => {
                      console.warn('Silent SmoothSend submission note:', chainErr);
                    });
                }
              }

              if (typeof window !== 'undefined') {
                try {
                  const finalPlayer = (data.player || playerAddr).toLowerCase();
                  const activeDayNum = data.day || currentDay || 4;
                  localStorage.setItem('bb_last_scw', finalPlayer);
                  if (eoaAddress) {
                    localStorage.setItem(`bb_scw_${eoaAddress.toLowerCase()}`, finalPlayer);
                  }
                  const runInfo = {
                    runId: currentRunId,
                    player: finalPlayer,
                    day: activeDayNum,
                    score: data.score,
                    lines: data.lines ?? engine.stats.lines,
                    durationMs: durationMsRef.current,
                    submittedAt: new Date().toISOString(),
                    txHash: data.txHash || undefined,
                  };
                  localStorage.setItem('bb_last_run', JSON.stringify(runInfo));

                  const rawRuns = localStorage.getItem('bb_user_runs');
                  const runsList = rawRuns ? JSON.parse(rawRuns) : [];
                  const filtered = runsList.filter(
                    (r: any) => !(r.dayNumber === activeDayNum && r.wallet.toLowerCase() === finalPlayer)
                  );
                  filtered.push({
                    wallet: finalPlayer,
                    dayNumber: activeDayNum,
                    score: data.score,
                    lines: data.lines ?? engine.stats.lines,
                    durationMs: durationMsRef.current,
                    submittedAt: new Date().toISOString(),
                    txHash: data.txHash || undefined,
                  });
                  localStorage.setItem('bb_user_runs', JSON.stringify(filtered));
                } catch {}
              }
            }
            return data;
          })
          .catch((err) => {
            console.warn('Failed to submit run to server:', err);
            return null;
          });

        submitPromiseRef.current = submitPromise;
      }

      setGameState(isDone ? 'done' : 'over');

      if (isDone || !feel.on() || feel.isReducedMotion()) {
        setIsPosterVisible(true);
      } else {
        // Freeze-frame per GAMEOVER.md §4a:
        setIsPosterVisible(false);
        setIsFreezeActive(true);
        isFreezeActiveRef.current = true;
        freezeStartTimeRef.current = performance.now();
        feel.death(260);
        soundManager.playFreezeHeartbeatAndRiser();

        if (freezeTimerRef.current) {
          clearTimeout(freezeTimerRef.current);
        }
        freezeTimerRef.current = setTimeout(() => {
          freezeTimerRef.current = null;
          if (engineRef.current && engineRef.current.stats.isGameOver) {
            setIsFreezeActive(false);
            isFreezeActiveRef.current = false;
            feel.death(0);
            setIsPosterVisible(true);
          }
        }, 260);
      }
    },
    [bestScore, currentDay, eoaAddress, maxPieces, mode, seed, smartAccountAddress]
  );
  handleEndRunRef.current = handleEndRun;

  // Dev-only game over preview per GAMEOVER.md & design/gameover-reference.html
  const triggerDevGameOver = useCallback(
    (kind: 'over' | 'done' = 'over', mockScore: number = 28640, mockLines: number = 24, prevBest?: number) => {
      const engine = engineRef.current;
      if (!engine) return;

      if (prevBest !== undefined) {
        setPrevBestScore(prevBest);
        previousBestRef.current = prevBest;
      }

      if (kind === 'over') {
        for (let c = 0; c < BOARD_WIDTH; c++) {
          const h = 7 + Math.floor(Math.random() * 10);
          for (let r = BOARD_TOTAL_HEIGHT - h; r < BOARD_TOTAL_HEIGHT; r++) {
            engine.grid[r][c] = Math.random() < 0.84 ? 'T' : null;
          }
        }
        engine.stats.piecesLocked = 83;
        engine.stats.score = mockScore;
        engine.stats.lines = mockLines;
        engine.stats.level = 3;
        engine.stats.isGameOver = true;
        setScore(mockScore);
        setLines(mockLines);
        setLevel(3);
        setPiecesLocked(83);
        handleEndRun(engine, false);
      } else {
        engine.stats.piecesLocked = 100;
        engine.stats.score = mockScore;
        engine.stats.lines = mockLines;
        engine.stats.level = 4;
        engine.stats.isGameOver = true;
        setScore(mockScore);
        setLines(mockLines);
        setLevel(4);
        setPiecesLocked(100);
        handleEndRun(engine, true);
      }
    },
    [handleEndRun]
  );

  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).__triggerDevGameOver = triggerDevGameOver;
      (window as any).__feel = feel;
      (window as any).__resetGame = () => initGame(Math.floor(Math.random() * 10000000), 'ready');
    }
  }, [triggerDevGameOver, initGame]);

  useEffect(() => {
    initGame(seed, 'ready');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-record silently if player logs in after completing a daily run
  useEffect(() => {
    if (mode !== 'daily' || !signedRunData || currentSubmissionPhase !== 'idle') return;
    const isDemoAuthed = typeof window !== 'undefined' && localStorage.getItem('bb-demo-auth') === 'true';
    if (!authenticated && !isDemoAuthed) return;

    const currentRunId = runIdRef.current;
    if (!currentRunId) return;

    let active = true;
    (async () => {
      try {
        const playerAddr = (smartAccountAddress || eoaAddress || '0x0000000000000000000000000000000000000000').toLowerCase();
        const res = await fetch('/api/run/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            runId: currentRunId,
            log: logRef.current,
            player: playerAddr,
            durationMs: durationMsRef.current,
          }),
        });
        if (!res.ok) return;
        const freshData = await res.json();
        if (!active || !freshData?.signature || freshData.signature === '0x') return;

        setSignedRunData(freshData);
        setCurrentSubmissionPhase('sponsoring');

        const submittedTx = await submitOnChain({
          day: freshData.day || currentDay || propDay || 8,
          score: freshData.score,
          lines: freshData.lines ?? 0,
          epochs: freshData.epochs ?? 0,
          logHash: freshData.logHash,
          deadline: freshData.deadline,
          signature: freshData.signature,
        });

        if (active && submittedTx && submittedTx.startsWith('0x')) {
          setOnChainTxHash(submittedTx);
          setCurrentSubmissionPhase('success');
          fetch('/api/run/record-tx', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              runId: currentRunId,
              player: playerAddr,
              day: freshData.day || currentDay || propDay || 8,
              txHash: submittedTx,
            }),
          }).catch(() => {});
        }
      } catch (err) {
        console.warn('Connect-after-run silent record error:', err);
      }
    })();

    return () => {
      active = false;
    };
  }, [authenticated, signedRunData, currentSubmissionPhase, mode, smartAccountAddress, eoaAddress, currentDay, propDay, submitOnChain]);

  // Start run handler: requests official seed and session ID for Daily 100
  const handleStartRun = useCallback(() => {
    if (gameState !== 'ready') return;
    initAudio();
    beep(330, 0.08);
    startTimeRef.current = Date.now();
    previousBestRef.current = bestScore;

    // Start game immediately on the very first click with zero lag
    initGame(seed, 'play');

    if (mode === 'daily') {
      try {
        const playerAddr = (smartAccountAddress || eoaAddress || '0x0000000000000000000000000000000000000000').toLowerCase();
        fetch('/api/run/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: 'daily',
            player: playerAddr,
            startedAt: startTimeRef.current,
          }),
        })
          .then(async (res) => {
            if (res.ok) {
              const data = await res.json();
              if (data.runId) {
                runIdRef.current = data.runId;
              }
              if (data.day) {
                setCurrentDay(data.day);
              }
              if (data.seed && data.seed !== seed) {
                setSeed(data.seed);
              }
            }
          })
          .catch((e) => {
            console.warn('Could not register daily run with server:', e);
          });
      } catch (e) {
        console.warn('Could not register daily run with server:', e);
      }
    }
  }, [gameState, initAudio, beep, seed, mode, smartAccountAddress, eoaAddress, initGame]);



  // Queue an action from input
  const dispatchAction = useCallback(
    (action: Action) => {
      if (gameState !== 'play' || !engineRef.current) return;

      if (action === 'HARD') {
        const engine = engineRef.current;
        if (engine.currentPiece) {
          const piece = engine.currentPiece;
          const ghostY = getGhostY(engine.grid, piece.type, piece.rotation, piece.x, piece.y);
          const dropRows = ghostY - piece.y;
          const shape = PIECE_SHAPES[piece.type][piece.rotation];
          let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
          for (const pt of shape) {
            if (pt.x < minX) minX = pt.x;
            if (pt.x > maxX) maxX = pt.x;
            if (pt.y < minY) minY = pt.y;
            if (pt.y > maxY) maxY = pt.y;
          }
          const x = piece.x + minX;
          const w = maxX - minX + 1;
          const y0 = Math.max(0, piece.y + minY - HIDDEN_ROWS);
          const y1 = Math.max(0, ghostY + maxY - HIDDEN_ROWS);
          trailsRef.current.push({ x, w, y0, y1, t: feel.vt });

          feel.hard(dropRows);

          // Landing dust squares per FEEL.md §5
          if (dropRows >= 3 && !feel.isReducedMotion() && feel.on()) {
            const cellSize = 38;
            const landingY = Math.min(BOARD_VISIBLE_HEIGHT, y1 + 1) * cellSize;
            const leftX = x * cellSize;
            const rightX = (x + w) * cellSize;
            const dustCount = Math.min(10, 3 + Math.floor(dropRows / 2));
            for (let i = 0; i < dustCount; i++) {
              particlesRef.current.push({
                x: leftX + Math.random() * (rightX - leftX),
                y: landingY - 2,
                vx: (Math.random() - 0.5) * 280,
                vy: -(40 + Math.random() * 200),
                s: 3 + Math.random() * 4,
                life: 0,
                max: 300 + Math.random() * 250,
                isAccent: Math.random() < 0.2,
              });
            }
          }
        }
        beep(90, 0.12, 'sawtooth', 0.07);
      } else if (action === 'CW') {
        beep(420, 0.04);
      } else if (action === 'CCW') {
        beep(350, 0.04);
      } else if (action === 'L' || action === 'R') {
        const engine = engineRef.current;
        if (engine && engine.currentPiece) {
          const p = engine.currentPiece;
          const dx = action === 'L' ? -1 : 1;
          if (!canPlace(engine.grid, p.type, p.rotation, p.x + dx, p.y)) {
            feel.bump(dx);
          }
        }
        beep(240, 0.03);
      }

      pendingActionsRef.current.push(action);
    },
    [gameState, beep]
  );

  // Main 60-Hz Engine Loop with unified virtual game clock per FEEL.md §6
  useEffect(() => {
    const tickMs = 1000 / 60; // 16.666ms per tick

    const loop = (currentTime: number) => {
      if (!lastTimeRef.current) {
        lastTimeRef.current = currentTime;
      }
      const rawDeltaTime = Math.min(50, currentTime - lastTimeRef.current);
      lastTimeRef.current = currentTime;
      feel.lr = currentTime;

      // Virtual game clock: slows down or stops without affecting replay determinism
      const deltaTime = feel.step(rawDeltaTime);
      const virtualNow = feel.vt;

      const engine = engineRef.current;
      if (engine && !engine.stats.isGameOver && gameState === 'play') {
        tickAccumulatorRef.current += deltaTime;

        while (tickAccumulatorRef.current >= tickMs) {
          tickAccumulatorRef.current -= tickMs;

          const activePieceBefore = engine.currentPiece ? { ...engine.currentPiece } : null;
          const gridBefore = engine.grid;

          if (engine.nextQueue.length > 0) {
            lastQueueHeadRef.current = engine.nextQueue[0];
          }

          // 1. Drain pending actions for current tick
          const actionsToApply = [...pendingActionsRef.current];
          pendingActionsRef.current = [];

          for (const act of actionsToApply) {
            logRef.current.push([engine.stats.ticks, act]);
            applyAction(engine, act);
          }

          // 2. Advance 1 engine tick
          stepTick(engine);

          // Check piece lock events
          if (engine.stats.piecesLocked > prevPiecesLockedRef.current) {
            const quantOffset = musicManager.getQuantizedOffset();
            beep(140, 0.07, 'square', 0.045, quantOffset);

            if (activePieceBefore) {
              const cellSize = 38;
              const shape = PIECE_SHAPES[activePieceBefore.type][activePieceBefore.rotation];
              let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
              const cells: [number, number][] = [];
              for (const pt of shape) {
                if (pt.x < minX) minX = pt.x;
                if (pt.x > maxX) maxX = pt.x;
                if (pt.y < minY) minY = pt.y;
                if (pt.y > maxY) maxY = pt.y;
                const gx = activePieceBefore.x + pt.x;
                const gy = activePieceBefore.y + pt.y - HIDDEN_ROWS;
                if (gy >= 0 && gy < BOARD_VISIBLE_HEIGHT) {
                  cells.push([gx, gy]);
                }
              }
              const rx = (activePieceBefore.x + minX) * cellSize;
              const ry = (activePieceBefore.y + minY - HIDDEN_ROWS) * cellSize;
              const rw = (maxX - minX + 1) * cellSize;
              const rh = (maxY - minY + 1) * cellSize;
              feel.lockFx(rx, ry, rw, rh);
              flashRef.current = { cells, t: virtualNow };
            }

            // Rotate logo 90 degrees on each lock
            logoDegRef.current += 90;
            if (logoRef.current) {
              logoRef.current.style.transform = `rotate(${logoDegRef.current}deg)`;
            }

            // Line-clear feel, blink, particles, popups, and combo
            if (engine.stats.lines > prevLinesRef.current) {
              const linesCleared = engine.stats.lines - prevLinesRef.current;
              musicManager.handleLineClear(linesCleared);
              for (let i = 0; i < linesCleared + 2; i++) {
                beep(330 * Math.pow(1.26, i), 0.1, 'square', 0.05, quantOffset + i * 0.06);
              }
              comboRef.current += 1;

              // Game feel: trauma shake, hit stop, zoom punch, board flash, slow-mo per FEEL.md §5
              feel.clear(linesCleared, comboRef.current);

              if (activePieceBefore) {
                const lockedGrid = lockPiece(
                  gridBefore,
                  activePieceBefore.type,
                  activePieceBefore.rotation,
                  activePieceBefore.x,
                  activePieceBefore.y
                );
                const clearedRows: number[] = [];
                for (let y = HIDDEN_ROWS; y < BOARD_TOTAL_HEIGHT; y++) {
                  if (lockedGrid[y].every((c) => c !== null)) {
                    clearedRows.push(y - HIDDEN_ROWS);
                  }
                }
                if (clearedRows.length > 0) {
                  clearingRef.current = {
                    rows: clearedRows,
                    t: virtualNow,
                    prevGrid: lockedGrid,
                  };

                  // Square particles on line clear (2 per cleared cell, 4-12px, gravity 900px/s^2, 0.6-1.0s life)
                  if (!feel.isReducedMotion()) {
                    const cellSize = 38;
                    for (const r of clearedRows) {
                      for (let c = 0; c < BOARD_WIDTH; c++) {
                        for (let k = 0; k < 2; k++) {
                          particlesRef.current.push({
                            x: c * cellSize + cellSize / 2,
                            y: r * cellSize + cellSize / 2,
                            vx: (Math.random() - 0.5) * 420,
                            vy: -Math.random() * 440 - 50,
                            s: 4 + Math.random() * 8,
                            life: 0,
                            max: 600 + Math.random() * 400,
                            isAccent: Math.random() < 0.3,
                          });
                        }
                      }
                    }
                  }

                  // Floating popups (+score, SINGLE/DOUBLE/TRIPLE/TETRIS, combo xN)
                  const midRow = clearedRows.reduce((a, b) => a + b, 0) / clearedRows.length;
                  const ptsMultipliers = [0, 100, 300, 500, 800];
                  const ptsGained = (ptsMultipliers[clearedRows.length] ?? 800) * (engine.stats.level + 1);
                  if (ptsGained > 0) {
                    showPopup(`+${ptsGained.toLocaleString()}`, midRow);
                  }
                  const clearNames = ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'TETRIS'];
                  if (clearedRows.length >= 1 && clearNames[clearedRows.length]) {
                    showPopup(clearNames[clearedRows.length], Math.max(1, midRow - 2), 'big');
                  }
                  if (comboRef.current > 0) {
                    showPopup(`combo ×${comboRef.current + 1}`, Math.min(BOARD_VISIBLE_HEIGHT - 1, midRow + 2));
                  }
                }
              }
              prevLinesRef.current = engine.stats.lines;
            } else {
              comboRef.current = -1;
            }

            // Reactive groove: calculate visible stack height ratio for danger filter (60% threshold)
            let highestOccupiedRow = BOARD_TOTAL_HEIGHT;
            for (let y = 0; y < BOARD_TOTAL_HEIGHT; y++) {
              if (engine.grid[y].some((cell) => cell !== null)) {
                highestOccupiedRow = y;
                break;
              }
            }
            const stackHeight = Math.max(0, BOARD_TOTAL_HEIGHT - highestOccupiedRow);
            const heightRatio = Math.min(1.0, stackHeight / BOARD_VISIBLE_HEIGHT);
            musicManager.handleStackHeight(heightRatio);

            prevPiecesLockedRef.current = engine.stats.piecesLocked;
          }

          // Level up outline pulse and LEVEL N popup (only triggers when level ACTUALLY increases)
          if (engine.stats.level > prevLevelRef.current) {
            musicManager.handleLevelUp();
            if (wrapRef.current) {
              wrapRef.current.classList.remove('lvup');
              void wrapRef.current.offsetWidth;
              wrapRef.current.classList.add('lvup');
            }
            feel.level();
            showPopup(`LEVEL ${engine.stats.level}`, BOARD_VISIBLE_HEIGHT / 2 - 1, 'big');
            [0, 1, 2].forEach((i) => beep(440 * Math.pow(1.5, i), 0.15, 'triangle', 0.06, i * 0.09));
            prevLevelRef.current = engine.stats.level;
          }

          // Check game over
          if (engine.stats.isGameOver) {
            const isDone = engine.stats.piecesLocked >= maxPieces;
            handleEndRunRef.current(engine, isDone);
            break;
          }
        }

        // Score count-up and bump
        const targetScore = engine.stats.score;
        dispScoreRef.current += (targetScore - dispScoreRef.current) * Math.min(1, deltaTime / 110);
        if (Math.abs(targetScore - dispScoreRef.current) < 1) {
          dispScoreRef.current = targetScore;
        }
        if (scoreElRef.current) {
          scoreElRef.current.textContent = Math.round(dispScoreRef.current).toLocaleString();
        }
        if (targetScore > prevLoopScoreRef.current) {
          if (scoreElRef.current) {
            scoreElRef.current.classList.remove('bump');
            void scoreElRef.current.offsetWidth;
            scoreElRef.current.classList.add('bump');
          }
          prevLoopScoreRef.current = targetScore;
        }

        // Sync React HUD state & best score
        setScore(engine.stats.score);
        setLines(engine.stats.lines);
        setLevel(engine.stats.level);
        setEpochs(engine.stats.epochs);
        setPiecesLocked(engine.stats.piecesLocked);
        if (engine.stats.score > bestScoreRef.current) {
          bestScoreRef.current = engine.stats.score;
          setBestScore(engine.stats.score);
          try {
            localStorage.setItem('bb-best', String(engine.stats.score));
          } catch { }
        }
      }

      // Apply shared feel transform (smooth noise shake, rotation, and zoom spring) per FEEL.md §3 & §4
      feel.apply(wrapRef.current);

      // Render Canvas
      renderCanvas(virtualNow, deltaTime);

      if (!engine?.stats.isGameOver || isFreezeActiveRef.current) {
        animationFrameRef.current = requestAnimationFrame(loop);
      }
    };

    animationFrameRef.current = requestAnimationFrame(loop);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [seed, gameState, maxPieces, beep]);

  // Keyboard handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (introActive) {
        return;
      }

      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      initAudio();

      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }

      if (
        e.key === 'p' ||
        e.key === 'P' ||
        e.code === 'KeyP' ||
        e.key === 'Escape' ||
        e.code === 'Escape'
      ) {
        e.preventDefault();
        setGameState((curr) => (curr === 'play' ? 'pause' : curr === 'pause' ? 'play' : curr));
        return;
      }

      if (isPosterVisible || isFreezeActiveRef.current || gameState === 'over' || gameState === 'done') {
        return;
      }

      if (gameState !== 'play') {
        if (e.code === 'Space' || e.code === 'Enter') {
          e.preventDefault();
          if (gameState === 'pause') {
            setGameState('play');
          } else if (gameState === 'ready') {
            handleStartRun();
          }
        }
        return;
      }

      switch (e.code) {
        case 'ArrowLeft':
        case 'KeyA':
          dispatchAction('L');
          break;
        case 'ArrowRight':
        case 'KeyD':
          dispatchAction('R');
          break;
        case 'ArrowDown':
        case 'KeyS':
          dispatchAction('SOFT');
          break;
        case 'ArrowUp':
        case 'KeyX':
          dispatchAction('CW');
          break;
        case 'KeyZ':
          dispatchAction('CCW');
          break;
        case 'Space':
          dispatchAction('HARD');
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dispatchAction, gameState, initAudio, introActive]);

  // Capture-phase key swallow during 260ms freeze-frame per GAMEOVER.md §4a & §7:
  // All game keyboard input is swallowed (stop propagation) except Tab and modifier combos
  useEffect(() => {
    const handleFreezeCapture = (e: KeyboardEvent) => {
      if (!isFreezeActiveRef.current) return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.key === 'Tab') return;
      e.stopImmediatePropagation();
      e.stopPropagation();
      e.preventDefault();
    };

    window.addEventListener('keydown', handleFreezeCapture, true);
    return () => window.removeEventListener('keydown', handleFreezeCapture, true);
  }, []);

  // Canvas drawing routine (Mono Ink spec)
  const renderCanvas = (now: number = performance.now(), dt: number = 16.666) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const engine = engineRef.current;
    if (!engine) return;

    // Draw at 38px per cell for sharpness (380x760)
    const cellSize = 38;
    if (canvas.width !== BOARD_WIDTH * cellSize) {
      canvas.width = BOARD_WIDTH * cellSize;
    }
    if (canvas.height !== BOARD_VISIBLE_HEIGHT * cellSize) {
      canvas.height = BOARD_VISIBLE_HEIGHT * cellSize;
    }

    const computed = typeof window !== 'undefined' ? getComputedStyle(document.documentElement) : null;
    const ink = computed?.getPropertyValue('--ink').trim() || '#111111';
    const acc = computed?.getPropertyValue('--acc').trim() || '#ff3b1f';
    const line = computed?.getPropertyValue('--line').trim() || '#e8e8e8';

    // Clear background
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Subtle grid lines using --line
    ctx.strokeStyle = line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 1; x < BOARD_WIDTH; x++) {
      ctx.moveTo(x * cellSize + 0.5, 0);
      ctx.lineTo(x * cellSize + 0.5, canvas.height);
    }
    for (let y = 1; y < BOARD_VISIBLE_HEIGHT; y++) {
      ctx.moveTo(0, y * cellSize + 0.5);
      ctx.lineTo(canvas.width, y * cellSize + 0.5);
    }
    ctx.stroke();

    // Hard drop streaks (260ms fade)
    trailsRef.current = trailsRef.current.filter((t) => now - t.t < 260);
    trailsRef.current.forEach((t) => {
      ctx.globalAlpha = (1 - (now - t.t) / 260) * 0.28;
      ctx.fillStyle = acc;
      ctx.fillRect(t.x * cellSize, t.y0 * cellSize, t.w * cellSize, (t.y1 - t.y0 + 1) * cellSize);
      ctx.globalAlpha = 1;
    });

    // Draw locked blocks: --ink with alpha = 1 - typeIndex * 0.13 and 1px ink border (no rounded corners, no gradients)
    const isClearing = clearingRef.current && now - clearingRef.current.t < 260;
    const gridToDraw = isClearing && clearingRef.current ? clearingRef.current.prevGrid : engine.grid;

    if (!isPosterVisible) {
      for (let y = HIDDEN_ROWS; y < gridToDraw.length; y++) {
        for (let x = 0; x < BOARD_WIDTH; x++) {
          const cell = gridToDraw[y][x];
          if (cell) {
            const typeIdx = PIECE_TYPE_INDEX[cell] ?? 0;
            const alpha = Math.max(0.08, 1 - typeIdx * 0.13);
            drawMonoBlock(ctx, x * cellSize, (y - HIDDEN_ROWS) * cellSize, cellSize, ink, alpha, ink);
          }
        }
      }
    }

    // Blinking blocked piece during freeze-frame per GAMEOVER.md §4a
    if (isFreezeActiveRef.current && failedPieceRef.current && PIECE_SHAPES[failedPieceRef.current]) {
      const shape = PIECE_SHAPES[failedPieceRef.current][0];
      const elapsed = performance.now() - freezeStartTimeRef.current;
      const isSolid = Math.floor(elapsed / 90) % 2 === 0;

      for (const pt of shape) {
        const col = 3 + pt.x;
        const row = Math.max(0, pt.y);
        const bx = col * cellSize;
        const by = row * cellSize;

        if (isSolid) {
          drawMonoBlock(ctx, bx, by, cellSize, acc, 1.0, ink);
        } else {
          ctx.save();
          ctx.strokeStyle = acc;
          ctx.lineWidth = 3;
          ctx.strokeRect(bx + 1.5, by + 1.5, cellSize - 3, cellSize - 3);
          ctx.restore();
        }
      }
    }

    // Line clear blink (every 65ms for 260ms before the rows are removed)
    if (isClearing && clearingRef.current) {
      const phase = Math.floor((now - clearingRef.current.t) / 65) % 2;
      ctx.fillStyle = phase ? acc : ink;
      clearingRef.current.rows.forEach((r) => {
        ctx.fillRect(0, r * cellSize, BOARD_WIDTH * cellSize, cellSize);
      });
    } else if (clearingRef.current && now - clearingRef.current.t >= 260) {
      clearingRef.current = null;
    }

    // Lock flash (accent over the locked cells, 200ms fade)
    if (flashRef.current && now - flashRef.current.t < 200) {
      ctx.globalAlpha = (1 - (now - flashRef.current.t) / 200) * 0.85;
      ctx.fillStyle = acc;
      flashRef.current.cells.forEach(([gx, gy]) => {
        ctx.fillRect(gx * cellSize, gy * cellSize, cellSize, cellSize);
      });
      ctx.globalAlpha = 1;
    }

    // Square particles on line clear (2 per cleared cell, 4-12px, gravity 900px/s^2, 0.6-1.0s life)
    const prefersReduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!prefersReduced && particlesRef.current.length > 0) {
      const stepDt = Math.min(50, dt);
      particlesRef.current.forEach((p) => {
        p.life += stepDt;
        p.vy += (900 * stepDt) / 1000;
        p.x += (p.vx * stepDt) / 1000;
        p.y += (p.vy * stepDt) / 1000;
        ctx.globalAlpha = Math.max(0, 1 - p.life / p.max);
        ctx.fillStyle = p.isAccent ? acc : ink;
        ctx.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
      });
      ctx.globalAlpha = 1;
      particlesRef.current = particlesRef.current.filter((p) => p.life < p.max);
    } else if (prefersReduced) {
      particlesRef.current = [];
    }

    // Draw Dashed Ghost Piece (4px dash, 4px gap, --acc, 55% opacity)
    if (engine.currentPiece && !engine.stats.isGameOver && !isClearing) {
      const piece = engine.currentPiece;
      const ghostY = getGhostY(engine.grid, piece.type, piece.rotation, piece.x, piece.y);
      const shape = PIECE_SHAPES[piece.type][piece.rotation];

      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = acc;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.55;

      for (const pt of shape) {
        const gx = piece.x + pt.x;
        const gy = ghostY + pt.y - HIDDEN_ROWS;
        if (gy >= 0 && gy < BOARD_VISIBLE_HEIGHT) {
          ctx.strokeRect(gx * cellSize + 2, gy * cellSize + 2, cellSize - 4, cellSize - 4);
        }
      }
      ctx.restore();
    }

    // Draw Active Piece: lock-delay fade on active piece (100% to 45% over 450ms)
    if (engine.currentPiece && !engine.stats.isGameOver && !isClearing) {
      const piece = engine.currentPiece;
      const shape = PIECE_SHAPES[piece.type][piece.rotation];
      const lockRatio = engine.isOnGround ? Math.min(1, (engine.lockTimer * (1000 / 60)) / 450) : 0;
      const activeAlpha = 1 - lockRatio * 0.55;
      const nx = feel.nx(now);

      for (const pt of shape) {
        const px = piece.x + pt.x;
        const py = piece.y + pt.y - HIDDEN_ROWS;
        if (py >= 0 && py < BOARD_VISIBLE_HEIGHT) {
          drawMonoBlock(ctx, px * cellSize + nx, py * cellSize, cellSize, acc, activeAlpha, ink);
        }
      }
    }

    // Draw outline rings (lock ring 170ms ink, level shockwave 650ms acc) per FEEL.md §5
    feel.drawRings(ctx, ink, acc, now);

    // Render Next Queue Canvas
    renderNextQueue(ink);
  };

  const renderNextQueue = (ink: string) => {
    const nextCanvas = nextCanvasRef.current;
    if (!nextCanvas) return;
    const ctx = nextCanvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
    const engine = engineRef.current;
    if (!engine) return;

    const miniSize = 22;
    const queue = engine.nextQueue.slice(0, 3);

    queue.forEach((pType, idx) => {
      const typeIdx = PIECE_TYPE_INDEX[pType] ?? 0;
      const alpha = Math.max(0.08, (1 - typeIdx * 0.13) * (1 - idx * 0.2));
      const shape = PIECE_SHAPES[pType][0];

      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const pt of shape) {
        if (pt.x < minX) minX = pt.x;
        if (pt.x > maxX) maxX = pt.x;
        if (pt.y < minY) minY = pt.y;
        if (pt.y > maxY) maxY = pt.y;
      }
      const pw = (maxX - minX + 1) * miniSize;
      const ph = (maxY - minY + 1) * miniSize;
      const ox = Math.round((nextCanvas.width - pw) / 2 - minX * miniSize);
      const oy = Math.round(10 + idx * 80 + (66 - ph) / 2 - minY * miniSize);

      for (const pt of shape) {
        drawMonoBlock(ctx, ox + pt.x * miniSize, oy + pt.y * miniSize, miniSize, ink, alpha, ink);
      }
    });
  };

  const drawMonoBlock = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    fillColor: string,
    alpha: number,
    borderColor: string
  ) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = fillColor;
    ctx.fillRect(x + 1, y + 1, size - 2, size - 2);

    ctx.globalAlpha = 1;
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 1.5, y + 1.5, size - 3, size - 3);
    ctx.restore();
  };

  // Mobile Touch Pad Handlers (with auto-repeat on hold)
  const handlePadDown = useCallback(
    (e: React.PointerEvent, action: Action) => {
      e.preventDefault();
      if (introActive) return;
      initAudio();
      dispatchAction(action);
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try {
          navigator.vibrate(8);
        } catch { }
      }
      if (['L', 'R', 'SOFT'].includes(action)) {
        if (padRepeatIntervalRef.current) clearInterval(padRepeatIntervalRef.current);
        padRepeatIntervalRef.current = setInterval(() => {
          dispatchAction(action);
        }, 110);
      }
    },
    [dispatchAction, initAudio, introActive]
  );

  const handlePadUp = useCallback(() => {
    if (padRepeatIntervalRef.current) {
      clearInterval(padRepeatIntervalRef.current);
      padRepeatIntervalRef.current = null;
    }
  }, []);



  return (
    <div className="app">
      {/* Left Column (210px): Logo at top, Stats block at bottom */}
      <aside className="L">
        <div className="brand">
          <svg id="logo" ref={logoRef} viewBox="0 0 28 28" aria-hidden="true">
            <rect x="1" y="1" width="12" height="12" fill="var(--acc)" />
            <rect x="15" y="1" width="12" height="12" fill="var(--ink)" />
            <rect x="1" y="15" width="12" height="12" fill="var(--ink)" />
            <rect x="15" y="15" width="12" height="12" fill="none" stroke="var(--ink)" strokeWidth="2" />
          </svg>
          <div>
            BLOCK<br />BUILDER
          </div>
        </div>

        <dl>
          <dt>Score</dt>
          <dd id="sc" ref={scoreElRef} className={scoreBump ? 'bump' : ''}>{score.toLocaleString()}</dd>
          <br />
          <dt>Lines</dt>
          <dd id="li">{lines}</dd>
          <br />
          <dt>Level</dt>
          <dd id="lv">{level}</dd>
          <br />
          <dt>Piece</dt>
          <dd id="pc" className="sm">{piecesLocked} / {maxPieces}</dd>
          <div className="track">
            <div id="bar" style={{ width: `${Math.min(100, (piecesLocked / maxPieces) * 100)}%` }} />
          </div>
          <dt>Best</dt>
          <dd id="bs" className="sm">{Math.max(bestScore, score).toLocaleString()}</dd>
        </dl>
      </aside>

      {/* Center Column: Board Canvas, Effects, Overlays, Mobile Touch Pad */}
      <main className="main">
        <div id="wrap" ref={wrapRef}>
          <i id="ff" ref={flashBoardRef} />
          <canvas
            id="tetris-canvas"
            ref={canvasRef}
            width={BOARD_WIDTH * 38}
            height={BOARD_VISIBLE_HEIGHT * 38}
          />
          <div id="fx" ref={fxRef} />

          {/* Overlays (Start, Pause) */}
          <div
            id="ov"
            className={`ov ${gameState !== 'play' && !isPosterVisible && !isFreezeActive ? 'on' : ''}`}
          >
            {gameState === 'ready' && (
              <>
                <h2 id="oh">{mode === 'daily' ? 'Daily 100' : 'Block Builder'}</h2>
                <p id="op">
                  {mode === 'daily'
                    ? "Today's 100 pieces. Placed once per day. Recorded on Avalanche."
                    : 'Place 100 pieces. Clear lines to build combos.'}
                </p>
                <button
                  id="start-run-btn"
                  className="btn p"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    handleStartRun();
                  }}
                >
                  {mode === 'daily' ? 'Start daily run' : 'Start'}
                </button>
              </>
            )}

            {gameState === 'pause' && (
              <>
                <h2 id="oh">Paused</h2>
                <p id="op">Press P to resume</p>
                <button
                  id="resume-btn"
                  className="btn p"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    initAudio();
                    setGameState('play');
                  }}
                >
                  Resume
                </button>
              </>
            )}
          </div>
        </div>

        {/* Mobile 6-button Touch Pad below the board */}
        <div className="pad">
          <button
            id="mobile-left-btn"
            className="btn"
            data-a="l"
            aria-label="Move left"
            onPointerDown={(e) => handlePadDown(e, 'L')}
            onPointerUp={handlePadUp}
            onPointerLeave={handlePadUp}
            onPointerCancel={handlePadUp}
          >
            ←
          </button>
          <button
            id="mobile-down-btn"
            className="btn"
            data-a="d"
            aria-label="Soft drop"
            onPointerDown={(e) => handlePadDown(e, 'SOFT')}
            onPointerUp={handlePadUp}
            onPointerLeave={handlePadUp}
            onPointerCancel={handlePadUp}
          >
            ↓
          </button>
          <button
            id="mobile-right-btn"
            className="btn"
            data-a="r"
            aria-label="Move right"
            onPointerDown={(e) => handlePadDown(e, 'R')}
            onPointerUp={handlePadUp}
            onPointerLeave={handlePadUp}
            onPointerCancel={handlePadUp}
          >
            →
          </button>
          <button
            id="mobile-ccw-btn"
            className="btn"
            data-a="ccw"
            aria-label="Rotate counter-clockwise"
            onPointerDown={(e) => handlePadDown(e, 'CCW')}
            onPointerUp={handlePadUp}
            onPointerLeave={handlePadUp}
            onPointerCancel={handlePadUp}
          >
            ↺
          </button>
          <button
            id="mobile-cw-btn"
            className="btn"
            data-a="cw"
            aria-label="Rotate clockwise"
            onPointerDown={(e) => handlePadDown(e, 'CW')}
            onPointerUp={handlePadUp}
            onPointerLeave={handlePadUp}
            onPointerCancel={handlePadUp}
          >
            ↻
          </button>
          <button
            id="mobile-drop-btn"
            className="btn"
            data-a="hd"
            aria-label="Hard drop"
            onPointerDown={(e) => handlePadDown(e, 'HARD')}
            onPointerUp={handlePadUp}
            onPointerLeave={handlePadUp}
            onPointerCancel={handlePadUp}
          >
            ⤓
          </button>
        </div>

        {isPosterVisible && (
          <GameOverPoster
            key={`poster-${gameOverKey}-${gameState}-${piecesLocked}-${score}`}
            score={score}
            lines={lines}
            piecesLocked={piecesLocked}
            maxPieces={maxPieces}
            level={level}
            bestScore={bestScore}
            previousBest={prevBestScore}
            durationMs={durationMsRef.current}
            mode={mode}
            dayNumber={signedRunData?.day || currentDay || propDay || 104}
            playerWallet={playerSmartAccountRef.current || smartAccountAddress || eoaAddress || undefined}
            isVerified={Boolean(replayVerification?.matches)}
            isDone={gameState === 'done'}
            boardElement={wrapRef.current || canvasRef.current}
            gridSnapshot={gridSnapshotRef.current || undefined}
            failedPieceType={failedPieceRef.current}
            onRetry={() => {
              initAudio();
              const newSeed = mode === 'daily' ? (propSeed ?? seed) : Math.floor(Math.random() * 10000000);
              setSeed(newSeed);
              initGame(newSeed, 'ready');
            }}
            onOpenLeaderboard={onOpenLeaderboard}
            txHash={onChainTxHash || chainTxHash}
            userOpHash={onChainUserOpHash || chainUserOpHash}
            submissionPhase={currentSubmissionPhase}
            isAuth={authenticated || (typeof window !== 'undefined' && localStorage.getItem('bb-demo-auth') === 'true')}
            onLogin={login}
          />
        )}
      </main>

      {/* Right Column (210px): Next preview at top, key hints in middle, buttons at bottom */}
      <aside className="R">
        <section>
          <h3>Next</h3>
          <canvas id="nx" ref={nextCanvasRef} width={120} height={250} />
        </section>

        <p className="keys">
          ← → move<br />
          ↑ / X rotate<br />
          Z rotate back<br />
          ↓ soft drop<br />
          Space hard drop<br />
          P pause
        </p>

        <div className="btns">
          <SidebarAudioControls />
          <button
            id="fm"
            className="btn"
            type="button"
            onClick={(e) => {
              e.currentTarget.blur();
              feel.cycleMode();
            }}
          >
            Feel: {feelMode[0].toUpperCase() + feelMode.slice(1)}
          </button>
          <button
            id="new-run-btn"
            className="btn"
            onClick={(e) => {
              e.currentTarget.blur();
              initAudio();
              const newSeed = mode === 'daily' ? (propSeed ?? 20261010) : Math.floor(Math.random() * 10000000);
              setSeed(newSeed);
              initGame(newSeed, mode === 'daily' ? 'ready' : 'play');
            }}
          >
            {mode === 'daily' ? 'Restart run' : 'New game'}
          </button>
        </div>

      </aside>
      <div id="dbg" ref={debugRef} />
    </div>
  );
}
