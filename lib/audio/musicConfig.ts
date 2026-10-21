/**
 * Block Builder – Background Music Configuration
 * Specifications defined in MUSIC.md
 */

export type MusicRole = 'menu' | 'game';

export interface MusicTrack {
  /** Unique track identifier */
  id: string;
  /** Role in the game lifecycle: 'menu' (title/gate/overlays) or 'game' (in-game playlist) */
  role: MusicRole;
  /** Static asset path served by Next.js from /public */
  file: string;
  /** Human-readable title */
  title: string;
  /** Loudness trim offset in decibels (starting at 0 per spec) */
  gainDb: number;
  /** Optional BPM for beat synchronization */
  bpm?: number;
  /** Optional loop start point in seconds (skips leading silence/padding) */
  loopStart?: number;
  /** Optional loop end point in seconds (skips trailing silence/padding) */
  loopEnd?: number;
}

export const MUSIC_TRACKS: readonly MusicTrack[] = [
  // --- Menu / Title Tracks ---
  {
    id: 'vaporware',
    role: 'menu',
    file: '/audio/music/menu/vaporware.mp3',
    title: 'Vaporware',
    gainDb: 0,
    loopStart: 1.72,
    loopEnd: 163.64,
  },
  {
    id: 'exploration-theme',
    role: 'menu',
    file: '/audio/music/menu/exploration-theme.ogg',
    title: 'Exploration Theme',
    gainDb: 0,
    loopStart: 0,
    loopEnd: 134.4,
  },
  {
    id: 'crickets',
    role: 'menu',
    file: '/audio/music/menu/crickets.wav',
    title: 'Crickets (Ambient)',
    gainDb: 0,
    loopStart: 0,
    loopEnd: 209.36,
  },

  // --- In-Game Playlist Tracks ---
  {
    id: 'edge-mikura',
    role: 'game',
    file: '/audio/music/game/edge-mikura.mp3',
    title: 'Edge (Mikura)',
    gainDb: 0,
  },
  {
    id: 'timelapse-hyperpop',
    role: 'game',
    file: '/audio/music/game/timelapse-hyperpop.mp3',
    title: 'Timelapse Hyperpop Type Beat',
    gainDb: 0,
  },
  {
    id: 'enter-the-void',
    role: 'game',
    file: '/audio/music/game/enter-the-void.mp3',
    title: 'Enter The Void (Liquid Jungle DnB)',
    gainDb: 0,
  },
  {
    id: 'liquid-lights',
    role: 'game',
    file: '/audio/music/game/liquid-lights.mp3',
    title: 'Liquid Lights (Liquid Jungle DnB)',
    gainDb: 0,
  },
  {
    id: 'between-the-lines',
    role: 'game',
    file: '/audio/music/game/between-the-lines.mp3',
    title: 'Between The Lines',
    gainDb: 0,
    loopEnd: 195.44,
  },
  {
    id: 'the-jungle-witch',
    role: 'game',
    file: '/audio/music/game/the-jungle-witch.mp3',
    title: 'The Jungle Witch (Vertigoaway)',
    gainDb: 0,
  },
] as const;

export const DEFAULT_MENU_TRACK_ID = 'vaporware';

export function getTracksByRole(role: MusicRole): MusicTrack[] {
  return MUSIC_TRACKS.filter((track) => track.role === role);
}

export function getTrackById(id: string): MusicTrack | undefined {
  return MUSIC_TRACKS.find((track) => track.id === id);
}
