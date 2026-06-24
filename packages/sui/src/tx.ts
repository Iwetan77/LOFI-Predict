/**
 * Transaction builders for the LOFI PREDICT game loop, mapped 1:1 onto the
 * verified DeepBook Predict entry points. The game's vocabulary is in the
 * comments; the wire calls are the real protocol.
 *
 * Game term            Protocol call
 * ───────────────────  ─────────────────────────────────────────────
 * one-time setup       predict::create_manager
 * "load credits"       predict_manager::deposit<DUSDC>
 * call UP / DOWN       predict::mint<DUSDC>(market_key::new(...))
 * CASH OUT / grab      predict::redeem<DUSDC>(...)
 * settle after fall    predict::redeem_permissionless<DUSDC>(...)
 */

import { Transaction, type TransactionObjectArgument } from "@mysten/sui/transactions";
import {
  CLOCK_OBJECT,
  DUSDC_TYPE,
  PREDICT_OBJECT,
  TARGET,
} from "./constants.js";

/** A single binary market the player is climbing on. */
export interface MarketRef {
  /** Shared OracleSVI object id (the "building"). */
  oracleId: string;
  /** Oracle expiry in ms (the round end). */
  expiry: number | bigint;
  /** Strike in 9-decimal price units (derived from the RISK dial). */
  strike: bigint;
  /** UP call = true, DOWN call = false. */
  isUp: boolean;
}

/** Build a MarketKey on-chain — strike/direction are packed inside it. */
function buildMarketKey(tx: Transaction, m: MarketRef): TransactionObjectArgument {
  return tx.moveCall({
    target: TARGET.marketKeyNew,
    arguments: [
      tx.pure.id(m.oracleId),
      tx.pure.u64(BigInt(m.expiry)),
      tx.pure.u64(m.strike),
      tx.pure.bool(m.isUp),
    ],
  });
}

/**
 * One-time: create + share this player's PredictManager. The returned ID is
 * read back from the `PredictManagerCreated` event / object changes.
 */
export function buildCreateManager(): Transaction {
  const tx = new Transaction();
  tx.moveCall({ target: TARGET.createManager });
  return tx;
}

/**
 * "Load credits" — deposit DUSDC the player already holds into their manager.
 * `coin` is a Coin<DUSDC> argument (e.g. split off gas-less from owned coins).
 */
export function buildDeposit(opts: {
  managerId: string;
  coin: TransactionObjectArgument;
  tx?: Transaction;
}): Transaction {
  const tx = opts.tx ?? new Transaction();
  tx.moveCall({
    target: TARGET.managerDeposit,
    typeArguments: [DUSDC_TYPE],
    arguments: [tx.object(opts.managerId), opts.coin],
  });
  return tx;
}

/**
 * Call UP/DOWN — mint a binary position. Cost is pulled from the manager's
 * DUSDC balance, so the player must have "loaded credits" first.
 * `quantity` is the position size in 6-decimal units.
 */
export function buildMint(opts: {
  managerId: string;
  market: MarketRef;
  quantity: bigint;
  tx?: Transaction;
}): Transaction {
  const tx = opts.tx ?? new Transaction();
  const key = buildMarketKey(tx, opts.market);
  tx.moveCall({
    target: TARGET.mint,
    typeArguments: [DUSDC_TYPE],
    arguments: [
      tx.object(PREDICT_OBJECT),
      tx.object(opts.managerId),
      tx.object(opts.market.oracleId),
      key,
      tx.pure.u64(opts.quantity),
      tx.object(CLOCK_OBJECT),
    ],
  });
  return tx;
}

/**
 * CASH OUT before expiry — redeem the position; payout lands in the manager
 * balance. Use `buildRedeemSettled` once the oracle has settled.
 */
export function buildRedeem(opts: {
  managerId: string;
  market: MarketRef;
  quantity: bigint;
  tx?: Transaction;
}): Transaction {
  const tx = opts.tx ?? new Transaction();
  const key = buildMarketKey(tx, opts.market);
  tx.moveCall({
    target: TARGET.redeem,
    typeArguments: [DUSDC_TYPE],
    arguments: [
      tx.object(PREDICT_OBJECT),
      tx.object(opts.managerId),
      tx.object(opts.market.oracleId),
      key,
      tx.pure.u64(opts.quantity),
      tx.object(CLOCK_OBJECT),
    ],
  });
  return tx;
}

/**
 * Pull DUSDC back out of the manager to the player's wallet. `amount` is in
 * 6-decimal units; pass the full manager balance to cash out everything.
 */
export function buildWithdraw(opts: {
  managerId: string;
  amount: bigint;
  recipient: string;
  tx?: Transaction;
}): Transaction {
  const tx = opts.tx ?? new Transaction();
  const coin = tx.moveCall({
    target: TARGET.managerWithdraw,
    typeArguments: [DUSDC_TYPE],
    arguments: [tx.object(opts.managerId), tx.pure.u64(opts.amount)],
  });
  tx.transferObjects([coin], tx.pure.address(opts.recipient));
  return tx;
}

/** Settle a position after the round ended (oracle is Settled). */
export function buildRedeemSettled(opts: {
  managerId: string;
  market: MarketRef;
  quantity: bigint;
  tx?: Transaction;
}): Transaction {
  const tx = opts.tx ?? new Transaction();
  const key = buildMarketKey(tx, opts.market);
  tx.moveCall({
    target: TARGET.redeemPermissionless,
    typeArguments: [DUSDC_TYPE],
    arguments: [
      tx.object(PREDICT_OBJECT),
      tx.object(opts.managerId),
      tx.object(opts.market.oracleId),
      key,
      tx.pure.u64(opts.quantity),
      tx.object(CLOCK_OBJECT),
    ],
  });
  return tx;
}
