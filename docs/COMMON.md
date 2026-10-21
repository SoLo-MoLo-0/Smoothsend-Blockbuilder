# Daily Chain Games — Common Guide (Avalanche + SmoothSend)

> Every dev gets this file plus their project spec. Put both in `docs/`.
> Agents: read this before your project spec.
> If `docs/DECISIONS.md` exists, it overrides the specs wherever they differ.
>
> **[ASSUMPTION]** = a default the dev may change (confirmed in the interview).
> **[VERIFY]** = the agent checks this against the SmoothSend MCP or docs itself.
> Last updated: 2026-10-09

## 0. How we work

The agents write the code. The dev answers questions, approves short
plans, does the human-only steps, and runs the quick checks. Keep it light:
the free plan doesn't have tokens to spare for exhaustive testing.

### 0.1 Session 1: the interview (no code)

Paste this into a fresh agent conversation, with your project's file name:

```
Read docs/COMMON.md and docs/<PROJECT>.md. Don't write any code this session.
1. Give me a basic layout of what we're building in under 300 words: the
   pitch, the main screens, how a play becomes an on-chain record, and
   tonight's scope.
2. Ask for my general opinions: what I like, what I'd change, what I'd
   cut. Wait for my answer.
3. Ask targeted questions to confirm what the spec assumes: everything in
   the spec's "Interview questions" section, every [ASSUMPTION], and
   anything else that's unclear. Ask at most 5 at a time. State the
   spec's default for each so I can reply "default". Don't ask about
   things the spec already answers. Check [VERIFY] items yourself with the
   SmoothSend MCP instead of asking me.
4. Write docs/DECISIONS.md: each decision with my answer, defaults I
   changed, features we cut, and anything still open. Keep it to one page.
5. Stop.
```

### 0.2 Every session after that

One new conversation per milestone:

```
Read docs/DECISIONS.md and the spec sections milestone Mx needs. Give me
a plan of 10 bullets or fewer and wait for my OK. Then build it. Finish
by telling me how to run the milestone's check.
```

### 0.3 Saving tokens

- New conversation per milestone, so the context stays small.
- After session 1, point the agent at specific sections, not whole files.
- When something breaks, paste the exact error and the file it points at;
  don't ask the agent to "investigate".
- Do browser checks yourself. Agent browser runs are expensive.
- Have the agent use the MCP's `get_code_snippet` rather than reading full docs.
- No refactors or polish until M4 (the gasless record) works.
- If you run out of tokens mid-milestone, the spec plus DECISIONS.md lets a
  fresh session pick up where you left off.

### 0.4 Test policy

- **Required:** the minimum contract tests in section 4, plus any minimum
  test named in your milestones. That's it.
- Tests listed as optional in the project specs are optional. Add one when
  a bug shows up in that area.
- Milestone checks are short manual checks, run by the dev.

### 0.5 Secrets and approvals

- Never paste keys into the agent chat; fill `.env` yourself.
- Let the agent run builds, tests and dev servers. Review anything that
  deploys or touches `DEPLOYER_KEY`.
- Mainnet deploys are run by the dev, not the agent.

## 1. Human-only setup (once, ~20 min)

1. **Core wallet + Fuji AVAX** for the deployer only (players never need AVAX):
   https://core.app/tools/testnet-faucet/?subnet=c&token=c
   If it wants a coupon code, ask a teammate to send some.
2. **SmoothSend** — https://dashboard.smoothsend.xyz: create a project,
   generate a key pair (`pk_nogas_…`, `sk_nogas_…`), and add
   `http://localhost:3000` to the public key's allowed origins.
3. **Privy** (if kept in the interview) — https://dashboard.privy.io:
   create an app, enable Email and Google, and allow `http://localhost:3000`.
4. **SmoothSend MCP in Antigravity** (section 3.3).
5. **`.env`** from `.env.example` once the agent creates it.
6. **Later, for mainnet:** a small credit pack, the production URL added in
   both dashboards, a little AVAX on the deployer, and you run the deploy.

## 2. Shared architecture

```
Browser (Next.js + Privy + wagmi/viem + @smoothsend/sdk/avax)
  │ 1. log in (Privy email/Google → embedded wallet, or an external wallet)
  │ 2. sign a nonce message → backend session { eoa, scw }
  │ 3. play: game actions go to the backend, which holds the secret state
  │ 4. on finish: backend verifies the result, returns an EIP-712 signature
  │ 5. sponsored write submit(..., signature) via SmoothSend
  │      → gateway → bundler + paymaster → EntryPoint → player's smart account
  │      → GameContract (msg.sender = smart account)
  │ 6. leaderboards read contract state and events
Deployer EOA (Foundry scripts): deploy, commitDays, revealDay, setSigner
```

- **The server decides results.** It either holds the secret (Avax-dle,
  Snowglobe, Cursed Compass) or replays the input log (Block Builder).
  Client-claimed scores are never trusted.
- **The contract trusts one thing:** a signature from `SIGNER_KEY`.
- **On-chain identity is the smart account (SCW), not the EOA.** The
  backend signs for the SCW; the contract checks `player == msg.sender`.
- **Admin writes come from the deployer EOA,** never through SmoothSend
  (sponsored writes come from a smart account, so owner checks would fail).
- **Commit-reveal for daily content:** each day's secret is hashed and
  committed before the day starts, then revealed later.
- **Days are UTC.** Day N starts at 00:00 UTC (05:30 IST).

## 3. SmoothSend reference

### 3.1 What it is

ERC-4337 gas sponsorship on Avalanche C-Chain. Each player's wallet (EOA)
owns a predictable smart account. The app sends a UserOperation;
SmoothSend's gateway checks the API key and credits, its bundler estimates
gas, its VerifyingPaymaster pays, and the EntryPoint (v0.7) executes the
call from the smart account.
Docs: https://docs.smoothsend.xyz — use the **Avalanche (ERC-4337)** pages, not Aptos.

### 3.2 Keys

- `pk_nogas_*`: browser; works only from allowed origins (CORS).
- `sk_nogas_*`: server and scripts only; never in client code or git.
- CORS stops browsers, not scripts, so keep the credit balance small.

### 3.3 MCP server

Add to Antigravity's MCP configuration **[VERIFY where Antigravity keeps it]**:

```json
{
  "mcpServers": {
    "smoothsend": { "command": "npx", "args": ["@smoothsend/mcp@latest"] }
  }
}
```

| Tool / resource                                                          | Use                                        |
| ------------------------------------------------------------------------ | ------------------------------------------ |
| `get_code_snippet` with `avax-privy-write`                               | Privy write hook (our default)             |
| `get_code_snippet` with `avax-wagmi-setup`, `avax-sponsored-write`       | wagmi path                                 |
| `get_code_snippet` with `avax-backend-client`                            | Node scripts                               |
| `get_avax_addresses` (`fuji` / `mainnet`)                                | EntryPoint, paymaster, factory             |
| `get_docs` with `avax-quickstart`, `avax-api-reference`, `avax-examples` | Full reference when a snippet isn't enough |

If only Aptos tools show up, the npx cache is stale; clear it or install globally.

### 3.4 Install

```
npm install @smoothsend/sdk viem wagmi @tanstack/react-query @privy-io/react-auth
```

Add `.npmrc` with `legacy-peer-deps=true`. The SDK lists Aptos packages
as peers; without this, installs and Vercel builds fail.
All Avalanche imports come from `@smoothsend/sdk/avax`.

### 3.5 Providers and writes (Privy, our default) **[ASSUMPTION]**

```tsx
import { PrivyProvider } from "@privy-io/react-auth";
import { avalancheFuji } from "viem/chains";
import { SmoothSendAvaxProvider } from "@smoothsend/sdk/avax";

<PrivyProvider
  appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
  config={{
    embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" } },
    defaultChain: avalancheFuji,
    supportedChains: [avalancheFuji], // avalanche on mainnet
  }}
>
  <SmoothSendAvaxProvider
    apiKey={process.env.NEXT_PUBLIC_SMOOTHSEND_API_KEY!}
    network={
      process.env.NEXT_PUBLIC_SMOOTHSEND_NETWORK as "testnet" | "mainnet"
    }
  >
    {children}
  </SmoothSendAvaxProvider>
</PrivyProvider>;
```

wagmi's `usePublicClient` is used too, so a wagmi config must be in the
tree **[VERIFY nesting against `avax-privy-write`]**.

```tsx
import { usePublicClient } from 'wagmi';
import { usePrivy, useSignMessage } from '@privy-io/react-auth';
import { useSmoothSendPrivyWrite } from '@smoothsend/sdk/avax';

const { writeContract, isPending } = useSmoothSendPrivyWrite({
  publicClient: usePublicClient(),
  ownerAddress: user?.wallet?.address as `0x${string}`,   // must be the signing wallet
  signMessage: async ({ message }) => (await signMessage({ message })).signature,
});
writeContract({ address, abi, functionName: 'submit…', args: [...], mode: 'developer-sponsored' });
```

`mode` goes on each `writeContract` call, not on the hook.

**wagmi-only alternative:** wrap in `SmoothSendAvaxProvider` and swap one import:
`import { useSmoothSendWrite as useWriteContract } from '@smoothsend/sdk/avax';`

### 3.6 Identity: the smart account

- Client: `useSmoothSendAvax({ publicClient, walletClient }).smartAccountAddress`.
- Server: `getSmartAccountAddress({ publicClient, owner: eoa, network })`.
- They must match. Show it in the UI as "Your gasless wallet: 0x…".
- The first sponsored call may also deploy the smart account and cost
  more **[VERIFY in dashboard usage]**.

### 3.7 Hashes, latency, button states

- Sponsored writes return a **UserOperation hash**, not a transaction hash.
  Get the `transactionHash` via `eth_getUserOperationReceipt`
  (`SmoothSendAvaxSubmitter.getUserOperationReceipt`) for explorer links.
- A sponsored write takes about 9 s on Fuji. States: Idle → Sponsoring
  (no second click) → Confirming (polling the receipt) → Recorded
  (Snowtrace link). Never block gameplay on Confirming.

### 3.8 Batching

`useSmoothSendAvax().submitSponsoredUserOp({ calls: [...] })` runs several
calls in one UserOperation (one signature, one transaction). With Privy,
confirm the batch path in `avax-api-reference` **[VERIFY]**.

### 3.9 Scripts and backend

- `createSmoothSendAvaxClient({ apiKey: sk_nogas_…, network })` with `submitCall` / `submitCalls`.
- `SmoothSendAvaxSubmitter` with a `pk_nogas_*` key outside a browser needs `corsOrigin` set.
- `fetchAvaxAaPublicDefaults()` returns current EntryPoint, factory and
  paymaster addresses. Never hardcode them.

### 3.10 Costs

Testnet is free. Mainnet developer-sponsored calls cost
MAX(gas × 1.5, $0.01), so $5 ≈ 500 calls at the floor. Credits don't
expire. When credits run out, mainnet writes fail.

### 3.11 Help

Discord https://discord.smoothsend.xyz · contact@smoothsend.xyz ·
reference app (Privy + SmoothSend game on Fuji): https://github.com/adityahere26/AvalanceTestnet

## 4. Shared contract pattern

Solidity ^0.8.24, Foundry, OpenZeppelin (`EIP712`, `ECDSA`, `Ownable`).
Each project's contract inherits this base and adds its own submit function.

```solidity
abstract contract DailyBoard is EIP712, Ownable {
    address public signer;
    uint256 public immutable launchDay;               // UTC day index of day 1
    mapping(uint256 => bytes32) public dayCommit;     // day => commitment hash
    mapping(uint256 => bool) public dayRevealed;
    struct Streak { uint16 current; uint16 best; uint32 lastDay; }
    mapping(address => Streak) public streaks;

    function currentDay() public view returns (uint256);       // 0 before launch, else 1-based
    function _checkDay(uint256 day) internal view;             // day == current or current - 1
    function _verify(bytes32 structHash, bytes calldata sig) internal view; // == signer
    function _bumpStreak(address player, uint256 day) internal; // +1 if day == lastDay + 1, else 1

    function commitDays(uint256 firstDay, bytes32[] calldata hashes) external onlyOwner;
    // future days only; never overwrites an existing commit
    function setSigner(address s) external onlyOwner;           // emits SignerUpdated
}
```

- `currentDay = block.timestamp / 1 days - launchDay + 1`.
- The one-day grace (`current - 1`) covers solves just before midnight UTC.
- EIP-712 domain: `{ name: <game name>, version: "1", chainId, verifyingContract }`.
  Every typed struct starts with `address player`, and `player` must equal `msg.sender`.
- Each project defines its own `revealDay(...)`, checking the preimage
  against `dayCommit[day]`.

**Minimum tests (required):**

1. A submit signed by the signer, sent from the player's address, is stored.
2. The same signature sent from a different address is rejected.
3. A second submit for the same day and player is rejected.
4. `commitDays` and `setSigner` reject non-owners.
5. One fixture signed by `lib/signer.ts` is accepted by the contract.
   This catches TypeScript/Solidity EIP-712 mismatches, the most common failure.

## 5. Shared backend pattern (Next.js route handlers)

- **Auth:** `GET /api/auth/nonce` → client signs `"Sign in to <Game>: <nonce>"`
  → `POST /api/auth/verify {address, signature}`. Verify with viem
  `verifyMessage`, compute the SCW with `getSmartAccountAddress`, and set
  an httpOnly session cookie `{ eoa, scw }`.
- **Signing:** `lib/signer.ts` signs EIP-712 data for `player = scw` with
  `SIGNER_KEY`, with `deadline = now + 10 min`.
- **Result endpoints are idempotent:** calling again returns a fresh
  deadline and signature for the same result.
- **Rate limit** gameplay routes per session (numbers in each spec).
- **Server-only data** (answers, maps, unrevealed seeds, salts) lives in
  `data/`, is never imported by client code, logged, or returned early.
- **Day math** lives only in `lib/day.ts` and matches the contract.
- **Storage:** SQLite locally **[ASSUMPTION]**; Postgres (Supabase or Neon)
  if deployed on Vercel, where SQLite doesn't persist.

## 6. Shared frontend patterns

- Network badge: "Fuji testnet" or "Avalanche", always visible.
- Profile: login method, EOA, "Your gasless wallet" (SCW), stats.
- Write button states from section 3.7, with a Snowtrace link once recorded
  (`https://testnet.snowtrace.io/tx/…` or `https://snowtrace.io/tx/…`).
- Share card: plain text, no spoilers, ending in "verified on Avalanche".
- Proof panel: for past days, the committed hash, the revealed preimage,
  and that they match.
- Mobile first. Colour never carries meaning alone.

## 7. Stack, env vars, skeleton

| Layer     | Choice                                                                                 |
| --------- | -------------------------------------------------------------------------------------- |
| Chain     | Avalanche C-Chain: Fuji 43113 (dev), mainnet 43114                                     |
| RPC       | `https://api.avax-test.network/ext/bc/C/rpc` / `https://api.avax.network/ext/bc/C/rpc` |
| Gas       | SmoothSend, developer-sponsored                                                        |
| Login     | Privy **[ASSUMPTION]**                                                                 |
| Contracts | Foundry + OpenZeppelin                                                                 |
| App + API | Next.js (App Router), TypeScript, wagmi + viem                                         |
| Deploy    | Vercel + Foundry scripts                                                               |

```
NEXT_PUBLIC_CHAIN_ID=43113
NEXT_PUBLIC_SMOOTHSEND_NETWORK=testnet
NEXT_PUBLIC_SMOOTHSEND_API_KEY=pk_nogas_…
NEXT_PUBLIC_PRIVY_APP_ID=
NEXT_PUBLIC_CONTRACT_ADDRESS=
SMOOTHSEND_SECRET_KEY=sk_nogas_…   # scripts only
RPC_URL=
SIGNER_KEY=                         # backend EIP-712 signer
DEPLOYER_KEY=                       # contract owner; the only key that needs AVAX
SESSION_SECRET=
LAUNCH_DAY_INDEX=                   # UTC day number of day 1
DATABASE_URL=
```

```
<repo>/
├─ AGENTS.md  ├─ .npmrc  ├─ .env.example
├─ docs/ (COMMON.md, project spec, DECISIONS.md)
├─ contracts/ (src, test, script)
├─ app/ (pages + api routes)
├─ lib/ (day.ts, commit.ts, signer.ts, scw.ts, db.ts, smoothsend.ts, engine)
├─ scripts/ (gen-days, commit-days, reveal-day, wallet)
└─ data/ (server-only content)
```

## 8. AGENTS.md (common rules; each project adds a few lines)

Create `AGENTS.md` in the repo root with these rules followed by your
project's rules, and add them to Antigravity's workspace rules if your
version uses them **[VERIFY]**.

```
- docs/DECISIONS.md overrides the specs where they differ.
- Plan first (10 bullets or fewer) and wait for approval before coding.
- Look up SmoothSend APIs via the SmoothSend MCP (prefer get_code_snippet).
  Never guess SDK names or options.
- Every player write goes through SmoothSend. Admin writes go through
  Foundry scripts from DEPLOYER_KEY.
- On-chain player identity is the smart account (SCW). The backend signs
  for the SCW; contracts check player == msg.sender.
- Server-only data never reaches client code, logs, or early API responses.
- Never commit or print keys. Keep .env.example current.
- All day math is UTC via lib/day.ts.
- Write only the required tests (COMMON §4 and the milestone's minimum test).
  Don't add extra test suites unless asked.
- Work on Fuji only. The dev runs anything on mainnet.
- Don't add dependencies without saying why.
- Keep answers short. End each milestone with the exact steps for the dev's check.
```

## 9. Gotchas (read before debugging)

- **Works locally, fails deployed:** a missing origin in the SmoothSend or Privy dashboard.
- **`npm install` fails:** missing `.npmrc` `legacy-peer-deps=true`.
- **Signature rejected on-chain:** you signed for the EOA instead of the SCW.
- **Owner function reverts from the app:** it went through SmoothSend; use the Foundry script.
- **Explorer link 404s:** you linked the userOpHash, not the transaction hash.
- **Mainnet writes start failing:** SmoothSend credits ran out.
- **Leaderboard empty on Vercel:** SQLite doesn't persist there; use Postgres.
- **Fuji vs mainnet mismatch:** chain ID, SmoothSend network, Privy chain and contract address must all match.
