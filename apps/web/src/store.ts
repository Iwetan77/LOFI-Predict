import { create } from "zustand";
import { FLOORS_PER_BUILDING, STARTING_LIVES, type Phase } from "./game/phases";
import {
  RISK_TIERS,
  cashOutValue,
  floorsClimbed,
  isWin,
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

interface GameState {
  phase: Phase;
  floor: number;
  lives: number;
  highScore: number;
  credits: number;
  playMoney: boolean;
  tutorialStep: number; // 0..3 during tutorial
  buildingTier: number; // visual tier, 1-based

  // --- active round ---
  token: string;
  direction: Direction;
  risk: RiskTier;
  stake: number;
  entrySpot: number;
  spot: number;
  roundEndsAt: number;
  prog: number; // signed progress, -1.2..1.2
  liveFloors: number; // floors climbed so far this round
  liveCashOut: number; // bankable now
  lastResult: RoundResult | null;

  // --- actions ---
  setPhase: (p: Phase) => void;
  pressStart: () => void;
  configure: (cfg: Partial<Pick<GameState, "token" | "direction" | "risk" | "stake">>) => void;
  armRound: (entrySpot: number) => void;
  startRound: (entrySpot: number, durationMs: number) => void;
  onTick: (spot: number) => void;
  cashOut: () => void;
  settle: () => void;
  nextRound: () => void;
  insertCoin: () => void; // tutorial -> real (CONNECT)
  restart: () => void;
  /** internal: fold a round result into floors/lives/credits and route on */
  applyResult: (r: RoundResult) => void;
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

  token: "BTC",
  direction: "UP",
  risk: RISK_TIERS[0],
  stake: 10,
  entrySpot: 0,
  spot: 0,
  roundEndsAt: 0,
  prog: 0,
  liveFloors: 0,
  liveCashOut: 0,
  lastResult: null,

  setPhase: (phase) => set({ phase }),

  pressStart: () => {
    const done = localStorage.getItem(TUTORIAL_KEY) === "1";
    set({ phase: done ? "PICK" : "TUTORIAL", playMoney: true, tutorialStep: 0 });
  },

  configure: (cfg) => set(cfg),

  // A brief "ready?" beat: LOFI stands on the ledge before the timer starts.
  armRound: (entrySpot) =>
    set({ phase: "ARMING", entrySpot, spot: entrySpot, prog: 0, liveFloors: 0, liveCashOut: get().stake }),

  startRound: (entrySpot, durationMs) =>
    set({
      phase: "CLIMB",
      entrySpot,
      spot: entrySpot,
      roundEndsAt: Date.now() + durationMs,
      prog: 0,
      liveFloors: 0,
      liveCashOut: get().stake,
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

  cashOut: () => {
    const { liveCashOut, liveFloors, stake } = get();
    set({ phase: "REDEEM" });
    // banked safely; no life lost
    get().applyResult({ outcome: "CASHOUT", floorsGained: liveFloors, credited: liveCashOut, staked: stake });
  },

  settle: () => {
    const { entrySpot, spot, direction, risk, stake } = get();
    const win = isWin(entrySpot, spot, direction);
    if (win) {
      get().applyResult({
        outcome: "WIN",
        floorsGained: risk.floorsPerWin,
        credited: Math.round(stake * (1 + risk.floorsPerWin * 0.2)),
        staked: stake,
      });
    } else {
      get().applyResult({ outcome: "LOSS", floorsGained: 0, credited: 0, staked: stake });
    }
  },

  // internal: fold a result into floors/lives/credits and route to summary/over
  applyResult: (r: RoundResult) => {
    const s = get();
    const lives = r.outcome === "LOSS" ? s.lives - 1 : s.lives;
    const floor = s.floor + r.floorsGained;
    const credits = Math.max(0, s.credits + r.credited - r.staked); // net: payout minus stake
    const highScore = Math.max(s.highScore, floor);
    localStorage.setItem(HIGH_SCORE_KEY, String(highScore));
    set({
      lastResult: r,
      lives,
      floor,
      credits,
      highScore,
      phase: lives <= 0 ? "GAME_OVER" : "SETTLE_SUMMARY",
    });
  },

  nextRound: () => {
    const s = get();
    // every FLOORS_PER_BUILDING floors, leap to a flashier skyscraper
    const tier = Math.floor(s.floor / FLOORS_PER_BUILDING) + 1;
    if (tier > s.buildingTier) {
      set({ buildingTier: tier, phase: "BUILDING_SWAP" });
      return;
    }
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
    }),
}));
