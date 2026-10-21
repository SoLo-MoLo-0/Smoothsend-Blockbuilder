import { MusicTrack } from './musicConfig';

/**
 * Game playlist manager with Fisher-Yates shuffle that guarantees
 * the same track never repeats twice in a row across cycle boundaries.
 */
export class Playlist {
  private tracks: MusicTrack[] = [];
  private queue: MusicTrack[] = [];
  private currentTrack: MusicTrack | null = null;
  private lastPlayedTrackId: string | null = null;
  private firstTrackId: string | null = null;
  private isFirstCycle: boolean = true;

  constructor(tracks: readonly MusicTrack[] = [], firstTrackId?: string) {
    this.firstTrackId = firstTrackId || null;
    this.setTracks(tracks);
  }

  /**
   * Updates the track pool and resets the playlist queue.
   */
  public setTracks(tracks: readonly MusicTrack[]): void {
    this.tracks = [...tracks];
    this.reset();
  }

  /**
   * Resets queue and reshuffles.
   */
  public reset(): void {
    this.queue = [];
    this.currentTrack = null;
    this.lastPlayedTrackId = null;
    if (this.tracks.length > 0) {
      this.replenishQueue();
    }
  }

  /**
   * Generates a new shuffled cycle of tracks.
   * Ensures the first track of the new cycle does not match lastPlayedTrackId.
   */
  private replenishQueue(): void {
    if (this.tracks.length === 0) {
      this.queue = [];
      return;
    }

    const shuffled = [...this.tracks];

    // Fisher-Yates shuffle
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    // On the very first cycle, if firstTrackId is specified, place it first
    if (this.isFirstCycle && this.firstTrackId) {
      const idx = shuffled.findIndex((t) => t.id === this.firstTrackId);
      if (idx !== -1 && idx !== 0) {
        const [target] = shuffled.splice(idx, 1);
        shuffled.unshift(target);
      }
      this.isFirstCycle = false;
    }

    // Boundary check: avoid repeat if length > 1 and first item equals last played track
    if (shuffled.length > 1 && this.lastPlayedTrackId !== null && shuffled[0].id === this.lastPlayedTrackId) {
      // Swap with a random non-matching element from index 1 to end
      const swapIndex = 1 + Math.floor(Math.random() * (shuffled.length - 1));
      [shuffled[0], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[0]];
    }

    this.queue = shuffled;
  }

  /**
   * Advances to and returns the next track.
   */
  public getNextTrack(): MusicTrack | null {
    if (this.tracks.length === 0) return null;

    if (this.queue.length === 0) {
      this.replenishQueue();
    }

    const next = this.queue.shift() || null;
    if (next) {
      this.currentTrack = next;
      this.lastPlayedTrackId = next.id;
    }
    return next;
  }

  /**
   * Inspects the next track without removing it from the queue.
   */
  public peekNextTrack(): MusicTrack | null {
    if (this.tracks.length === 0) return null;
    if (this.queue.length === 0) {
      this.replenishQueue();
    }
    return this.queue[0] || null;
  }

  /**
   * Returns the currently active track.
   */
  public getCurrentTrack(): MusicTrack | null {
    return this.currentTrack;
  }

  /**
   * Returns the number of remaining tracks in the current cycle before next reshuffle.
   */
  public getRemainingInCycle(): number {
    return this.queue.length;
  }

  /**
   * Returns total count of tracks in the playlist pool.
   */
  public getTrackCount(): number {
    return this.tracks.length;
  }
}
