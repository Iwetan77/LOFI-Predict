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
 * Live BTC tape from the relay's `/live` WebSocket. Subscribes to one oracle and
 * emits real price ticks. Used by real-money climbs so the yeti rises and falls
 * with the actual market the player minted against. If the socket drops, the
 * last spot is held until it reconnects.
 */
export class LivePriceSource implements PriceSource {
  private spot: number | undefined;
  private subs = new Set<(t: Tick) => void>();
  private ws?: WebSocket;
  private closed = false;
  private reconnectT?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly oracleId: string,
    private readonly apiBase: string,
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

  start() {
    this.closed = false;
    this.connect();
  }

  private connect() {
    if (this.closed) return;
    const url = this.apiBase.replace(/^http/, "ws") + "/live";
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onopen = () => ws.send(JSON.stringify({ subscribe: this.oracleId }));
    ws.onmessage = (ev) => {
      try {
        const m = JSON.parse(ev.data);
        if (m.type === "price" && typeof m.spot === "number") {
          this.spot = m.spot;
          const tick = { spot: m.spot, t: Date.now() };
          for (const fn of this.subs) fn(tick);
        }
      } catch {
        /* ignore malformed frames */
      }
    };
    ws.onclose = () => {
      if (this.closed) return;
      this.reconnectT = setTimeout(() => this.connect(), 1500);
    };
    ws.onerror = () => ws.close();
  }

  stop() {
    this.closed = true;
    if (this.reconnectT) clearTimeout(this.reconnectT);
    this.ws?.close();
    this.ws = undefined;
  }
}
