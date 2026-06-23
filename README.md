<div align="center">

# LOFI PREDICT

**Help LOFI the yeti climb an endless tower. Call the market right, climb higher.**

An arcade climber for mobile — where every call settles for real on-chain.

</div>

---

LOFI clings to the side of a neon skyscraper. Each round the player makes one
call: will the price go **up** or **down** before the timer runs out? A correct
call sends LOFI scrambling to the next floor; a wrong one loosens his grip and
he falls. Three lives, one question — *how high can he get?*

Behind the arcade cabinet, each call is a binary position minted and redeemed on
[DeepBook Predict](https://github.com/MystenLabs/deepbookv3) on the Sui testnet.
The market machinery is deliberately invisible: the player sees towers and
ledges, never strikes and expiries. The game is the product; settlement is
infrastructure.

## Gameplay

- **Pick a tower.** Each tower is a live market.
- **Choose how bold LOFI jumps.** A bigger leap climbs more floors at once, but
  needs a stronger move to land it.
- **Call it — up or down — and stake your credits.** A short countdown begins.
- **Watch the climb.** The live price drives LOFI in real time. Moving your way,
  he climbs and the windows glow warm. Moving against you, the windows flash red
  and loose bricks rain down.
- **Hold or grab the ledge.** A live *cash out* button shows your bankable
  winnings and pulses when you're ahead. Bail early for a smaller, safe amount,
  or hold for the full floor and risk the fall.
- **Reach the floor, or lose a life.** Clear twenty floors and LOFI leaps to a
  flashier skyline. Lose all three lives and it's game over — insert coin to
  continue.

New players start on a play-money tutorial with no sign-in. Real climbs use
Google sign-in (zkLogin, no wallet install) and a one-time credit load.

## Architecture

A pnpm workspace with three packages. All value flows from the player's wallet
to their on-chain manager — the backend only reads, relays, and aggregates.

| Package | Responsibility |
| --- | --- |
| [`packages/sui`](packages/sui) | Typed DeepBook Predict transaction builders, oracle discovery, and event parsing. Every on-chain id, type, and call target is centralized — no hand-rolled BCS. |
| [`apps/api`](apps/api) | A read-only Fastify relay: serves the market list, relays the live price tape and settlement events over WebSocket, and aggregates the leaderboard. Custodies nothing. |
| [`apps/web`](apps/web) | The game — a React + Vite PWA with a PixiJS climb canvas, a retro arcade skin, and zkLogin sign-in. |

The live climb is driven by `oracle::OraclePricesUpdated` events and resolved by
`oracle::OracleSettled`. Settlement is in DUSDC (6 decimals); oracle prices use
9 decimals.

## Tech stack

React · Vite · TypeScript · Tailwind · PixiJS · Zustand · Fastify ·
[`@mysten/sui`](https://www.npmjs.com/package/@mysten/sui) · zkLogin (Sui).

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
packages/sui    on-chain transaction builders + oracle/event helpers
apps/api        read-only relay (markets, price tape, leaderboard)
apps/web        the game PWA
  src/game      round logic, price source, PixiJS climb, audio
  src/ui        arcade scenes (landing, pick, climb, summary, …)
  public/art    named sprite slots — drop art in, no code changes
```

## License

Licensed under the [Apache License 2.0](LICENSE).
