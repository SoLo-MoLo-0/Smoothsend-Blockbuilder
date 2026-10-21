import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Playlist } from '@/lib/audio/playlist';
import {
  calculateEqualPowerGains,
  dbToLinear,
  generateEqualPowerFadeInCurve,
  generateEqualPowerFadeOutCurve,
  linearToDb,
  volumeToGain,
} from '@/lib/audio/audioMath';
import { MusicManager } from '@/lib/audio/MusicManager';
import {
  DEFAULT_MENU_TRACK_ID,
  getTrackById,
  getTracksByRole,
  MUSIC_TRACKS,
  MusicTrack,
} from '@/lib/audio/musicConfig';

describe('Music Config', () => {
  it('contains valid tracks with required metadata', () => {
    expect(MUSIC_TRACKS.length).toBe(9);

    const menuTracks = getTracksByRole('menu');
    const gameTracks = getTracksByRole('game');

    expect(menuTracks.length).toBe(3);
    expect(gameTracks.length).toBe(6);

    for (const track of MUSIC_TRACKS) {
      expect(track.id).toBeTruthy();
      expect(track.title).toBeTruthy();
      expect(track.file.startsWith('/audio/music/')).toBe(true);
      expect(track.gainDb).toBe(0);
      expect(['menu', 'game']).toContain(track.role);
    }
  });

  it('resolves track by ID and default menu track', () => {
    const defaultMenu = getTrackById(DEFAULT_MENU_TRACK_ID);
    expect(defaultMenu).toBeDefined();
    expect(defaultMenu?.id).toBe('vaporware');
    expect(defaultMenu?.role).toBe('menu');

    const nonExistent = getTrackById('does-not-exist');
    expect(nonExistent).toBeUndefined();
  });
});

describe('Audio Math Utilities', () => {
  it('converts decibels to linear amplitude accurately', () => {
    expect(dbToLinear(0)).toBeCloseTo(1.0, 5);
    expect(dbToLinear(-6)).toBeCloseTo(0.501187, 4);
    expect(dbToLinear(6)).toBeCloseTo(1.995262, 4);
    expect(dbToLinear(-18)).toBeCloseTo(0.125892, 4);
    expect(dbToLinear(-100)).toBe(0);
    expect(dbToLinear(-120)).toBe(0);
  });

  it('converts linear amplitude to decibels accurately', () => {
    expect(linearToDb(1.0)).toBeCloseTo(0, 4);
    expect(linearToDb(0.501187)).toBeCloseTo(-6, 3);
    expect(linearToDb(0.125892)).toBeCloseTo(-18, 3);
    expect(linearToDb(0)).toBe(-100);
  });

  it('computes volume perception curve: gain = vol^2 per Section 3', () => {
    expect(volumeToGain(0)).toBe(0);
    expect(volumeToGain(0.5)).toBeCloseTo(0.25, 5);
    expect(volumeToGain(1.0)).toBe(1.0);
    expect(volumeToGain(0.7)).toBeCloseTo(0.49, 5);

    // Clamping checks
    expect(volumeToGain(-0.5)).toBe(0);
    expect(volumeToGain(1.5)).toBe(1.0);
  });

  it('computes equal-power crossfade gains preserving unit total power (gainA^2 + gainB^2 = 1)', () => {
    const testPoints = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1.0];

    for (const p of testPoints) {
      const { fadeOutGain, fadeInGain } = calculateEqualPowerGains(p);
      const totalPower = fadeOutGain * fadeOutGain + fadeInGain * fadeInGain;
      expect(totalPower).toBeCloseTo(1.0, 5);
    }

    // Boundary conditions
    const start = calculateEqualPowerGains(0);
    expect(start.fadeOutGain).toBeCloseTo(1.0, 5);
    expect(start.fadeInGain).toBeCloseTo(0.0, 5);

    const mid = calculateEqualPowerGains(0.5);
    expect(mid.fadeOutGain).toBeCloseTo(Math.SQRT1_2, 5);
    expect(mid.fadeInGain).toBeCloseTo(Math.SQRT1_2, 5);

    const end = calculateEqualPowerGains(1.0);
    expect(end.fadeOutGain).toBeCloseTo(0.0, 5);
    expect(end.fadeInGain).toBeCloseTo(1.0, 5);
  });

  it('generates equal-power curves with expected monotonicity', () => {
    const steps = 16;
    const inCurve = generateEqualPowerFadeInCurve(steps);
    const outCurve = generateEqualPowerFadeOutCurve(steps);

    expect(inCurve.length).toBe(steps);
    expect(outCurve.length).toBe(steps);

    expect(inCurve[0]).toBeCloseTo(0, 5);
    expect(inCurve[steps - 1]).toBeCloseTo(1, 5);

    expect(outCurve[0]).toBeCloseTo(1, 5);
    expect(outCurve[steps - 1]).toBeCloseTo(0, 5);

    for (let i = 1; i < steps; i++) {
      expect(inCurve[i]).toBeGreaterThanOrEqual(inCurve[i - 1]);
      expect(outCurve[i]).toBeLessThanOrEqual(outCurve[i - 1]);
    }
  });
});

describe('Playlist Queue & Shuffle Logic', () => {
  const dummyTracks: MusicTrack[] = [
    { id: 'track-1', role: 'game', file: '/1.mp3', title: 'T1', gainDb: 0 },
    { id: 'track-2', role: 'game', file: '/2.mp3', title: 'T2', gainDb: 0 },
    { id: 'track-3', role: 'game', file: '/3.mp3', title: 'T3', gainDb: 0 },
    { id: 'track-4', role: 'game', file: '/4.mp3', title: 'T4', gainDb: 0 },
  ];

  it('initializes and reports track count', () => {
    const playlist = new Playlist(dummyTracks);
    expect(playlist.getTrackCount()).toBe(4);
    expect(playlist.getCurrentTrack()).toBeNull();
  });

  it('plays each track in the pool before cycle finishes', () => {
    const playlist = new Playlist(dummyTracks);
    const played = new Set<string>();

    for (let i = 0; i < dummyTracks.length; i++) {
      const next = playlist.getNextTrack();
      expect(next).not.toBeNull();
      played.add(next!.id);
    }

    expect(played.size).toBe(dummyTracks.length);
  });

  it('GUARANTEES no identical track is played twice in a row across cycle transitions', () => {
    const playlist = new Playlist(dummyTracks);
    let previousTrackId: string | null = null;

    // Simulate 500 consecutive track advances across dozens of reshuffle cycles
    for (let i = 0; i < 500; i++) {
      const current = playlist.getNextTrack();
      expect(current).not.toBeNull();

      if (previousTrackId !== null) {
        expect(current!.id).not.toBe(previousTrackId);
      }
      previousTrackId = current!.id;
    }
  });

  it('handles single track playlist safely without hanging', () => {
    const single: MusicTrack[] = [
      { id: 'solo', role: 'game', file: '/solo.mp3', title: 'Solo', gainDb: 0 },
    ];
    const playlist = new Playlist(single);

    const first = playlist.getNextTrack();
    const second = playlist.getNextTrack();

    expect(first?.id).toBe('solo');
    expect(second?.id).toBe('solo');
  });

  it('handles empty track playlist safely', () => {
    const playlist = new Playlist([]);
    expect(playlist.getNextTrack()).toBeNull();
    expect(playlist.peekNextTrack()).toBeNull();
    expect(playlist.getCurrentTrack()).toBeNull();
    expect(playlist.getRemainingInCycle()).toBe(0);
  });

  it('peekNextTrack inspects without popping from queue', () => {
    const playlist = new Playlist(dummyTracks);
    const peeked = playlist.peekNextTrack();
    expect(peeked).not.toBeNull();

    const next = playlist.getNextTrack();
    expect(next?.id).toBe(peeked?.id);
  });

  it('reset clears the active track and resets queue', () => {
    const playlist = new Playlist(dummyTracks);
    playlist.getNextTrack();
    expect(playlist.getCurrentTrack()).not.toBeNull();

    playlist.reset();
    expect(playlist.getCurrentTrack()).toBeNull();
  });
});

describe('MusicManager State Machine & Controls', () => {
  let manager: MusicManager;

  beforeEach(() => {
    manager = new MusicManager();
  });

  it('initializes with default enabled state and default volume 0.2', () => {
    expect(manager.isEnabled()).toBe(true);
    expect(manager.getVolume()).toBe(0.2);
    expect(manager.getEffectiveVolume()).toBe(0.2);
  });

  it('ducks volume down by 10% (0.10) when user Alt+Tabs or switches away, and restores on return', () => {
    // Default volume is 0.2 (20%)
    expect(manager.getVolume()).toBe(0.2);
    expect(manager.getEffectiveVolume()).toBe(0.2);
    expect(manager.isBackgroundDucked()).toBe(false);

    // User Alt+Tabs or switches application -> duck by 10%
    manager.setBackgroundDucked(true);
    expect(manager.isBackgroundDucked()).toBe(true);
    // 20% - 10% = 10% (0.10)
    expect(manager.getEffectiveVolume()).toBeCloseTo(0.10, 5);
    // Configured volume is preserved
    expect(manager.getVolume()).toBe(0.2);

    // User switches back to browser -> restores to 20%
    manager.setBackgroundDucked(false);
    expect(manager.isBackgroundDucked()).toBe(false);
    expect(manager.getEffectiveVolume()).toBe(0.2);

    // Test with higher volume (e.g. 50% -> 40%)
    manager.setVolume(0.5);
    manager.setBackgroundDucked(true);
    expect(manager.getEffectiveVolume()).toBeCloseTo(0.40, 5);
    manager.setBackgroundDucked(false);
    expect(manager.getEffectiveVolume()).toBe(0.5);
  });

  it('toggles and sets enabled state with event dispatch', () => {
    expect(manager.isEnabled()).toBe(true);
    const newState = manager.toggle();
    expect(newState).toBe(false);
    expect(manager.isEnabled()).toBe(false);

    manager.setEnabled(true);
    expect(manager.isEnabled()).toBe(true);
  });

  it('updates volume and clamps bounds properly', () => {
    manager.setVolume(0.8);
    expect(manager.getVolume()).toBe(0.8);

    manager.setVolume(-0.2);
    expect(manager.getVolume()).toBe(0);

    manager.setVolume(1.5);
    expect(manager.getVolume()).toBe(1.0);
  });

  it('exposes the game playlist containing all 6 game tracks and menu playlist containing 3 menu tracks', () => {
    const gamePlaylist = manager.getPlaylist();
    expect(gamePlaylist.getTrackCount()).toBe(6);

    const menuPlaylist = manager.getMenuPlaylist();
    expect(menuPlaylist.getTrackCount()).toBe(3);
  });

  it('handles suspend and resume without errors in Node/SSR environment', () => {
    expect(() => manager.suspend(150)).not.toThrow();
    expect(() => manager.resume(200)).not.toThrow();
  });

  it('handles duck, setLowpass, and setLevel parameter methods safely', () => {
    expect(() => manager.duck(-3, 180, 400)).not.toThrow();
    expect(() => manager.duck(-8, 300, 400)).not.toThrow();
    expect(() => manager.setLowpass(600, 250)).not.toThrow();
    expect(() => manager.setLowpass(400, 900)).not.toThrow();
    expect(() => manager.setLevel(-6, 250)).not.toThrow();
    expect(() => manager.setLevel(1.5, 800)).not.toThrow();
  });

  it('handles play, stop, and crossfade calls safely when AudioContext is offline', async () => {
    await expect(manager.play('menu')).resolves.not.toThrow();
    await expect(manager.crossfadeTo('game', 1200)).resolves.not.toThrow();
    expect(() => manager.stop(150)).not.toThrow();
  });

  it('handles start gate, dismiss, and intro swell per Section 4', () => {
    expect(() => manager.handleIntroGate()).not.toThrow();
    expect(() => manager.handleGateDismiss()).not.toThrow();
    expect(() => manager.handleIntroTransition()).not.toThrow();
  });

  it('handles tab change (95% on leaderboard, 100% on game tabs)', () => {
    expect(() => manager.handleTabChange('leaderboard')).not.toThrow();
    expect(() => manager.handleTabChange('practice', 'ready')).not.toThrow();
    expect(() => manager.handleTabChange('daily', 'play')).not.toThrow();
  });

  it('handles game states (ready, play, pause, over, done) and timer cancellation', () => {
    expect(() => manager.handleGameState('ready')).not.toThrow();
    expect(() => manager.handleGameState('play')).not.toThrow();
    expect(() => manager.handleGameState('pause')).not.toThrow();
    expect(() => manager.handleGameState('over')).not.toThrow();
    expect(() => manager.handleGameState('done')).not.toThrow();
    expect(() => manager.clearStateTimers()).not.toThrow();
  });

  it('ignores game state updates during active intro', () => {
    expect(() => manager.handleGameState('play', true)).not.toThrow();
    expect(() => manager.handleGameState('over', true)).not.toThrow();
  });

  it('enforces role assignment: menu ONLY on start gate; in game ONLY main game music plays (including leaderboard with -5% volume)', () => {
    const playSpy = vi.spyOn(manager, 'play');
    const crossfadeSpy = vi.spyOn(manager, 'crossfadeTo');
    const setLevelSpy = vi.spyOn(manager, 'setLevelPercent');

    // On start gate appearance: plays menu role strictly on PRESS ANY KEY TO START page
    manager.handleIntroGate();
    expect((manager as any).pendingRoleOrId).toBe('menu');

    // On gate dismiss: transitions immediately to game music
    crossfadeSpy.mockClear();
    manager.handleGateDismiss();
    expect(crossfadeSpy).toHaveBeenCalledWith('game', 600);

    // On entering the game / ready overlay: plays main game music
    playSpy.mockClear();
    manager.handleGameState('ready');
    expect(playSpy).toHaveBeenCalledWith('game');

    // On active gameplay ('play'): continues game music seamlessly
    playSpy.mockClear();
    manager.handleGameState('play');
    expect(playSpy).toHaveBeenCalledWith('game');

    // On leaderboard tab: keeps playing main game music, volume dips 5% to 95%
    crossfadeSpy.mockClear();
    setLevelSpy.mockClear();
    manager.handleTabChange('leaderboard');
    expect(setLevelSpy).toHaveBeenCalledWith(95, 300);
    // Should NOT crossfade to menu music
    expect(crossfadeSpy).not.toHaveBeenCalledWith('menu', expect.anything());

    // When switching back to practice or daily: restores volume to 100%
    setLevelSpy.mockClear();
    manager.handleTabChange('practice');
    expect(setLevelSpy).toHaveBeenCalledWith(100, 300);
  });
});

describe('Phase 4: Music Controls & Persistence', () => {
  let manager: MusicManager;
  const storageMap = new Map<string, string>();
  const localStorageMock = {
    getItem: (key: string) => storageMap.get(key) ?? null,
    setItem: (key: string, val: string) => storageMap.set(key, String(val)),
    removeItem: (key: string) => storageMap.delete(key),
    clear: () => storageMap.clear(),
  };

  beforeEach(() => {
    (globalThis as any).localStorage = localStorageMock;
    localStorageMock.clear();
    manager = new MusicManager();
  });

  it('persists enabled and disabled states in localStorage (bb-music)', () => {
    manager.setEnabled(false);
    expect(manager.isEnabled()).toBe(false);
    expect(localStorage.getItem('bb-music')).toBe('0');

    manager.setEnabled(true);
    expect(manager.isEnabled()).toBe(true);
    expect(localStorage.getItem('bb-music')).toBe('1');

    const toggled = manager.toggle();
    expect(toggled).toBe(false);
    expect(manager.isEnabled()).toBe(false);
    expect(localStorage.getItem('bb-music')).toBe('0');
  });

  it('persists volume changes in localStorage (bb-music-vol) and clamps 0..1', () => {
    manager.setVolume(0.75);
    expect(manager.getVolume()).toBe(0.75);
    expect(localStorage.getItem('bb-music-vol')).toBe('0.75');

    manager.setVolume(1.5);
    expect(manager.getVolume()).toBe(1.0);
    expect(localStorage.getItem('bb-music-vol')).toBe('1');

    manager.setVolume(-0.2);
    expect(manager.getVolume()).toBe(0);
    expect(localStorage.getItem('bb-music-vol')).toBe('0');
  });

  it('calculates logarithmic human perception vol^2 gain correctly', () => {
    // 50% slider value maps to 0.25 (vol^2)
    expect(volumeToGain(0.5)).toBeCloseTo(0.25, 4);
    // 100% maps to 1.0
    expect(volumeToGain(1.0)).toBeCloseTo(1.0, 4);
    // 0% maps to 0
    expect(volumeToGain(0)).toBe(0);
  });

  it('dispatches custom window events on music and volume change when window is defined', () => {
    const target = new EventTarget();
    (globalThis as any).window = target;
    const musicSpy = vi.fn();
    const volSpy = vi.fn();

    target.addEventListener('bb-music-change', musicSpy);
    target.addEventListener('bb-music-vol-change', volSpy);

    manager.toggle();
    expect(musicSpy).toHaveBeenCalledTimes(1);

    manager.setVolume(0.35);
    expect(volSpy).toHaveBeenCalledTimes(1);

    target.removeEventListener('bb-music-change', musicSpy);
    target.removeEventListener('bb-music-vol-change', volSpy);
    delete (globalThis as any).window;
  });
});

describe('Phase 5: Reactive Groove & Beat Quantization', () => {
  let manager: MusicManager;

  beforeEach(() => {
    manager = new MusicManager();
  });

  it('triggers line clear ducking with exact parameters per Section 5', () => {
    const duckSpy = vi.spyOn(manager, 'duck');

    // 1 line: -3dB for 180ms
    manager.handleLineClear(1);
    expect(duckSpy).toHaveBeenLastCalledWith(-3, 180, 400);

    // 2 lines: -4.5dB for 180ms
    manager.handleLineClear(2);
    expect(duckSpy).toHaveBeenLastCalledWith(-4.5, 180, 400);

    // 3 lines: -6dB for 180ms
    manager.handleLineClear(3);
    expect(duckSpy).toHaveBeenLastCalledWith(-6, 180, 400);

    // 4 lines (Tetris): -8dB for 300ms
    manager.handleLineClear(4);
    expect(duckSpy).toHaveBeenLastCalledWith(-8, 300, 400);

    // 0 lines: does not duck
    duckSpy.mockClear();
    manager.handleLineClear(0);
    expect(duckSpy).not.toHaveBeenCalled();
  });

  it('closes lowpass filter above 60% stack height toward 3kHz floor and reopens at <= 60%', () => {
    const lowpassSpy = vi.spyOn(manager, 'setLowpass');

    // Fake game role active
    (manager as any).currentRole = 'game';

    // At 50% stack height: stays open at 18kHz
    manager.handleStackHeight(0.5);
    expect(manager.getCurrentDangerCutoff()).toBe(18000);
    expect(lowpassSpy).toHaveBeenLastCalledWith(18000, 300);

    // Exactly at 60% stack height: stays open at 18kHz
    manager.handleStackHeight(0.6);
    expect(manager.getCurrentDangerCutoff()).toBe(18000);
    expect(lowpassSpy).toHaveBeenLastCalledWith(18000, 300);

    // At 80% stack height (halfway between 60% and 100%): 18000 - 0.5 * 15000 = 10500 Hz
    manager.handleStackHeight(0.8);
    expect(manager.getCurrentDangerCutoff()).toBe(10500);
    expect(lowpassSpy).toHaveBeenLastCalledWith(10500, 300);

    // At 100% stack height: closes to 3000 Hz
    manager.handleStackHeight(1.0);
    expect(manager.getCurrentDangerCutoff()).toBe(3000);
    expect(lowpassSpy).toHaveBeenLastCalledWith(3000, 300);

    // Above 100% stack height: clamps at 3000 Hz floor
    manager.handleStackHeight(1.2);
    expect(manager.getCurrentDangerCutoff()).toBe(3000);
    expect(lowpassSpy).toHaveBeenLastCalledWith(3000, 300);

    // Lines cleared, stack drops back to 40%: reopens smoothly to 18000 Hz
    manager.handleStackHeight(0.4);
    expect(manager.getCurrentDangerCutoff()).toBe(18000);
    expect(lowpassSpy).toHaveBeenLastCalledWith(18000, 300);
  });

  it('handles level-up lift routine safely', () => {
    expect(() => manager.handleLevelUp()).not.toThrow();
  });

  it('returns 0 quantized offset when track has no BPM configured', () => {
    // Current tracks do not have BPM configured
    expect(manager.getCurrentBpm()).toBeUndefined();
    expect(manager.getQuantizedOffset()).toBe(0);
  });

  it('computes beat quantization delay capped at 60ms when BPM is configured', () => {
    // Mock channel with 120 BPM (1 beat = 500ms, 1/8 beat = 62.5ms)
    (manager as any).currentChannel = {
      track: { id: 'bpm-test', bpm: 120 },
      startTime: 0,
    };
    (manager as any).audioCtx = {
      currentTime: 0.04, // 40ms into the 62.5ms interval -> 22.5ms to next boundary
    };

    const delay = manager.getQuantizedOffset(0.06);
    expect(delay).toBeCloseTo(0.0225, 3);

    // If delay exceeds 60ms cap, it clamps to max 60ms late
    (manager as any).audioCtx = {
      currentTime: 0.001, // 1ms into interval -> 61.5ms to next boundary
    };
    const capped = manager.getQuantizedOffset(0.06);
    expect(capped).toBe(0.06);
  });
});


