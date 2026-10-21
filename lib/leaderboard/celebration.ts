'use client';

import { isReducedMotion } from './motion';
import { soundManager } from './sound';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  s: number;
  life: number;
  maxLife: number;
  isAccent: boolean;
}

class CelebrationManager {
  private particles: Particle[] = [];
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private animId: number | null = null;
  private lastTime: number = 0;
  private shakeElement: HTMLElement | null = null;
  private currentShake: number = 0;

  private ensureCanvas(): boolean {
    if (typeof document === 'undefined') return false;
    if (!this.canvas) {
      let el = document.getElementById('fxc') as HTMLCanvasElement | null;
      if (!el) {
        el = document.createElement('canvas');
        el.id = 'fxc';
        el.style.position = 'fixed';
        el.style.inset = '0';
        el.style.pointerEvents = 'none';
        el.style.zIndex = '9999';
        document.body.appendChild(el);
      }
      this.canvas = el;
      this.ctx = el.getContext('2d');
      this.resizeCanvas();
      window.addEventListener('resize', () => this.resizeCanvas());
    }
    return Boolean(this.ctx);
  }

  private resizeCanvas(): void {
    if (!this.canvas) return;
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  private loop(currentTime: number): void {
    if (!this.lastTime) this.lastTime = currentTime;
    const dt = Math.min(50, currentTime - this.lastTime);
    this.lastTime = currentTime;

    if (this.ctx && this.canvas) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

      const computed = getComputedStyle(document.documentElement);
      const ink = computed.getPropertyValue('--ink').trim() || '#111';
      const acc = computed.getPropertyValue('--acc').trim() || '#ff3b1f';

      this.particles.forEach((p) => {
        p.life += dt;
        p.vy += (1100 * dt) / 1000; // gravity 1100px/s^2
        p.x += (p.vx * dt) / 1000;
        p.y += (p.vy * dt) / 1000;

        const alpha = Math.max(0, 1 - p.life / p.maxLife);
        this.ctx!.globalAlpha = alpha;
        this.ctx!.fillStyle = p.isAccent ? acc : ink;
        this.ctx!.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
      });

      this.ctx.globalAlpha = 1;
      this.particles = this.particles.filter((p) => p.life < p.maxLife);
    }

    // Shake decay (decay x0.88 per 16ms)
    if (this.shakeElement && this.currentShake > 0.3) {
      this.currentShake *= Math.pow(0.88, dt / 16);
      const jitterX = (Math.random() - 0.5) * this.currentShake;
      const jitterY = (Math.random() - 0.5) * this.currentShake;
      this.shakeElement.style.transform = `translate(${jitterX}px, ${jitterY}px)`;
    } else if (this.shakeElement && this.currentShake <= 0.3) {
      this.currentShake = 0;
      this.shakeElement.style.transform = '';
      this.shakeElement = null;
    }

    if (this.particles.length > 0 || this.currentShake > 0.3) {
      this.animId = requestAnimationFrame((ts) => this.loop(ts));
    } else {
      this.animId = null;
    }
  }

  public burst(x: number, y: number, count: number = 50): void {
    if (isReducedMotion()) return;
    if (!this.ensureCanvas()) return;

    for (let i = 0; i < count; i++) {
      this.particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 620,
        vy: -Math.random() * 520 - 60,
        s: 4 + Math.random() * 8, // 4-12px square particles
        life: 0,
        maxLife: 700 + Math.random() * 500, // 0.7-1.2s life
        isAccent: Math.random() < 0.35, // 35% accent, 65% ink
      });
    }

    if (!this.animId) {
      this.lastTime = 0;
      this.animId = requestAnimationFrame((ts) => this.loop(ts));
    }
  }

  public shake(element: HTMLElement, intensity: number = 8): void {
    if (isReducedMotion()) return;
    this.shakeElement = element;
    this.currentShake = intensity;

    if (!this.animId) {
      this.lastTime = 0;
      this.animId = requestAnimationFrame((ts) => this.loop(ts));
    }
  }

  public popup(text: string, x: number, y: number, isBig: boolean = false): void {
    if (typeof document === 'undefined') return;
    if (isReducedMotion()) return;
    const el = document.createElement('div');
    el.className = `pop-celebration ${isBig ? 'big' : ''}`.trim();
    el.textContent = text;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;

    el.onanimationend = () => el.remove();
    setTimeout(() => el.remove(), 1200);
    document.body.appendChild(el);
  }

  public playArpeggio(): void {
    // 4-note rising arpeggio: 330 * 1.26^i, 120ms each, 70ms apart
    [0, 1, 2, 3].forEach((i) => {
      soundManager.beep(330 * Math.pow(1.26, i), 0.12, 'square', 0.055, i * 0.07);
    });
  }
}

export const celebrationManager = new CelebrationManager();
