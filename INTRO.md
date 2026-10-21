# Block Builder – Intro Sequence Spec ("Line Clear Open")

Playable target: `design/intro-reference.html` (a copy of the intro page; reload it or press "Replay intro"). Visual language: `DESIGN.md` (Mono Ink). If this file and the reference disagree on timing or look, the reference wins.

## Concept
An osu!-style opening: a short welcome, then a smooth hand-off into the game. The hand-off is a **line clear**: the intro screen is 20 horizontal rows that flash the accent color and collapse one by one, bottom to top, revealing the game underneath.

## Rules
- Total length about 3.6s (2.4s content + about 1.2s transition). Never longer than 4s.
- Show once per session in production (store a flag in sessionStorage inside try/catch). Keep a way to replay it (settings or dev flag).
- Dark and light versions, see Themes. Sound on by default and persisted, see Sound design.
- Skippable at any time: any key, click/tap, or the Skip button. Skipping jumps straight to the line-clear transition.
- The intro must NOT start the game, change game state, or consume game key presses (ignore game input while it is on screen). The game's own Start screen is what the player sees after the reveal.
- `prefers-reduced-motion`: show the title statically for 0.9s, then remove. No tile drops, no strips, no sound.
- Scroll is locked while the intro is up. It is removed from the DOM when finished.

## Themes (dark and light intro)
Both versions use identical animation, timing and sound. Only the palette changes, through three variables on the intro root (`data-it="dark|light"`):
| Theme | `--ib` (screen + rows) | `--it` (text + tiles) | `--ia` (accent) |
|---|---|---|---|
| Dark | #0e0e0e | #f2f2f2 | #ff5a3d |
| Light | #fafafa | #111111 | #ff3b1f |
Default is `auto`: the intro matches the app theme (dark app = dark intro), so the reveal into the game is seamless. Allow an override (auto / dark / light) stored in localStorage key `bb-intro-theme`. The 20 collapsing rows use `--ib` and flash `--ia`. No gradients, glows or shadows.

## Timeline
| Time | Event |
|---|---|
| 0.15s | Logo tile 3 (bottom-left) drops from -420px, squashes to scaleY .82, rebounds to 1.06, settles. Duration 500ms. Blip 220Hz at 430ms |
| 0.30s | Tile 4 (bottom-right, outlined 3px) drops. Blip 277Hz at 580ms |
| 0.45s | Tile 1 (top-left, accent) drops. Blip 330Hz at 730ms |
| 0.60s | Tile 2 (top-right) drops. Blip 440Hz at 880ms |
| 1.00s | Logo rotates 90deg, 700ms, `cubic-bezier(.3,1.7,.5,1)`. Low triangle thump 110Hz at 1050ms |
| 1.00s | Skip button fades up |
| 1.15s | "WELCOME TO" (13px, letter-spacing .4em, 75% opacity) fades up 10px, 600ms |
| 1.15s | Progress line (3px, width min(320px, 60vw)) fills SMOOTHLY (transform scaleX, GPU-composited, 1.25s, `cubic-bezier(.65,0,.35,1)`), never in steps. A `0 / 100` piece counter under it counts in sync by reading the animation's progress each frame. On completion the bar turns accent and the counter shows 100 |
| 1.30s | "BLOCK BUILDER" (clamp(38px,10vw,104px), 700, -0.04em) rises letter by letter from a mask, 35ms per letter, 550ms each |
| 1.95s | Accent underline draws under the title (4px, scaleX 0 to 1, 550ms) |
| 1.80s | Tagline "100 pieces. One seed. The whole world." fades up |
| 2.40s | Content fades out and lifts 10px (250ms) |
| 2.60s | 20 rows start clearing bottom to top, 30ms apart. Each row: ink, accent flash (35%), hold, collapse scaleY to 0 (450ms, `cubic-bezier(.7,0,.3,1)`). Rising 5-note arpeggio `330 * 1.26^i`, 100ms, 120ms apart |
| 2.75s | Game panels enter: left column 150ms delay, right column 300ms delay, each 600ms rise 14px + fade |
| 3.60s | Intro removed from the DOM |

## Juice added in v2
- Each logo tile landing: a 2px outline ring expands (scale 1 to 2.3, fades, 650ms) and the stage jolts down 2/2/3/4px for 150ms.
- Title underline in accent, counter that ticks with the bar.

## Sound design (WebAudio, all synthesized, no files)
Master chain: gain .9 into a compressor (threshold -20dB, ratio 4); a shared feedback delay (140ms, feedback .28, wet .3) adds space to the pitched notes only.
| Time | Sound |
|---|---|
| 0.45 / 0.60 / 0.75 / 0.90s | Tile landing: sine "thock" 150Hz falling to 55Hz (120ms, vol .22) + 40ms highpass click + a triangle pluck C4, E4, G4, C5 (262 / 330 / 392 / 523Hz, 500ms, vol .1, delay send .5) |
| 0.98s | Logo whoosh: bandpass noise sweep 400 to 3500Hz, 350ms, plus a 60Hz to 40Hz sub thump |
| 1.15 to 2.4s | Quiet riser: triangle glide 220 to 880Hz, slow swell, vol .035 |
| 1.35s onward | 12 tiny sine ticks, one per letter, rising 1100Hz + 55Hz per letter, 35ms apart, vol .03 |
| 1.95s | Title chord: C major add9 (262, 330, 392, 523, 659Hz) triangle pads, 1.1s, plus 55Hz sub hit and a noise swish |
| 2.40s | Completion ding: sine 1047Hz + 1568Hz |
| 2.60s | Line-clear: 20 triangle ticks, one per row bottom to top, 30ms apart, C pentatonic climbing four octaves from 196Hz; noise whoosh 500 to 6000Hz (900ms); 70Hz to 35Hz boom; shimmer 2093 + 1568Hz; two soft taps for the panels |
Skipping before 2.3s fades the intro sounds out in about 60ms and plays only the transition sounds.
Sound is ON by default and the preference is saved (`bb-sound`, '0' = off, wrapped in try/catch). Browsers block audio until the first user input, and no code can override that. So the intro starts like this:
1. Create the AudioContext, wait ~80ms. If it is `running` (returning visitor the browser trusts, or the user arrived by clicking), play the intro straight away with sound.
2. If it is locked and sound is on, show a minimal "start gate" on the intro background: the logo with a gently pulsing accent tile, the text `PRESS ANY KEY TO START` with a blinking accent block, and a small `Best with sound on` line. Any key or tap unlocks audio and immediately starts the intro with sound. Keep this behind a constant (`REQUIRE_SOUND_GATE`) so it can be turned off; when off, the intro plays silently and a small "Sound off · tap to enable" chip (bottom-left) restarts it with sound.
3. If the user turned sound off, or reduced-motion is on, never show the gate or chip.
The key press that dismisses the gate must not reach the game (ignore game input while the intro or gate is up).
In production the gate can be skipped entirely if the app already has a user click before it (for example a wallet connect or "Launch app" button): audio is unlocked by that click.

## Implementation notes
- Build with CSS keyframes plus a small timeline controller; do not block the main thread. Clean up all timers and key listeners when finished or skipped.
- Reuse the game's sound manager. The AudioContext may be blocked before the first user input; in that case the intro simply plays silently. Never force a "click to start" gate.
- Rows are 20 equal-height flex children covering the viewport. Use `transform: scaleY`, not height, for the collapse.
- Do not modify game logic, scoring, seeds, wallet or chain code.

## Acceptance checklist
- [x] Matches the reference in look and timing (light and dark)
- [x] Skip works with key, click and button; skipping never starts the game
- [x] Reduced-motion version works
- [x] Shown once per session; replay available
- [x] No layout jump or flash of the game before the reveal
- [x] Works at 1366x768 and 390x844

