'use client';

import { useState, useEffect, useCallback } from 'react';
import { musicManager } from './MusicManager';
import { MusicTrack } from './musicConfig';

export interface UseMusicReturn {
  musicOn: boolean;
  musicVolume: number;
  currentTrack: MusicTrack | null;
  toggleMusic: () => boolean;
  setMusicEnabled: (enabled: boolean) => void;
  setMusicVolume: (volume: number) => void;
}

/**
 * React hook to reactively bind to MusicManager state and events.
 */
export function useMusic(): UseMusicReturn {
  const [musicOn, setMusicOn] = useState<boolean>(() => musicManager.isEnabled());
  const [musicVolume, setMusicVolumeState] = useState<number>(() => musicManager.getVolume());
  const [currentTrack, setCurrentTrack] = useState<MusicTrack | null>(() =>
    musicManager.getCurrentTrack()
  );

  useEffect(() => {
    // Initial sync
    setMusicOn(musicManager.isEnabled());
    setMusicVolumeState(musicManager.getVolume());
    setCurrentTrack(musicManager.getCurrentTrack());

    const handleMusicChange = (e: Event) => {
      const ce = e as CustomEvent<boolean>;
      setMusicOn(ce.detail);
    };

    const handleVolChange = (e: Event) => {
      const ce = e as CustomEvent<number>;
      setMusicVolumeState(ce.detail);
    };

    const handleTrackChange = (e: Event) => {
      const ce = e as CustomEvent<MusicTrack>;
      setCurrentTrack(ce.detail);
    };

    window.addEventListener('bb-music-change', handleMusicChange);
    window.addEventListener('bb-music-vol-change', handleVolChange);
    window.addEventListener('bb-music-track-change', handleTrackChange);

    return () => {
      window.removeEventListener('bb-music-change', handleMusicChange);
      window.removeEventListener('bb-music-vol-change', handleVolChange);
      window.removeEventListener('bb-music-track-change', handleTrackChange);
    };
  }, []);

  const toggleMusic = useCallback(() => {
    return musicManager.toggle();
  }, []);

  const setMusicEnabled = useCallback((enabled: boolean) => {
    musicManager.setEnabled(enabled);
  }, []);

  const setMusicVolume = useCallback((volume: number) => {
    musicManager.setVolume(volume);
  }, []);

  return {
    musicOn,
    musicVolume,
    currentTrack,
    toggleMusic,
    setMusicEnabled,
    setMusicVolume,
  };
}
