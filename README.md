<div align="center">

# LOFI PREDICT

**Help LOFI the yeti climb an endless tower. Call the market right, climb higher.**

An arcade climber for mobile — where every call settles for real on-chain.

</div>

---

LOFI clings to the side of a neon skyscraper. The player makes one call — will
the price go **up** or **down**? — and it stays live on a visible clock. Moving
your way, LOFI scrambles up, clearing whole buildings on a hot streak; moving
against you, he loses his grip and falls. Three lives, one question — *how high
can he get?*

Behind the arcade cabinet, each call is a binary position minted and redeemed on
[DeepBook Predict](https://github.com/MystenLabs/deepbookv3) on the Sui testnet.
The market machinery is deliberately invisible: the player sees towers and
ledges, never strikes and expiries. The game is the product; settlement is
infrastructure.

## Gameplay

- **Choose how bold LOFI jumps.** A bigger leap clears more floors per
  building, but needs a stronger move to land it.
- **Call it — up or down — and stake your credits.** The call goes live for a
  fixed clock (60s), shown on screen the whole time.
- **Watch the climb.** The live price drives LOFI in real time. Moving your
  way, he climbs and the windows glow warm. Moving against you, the windows
  flash red and loose bricks rain down. Topping a tower is a visual reward, not
  the end of the bet — on a hot streak LOFI can rocket through several
  buildings in a row inside the same call, stacking the bonus each time.
- **Hold or grab the ledge.** A live *cash out* button shows your bankable
  winnings — banked buildings plus the current one's swing — and pulses when
  you're ahead. Grab it early to bank that amount and end the run, or hold and
  let the clock decide.
- **Three ways a call ends:**
  - **The clock runs out** with LOFI still clinging on — the call auto-banks
    everything earned, then asks if you want to call again (continue) or leave
    with your winnings (exit). This is the *only* other moment you're asked a
    new question — never mid-climb.
  - **LOFI falls** — grip hits zero and the whole call is forfeit, banked
    buildings included. Lose a life, no continue.
  - **You grab the ledge** — bank now and end the run. No continue.

New players start on a play-money tutorial with no sign-in. Real climbs use
either a connected wallet or Google sign-in (zkLogin, no wallet install), both
on Sui testnet.

## How a call resolves on-chain

A "call" is one binary position on [DeepBook
Predict](https://github.com/MystenLabs/deepbookv3) testnet — minted once, held
for the visible 60-second clock, redeemed once.

1. **Pick a market.** The app reads DeepBook Predict's live oracle list and
   joins whichever BTC oracle expires soonest, as long as it still has at
   least two minutes left — comfortably longer than a single call's 60s clock,
   so a call can never outlast the market it was minted against.
2. **Mint.** UP/DOWN + the live spot (rounded to the oracle's tick size) becomes
   a real `predict::mint<DUSDC>` call — your stake leaves your `PredictManager`
   balance on-chain.
3. **Climb.** LOFI's height is driven purely by the live price relative to your
   strike — there's no separate game clock for the *climb* animation, only for
   the *call*. Clearing a building (`climbH` topping out) is a floor-combo
   reward inside this same window, not a new position.
4. **Redeem — once, at the end of the call.** The instant the call ends (fall,
   manual cash-out, or the clock running out), the app calls
   `predict::redeem<DUSDC>` against the *current* live price — DeepBook
   Predict settles early, marked-to-market, rather than waiting for the
   oracle's real (much later) expiry. One mint, one redeem, per call — however
   many buildings you cleared inside it.

The market machinery stays invisible to the player: the on-screen clock is
framed as "how long this call is live for," never as a strike, expiry, or
oracle. The game is the product; settlement is infrastructure.

## Architecture

A pnpm workspace. All value flows from the player's wallet to their own
on-chain `PredictManager` — the backend only reads, relays, signs zkLogin
proofs, and aggregates. It never custodies funds.

| Package | Responsibility |
| --- | --- |
| [`packages/sui`](packages/sui) | Typed DeepBook Predict transaction builders, oracle discovery, and event parsing. Every on-chain id, type, and call target is centralized — no hand-rolled BCS. |
| [`apps/api`](apps/api) | Local dev relay (Fastify): serves the market list, relays the live price tape over WebSocket, and exposes the zkLogin/Google auth routes. |
| [`api`](api) | The same zkLogin/Google auth routes as `apps/api`, rewritten as plain Vercel serverless handlers (no Fastify — it doesn't bundle on Vercel's esbuild) for the deployed site. Both share the framework-agnostic helpers in `apps/api/src/zklogin`. |
| [`apps/web`](apps/web) | The game — a React + Vite PWA with a PixiJS climb canvas, a retro arcade skin, and two sign-in paths: Connect Wallet (`@mysten/dapp-kit`) or Google (zkLogin) — both testnet. |

Real climbs go straight from the browser to the Sui fullnode for reads; writes
(mint/redeem/deposit/withdraw) are built client-side for wallet sign-in, or
relayed through the zkLogin routes above when signed in with Google (the
backend never sees a private key — only an ephemeral key the browser holds).
The live climb is driven by `oracle::OraclePricesUpdated` events. Settlement is
in DUSDC (6 decimals); oracle prices use 9 decimals.

## Tech stack

React · Vite · TypeScript · Tailwind · PixiJS · Zustand ·
[`@mysten/sui`](https://www.npmjs.com/package/@mysten/sui) ·
[`@mysten/dapp-kit`](https://www.npmjs.com/package/@mysten/dapp-kit) · zkLogin
(Sui) · Fastify (local dev relay) · Vercel serverless functions (deployed
auth API).

## Getting started

Requires Node 18+, pnpm 10+, and the Sui CLI configured for testnet.

```bash
pnpm install

# relay API on :8787
pnpm --filter @lofi/api start

# game on :5174
pnpm --filter @lofi/web dev
```

Verify the on-chain layer against live testnet state (read-only, no funds):

```bash
pnpm --filter @lofi/sui exec tsx scripts/smoke.ts
```

## Project layout

```
packages/sui      on-chain transaction builders + oracle/event helpers
apps/api          local dev relay (Fastify) + the shared zkLogin/Google auth helpers
api               the same auth routes, as plain Vercel serverless handlers
apps/web          the game PWA
  src/game        round logic (round.ts: risk tiers, ROUND_MS), price source, PixiJS climb, audio
  src/game/useEngine.ts   round lifecycle: mint → climb → redeem, for both modes
  src/store.ts    game state — one call's clock, banked buildings, lives, credits
  src/ui          arcade scenes (landing, pick, climb, next-call menu, summary, …)
  public/art      named sprite slots — drop art in, no code changes
```

## License

Licensed under the [Apache License 2.0](LICENSE).
