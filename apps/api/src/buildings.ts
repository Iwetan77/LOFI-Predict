/**
 * Maps live oracles → "buildings" the game renders. Keeps the protocol's raw
 * fields (the web client needs oracle_id / expiry / strike grid to build txns)
 * but exposes them under neutral names. The finance vocabulary disguise is the
 * web layer's job; this is just shaped data.
 */

import { activeByExpiry, PRICE_DECIMALS, type RawOracle } from "@lofi/sui";

export interface Building {
  oracleId: string;
  asset: string; // "BTC"
  /** round end (oracle expiry, ms) */
  roundEndsAt: number;
  /** ms remaining until the round settles */
  msLeft: number;
  /** strike grid for the RISK dial, in 9-decimal price units */
  minStrike: number;
  tickSize: number;
  tickFloat: number;
}

/** Only rounds still joinable with at least this much time left are shown. */
const MIN_LEAD_MS = 30_000;

export function toBuildings(oracles: RawOracle[], now = Date.now()): Building[] {
  return activeByExpiry(oracles)
    .filter((o) => o.expiry - now >= MIN_LEAD_MS)
    .map((o) => ({
      oracleId: o.oracle_id,
      asset: o.underlying_asset,
      roundEndsAt: o.expiry,
      msLeft: o.expiry - now,
      minStrike: o.min_strike,
      tickSize: o.tick_size,
      tickFloat: o.tick_size / 10 ** PRICE_DECIMALS,
    }));
}
