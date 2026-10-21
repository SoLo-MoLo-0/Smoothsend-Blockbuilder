'use client';

import { soundManager } from '../leaderboard/sound';

export type FeelMode = 'full' | 'low' | 'off';

export interface RingEffect {
  x0: number;
  y0: number;
  w0: number;
  h0: number;
  x1: number;
  y1: number;
  w1: number;
  h1: number;
  t: number;
  dur: number;
  col: 'ink' | 'acc';
}

const MODES: Record<FeelMode, number> = {
  full: 1.0,
  low: 0.5,
  off: 0.0,
};

const ORDER: FeelMode[] = ['full', 'low', 'off'];

class FeelEngine {
  public mode: FeelMode = 'full';
  public vt: number = 0; // Virtual game time in ms
  public lr: number = 0; // Last real timestamp in ms
  public rate: number = 1; // Current simulation clock multiplier (0, 0.35, or 1)

  private slow: number = 0; // ms remaining of slow-motion
  private stop: number = 0; // ms remaining of hit stop
  private trauma: number = 0; // 0..1 trauma level
  private bias: number = 0; // directional bias (0.85 for hard drop)
  private zoom: number = 0; // zoom spring displacement
  private zv: number = 0; // zoom spring velocity
  private tt: number = 0; // real time in seconds (for smooth noise)
  private rings: RingEffect[] = [];
  private nud: { x: number; t: number } = { x: 0, t: -1e9 };
  private deathT: number = 0;
  private deathD: number = 260;
  private dbgOn: boolean = false;
  private inputQueue: { a: string; t: number }[] = [];
  private listeners: Set<(mode: FeelMode) => void> = new Set();
  private flashEl: HTMLElement | null = null;
  private dbgEl: HTMLElement | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('bb-feel') as FeelMode | null;
        if (saved && saved in MODES) {
          this.mode = saved;
        }
      } catch {}

      // Handle F2 key toggle for debug readout
      window.addEventListener('keydown', (e) => {
        if (e.key === 'F2') {
          e.preventDefault();
          this.toggleDebug();
        }
      });
    }
  }

  public isReducedMotion(): boolean {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /**
   * Effective intensity multiplier: Full=1.0, Low=0.5, Off=0.0
   * Reduced motion forces 0.
   */
  public getIntensity(): number {
    if (this.isReducedMotion()) return 0;
    return MODES[this.mode] ?? 1.0;
  }

  public on(): boolean {
    return this.getIntensity() > 0;
  }

  public getMode(): FeelMode {
    return this.mode;
  }

  public setMode(newMode: FeelMode): void {
    if (!(newMode in MODES)) return;
    this.mode = newMode;
    try {
      localStorage.setItem('bb-feel', newMode);
    } catch {}
    this.listeners.forEach((fn) => fn(this.mode));
    // Provide a small tactile feedback on toggle
    if (this.on()) {
      this.addPx(8, 0);
      this.punch(0.03);
    }
  }

  public cycleMode(): FeelMode {
    const idx = ORDER.indexOf(this.mode);
    const next = ORDER[(idx + 1) % ORDER.length];
    this.setMode(next);
    return next;
  }

  public subscribe(fn: (mode: FeelMode) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  public setFlashElement(el: HTMLElement | null): void {
    this.flashEl = el;
  }

  public setDebugElement(el: HTMLElement | null): void {
    this.dbgEl = el;
  }

  public toggleDebug(): boolean {
    this.dbgOn = !this.dbgOn;
    if (this.dbgEl) {
      this.dbgEl.style.display = this.dbgOn ? 'block' : 'none';
    }
    return this.dbgOn;
  }

  public isDebugOpen(): boolean {
    return this.dbgOn;
  }

  /**
   * Advances the feel simulation clock by realDt (in ms).
   * Returns the scaled game dt (in ms) to advance the virtual game clock.
   */
  public step(rdt: number): number {
    const s = rdt / 1000;
    this.tt += s;

    let dt = rdt;
    if (this.stop > 0) {
      this.stop -= rdt;
      dt = 0;
    } else if (this.slow > 0) {
      this.slow -= rdt;
      dt = rdt * 0.35;
    }

    this.rate = rdt > 0 ? (dt === 0 ? 0 : (dt < rdt ? 0.35 : 1)) : (this.stop > 0 ? 0 : (this.slow > 0 ? 0.35 : 1));
    this.vt += dt;

    // Linear trauma decay: 1.7 per second using real time
    this.trauma = Math.max(0, this.trauma - 1.7 * s);

    // Zoom spring physics: zv += (-zoom*180 - zv*14)*s; zoom += zv*s
    this.zv += (-this.zoom * 180 - this.zv * 14) * s;
    this.zoom += this.zv * s;

    if (this.trauma < 0.01) {
      this.bias = 0;
    }

    // Update F2 debug readout if enabled
    if (this.dbgOn && this.dbgEl) {
      this.dbgEl.textContent = `trauma ${this.trauma.toFixed(2)}   stop ${Math.max(
        0,
        this.stop | 0
      )}ms   slow ${Math.max(0, this.slow | 0)}ms   zoom ${this.zoom.toFixed(
        3
      )}   feel ${this.mode}`;
    }

    return dt;
  }

  /**
   * Applies the computed transform to the game board wrapper and/or game over poster container.
   */
  public apply(wrapEl: HTMLElement | null, goEl?: HTMLElement | null): void {
    const kk = this.getIntensity();
    const s = this.trauma * this.trauma;
    const A = 18 * kk;
    const dz =
      this.deathT > 0
        ? Math.pow(Math.min(1, (performance.now() - this.deathT) / this.deathD), 2) * 0.03 * kk
        : 0;

    if (s * A < 0.05 && Math.abs(this.zoom) < 0.0004 && !dz) {
      if (wrapEl && wrapEl.style.transform) wrapEl.style.transform = '';
      if (goEl && goEl.style.transform) goEl.style.transform = '';
      return;
    }

    const n = (a: number) => Math.sin(this.tt * a) + Math.sin(this.tt * a * 1.73 + 1.3);
    const offsetX = (n(41) * 0.5 * s * A * (1 - this.bias)).toFixed(2);
    const offsetY = (n(53) * 0.5 * s * A).toFixed(2);
    const rotation = (n(37) * 0.5 * s * kk * 1.1).toFixed(3);
    const scale = (1 + this.zoom + dz).toFixed(4);

    const tf = `translate(${offsetX}px, ${offsetY}px) rotate(${rotation}deg) scale(${scale})`;

    if (wrapEl) wrapEl.style.transform = tf;
    if (goEl && goEl.style.display !== 'none') goEl.style.transform = tf;
  }

  public addPx(px: number, b?: number): void {
    if (!this.on()) return;
    this.trauma = Math.min(1, Math.max(this.trauma, Math.sqrt(px / 18)));
    if (b !== undefined) {
      this.bias = b;
    }
  }

  public punch(z: number): void {
    if (!this.on()) return;
    this.zoom = z * this.getIntensity();
    this.zv = 0;
  }

  public hitStop(ms: number): number {
    const a = ms * this.getIntensity();
    if (a > 0) {
      this.stop = Math.max(this.stop, a);
      this.rate = 0;
    }
    return a;
  }

  public slowMs(ms: number): void {
    const a = ms * this.getIntensity();
    if (a > 0) {
      this.slow = Math.max(this.slow, a);
      if (this.stop <= 0) {
        this.rate = 0.35;
      }
    }
  }

  public flash(color: string, opacity: number, durationMs: number): void {
    if (!this.on() || !this.flashEl) return;
    this.flashEl.style.background = color;
    this.flashEl.animate([{ opacity }, { opacity: 0 }], {
      duration: durationMs,
      easing: 'ease-out',
    });
  }

  public death(ms: number): void {
    if (ms > 0) {
      this.deathT = performance.now();
      this.deathD = ms;
    } else {
      this.deathT = 0;
    }
  }

  public isDeathActive(): boolean {
    return this.deathT > 0;
  }

  public hard(dropRows: number): void {
    if (!this.on()) return;
    if (dropRows >= 1) {
      this.addPx(1.5 + Math.min(1, dropRows / 16) * 4.5, 0.85);
    }
  }

  public clear(linesCount: number, combo: number): void {
    const kk = this.getIntensity();
    if (kk > 0) {
      const cm = 1 + Math.min(0.6, 0.12 * Math.max(0, combo));
      const baseShake = [0, 3, 5, 7, 11][linesCount] ?? 11;
      this.addPx(baseShake * cm, 0);

      const baseHitStop = [0, 45, 65, 90, 130][linesCount] ?? 130;
      const comboHitStop = Math.min(40, 8 * Math.max(0, combo));
      this.hitStop((baseHitStop + comboHitStop) * kk);

      const baseZoom = [0, 0.01, 0.015, 0.02, 0.04][linesCount] ?? 0.04;
      this.punch(baseZoom);

      // Flash on board: accent for 1-3 lines, ink .85 (inverted flash) for Tetris
      if (linesCount === 4) {
        this.flash('var(--ink)', 0.85, 150);
        this.slowMs(350 * kk);
      } else {
        this.flash('var(--acc)', 0.2 + 0.06 * linesCount, 100);
      }
    }

    // Bass thump audio per FEEL.md §5 (Sound effects stay even when feel is Off per §8)
    const freq = 70 - linesCount * 5;
    const dur = 0.14 + linesCount * 0.05;
    const vol = 0.1 + linesCount * 0.03;
    soundManager.beep(freq, dur, 'sine', vol);
  }

  public level(): void {
    if (!this.on()) return;
    this.addPx(5, 0);
    this.ring(
      (10 * 38) / 2 - 10,
      (20 * 38) / 2 - 10,
      20,
      20,
      0,
      0,
      10 * 38,
      20 * 38,
      650,
      'acc'
    );
  }

  public ring(
    x0: number,
    y0: number,
    w0: number,
    h0: number,
    x1: number,
    y1: number,
    w1: number,
    h1: number,
    dur: number,
    col: 'ink' | 'acc'
  ): void {
    if (!this.on()) return;
    this.rings.push({
      x0,
      y0,
      w0,
      h0,
      x1,
      y1,
      w1,
      h1,
      t: this.vt,
      dur,
      col,
    });
  }

  public lockFx(x: number, y: number, w: number, h: number): void {
    if (!this.on()) return;
    this.ring(x, y, w, h, x - 7, y - 7, w + 14, h + 14, 170, 'ink');
  }

  public bump(dx: number): void {
    if (this.on()) {
      this.nud = { x: dx * 4, t: this.vt };
    }
    soundManager.beep(180, 0.02, 'square', 0.025);
  }

  public nx(ts: number): number {
    const a = ts - this.nud.t;
    return a < 90 ? this.nud.x * Math.pow(1 - a / 90, 2) : 0;
  }

  public drawRings(
    ctx: CanvasRenderingContext2D,
    ink: string,
    acc: string,
    ts: number
  ): void {
    this.rings = this.rings.filter((r) => ts - r.t < r.dur);
    for (const r of this.rings) {
      const a = (ts - r.t) / r.dur;
      const e = 1 - Math.pow(1 - a, 3);
      ctx.globalAlpha = (1 - a) * 0.8;
      ctx.strokeStyle = r.col === 'acc' ? acc : ink;
      ctx.lineWidth = 2;
      ctx.strokeRect(
        r.x0 + (r.x1 - r.x0) * e,
        r.y0 + (r.y1 - r.y0) * e,
        r.w0 + (r.w1 - r.w0) * e,
        r.h0 + (r.h1 - r.h0) * e
      );
    }
    ctx.globalAlpha = 1;
  }

  public buf(action: string): void {
    if (!this.on() || !['L', 'R', 'CW', 'CCW'].includes(action) || this.inputQueue.length >= 4) {
      return;
    }
    this.inputQueue.push({ a: action, t: performance.now() });
  }

  public flush(applyFn: (action: string) => void): void {
    const now = performance.now();
    const queued = this.inputQueue.splice(0);
    for (const item of queued) {
      if (now - item.t < 500) {
        applyFn(item.a);
      }
    }
  }

  public clearQ(): void {
    this.inputQueue = [];
  }

  public reset(): void {
    this.clearQ();
    this.death(0);
    this.rings = [];
    this.trauma = 0;
    this.bias = 0;
    this.zoom = 0;
    this.zv = 0;
    this.stop = 0;
    this.slow = 0;
    this.rate = 1;
  }
}

export const feel = new FeelEngine();
if (typeof window !== 'undefined') {
  (window as any).__feel = feel;
}
