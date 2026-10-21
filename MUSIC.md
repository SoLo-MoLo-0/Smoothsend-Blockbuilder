# Block Builder – Background Music Spec

Two sets of tracks are supplied by the product owner and currently sit in the project root:
- `block builder music for PRESS ANY KEY TO START/` = the **menu / title music**
- `block builder game music/` = the **in-game music**
The agent must inventory these files first (format, size, duration, bitrate) and must NOT edit, re-encode or delete the originals. Roles per file are confirmed by the owner (filenames may not say which is which). Make sure the owner has the rights to publish these tracks.

## 1. Goals
Add groove without hurting gameplay: music that fades in smoothly, never fights the sound effects, reacts a little to the game, loops seamlessly, and is always easy to turn down or off.

## 2. Audio architecture (WebAudio, one shared AudioContext)
```
musicSource(s) -> trackGain -> filter (lowpass) -> duckGain -> musicGain -> master
sfx / intro sounds ----------------------------------------------------> master
```
- Reuse the app's existing AudioContext and sound manager. Music and SFX have separate gain nodes and separate settings.
- Seamless looping: decode to AudioBuffer and loop with sample-accurate start. If an MP3 shows a gap at the loop point (encoder padding), tell the owner and recommend OGG/Opus or WAV for the loop; do not silently accept a click or gap.
- Several game tracks = a playlist: shuffle, never repeat the same track twice in a row, 1200ms crossfade between tracks (equal-power curve).
- Loading: preload the menu track first; lazy-load game tracks after the menu is up. Show nothing to the player while loading; if a track isn't ready, start without music and join in when ready.
- Autoplay policy: browsers allow audio only after the first user input. Music starts only when the AudioContext is `running`. Never try to bypass this.

## 3. Settings (persisted in localStorage, try/catch)
| Key | Default | Meaning |
|---|---|---|
| `bb-music` | on | Music on/off |
| `bb-music-vol` | 0.2 | Music volume 0 to 1 (musicGain = vol^2 for a natural curve) |
| `bb-sound` | on | Existing SFX toggle, unchanged and independent |
UI: a Music toggle and a small volume slider next to the Sound toggle in the right column (Mono Ink style: 2px ink border, square, 44px touch targets, `aria-pressed`, labelled slider). Keyboard: `M` toggles music (ignored while typing in inputs). Changing volume/toggle ramps over 150ms, never jumps.

## 4. State machine
| App state | Music |
|---|---|
| Start gate ("PRESS ANY KEY TO START") | Silent if audio is locked. If the context is already running, the menu track plays strictly here on this page. |
| Gate dismissed / intro starts | Crossfades immediately to main game music at 25% of normal level (ducked under the intro sound effects). |
| Intro line-clear transition (about 2.6s) | Swell main game music from 25% to 100% over 1200ms as the game is revealed. |
| Ready overlay / Practice / Daily tabs | Main game music plays at 100%. |
| Leaderboard tab | Main game music continues playing, but volume drops by 5% (to 95%). Restores to 100% on game tabs. |
| Playing | Main game music at full level with the reactions in section 5. |
| Paused | Lowpass sweeps to 600Hz and level drops 6dB over 250ms. Restores on resume. |
| Game over / Run complete | Level to 25% and lowpass to 400Hz over 900ms; resumes main game music for next run. |
| Alt+Tab / Tab hidden (`blur` / `visibilitychange`) | Smoothly duck volume down by 10% (0.10); restore smoothly on focus. |
| Reduced motion | No change (this is a sound setting). |
| Music off | Everything silent; no decoding or downloading of game tracks until it is turned on. |

## 5. Reactive groove (juice)
- Duck on line clear: music level dips by 3dB for 180ms (1 line), 4.5dB (2 lines), 6dB (3 lines), 8dB for 300ms (Tetris), then recovers over 400ms.
- Danger: as the stack rises above 60% of the board height, close the lowpass from 18kHz toward 3kHz in proportion to stack height; open it again as lines clear (smooth, 300ms). Never go below 3kHz.
- Level up: music level lifts +1.5dB for 800ms, then settles.
- Optional (only if the owner provides BPM per track): quantize line-clear and lock sound effects to the next 1/8 beat, max 60ms late. Skip this if BPM is unknown; do not guess it.

## 6. Mix levels (starting values, the owner will tune by ear)
Music default volume 0.2. Peak music level should sit about 8 to 10dB under sound effects. A compressor/limiter sits on master (threshold -18dB) so loud tracks never clip. Normalize track loudness in config with a per-track `gainDb` field instead of editing files.

## 7. Files and config
- Move/rename the two folders into the framework's static assets directory (agent to find it, for example `public/`), using lowercase kebab-case without spaces, for example `audio/music/menu/` and `audio/music/game/`. Show the planned mapping and get approval first.
- Create one config file (for example `musicConfig`) listing every track: `id`, `role` (`menu` or `game`), `file`, `title`, `gainDb`, `bpm?`, `loopStart?`, `loopEnd?`.
- Do not commit files over the repository's size limits; report total size and ask before adding large binaries.

## 8. Rules
- Do not change game rules, scoring, seeds, wallet, contract or SmoothSend code.
- Clean up every AudioNode, buffer reference, timer and event listener on stop and on page unload. Replaying the intro or restarting a game must never produce two overlapping music tracks.
- No clicks or pops: all level changes use ramps, all stops use fades.

## 9. Acceptance checklist
- [x] Menu music starts at the gate key press (or immediately if audio was already allowed)
- [x] Swell during the intro transition; no clash with intro sound effects
- [x] Crossfade into game music on run start, back to menu music after game over
- [x] Seamless loops with no gap or click
- [x] Pause, game over, line-clear ducking and danger filter work and sound smooth
- [x] Music toggle, volume slider and `M` key work, persist, and are accessible
- [x] Hidden-tab pause and resume work; no double playback after replay or restart
- [x] Works on desktop and a phone (iOS Safari unlocks audio on first tap)
- [x] `git diff --stat` shows no game-rule, wallet or chain files changed
