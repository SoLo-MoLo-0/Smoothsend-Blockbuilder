'use client';

/**
 * Motion utilities for the Leaderboard:
 * - countTo: ease-out cubic score/rank animator
 * - flipList: FLIP list reordering animation helper (520ms cubic-bezier(.3,1.5,.5,1))
 * - prefersReducedMotion helper
 */

export function isReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function countTo(
  from: number,
  to: number,
  durationMs: number,
  delayMs: number,
  onUpdate: (value: number) => void,
  onComplete?: () => void
): () => void {
  let animId: number | null = null;
  let timeoutId: NodeJS.Timeout | null = null;

  if (isReducedMotion()) {
    timeoutId = setTimeout(() => {
      onUpdate(to);
      if (onComplete) onComplete();
    }, 10);
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }

  timeoutId = setTimeout(() => {
    const startTime = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - startTime) / durationMs);
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(from + (to - from) * easeOut);
      onUpdate(current);

      if (progress < 1) {
        animId = requestAnimationFrame(step);
      } else if (onComplete) {
        onComplete();
      }
    };
    animId = requestAnimationFrame(step);
  }, delayMs);

  return () => {
    if (timeoutId) clearTimeout(timeoutId);
    if (animId) cancelAnimationFrame(animId);
  };
}

/**
 * FLIP Animation Helper for smooth list reordering and row insertions.
 * Captures initial bounding rects, triggers DOM update, and inverts/plays delta.
 */
export function flipList(
  container: HTMLElement,
  domUpdate: () => void,
  itemKeyAttr: string = 'data-rank'
): void {
  if (isReducedMotion()) {
    domUpdate();
    return;
  }

  const children = Array.from(container.children) as HTMLElement[];
  const firstPositions = new Map<string, number>();

  children.forEach((child) => {
    const key = child.getAttribute(itemKeyAttr);
    if (key) {
      firstPositions.set(key, child.getBoundingClientRect().top);
    }
  });

  domUpdate();

  const updatedChildren = Array.from(container.children) as HTMLElement[];
  updatedChildren.forEach((child) => {
    child.style.animation = 'none';
    const key = child.getAttribute(itemKeyAttr);
    if (!key) return;

    const firstTop = firstPositions.get(key);
    if (firstTop === undefined) {
      // New item entering into the list
      child.animate(
        [
          { transform: 'translateY(50px) scaleY(0.6)', opacity: 0 },
          { transform: 'none', opacity: 1 },
        ],
        { duration: 520, easing: 'cubic-bezier(0.2, 1.5, 0.4, 1)' }
      );
    } else {
      const lastTop = child.getBoundingClientRect().top;
      const deltaY = firstTop - lastTop;
      if (Math.abs(deltaY) > 0.5) {
        child.animate(
          [{ transform: `translateY(${deltaY}px)` }, { transform: 'none' }],
          { duration: 520, easing: 'cubic-bezier(0.3, 1.5, 0.5, 1)' }
        );
      }
    }
  });
}
