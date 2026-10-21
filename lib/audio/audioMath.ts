/**
 * Audio math and curve calculations for Block Builder WebAudio engine.
 */

/**
 * Converts decibels (dB) to linear amplitude gain.
 * 0 dB -> 1.0, -6 dB -> ~0.501, -inf -> 0.
 */
export function dbToLinear(db: number): number {
  if (db <= -100) return 0;
  return Math.pow(10, db / 20);
}

/**
 * Converts linear amplitude gain to decibels (dB).
 * 1.0 -> 0 dB, 0.5 -> ~-6.02 dB, 0 -> -Infinity.
 */
export function linearToDb(linear: number): number {
  if (linear <= 0.00001) return -100;
  return 20 * Math.log10(linear);
}

/**
 * Computes natural perception volume curve: gain = vol^2 per MUSIC.md Section 3.
 * Input clamped to [0, 1].
 */
export function volumeToGain(volume: number): number {
  const clamped = Math.max(0, Math.min(1, volume));
  return clamped * clamped;
}

/**
 * Computes equal-power crossfade gains for a normalized progress [0, 1].
 * Preserves perceived total loudness throughout the transition:
 * fadeOutGain^2 + fadeInGain^2 = 1.0
 */
export function calculateEqualPowerGains(progress: number): {
  fadeOutGain: number;
  fadeInGain: number;
} {
  const p = Math.max(0, Math.min(1, progress));
  const angle = p * 0.5 * Math.PI;
  return {
    fadeOutGain: Math.cos(angle),
    fadeInGain: Math.sin(angle),
  };
}

/**
 * Generates an array of float values for equal-power fade-in curve.
 */
export function generateEqualPowerFadeInCurve(steps: number = 32): Float32Array {
  const curve = new Float32Array(steps);
  for (let i = 0; i < steps; i++) {
    const p = i / (steps - 1);
    curve[i] = Math.sin(p * 0.5 * Math.PI);
  }
  return curve;
}

/**
 * Generates an array of float values for equal-power fade-out curve.
 */
export function generateEqualPowerFadeOutCurve(steps: number = 32): Float32Array {
  const curve = new Float32Array(steps);
  for (let i = 0; i < steps; i++) {
    const p = i / (steps - 1);
    curve[i] = Math.cos(p * 0.5 * Math.PI);
  }
  return curve;
}
