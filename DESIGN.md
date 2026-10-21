# Block Builder – "Mono Ink" Design Spec

## 1. Principles
1. Black on white (or white on black). Structure is lines, not boxes.
2. One accent, used sparingly: the thing you control is the thing that is colored.
3. Square corners everywhere. 2px ink for structure, 1px for tiles and grid.
4. Juice is the personality: every action gets a small, fast, readable reaction.

## 2. Tokens
| Token | Light | Dark |
|---|---|---|
| `--bg` | #fafafa | #0e0e0e |
| `--ink` | #111111 | #f2f2f2 |
| `--mute` | #555555 | #a3a3a3 |
| `--line` (grid) | #e8e8e8 | #1e1e1e |
| `--acc` | #ff3b1f | #ff5a3d |

Dark mode follows `prefers-color-scheme`, with a `data-theme="light|dark"` override.

Locked tiles are the ink color with decreasing opacity per piece type: `alpha = 1 - typeIndex * 0.13` (types 0-6 = I, O, T, S, Z, J, L), each with a 1px ink border. The active piece is `--acc` at full opacity.

## 3. Type
Space Grotesk (400/500/700), fallback `system-ui, sans-serif`.
- Logo: 26px / 700 / -0.02em, two lines "BLOCK / BUILDER"
- Stat label: 12px, uppercase, letter-spacing .14em, `--mute`
- Stat value: 40px / 500, tabular numerals (24px for "Piece" and "Best")
- Floating popup: 26px / 700; big popup 44px / 700 in `--acc`
- Body/hints: 13px, line-height 1.9, `--mute`

## 4. Layout (desktop)
Three columns: `210px | board | 210px`, gap 80px, centered, columns stretch to board height.
- Left: logo at top, stats block (2px ink top border) at bottom.
- Center: board, 10x20 cells (aspect 1:2), 2px ink outline, height `max(480px, min(100vh - 40px, 760px))`. Canvas drawn at 38px per cell for crispness.
- Right: Next (3 pieces) at top with a 2px ink top border, key hints in the middle, Sound + New game buttons at the bottom.
Mobile (<=760px or coarse pointer): 2 columns (stats | next) above the board; 6-button touch pad below (left, down, right, rotate CCW, rotate CW, hard drop); key hints hidden.

## 5. Components
- **Button**: 2px ink border, `--bg` fill, min-height 44px, padding 10x18. Hover: invert (ink fill). Active: translateY(2px) scale(.96). Primary: ink fill; hover turns accent with white text. Focus-visible: 2px accent outline, 3px offset.
- **Progress bar** (piece x/100): 4px tall, `--line` track, ink fill, width transition .35s `cubic-bezier(.3,1.4,.5,1)`.
- **Overlay** (start / pause / game over / run complete): full board cover, `--bg` at .94 opacity, centered title 30px, 14px muted text, one primary button. Fade .25s.
- **Logo mark**: 2x2 squares, one accent, one outlined. Rotates +90deg on every piece lock (.35s `cubic-bezier(.3,1.7,.5,1)`).

## 6. Game feel ("juice") spec
| Event | Reaction |
|---|---|
| Move | 240Hz blip, 30ms |
| Rotate | 420Hz (CW) / 350Hz (CCW) blip, 40ms |
| Lock delay | active piece fades from 100% to 45% opacity over 450ms; moves reset it (max 12 resets) |
| Lock | accent flash over the piece cells, 200ms fade; 140Hz thud; logo rotates |
| Hard drop | accent streak down the column (260ms fade), shake 4px (7px if drop > 8 rows), 90Hz saw |
| Ghost | dashed 4/4 accent outline, 55% opacity |
| Line clear | rows blink accent/ink every 65ms for 260ms; 2 square particles per cell (4-12px, gravity 900px/s^2, 0.6-1.0s); shake = lines*3+1 px; rising arpeggio (x1.26 per step) |
| Popups | `+score`, `SINGLE/DOUBLE/TRIPLE/TETRIS` (big), `combo xN`; scale-in 1.2 then float up 52px and fade over .95s |
| Score | counts up smoothly (110ms smoothing) and bumps (scale 1.14, accent) on each change |
| Level up | board outline pulses accent (offset 8px, .7s), `LEVEL N` popup, triangle arpeggio |
| Game over | descending saw tones; overlay fades in |
| Run complete | rising triangle tones; overlay |
Shake decays `x0.9` per 16ms. Reduced motion: no shake, no particles, no CSS animation.

## 7. Rules of the game (must stay as is)
Board 10x20, 7-bag randomizer, 5-piece queue (3 shown), wall kicks [0,-1,+1,-2,+2], gravity `max(70, 820 - level*65)` ms, level = lines/10, score `[0,100,300,500,800][n] * (level+1)` + combo `50 * combo * (level+1)`, soft drop +1/cell, hard drop +2/cell, run ends at 100 pieces.

## 8. Accessibility
Contrast >= 4.5:1 for text, touch targets >= 44px, `aria-label` on icon buttons, `aria-pressed` on the sound toggle, visible focus rings.

## Intro (append to AGENTS.md)
- The intro spec is `INTRO.md`; the playable target is `design/intro-reference.html`. For any intro work, read both and use the block-builder-ui skill.
- The intro must never start the game, change game state, or receive game key presses. Do not modify game rules, scoring, seeds, wallet, contract or SmoothSend code.
- Sound is on by default and persisted. Browsers block audio before the first user input: use the start gate described in INTRO.md, never fake or work around the autoplay policy.
- Clean up every timer, listener, AudioNode and animation when the intro ends or is skipped.