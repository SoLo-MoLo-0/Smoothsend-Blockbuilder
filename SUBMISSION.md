# Block Builder — Avalanche Hackathon Submission Dossier

**Target Event:** [Team1 India Speedrun: Build Anything on Avalanche](https://build.avax.network/events/project-submission?event=3f8d455d-1eb5-425b-b859-4261a0ff8ad6)  
**Submission Status:** Ready to Submit  
**Live DApp:** [https://smoothsend-blockbuilder.vercel.app](https://smoothsend-blockbuilder.vercel.app)  
**Contract Address:** `0x8e3be8a5a13a8fc89d8e04cc07447514f2bf2c40` (Avalanche C-Chain)

---

## 📋 STEP 1: General Section & Team

### 1. Project Name `*`
```text
Block Builder
```
*(Or if you prefer a longer title: `Block Builder — Daily Competitive Falling Blocks`)*

---

### 2. Short Description `*` *(Elevator Pitch)*
```text
Daily 100-piece competitive falling-blocks puzzle on Avalanche with gasless ERC-4337 proof of score, EIP-712 replay verification, and fair commit-reveal seeds.
```

---

### 3. Full Description `*`
```markdown
### What is Block Builder?
Block Builder is a fast-paced, highly competitive falling-blocks puzzle game built on Avalanche C-Chain. Every calendar day (00:00 UTC), a new cryptographic seed is revealed, generating the exact same 100-piece sequence for all players globally. Players have 100 pieces (~3–4 minutes of gameplay) to clear lines, chain combos, and finalize epochs.

### Why Avalanche & Account Abstraction?
Traditional Web3 games suffer from onboarding friction: wallet setup, gas token purchases, and repetitive pop-up transaction confirmations for every move or score submit. 

Block Builder eliminates Web3 friction entirely using SmoothSend ERC-4337 Account Abstraction and Privy embedded wallets:
1. **Zero Crypto Required for Players:** Anyone can log in with an email or social account. An ERC-4337 Smart Contract Wallet (SCW) is generated instantly.
2. **100% Gasless Gameplay:** The SmoothSend paymaster and bundler sponsor the on-chain score submission transactions directly on Avalanche C-Chain. Players need 0 AVAX in their wallets to play, compete, and record their verified scores on-chain.
3. **Daily Sybil Resistance:** Each smart account is allowed exactly one verified daily run per UTC day on the smart contract (`BlockBuilder.sol`), ensuring high-stakes daily competition.

### Provably Fair & Cheat-Proof Architecture
Web3 gaming leaderboards are notoriously vulnerable to front-end inspection and manipulated score submissions. Block Builder solves this with a multi-layered cryptographic pipeline:
- **Pre-Committed Daily Seeds:** Future daily seeds are committed in advance on-chain (`keccak256(abi.encode(day, seed, salt))`) and revealed only when the UTC day begins.
- **Deterministic 60-Tick Replay Engine:** The core simulation engine (`lib/engine/`) has zero dependencies on DOM, system clocks, or floating-point randomness. All player moves are recorded as tick-action inputs.
- **Server-Side Replay & EIP-712 Attestation:** The backend replays the exact input log tick-by-tick. If the replay matches the score and passes anti-cheat sanity checks (wall-clock duration >= 90% of simulation time, <=10 actions/tick), the server signs an EIP-712 structured hash.
- **On-Chain Verification:** The `BlockBuilder.sol` contract validates the EIP-712 signature, records the player's run, updates streak metrics, and emits `RunSubmitted` events.

### "Mono Ink" Design & Web Audio Feel
Block Builder was crafted from the ground up with a bespoke "Mono Ink" aesthetic:
- 2px crisp ink borders, sharp geometric typography (Space Grotesk), and high contrast light/dark theming.
- Web Audio API procedural sound synthesizer (blips, saw-wave drops, chord arpeggios, and game feel hit-stops) with zero audio assets to load.
- Seamless responsive design optimized for desktop keyboard warriors and mobile touch screens alike.
```

---

### 4. Tracks `*`
In the **Tracks** dropdown, select:
- **Gaming** *(or **Consumer / Gaming** / **Build Anything** depending on the dropdown options)*

---

### 5. Website *(Optional)*
Click **+ new website** and add:
- **Tag:** `Live DApp`  
  **URL:** `https://smoothsend-blockbuilder.vercel.app`
- **Tag:** `Explorer` *(Optional second link)*  
  **URL:** `https://snowtrace.io/address/0x8e3be8a5a13a8fc89d8e04cc07447514f2bf2c40`

---

### 6. Socials *(Optional)*
Click **+ new social** if you wish to link your X/Twitter, Telegram, or Discord:
- **Tag:** `Twitter` (or `X`)  
  **URL:** `https://x.com/your_handle`

---

### 7. Consent Checkbox `*`
- [x] **Check the box:** *"I consent to share this project's information with Avalanche Team1 so they can reach out to offer local support."*

---
---

## 🛠️ STEP 2: Technical Section & Continuity

### 1. Technical Details / Tech Stack `*`
```text
Frontend & UI:
- Next.js 14 (App Router) + React 18 + TypeScript
- Custom "Mono Ink" design system built entirely in Vanilla CSS tokens (Space Grotesk typography, zero bloated UI libraries, strict 60fps requestAnimationFrame transforms)
- Procedural Web Audio API sound synthesizer engine for dynamic chiptune sfx and feel

Engine & Fairness:
- Deterministic 60-tick/sec falling blocks engine in pure TypeScript (mulberry32 PRNG, kick offsets, zero DOM/Date dependencies)
- Identical simulation logic shared between client frontend and server validation

Smart Contracts & Web3:
- BlockBuilder.sol & DailyBoard.sol written in Solidity 0.8.20 and tested/deployed via Foundry
- EIP-712 typed signature verification & on-chain seed commit-reveal
- Deployed on Avalanche C-Chain at 0x8e3be8a5a13a8fc89d8e04cc07447514f2bf2c40

Account Abstraction & Gasless Sponsorship:
- SmoothSend SDK (@smoothsend/sdk) ERC-4337 Paymaster & Bundler
- Privy embedded authentication (@privy-io/react-auth) for zero-friction social/email onboarding
- viem & wagmi for Avalanche RPC communication

Backend & Database:
- Next.js Edge / Serverless API routes for input log replaying, anti-cheat verification, and EIP-712 signing
- PostgreSQL (Neon serverless) / local persistence for leaderboard state and replay storage
```

---

### 2. Tech Stack Tags `*`
Select the following tags from the multi-select dropdown:
- **Solidity**
- **TypeScript**
- **Next.js**
- **React**
- **Node.js**
- **Account Abstraction**
- **viem**
- **wagmi**
- **Foundry**
- **PostgreSQL**

---

### 3. GitHub Repository `*`
```text
https://github.com/KhawajaAnush/smoothsend-blockbuilder
```
*(Ensure your repository is set to **Public** so judges can view the code and smart contracts).*

---

### 4. Demo Link `*`
```text
https://smoothsend-blockbuilder.vercel.app
```

---

### 5. Continuity / Pre-existing Idea Switch
- **Is this a pre-existing project/idea?**
  - If you built this for this hackathon: **Set to OFF (No)**.
  - If you set it to **ON (Yes)**, use this explanation:
```text
Block Builder was built and deployed specifically during the Team1 Speedrun build sprint. We designed the 60-tick deterministic TypeScript engine, implemented the Mono Ink design system, authored and deployed the BlockBuilder.sol contract to Avalanche C-Chain, and integrated SmoothSend ERC-4337 gasless sponsorship and Privy embedded authentication to provide a seamless, gas-free on-chain puzzle gaming experience.
```

---
---

## 🎨 STEP 3: Project Media & Visuals

The assets below are already created, optimized, and saved in your workspace folder:  
📁 `i:\Smoothsend Dapp\submission_assets\`

| Field | Asset File Path | Size / Info |
|---|---|---|
| **Logo** (Max 1MB, 512x512) | `submission_assets/01_logo_512x512.jpg` | 332 KB, custom 2x2 Mono Ink icon |
| **Cover Banner** (Max 2MB, 840x300) | `submission_assets/02_cover_banner.jpg` | 449 KB, high-res dark banner with Avalanche emblem |
| **Screenshot 1** | `submission_assets/03_gameplay_dark.png` | Dark mode active puzzle gameplay |
| **Screenshot 2** | `submission_assets/04_gameplay_light.png` | Light mode active puzzle gameplay |
| **Screenshot 3** | `submission_assets/05_leaderboard.png` | The Tower daily leaderboard |
| **Screenshot 4** | `submission_assets/06_post_run_verified.png` | Post-run verified on-chain score poster |
| **Screenshot 5** | `submission_assets/07_onchain_proof_panel.png` | On-chain cryptographic proof & replay panel |

### Demo Video Link *(Optional)*
If you record a short 1-2 minute Loom or YouTube screen recording showing:
1. Opening [smoothsend-blockbuilder.vercel.app](https://smoothsend-blockbuilder.vercel.app)
2. Playing a few moves (showing the fluid Mono Ink feel and sound)
3. Submitting the score gaslessly with 0 AVAX
4. Pointing out the SnowTrace transaction verification

You can paste the video link into the **Demo Video Link** field.
