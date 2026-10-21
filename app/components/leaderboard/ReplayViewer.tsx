'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Action,
  applyAction,
  BOARD_WIDTH,
  BOARD_VISIBLE_HEIGHT,
  HIDDEN_ROWS,
  createInitialState,
  GameEngineState,
  getGhostY,
  LogEntry,
  PieceType,
  PIECE_SHAPES,
  stepTick,
} from '@/lib/engine';
import { formatAddress } from '@/lib/leaderboard';
import { soundManager } from '@/lib/leaderboard/sound';

interface ReplayViewerProps {
  day: number;
  seed?: number;
  topRun?: {
    player: string;
    score: number;
    lines: number;
    epochs?: number;
    ticks: number;
    log: LogEntry[];
  };
  onClose: () => void;
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

export default function ReplayViewer({
  day,
  seed: propSeed,
  topRun: propTopRun,
  onClose,
}: ReplayViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [loading, setLoading] = useState<boolean>(!propTopRun || propSeed === undefined);
  const [error, setError] = useState<string | null>(null);
  const [seed, setSeed] = useState<number>(propSeed ?? 20261010);
  const [topRunData, setTopRunData] = useState(propTopRun ?? null);

  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [speed, setSpeed] = useState<1 | 2 | 4>(1);
  const [currentTick, setCurrentTick] = useState<number>(0);
  const [dispScore, setDispScore] = useState<number>(0);
  const [dispLines, setDispLines] = useState<number>(0);
  const [dispPieces, setDispPieces] = useState<number>(0);
  const [isFinished, setIsFinished] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(false);

  // Engine state and actions map
  const engineRef = useRef<GameEngineState | null>(null);
  const actionsByTickRef = useRef<Map<number, Action[]>>(new Map());
  const maxTickRef = useRef<number>(0);
  const animFrameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const tickAccRef = useRef<number>(0);
  const soundEnabledRef = useRef<boolean>(soundEnabled);
  soundEnabledRef.current = soundEnabled;

  // Fetch top run if not passed
  useEffect(() => {
    if (propTopRun && propSeed !== undefined) {
      setTopRunData(propTopRun);
      setSeed(propSeed);
      setLoading(false);
      return;
    }

    setLoading(true);
    fetch(`/api/replay/${day}/top`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.found || !data.topRun) {
          setError(`No recorded replay found for Day #${day} yet.`);
          setLoading(false);
          return;
        }
        setSeed(data.seed || 20261010 + (day - 1));
        setTopRunData(data.topRun);
        setLoading(false);
      })
      .catch((err) => {
        setError(err?.message || 'Failed to load leader replay.');
        setLoading(false);
      });
  }, [day, propSeed, propTopRun]);

  // Initialize engine & pre-group input actions by tick
  const initReplay = useCallback(
    (targetSeed: number, log: LogEntry[]) => {
      const actionsMap = new Map<number, Action[]>();
      let maxT = 0;

      for (const [tick, action] of log) {
        if (!actionsMap.has(tick)) {
          actionsMap.set(tick, []);
        }
        actionsMap.get(tick)!.push(action);
        if (tick > maxT) {
          maxT = tick;
        }
      }

      actionsByTickRef.current = actionsMap;
      maxTickRef.current = Math.max(maxT, 1);

      const state = createInitialState(targetSeed, 100);
      engineRef.current = state;
      setCurrentTick(0);
      setDispScore(0);
      setDispLines(0);
      setDispPieces(0);
      setIsFinished(false);
      tickAccRef.current = 0;
    },
    []
  );

  useEffect(() => {
    if (topRunData && seed !== undefined) {
      initReplay(seed, topRunData.log || []);
    }
  }, [topRunData, seed, initReplay]);

  // Jump/Scrub to specific tick
  const jumpToTick = useCallback(
    (targetTick: number) => {
      if (!topRunData || seed === undefined) return;
      const safeTarget = Math.max(0, Math.min(targetTick, maxTickRef.current + 30));

      const state = createInitialState(seed, 100);
      const actionsMap = actionsByTickRef.current;

      for (let t = 0; t < safeTarget; t++) {
        if (state.stats.isGameOver) break;
        const actions = actionsMap.get(t);
        if (actions) {
          for (const a of actions) {
            if (state.stats.isGameOver) break;
            applyAction(state, a);
          }
        }
        if (state.stats.isGameOver) break;
        stepTick(state);
      }

      engineRef.current = state;
      setCurrentTick(state.stats.ticks);
      setDispScore(state.stats.score);
      setDispLines(state.stats.lines);
      setDispPieces(state.stats.piecesLocked);
      setIsFinished(state.stats.isGameOver || state.stats.ticks >= maxTickRef.current);
      tickAccRef.current = 0;
    },
    [topRunData, seed]
  );

  // Restart replay
  const handleRestart = useCallback(() => {
    jumpToTick(0);
    setIsPlaying(true);
  }, [jumpToTick]);

  // Step 1 tick forward
  const stepForwardOneTick = useCallback(() => {
    const state = engineRef.current;
    if (!state) return;

    if (state.stats.isGameOver || state.stats.ticks >= maxTickRef.current + 60) {
      setIsFinished(true);
      setIsPlaying(false);
      return;
    }

    const currentT = state.stats.ticks;
    const actions = actionsByTickRef.current.get(currentT);
    const prevLines = state.stats.lines;

    if (actions) {
      for (const a of actions) {
        if (state.stats.isGameOver) break;
        applyAction(state, a);
      }
    }

    if (!state.stats.isGameOver) {
      stepTick(state);
    }

    if (soundEnabledRef.current && state.stats.lines > prevLines) {
      soundManager.beep(520, 0.08, 'square');
    }

    setCurrentTick(state.stats.ticks);
    setDispScore(state.stats.score);
    setDispLines(state.stats.lines);
    setDispPieces(state.stats.piecesLocked);

    if (state.stats.isGameOver || state.stats.ticks >= maxTickRef.current + 60) {
      setIsFinished(true);
      setIsPlaying(false);
    }
  }, []);

  // Canvas drawing
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const state = engineRef.current;
    if (!state) return;

    const cellSize = 28;
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

    // Background clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Grid lines
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

    // Locked blocks
    for (let y = HIDDEN_ROWS; y < state.grid.length; y++) {
      for (let x = 0; x < BOARD_WIDTH; x++) {
        const cell = state.grid[y][x];
        if (cell) {
          const typeIdx = PIECE_TYPE_INDEX[cell] ?? 0;
          const alpha = Math.max(0.08, 1 - typeIdx * 0.13);

          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.fillStyle = ink;
          ctx.fillRect(x * cellSize + 1, (y - HIDDEN_ROWS) * cellSize + 1, cellSize - 2, cellSize - 2);
          ctx.globalAlpha = 1;
          ctx.strokeStyle = ink;
          ctx.lineWidth = 1;
          ctx.strokeRect(x * cellSize + 1.5, (y - HIDDEN_ROWS) * cellSize + 1.5, cellSize - 3, cellSize - 3);
          ctx.restore();
        }
      }
    }

    // Ghost piece
    if (state.currentPiece && !state.stats.isGameOver) {
      const piece = state.currentPiece;
      const ghostY = getGhostY(state.grid, piece.type, piece.rotation, piece.x, piece.y);
      const shape = PIECE_SHAPES[piece.type][piece.rotation];

      ctx.save();
      ctx.setLineDash([3, 3]);
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

    // Active falling piece
    if (state.currentPiece && !state.stats.isGameOver) {
      const piece = state.currentPiece;
      const shape = PIECE_SHAPES[piece.type][piece.rotation];

      for (const pt of shape) {
        const px = piece.x + pt.x;
        const py = piece.y + pt.y - HIDDEN_ROWS;
        if (py >= 0 && py < BOARD_VISIBLE_HEIGHT) {
          ctx.save();
          ctx.fillStyle = acc;
          ctx.fillRect(px * cellSize + 1, py * cellSize + 1, cellSize - 2, cellSize - 2);
          ctx.strokeStyle = ink;
          ctx.lineWidth = 1;
          ctx.strokeRect(px * cellSize + 1.5, py * cellSize + 1.5, cellSize - 3, cellSize - 3);
          ctx.restore();
        }
      }
    }
  }, []);

  // Animation frame loop
  useEffect(() => {
    lastTimeRef.current = performance.now();

    const loop = (time: number) => {
      const dt = Math.min(100, time - lastTimeRef.current);
      lastTimeRef.current = time;

      if (isPlaying && !isFinished) {
        tickAccRef.current += dt;
        const msPerTick = (1000 / 60) / speed;

        while (tickAccRef.current >= msPerTick) {
          tickAccRef.current -= msPerTick;
          stepForwardOneTick();
          if (!isPlaying || isFinished) break;
        }
      }

      renderCanvas();
      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [isPlaying, isFinished, speed, stepForwardOneTick, renderCanvas]);

  // Keyboard navigation: Space (pause/play), 1/2/4 (speed), R (restart), Esc (close)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.code === 'Space') {
        e.preventDefault();
        if (isFinished) {
          handleRestart();
        } else {
          setIsPlaying((p) => !p);
        }
      } else if (e.key === '1') {
        setSpeed(1);
      } else if (e.key === '2') {
        setSpeed(2);
      } else if (e.key === '4') {
        setSpeed(4);
      } else if (e.key === 'r' || e.key === 'R') {
        handleRestart();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, isFinished, handleRestart]);

  const maxTicks = maxTickRef.current || 1;
  const progressRatio = Math.max(0, Math.min(1, currentTick / maxTicks));

  return (
    <div
      className="replay-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={`Replay of Leader run for Day #${day}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="replay-modal-card">
        {/* Header */}
        <div className="replay-header">
          <div className="replay-header-left">
            <span className="replay-badge">GHOST OF THE LEADER</span>
            <div className="replay-subtitle">
              Day #{day} · {topRunData?.player ? formatAddress(topRunData.player) : 'Unknown'}
            </div>
          </div>
          <div className="replay-header-right">
            <div className="replay-score-readout">
              <span className="replay-score-val">{dispScore.toLocaleString()}</span>
              <span className="replay-score-max">/ {topRunData?.score.toLocaleString() || '—'} PTS</span>
            </div>
            <button
              id="replay-close-btn"
              className="btn replay-close-btn"
              onClick={onClose}
              aria-label="Close replay"
              title="Close (Esc)"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content Body */}
        {loading ? (
          <div className="replay-loading-state">
            <span className="replay-spinner" />
            <span>Loading leader run move-by-move...</span>
          </div>
        ) : error ? (
          <div className="replay-error-state">
            <p>{error}</p>
            <button className="btn p" onClick={onClose} style={{ marginTop: '12px' }}>
              Close
            </button>
          </div>
        ) : (
          <>
            {/* Center Board Canvas */}
            <div className="replay-canvas-wrap">
              <canvas
                ref={canvasRef}
                className="replay-canvas"
                width={BOARD_WIDTH * 28}
                height={BOARD_VISIBLE_HEIGHT * 28}
              />
              {isFinished && (
                <div className="replay-finished-banner">
                  <div className="replay-finished-title">RUN FINISHED</div>
                  <div className="replay-finished-sub">
                    Final Score: {topRunData?.score.toLocaleString()} · Lines: {dispLines}
                  </div>
                  <button className="btn p" onClick={handleRestart} style={{ marginTop: '8px' }}>
                    ↺ Watch again
                  </button>
                </div>
              )}
            </div>

            {/* Scrub / Progress Bar */}
            <div className="replay-scrub-container">
              <div
                className="replay-scrub-track"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const clickX = e.clientX - rect.left;
                  const ratio = Math.max(0, Math.min(1, clickX / rect.width));
                  jumpToTick(Math.round(ratio * maxTicks));
                }}
              >
                <div className="replay-scrub-fill" style={{ width: `${progressRatio * 100}%` }} />
                <div
                  className="replay-scrub-marker"
                  style={{ left: `calc(${progressRatio * 100}% - 3px)` }}
                />
              </div>
              <div className="replay-scrub-labels">
                <span>
                  Piece {dispPieces} / 100 · {dispLines} lines
                </span>
                <span>
                  Tick {currentTick} / {maxTicks} ({Math.floor(currentTick / 60)}s / {Math.floor(maxTicks / 60)}s)
                </span>
              </div>
            </div>

            {/* Controls Bar */}
            <div className="replay-controls-bar">
              <div className="replay-controls-left">
                <button
                  id="replay-play-pause-btn"
                  className="btn p replay-control-btn"
                  onClick={() => {
                    if (isFinished) {
                      handleRestart();
                    } else {
                      setIsPlaying((p) => !p);
                    }
                  }}
                  title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
                >
                  {isFinished ? '↺ Restart' : isPlaying ? '⏸ Pause' : '▶ Play'}
                </button>

                <button
                  id="replay-restart-btn"
                  className="btn replay-control-btn"
                  onClick={handleRestart}
                  title="Restart from beginning (R)"
                >
                  ↺
                </button>

                <button
                  id="replay-sound-btn"
                  className={`btn replay-control-btn ${soundEnabled ? 'p' : ''}`}
                  onClick={() => setSoundEnabled((s) => !s)}
                  title={soundEnabled ? 'Mute sound' : 'Enable sound'}
                >
                  {soundEnabled ? '♫ On' : '♫ Off'}
                </button>
              </div>

              <div className="replay-speed-group" role="group" aria-label="Playback speed">
                <span className="replay-speed-label">Speed:</span>
                {([1, 2, 4] as const).map((sVal) => (
                  <button
                    key={sVal}
                    className={`btn replay-speed-btn ${speed === sVal ? 'active' : ''}`}
                    onClick={() => setSpeed(sVal)}
                    title={`Playback speed ${sVal}× (${sVal})`}
                  >
                    {sVal}×
                  </button>
                ))}
              </div>
            </div>

            {/* Keyboard shortcuts hints */}
            <div className="replay-shortcuts-hint">
              <span>Space: Play/Pause</span>
              <span>·</span>
              <span>1 / 2 / 4: Speed</span>
              <span>·</span>
              <span>R: Restart</span>
              <span>·</span>
              <span>Esc: Close</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
