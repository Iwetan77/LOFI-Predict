/**
 * Pure round math. The "RISK dial" maps to how bold LOFI climbs: a bigger leap
 * climbs more floors on a win but needs a stronger move to get there (and the
 * cash-out value swings harder). On-chain this is strike distance from spot;
 * in play-money it is a sensitivity/payout curve that feels the same.
 */

export type Direction = "UP" | "DOWN";

/** How long a single UP/DOWN call stays live before it auto-banks. */
export const ROUND_MS = 60_000;

export interface RiskTier {
  id: string;
  label: string; // player-facing, no finance words
  floorsPerWin: number;
  /** how strongly price moves translate to progress (bigger = swingier) */
  sensitivity: number;
}

export const RISK_TIERS: RiskTier[] = [
  { id: "hop", label: "EASY HOP", floorsPerWin: 1, sensitivity: 900 },
  { id: "leap", label: "BIG LEAP", floorsPerWin: 3, sensitivity: 1600 },
  { id: "launch", label: "MOON SHOT", floorsPerWin: 6, sensitivity: 2600 },
];

/** Signed progress: >0 means the call is winning, <0 losing. Roughly [-1, +1]. */
export function progress(entry: number, spot: number, dir: Direction, sensitivity: number): number {
  const move = (spot - entry) / entry; // fractional price move
  const dirMove = dir === "UP" ? move : -move;
  return Math.max(-1.2, Math.min(1.2, dirMove * sensitivity));
}

/** Floors LOFI has climbed so far this round (0..floorsPerWin). */
export function floorsClimbed(p: number, floorsPerWin: number): number {
  return Math.max(0, Math.min(floorsPerWin, Math.round(p * floorsPerWin)));
}

/**
 * Bankable cash-out value right now: a flat bonus banked from every building
 * already cleared this call (`toppedBonus`), plus the live swing of the
 * building currently underway. One timer window can clear several buildings
 * before it ends, so the bonus compounds — but a fall forfeits the whole
 * call, banked buildings included.
 */
export function cashOutValue(stake: number, p: number, toppedBonus = 0): number {
  const mult = Math.max(0.05, 1 + toppedBonus + p);
  return Math.round(stake * mult);
}

/** Did the held-to-the-end call win? */
export function isWin(entry: number, finalSpot: number, dir: Direction): boolean {
  return dir === "UP" ? finalSpot > entry : finalSpot < entry;
}
