/**
 * A price source feeds the climb a stream of spot prices. Two implementations:
 *
 *  - SimPriceSource: a self-contained random walk for the play-money tutorial
 *    and as an offline fallback. Always works, no network.
 *  - (live tape wiring lands with the API/zkLogin step; it implements the same
 *    PriceSource interface so the climb engine doesn't care where ticks come
 *    from.)
 */

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
