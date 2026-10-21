# Block Builder – Leaderboard ("The Tower") Spec

Visual language: see `DESIGN.md` (Mono Ink). Playable target: `design/leaderboard-tower-reference.html` (open it in a browser, hover, click rows, press "Simulate my submission"). If this file and the reference disagree on a visual detail, the reference wins. If they disagree on behavior or data, this file wins.

## 1. What it is
Every day the whole world plays the SAME 100-piece sequence (one seed per day). The leaderboard ranks everyone's score for that day. Three views: Today, All time, Streaks. It lives as a third top tab next to Practice and Daily 100.

## 2. Ranking rules (product decisions, change here first)
- Rank by score, descending. Tie-break: earlier submission time wins. Ranks are therefore always unique.
- One official run per wallet per day. Practice mode never reaches the leaderboard.
- Day boundary: 00:00 UTC. The countdown shows time until the next day's seed. [ASSUMPTION: confirm with the product owner.]
- All time = each wallet's best single-day score. Streaks = consecutive days with a submitted run.
- Wallets display as `0x` + 4 chars + `…` + 4 chars (example `0x9f3a…c21e`). Never show full addresses in the list.
- A score counts only after it is verified (see section 8). Unverified runs do not appear.

## 3. Screen anatomy (desktop, content max-width 760px)
1. Top bar: logo, tabs [Practice | Daily 100 | Leaderboard], right side "Resets in HH:MM:SS" (seconds bump each tick).
2. Heading row: small label (e.g. `Daily 100 · No. 104`), big title (`The tower`), right-aligned player count.
3. Sub-tabs: Today / All time / Streaks with a sliding 2px ink underline indicator.
4. Controls row (demo only in the reference: Simulate button, Sound toggle). In production keep only the Sound toggle if the game has none elsewhere.
5. Podium ("the tower"): ranks 2, 1, 3 left to right, bottom aligned, height 320px. Each column = rank number (32px/700), wallet (12px, muted), score (15px), expandable details, then stacked tiles. Tile counts: rank 1 = 5, rank 2 = 4, rank 3 = 3. Tile = 28px tall, 2px gap, full column width (max 130px). Fill: rank 1 `--acc`, rank 2 `--ink`, rank 3 `--t3` (#777 light / #8a8a8a dark).
6. List header (RANK, PLAYER, SCORE/BEST SCORE/STREAK, PROOF) with 2px ink bottom border.
7. List rows for ranks 4 and up (default 7 rows, "Show more" loads up to rank 50). Row grid `52px 1fr auto 40px`, min-height 46px, hairline bottom border.
8. Pinned "You" row at the bottom when the player's rank is not visible in the list: a `···` gap, then the row with a 5px `--acc` inset left edge, bold. If the player IS in the visible list, highlight that row with the same edge and hide the pinned row.
9. Footnote: "Everyone gets the same pieces today. Ties go to the earlier submission."

Mobile (<=520px): same order, podium height 300px, gap 8px, smaller title; list rows keep 44px minimum touch height.

## 4. Data model (TypeScript; adapt names to the repo)
```ts
type LeaderboardTab = 'today' | 'all' | 'streak';

interface LeaderboardEntry {
  rank: number;
  wallet: string;          // full address; format only in UI
  value: number;           // score for today/all, days for streak
  lines?: number;
  pieces?: number;         // 100 for complete runs
  durationMs?: number;
  dayNumber?: number;      // for all-time: day the best score was set
  submittedAt: string;     // ISO
  proofUrl?: string;       // explorer link to the on-chain proof
  verified: boolean;
}

interface LeaderboardPage {
  tab: LeaderboardTab;
  dayNumber: number;
  totalPlayers: number;
  entries: LeaderboardEntry[];    // sorted, starting at rank 1
  me?: LeaderboardEntry;          // undefined if wallet has not played / not connected
  resetsAt: string;               // ISO, next 00:00 UTC
}

interface SubmitResult {
  accepted: boolean;
  entry?: LeaderboardEntry;
  previousRank?: number;          // rank before submit (or totalPlayers+1 if none)
  reason?: 'already_submitted' | 'verification_failed' | 'day_ended' | 'network';
}

interface LeaderboardService {
  getPage(tab: LeaderboardTab, opts?: { limit?: number; offset?: number }): Promise<LeaderboardPage>;
  getAround(wallet: string, tab: LeaderboardTab, n: number): Promise<LeaderboardEntry[]>; // n above + n below
  submitRun(run: RunRecord): Promise<SubmitResult>;
}
```
`RunRecord` = `{ wallet, dayNumber, seed, score, lines, inputs: Array<{ piece: number; action: string; t: number }> }` (see section 8).

## 5. Architecture rules
- Put all data access behind `LeaderboardService`. UI components never call fetch, contracts or SmoothSend directly.
- Ship TWO implementations: `mockLeaderboardService` (uses the sample data in the reference; default until backend is approved) and a real one added later. Select via config/env flag.
- UI state lives in a hook (`useLeaderboard(tab)`) returning `{ page, status: 'loading'|'ready'|'empty'|'error', refetch }`. Poll every 30s while the page is visible; pause when the tab is hidden. Apply updates with the FLIP row animation, not a full re-render flash.
- Reuse the game's existing sound manager, particle/shake utilities and theme tokens. Create shared utilities only if none exist. Do not duplicate the Mono Ink tokens.
- The client never computes the authoritative rank or score. It displays what the service returns.
- Do not hard-code the explorer URL, chain id or contract addresses. Read them from existing config.

## 6. Motion and juice spec (values from the reference)
| Element | Behavior |
|---|---|
| Podium build | Columns build in order 3rd, 2nd, 1st (delays 0 / 250 / 500ms). Tiles inside a column land bottom to top, 90ms apart. Tile animation 750ms: drops from -340px, lands, squashes to scaleY .86, rebounds to 1.05, settles (transform-origin bottom). |
| Landing sound | One short square blip per tile, pitch `170 + k*45 + (2-columnIndex)*20` Hz, 70ms, fired ~430ms after the tile's delay. |
| Podium scores | Count up from 0, 900ms, ease-out cubic, starting after the column's last tile starts. |
| Podium hover/focus | Tiles hop `translateY(-9px)` in a wave, 450ms, 45ms stagger per tile. Details panel expands (grid-template-rows 0fr to 1fr, 280ms). Only after the build finished (add a `built` class ~1.7s). |
| Row entrance | Slide in from -18px with fade, 420ms, 55ms stagger per row (first load delayed ~10 steps so the podium finishes first). |
| Row hover/focus | Ink fill sweeps in from the left (scaleX 0 to 1, 220ms), text flips to `--bg`. Press: scale .995. |
| Row open | Accordion 300ms, one open at a time, `aria-expanded` kept in sync. |
| Sub-tab underline | Slides and resizes, 300ms `cubic-bezier(.3,1.5,.5,1)`; tab change rebuilds podium and list. |
| Countdown | Seconds digit bumps (translateY -3px, accent) each tick, 300ms. |
| "You" row | Accent edge pulses 5px to 12px, 1.1s, twice, starting 1.8s after load. |
| Rank change after submit | See section 7. |
| Reduced motion | No animation, no particles, no shake; values appear instantly; sounds still follow the sound toggle. |
| Sound | On by default; the toggle persists in localStorage (guard with try/catch). AudioContext created only after the first user input. |

## 7. Submit and rank-climb moment
Triggered by a successful `submitRun` (never before the service confirms).
1. Pinned row score counts from the previous score to the new score and the rank counts down from `previousRank` to the new rank over 1300ms, ease-out cubic. Fire a 180 + (previousRank - rank)*4 Hz blip every 3rd rank change.
2. When it lands: insert the player's row at the correct rank using FLIP (520ms, `cubic-bezier(.3,1.5,.5,1)`, new row enters from +50px with scaleY .6). Rows below slide down.
3. Burst 50 square particles (4-12px, ink 65% / accent 35%, gravity 1100px/s^2, 0.7-1.2s) from the row center, shake the page container 8px (decay x0.88 per 16ms), popup `+N places` (24px/700), and if rank <= 10 a big `TOP 10` popup (40px/700, accent). If rank <= 3 rebuild the podium with the drop animation instead.
4. Rising 4-note arpeggio `330 * 1.26^i`, 120ms each, 70ms apart.
5. Hide the pinned row once the player's row is in the visible list.
If the new rank is worse than or equal to the previous rank (should not happen on the first official run) skip the climb and just show the result.

## 8. Post-run summary (shown after Daily 100 run complete)
Centered card inside the game area, 2px ink border, `--card` fill, 460px wide:
- Label `Run complete · 100 / 100`
- Score at 56px/500 and rank `#142` (22px/700) with `of 3,208` muted
- Percentile bar: 6px track, ink fill to (1 - rank/total), 4px wide accent marker at the end; caption `Top 4.4% today · 24 lines · level 3`
- Neighbor rows (one above, you, one below) with point gaps (`+70`, `−50`)
- Buttons: primary `Submit score (gasless)`, then `Share`, `Practice`
- Status line: `Replay verified · Avalanche Fuji · no gas fee` (only show the verified text when it is true)
The climb animation (section 7) plays when Submit succeeds, then the card swaps to a "Submitted" state with a button to open the leaderboard.

## 9. Verification (anti-cheat) requirement
Scores are only trustworthy if the server can replay them. The agent must NOT invent a backend. Required:
1. Audit whether the game engine is deterministic given `seed` + inputs (RNG seeded per day, no `Math.random` or wall-clock dependence in game rules). Report findings before changing anything.
2. If deterministic, add a passive run recorder that logs `{piece, action, t}` without altering gameplay, and attach it to `RunRecord`.
3. The real `LeaderboardService.submitRun` sends the record to the existing backend/contract path. Server re-simulates and rejects mismatches (`verification_failed`).
Until a backend exists, the mock service accepts runs locally and the UI must show a small "Demo data" label so nobody mistakes it for live rankings.

## 10. States to build (all in Mono Ink style)
| State | Behavior |
|---|---|
| Loading | Podium placeholders: three dashed-outline columns (2px dashed `--line`), list rows as hairline blocks with a slow opacity pulse (no gradient shimmer). |
| Empty (day just started) | Podium shows dashed empty columns; text `No scores yet. Be the first.`; button to Play Daily 100. |
| Fewer than 3 players | Missing columns are dashed placeholders. |
| Error | Message `Couldn't load rankings.` and a `Retry` button. Keep any stale data visible. |
| Not played today | Pinned row reads `You haven't played today` with a `Play Daily 100` button. |
| No wallet connected | Pinned row reads `Connect to see your rank`. Rankings still visible. |
| Offline | Same as error, plus `You're offline`. |
| Already submitted | Submit button disabled with text `Submitted · rank #N`. |

## 11. Accessibility
- Podium columns are `button`s with an `aria-label` like `Rank 1, 0x9f3a…c21e, 48,210`. Rows are buttons with `aria-expanded`.
- Sub-tabs use `role="tablist"`/`tab` with `aria-selected`. Arrow keys move between tabs.
- Popups and the rank counter announce via an `aria-live="polite"` region (final result only, not every tick).
- Contrast >= 4.5:1 for text, touch targets >= 44px, visible focus ring (2px `--acc`, 3px offset).

## 12. Acceptance checklist
- [ ] Matches `design/leaderboard-tower-reference.html` in layout, spacing and colors (light and dark)
- [ ] All three tabs work with the mock service; switching rebuilds the tower
- [ ] Every motion in section 6 is present and uses the values listed
- [ ] Submit shows the climb moment (section 7) only after the service confirms
- [ ] All states in section 10 exist
- [ ] Reduced-motion, keyboard and screen-reader behavior per section 11
- [ ] No game-rule, wallet, contract or SmoothSend code changed unless explicitly approved in a prompt
