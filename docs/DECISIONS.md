# Block Builder — Decisions Record

> Generated: 2026-10-09 | Session 1: Interview & Architecture | Status: Approved

## 1. Core Mechanics & Feel
- **Game Concept:** "Block Builder" — falling-blocks puzzle game with Tetris mechanics, blockchain-themed scoring ("block confirmed", "epoch finalized").
- **Daily Run Scope:** Exactly 100 pieces per run (~3–4 minutes gameplay duration). The run terminates upon locking the 100th piece or stack topping out.
- **Engine Rules:**
  - Board: 10 visible columns × 20 visible rows (+2 hidden buffer rows above).
  - Randomizer: Seeded 7-bag using pure `mulberry32(seed)`.
  - Timing: Fixed 60 ticks/s simulation rate. Gravity: `max(4, 40 - 4 * level)` ticks/row, with `level = floor(lines / 10)`.
  - Rotation & Kicks: Clockwise & Counter-Clockwise with simplified horizontal kicks (`0, -1, +1, -2, +2`).
  - Lock Delay: 30 ticks (0.5s), resettable up to 15 times on move or rotate.
  - Queue & Hold: Next queue shows 3 pieces; Hold feature disabled for V1.
  - Scoring: Line clears score `[100, 300, 500, 800] * (level + 1)`; Soft drop = 1 pt/row, Hard drop = 2 pts/row.
  - Pure Determinism: `lib/engine/` contains zero DOM, timers, `Math.random`, or `Date`. Shared identically between client and server.

## 2. Verification & Fairness
- **Input Log Replay:** Actions logged as `[tick, action]` pairs. Server replays the log using the shared engine; client-claimed scores are ignored.
- **Anti-Cheat Sanity Checks:**
  - Wall-clock time between `/run/start` and `/run/submit` must be $\ge 90\%$ of `ticks / 60` seconds.
  - Maximum 10 actions per tick.
  - Exactly one scored daily run per ERC-4337 smart account per UTC day.
- **Seed Commit-Reveal:** Day seeds committed in advance on-chain (`keccak256(abi.encode(day, seed, salt))`) and revealed at UTC 00:00.

## 3. Web3 & Infrastructure
- **Network:** Avalanche Fuji Testnet (Chain ID 43113).
- **Gasless Sponsorship:** SmoothSend ERC-4337 paymaster on Avalanche Fuji.
  - Verified EntryPoint v0.7: `0x0000000071727De22E5E9d8BAf0edAc6f37da032`
  - Verified VerifyingPaymaster: `0x3207f577792F9d549acB2A6C97c0f74EAeB166d8`
  - Verified SimpleAccountFactory: `0x55326f005a0959F75496cdd692505fFB520972f5`
- **Smart Contract:** `BlockBuilder.sol` inheriting `DailyBoard.sol` (EIP-712 signer validation, streak counter, `RunSubmitted` event).
- **Identity & Auth:** Privy embedded wallet (Email / Google) + external wallets. The player's identity is their ERC-4337 smart account (SCW).
- **Backend / Database:** Next.js App Router API routes + local SQLite database (`data/runs.db`).

## 4. Scope Breakdown (Tonight: S1–M4)
- **Included Tonight:**
  - S1: Interview & Decisions (Complete).
  - M1: Pure Engine + Local Practice Mode (with golden replay determinism test).
  - M2: Foundry Smart Contract (`BlockBuilder.sol`) deployed to Fuji testnet.
  - M3: Daily Run API + Server Replay & EIP-712 Signing.
  - M4: Gasless On-Chain Record via SmoothSend (`useSmoothSendPrivyWrite`).
  - Mobile touch controls (basic on-screen directional & action buttons).
- **Cut / Deferred to Later:**
  - Ghost-of-the-Leader live replay player.
  - Advanced audio juice / epoch screen flash effects.
  - Mainnet deployment (developer-run).
