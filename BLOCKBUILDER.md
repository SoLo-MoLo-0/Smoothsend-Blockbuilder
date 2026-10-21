# Block Builder — Implementation Spec

> Read docs/COMMON.md first. Last updated: 2026-10-09

## 1. What we're building

A falling-blocks puzzle game where everyone plays the **same 100 pieces**
each UTC day. Clear lines to score; the run ends after the 100th piece
locks or the stack tops out. Unscored practice uses random seeds.

Don't use the "Tetris" name, logo, or official artwork; they're trademarks.
The mechanics are fine.

## 2. The feel

- **Chain theme in the scoring:** each cleared line is a "block
  confirmed", with a block-height counter ticking up like a chain. Four
  lines at once "finalizes an epoch", with a big flash.
- **Shared experience:** the end screen shows your rank and a stat like
  "38% of players also got the I-piece too late." "The I-piece never came"
  becomes a joke everyone shared.
- **Ghost of the leader:** after your scored run, watch the day's top run
  replayed move by move on the same pieces. It works because runs are
  stored as input logs.
- Small screen shake on hard drop, line-clear sound, mute toggle.
- **Share card:**

```
  Block Builder #12 · daily 100
  12,340 pts · 38 blocks · 2 epochs · rank 7 · verified on Avalanche
```

## 3. Engine (shared by client and server)

`lib/engine/` is pure TypeScript: no `Date`, no `Math.random`, no DOM.
The same code runs in the browser and replays runs on the server.

- Board 10 × 20 visible, plus 2 hidden rows on top.
- 7 standard pieces. Order: seeded 7-bag (shuffle all 7, deal, repeat)
  using `mulberry32(seed)` **[ASSUMPTION]**.
- Fixed 60 ticks/s. Gravity: one row every `max(4, 40 − 4 × level)` ticks,
  `level = floor(lines / 10)`.
- Rotation: clockwise and counter-clockwise, trying horizontal kicks
  `0, −1, +1, −2, +2` **[ASSUMPTION: simpler than official rotation systems]**.
- Lock delay 30 ticks, reset by a move or rotation up to 15 times **[ASSUMPTION]**.
- Next queue shows 3 pieces. Hold: off for the first version **[ASSUMPTION]**.
- Scoring: 100 / 300 / 500 / 800 for 1–4 lines × (level + 1); soft drop
  1 per row; hard drop 2 per row.
- **Input log:** `[tick, action]` pairs; actions L, R, SOFT, HARD, CW,
  CCW. Held keys (auto-repeat) are generated on the client and logged as
  individual actions. Within a tick, actions apply in log order, before gravity.
- `replay(seed, log) → { score, lines, epochs, pieces, ticks }` is the one
  source of truth.

## 4. Verification and fairness

- The seed must be public for anyone to play, so it's committed in advance
  (`keccak256(abi.encode(day, seed, salt))`) and revealed when the day
  starts. That proves it wasn't picked after seeing results.
- The server ignores client scores. It replays the log and signs only what
  the replay produces.
- Sanity checks: wall-clock time between `/run/start` and `/run/submit`
  must be at least 90% of `ticks / 60` seconds; at most 10 actions per
  tick; one scored run per smart account per day.
- Knowing the piece order in advance helps planning. That's part of the
  game; leaderboard ties break by earlier submission.

## 5. Contract: `BlockBuilder.sol` (inherits `DailyBoard`)

```solidity
struct Run { uint32 score; uint16 lines; uint8 epochs; bytes32 logHash; uint40 submittedAt; }
mapping(uint256 => mapping(address => Run)) public runs;
mapping(address => uint32) public bestScore;

function submitRun(uint256 day, uint32 score, uint16 lines, uint8 epochs,
                   bytes32 logHash, uint256 deadline, bytes calldata sig) external;
// Run(address player,uint256 day,uint32 score,uint16 lines,uint8 epochs,bytes32 logHash,uint256 deadline)
function revealDay(uint256 day, uint256 seed, bytes32 salt) external;   // at day start
```

Emits `RunSubmitted(day, player, score, lines, logHash)`.
Optional tests: `revealDay` callable from the start of the day (not only
after it); `bestScore` updates only upward.

## 6. Backend API

- `POST /api/run/start {mode: "daily" | "practice"}` → `{ runId, seed }`
  (daily: once per SCW per day; practice: a random seed, unscored)
- `POST /api/run/submit {runId, log}` → replay →
  `{ score, lines, epochs, logHash, deadline, signature }` (daily only; idempotent)
- `GET /api/replay/:day/top` → the top run's log (after the player's own scored run)
- `GET /api/stats/:day` → rank distribution and fun stats for the end screen
- Store logs in the database; only `logHash` goes on-chain.

## 7. Frontend

- Canvas board with a ghost piece, next queue, score / blocks / piece x/100.
- Keyboard: arrows, up or X to rotate, Z to rotate back, space to hard drop.
  On-screen buttons for mobile.
- Modes: "Daily 100" (once) and "Practice" (unlimited).
- End screen: score, rank, fun stat, share card, Record button, "Watch the leader".
- Replay viewer: plays a log through the engine at 1×, 2× or 4×.
- Leaderboards: today, best scores, streaks. Proof panel (COMMON §6).

## 8. AGENTS.md (add after the COMMON §8 rules)

```
- lib/engine is pure and deterministic: no Date, Math.random, timers, or DOM.
  Client and server import the same module.
- Never trust a client-reported score; scores come only from replay().
- Any engine change must keep the golden replay test passing.
```

## 9. Interview questions (session 1)

Defaults in brackets.

1. Name "Block Builder" OK? [yes]
2. Daily run of exactly 100 pieces? How long should a run take? This sets
   the gravity curve. [100 pieces, about 3–4 minutes]
3. Hold piece? Next queue length? [no hold; 3 next]
4. Rotation: simple kicks (0, −1, +1, −2, +2), or closer to official rotation? [simple]
5. Lock delay 30 ticks with up to 15 resets? [yes]
6. Scoring: 100/300/500/800 × (level + 1), soft drop 1, hard drop 2? [yes]
7. One scored run per day, no restarts? [yes]
8. Practice mode tonight? [yes; it's the first playable thing]
9. Ghost-of-the-leader replay tonight or later? [later]
10. Timing check: reject runs submitted faster than 90% of their game time? [yes]
11. Mobile controls tonight or later? [basic buttons tonight]
12. Do you know the competition rules or required features? [unknown]

## 10. Milestones

- **S1 Interview:** `docs/DECISIONS.md` written. No code.
- **M1 Engine plus practice mode, playable locally.**
  _Minimum test:_ one golden replay (a fixed seed and input log produce an
  exact score). It protects the determinism the whole game relies on.
  _Check:_ you play a practice run in the browser.
- **M2 Contract on Fuji:** the COMMON §4 minimum tests pass; deployed.
  _Check:_ the address opens on testnet.snowtrace.io.
- **M3 Daily run and server replay:** start, submit the log, server replays and signs.
  _Check:_ finish a daily run; the server's score matches the one on screen.
- **M4 Gasless record.**
  _Check:_ in an incognito window, log in with a new email, finish a daily
  run, press Record, and see it on Snowtrace and the leaderboard.
- **Later:** ghost replay, fun stats, epoch flash and other juice, share card, mainnet.

**Tonight: S1–M4.**
