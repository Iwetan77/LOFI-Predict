import { useState } from "react";
import { useGame } from "../store";
import { RISK_TIERS, ROUND_MS } from "../game/round";
import { FuelUp } from "./FuelUp";

/**
 * The in-game "next call" menu — floats in the sky above LOFI between floors so
 * the run never cuts back to the home screen. Pick UP/DOWN + stake, then CONTINUE
 * to keep climbing or EXIT to leave with your winnings.
 */
export function NextMenu({ onContinue, onExit }: { onContinue: () => void; onExit: () => void }) {
  const { direction, risk, stake, credits, realMode, configure } = useGame();
  const [fueling, setFueling] = useState(false);
  const broke = realMode && stake > credits;

  return (
    <div
      className="pointer-events-auto absolute inset-x-0 top-0 z-20 flex flex-col gap-2 border-b-2 border-neon/40 p-3"
      style={{
        background: "linear-gradient(to bottom, rgba(7,3,22,0.96) 0%, rgba(7,3,22,0.9) 70%, rgba(7,3,22,0.78) 100%)",
        boxShadow: "0 6px 24px rgba(0,0,0,0.6)",
      }}
    >
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-gold text-glow">NEXT CALL</span>
        <span className="text-white">BAL ${credits.toFixed(realMode ? 2 : 0)}</span>
      </div>

      {fueling ? (
        <FuelUp onClose={() => setFueling(false)} />
      ) : (
        <>
          {/* UP / DOWN */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => configure({ direction: "UP" })}
              className={`border-b-4 border-black/40 py-3 text-sm ${direction === "UP" ? "bg-warm text-ink" : "bg-warm/15 text-warm"}`}
            >
              ▲ UP
            </button>
            <button
              onClick={() => configure({ direction: "DOWN" })}
              className={`border-b-4 border-black/40 py-3 text-sm ${direction === "DOWN" ? "bg-danger text-ink" : "bg-danger/15 text-danger"}`}
            >
              ▼ DOWN
            </button>
          </div>

          {/* risk + stake (compact) */}
          <div className="flex gap-1.5 text-[8px]">
            {RISK_TIERS.map((r) => (
              <button
                key={r.id}
                onClick={() => configure({ risk: r })}
                className={`flex-1 border py-1 ${risk.id === r.id ? "border-gold bg-gold/10 text-gold" : "border-white/25 text-white/80"}`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 text-[9px]">
            {[5, 10, 25].map((v) => (
              <button
                key={v}
                onClick={() => configure({ stake: v })}
                className={`flex-1 border-2 py-1 ${stake === v ? "border-neon bg-neon/10 text-neon" : "border-white/25 text-white/80"}`}
              >
                ${v}
              </button>
            ))}
            <div className="flex flex-1 items-center border-2 border-white/25 px-1.5 py-1 text-white">
              <span>$</span>
              <input
                type="number"
                min={1}
                value={stake}
                onChange={(e) => configure({ stake: Math.max(1, Math.floor(Number(e.target.value) || 0)) })}
                className="w-full bg-transparent text-center outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                aria-label="next stake"
              />
            </div>
          </div>

          <p className="text-center text-[8px] text-white/35">⏱ live for {Math.round(ROUND_MS / 1000)}s once you continue</p>

          {broke && (
            <p className="text-center text-[8px] text-danger">
              not enough credits — {realMode ? "fuel up to keep going." : "you're out."}
            </p>
          )}

          {/* actions */}
          <div className="flex gap-2">
            <button onClick={onExit} className="flex-1 border-2 border-white/20 py-2 text-[10px] text-white/70">
              ⏏ EXIT{realMode ? " (cash out)" : ""}
            </button>
            {realMode && (
              <button onClick={() => setFueling(true)} className="flex-1 border-2 border-gold/50 py-2 text-[10px] text-gold">
                ⛽ FUEL UP
              </button>
            )}
            <button
              onClick={onContinue}
              disabled={broke}
              className="arcade-btn flex-[1.4] py-2 text-xs disabled:opacity-40"
            >
              ▶ CONTINUE
            </button>
          </div>
        </>
      )}
    </div>
  );
}
