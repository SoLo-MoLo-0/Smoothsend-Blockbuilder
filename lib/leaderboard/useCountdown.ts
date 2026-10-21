'use client';

import { useEffect, useState } from 'react';
import { getTimeUntilNextUtcMidnight } from './utils';

export interface CountdownState {
  totalSeconds: number;
  hours: number;
  minutes: number;
  seconds: number;
  formatted: string;
  resetsAt: string;
}

export function useCountdown(targetIso?: string): CountdownState {
  const [countdown, setCountdown] = useState<CountdownState>(() => {
    if (targetIso) {
      const target = new Date(targetIso);
      const diff = Math.max(0, target.getTime() - Date.now());
      const s = Math.floor(diff / 1000);
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const sec = s % 60;
      const pad = (n: number) => String(n).padStart(2, '0');
      return {
        totalSeconds: s,
        hours: h,
        minutes: m,
        seconds: sec,
        formatted: `${pad(h)}:${pad(m)}:${pad(sec)}`,
        resetsAt: targetIso,
      };
    }
    return getTimeUntilNextUtcMidnight();
  });

  useEffect(() => {
    const tick = () => {
      if (targetIso) {
        const target = new Date(targetIso);
        const diff = Math.max(0, target.getTime() - Date.now());
        const s = Math.floor(diff / 1000);
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = s % 60;
        const pad = (n: number) => String(n).padStart(2, '0');
        setCountdown({
          totalSeconds: s,
          hours: h,
          minutes: m,
          seconds: sec,
          formatted: `${pad(h)}:${pad(m)}:${pad(sec)}`,
          resetsAt: targetIso,
        });
      } else {
        setCountdown(getTimeUntilNextUtcMidnight());
      }
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [targetIso]);

  return countdown;
}
