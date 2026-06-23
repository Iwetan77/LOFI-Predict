/**
 * Testnet smoke check for the on-chain layer — read-only, no funds required.
 *
 *   1. discover a live BTC oracle (the "building")
 *   2. read spot from the price tape (OraclePricesUpdated)
 *   3. preview ask bounds + the mint cost / redeem payout ("play for X / win Y")
 *   4. dry-run a mint to prove the tx builds and typechecks on-chain
 *
 * The full mint->redeem cycle needs DUSDC (operator-minted) and is gated
 * separately. Run: `pnpm --filter @lofi/sui exec tsx scripts/smoke.ts`
 */

import { SuiClient } from "@mysten/sui/client";
import {
  FULLNODE_URL,
  PRICE_DECIMALS,
  dusdcToFloat,
  fetchOracles,
  pickClimbOracle,
  latestPrice,
  previewTrade,
  previewAskBounds,
  buildMint,
  type MarketRef,
} from "../src/index.js";

const SENDER =
  process.env.SENDER ??
  "0x20af017ce1efd98c3572537104c436bd96ab2fa31c090ed2f938f4a94c8c42dd";
const MANAGER =
  process.env.MANAGER ??
  "0x3edda5bd9e6aabcb39a4e0163e645a638cfde270ed94af1b8b137dd76451a8f0";

function onGridStrike(spotRaw: bigint, minStrike: bigint, tick: bigint): bigint {
  const k = (spotRaw - minStrike + tick / 2n) / tick;
  return minStrike + k * tick;
}

(async () => {
  const client = new SuiClient({ url: FULLNODE_URL });

  const oracles = await fetchOracles();
  const o = pickClimbOracle(oracles, { asset: "BTC", minMsLeft: 120_000 });
  if (!o) throw new Error("no live BTC oracle with >2min left right now");
  const minsLeft = ((o.expiry - Date.now()) / 60000).toFixed(1);
  console.log(`[1] building: BTC oracle ${o.oracle_id}`);
  console.log(`    expiry in ${minsLeft} min, tick ${o.tick_size / 10 ** PRICE_DECIMALS}`);

  const tick = await latestPrice(client, o.oracle_id);
  if (!tick) throw new Error("no recent price tick for this oracle");
  console.log(`[2] spot ${tick.spot.toFixed(2)} (forward ${tick.forward.toFixed(2)})`);

  const strike = onGridStrike(tick.spotRaw, BigInt(o.min_strike), BigInt(o.tick_size));
  const market: MarketRef = { oracleId: o.oracle_id, expiry: o.expiry, strike, isUp: true };
  console.log(`[3] RISK -> strike ${(Number(strike) / 10 ** PRICE_DECIMALS).toFixed(2)} (UP)`);

  const bounds = await previewAskBounds(client, { sender: SENDER, oracleId: o.oracle_id });
  console.log(`    ask bounds: [${dusdcToFloat(bounds.min)}, ${dusdcToFloat(bounds.max)}]`);

  const qty = 1_000_000n; // 1.0 contract
  const { mintCost, redeemPayout } = await previewTrade(client, { sender: SENDER, market, quantity: qty });
  console.log(`[4] preview qty 1.0: play ${dusdcToFloat(mintCost)} DUSDC, cash-out now ${dusdcToFloat(redeemPayout)} DUSDC`);
  console.log(`    win-up-to (1.0 settles in the money) = 1.0 DUSDC`);

  const tx = buildMint({ managerId: MANAGER, market, quantity: qty });
  tx.setSender(SENDER);
  tx.setGasBudget(100_000_000n); // skip auto-estimation so we get the abort cleanly
  const built = await tx.build({ client });
  const dry = await client.dryRunTransactionBlock({ transactionBlock: built });
  const err = dry.effects.status.error ?? "";
  const fundingGate = err.includes("withdraw_with_proof") || err.includes("balance_manager");
  if (dry.effects.status.status === "success") {
    console.log(`[5] mint dry-run: SUCCESS (manager is funded — full cycle live!)`);
  } else if (fundingGate) {
    console.log(`[5] mint dry-run aborts at the DUSDC funding gate (as expected, 0 balance).`);
    console.log(`    -> builder + MarketKey + oracle ref + Move call all valid on-chain.`);
  } else {
    throw new Error(`unexpected mint abort: ${err}`);
  }
})().catch((e) => {
  console.error("SMOKE FAILED:", e.message ?? e);
  process.exit(1);
});
