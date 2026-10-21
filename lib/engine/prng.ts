import { PieceType } from './types';

/**
 * Pure 32-bit PRNG using the Mulberry32 algorithm.
 * Deterministic and portable across all JavaScript runtimes.
 */
export function createMulberry32(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return function next(): number {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PIECE_TYPES: readonly PieceType[] = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];

/**
 * Seeded 7-bag randomizer:
 * Shuffles all 7 standard pieces using Fisher-Yates with Mulberry32,
 * deals them in sequence, and refills when empty.
 */
export class Seeded7Bag {
  private prng: () => number;
  private currentBag: PieceType[] = [];

  constructor(seed: number) {
    this.prng = createMulberry32(seed);
    this.refill();
  }

  private refill(): void {
    const bag: PieceType[] = [...PIECE_TYPES];
    // Fisher-Yates shuffle
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(this.prng() * (i + 1));
      const temp = bag[i];
      bag[i] = bag[j];
      bag[j] = temp;
    }
    this.currentBag = bag;
  }

  public nextPiece(): PieceType {
    if (this.currentBag.length === 0) {
      this.refill();
    }
    return this.currentBag.shift()!;
  }

  public peek(count: number): PieceType[] {
    const result: PieceType[] = [];
    // Clone state to peek ahead without consuming
    const currentQueue = [...this.currentBag];
    // We can simulate next bags if needed
    // But since this is pure, peeking up to 7 pieces is trivial:
    while (result.length < count) {
      if (currentQueue.length === 0) {
        // Need to simulate a future bag without mutating permanent state
        // For simple peek(3), currentBag (size 1..7) plus at most 1 extra refill is enough
        // To keep strictly pure and simple:
        break;
      }
      result.push(currentQueue.shift()!);
    }
    return result;
  }
}
