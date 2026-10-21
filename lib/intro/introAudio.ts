'use client';

import { soundManager } from '@/lib/leaderboard/sound';

export interface IntroAudioBus {
  ac: AudioContext;
  m: GainNode;
  d: DelayNode;
}

export interface ToneOptions {
  to?: number;
  gd?: number;
  a?: number;
  send?: number;
}

const PENTATONIC_SEMITONES = [0, 2, 4, 7, 9];

let cachedBus: IntroAudioBus | null = null;

/**
 * Initializes or reuses the master intro audio bus:
 * Master gain .9 into a compressor (threshold -20dB, ratio 4);
 * a shared feedback delay (140ms, feedback .28, wet .3) adds space to pitched notes.
 */
export function getAudioBus(ac: AudioContext): IntroAudioBus {
  if (cachedBus && cachedBus.ac === ac) {
    return cachedBus;
  }

  const m = ac.createGain();
  m.gain.value = 0.9;

  const c = ac.createDynamicsCompressor();
  c.threshold.value = -20;
  c.ratio.value = 4;

  m.connect(c);
  c.connect(ac.destination);

  const d = ac.createDelay(1);
  d.delayTime.value = 0.14;

  const fb = ac.createGain();
  fb.gain.value = 0.28;

  const w = ac.createGain();
  w.gain.value = 0.3;

  d.connect(fb);
  fb.connect(d);
  d.connect(w);
  w.connect(c);

  cachedBus = { ac, m, d };
  return cachedBus;
}

/**
 * Plays a synthesized oscillator tone with envelope, frequency ramps, and optional delay send
 */
export function playTone(
  ac: AudioContext,
  bus: IntroAudioBus,
  out: GainNode,
  frequency: number,
  time: number,
  duration: number,
  type: OscillatorType,
  volume: number,
  options: ToneOptions = {},
  trackedSources?: AudioScheduledSourceNode[]
): void {
  try {
    const osc = ac.createOscillator();
    const gain = ac.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, time);

    if (options.to) {
      osc.frequency.exponentialRampToValueAtTime(options.to, time + (options.gd || duration));
    }

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(volume, time + (options.a || 0.005));
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

    osc.connect(gain);
    gain.connect(out);

    if (options.send) {
      const sendGain = ac.createGain();
      sendGain.gain.value = options.send;
      gain.connect(sendGain);
      sendGain.connect(bus.d);
    }

    osc.start(time);
    osc.stop(time + duration + 0.05);

    if (trackedSources) {
      trackedSources.push(osc);
      osc.onended = () => {
        const idx = trackedSources.indexOf(osc);
        if (idx !== -1) trackedSources.splice(idx, 1);
      };
    }
  } catch {}
}

/**
 * Plays filtered random noise burst (bandpass / highpass sweeps)
 */
export function playNoise(
  ac: AudioContext,
  out: GainNode,
  time: number,
  duration: number,
  f0: number,
  f1: number,
  q: number,
  volume: number,
  type: BiquadFilterType = 'bandpass',
  trackedSources?: AudioScheduledSourceNode[]
): void {
  try {
    const bufferSize = Math.max(1, (ac.sampleRate * duration) | 0);
    const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const source = ac.createBufferSource();
    source.buffer = buffer;

    const filter = ac.createBiquadFilter();
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(f0, time);
    filter.frequency.exponentialRampToValueAtTime(f1, time + duration);

    const gain = ac.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(volume, time + duration * 0.3);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(out);

    source.start(time);

    if (trackedSources) {
      trackedSources.push(source);
      source.onended = () => {
        const idx = trackedSources.indexOf(source);
        if (idx !== -1) trackedSources.splice(idx, 1);
      };
    }
  } catch {}
}

/**
 * Schedules all intro sound events on the AudioContext clock relative to start time T
 */
export function scheduleIntroSfx(
  ac: AudioContext,
  bus: IntroAudioBus,
  out: GainNode,
  T: number,
  trackedSources?: AudioScheduledSourceNode[]
): void {
  // 0.45 / 0.60 / 0.75 / 0.90s: Tile landings (thock + click + plucks)
  const tileDelays = [0.45, 0.6, 0.75, 0.9];
  const plucks = [262, 330, 392, 523]; // C4, E4, G4, C5
  tileDelays.forEach((l, i) => {
    const t = T + l;
    playTone(ac, bus, out, 150, t, 0.12, 'sine', 0.22, { to: 55, gd: 0.1 }, trackedSources);
    playNoise(ac, out, t, 0.04, 5000, 3000, 1, 0.05, 'highpass', trackedSources);
    playTone(ac, bus, out, plucks[i], t, 0.5, 'triangle', 0.1, { send: 0.5 }, trackedSources);
  });

  // 0.98s: Logo whoosh
  playNoise(ac, out, T + 0.98, 0.35, 400, 3500, 1.2, 0.07, 'bandpass', trackedSources);

  // 1.00s: Sub thump (60Hz to 40Hz)
  playTone(ac, bus, out, 60, T + 1.0, 0.4, 'sine', 0.2, { to: 40 }, trackedSources);

  // 1.15s: Quiet riser (triangle glide 220 to 880Hz)
  playTone(ac, bus, out, 220, T + 1.15, 1.25, 'triangle', 0.035, { to: 880, a: 1.1 }, trackedSources);

  // 1.35s onward: 12 tiny sine ticks (1100Hz + 55Hz per letter, 35ms apart)
  for (let i = 0; i < 12; i++) {
    playTone(ac, bus, out, 1100 + i * 55, T + 1.35 + i * 0.035, 0.04, 'sine', 0.03, {}, trackedSources);
  }

  // 1.93s: Noise swish before title chord
  playNoise(ac, out, T + 1.93, 0.3, 800, 6000, 0.8, 0.05, 'bandpass', trackedSources);

  // 1.95s: Title chord: C major add9 (262, 330, 392, 523, 659Hz) triangle pads + 55Hz sub hit
  const chordNotes = [262, 330, 392, 523, 659];
  chordNotes.forEach((f, i) => {
    playTone(ac, bus, out, f, T + 1.95 + i * 0.012, 1.1, 'triangle', 0.05, { a: 0.03, send: 0.4 }, trackedSources);
  });
  playTone(ac, bus, out, 55, T + 1.95, 0.6, 'sine', 0.22, {}, trackedSources);

  // 2.40s: Completion ding: sine 1047Hz + 1568Hz
  playTone(ac, bus, out, 1047, T + 2.4, 0.5, 'sine', 0.08, { send: 0.4 }, trackedSources);
  playTone(ac, bus, out, 1568, T + 2.4, 0.4, 'sine', 0.04, {}, trackedSources);
}

/**
 * Schedules all transition line-clear sound events relative to start time T
 */
export function scheduleTransitionSfx(
  ac: AudioContext,
  bus: IntroAudioBus,
  out: GainNode,
  T: number,
  trackedSources?: AudioScheduledSourceNode[]
): void {
  const s = T + 0.2; // 200ms delay matching strips collapse start

  // 900ms noise whoosh (500 to 6000Hz)
  playNoise(ac, out, s, 0.9, 500, 6000, 0.9, 0.07, 'bandpass', trackedSources);

  // 20 ascending triangle ticks, C pentatonic climbing four octaves from 196Hz
  for (let n = 0; n < 20; n++) {
    const semitone = PENTATONIC_SEMITONES[n % 5] + 12 * Math.floor(n / 5);
    const freq = 196 * Math.pow(2, semitone / 12);
    playTone(ac, bus, out, freq, s + 0.16 + n * 0.03, 0.07, 'triangle', 0.035, {}, trackedSources);
  }

  // 70Hz to 35Hz sub boom
  playTone(ac, bus, out, 70, s + 0.25, 0.7, 'sine', 0.26, { to: 35 }, trackedSources);

  // Shimmer (2093 + 1568Hz)
  playTone(ac, bus, out, 2093, s + 0.95, 0.5, 'sine', 0.05, { send: 0.5 }, trackedSources);
  playTone(ac, bus, out, 1568, s + 0.95, 0.4, 'sine', 0.04, {}, trackedSources);

  // Two soft taps for the panels entering
  playTone(ac, bus, out, 220, s + 0.15, 0.1, 'sine', 0.1, { to: 120 }, trackedSources);
  playTone(ac, bus, out, 260, s + 0.3, 0.1, 'sine', 0.1, { to: 140 }, trackedSources);
}

export interface IntroAudioPlayback {
  onTransition: () => void;
  cleanup: () => void;
}

/**
 * Starts intro sound playback if sound is enabled and AudioContext is running.
 * Returns playback controls or null if sound is disabled or blocked.
 */
export function startIntroAudioPlayback(startTimePerfMs: number): IntroAudioPlayback | null {
  if (!soundManager.isEnabled()) {
    return null;
  }

  const ac = soundManager.getAudioContext();
  if (!ac || ac.state !== 'running') {
    return null;
  }

  const bus = getAudioBus(ac);
  const trackedSources: AudioScheduledSourceNode[] = [];

  const introGain = ac.createGain();
  introGain.gain.setValueAtTime(1, ac.currentTime);
  introGain.connect(bus.m);

  let transGain: GainNode | null = null;

  // Schedule all intro sounds with hardware clock
  const audioStartTime = ac.currentTime + 0.03;
  scheduleIntroSfx(ac, bus, introGain, audioStartTime, trackedSources);

  let transitionFired = false;

  const onTransition = () => {
    if (transitionFired) return;
    transitionFired = true;

    const elapsed = performance.now() - startTimePerfMs;
    // On early skip before 2.3s: fade intro out in ~60ms
    if (elapsed < 2300) {
      try {
        introGain.gain.setTargetAtTime(0, ac.currentTime, 0.02);
      } catch {}
    }

    // Play only transition sounds
    transGain = ac.createGain();
    transGain.gain.setValueAtTime(1, ac.currentTime);
    transGain.connect(bus.m);
    scheduleTransitionSfx(ac, bus, transGain, ac.currentTime, trackedSources);
  };

  const cleanup = () => {
    try {
      introGain.gain.setValueAtTime(0, ac.currentTime);
      introGain.disconnect();
    } catch {}

    if (transGain) {
      try {
        transGain.gain.setValueAtTime(0, ac.currentTime);
        transGain.disconnect();
      } catch {}
    }

    trackedSources.forEach((src) => {
      try {
        src.stop();
        src.disconnect();
      } catch {}
    });
    trackedSources.length = 0;
  };

  return { onTransition, cleanup };
}
