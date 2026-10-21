'use client';

/**
 * Sound Manager for the Leaderboard and game feel.
 * Web Audio API synthesizer matching DESIGN.md and LEADERBOARD.md specifications.
 * AudioContext is instantiated or resumed only after the first user input.
 */

class SoundManager {
  private audioCtx: AudioContext | null = null;
  private masterLimiter: DynamicsCompressorNode | null = null;
  private soundEnabled: boolean = true;
  private isInitialized: boolean = false;

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('bb-sound');
        this.soundEnabled = saved !== 'false' && saved !== '0';
      } catch {
        this.soundEnabled = true;
      }
      this.attachFirstInputListeners();
    }
  }

  private attachFirstInputListeners(): void {
    const handleFirstInput = () => {
      this.initAudioContext();
      window.removeEventListener('pointerdown', handleFirstInput);
      window.removeEventListener('keydown', handleFirstInput);
      window.removeEventListener('touchstart', handleFirstInput);
    };

    window.addEventListener('pointerdown', handleFirstInput, { passive: true, once: true });
    window.addEventListener('keydown', handleFirstInput, { passive: true, once: true });
    window.addEventListener('touchstart', handleFirstInput, { passive: true, once: true });
  }

  public initAudioContext(): void {
    if (typeof window === 'undefined') return;
    if (!this.audioCtx) {
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtxClass) {
        this.audioCtx = new AudioCtxClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    if (this.audioCtx && !this.masterLimiter) {
      this.getMasterLimiter();
    }
    this.isInitialized = true;
  }

  public getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    this.initAudioContext();
    return this.audioCtx;
  }

  /**
   * Master dynamics compressor / limiter to prevent clipping on dense sound moments (crash, stamps)
   */
  public getMasterLimiter(): DynamicsCompressorNode | null {
    if (!this.audioCtx) {
      this.initAudioContext();
    }
    const ac = this.audioCtx;
    if (!ac) return null;
    if (!this.masterLimiter) {
      try {
        const c = ac.createDynamicsCompressor();
        c.threshold.setValueAtTime(-14, ac.currentTime);
        c.knee.setValueAtTime(8, ac.currentTime);
        c.ratio.setValueAtTime(12, ac.currentTime);
        c.attack.setValueAtTime(0.003, ac.currentTime);
        c.release.setValueAtTime(0.2, ac.currentTime);
        c.connect(ac.destination);
        this.masterLimiter = c;
      } catch {
        this.masterLimiter = null;
      }
    }
    return this.masterLimiter;
  }

  public getMasterNode(): AudioNode | null {
    const limiter = this.getMasterLimiter();
    if (limiter) return limiter;
    return this.audioCtx ? this.audioCtx.destination : null;
  }

  public isEnabled(): boolean {
    return this.soundEnabled;
  }

  public setEnabled(enabled: boolean): void {
    this.soundEnabled = enabled;
    try {
      localStorage.setItem('bb-sound', enabled ? '1' : '0');
    } catch {}
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('bb-sound-change', { detail: enabled }));
    }
    if (enabled) {
      this.beep(440, 0.06);
    }
  }

  public toggle(): boolean {
    const next = !this.soundEnabled;
    this.setEnabled(next);
    return next;
  }

  /**
   * Synthesize audio tone
   */
  public beep(
    frequency: number,
    duration: number = 0.06,
    type: OscillatorType = 'square',
    volume: number = 0.045,
    startOffset: number = 0
  ): void {
    if (!this.soundEnabled) return;
    try {
      if (!this.audioCtx) {
        this.initAudioContext();
      }
      const ctx = this.audioCtx;
      if (!ctx || ctx.state !== 'running') return;
      const dest = this.getMasterNode() || ctx.destination;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const startTime = ctx.currentTime + startOffset;

      osc.type = type;
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(volume, startTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

      osc.connect(gain);
      gain.connect(dest);
      osc.start(startTime);
      osc.stop(startTime + duration + 0.02);
    } catch {
      // Audio autoplay blocked or interrupted
    }
  }

  /**
   * Synthesize audio tone routed through master limiter
   */
  public playTone(
    freq: number,
    startTime: number,
    duration: number,
    type: OscillatorType,
    vol: number,
    freqTo?: number
  ): void {
    if (!this.soundEnabled) return;
    try {
      const ac = this.getAudioContext();
      if (!ac || ac.state !== 'running') return;
      const dest = this.getMasterNode() || ac.destination;

      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, startTime);
      if (freqTo) {
        o.frequency.exponentialRampToValueAtTime(Math.max(1, freqTo), startTime + duration * 0.8);
      }
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
   * Synthesize noise sweep routed through master limiter
   */
  public playNoise(
    startTime: number,
    duration: number,
    f0: number,
    f1: number,
    vol: number,
    type: BiquadFilterType = 'lowpass'
  ): void {
    if (!this.soundEnabled) return;
    try {
      const ac = this.getAudioContext();
      if (!ac || ac.state !== 'running') return;
      const dest = this.getMasterNode() || ac.destination;

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

  /**
   * Tile landing blip:
   * pitch = 170 + k*45 + (2 - colIndex)*20 Hz, 70ms, fired ~430ms after tile start
   */
  public playTileLanding(colIndex: number, tileIndex: number): void {
    const pitch = 170 + tileIndex * 45 + (2 - colIndex) * 20;
    this.beep(pitch, 0.07, 'square', 0.05);
  }

  /**
   * Row accordion toggle:
   * 260Hz when closing, 380Hz when opening, 50ms
   */
  public playRowToggle(isOpening: boolean): void {
    this.beep(isOpening ? 380 : 260, 0.05);
  }

  /**
   * Sub-tab switch blip: 300Hz, 50ms
   */
  public playTabSwitch(): void {
    this.beep(300, 0.05);
  }

  /**
   * Freeze-frame heartbeat and riser sounds per GAMEOVER.md §4a & §6:
   * Heartbeat: sine 55Hz falling to 40Hz, 280ms, vol .55; second beat at +150ms, 300ms, vol .4
   * Riser: bandpass noise 400Hz to 6000Hz over 260ms, vol .14
   */
  public playFreezeHeartbeatAndRiser(): void {
    if (!this.soundEnabled) return;
    try {
      const ac = this.getAudioContext();
      if (!ac || ac.state !== 'running') return;
      const t = ac.currentTime + 0.01;
      const dest = this.getMasterNode() || ac.destination;

      const playBeat = (startTime: number, duration: number, vol: number) => {
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(55, startTime);
        o.frequency.exponentialRampToValueAtTime(40, startTime + duration * 0.8);
        g.gain.setValueAtTime(0.0001, startTime);
        g.gain.linearRampToValueAtTime(vol, startTime + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
        o.connect(g);
        g.connect(dest);
        o.start(startTime);
        o.stop(startTime + duration + 0.05);
      };

      playBeat(t, 0.28, 0.55);
      playBeat(t + 0.15, 0.3, 0.4);

      const sampleRate = ac.sampleRate;
      const d = 0.26;
      const bufferSize = Math.max(1, Math.floor(sampleRate * d));
      const buffer = ac.createBuffer(1, bufferSize, sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const source = ac.createBufferSource();
      source.buffer = buffer;
      const filter = ac.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.value = 1.2;
      filter.frequency.setValueAtTime(400, t);
      filter.frequency.exponentialRampToValueAtTime(6000, t + d);
      const gain = ac.createGain();
      gain.gain.setValueAtTime(0.14, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + d);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(dest);
      source.start(t);
    } catch {}
  }

  /**
   * BOOM crash sound for Game Over per GAMEOVER.md §6:
   * Lowpass noise 3500Hz to 120Hz over 900ms, vol .3
   * Glass crack: bandpass noise 6000Hz to 1500Hz, 140ms, vol .22
   * Sine 110Hz to 28Hz, 900ms, vol .6
   * Sine 220Hz to 60Hz, 250ms, vol .4
   * Rumble sine 46Hz, 800ms, vol .3 starting +50ms
   * Four triangle notes 392, 311, 262, 196Hz at +40ms steps of 100ms, 260ms each, vol .12
   */
  public playGameOverCrash(): void {
    if (!this.soundEnabled) return;
    const ac = this.getAudioContext();
    if (!ac || ac.state !== 'running') return;
    const t = ac.currentTime + 0.01;

    this.playNoise(t, 0.9, 3500, 120, 0.3, 'lowpass');
    this.playNoise(t, 0.14, 6000, 1500, 0.22, 'bandpass');
    this.playTone(110, t, 0.9, 'sine', 0.6, 28);
    this.playTone(220, t, 0.25, 'sine', 0.4, 60);
    this.playTone(46, t + 0.05, 0.8, 'sine', 0.3);
    [392, 311, 262, 196].forEach((f, i) =>
      this.playTone(f, t + 0.04 + i * 0.1, 0.26, 'triangle', 0.12)
    );
  }

  /**
   * Done run arpeggio per GAMEOVER.md §6:
   * Triangle arpeggio 392, 494, 587, 784Hz, 120ms apart, 300ms, vol .1
   * Plus a sine 70Hz to 40Hz 400ms vol .35
   */
  public playDoneArpeggio(): void {
    if (!this.soundEnabled) return;
    const ac = this.getAudioContext();
    if (!ac || ac.state !== 'running') return;
    const t = ac.currentTime + 0.01;

    [392, 494, 587, 784].forEach((f, i) =>
      this.playTone(f, t + i * 0.12, 0.3, 'triangle', 0.1)
    );
    this.playTone(70, t, 0.4, 'sine', 0.35, 40);
  }

  /**
   * Title letter landing impact sound per GAMEOVER.md §6:
   * Sine 150 + i*10Hz to 55Hz, 160ms, vol .3
   * Bandpass noise 1800 to 500Hz, 60ms, vol .15
   * Square 520 + i*40Hz, 50ms, vol .04
   * Last letter adds sine 70Hz to 30Hz, 500ms, vol .6
   */
  public playLetterLanding(letterIndex: number, isLast: boolean): void {
    if (!this.soundEnabled) return;
    const ac = this.getAudioContext();
    if (!ac || ac.state !== 'running') return;
    const t = ac.currentTime + 0.01;

    this.playTone(150 + letterIndex * 10, t, 0.16, 'sine', 0.3, 55);
    this.playNoise(t, 0.06, 1800, 500, 0.15, 'bandpass');
    this.playTone(520 + letterIndex * 40, t, 0.05, 'square', 0.04);
    if (isLast) {
      this.playTone(70, t, 0.5, 'sine', 0.6, 30);
    }
  }

  /**
   * Score count-up tick sound per GAMEOVER.md §6:
   * 16 ticks while counting: square, 480 + step*38Hz, 35ms, vol .022
   */
  public playCountUpTick(step: number): void {
    if (!this.soundEnabled) return;
    const ac = this.getAudioContext();
    if (!ac || ac.state !== 'running') return;
    const t = ac.currentTime + 0.005;

    this.playTone(480 + step * 38, t, 0.035, 'square', 0.022);
  }

  /**
   * NEW BEST stamp sound per GAMEOVER.md §6:
   * Bandpass noise snap 5000Hz to 800Hz, 80ms, vol .2
   * Sine 80Hz to 32Hz, 350ms, vol .6
   * Three triangle notes 523 * 1.26^i (i = 0..2), 140ms, 70ms apart, vol .07
   */
  public playNewBestStamp(): void {
    if (!this.soundEnabled) return;
    const ac = this.getAudioContext();
    if (!ac || ac.state !== 'running') return;
    const t = ac.currentTime + 0.01;

    this.playNoise(t, 0.08, 5000, 800, 0.2, 'bandpass');
    this.playTone(80, t, 0.35, 'sine', 0.6, 32);
    [0, 1, 2].forEach((i) =>
      this.playTone(523 * Math.pow(1.26, i), t + 0.06 + i * 0.07, 0.14, 'triangle', 0.07)
    );
  }

  /**
   * Retry-ready chime per GAMEOVER.md §6:
   * Triangle 988Hz, 250ms, vol .07
   */
  public playRetryReady(): void {
    if (!this.soundEnabled) return;
    const ac = this.getAudioContext();
    if (!ac || ac.state !== 'running') return;
    const t = ac.currentTime + 0.01;

    this.playTone(988, t, 0.25, 'triangle', 0.07);
  }

  /**
   * Title letter click blip per GAMEOVER.md §6:
   * Square 300 to 500Hz random, 80ms, vol .04
   */
  public playLetterClick(): void {
    if (!this.soundEnabled) return;
    const ac = this.getAudioContext();
    if (!ac || ac.state !== 'running') return;
    const t = ac.currentTime + 0.01;

    const freq = 300 + Math.random() * 200;
    this.playTone(freq, t, 0.08, 'square', 0.04);
  }

  /**
   * Retry exit whoosh per GAMEOVER.md §6:
   * Bandpass noise sweep 2500Hz to 200Hz 300ms vol .16 plus sine 120Hz to 50Hz 200ms vol .25
   */
  public playRetryExit(): void {
    if (!this.soundEnabled) return;
    const ac = this.getAudioContext();
    if (!ac || ac.state !== 'running') return;
    const t = ac.currentTime + 0.01;

    this.playNoise(t, 0.3, 2500, 200, 0.16, 'bandpass');
    this.playTone(120, t, 0.2, 'sine', 0.25, 50);
  }
}

export const soundManager = new SoundManager();
