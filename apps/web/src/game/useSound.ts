import { useEffect } from "react";
import { useGame } from "../store";
import { sfx, buzz } from "./audio";

/**
 * Subscribes to the store and fires audio + haptics on the moments that matter:
 * a climbed floor, a slip, and the settle/cash-out/fall outcomes. Mount once.
 */
export function useSound() {
  useEffect(() => {
    // Unlock the audio context on the first user gesture (e.g. PRESS START).
    const unlock = () => sfx.unlock();
    window.addEventListener("pointerdown", unlock, { once: true });

    let prevFloors = 0;
    let wasLosing = false;
    let prevPhase = useGame.getState().phase;

    const unsub = useGame.subscribe((s) => {
      // climbed a floor this round
      if (s.phase === "CLIMB" && s.liveFloors > prevFloors) {
        sfx.floorUp(s.floor + s.liveFloors);
        buzz(15);
      }
      prevFloors = s.phase === "CLIMB" ? s.liveFloors : 0;

      // slipped into the danger zone
      const losing = s.phase === "CLIMB" && s.prog < -0.15;
      if (losing && !wasLosing) sfx.slip();
      wasLosing = losing;

      // music kicks in only once a climb actually starts — not on menus/landing.
      const climbing = s.phase === "ARMING" || s.phase === "CLIMB" || s.phase === "REDEEM";
      if (climbing) sfx.startMusic();
      else sfx.stopMusic();

      // outcome transitions
      if (s.phase !== prevPhase) {
        if (s.phase === "SETTLE_SUMMARY" && s.lastResult) {
          if (s.lastResult.outcome === "WIN") {
            sfx.cheer();
            buzz([20, 40, 20]);
          } else if (s.lastResult.outcome === "CASHOUT") {
            sfx.coin();
            buzz(30);
          } else {
            sfx.fall();
            buzz([60, 30, 60]);
          }
        } else if (s.phase === "GAME_OVER") {
          sfx.fall();
          buzz([80, 40, 120]);
        }
        prevPhase = s.phase;
      }
    });

    return () => {
      window.removeEventListener("pointerdown", unlock);
      unsub();
    };
  }, []);
}
