/**
 * In-memory leaderboard (highest floor reached). No DB for v1; swap for Redis
 * later if needed. Holds only public game scores, never funds or secrets.
 */

export interface Score {
  name: string;
  floor: number;
  at: number;
}

export class Leaderboard {
  private best = new Map<string, Score>();

  submit(name: string, floor: number): Score {
    const clean = name.trim().slice(0, 12) || "LOFI";
    const prev = this.best.get(clean);
    if (!prev || floor > prev.floor) {
      this.best.set(clean, { name: clean, floor, at: Date.now() });
    }
    return this.best.get(clean)!;
  }

  top(n = 20): Score[] {
    return [...this.best.values()].sort((a, b) => b.floor - a.floor).slice(0, n);
  }
}
