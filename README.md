# LOFI PREDICT

An arcade climber for mobile. LOFI the yeti scales an endless tower; each round
the player calls whether a crypto price goes up or down before a short timer.
A correct call lifts LOFI to the next floor, a wrong call drops him. The score
is how high he climbs.

Under the arcade skin, every call settles for real on
[DeepBook Predict](https://github.com/MystenLabs/deepbookv3) on the Sui testnet.
Positions are minted and redeemed on-chain; the backend only reads and relays.

## Architecture

A pnpm monorepo:

| Package | Role |
| --- | --- |
| `packages/sui` | Typed transaction builders, oracle discovery, and event parsing for DeepBook Predict. No hand-rolled BCS — every on-chain id, type, and target is centralized in `constants.ts`. |
| `apps/api` | A read-only Fastify relay: serves the market list, relays the live price tape and settlement events over WebSocket, and aggregates the leaderboard. Holds no funds and custodies nothing. |
| `apps/web` | The game: a React + Vite PWA with a PixiJS canvas, a retro arcade skin, and zkLogin sign-in. All value flows from the player's wallet to their on-chain manager. |

All settlement is in DUSDC (6 decimals). Oracle prices use 9 decimals. The live
climb is driven by `oracle::OraclePricesUpdated` events and resolved by
`oracle::OracleSettled`.

## Development

Requires Node 18+, pnpm 10+, and the Sui CLI on a testnet environment.

```bash
pnpm install
pnpm --filter @lofi/api start     # relay on :8787
pnpm --filter @lofi/web dev       # game on :5174
```

Verify the on-chain layer against testnet:

```bash
pnpm --filter @lofi/sui exec tsx scripts/smoke.ts
```

## License

Apache-2.0
