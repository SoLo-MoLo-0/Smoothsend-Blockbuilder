import { describe, it, expect } from 'vitest';
import { createMulberry32, Seeded7Bag, replay, LogEntry } from '../lib/engine';

describe('Block Builder — Pure Engine Golden Determinism', () => {
  it('mulberry32 generates deterministic float sequence for seed 42', () => {
    const prng1 = createMulberry32(42);
    const prng2 = createMulberry32(42);

    const seq1 = [prng1(), prng1(), prng1(), prng1(), prng1()];
    const seq2 = [prng2(), prng2(), prng2(), prng2(), prng2()];

    expect(seq1).toEqual(seq2);
    expect(seq1[0]).toBeCloseTo(0.6011, 4);
  });

  it('Seeded7Bag produces identical piece sequence for seed 20261009', () => {
    const bag1 = new Seeded7Bag(20261009);
    const bag2 = new Seeded7Bag(20261009);

    const pieces1 = Array.from({ length: 14 }, () => bag1.nextPiece());
    const pieces2 = Array.from({ length: 14 }, () => bag2.nextPiece());

    expect(pieces1).toEqual(pieces2);
  });

  it('Golden Replay: deterministic simulation from fixed seed and input log', () => {
    const seed = 987654321;
    const inputLog: LogEntry[] = [
      [0, 'HARD'],
      [5, 'L'],
      [6, 'HARD'],
      [10, 'CW'],
      [11, 'R'],
      [12, 'HARD'],
      [18, 'SOFT'],
      [19, 'SOFT'],
      [20, 'HARD'],
      [28, 'L'],
      [29, 'L'],
      [30, 'HARD'],
      [38, 'R'],
      [39, 'R'],
      [40, 'HARD'],
      [48, 'CW'],
      [49, 'CW'],
      [50, 'HARD'],
      [58, 'CCW'],
      [59, 'HARD'],
      [68, 'L'],
      [69, 'HARD'],
      [78, 'R'],
      [79, 'HARD'],
    ];

    const run1 = replay(seed, inputLog);
    const run2 = replay(seed, inputLog);

    // Strict byte-for-byte determinism
    expect(run1).toEqual(run2);

    // Exact immutable golden snapshot
    expect(run1).toEqual({
      score: 264,
      lines: 0,
      epochs: 0,
      pieces: 10,
      ticks: 140,
    });
  });
});
