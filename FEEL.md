# Block Builder – Game Feel Spec (screen shake, hit stop and friends)

Adds weight and impact to gameplay without changing how the game plays. Playable target: `design/feel-reference.html` (use the Feel button, the Line-clear lab buttons 1 to 4, and F2 for the debug readout). If this file and the reference disagree on values, the reference wins; if they disagree on rules or safety, this file wins. Visual language: `DESIGN.md` (Mono Ink): no glows, no gradients; impact comes from motion, not decoration.

## 1. Principles
1. Scale with importance: a move is silent, a hard drop thuds, a Tetris shakes the room.
2. Short and sharp: effects are 40-650ms and always recover to perfectly still.
3. Never hurt readability: the HUD, next pieces and text stay still; only the board (and its overlays) move.
4. Never change the outcome: feel effects must not change scores, timing of locks, piece order, or replay verification.
5. Always optional: Off / Low / Full setting, and prefers-reduced-motion forces Off.

## 2. Hard safety rule: determinism
Hit stop and slow-mo scale the simulation clock, they do not skip or alter rules. Requirements:
- All gameplay timers (gravity, lock delay, soft drop, clear animation) run on ONE virtual game clock. Feel effects stop or slow that clock. Real time is only used for visuals that must keep moving (shake decay, flash fades).
- The run recorder / replay verification must record in game time (or in discrete ticks), never wall time, so a run replays to the identical result with feel on, low or off.
- Add an automated test: feed the same recorded input sequence with feel Full and feel Off; final score, lines, board and piece order must be identical.
- Do NOT change input semantics except the optional buffer in section 7, and only if the recorder logs applied inputs.

## 3. Shake model ("trauma")
- State: `trauma` in [0,1]. Events add trauma with `trauma = min(1, max(trauma, sqrt(px / 18)))` where `px` is the desired peak offset in pixels.
- Output each frame: `s = trauma^2`; `A = 18 * intensity` (Full 1, Low .5, Off 0); `offsetX = noise(41) * .5 * s * A * (1 - bias)`; `offsetY = noise(53) * .5 * s * A`; `rotation = noise(37) * .5 * s * intensity * 1.1deg`; where `noise(f) = sin(t*f) + sin(t*f*1.73 + 1.3)` (smooth, no per-frame random jitter), `t` in seconds.
- `bias` = 0.85 for hard drops (mostly vertical), 0 otherwise; it resets when trauma < .01.
- Decay: linear, 1.7 per second, using REAL time (it keeps decaying during hit stop).
- Applied via CSS `transform` on the board wrapper: `translate(x,y) rotate(r) scale(1 + zoom)`. HUD, next preview and text outside the board never shake. Remove the transform completely when idle (`''`).

## 4. Zoom punch
A spring on the board wrapper scale: `zoom` starts at the event value with zero velocity and follows `zv += (-zoom*180 - zv*14) * dt; zoom += zv * dt` (slightly underdamped, one small overshoot). Real-time based. The canvas must be drawn at high resolution so a 4% scale does not look blurry.

## 5. Event table (the calibrated values)
Values are at Full intensity. Low = half of every px/ms/zoom value. Off = nothing.
| Event | Shake (px) | Hit stop | Zoom | Flash on board | Extras |
|---|---|---|---|---|---|
| Move, rotate, soft drop | none | none | none | none | none |
| Move blocked by wall/stack | none | none | none | none | piece nudges 4px toward the wall, decays over 90ms (squared falloff); tick sound 180Hz, 20ms, vol .025 |
| Piece locks | none | none | none | none | outline ring around the piece grows 7px and fades over 170ms (ink) |
| Hard drop | `1.5 + min(1, rows/16) * 4.5` (so 1.5 to 6), bias .85, only if rows >= 1 | none | none | none | if rows >= 3: `min(10, 3 + rows/2)` dust squares at the landing edge (3-7px, vx +-140, vy -40 to -240, 300-550ms) |
| Clear 1 line | 3 | 45ms | .010 | accent .26, 100ms | bass thump |
| Clear 2 lines | 5 | 65ms | .015 | accent .32, 100ms | bass thump |
| Clear 3 lines | 7 | 90ms | .020 | accent .38, 100ms | bass thump |
| Clear 4 lines (Tetris) | 11 | 130ms | .040 | ink .85, 150ms (inverted flash) | then slow-motion at 35% speed for 350ms; strongest thump |
| Combo bonus | shake x `(1 + min(.6, .12 * combo))` | + `min(40, 8 * combo)` ms | none | none | combo = consecutive clears |
| Level up | 5 | none | none | none | accent square outline grows from the board center to the full board over 650ms |
| Game over / run complete | handled by GAMEOVER.md | | | | |
Bass thump: sine, `70 - 5*lines` Hz, duration `.14 + .05*lines` s, volume `.1 + .03*lines`.

## 6. Hit stop and slow-mo
- Hit stop = the simulation clock does not advance for N ms. Frozen during hit stop: gravity and lock timers, the line-clear blink, particles, score count-up. Still running: shake decay, zoom spring, flash fade, audio.
- After a Tetris hit stop, run the simulation at 35% speed for 350ms (particles and the clear animation included).
- Use a virtual clock: `virtualNow` advances by `realDt` normally, by 0 during hit stop, by `realDt * .35` during slow-mo. Everything that stamps a time for gameplay visuals (clear start, lock flash, drop trail) uses `virtualNow`.
- Do not hit-stop on hard drops (it feels like lag in a fast game).
- Max one active hit stop: take the longer of overlapping values, never add them.

## 7. Input during line clears (optional, ship it behind the same Feel setting)
Today inputs are dropped during the clear animation. With hit stop and slow-mo that window gets longer, so keep recent inputs instead:
- While a clear is in progress, buffer left / right / rotate (not hard drop, not soft drop). Max 4 entries, each valid for 500ms.
- When the next piece spawns, apply the buffered inputs in order, then continue normally.
- With feel Off the old behavior (drop them) stays.
- Only enable this if the replay recorder logs inputs at the moment they are applied; otherwise leave it out and say so.

## 8. Settings and accessibility
- Setting `bb-feel` = `full` (default) / `low` / `off`, persisted in localStorage (try/catch). UI: one button in the right column in Mono Ink style, label `Feel: Full`, cycling Full, Low, Off; switching previews a small shake and zoom. Keyboard accessible, 44px height.
- `prefers-reduced-motion: reduce` forces Off for shake, zoom, flash, hit stop, slow-mo and input buffering; the nudge and ring are also off. Sound effects stay.
- No flashing faster than 3 times per second and no full-screen flash above 0.85 opacity.
- Debug readout: pressing F2 toggles a small fixed readout `trauma / stop / slow / zoom / feel` (dev builds only is fine).

## 9. Line-clear lab (dev only)
A dev-only way to test feel quickly: four buttons (1, 2, 3, 4) that fill the bottom N rows except the last column and spawn a vertical I piece above the gap; then Space clears N lines. Show it only with `?dev=1` or in development builds.

## 10. Do not
- Do not shake the HUD, text, buttons or the next preview. Do not shake on move, rotate or soft drop.
- Do not add camera blur, glow, chromatic aberration, or any new color.
- Do not stack effects: take the max trauma, the max hit stop. Never exceed trauma 1.
- Do not touch scoring, gravity speed, lock delay, randomizer, seeds, replay or wallet code.

## 11. Acceptance checklist
- [ ] Single clear feels light, Tetris feels heavy but is over in about half a second
- [ ] Hard drop from high up thuds with vertical shake and dust; a 1-row drop barely registers
- [ ] No shake or zoom when moving or rotating; wall bump nudge works
- [ ] HUD and text are perfectly still during shakes
- [ ] Hit stop freezes the clear animation and particles, and they resume smoothly
- [ ] Determinism test passes with feel Full vs Off (identical final state)
- [ ] Feel Off and reduced-motion produce zero shake, zoom, flash, stop and slow-mo
- [ ] Setting persists; works on 390px mobile; no blurry board at any zoom value
- [ ] F2 debug readout works; line-clear lab is dev-only
- [ ] `git diff --stat` shows no scoring, seed, replay, wallet or chain files changed
