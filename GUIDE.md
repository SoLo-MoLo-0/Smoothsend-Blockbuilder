# Integrating "Mono Ink" into Block Builder with Google Antigravity

## What's in the kit
```
your-project/
├── AGENTS.md                              # short always-on rules
├── DESIGN.md                              # full design spec (tokens, layout, juice)
├── design/mono-ink-reference.html         # playable target design
└── .agents/skills/block-builder-ui/SKILL.md   # step-by-step UI workflow for the agent
```
Why this split: rules are loaded on every task and have a ~12,000-character limit per file, so `AGENTS.md` stays short. The detailed spec lives in `DESIGN.md`, and the skill tells the agent when and how to use it.

## Step 1: Protect your working game
1. Commit what you have: `git add -A && git commit -m "before ui redesign"`.
2. Create a branch: `git checkout -b ui/mono-ink`.
3. Make sure `localhost:3000` runs and the game, Practice/Daily 100 tabs and wallet badges work. This is your "before" state.

## Step 2: Add the kit to the project root
Copy `AGENTS.md`, `DESIGN.md`, the `design/` folder and the `.agents/` folder into the **root of your project** (same level as `package.json`). Hidden folders like `.agents` may not show in Explorer, so use "show hidden files" or copy from the terminal.

If your project already has an `AGENTS.md` or `GEMINI.md`, do not overwrite it. Paste this kit's sections into it. A root `GEMINI.md` takes priority over `AGENTS.md` in Antigravity, so keep the two consistent.

## Step 3: Open the project in Antigravity and check it loaded
1. Open the project root as the workspace.
2. Open the agent panel's rules/customization settings and confirm `AGENTS.md` and the `block-builder-ui` skill are listed. (Menu names change between versions; if you can't find them, ask the agent: "List the rules and skills you have loaded for this workspace.")
3. Open `design/mono-ink-reference.html` in your browser and play it once so you and the agent share the same target.

Older Antigravity versions used `.agent/` (singular) instead of `.agents/`. If the skill doesn't show up, try renaming the folder.

## Step 4: Start in Planning mode, not straight to code
Open a new agent conversation, choose the planning/"review first" mode, and send:

```
Read AGENTS.md, DESIGN.md and the block-builder-ui skill. Open design/mono-ink-reference.html as the visual target.

Task: restyle the existing Block Builder UI to match the Mono Ink design. Do NOT change game logic, scoring, wallet, chain or SmoothSend code.

First produce an implementation plan only:
1. Map each part of the reference (HUD, board, next preview, overlays, buttons, mobile pad) to the files/components in this repo.
2. List the design tokens you will create and where.
3. List risks (anything that touches game logic or wallet code).
Do not edit files until I approve the plan.
```
Read the plan. Reject it if it mentions rewriting game logic, adding a UI library, or adding a second accent color.

## Step 5: Build in small phases and review each one
Approve the plan, then send one phase at a time. After each phase, look at the result in the browser before moving on.

| Phase | Prompt |
|---|---|
| 1. Tokens | "Phase 1: create the design tokens from DESIGN.md section 2 (light + dark) and Space Grotesk. No visual changes yet beyond the background and text color." |
| 2. Layout | "Phase 2: apply the three-column desktop layout and mobile layout from section 4. Use placeholders for the board if needed." |
| 3. Board | "Phase 3: restyle board drawing: grid lines, tile shades (alpha by piece type), accent active piece, dashed ghost. Keep the existing renderer logic." |
| 4. HUD + UI | "Phase 4: stats, progress bar, next preview, buttons, overlays per section 5." |
| 5. Juice | "Phase 5: add the effects table from section 6: lock flash, hard-drop trail, line-clear blink, particles, shake, popups, score count-up, level-up pulse, logo rotation." |
| 6. Sound + mobile | "Phase 6: add the synthesized sounds with a toggle, the touch pad with hold-to-repeat, and prefers-reduced-motion handling." |

Keep the Daily 100 and Practice tabs, the Fuji and Gasless badges and the New Seed button. Restyle them in the same Mono Ink language (2px ink lines, square corners, one accent). Add this to a phase prompt if the agent skips them.

## Step 6: Verify with a screenshot comparison
Send:
```
Run the app on localhost:3000. Take screenshots at desktop (1366x768), laptop height ~650px, and mobile (390x844), in light and dark mode. Compare each with design/mono-ink-reference.html and list every difference. Then fix them.
```
Then check this list yourself:
- [ ] Board is large and fits the window height
- [ ] Only the active piece, ghost, flashes and level-up use the accent color
- [ ] No gradients, glows, rounded cards or shadows
- [ ] Hard drop, line clear, TETRIS popup and level-up all react
- [ ] Reduced-motion on = no shake or particles
- [ ] Keyboard and touch controls work; sound toggle works
- [ ] Daily 100 run and wallet flows still work exactly as before
- [ ] `git diff` shows no changes to game rules or chain code

## Step 7: Tuning after you play
Keep tuning notes in `DESIGN.md` section 6 so the agent stays consistent. Example prompt: "Reduce hard-drop shake from 4px to 2px, update DESIGN.md section 6 and the code to match." Always change the spec and the code together.

## Common problems
| Problem | Fix |
|---|---|
| Agent ignores the design | Start a new conversation, say "Read DESIGN.md first", and check that `AGENTS.md` is listed as loaded. |
| Agent adds gradients/glow again | Point at the Hard bans section in `AGENTS.md` and ask for the specific components to be corrected. |
| Rules file too long | Keep each rules file under 12,000 characters; move detail into `DESIGN.md`. |
| Agent rewrites game logic | Revert with git, and repeat the "do not change game logic" line in the prompt. |
| Skill not triggering | Mention it by name ("use the block-builder-ui skill") and check the folder is `.agents/skills/block-builder-ui/SKILL.md`. |

Docs for current behavior: https://antigravity.google/docs/rules-workflows and https://antigravity.google/docs/skills
