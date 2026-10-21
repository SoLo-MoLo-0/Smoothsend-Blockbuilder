'use client';

import React from 'react';
import { useMusic } from '@/lib/audio/useMusic';

export interface MusicControlsProps {
  /** If compact, renders a single header toggle button (for top bar) */
  compact?: boolean;
}

/**
 * Crisp Mono Ink Music On Icon (beamed notes, square caps)
 */
export function MusicOnIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="square"
      aria-hidden="true"
    >
      <path d="M5 12V4l8-2v8" />
      <rect x="2" y="10" width="3" height="3" fill="currentColor" stroke="none" />
      <rect x="10" y="8" width="3" height="3" fill="currentColor" stroke="none" />
      <line x1="5" y1="4" x2="13" y2="2" strokeWidth="2.5" />
    </svg>
  );
}

/**
 * Crisp Mono Ink Music Muted Icon (with accent diagonal strike)
 */
export function MusicOffIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="square"
      aria-hidden="true"
    >
      <path d="M5 12V4l8-2v8" />
      <rect x="2" y="10" width="3" height="3" fill="currentColor" stroke="none" />
      <rect x="10" y="8" width="3" height="3" fill="currentColor" stroke="none" />
      <line x1="1.5" y1="1.5" x2="14.5" y2="14.5" stroke="var(--acc)" strokeWidth="2" />
    </svg>
  );
}

/**
 * Top-bar Compact Music Toggle Button
 */
export function HeaderMusicToggle() {
  const { musicOn, toggleMusic } = useMusic();

  return (
    <button
      id="global-music-toggle-btn"
      className="btn"
      style={{
        minHeight: '32px',
        minWidth: '34px',
        padding: '0 8px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={(e) => {
        e.currentTarget.blur();
        toggleMusic();
      }}
      aria-label={musicOn ? 'Mute background music (M)' : 'Unmute background music (M)'}
      aria-pressed={musicOn}
      title={musicOn ? 'Music on (click or press M to mute)' : 'Music off (click or press M to unmute)'}
    >
      {musicOn ? <MusicOnIcon /> : <MusicOffIcon />}
    </button>
  );
}

/**
 * Right Column Audio Controls (Sound toggle, Music toggle, and Volume slider)
 * In Mono Ink style: 2px ink border, square corners, 44px touch targets, accent focus rings.
 */
export function SidebarAudioControls() {
  const { musicOn, musicVolume, setMusicVolume } = useMusic();

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setMusicVolume(val);
  };

  const percent = Math.round(musicVolume * 100);

  return (
    <div className="mono-audio-panel" aria-label="Audio settings">
      {/* Labelled Slider Row with Value Readout */}
      <div className="mono-slider-wrapper">
        <div className="mono-slider-header">
          <label htmlFor="music-vol-slider" className="mono-slider-label">
            Music Vol
          </label>
          <span className="mono-slider-val" aria-hidden="true">
            {musicOn ? `${percent}%` : 'Off'}
          </span>
        </div>
        <div className="mono-slider-track-box">
          <input
            id="music-vol-slider"
            className="mono-slider"
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={musicVolume}
            onChange={handleVolumeChange}
            disabled={!musicOn}
            aria-label="Music volume slider"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-valuetext={`${percent} percent`}
            style={{
              background: `linear-gradient(to right, var(--ink) 0%, var(--ink) ${percent}%, var(--line) ${percent}%, var(--line) 100%)`,
            }}
          />
        </div>
      </div>
    </div>
  );
}
