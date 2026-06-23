/**
 * Read-only previews via devInspect — no gas, no signature. These power the
 * player-facing "play for X, win up to Y" numbers and the live CASH OUT value.
 */

import type { SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { bcs } from "@mysten/sui/bcs";
import {
  CLOCK_OBJECT,
  PREDICT_OBJECT,
  TARGET,
} from "./constants.js";
import type { MarketRef } from "./tx.js";

const u64 = bcs.u64();

function readReturnU64(bytes: number[] | Uint8Array): bigint {
  return BigInt(u64.parse(Uint8Array.from(bytes)));
}

/**
 * get_trade_amounts(predict, oracle, key, quantity, clock) -> (mint_cost, redeem_payout)
 * Both values are in 6-decimal DUSDC units for the given quantity.
 */
export async function previewTrade(
  client: SuiClient,
  opts: { sender: string; market: MarketRef; quantity: bigint },
): Promise<{ mintCost: bigint; redeemPayout: bigint }> {
  const tx = new Transaction();
  const key = tx.moveCall({
    target: TARGET.marketKeyNew,
    arguments: [
      tx.pure.id(opts.market.oracleId),
      tx.pure.u64(BigInt(opts.market.expiry)),
      tx.pure.u64(opts.market.strike),
      tx.pure.bool(opts.market.isUp),
    ],
  });
  tx.moveCall({
    target: TARGET.getTradeAmounts,
    arguments: [
      tx.object(PREDICT_OBJECT),
      tx.object(opts.market.oracleId),
      key,
      tx.pure.u64(opts.quantity),
      tx.object(CLOCK_OBJECT),
    ],
  });

  const res = await client.devInspectTransactionBlock({
    sender: opts.sender,
    transactionBlock: tx,
  });

  if (res.error) throw new Error(`previewTrade devInspect failed: ${res.error}`);
  const returns = res.results?.at(-1)?.returnValues;
  if (!returns || returns.length < 2) {
    throw new Error("previewTrade: missing return values");
  }
  return {
    mintCost: readReturnU64(returns[0][0]),
    redeemPayout: readReturnU64(returns[1][0]),
  };
}

/** ask_bounds(predict, oracle_id) -> (min, max). Used to clamp the RISK dial. */
export async function previewAskBounds(
  client: SuiClient,
  opts: { sender: string; oracleId: string },
): Promise<{ min: bigint; max: bigint }> {
  const tx = new Transaction();
  tx.moveCall({
    target: TARGET.askBounds,
    arguments: [tx.object(PREDICT_OBJECT), tx.pure.id(opts.oracleId)],
  });
  const res = await client.devInspectTransactionBlock({
    sender: opts.sender,
    transactionBlock: tx,
  });
  if (res.error) throw new Error(`previewAskBounds devInspect failed: ${res.error}`);
  const returns = res.results?.at(-1)?.returnValues;
  if (!returns || returns.length < 2) throw new Error("previewAskBounds: missing return values");
  return { min: readReturnU64(returns[0][0]), max: readReturnU64(returns[1][0]) };
}
