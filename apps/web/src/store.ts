import { create } from "zustand";
import { STARTING_LIVES, type Phase } from "./game/phases";
import {
  RISK_TIERS,
  cashOutValue,
  floorsClimbed,
  progress,
  type Direction,
  type RiskTier,
} from "./game/round";

const HIGH_SCORE_KEY = "lofi.highscore";
const TUTORIAL_KEY = "lofi.tutorialDone";

export interface RoundResult {
  outcome: "WIN" | "LOSS" | "CASHOUT";
  floorsGained: number;
  credited: number;
  staked: number;
}

/** The on-chain market key the active real climb minted against. */
export interface ActiveMarket {
  oracleId: string;
  expiry: number;
  strike: string;
  isUp: boolean;
}

interface GameState {
  phase: Phase;
  floor: number;
  lives: number;
  highScore: number;
  credits: number;
  playMoney: boolean;
  tutorialStep: number; // 0..3 during tutorial
  buildingTier: number; // visual tier, 1-based

  // --- real-money (on-chain) mode ---
  realMode: boolean; // true once signed in + a manager exists
  address: string | null; // the player's zkLogin address (for the wallet chip)
  managerId: string | null; // the player's PredictManager
  market: ActiveMarket | null; // active round's market (for redeem)
  txStatus: "idle" | "pending" | "error";
  txError: string | null;
  lastDigest: string | null;

  // --- active round ---
  token: string;
  direction: Direction;
  risk: RiskTier;
  stake: number;
  entrySpot: number;
  spot: number;
  prog: number; // signed progress, -1.2..1.2
  liveFloors: number; // floors climbed so far this round
  liveCashOut: number; // bankable now
  lastResult: RoundResult | null;
  /** PixiClimb signals the moment LOFI tops the tower / falls off. */
  pendingOutcome: "TOP" | "FALL" | null;

  // --- actions ---
  setPhase: (p: Phase) => void;
  pressStart: () => void;
  configure: (cfg: Partial<Pick<GameState, "token" | "direction" | "risk" | "stake">>) => void;
  armRound: (entrySpot: number) => void;
  startRound: (entrySpot: number) => void;
  onTick: (spot: number) => void;
  signalOutcome: (o: "TOP" | "FALL" | null) => void;
  nextRound: () => void;
  insertCoin: () => void; // tutorial -> real (CONNECT)
  restart: () => void;
  /** Fold a round result into floors/lives/credits; returns the new life count.
   * Routing happens in the engine. In real mode pass `chainCredits` to set
   * credits from the on-chain balance instead of play-money arithmetic. */
  applyResult: (r: RoundResult, chainCredits?: number) => number;

  // --- real-money actions ---
  enterReal: (managerId: string, credits: number, address: string) => void;
  setMarket: (m: ActiveMarket | null) => void;
  setTx: (status: GameState["txStatus"], error?: string | null, digest?: string | null) => void;
  syncBalance: (credits: number) => void;
}

export const useGame = create<GameState>((set, get) => ({
  phase: "BOOT",
  floor: 0,
  lives: STARTING_LIVES,
  highScore: Number(localStorage.getItem(HIGH_SCORE_KEY) ?? 0),
  credits: 100, // play-money starting credits
  playMoney: true,
  tutorialStep: 0,
  buildingTier: 1,

  realMode: false,
  address: null,
  managerId: null,
  market: null,
  txStatus: "idle",
  txError: null,
  lastDigest: null,

  token: "BTC",
  direction: "UP",
  risk: RISK_TIERS[0],
  stake: 10,
  entrySpot: 0,
  spot: 0,
  prog: 0,
  liveFloors: 0,
  liveCashOut: 0,
  lastResult: null,
  pendingOutcome: null,

  setPhase: (phase) => set({ phase }),

  pressStart: () => {
    const done = localStorage.getItem(TUTORIAL_KEY) === "1";
    set({ phase: done ? "PICK" : "TUTORIAL", playMoney: true, tutorialStep: 0 });
  },

  configure: (cfg) => set(cfg),

  // A brief "ready?" beat before the climb (covers the real-money mint).
  armRound: (entrySpot) =>
    set({ phase: "ARMING", entrySpot, spot: entrySpot, prog: 0, liveFloors: 0, liveCashOut: get().stake, pendingOutcome: null }),

  startRound: (entrySpot) =>
    set({
      phase: "CLIMB",
      entrySpot,
      spot: entrySpot,
      prog: 0,
      liveFloors: 0,
      liveCashOut: get().stake,
      pendingOutcome: null,
    }),

  onTick: (spot) => {
    const { entrySpot, direction, risk, stake, phase } = get();
    if (phase !== "CLIMB" || !entrySpot) return;
    const p = progress(entrySpot, spot, direction, risk.sensitivity);
    set({
      spot,
      prog: p,
      liveFloors: floorsClimbed(p, risk.floorsPerWin),
      liveCashOut: cashOutValue(stake, p),
    });
  },

  signalOutcome: (pendingOutcome) => set({ pendingOutcome }),

  // Fold a result into floors/lives/credits; the engine routes afterward.
  // A win tops a tower, so LOFI moves to the next building.
  applyResult: (r: RoundResult, chainCredits?: number) => {
    const s = get();
    const lives = r.outcome === "LOSS" ? s.lives - 1 : s.lives;
    const floor = s.floor + r.floorsGained;
    const buildingTier = r.outcome === "WIN" ? s.buildingTier + 1 : s.buildingTier;
    // Real mode: credits mirror the on-chain DUSDC balance (keep cents). Play
    // mode: net play-money arithmetic.
    const credits = chainCredits != null ? Math.max(0, chainCredits) : Math.max(0, s.credits + r.credited - r.staked);
    const highScore = Math.max(s.highScore, floor);
    localStorage.setItem(HIGH_SCORE_KEY, String(highScore));
    set({ lastResult: r, lives, floor, credits, highScore, buildingTier });
    return lives;
  },

  nextRound: () => {
    const s = get();
    // tutorial advances through 3 practice climbs, then gates to INSERT COIN
    if (s.playMoney && !localStorage.getItem("lofi.tutorialDone")) {
      const step = s.tutorialStep + 1;
      if (step >= 3) {
        localStorage.setItem("lofi.tutorialDone", "1");
        set({ phase: "CONNECT", tutorialStep: step });
        return;
      }
      set({ tutorialStep: step });
    }
    set({ phase: "PICK" });
  },

  insertCoin: () => set({ phase: "CONNECT" }),

  restart: () =>
    set({
      phase: "PICK",
      floor: 0,
      lives: STARTING_LIVES,
      buildingTier: 1,
      credits: get().playMoney ? 100 : get().credits,
      lastResult: null,
      market: null,
      txStatus: "idle",
      txError: null,
    }),

  // Switch the game into real on-chain climbs (signed in + manager ready).
  enterReal: (managerId, credits, address) =>
    set({ realMode: true, playMoney: false, managerId, address, credits: Math.max(0, credits) }),

  setMarket: (market) => set({ market }),

  setTx: (txStatus, txError = null, digest) =>
    set((s) => ({ txStatus, txError, lastDigest: digest ?? s.lastDigest })),

  syncBalance: (credits) => set({ credits: Math.max(0, credits) }),
}));
