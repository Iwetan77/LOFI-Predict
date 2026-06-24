/**
 * A price source feeds the climb a stream of spot prices. Two implementations:
 *
 *  - SimPriceSource: a self-contained random walk for the play-money tutorial
 *    and as an offline fallback. Always works, no network.
 *  - (live tape wiring lands with the API/zkLogin step; it implements the same
 *    PriceSource interface so the climb engine doesn't care where ticks come
 *    from.)
 */

import type { SuiClient } from "@mysten/sui/client";
import { latestPrice } from "@lofi/sui";

export interface Tick {
  spot: number;
  t: number;
}

export interface PriceSource {
  /** latest known spot, or undefined until the first tick */
  current(): number | undefined;
  /** subscribe to ticks; returns an unsubscribe fn */
  subscribe(fn: (tick: Tick) => void): () => void;
  start(): void;
  stop(): void;
}

/** Random-walk price sim around a start value. Drift-free, gently volatile. */
export class SimPriceSource implements PriceSource {
  private spot: number;
  private subs = new Set<(t: Tick) => void>();
  private timer?: ReturnType<typeof setInterval>;
  private vol: number;

  constructor(start = 62000, volatilityPct = 0.0008) {
    this.spot = start;
    this.vol = volatilityPct;
  }

  current() {
    return this.spot;
  }

  /** Re-anchor the walk to a real price (keeps practice near live BTC). */
  setSpot(v: number) {
    if (v > 0) this.spot = v;
  }

  subscribe(fn: (t: Tick) => void) {
    this.subs.add(fn);
    return () => this.subs.delete(fn);
  }

  start(intervalMs = 250) {
    if (this.timer) return;
    this.timer = setInterval(() => {
      // Gaussian-ish step via summed uniforms.
      const r = (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
      this.spot = Math.max(1, this.spot * (1 + r * this.vol));
      const tick = { spot: this.spot, t: Date.now() };
      for (const fn of this.subs) fn(tick);
    }, intervalMs);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
}

/**
 * Live BTC tape polled straight from the Sui fullnode (CORS-open), so real-money
 * climbs ride the actual oracle the player minted against with no backend of
 * ours. We poll the latest `OraclePricesUpdated` for the oracle every couple of
 * seconds and hold the last spot between updates.
 */
export class LivePriceSource implements PriceSource {
  private spot: number | undefined;
  private subs = new Set<(t: Tick) => void>();
  private timer?: ReturnType<typeof setInterval>;
  private stopped = false;

  constructor(
    private readonly oracleId: string,
    private readonly client: SuiClient,
    seedSpot?: number,
  ) {
    this.spot = seedSpot;
  }

  current() {
    return this.spot;
  }

  subscribe(fn: (t: Tick) => void) {
    this.subs.add(fn);
    return () => this.subs.delete(fn);
  }

  start(intervalMs = 2000) {
    this.stopped = false;
    void this.poll();
    this.timer = setInterval(() => void this.poll(), intervalMs);
  }

  private async poll() {
    if (this.stopped) return;
    try {
      const tick = await latestPrice(this.client, this.oracleId);
      if (this.stopped || !tick) return;
      this.spot = tick.spot;
      const frame = { spot: tick.spot, t: Date.now() };
      for (const fn of this.subs) fn(frame);
    } catch {
      /* transient fullnode hiccup — keep the last spot */
    }
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
}
