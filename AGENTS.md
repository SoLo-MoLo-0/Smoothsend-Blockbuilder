# Block Builder – Project Rules

Daily 100-piece block puzzle on Avalanche Fuji (gasless, ERC-4337, SmoothSend). 

## Non-negotiables
- Restyle and add polish ONLY. Do not change game logic, scoring, seeds, the Daily 100 flow, wallet/chain/SmoothSend code, or API calls unless a task says so.
- The visual source of truth is `DESIGN.md`. The working reference is `design/mono-ink-reference.html` (open it in the browser to see the target).
- Follow the existing framework, file structure and naming in this repo. Do not add a new framework or UI library.

## Design in one breath
"Mono Ink": black-and-white, thin 2px ink lines, square corners, ONE accent (`--acc`) used only for the active piece, ghost, flashes and level-up. Space Grotesk. Fun comes from motion, not decoration.

## Hard bans
- No gradients, glows, blur, glassmorphism, neon, drop shadows, emoji icons.
- No second accent color. No rounded cards. No purple/blue AI palette.
- No hard-coded hex values in components; use the tokens in `DESIGN.md`.

## Always
- Support light + dark via tokens, and `prefers-reduced-motion` (no shake/particles).
- Keep all effects on `requestAnimationFrame`/CSS transforms; never block input.
- After any UI change: run the app, screenshot it, compare with the reference, and list differences.
- For UI work, read the `block-builder-ui` skill first.

## Leaderboard
- The leaderboard spec is `LEADERBOARD.md`; the playable target is `design/leaderboard-tower-reference.html`. For any leaderboard work, read both and use the `block-builder-leaderboard` skill.
- Data access only through `LeaderboardService`. Use the mock service until a real backend is explicitly approved. Never invent endpoints, contract addresses or chain ids.
- The client never computes or trusts rank/score; it displays what the service returns. Show a "Demo data" label while the mock service is active.
- Do not modify game rules, scoring, seeds, wallet, contract or SmoothSend code for leaderboard work unless the prompt explicitly allows it.

## Game over screen and game feel (append to AGENTS.md; replaces older game over / feel blocks)
- Specs: `GAMEOVER.md` (game over poster, freeze-frame, shake, hit stop, sounds) and `FEEL.md` (in-game shake, hit stop, slow-mo, zoom). Playable target: `design/gameover-reference.html`. Read the specs and use the block-builder-ui skill for this work.
- Effects must never change the outcome of a run. Hit stop and slow-mo scale ONE virtual game clock; replay/recorder logic stays on game time. Keep the determinism test (same inputs, Feel Full vs Off, identical final state).
- The freeze-frame delays only the poster. Score submission, replay verification and saving best are never delayed.
- Never mutate engine/board state for the explosion; use a snapshot. Only the board and the poster move; HUD and text stay still during gameplay shakes.
- While the freeze-frame or poster is visible, swallow all game key input; Retry stays locked for 900ms; nothing may remain under Retry once unlocked.
- Respect the Feel setting (Full / Low / Off) and prefers-reduced-motion everywhere.
- Do not modify scoring, gravity, lock delay, randomizer, seeds, wallet, contract or SmoothSend code.
