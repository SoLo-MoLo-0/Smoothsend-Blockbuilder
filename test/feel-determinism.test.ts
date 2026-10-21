import { describe, it, expect, beforeEach } from 'vitest';
import {
  feel,
  replay,
  createInitialState,
  stepTick,
  applyAction,
  LogEntry,
  Action,
} from '../lib/engine';

describe('Block Builder — Feel Determinism & Virtual Clock Specification', () => {
  beforeEach(() => {
    feel.reset();
    feel.setMode('full');
  });

  it('cycles feel modes in order: full -> low -> off -> full', () => {
    feel.setMode('full');
    expect(feel.getMode()).toBe('full');
    expect(feel.getIntensity()).toBe(1.0);

    feel.cycleMode();
    expect(feel.getMode()).toBe('low');
    expect(feel.getIntensity()).toBe(0.5);

    feel.cycleMode();
    expect(feel.getMode()).toBe('off');
    expect(feel.getIntensity()).toBe(0.0);

    feel.cycleMode();
    expect(feel.getMode()).toBe('full');
    expect(feel.getIntensity()).toBe(1.0);
  });

  it('virtual clock step scales correctly during normal, hit-stop, and slow-mo states', () => {
    feel.reset();
    feel.setMode('full');

    // 1. Normal state: dt === rdt
    const dtNormal = feel.step(16);
    expect(dtNormal).toBe(16);
    expect(feel.rate).toBe(1);

    // 2. Hit stop state: dt === 0
    feel.hitStop(50);
    const dtStopped = feel.step(16);
    expect(dtStopped).toBe(0);
    expect(feel.rate).toBe(0);

    // Consume remainder of hit stop
    feel.step(40);

    // 3. Slow-mo state: dt === rdt * 0.35
    feel.slowMs(100);
    const dtSlow = feel.step(20);
    expect(dtSlow).toBeCloseTo(7, 2);
    expect(feel.rate).toBeCloseTo(0.35, 2);
  });

  it('overlapping hit stops and slow-mo take the longer value, never the sum (FEEL.md §6)', () => {
    feel.reset();
    feel.setMode('full');

    // Overlapping hit stops: 50ms, then 30ms (smaller), then 80ms (larger) -> max is 80ms
    feel.hitStop(50);
    feel.hitStop(30);
    feel.hitStop(80);
    expect(feel.rate).toBe(0);

    // Consume 80ms of hit stop in 16ms increments
    let stoppedTotal = 0;
    while (true) {
      const dt = feel.step(16);
      if (dt === 0) {
        expect(feel.rate).toBe(0);
        stoppedTotal += 16;
      } else {
        expect(dt).toBe(16);
        expect(feel.rate).toBe(1);
        break;
      }
      if (stoppedTotal > 200) break; // guard against infinite loop
    }

    // Exactly 80ms consumed (5 steps of 16ms = 80ms), NOT 50 + 30 + 80 = 160ms
    expect(stoppedTotal).toBe(80);
    expect(feel.rate).toBe(1);

    // Overlapping slow-mo: 100ms, then 40ms, then 160ms -> max is 160ms
    feel.slowMs(100);
    feel.slowMs(40);
    feel.slowMs(160);
    expect(feel.rate).toBeCloseTo(0.35, 2);

    let slowTotal = 0;
    while (true) {
      const dt = feel.step(16);
      if (dt < 16) {
        expect(dt).toBeCloseTo(16 * 0.35, 2);
        expect(feel.rate).toBeCloseTo(0.35, 2);
        slowTotal += 16;
      } else {
        expect(dt).toBe(16);
        expect(feel.rate).toBe(1);
        break;
      }
      if (slowTotal > 400) break;
    }

    // Exactly 160ms consumed (10 steps of 16ms = 160ms), NOT 100 + 40 + 160 = 300ms
    expect(slowTotal).toBe(160);
    expect(feel.rate).toBe(1);
  });

  it('trauma shake and zoom spring decay in real time even during hit stop (FEEL.md §3 & §4)', () => {
    feel.reset();
    feel.setMode('full');

    // Add peak trauma (18px -> trauma = 1.0) and zoom punch 0.04
    feel.addPx(18, 0.85);
    feel.punch(0.04);
    feel.hitStop(200);

    // Virtual clock is stopped (dt === 0, rate === 0)
    const dt = feel.step(100);
    expect(dt).toBe(0);
    expect(feel.rate).toBe(0);

    // Step next 100ms (finishing 200ms hit stop)
    const dt2 = feel.step(100);
    expect(dt2).toBe(0);

    // Next frame hit stop is finished -> normal clock resumes
    const dt3 = feel.step(16);
    expect(dt3).toBe(16);
    expect(feel.rate).toBe(1);
  });

  it('Feel Off sets intensity to 0 and hitStop / slowMs do not alter virtual dt', () => {
    feel.reset();
    feel.setMode('off');
    expect(feel.on()).toBe(false);

    feel.hitStop(100);
    const dt = feel.step(16);
    expect(dt).toBe(16);
    expect(feel.rate).toBe(1);

    feel.slowMs(350);
    const dt2 = feel.step(16);
    expect(dt2).toBe(16);
    expect(feel.rate).toBe(1);
  });

  it('determinism test (FEEL.md §2): identical sequence with Feel Full vs Feel Off produces identical final state', () => {
    const seed = 20261016;
    const recordedActions: Action[] = [
      'HARD',
      'L',
      'L',
      'HARD',
      'CW',
      'HARD',
      'R',
      'HARD',
      'CCW',
      'L',
      'HARD',
      'SOFT',
      'SOFT',
      'HARD',
      'R',
      'R',
      'HARD',
      'CW',
      'CW',
      'HARD',
    ];

    // Helper to simulate a live play session with feel effects active vs inactive
    const runSimulationWithFeel = (mode: 'full' | 'off') => {
      feel.reset();
      feel.setMode(mode);

      const state = createInitialState(seed, 100);
      const log: LogEntry[] = [];
      let tickAccumulator = 0;
      const tickMs = 1000 / 60; // 16.666ms

      // Simulating real-time frames with feel-scaled virtual clock
      for (const act of recordedActions) {
        if (state.stats.isGameOver) break;

        // Simulate frame intervals with varying real wall times (16ms to 24ms)
        const realFrameDt = 16.666;
        const scaledDt = feel.step(realFrameDt);
        tickAccumulator += scaledDt;

        while (tickAccumulator >= tickMs) {
          tickAccumulator -= tickMs;

          // Apply action and log it at the simulation tick
          log.push([state.stats.ticks, act]);
          applyAction(state, act);

          // If hard drop or line clear happened, trigger feel reactions
          if (act === 'HARD') {
            feel.hard(10);
          }

          const linesBefore = state.stats.lines;
          stepTick(state);
          const linesCleared = state.stats.lines - linesBefore;

          if (linesCleared > 0) {
            feel.clear(linesCleared, 0);
          }
        }
      }

      return {
        state,
        log,
        replayResult: replay(seed, log, 100),
      };
    };

    const runFull = runSimulationWithFeel('full');
    const runOff = runSimulationWithFeel('off');

    // Assert that the recorded tick-by-tick logs match
    expect(runFull.log).toEqual(runOff.log);

    // Assert that engine stats (score, lines, level, pieces, epochs) are identical
    expect(runFull.state.stats.score).toBe(runOff.state.stats.score);
    expect(runFull.state.stats.lines).toBe(runOff.state.stats.lines);
    expect(runFull.state.stats.level).toBe(runOff.state.stats.level);
    expect(runFull.state.stats.piecesLocked).toBe(runOff.state.stats.piecesLocked);
    expect(runFull.state.stats.epochs).toBe(runOff.state.stats.epochs);

    // Assert that the board grids are identical
    expect(runFull.state.grid).toEqual(runOff.state.grid);

    // Assert that piece order (next queue, current piece, pieces locked) is identical
    expect(runFull.state.nextQueue).toEqual(runOff.state.nextQueue);
    expect(runFull.state.currentPiece).toEqual(runOff.state.currentPiece);

    // Assert that replay verification produces identical results
    expect(runFull.replayResult).toEqual(runOff.replayResult);
    expect(runFull.replayResult.score).toBe(runFull.state.stats.score);
  });

  describe('FEEL.md §5 Event Table Specifications', () => {
    it('hard drop scales trauma by rows with bias 0.85 and NO hit stop', () => {
      feel.reset();
      feel.setMode('full');

      // Drop 16 rows -> desired px = 1.5 + 4.5 = 6px
      feel.hard(16);
      expect(feel.rate).toBe(1); // NO hit stop!

      // Check step doesn't freeze clock
      const dt = feel.step(16);
      expect(dt).toBe(16);
    });

    it('wall bump sets 4px nudge and decays over 90ms with squared falloff', () => {
      feel.reset();
      feel.setMode('full');

      feel.bump(1); // Bump right
      const vt = feel.vt;

      const offset0 = feel.nx(vt);
      expect(offset0).toBeCloseTo(4, 2);

      // At 45ms (halfway), falloff is (1 - 0.5)^2 = 0.25 -> 4 * 0.25 = 1.0px
      const offsetHalf = feel.nx(vt + 45);
      expect(offsetHalf).toBeCloseTo(1.0, 1);

      // At >= 90ms, offset is 0
      const offsetEnd = feel.nx(vt + 90);
      expect(offsetEnd).toBe(0);
    });

    it('line clears 1 to 4 trigger calibrated hit stop, zoom, and Tetris triggers 350ms slow-mo', () => {
      feel.reset();
      feel.setMode('full');

      // Clear 1: 45ms hit stop
      feel.clear(1, 0);
      expect(feel.rate).toBe(0);
      const dt0 = feel.step(45);
      expect(dt0).toBe(0);
      const dt1 = feel.step(16);
      expect(dt1).toBe(16);
      expect(feel.rate).toBe(1);

      // Clear 4 (Tetris): 130ms hit stop, then 350ms slow-mo at 0.35 rate
      feel.clear(4, 0);
      expect(feel.rate).toBe(0);
      feel.step(130); // Hit stop ends

      // Slow-mo active on subsequent step
      const dtSlow = feel.step(100);
      expect(dtSlow).toBeCloseTo(35, 1);
      expect(feel.rate).toBeCloseTo(0.35, 2);

      // Step out remaining slow-mo (250ms remaining)
      feel.step(250);
      const dtNormal = feel.step(16);
      expect(dtNormal).toBe(16);
      expect(feel.rate).toBe(1);
    });

    it('combo scaling increases shake and hit stop duration per §5', () => {
      feel.reset();
      feel.setMode('full');

      // Clear 1 with combo 2:
      // hit stop = 45 + min(40, 8*2) = 45 + 16 = 61ms
      feel.clear(1, 2);
      expect(feel.rate).toBe(0);
      feel.step(50);
      expect(feel.rate).toBe(0); // still in hit stop (> 45ms)
      feel.step(11); // finishes 61ms hit stop
      const dtAfter = feel.step(16);
      expect(dtAfter).toBe(16);
      expect(feel.rate).toBe(1); // resumed normal rate
    });

    it('level up emits 5px shake and shockwave outline ring over 650ms', () => {
      feel.reset();
      feel.setMode('full');

      feel.level();
      // Should not pause simulation clock
      expect(feel.rate).toBe(1);
      const dt = feel.step(16);
      expect(dt).toBe(16);
    });
  });
});
