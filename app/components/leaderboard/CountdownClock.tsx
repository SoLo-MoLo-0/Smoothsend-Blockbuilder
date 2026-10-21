'use client';

import React, { useEffect, useState } from 'react';
import { useCountdown } from '@/lib/leaderboard';

interface CountdownClockProps {
  className?: string;
}

export default function CountdownClock({ className = '' }: CountdownClockProps) {
  const { hours, minutes, seconds } = useCountdown();
  const [bump, setBump] = useState<boolean>(false);
  const [mounted, setMounted] = useState<boolean>(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    setBump(true);
    const timer = setTimeout(() => setBump(false), 300);
    return () => clearTimeout(timer);
  }, [seconds, mounted]);

  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <div
      className={`countdown-clock ${className}`.trim()}
      aria-label={`Leaderboard resets in ${hours} hours, ${minutes} minutes, and ${seconds} seconds`}
      title="Next daily seed at 00:00 UTC"
      suppressHydrationWarning
    >
      <span>Resets in</span>
      <b suppressHydrationWarning>
        {mounted ? `${pad(hours)}:${pad(minutes)}:` : '00:00:'}
        <span
          className={bump ? 'countdown-bump' : ''}
          style={{ display: 'inline-block' }}
          suppressHydrationWarning
        >
          {mounted ? pad(seconds) : '00'}
        </span>
      </b>
    </div>
  );
}
