/**
 * The single source of truth for the round state machine (build prompt §6).
 * Each phase is a UI scene. Player-facing copy never uses finance words.
 */
export type Phase =
  | "BOOT"
  | "TUTORIAL" // play-money, 3 practice climbs
  | "CONNECT" // zkLogin / Google sign-in
  | "FUND" // "load credits" (deposit DUSDC), one-time
  | "PICK" // choose building + RISK + UP/DOWN + stake
  | "ARMING" // submit mint tx, optimistic UI
  | "CLIMB" // live tape drives the yeti; cash-out available
  | "REDEEM" // cash-out tx in flight
  | "SETTLE" // oracle settled: reached floor or fell
  | "SETTLE_SUMMARY" // result; one tap to PICK again
  | "BUILDING_SWAP" // every 20 floors, leap to a new skyscraper
  | "GAME_OVER"; // lives == 0

export const FLOORS_PER_BUILDING = 20;
export const STARTING_LIVES = 3;
