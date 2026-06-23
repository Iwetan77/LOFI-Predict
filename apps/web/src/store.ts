import { create } from "zustand";
import { STARTING_LIVES, type Phase } from "./game/phases";

/**
 * Minimal game store for the shell. The full round transitions (ARMING/CLIMB/
 * REDEEM/SETTLE wiring to chain) land with the state-machine + tx steps.
 */
interface GameState {
  phase: Phase;
  floor: number;
  lives: number;
  highScore: number;
  /** play-money during tutorial; real DUSDC credits after FUND */
  credits: number;
  playMoney: boolean;

  setPhase: (p: Phase) => void;
  pressStart: () => void;
  reset: () => void;
}

const HIGH_SCORE_KEY = "lofi.highscore";

export const useGame = create<GameState>((set) => ({
  phase: "BOOT",
  floor: 0,
  lives: STARTING_LIVES,
  highScore: Number(localStorage.getItem(HIGH_SCORE_KEY) ?? 0),
  credits: 0,
  playMoney: true,

  setPhase: (phase) => set({ phase }),
  // First launch always drops into the play-money tutorial (build prompt §2).
  pressStart: () => set({ phase: "TUTORIAL", playMoney: true }),
  reset: () =>
    set({ phase: "PICK", floor: 0, lives: STARTING_LIVES }),
}));
