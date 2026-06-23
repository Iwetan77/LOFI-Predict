/**
 * Live game signals from the Sui event stream. This is the real source for the
 * climb (price tape) and the floor-reached/fell moment (settlement) — the
 * documented REST price routes do not exist.
 *
 * Verified payload shapes (parsedJson):
 *   OraclePricesUpdated: { oracle_id, spot, forward, timestamp }   // 9-dec prices
 *   OracleSettled:       { oracle_id, settlement_price, ... }
 */

import type { SuiClient, SuiEvent } from "@mysten/sui/client";
import { EVENT, priceToFloat } from "./constants.js";

export interface PriceTick {
  oracleId: string;
  spot: number; // float
  forward: number; // float
  spotRaw: bigint;
  timestamp: number; // ms
}

export interface SettlementTick {
  oracleId: string;
  settlementPrice: number;
  settlementRaw: bigint;
  timestamp: number;
}

export function parsePriceEvent(e: SuiEvent): PriceTick | undefined {
  if (e.type !== EVENT.pricesUpdated) return undefined;
  const j = e.parsedJson as { oracle_id: string; spot: string; forward: string; timestamp: string };
  return {
    oracleId: j.oracle_id,
    spot: priceToFloat(j.spot),
    forward: priceToFloat(j.forward),
    spotRaw: BigInt(j.spot),
    timestamp: Number(j.timestamp),
  };
}

export function parseSettlementEvent(e: SuiEvent): SettlementTick | undefined {
  if (e.type !== EVENT.settled) return undefined;
  const j = e.parsedJson as { oracle_id: string; settlement_price: string; timestamp?: string };
  return {
    oracleId: j.oracle_id,
    settlementPrice: priceToFloat(j.settlement_price),
    settlementRaw: BigInt(j.settlement_price),
    timestamp: Number(j.timestamp ?? Date.now()),
  };
}

/**
 * Poll the latest price tick for an oracle. The backend uses this to relay a
 * price tape over WebSocket; the climb animation consumes the relayed stream.
 * (A fullnode WS subscription can replace polling where available.)
 */
export async function latestPrice(
  client: SuiClient,
  oracleId: string,
): Promise<PriceTick | undefined> {
  const page = await client.queryEvents({
    query: { MoveEventType: EVENT.pricesUpdated },
    limit: 50,
    order: "descending",
  });
  for (const e of page.data) {
    const tick = parsePriceEvent(e);
    if (tick && tick.oracleId === oracleId) return tick;
  }
  return undefined;
}
