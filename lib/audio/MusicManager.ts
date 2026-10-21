import { soundManager } from '@/lib/leaderboard/sound';
import {
  DEFAULT_MENU_TRACK_ID,
  getTrackById,
  getTracksByRole,
  MusicRole,
  MusicTrack,
  MUSIC_TRACKS,
} from './musicConfig';
import {
  calculateEqualPowerGains,
  dbToLinear,
  volumeToGain,
} from './audioMath';
import { Playlist } from './playlist';

interface ActiveChannel {
  track: MusicTrack;
  source: AudioBufferSourceNode | MediaElementAudioSourceNode;
  mediaElement?: HTMLAudioElement;
  trackGain: GainNode;
  crossfadeGain: GainNode;
  isLooping: boolean;
  startTime: number;
  duration: number;
  autoAdvanceTimer?: ReturnType<typeof setTimeout> | null;
}

export class MusicManager {
  private isEnabledState: boolean = true;
  private volumeState: number = 0.2; // Default volume: 20% per user request
  private isAppBackgroundDucked: boolean = false; // Ducked by 10% when Alt+Tabbed or app switched

  // Web Audio Graph nodes
  private audioCtx: AudioContext | null = null;
  private masterLimiter: DynamicsCompressorNode | null = null;
  private musicGainNode: GainNode | null = null;
  private levelGainNode: GainNode | null = null;
  private duckGainNode: GainNode | null = null;
  private filterNode: BiquadFilterNode | null = null;

  // Active channel tracking (current track and crossfading track)
  private currentChannel: ActiveChannel | null = null;
  private fadingOutChannels: ActiveChannel[] = [];

  // Buffer cache and loading promises
  private bufferCache: Map<string, AudioBuffer> = new Map();
  private loadingPromises: Map<string, Promise<AudioBuffer | null>> = new Map();

  // Playlists for menu ("PRESS ANY KEY TO START" page) and game tracks
  private menuPlaylist: Playlist;
  private gamePlaylist: Playlist;

  // State management
  private pendingRoleOrId: MusicRole | string | null = null;
  private currentRole: MusicRole | null = null;
  private isSuspendedDueToVisibility: boolean = false;
  private wasPlayingBeforeVisibilityHidden: boolean = false;
  private stateTransitionTimer: ReturnType<typeof setTimeout> | null = null;
  private currentDangerCutoff: number = 18000;

  constructor() {
    this.menuPlaylist = new Playlist(getTracksByRole('menu'), DEFAULT_MENU_TRACK_ID);
    this.gamePlaylist = new Playlist(getTracksByRole('game'));

    if (typeof window !== 'undefined') {
      try {
        const savedEnabled = localStorage.getItem('bb-music');
        this.isEnabledState = savedEnabled !== '0' && savedEnabled !== 'false';

        const savedVol = localStorage.getItem('bb-music-vol');
        if (savedVol !== null) {
          const parsed = parseFloat(savedVol);
          // Migrate old default of 0.5 down to 0.2
          if (!isNaN(parsed) && parsed >= 0 && parsed <= 1 && parsed !== 0.5) {
            this.volumeState = parsed;
          } else {
            this.volumeState = 0.2;
          }
        } else {
          this.volumeState = 0.2;
        }
      } catch {
        this.isEnabledState = true;
        this.volumeState = 0.2;
      }

      this.attachVisibilityListener();
      this.attachAutoplayUnlockListeners();
      this.attachKeyboardShortcutListener();
      this.preloadMenuTracks();
      (window as any).__musicManager = this;
    }
  }

  // ---------------------------------------------------------------------------
  // Web Audio Graph Initialization
  // ---------------------------------------------------------------------------

  private initGraph(): boolean {
    if (typeof window === 'undefined') return false;

    if (!this.audioCtx) {
      this.audioCtx = soundManager.getAudioContext();
    }

    if (!this.audioCtx) return false;

    if (!this.masterLimiter) {
      const ac = this.audioCtx;

      // Master dynamics limiter @ -18dB per MUSIC.md Section 6
      this.masterLimiter = ac.createDynamicsCompressor();
      this.masterLimiter.threshold.setValueAtTime(-18, ac.currentTime);
      this.masterLimiter.knee.setValueAtTime(12, ac.currentTime);
      this.masterLimiter.ratio.setValueAtTime(12, ac.currentTime);
      this.masterLimiter.attack.setValueAtTime(0.003, ac.currentTime);
      this.masterLimiter.release.setValueAtTime(0.25, ac.currentTime);
      this.masterLimiter.connect(ac.destination);

      // Music overall volume gain
      this.musicGainNode = ac.createGain();
      const initialGain = this.isEnabledState ? volumeToGain(this.getEffectiveVolume()) : 0;
      this.musicGainNode.gain.setValueAtTime(initialGain, ac.currentTime);
      this.musicGainNode.connect(this.masterLimiter);

      // Duck gain (line clear juice)
      this.duckGainNode = ac.createGain();
      this.duckGainNode.gain.setValueAtTime(1.0, ac.currentTime);
      this.duckGainNode.connect(this.musicGainNode);

      // Level gain (state machine level adjustments e.g. pause, game over, level up)
      this.levelGainNode = ac.createGain();
      this.levelGainNode.gain.setValueAtTime(1.0, ac.currentTime);
      this.levelGainNode.connect(this.duckGainNode);

      // Lowpass filter (sweeps down on pause / game over / stack danger)
      this.filterNode = ac.createBiquadFilter();
      this.filterNode.type = 'lowpass';
      this.filterNode.frequency.setValueAtTime(18000, ac.currentTime);
      this.filterNode.Q.setValueAtTime(0.7, ac.currentTime);
      this.filterNode.connect(this.levelGainNode);
    }

    return true;
  }

  // ---------------------------------------------------------------------------
  // Autoplay Policy & Visibility Handling
  // ---------------------------------------------------------------------------

  private attachAutoplayUnlockListeners(): void {
    if (typeof window === 'undefined') return;

    const handleUnlock = () => {
      this.initGraph();
      const ac = this.audioCtx || soundManager.getAudioContext();
      if (ac) {
        if (ac.state === 'suspended') {
          ac.resume().then(() => {
            if (ac.state === 'running' && this.pendingRoleOrId) {
              const role = this.pendingRoleOrId;
              this.pendingRoleOrId = null;
              this.play(role);
            }
          }).catch(() => {});
        } else if (ac.state === 'running' && this.pendingRoleOrId) {
          const role = this.pendingRoleOrId;
          this.pendingRoleOrId = null;
          this.play(role);
        }
      }
    };

    window.addEventListener('pointerdown', handleUnlock, { passive: true });
    window.addEventListener('keydown', handleUnlock, { passive: true });
    window.addEventListener('touchstart', handleUnlock, { passive: true });
    window.addEventListener('click', handleUnlock, { passive: true });
    window.addEventListener('focus', handleUnlock, { passive: true });

    // Also monitor AudioContext state change if already instantiated
    const ac = soundManager.getAudioContext();
    if (ac) {
      ac.addEventListener('statechange', handleUnlock);
    }
  }

  private attachVisibilityListener(): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    // Window blur: fires when user Alt + Tabs, clicks on another app, or switches windows
    window.addEventListener('blur', () => {
      this.setBackgroundDucked(true, 250);
    });

    // Window focus: fires when user Alt + Tabs back into browser or activates window
    window.addEventListener('focus', () => {
      if (!document.hidden) {
        this.setBackgroundDucked(false, 250);
      }
    });

    // Visibility change: fires when user switches browser tabs or minimizes
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.setBackgroundDucked(true, 250);
      } else {
        const hasFocus = typeof document.hasFocus === 'function' ? document.hasFocus() : true;
        if (hasFocus) {
          this.setBackgroundDucked(false, 250);
        }
      }
    });

    // Pointer/keyboard interaction inside app ensures volume restoration
    const handleUserActive = () => {
      if (this.isAppBackgroundDucked && !document.hidden) {
        this.setBackgroundDucked(false, 200);
      }
    };
    window.addEventListener('pointerdown', handleUserActive, { passive: true });
    window.addEventListener('keydown', handleUserActive, { passive: true });
  }

  private attachKeyboardShortcutListener(): void {
    if (typeof window === 'undefined') return;

    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'm' || e.key === 'M' || e.code === 'KeyM') {
        const target = e.target as HTMLElement | null;
        if (
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target?.isContentEditable
        ) {
          return;
        }

        e.preventDefault();
        this.toggle();
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Preload and Lazy-load
  // ---------------------------------------------------------------------------

  public async preloadMenuTracks(): Promise<void> {
    const defaultTrack = getTrackById(DEFAULT_MENU_TRACK_ID) || getTracksByRole('menu')[0];
    if (defaultTrack && !this.bufferCache.has(defaultTrack.id)) {
      await this.loadBuffer(defaultTrack);
    }
  }

  public async preloadMenuTrack(): Promise<void> {
    return this.preloadMenuTracks();
  }

  public async lazyLoadGameTracks(): Promise<void> {
    if (!this.isEnabledState) return;
    const gameTracks = getTracksByRole('game');
    for (const track of gameTracks) {
      if (!this.bufferCache.has(track.id)) {
        await this.loadBuffer(track);
      }
    }
  }

  public async loadBuffer(track: MusicTrack): Promise<AudioBuffer | null> {
    if (this.bufferCache.has(track.id)) {
      return this.bufferCache.get(track.id)!;
    }

    if (this.loadingPromises.has(track.id)) {
      return this.loadingPromises.get(track.id)!;
    }

    const promise = (async () => {
      try {
        if (typeof window === 'undefined') return null;

        const response = await fetch(track.file);
        if (!response.ok) {
          console.warn(`[MusicManager] Failed to fetch track ${track.id}: ${response.statusText}`);
          return null;
        }

        const arrayBuffer = await response.arrayBuffer();

        // AudioContext is needed to decode
        this.initGraph();
        const ac = this.audioCtx || soundManager.getAudioContext();
        if (!ac) return null;

        const decodedBuffer = await ac.decodeAudioData(arrayBuffer);
        this.bufferCache.set(track.id, decodedBuffer);
        return decodedBuffer;
      } catch (err) {
        console.warn(`[MusicManager] Error decoding track ${track.id}:`, err);
        return null;
      } finally {
        this.loadingPromises.delete(track.id);
      }
    })();

    this.loadingPromises.set(track.id, promise);
    return promise;
  }

  // ---------------------------------------------------------------------------
  // Playback Methods
  // ---------------------------------------------------------------------------

  /**
   * Resolves target track given role or exact track ID.
   */
  private resolveTrack(roleOrId: MusicRole | string): { track: MusicTrack | null; role: MusicRole } {
    if (roleOrId === 'menu') {
      const track = this.menuPlaylist.getNextTrack();
      return { track, role: 'menu' };
    }

    if (roleOrId === 'game') {
      const track = this.gamePlaylist.getNextTrack();
      return { track, role: 'game' };
    }

    const exact = getTrackById(roleOrId) || null;
    return { track: exact, role: exact ? exact.role : 'menu' };
  }

  /**
   * Starts playing track for specified role or track ID.
   */
  public async play(roleOrId: MusicRole | string): Promise<void> {
    this.initGraph();
    const ac = this.audioCtx;

    // Check AudioContext running state (Autoplay policy)
    if (!ac || ac.state !== 'running') {
      this.pendingRoleOrId = roleOrId;
      return;
    }

    this.pendingRoleOrId = null;

    const { track, role } = this.resolveTrack(roleOrId);
    if (!track) return;

    this.currentRole = role;

    // 1. If buffer is already cached, play via sample-accurate AudioBufferSourceNode
    if (this.bufferCache.has(track.id)) {
      const buffer = this.bufferCache.get(track.id)!;
      this.cleanupAllChannels();
      const channel = this.createChannel(track, buffer, false);
      this.currentChannel = channel;
      channel.trackGain.connect(this.filterNode!);
      channel.crossfadeGain.gain.setValueAtTime(1.0, ac.currentTime);
      const startOffset = channel.isLooping && track.loopStart ? track.loopStart : 0;
      (channel.source as AudioBufferSourceNode).start(ac.currentTime, startOffset);
      this.schedulePlaylistAdvance(channel);
      this.dispatchTrackChange(track);
      if (role === 'game') {
        this.lazyLoadGameTracks().catch(() => {});
      }
      return;
    }

    // 2. Fast streaming path: In browser environment, stream via HTMLAudioElement immediately
    // Starts playback in ~150ms instead of waiting seconds for full decode
    const canStream =
      typeof window !== 'undefined' &&
      typeof window.Audio !== 'undefined' &&
      typeof ac.createMediaElementSource === 'function';

    if (canStream) {
      this.cleanupAllChannels();
      const audioEl = new Audio(track.file);
      audioEl.preload = 'auto';

      const channel = this.createStreamChannel(track, audioEl, false);
      this.currentChannel = channel;
      channel.trackGain.connect(this.filterNode!);
      channel.crossfadeGain.gain.setValueAtTime(1.0, ac.currentTime);

      audioEl.play().catch((err) => {
        if (err && err.name !== 'AbortError') {
          console.warn('[MusicManager] stream play prevented:', err);
        }
      });

      this.schedulePlaylistAdvance(channel);
      this.dispatchTrackChange(track);

      return;
    }

    // 3. Fallback (e.g. Node / testing environment without window.Audio)
    const buffer = await this.loadBuffer(track);
    if (!buffer) return;

    if (this.currentRole !== role && roleOrId !== track.id) {
      return;
    }

    this.cleanupAllChannels();
    const channel = this.createChannel(track, buffer, false);
    this.currentChannel = channel;
    channel.trackGain.connect(this.filterNode!);
    channel.crossfadeGain.gain.setValueAtTime(1.0, ac.currentTime);
    const startOffset = channel.isLooping && track.loopStart ? track.loopStart : 0;
    (channel.source as AudioBufferSourceNode).start(ac.currentTime, startOffset);
    this.schedulePlaylistAdvance(channel);
    this.dispatchTrackChange(track);
    if (role === 'game') {
      this.lazyLoadGameTracks().catch(() => {});
    }
  }

  /**
   * Stops all playing music smoothly over fadeMs (default 150ms).
   */
  public stop(fadeMs: number = 150): void {
    this.pendingRoleOrId = null;
    this.currentRole = null;

    if (!this.currentChannel && this.fadingOutChannels.length === 0) return;

    const ac = this.audioCtx;
    if (!ac) {
      this.cleanupAllChannels();
      return;
    }

    const fadeDurationSec = Math.max(0.01, fadeMs / 1000);
    const now = ac.currentTime;

    const channelsToStop = [
      ...(this.currentChannel ? [this.currentChannel] : []),
      ...this.fadingOutChannels,
    ];

    this.currentChannel = null;
    this.fadingOutChannels = [];

    for (const ch of channelsToStop) {
      try {
        if (ch.autoAdvanceTimer) clearTimeout(ch.autoAdvanceTimer);
        ch.crossfadeGain.gain.cancelScheduledValues(now);
        ch.crossfadeGain.gain.setValueAtTime(ch.crossfadeGain.gain.value, now);
        ch.crossfadeGain.gain.linearRampToValueAtTime(0.0001, now + fadeDurationSec);
        if ('stop' in ch.source) {
          (ch.source as AudioBufferSourceNode).stop(now + fadeDurationSec + 0.02);
        } else if (ch.mediaElement) {
          setTimeout(() => {
            try {
              ch.mediaElement?.pause();
            } catch {}
          }, fadeMs + 20);
        }

        setTimeout(() => {
          this.disposeChannel(ch);
        }, fadeMs + 50);
      } catch {
        this.disposeChannel(ch);
      }
    }
  }

  /**
   * 1200ms equal-power crossfade from current track to target role or track.
   */
  public async crossfadeTo(roleOrId: MusicRole | string, durationMs: number = 1200): Promise<void> {
    this.initGraph();
    const ac = this.audioCtx;

    if (!ac || ac.state !== 'running') {
      this.pendingRoleOrId = roleOrId;
      return;
    }

    // If nothing currently playing, play normally
    if (!this.currentChannel) {
      return this.play(roleOrId);
    }

    const { track, role } = this.resolveTrack(roleOrId);
    if (!track) return;

    this.currentRole = role;

    const oldChannel = this.currentChannel;
    if (oldChannel.autoAdvanceTimer) clearTimeout(oldChannel.autoAdvanceTimer);

    const canStream =
      typeof window !== 'undefined' &&
      typeof window.Audio !== 'undefined' &&
      typeof ac.createMediaElementSource === 'function';

    const now = ac.currentTime;
    let newChannel: ActiveChannel;

    if (this.bufferCache.has(track.id)) {
      const buffer = this.bufferCache.get(track.id)!;
      newChannel = this.createChannel(track, buffer, false);
      const startOffset = newChannel.isLooping && track.loopStart ? track.loopStart : 0;
      (newChannel.source as AudioBufferSourceNode).start(now, startOffset);
    } else if (canStream) {
      const audioEl = new Audio(track.file);
      audioEl.preload = 'auto';
      newChannel = this.createStreamChannel(track, audioEl, false);
      audioEl.play().catch(() => {});
    } else {
      const buffer = await this.loadBuffer(track);
      if (!buffer) return;
      newChannel = this.createChannel(track, buffer, false);
      const startOffset = newChannel.isLooping && track.loopStart ? track.loopStart : 0;
      (newChannel.source as AudioBufferSourceNode).start(now, startOffset);
    }

    // If any older channels were still fading out, terminate them immediately
    while (this.fadingOutChannels.length > 0) {
      const older = this.fadingOutChannels.shift();
      if (older) {
        try {
          if ('stop' in older.source) {
            (older.source as AudioBufferSourceNode).stop();
          }
        } catch {}
        if (older.mediaElement) {
          try {
            older.mediaElement.pause();
            older.mediaElement.currentTime = 0;
            older.mediaElement.removeAttribute('src');
            older.mediaElement.load();
          } catch {}
        }
        this.disposeChannel(older);
      }
    }

    this.currentChannel = newChannel;
    this.fadingOutChannels.push(oldChannel);

    newChannel.trackGain.connect(this.filterNode!);

    const fadeNow = ac.currentTime;
    const durationSec = durationMs / 1000;

    // Schedule outgoing fade safely with linear ramp
    try {
      oldChannel.crossfadeGain.gain.cancelScheduledValues(fadeNow);
      oldChannel.crossfadeGain.gain.setValueAtTime(oldChannel.crossfadeGain.gain.value, fadeNow);
      oldChannel.crossfadeGain.gain.linearRampToValueAtTime(0.0001, fadeNow + durationSec);
    } catch {
      try {
        oldChannel.crossfadeGain.gain.value = 0.0001;
      } catch {}
    }

    // Schedule incoming fade safely with linear ramp
    try {
      newChannel.crossfadeGain.gain.cancelScheduledValues(fadeNow);
      newChannel.crossfadeGain.gain.setValueAtTime(0.0001, fadeNow);
      newChannel.crossfadeGain.gain.linearRampToValueAtTime(1.0, fadeNow + durationSec);
    } catch {
      try {
        newChannel.crossfadeGain.gain.value = 1.0;
      } catch {}
    }

    if ('stop' in oldChannel.source) {
      try {
        (oldChannel.source as AudioBufferSourceNode).stop(fadeNow + durationSec + 0.05);
      } catch {}
    }

    // Clean up old channel completely after crossfade completes
    setTimeout(() => {
      try {
        if ('stop' in oldChannel.source) {
          (oldChannel.source as AudioBufferSourceNode).stop();
        }
      } catch {}
      if (oldChannel.mediaElement) {
        try {
          oldChannel.mediaElement.pause();
          oldChannel.mediaElement.currentTime = 0;
          oldChannel.mediaElement.removeAttribute('src');
          oldChannel.mediaElement.load();
        } catch {}
      }
      this.disposeChannel(oldChannel);
      const idx = this.fadingOutChannels.indexOf(oldChannel);
      if (idx !== -1) this.fadingOutChannels.splice(idx, 1);
    }, durationMs + 50);

    this.schedulePlaylistAdvance(newChannel);
    this.dispatchTrackChange(track);
  }

  private schedulePlaylistAdvance(channel: ActiveChannel): void {
    if (channel.isLooping) return;

    // Crossfade to next track 1.2s before the current track ends
    const crossfadeDurationMs = 1200;
    const advanceDelayMs = Math.max(100, channel.duration * 1000 - crossfadeDurationMs);

    channel.autoAdvanceTimer = setTimeout(() => {
      if (this.currentChannel === channel) {
        if (this.currentRole === 'game') {
          this.crossfadeTo('game', crossfadeDurationMs);
        } else if (this.currentRole === 'menu') {
          this.crossfadeTo('menu', crossfadeDurationMs);
        }
      }
    }, advanceDelayMs);
  }

  private createChannel(track: MusicTrack, buffer: AudioBuffer, isLooping: boolean): ActiveChannel {
    const ac = this.audioCtx!;
    const source = ac.createBufferSource();
    const trackGain = ac.createGain();
    const crossfadeGain = ac.createGain();

    source.buffer = buffer;
    source.loop = isLooping;
    if (isLooping) {
      source.loopStart = track.loopStart ?? 0;
      source.loopEnd = track.loopEnd ?? buffer.duration;
    }

    // Per-track gainDb normalization + role trim
    // Menu songs (PRESS ANY KEY TO START page) boosted by +30% per user request (1.20 * 1.30 = 1.56)
    const roleGainMultiplier = track.role === 'menu' ? 1.56 : 1.0;
    const computedGain = dbToLinear(track.gainDb) * roleGainMultiplier;
    trackGain.gain.value = computedGain;
    trackGain.gain.setValueAtTime(computedGain, ac.currentTime);

    source.connect(crossfadeGain);
    crossfadeGain.connect(trackGain);

    return {
      track,
      source,
      trackGain,
      crossfadeGain,
      isLooping,
      startTime: ac.currentTime,
      duration: buffer.duration,
      autoAdvanceTimer: null,
    };
  }

  private createStreamChannel(track: MusicTrack, audioEl: HTMLAudioElement, isLooping: boolean): ActiveChannel {
    const ac = this.audioCtx!;
    const source = ac.createMediaElementSource(audioEl);
    const trackGain = ac.createGain();
    const crossfadeGain = ac.createGain();

    audioEl.loop = isLooping;

    // Per-track gainDb normalization + role trim
    // Menu songs (PRESS ANY KEY TO START page) boosted by +30% per user request (1.20 * 1.30 = 1.56)
    const roleGainMultiplier = track.role === 'menu' ? 1.56 : 1.0;
    const computedGain = dbToLinear(track.gainDb) * roleGainMultiplier;
    trackGain.gain.value = computedGain;
    trackGain.gain.setValueAtTime(computedGain, ac.currentTime);

    source.connect(crossfadeGain);
    crossfadeGain.connect(trackGain);

    if (!isLooping) {
      audioEl.addEventListener(
        'ended',
        () => {
          if (this.currentChannel?.mediaElement === audioEl) {
            if (this.currentRole === 'game') {
              this.crossfadeTo('game', 1200);
            } else if (this.currentRole === 'menu') {
              this.crossfadeTo('menu', 1200);
            }
          }
        },
        { once: true }
      );
    }

    return {
      track,
      source,
      mediaElement: audioEl,
      trackGain,
      crossfadeGain,
      isLooping,
      startTime: ac.currentTime,
      duration: audioEl.duration && !isNaN(audioEl.duration) ? audioEl.duration : (track.loopEnd ?? 180),
      autoAdvanceTimer: null,
    };
  }

  private disposeChannel(channel: ActiveChannel): void {
    if (channel.autoAdvanceTimer) clearTimeout(channel.autoAdvanceTimer);
    if (channel.mediaElement) {
      try {
        channel.mediaElement.pause();
        channel.mediaElement.currentTime = 0;
        channel.mediaElement.removeAttribute('src');
        channel.mediaElement.load();
      } catch {}
    }
    try {
      channel.source.disconnect();
    } catch {}
    try {
      channel.crossfadeGain.disconnect();
    } catch {}
    try {
      channel.trackGain.disconnect();
    } catch {}
  }

  private cleanupAllChannels(): void {
    if (typeof window !== 'undefined' && (window as any).__preloadedMenuAudio) {
      try {
        (window as any).__preloadedMenuAudio.pause();
        (window as any).__preloadedMenuAudio.currentTime = 0;
        (window as any).__preloadedMenuAudio.removeAttribute('src');
        (window as any).__preloadedMenuAudio.load();
      } catch {}
      delete (window as any).__preloadedMenuAudio;
    }

    if (this.currentChannel) {
      try {
        if ('stop' in this.currentChannel.source) {
          (this.currentChannel.source as AudioBufferSourceNode).stop();
        } else if (this.currentChannel.mediaElement) {
          this.currentChannel.mediaElement.pause();
        }
      } catch {}
      this.disposeChannel(this.currentChannel);
      this.currentChannel = null;
    }
    for (const ch of this.fadingOutChannels) {
      try {
        if ('stop' in ch.source) {
          (ch.source as AudioBufferSourceNode).stop();
        } else if (ch.mediaElement) {
          ch.mediaElement.pause();
        }
      } catch {}
      this.disposeChannel(ch);
    }
    this.fadingOutChannels = [];
  }

  // ---------------------------------------------------------------------------
  // Reactive Groove & State Machine Controls
  // ---------------------------------------------------------------------------

  /**
   * Duck on line clear: dips level by db for durationMs, then recovers over recoveryMs (400ms).
   */
  public duck(db: number, durationMs: number, recoveryMs: number = 400): void {
    if (!this.duckGainNode || !this.audioCtx) return;

    const ac = this.audioCtx;
    const now = ac.currentTime;
    const targetGain = dbToLinear(db);
    const attackSec = 0.02; // 20ms click-free attack
    const holdSec = durationMs / 1000;
    const recoverySec = recoveryMs / 1000;

    const g = this.duckGainNode.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(targetGain, now + attackSec);
    g.setValueAtTime(targetGain, now + Math.max(attackSec, holdSec));
    g.linearRampToValueAtTime(1.0, now + Math.max(attackSec, holdSec) + recoverySec);
  }

  /**
   * Reactive groove line clear duck per MUSIC.md Section 5:
   * - 1 line: -3dB for 180ms
   * - 2 lines: -4.5dB for 180ms
   * - 3 lines: -6dB for 180ms
   * - 4 lines (Tetris): -8dB for 300ms
   * All recover over 400ms.
   */
  public handleLineClear(linesCleared: number): void {
    if (linesCleared <= 0) return;

    let dipDb = -3;
    let durationMs = 180;

    if (linesCleared === 1) {
      dipDb = -3;
      durationMs = 180;
    } else if (linesCleared === 2) {
      dipDb = -4.5;
      durationMs = 180;
    } else if (linesCleared === 3) {
      dipDb = -6;
      durationMs = 180;
    } else {
      // 4 lines or more (Tetris)
      dipDb = -8;
      durationMs = 300;
    }

    this.duck(dipDb, durationMs, 400);
  }

  /**
   * Sweeps lowpass filter cutoff frequency over rampMs (e.g. 600Hz pause, 400Hz game over).
   */
  public setLowpass(freq: number, rampMs: number = 250): void {
    if (!this.filterNode || !this.audioCtx) return;

    const clampedFreq = Math.max(200, Math.min(20000, freq));
    const ac = this.audioCtx;
    const now = ac.currentTime;
    const rampSec = Math.max(0.01, rampMs / 1000);

    const f = this.filterNode.frequency;
    f.cancelScheduledValues(now);
    const startVal = Math.max(20, f.value);
    f.setValueAtTime(startVal, now);
    f.exponentialRampToValueAtTime(clampedFreq, now + rampSec);
  }

  /**
   * Reactive groove danger lowpass per MUSIC.md Section 5:
   * As stack rises above 60% of board height, closes lowpass from 18kHz toward a floor of 3kHz
   * in proportion to stack height. Reopens smoothly over 300ms as lines clear.
   * Never drops below 3kHz.
   */
  public handleStackHeight(heightRatio: number): void {
    if (this.currentRole !== 'game') return;

    if (heightRatio <= 0.6) {
      this.currentDangerCutoff = 18000;
      this.setLowpass(18000, 300);
      return;
    }

    // Between 60% and 100% board height:
    const excess = Math.min(1, (heightRatio - 0.6) / 0.4);
    const targetFreq = Math.max(3000, Math.round(18000 - excess * 15000));
    this.currentDangerCutoff = targetFreq;
    this.setLowpass(targetFreq, 300);
  }

  public getCurrentDangerCutoff(): number {
    return this.currentDangerCutoff;
  }

  /**
   * Reactive groove level up lift per MUSIC.md Section 5:
   * Music level lifts +1.5dB for 800ms, then settles back to baseline.
   */
  public handleLevelUp(): void {
    if (!this.levelGainNode || !this.audioCtx) return;

    const ac = this.audioCtx;
    const now = ac.currentTime;
    const peakGain = dbToLinear(1.5); // ~1.1885 (+1.5 dB)
    const baselineGain = 1.0;

    const g = this.levelGainNode.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(peakGain, now + 0.05); // 50ms quick lift
    g.setValueAtTime(peakGain, now + 0.8); // hold for 800ms
    g.linearRampToValueAtTime(baselineGain, now + 1.1); // 300ms smooth decay to baseline
  }

  /**
   * Optional beat quantization per MUSIC.md Section 5:
   * If the current track has BPM configured, computes the delay until the next 1/8 beat grid boundary
   * (capped at max 60ms late). If BPM is missing or track is not playing, returns 0.
   */
  public getQuantizedOffset(maxLateSec: number = 0.06): number {
    if (!this.currentChannel || !this.audioCtx) return 0;
    const bpm = this.currentChannel.track.bpm;
    if (!bpm || bpm <= 0) return 0;

    // 1/8 beat interval in seconds: (60 / bpm) / 8
    const eighthBeatSec = 60 / (bpm * 8);
    const elapsed = Math.max(0, this.audioCtx.currentTime - this.currentChannel.startTime);
    const intoInterval = elapsed % eighthBeatSec;
    const delay = (eighthBeatSec - intoInterval) % eighthBeatSec;

    return Math.min(delay, maxLateSec);
  }

  public getCurrentBpm(): number | undefined {
    return this.currentChannel?.track.bpm;
  }

  /**
   * Sets offset level on the music bus over rampMs (e.g. -6dB pause, +1.5dB level up).
   */
  public setLevel(db: number, rampMs: number = 250): void {
    if (!this.levelGainNode || !this.audioCtx) return;

    const targetGain = dbToLinear(db);
    const ac = this.audioCtx;
    const now = ac.currentTime;
    const rampSec = Math.max(0.01, rampMs / 1000);

    const g = this.levelGainNode.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(targetGain, now + rampSec);
  }

  /**
   * Sets offset level on the music bus as percentage (0% to 100%) over rampMs.
   * e.g. 25% for gate dismiss / game over, 70% for Leaderboard, 100% for full level.
   */
  public setLevelPercent(percent: number, rampMs: number = 250): void {
    if (!this.levelGainNode || !this.audioCtx) return;

    const clampedGain = Math.max(0, Math.min(2, percent / 100));
    const ac = this.audioCtx;
    const now = ac.currentTime;
    const rampSec = Math.max(0.01, rampMs / 1000);

    const g = this.levelGainNode.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(clampedGain, now + rampSec);
  }

  /**
   * Clears any pending state transition timers (e.g. game over / run complete delayed crossfades).
   */
  public clearStateTimers(): void {
    if (this.stateTransitionTimer) {
      clearTimeout(this.stateTransitionTimer);
      this.stateTransitionTimer = null;
    }
  }

  /**
   * Handles start gate appearance on the "PRESS ANY KEY TO START" page:
   * ONLY songs in the menu folder (block builder music for PRESS THE KEY TO START page) play here.
   */
  public handleIntroGate(): void {
    this.clearStateTimers();
    if (!this.isEnabledState) return;
    this.initGraph();

    // Stop any in-game music channel that might be active
    if (this.currentRole === 'game') {
      this.stop(0);
    }

    const ac = this.audioCtx || soundManager.getAudioContext();
    if (ac) {
      if (ac.state === 'running') {
        if (this.currentRole !== 'menu') {
          this.play('menu');
        }
        this.setLevelPercent(100, 0);
        this.setLowpass(18000, 0);
      } else {
        this.pendingRoleOrId = 'menu';
        ac.resume().then(() => {
          if (ac.state === 'running' && this.pendingRoleOrId === 'menu') {
            this.pendingRoleOrId = null;
            if (this.currentRole !== 'menu') {
              this.play('menu');
            }
            this.setLevelPercent(100, 0);
            this.setLowpass(18000, 0);
          }
        }).catch(() => {});
      }
    } else {
      this.pendingRoleOrId = 'menu';
    }
  }

  /**
   * Handles start gate dismissal:
   * The PRESS ANY KEY TO START music only plays on PRESS ANY KEY TO START page.
   * Once gate is dismissed, transitions immediately to the main game music.
   */
  public handleGateDismiss(): void {
    this.clearStateTimers();
    this.pendingRoleOrId = null;
    if (this.currentRole !== 'game') {
      this.crossfadeTo('game', 600);
    }
    this.setLevelPercent(25, 0);
    this.setLowpass(18000, 0);
  }

  /**
   * Handles intro line-clear transition swell as the game screen is revealed:
   * Swells main game music from 25% to 100% over 1200ms as the game screen is entered.
   */
  public handleIntroTransition(): void {
    if (this.currentRole !== 'game') {
      this.crossfadeTo('game', 1200);
    }
    this.setLevelPercent(100, 1200);
  }

  /**
   * Handles tab change:
   * In game, the ONLY music that will be played will be the main game music, even in leaderboard.
   * When switching to leaderboard, the volume of the music goes down by 5% (to 95%).
   * When switching to Practice / Daily, volume restores to 100%.
   */
  public handleTabChange(
    tab: 'practice' | 'daily' | 'leaderboard',
    gameState?: 'ready' | 'play' | 'pause' | 'over' | 'done'
  ): void {
    this.clearStateTimers();

    // In game the ONLY music that will be played will be the main game music even in leaderboard
    if (this.currentRole !== 'game') {
      this.crossfadeTo('game', 800);
    }

    if (tab === 'leaderboard') {
      // When switching to leaderboard, the volume of the music goes down by 5% (to 95%)
      this.setLevelPercent(95, 300);
      this.setLowpass(18000, 300);
    } else {
      // Practice and Daily tabs: volume is 100%
      this.setLevelPercent(100, 300);
      this.setLowpass(gameState === 'play' ? this.currentDangerCutoff : 18000, 300);
    }
  }

  /**
   * Handles GameBoard state machine transitions on the actual game screen.
   * Main game music plays as soon as player enters the game screen ('ready') and continues into gameplay ('play').
   */
  public handleGameState(
    state: 'ready' | 'play' | 'pause' | 'over' | 'done',
    introActive: boolean = false
  ): void {
    if (introActive) return;

    this.clearStateTimers();

    switch (state) {
      case 'ready':
        // Ready overlay: Main game music plays as soon as user enters the game
        if (this.currentRole !== 'game' || this.currentChannel?.track.role !== 'game') {
          this.play('game');
        }
        this.currentDangerCutoff = 18000;
        this.setLevelPercent(100, 300);
        this.setLowpass(18000, 300);
        break;

      case 'play':
        // Active gameplay: Ensure game music continues playing seamlessly
        if (this.currentRole !== 'game' || this.currentChannel?.track.role !== 'game') {
          this.play('game');
        }
        this.setLevelPercent(100, 250);
        this.setLowpass(this.currentDangerCutoff, 250);
        break;

      case 'pause':
        // Paused: Lowpass sweeps to 600Hz and level drops 6dB over 250ms
        this.setLowpass(600, 250);
        this.setLevel(-6, 250);
        break;

      case 'over':
        // Game over: Level to 25% and lowpass to 400Hz over 900ms
        this.setLevelPercent(25, 900);
        this.setLowpass(400, 900);
        this.stateTransitionTimer = setTimeout(() => {
          this.setLowpass(18000, 500);
          this.setLevelPercent(100, 500);
          if (this.currentRole !== 'game') {
            this.crossfadeTo('game', 1200);
          }
        }, 1500);
        break;

      case 'done':
        // Run complete (100 pieces): Level to 25% and lowpass to 400Hz over 900ms
        this.setLevelPercent(25, 900);
        this.setLowpass(400, 900);
        this.stateTransitionTimer = setTimeout(() => {
          this.setLowpass(18000, 500);
          this.setLevelPercent(100, 500);
          if (this.currentRole !== 'game') {
            this.crossfadeTo('game', 1200);
          }
        }, 2500);
        break;
    }
  }

  /**
   * Suspends music playback smoothly (e.g. tab hidden).
   */
  public suspend(rampMs: number = 150): void {
    if (!this.musicGainNode || !this.audioCtx) return;

    const ac = this.audioCtx;
    const now = ac.currentTime;
    const rampSec = rampMs / 1000;

    this.musicGainNode.gain.cancelScheduledValues(now);
    this.musicGainNode.gain.setValueAtTime(this.musicGainNode.gain.value, now);
    this.musicGainNode.gain.linearRampToValueAtTime(0.0001, now + rampSec);
    this.isSuspendedDueToVisibility = true;
  }

  /**
   * Resumes music playback smoothly.
   */
  public resume(rampMs: number = 200): void {
    if (!this.musicGainNode || !this.audioCtx) return;

    const ac = this.audioCtx;
    const now = ac.currentTime;
    const rampSec = rampMs / 1000;
    const targetGain = this.isEnabledState ? volumeToGain(this.getEffectiveVolume()) : 0;

    this.musicGainNode.gain.cancelScheduledValues(now);
    this.musicGainNode.gain.setValueAtTime(this.musicGainNode.gain.value, now);
    this.musicGainNode.gain.linearRampToValueAtTime(targetGain, now + rampSec);
    this.isSuspendedDueToVisibility = false;
  }

  // ---------------------------------------------------------------------------
  // Settings & Volume Controls
  // ---------------------------------------------------------------------------

  public isEnabled(): boolean {
    return this.isEnabledState;
  }

  public setEnabled(enabled: boolean): void {
    this.isEnabledState = enabled;
    try {
      localStorage.setItem('bb-music', enabled ? '1' : '0');
    } catch {}

    if (this.musicGainNode && this.audioCtx && !this.isSuspendedDueToVisibility) {
      const ac = this.audioCtx;
      const now = ac.currentTime;
      const targetGain = enabled ? volumeToGain(this.getEffectiveVolume()) : 0;

      this.musicGainNode.gain.cancelScheduledValues(now);
      this.musicGainNode.gain.setValueAtTime(this.musicGainNode.gain.value, now);
      this.musicGainNode.gain.linearRampToValueAtTime(targetGain, now + 0.15); // 150ms ramp
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('bb-music-change', { detail: enabled }));
    }
  }

  public toggle(): boolean {
    const next = !this.isEnabledState;
    this.setEnabled(next);
    return next;
  }

  public getVolume(): number {
    return this.volumeState;
  }

  /**
   * Computes the effective active volume:
   * When user Alt + Tabs or switches away from the browser, WebApp volume goes down by 10% (0.10).
   * For example:
   * - Default 15% (0.15) ducks down to 5% (0.05)
   * - 50% (0.50) ducks down to 40% (0.40)
   * - Restores immediately to user's set volume when user switches back.
   */
  public getEffectiveVolume(): number {
    if (!this.isEnabledState) return 0;
    if (this.isAppBackgroundDucked) {
      if (this.volumeState <= 0) return 0;
      if (this.volumeState <= 0.10) {
        return Math.max(0.01, this.volumeState * 0.33);
      }
      return Math.max(0.01, this.volumeState - 0.10);
    }
    return this.volumeState;
  }

  public isBackgroundDucked(): boolean {
    return this.isAppBackgroundDucked;
  }

  /**
   * Smoothly ducks or restores WebApp volume on background/blur transitions (over 250ms).
   */
  public setBackgroundDucked(ducked: boolean, rampMs: number = 250): void {
    if (this.isAppBackgroundDucked === ducked) return;
    this.isAppBackgroundDucked = ducked;

    if (this.musicGainNode && this.audioCtx && this.isEnabledState && !this.isSuspendedDueToVisibility) {
      const ac = this.audioCtx;
      const now = ac.currentTime;
      const rampSec = Math.max(0.01, rampMs / 1000);
      const targetGain = volumeToGain(this.getEffectiveVolume());

      this.musicGainNode.gain.cancelScheduledValues(now);
      this.musicGainNode.gain.setValueAtTime(this.musicGainNode.gain.value, now);
      this.musicGainNode.gain.linearRampToValueAtTime(targetGain, now + rampSec);
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('bb-music-duck-change', {
          detail: { ducked, effectiveVolume: this.getEffectiveVolume() },
        })
      );
    }
  }

  public setVolume(vol: number): void {
    const clamped = Math.max(0, Math.min(1, vol));
    this.volumeState = clamped;

    try {
      localStorage.setItem('bb-music-vol', clamped.toString());
    } catch {}

    if (this.musicGainNode && this.audioCtx && this.isEnabledState && !this.isSuspendedDueToVisibility) {
      const ac = this.audioCtx;
      const now = ac.currentTime;
      const targetGain = volumeToGain(this.getEffectiveVolume());

      this.musicGainNode.gain.cancelScheduledValues(now);
      this.musicGainNode.gain.setValueAtTime(this.musicGainNode.gain.value, now);
      this.musicGainNode.gain.linearRampToValueAtTime(targetGain, now + 0.15); // 150ms ramp
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('bb-music-vol-change', { detail: clamped }));
    }
  }

  public getCurrentTrack(): MusicTrack | null {
    return this.currentChannel ? this.currentChannel.track : null;
  }

  public getCurrentRole(): MusicRole | null {
    return this.currentRole;
  }

  public getPlaylist(): Playlist {
    return this.gamePlaylist;
  }

  public getMenuPlaylist(): Playlist {
    return this.menuPlaylist;
  }

  private dispatchTrackChange(track: MusicTrack): void {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('bb-music-track-change', { detail: track }));
    }
  }
}

export const musicManager = new MusicManager();
