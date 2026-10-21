# Block Builder – Game Over Screen ("Poster") Spec, v2 (with freeze-frame, shake, hit stop and enhanced sound)

Replaces the bland game over overlay. Playable target: `design/gameover-reference.html`. It also contains the in-game feel from `FEEL.md` (press "Preview game over", or the Line-clear lab buttons 1 to 4 and Space to feel clears). If this file and the reference disagree on look or timing, the reference wins. If they disagree on behavior, data or safety, this file wins. Visual language: `DESIGN.md` (Mono Ink).

## 1. Concept
Death should feel like something happened: the game freezes for a beat on the piece that could not spawn, then your own stack explodes in slow motion while the screen shakes and a huge poster slams into place. Every effect is scaled by the Feel setting (Full / Low / Off) from `FEEL.md`.

## 2. Trigger, data and safety
Shown when the game state becomes `over` (stack topped out) or `done` (100 pieces completed). Read-only inputs: `score`, `lines`, `level`, `piecesPlaced`, `best` (before and after the run), run duration, mode (Practice or Daily 100), verification status.
- Do NOT change game rules, scoring, seeds, replay verification or wallet code.
- The freeze-frame only delays showing the poster; the engine is already in the `over` state. Score submission, replay verification and saving `best` must happen immediately and never wait for any animation.
- Do not mutate engine/board state for the explosion. Snapshot the locked cells and the piece that failed to spawn, stop drawing the live board while the poster is up, leave engine state intact. (The demo clears its grid; the real app must not.)
- Keep the old overlay's information: show `Replay verified` in the meta area only when verification truly passed.
- Hit stop scales the same virtual game clock as `FEEL.md` section 6; it must not change any result.

## 3. Layout (full viewport, fixed overlay, z above everything)
Padding `max(4vh,24px)` top/bottom, `5vw` sides, flex column.
| Area | Content |
|---|---|
| Top left | Label (11px, uppercase, tracking .14em, `--mute`): `Run ended · Practice` or `Run ended · Daily 100 No. 104`; done: `Run complete · 100 / 100` |
| Top right | Meta (13px, `--mute`, right aligned): `Time m:ss`, `Level N`, and `Replay verified` when true |
| Title | Two lines, `font-size: min(23vw, 31vh, 236px)`, 700, tracking -.06em, line-height .86. Line 1 `GAME` outline only (`-webkit-text-stroke: 2px var(--ink)`, transparent fill); line 2 `OVER` solid `--ink`. Done: `RUN` / `DONE` |
| Accent bar | `min(40vw,320px)` x 8px, `--acc`, margin-top 3vh |
| Stats row | Pinned to the bottom, 2px `--ink` top border, padding-top 18px: Score, Lines, Pieces (`N / 100`), Best. Label 11px uppercase `--mute`; value `clamp(24px,3.4vw,34px)` 500, tabular numerals |
| Actions | Right end of the stats row: `Share` (outline) and `Retry` (primary, `R` key chip, min-width 160px, 48px tall) |
Theme tokens only. Mobile (<=700px): meta hidden, actions wrap to a full-width row.

## 4. Timeline
### 4a. Freeze-frame (over only; skipped for done, for Feel Off and for reduced motion)
t = 0 at the moment the game state becomes `over`.
| Time | Event |
|---|---|
| 0 to 260ms | HIT STOP. Everything freezes on the final board. The piece that could not spawn is drawn over the stack in the accent color and blinks every 90ms between solid fill and a 3px outline. The board slowly pushes in: scale eases from 1 to 1.03 (ease-in, real time). All game keyboard input is swallowed |
| 0ms | Heartbeat: sine 55Hz falling to 40Hz, 280ms, vol .55; second beat at +150ms, 300ms, vol .4. Riser: bandpass noise 400Hz to 6000Hz over 260ms, vol .14 |
| 260ms | BOOM (the poster timeline below starts here, t' = 0). Only if the state is still `over` (if the player started a new game, do nothing) |
### 4b. Poster (t' = time since BOOM)
| Time | Event |
|---|---|
| 0ms | Accent flash (opacity .5 to 0, 200ms; .25 for done). Shake 16px (done: 3px), rotation up to about 1 degree, no vertical bias. Zoom punch +5% (done: none), spring return. Slow-motion at 35% speed for 450ms for the tile physics (done: none). Crash sound (section 6). The board snapshot becomes physics tiles (section 5) |
| 300ms | Poster background (`--bg`) fades in 0 to .95 over 450ms, behind the tiles |
| 350ms + i*70ms | Title letters drop in: 650ms each from `translateY(-110vh) scaleY(1.5)`, ease-in fall, land at 60%, squash to scaleY .8 (74%), rebound 1.06 (88%), settle at 1; transform-origin bottom. Line 2 letters start 120ms later |
| letter delay + 390ms | Letter landing: shake 3px (line 1) or 6px (line 2) and a thud; the LAST letter: shake 9px, zoom punch +2%, 70ms hit stop (freezes the poster animations and the tiles), plus a 70Hz sub hit |
| 900ms | Top label and meta fade up 8px over 500ms |
| 1000ms | Stats row fades up 10px over 500ms |
| 1100ms + n*120ms | Stat n counts up from 0 over 900ms, ease-out cubic. The Score count has tick sounds (see section 6) |
| 1250ms | Accent bar draws left to right over 500ms, `cubic-bezier(.7,0,.2,1)` |
| 2100ms | If score > previous best and score > 0: `NEW BEST` stamp slams in (3px `--acc` border, `--acc` text, 700, tracking .08em, rotate -8deg, scale 2.6 to 1, opacity 0 to 1, 260ms `cubic-bezier(.5,0,1,.6)`) above the Score value. At 2360ms: 90ms hit stop, shake 8px, zoom punch +3%, stamp sound |
| 0 to 900ms | Retry is disabled (opacity .55) with a 4px accent fill growing along its bottom edge over 900ms |
| 900ms | Retry unlocks: the fill wipes away (scaleX 1 to 0 from the right, 240ms) and is REMOVED from the DOM, the button pulses (scale 1 to 1.07 to 1, 260ms), a chime plays, the button takes focus (`preventScroll`) |
Shake, zoom, flash and hit stop use the shared feel engine (`FEEL.md` sections 3, 4, 6). The poster container receives the same transform as the board wrapper.

## 5. Tile explosion (canvas)
Full-viewport canvas behind the text, DPR aware (cap 2). One tile per locked cell at its real on-screen position (`x = rect.left + (col+.5)*cell`, `cell = boardCssWidth / columns`); the piece that failed to spawn is added in the accent color. Tile size = cell - 3px.
- Velocity: `vx = (x - boardCenterX) * (1.1 + rand) + (rand-.5)*180`; `vy = -(120 + rand*520)` (done: x1.5); spin `(rand-.5)*11 rad/s`.
- Physics step uses `dt * rate`, where `rate` is 0 during hit stop and .35 during slow-mo. Gravity 2000 px/s^2; floor = viewport bottom; floor hit with |vy| > 170: `vy *= -.38`, `vx *= .72`, spin *= .5, else settle (rest when |vx| < 14). Side walls: `vx *= -.5`.
- Resting tiles snap rotation to 90 degrees (lerp .2) and fade to opacity .18 (lerp .12); flying tiles .9. Color `--ink` with the cell's shade (`max(.35, 1 - typeIndex*.13)`); accent tiles `--acc`.
- Mouse repel: resting tile within 90px of the pointer wakes: `vx = dx*4`, `vy = -(180 + rand*160)`, random spin.
- On retry: remove the floor so tiles fall off screen; clear the list after 1100ms. The loop runs only while the screen or tiles exist.

## 6. Sound (WebAudio, synthesized; respects the sound toggle; silent if the AudioContext is not running)
| Moment | Sound |
|---|---|
| Freeze start | Heartbeat and riser (section 4a) |
| BOOM (over) | Lowpass noise 3500Hz to 120Hz over 900ms, vol .3; glass crack: bandpass noise 6000Hz to 1500Hz, 140ms, vol .22; sine 110Hz to 28Hz, 900ms, vol .6; sine 220Hz to 60Hz, 250ms, vol .4; rumble sine 46Hz, 800ms, vol .3 starting +50ms; four triangle notes 392, 311, 262, 196Hz at +40ms steps of 100ms, 260ms each, vol .12 |
| Done | Triangle arpeggio 392, 494, 587, 784Hz, 120ms apart, 300ms, vol .1, plus a sine 70Hz to 40Hz 400ms vol .35 |
| Letter i landing | Sine `150 + i*10`Hz to 55Hz 160ms vol .3; bandpass noise 1800 to 500Hz 60ms vol .15; square `520 + i*40`Hz 50ms vol .04. Last letter adds sine 70Hz to 30Hz 500ms vol .6 |
| Score count-up | 16 ticks while counting: square, `480 + step*38`Hz, 35ms, vol .022 |
| NEW BEST stamp | Bandpass noise snap 5000Hz to 800Hz 80ms vol .2; sine 80Hz to 32Hz 350ms vol .6; then triangle notes `523 * 1.26^i` (i = 0..2), 140ms, 70ms apart, vol .07 |
| Retry ready | Triangle 988Hz, 250ms, vol .07 |
| Letter click | Square 300 to 500Hz random, 80ms, vol .04 |
| Retry (exit) | Bandpass noise sweep 2500Hz to 200Hz 300ms vol .16 plus sine 120Hz to 50Hz 200ms vol .25 |
Create/resume the AudioContext on any first pointer OR key press so keyboard-only players get sound. Never show prompts about audio here.

## 7. Interactions
- Retry is locked for the first 900ms of the poster so key-mashing cannot restart the game. While the freeze-frame or the poster is up, ALL game keyboard input is swallowed (capture phase, stop propagation) except Tab and modifier combos. After unlock `R`, `Space` or `Enter` retries; clicking Retry also works.
- Share copies `Block Builder: {score} points, {lines} lines`; the button reads `Copied` for 1400ms; if blocked it says `Copy blocked`.
- Hovering a title letter lifts it 8px (150ms). Clicking a letter makes it hop (-34px, rotate -6deg, 340ms) with a blip.
- Retry exit: poster fades out over 320ms while tiles fall away; the new game starts immediately.
- Feel Off or reduced motion: no freeze-frame, no flash, shake, zoom, slow-mo, hit stop, tile explosion, drops or fills; the poster appears at once with final values and Retry unlocks after 450ms. Sounds follow the sound toggle. Feel Low halves every px, ms and zoom value.

## 8. Variants
Practice, Daily 100 (add rank and percentile from the LeaderboardService and a Leaderboard button) and Done (RUN / DONE) as in v1; Done has no freeze-frame and a lighter boom.

## 9. Accessibility
`role="dialog"`, `aria-modal="true"`, labelled by the title (`aria-label` "Game over" or "Run complete"); focus moves to Retry on unlock; Retry and Share are real buttons, 44px minimum, contrast >= 4.5:1; an `aria-live="polite"` message announces `Game over. Score 28,640. 24 lines.` once. No flashing faster than 3 times per second (the blinking blocked piece is 90ms steps for 260ms only, once).

## 10. Acceptance checklist
- [ ] Death freezes for about a quarter second with the blocked piece blinking, then BOOMs; it never feels like lag or a crash
- [ ] Engine state, replay verification and score submission are untouched and not delayed
- [ ] Shake, zoom, slow-mo and hit stops match section 4 and scale with Feel Full / Low / Off
- [ ] Tiles explode from the real board positions; resting tiles repel from the cursor
- [ ] Sounds match section 6, including the heartbeat, glass crack, count-up ticks and stamp snap; keyboard-only players hear them
- [ ] Retry is locked 900ms; mashing keys during freeze, boom or lock never restarts the game; after unlock NOTHING remains under Retry
- [ ] NEW BEST appears only when the previous best was beaten; `Replay verified` only when true
- [ ] Reduced motion and Feel Off work; no animation loop keeps running after the screen closes
- [ ] Gameplay feel from `FEEL.md` is in the game itself (clears, hard drops, wall bumps, level up)
- [ ] `git diff --stat` shows no rules, scoring, seed, replay, wallet or chain files changed
