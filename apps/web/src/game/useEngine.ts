import { useEffect, useRef, useState } from "react";
import { useGame } from "../store";
import { SimPriceSource } from "./priceSource";

/** Play-money round length (arcade-short). On-chain rounds use the real expiry. */
export const ROUND_MS = 14_000;

/**
 * Wires a price source into the store: keeps a live spot for the PICK screen,
 * feeds ticks to the active climb, and auto-settles when the timer hits zero.
 * Call once near the app root.
 */
export function useEngine() {
  const srcRef = useRef<SimPriceSource>();
  const [liveSpot, setLiveSpot] = useState(62000);

  if (!srcRef.current) srcRef.current = new SimPriceSource(62000);

  useEffect(() => {
    const src = srcRef.current!;
    src.start();
    const off = src.subscribe((tick) => {
      setLiveSpot(tick.spot);
      const st = useGame.getState();
      if (st.phase === "CLIMB") st.onTick(tick.spot);
    });
    return () => {
      off();
      src.stop();
    };
  }, []);

  // countdown -> settle
  useEffect(() => {
    const id = setInterval(() => {
      const st = useGame.getState();
      if (st.phase === "CLIMB" && Date.now() >= st.roundEndsAt) st.settle();
    }, 120);
    return () => clearInterval(id);
  }, []);

  return { liveSpot, startRound: () => useGame.getState().startRound(srcRef.current!.current() ?? 62000, ROUND_MS) };
}
