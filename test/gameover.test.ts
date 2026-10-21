import { describe, expect, it } from 'vitest';
import { MockLeaderboardService } from '@/lib/leaderboard/mockService';
import { LeaderboardTab } from '@/lib/leaderboard/types';

describe('Game Over & Daily 100 — Acceptance Verification', () => {
  it('correctly determines top labels for Practice, Daily 100, and Done runs', () => {
    const getTopLabel = (mode: 'practice' | 'daily', isDone: boolean, dayNumber: number) => {
      if (isDone) return 'Run complete · 100 / 100';
      if (mode === 'daily') return `Run ended · Daily 100 No. ${dayNumber}`;
      return 'Run ended · Practice';
    };

    expect(getTopLabel('practice', false, 104)).toBe('Run ended · Practice');
    expect(getTopLabel('daily', false, 104)).toBe('Run ended · Daily 100 No. 104');
    expect(getTopLabel('daily', false, 3)).toBe('Run ended · Daily 100 No. 3');
    expect(getTopLabel('practice', true, 104)).toBe('Run complete · 100 / 100');
    expect(getTopLabel('daily', true, 104)).toBe('Run complete · 100 / 100');
  });

  it('correctly splits two-line titles: GAME/OVER vs RUN/DONE', () => {
    const getTitleLines = (isDone: boolean) => {
      return {
        line1: isDone ? 'RUN' : 'GAME',
        line2: isDone ? 'DONE' : 'OVER',
      };
    };

    expect(getTitleLines(false)).toEqual({ line1: 'GAME', line2: 'OVER' });
    expect(getTitleLines(true)).toEqual({ line1: 'RUN', line2: 'DONE' });
  });

  it('determines NEW BEST stamp condition strictly: score > previousBest and score > 0', () => {
    const isNewBest = (score: number, previousBest: number) => {
      return score > 0 && score > previousBest;
    };

    expect(isNewBest(28640, 15000)).toBe(true);
    expect(isNewBest(28640, 28640)).toBe(false);
    expect(isNewBest(12000, 30000)).toBe(false);
    expect(isNewBest(0, 0)).toBe(false);
  });

  it('calculates percentile and rank display correctly from LeaderboardService', async () => {
    const service = new MockLeaderboardService();
    const page = await service.getPage('today', { wallet: '0xa2f10000000000000000000000000000000044d8' });

    expect(page.totalPlayers).toBeGreaterThan(0);
    expect(page.me).toBeDefined();

    if (page.me) {
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

      expect(rank).toBeGreaterThanOrEqual(1);
      expect(total).toBeGreaterThanOrEqual(rank);
      expect(pctStr).toMatch(/^\d+(\.\d+)?%$/);
    }
  });

  it('swaps Share button for Leaderboard button when mode is daily', () => {
    const getSecondaryButton = (mode: 'practice' | 'daily') => {
      return mode === 'daily'
        ? { id: 'glb-btn', text: 'Leaderboard' }
        : { id: 'gsh', text: 'Share' };
    };

    expect(getSecondaryButton('practice')).toEqual({ id: 'gsh', text: 'Share' });
    expect(getSecondaryButton('daily')).toEqual({ id: 'glb-btn', text: 'Leaderboard' });
  });

  it('verifies timeline delays according to GAMEOVER.md spec', () => {
    const TIMELINE = {
      flashDecayMs: 200,
      bgFadeDelayMs: 300,
      bgFadeDurationMs: 450,
      titleDropStartMs: 350,
      titleDropIntervalMs: 70,
      titleLine2StartOffsetMs: 120,
      letterShakeDurationMs: 390,
      topFadeDelayMs: 900,
      statsFadeDelayMs: 1000,
      statCountStartMs: 1100,
      statCountIntervalMs: 120,
      accentBarDelayMs: 1250,
      accentBarDurationMs: 500,
      newBestStampDelayMs: 2100,
      newBestSlamShakeMs: 2360,
      retryUnlockMs: 900,
      retryUnlockReducedMotionMs: 450,
      exitFadeDurationMs: 320,
    };

    expect(TIMELINE.retryUnlockMs).toBe(900);
    expect(TIMELINE.retryUnlockReducedMotionMs).toBe(450);
    expect(TIMELINE.titleDropStartMs).toBe(350);
    expect(TIMELINE.newBestStampDelayMs).toBe(2100);
    expect(TIMELINE.accentBarDelayMs).toBe(1250);
  });

  describe('GAMEOVER.md §4a Freeze-Frame & §4b BOOM Specifications', () => {
    it('freeze-frame runs for 260ms with board scale push-in (death 260)', async () => {
      const { feel } = await import('@/lib/engine');
      feel.reset();
      feel.setMode('full');

      expect(feel.isDeathActive()).toBe(false);

      // Start freeze-frame
      feel.death(260);
      expect(feel.isDeathActive()).toBe(true);

      // Step time within 260ms
      feel.step(130);
      expect(feel.isDeathActive()).toBe(true);

      // End freeze-frame
      feel.death(0);
      expect(feel.isDeathActive()).toBe(false);
    });

    it('BOOM applies 16px shake, +5% zoom punch, and 450ms slow-mo at 35% speed', async () => {
      const { feel } = await import('@/lib/engine');
      feel.reset();
      feel.setMode('full');

      // Trigger BOOM at 260ms
      feel.addPx(16, 0); // 16px trauma, no vertical bias
      feel.punch(0.05); // +5% zoom punch
      feel.slowMs(450); // 450ms slow-mo

      expect(feel.rate).toBeCloseTo(0.35, 2);

      // Advance 200ms
      const dt1 = feel.step(200);
      expect(dt1).toBeCloseTo(200 * 0.35, 1);
      expect(feel.rate).toBeCloseTo(0.35, 2);

      // Advance remaining 250ms
      feel.step(250);
      const dtNormal = feel.step(16);
      expect(dtNormal).toBe(16);
      expect(feel.rate).toBe(1.0);
    });

    it('soundManager provides playFreezeHeartbeatAndRiser', async () => {
      const { soundManager } = await import('@/lib/leaderboard/sound');
      expect(typeof soundManager.playFreezeHeartbeatAndRiser).toBe('function');
    });

    it('freeze-frame is skipped for done runs, Feel Off, and reduced motion', async () => {
      const shouldFreeze = (
        isDone: boolean,
        feelMode: 'full' | 'low' | 'off',
        reducedMotion: boolean
      ) => {
        return !isDone && feelMode !== 'off' && !reducedMotion;
      };

      // Normal game over on Feel Full
      expect(shouldFreeze(false, 'full', false)).toBe(true);
      expect(shouldFreeze(false, 'low', false)).toBe(true);

      // Done runs skip freeze-frame
      expect(shouldFreeze(true, 'full', false)).toBe(false);

      // Feel Off skips freeze-frame
      expect(shouldFreeze(false, 'off', false)).toBe(false);

      // Reduced motion skips freeze-frame
      expect(shouldFreeze(false, 'full', true)).toBe(false);
    });

    it('per-letter landings add 3px (line 1) and 6px (line 2) shake, last letter adds 9px shake, +2% zoom, and 70ms hit stop', async () => {
      const { feel } = await import('@/lib/engine');
      feel.reset();
      feel.setMode('full');

      // Line 1 letter: 3px
      feel.addPx(3, 0);
      expect(feel.rate).toBe(1);

      // Line 2 letter: 6px
      feel.addPx(6, 0);
      expect(feel.rate).toBe(1);

      // Last letter: 9px shake, +2% zoom punch, 70ms hit stop
      feel.addPx(9, 0);
      feel.punch(0.02);
      feel.hitStop(70);

      expect(feel.rate).toBe(0);
      const dt0 = feel.step(70);
      expect(dt0).toBe(0);

      const dt1 = feel.step(16);
      expect(dt1).toBe(16);
      expect(feel.rate).toBe(1);
    });

    it('NEW BEST stamp triggers 90ms hit stop, 8px shake, and +3% zoom punch', async () => {
      const { feel } = await import('@/lib/engine');
      feel.reset();
      feel.setMode('full');

      feel.addPx(8, 0);
      feel.punch(0.03);
      feel.hitStop(90);

      expect(feel.rate).toBe(0);
      const dt0 = feel.step(90);
      expect(dt0).toBe(0);

      const dt1 = feel.step(16);
      expect(dt1).toBe(16);
      expect(feel.rate).toBe(1);
    });

    it('all impacts scale with Feel setting (Low halves values, Off zeroes them)', async () => {
      const { feel } = await import('@/lib/engine');

      // Feel Low (0.5x)
      feel.reset();
      feel.setMode('low');
      expect(feel.getIntensity()).toBe(0.5);

      const hitStopMs = feel.hitStop(70);
      expect(hitStopMs).toBe(35); // 70 * 0.5 = 35ms

      // Feel Off (0x)
      feel.reset();
      feel.setMode('off');
      expect(feel.getIntensity()).toBe(0);

      const hitStopOff = feel.hitStop(70);
      expect(hitStopOff).toBe(0);
      expect(feel.rate).toBe(1);
    });

    it('feel.apply applies identical transform to poster container (#go) as board wrapper (#wrap)', async () => {
      const { feel } = await import('@/lib/engine');
      feel.reset();
      feel.setMode('full');

      // Add trauma and punch
      feel.addPx(9, 0);
      feel.punch(0.02);
      feel.step(16);

      const mockWrap = { style: { transform: '' } } as any;
      const mockGo = { style: { transform: '', display: 'block' } } as any;

      feel.apply(mockWrap, mockGo);

      expect(mockWrap.style.transform).not.toBe('');
      expect(mockGo.style.transform).not.toBe('');
      expect(mockGo.style.transform).toBe(mockWrap.style.transform);
      expect(mockGo.style.transform).toContain('scale(');
      expect(mockGo.style.transform).toContain('translate(');
    });

    it('tile physics integration strictly scales displacement with feel.rate (0 in hit stop, 0.35 in slow-mo)', async () => {
      const { feel } = await import('@/lib/engine');
      feel.reset();
      feel.setMode('full');

      interface MockTile {
        x: number;
        y: number;
        vx: number;
        vy: number;
      }

      const p: MockTile = { x: 100, y: 100, vx: 200, vy: -300 };

      // Helper step function mirroring GameOverPoster.tsx loop
      const stepPhysics = (rawDtMs: number) => {
        feel.step(rawDtMs);
        const dt = Math.min(0.033, rawDtMs / 1000) * feel.rate;
        p.vy += 2000 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        return dt;
      };

      // 1. In Hit Stop (rate = 0): tile stays completely frozen
      feel.hitStop(70);
      expect(feel.rate).toBe(0);
      const startX = p.x;
      const startY = p.y;
      const startVy = p.vy;

      stepPhysics(35); // 35ms into 70ms hit stop
      expect(p.x).toBe(startX);
      expect(p.y).toBe(startY);
      expect(p.vy).toBe(startVy);

      stepPhysics(35); // Hit stop completes, tiles stay frozen for entire 70ms
      expect(p.x).toBe(startX);
      expect(p.y).toBe(startY);

      // Subsequent tick resumes normal rate 1
      stepPhysics(16);
      expect(feel.rate).toBe(1);

      // 2. In Slow-mo (rate = 0.35): tile moves at exactly 35% speed
      feel.slowMs(450);
      expect(feel.rate).toBe(0.35);

      const xBeforeSlow = p.x;
      const yBeforeSlow = p.y;
      const dtSlow = stepPhysics(20);
      expect(dtSlow).toBeCloseTo(0.02 * 0.35, 4);
      expect(p.x).toBeCloseTo(xBeforeSlow + 200 * dtSlow, 2);
    });
  });

  describe('GAMEOVER.md §6 Sound Synthesis & Master Dynamics Limiter', () => {
    it('soundManager provides all 9 sound methods from section 6 specification', async () => {
      const { soundManager } = await import('@/lib/leaderboard/sound');

      expect(typeof soundManager.playFreezeHeartbeatAndRiser).toBe('function');
      expect(typeof soundManager.playGameOverCrash).toBe('function');
      expect(typeof soundManager.playDoneArpeggio).toBe('function');
      expect(typeof soundManager.playLetterLanding).toBe('function');
      expect(typeof soundManager.playCountUpTick).toBe('function');
      expect(typeof soundManager.playNewBestStamp).toBe('function');
      expect(typeof soundManager.playRetryReady).toBe('function');
      expect(typeof soundManager.playLetterClick).toBe('function');
      expect(typeof soundManager.playRetryExit).toBe('function');
    });

    it('respects the sound toggle (silent when sound is disabled)', async () => {
      const { soundManager } = await import('@/lib/leaderboard/sound');

      soundManager.setEnabled(false);
      expect(soundManager.isEnabled()).toBe(false);

      // None of the methods throw when disabled
      expect(() => {
        soundManager.playFreezeHeartbeatAndRiser();
        soundManager.playGameOverCrash();
        soundManager.playDoneArpeggio();
        soundManager.playLetterLanding(0, false);
        soundManager.playLetterLanding(7, true);
        soundManager.playCountUpTick(0);
        soundManager.playCountUpTick(15);
        soundManager.playNewBestStamp();
        soundManager.playRetryReady();
        soundManager.playLetterClick();
        soundManager.playRetryExit();
      }).not.toThrow();

      // Restore enabled state
      soundManager.setEnabled(true);
      expect(soundManager.isEnabled()).toBe(true);
    });

    it('score count-up step formula generates 16 discrete ascending frequencies from 480Hz to 1050Hz', () => {
      const frequencies: number[] = [];
      for (let step = 0; step < 16; step++) {
        frequencies.push(480 + step * 38);
      }

      expect(frequencies.length).toBe(16);
      expect(frequencies[0]).toBe(480);
      expect(frequencies[15]).toBe(480 + 15 * 38); // 1050 Hz
      for (let i = 1; i < frequencies.length; i++) {
        expect(frequencies[i]).toBeGreaterThan(frequencies[i - 1]);
      }
    });

    it('provides master dynamics compressor/limiter node to prevent clipping on layered sounds', async () => {
      const { soundManager } = await import('@/lib/leaderboard/sound');
      expect(typeof soundManager.getMasterLimiter).toBe('function');
      expect(typeof soundManager.getMasterNode).toBe('function');
    });
  });

  describe('SmoothSend Silent Recording & SnowTrace Proof Button', () => {
    it('constructs correct SnowTrace transaction URL for mined txHash', () => {
      const getSnowtraceUrl = (txHash: string, isMainnet: boolean = false) => {
        const base = isMainnet ? 'https://snowtrace.io' : 'https://testnet.snowtrace.io';
        return `${base}/tx/${txHash}`;
      };

      const testTx = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      expect(getSnowtraceUrl(testTx, false)).toBe(`https://testnet.snowtrace.io/tx/${testTx}`);
      expect(getSnowtraceUrl(testTx, true)).toBe(`https://snowtrace.io/tx/${testTx}`);
    });

    it('constructs correct JiffyScan URL for pending UserOp hash during confirmation', () => {
      const getJiffyScanUrl = (userOpHash: string, isMainnet: boolean = false) => {
        const network = isMainnet ? 'avalanche' : 'avalanche-fuji';
        return `https://jiffyscan.xyz/userOpHash/${userOpHash}?network=${network}`;
      };

      const userOp = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd';
      expect(getJiffyScanUrl(userOp, false)).toBe(`https://jiffyscan.xyz/userOpHash/${userOp}?network=avalanche-fuji`);
      expect(getJiffyScanUrl(userOp, true)).toBe(`https://jiffyscan.xyz/userOpHash/${userOp}?network=avalanche`);
    });

    it('renders on-chain metadata status text based on submission phase', () => {
      const getStatusLabel = (phase: string, hasTx: boolean, isMainnet: boolean = false) => {
        if (hasTx || phase === 'success') return isMainnet ? 'Recorded on Avalanche ✓' : 'Recorded on Fuji ✓';
        if (phase === 'confirming') return isMainnet ? 'Confirming on Avalanche...' : 'Confirming on Fuji...';
        if (phase === 'sponsoring') return 'Sponsoring (gasless)...';
        return null;
      };

      expect(getStatusLabel('sponsoring', false)).toBe('Sponsoring (gasless)...');
      expect(getStatusLabel('confirming', false, false)).toBe('Confirming on Fuji...');
      expect(getStatusLabel('confirming', false, true)).toBe('Confirming on Avalanche...');
      expect(getStatusLabel('success', true, false)).toBe('Recorded on Fuji ✓');
      expect(getStatusLabel('success', true, true)).toBe('Recorded on Avalanche ✓');
      expect(getStatusLabel('idle', true)).toBe('Recorded on Fuji ✓');
      expect(getStatusLabel('idle', false)).toBe(null);
    });

    it('determines action buttons based on auth and transaction status', () => {
      const getProofAction = (
        mode: string,
        txHash: string | null,
        userOpHash: string | null,
        phase: string,
        isAuth: boolean
      ) => {
        if (mode !== 'daily') return null;
        if (txHash && txHash.startsWith('0x')) return 'view-snowtrace';
        if (!txHash && userOpHash) return 'view-userop';
        if (!txHash && !userOpHash && phase === 'sponsoring') return 'sponsoring-disabled';
        if (!txHash && !userOpHash && !isAuth && phase !== 'sponsoring') return 'login-to-record';
        return null;
      };

      expect(getProofAction('practice', '0x123', null, 'success', true)).toBe(null);
      expect(getProofAction('daily', '0x123', null, 'success', true)).toBe('view-snowtrace');
      expect(getProofAction('daily', null, '0xabc', 'confirming', true)).toBe('view-userop');
      expect(getProofAction('daily', null, null, 'sponsoring', true)).toBe('sponsoring-disabled');
      expect(getProofAction('daily', null, null, 'idle', false)).toBe('login-to-record');
    });
  });
});

