/**
 * Live price tape + settlement relay.
 *
 * Public testnet fullnode subscriptions are unreliable, so we poll the event
 * stream once a second and fan out only the *new* ticks to subscribers. This is
 * the low-latency source for the climb animation and the floor/fall moment —
 * the documented REST price routes do not exist.
 */

import { SuiClient } from "@mysten/sui/client";
import {
  EVENT,
  FULLNODE_URL,
  parsePriceEvent,
  parseSettlementEvent,
  type PriceTick,
  type SettlementTick,
} from "@lofi/sui";

type PriceListener = (t: PriceTick) => void;
type SettleListener = (t: SettlementTick) => void;

export class Tape {
  private client = new SuiClient({ url: FULLNODE_URL });
  private latest = new Map<string, PriceTick>();
  private priceSubs = new Set<PriceListener>();
  private settleSubs = new Set<SettleListener>();
  private lastPriceTs = 0;
  private seenSettle = new Set<string>();
  private timer?: ReturnType<typeof setInterval>;

  start(intervalMs = 1000) {
    if (this.timer) return;
    this.timer = setInterval(() => void this.poll(), intervalMs);
    void this.poll();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  latestFor(oracleId: string): PriceTick | undefined {
    return this.latest.get(oracleId);
  }

  onPrice(fn: PriceListener): () => void {
    this.priceSubs.add(fn);
    return () => this.priceSubs.delete(fn);
  }

  onSettle(fn: SettleListener): () => void {
    this.settleSubs.add(fn);
    return () => this.settleSubs.delete(fn);
  }

  private async poll() {
    try {
      const prices = await this.client.queryEvents({
        query: { MoveEventType: EVENT.pricesUpdated },
        limit: 50,
        order: "descending",
      });
      // ascending so listeners see chronological order
      const ticks = prices.data
        .map(parsePriceEvent)
        .filter((t): t is PriceTick => !!t && t.timestamp > this.lastPriceTs)
        .sort((a, b) => a.timestamp - b.timestamp);
      for (const t of ticks) {
        this.latest.set(t.oracleId, t);
        this.lastPriceTs = Math.max(this.lastPriceTs, t.timestamp);
        for (const fn of this.priceSubs) fn(t);
      }

      const settles = await this.client.queryEvents({
        query: { MoveEventType: EVENT.settled },
        limit: 25,
        order: "descending",
      });
      for (const e of settles.data) {
        const s = parseSettlementEvent(e);
        if (!s || this.seenSettle.has(s.oracleId)) continue;
        this.seenSettle.add(s.oracleId);
        for (const fn of this.settleSubs) fn(s);
      }
    } catch (err) {
      // transient fullnode hiccup — keep polling
      console.warn("[tape] poll error:", (err as Error).message);
    }
  }
}
