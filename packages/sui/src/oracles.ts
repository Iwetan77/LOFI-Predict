/**
 * Oracle discovery from the public Predict server.
 *
 * Only ONE server route is needed and verified working:
 *   GET /predicts/:predict_id/oracles  -> the real list of markets ("buildings")
 *
 * (The prompt's /state and /prices/latest routes 404; live prices come from
 * the Sui event stream — see events.ts.)
 */

import { PREDICT_OBJECT, PREDICT_SERVER } from "./constants.js";

export interface RawOracle {
  predict_id: string;
  oracle_id: string;
  oracle_cap_id: string;
  underlying_asset: string; // "BTC" on this deployment
  expiry: number; // ms
  min_strike: number; // 9-decimal price units
  tick_size: number; // 9-decimal price units
  status: "active" | "settled" | string;
  activated_at: number | null;
  settlement_price: number | null;
  settled_at: number | null;
  created_checkpoint: number;
}

export async function fetchOracles(
  predictId: string = PREDICT_OBJECT,
  fetchImpl: typeof fetch = fetch,
): Promise<RawOracle[]> {
  const r = await fetchImpl(`${PREDICT_SERVER}/predicts/${predictId}/oracles`);
  if (!r.ok) throw new Error(`fetchOracles ${r.status}: ${await r.text()}`);
  return (await r.json()) as RawOracle[];
}

/** Active oracles only, soonest expiry first. */
export function activeByExpiry(oracles: RawOracle[]): RawOracle[] {
  return oracles
    .filter((o) => o.status === "active")
    .sort((a, b) => a.expiry - b.expiry);
}

/** Distinct underlying assets currently tradeable (BTC-only today). */
export function availableAssets(oracles: RawOracle[]): string[] {
  return [...new Set(activeByExpiry(oracles).map((o) => o.underlying_asset))];
}

/**
 * The market a "climb" should join: the soonest active expiry for an asset that
 * is still at least `minMsLeft` away (so the round isn't already ending).
 */
export function pickClimbOracle(
  oracles: RawOracle[],
  opts: { asset?: string; now?: number; minMsLeft?: number } = {},
): RawOracle | undefined {
  const now = opts.now ?? Date.now();
  const minMsLeft = opts.minMsLeft ?? 30_000;
  return activeByExpiry(oracles).find(
    (o) =>
      (!opts.asset || o.underlying_asset === opts.asset) &&
      o.expiry - now >= minMsLeft,
  );
}
