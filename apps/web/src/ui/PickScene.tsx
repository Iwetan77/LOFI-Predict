import { useEffect, useRef, useState } from "react";
import { useGame } from "../store";
import { RISK_TIERS } from "../game/round";
import { BtcChart } from "./BtcChart";

/**
 * PICK — the console. A live BTC chart you can read, then one call: how high
 * will LOFI climb? Choose how bold (multiplier), call UP/DOWN, set the stake.
 * No finance words.
 */
export function PickScene({ liveSpot, onGo }: { liveSpot: number; onGo: () => void }) {
  const { direction, risk, stake, credits, configure } = useGame();

  // rolling price history for the chart
  const [hist, setHist] = useState<number[]>([]);
  const last = useRef(0);
  useEffect(() => {
    if (liveSpot && liveSpot !== last.current) {
      last.current = liveSpot;
      setHist((h) => {
        const n = [...h, liveSpot];
        return n.length > 60 ? n.slice(-60) : n;
      });
    }
  }, [liveSpot]);

  const change = hist.length > 1 ? ((liveSpot - hist[0]) / hist[0]) * 100 : 0;
  const up = change >= 0;

  return (
    <div
      className="flex flex-1 flex-col gap-3 overflow-y-auto px-3 py-3"
      style={{
        backgroundImage:
          "linear-gradient(rgba(11,4,32,0.72),rgba(11,4,32,0.92)), url(/art/building_tier3.png), url(/art/sky.jpg)",
        backgroundSize: "cover, 70% auto, cover",
        backgroundPosition: "center, bottom center, center",
        backgroundRepeat: "no-repeat",
      }}
    >
      {/* chart console */}
      <div className="border-2 border-neon/30 bg-black/50 p-3" style={{ boxShadow: "inset 0 0 18px rgba(61,245,255,0.08)" }}>
        <div className="mb-1 flex items-end justify-between">
          <div className="flex items-center gap-2">
            <img src="/art/token_btc.svg" alt="" className="h-6 w-6" />
            <div>
              <div className="text-[8px] text-white/50">BITCOIN</div>
              <div className="text-base text-white">${liveSpot.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
            </div>
          </div>
          <div className={`text-[10px] ${up ? "text-warm" : "text-danger"}`}>
            {up ? "▲" : "▼"} {Math.abs(change).toFixed(2)}%
          </div>
        </div>
        <BtcChart history={hist} />
      </div>

      <p className="text-center text-[11px] text-gold text-glow">HOW HIGH WILL LOFI CLIMB?</p>

      {/* RISK = how bold the climb (a multiplier feel) */}
      <div className="grid grid-cols-3 gap-2">
        {RISK_TIERS.map((r) => {
          const sel = risk.id === r.id;
          return (
            <button
              key={r.id}
              onClick={() => configure({ risk: r })}
              className={`flex flex-col items-center border-2 py-2 text-[8px] transition-all ${
                sel ? "border-gold bg-gold/10 text-gold" : "border-white/15 text-white/55"
              }`}
            >
              {r.label}
              <span className="mt-1 text-[11px]">x{(1 + r.floorsPerWin * 0.2).toFixed(1)}</span>
              <span className="mt-0.5 text-white/40">+{r.floorsPerWin} floors</span>
            </button>
          );
        })}
      </div>

      {/* the call */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => configure({ direction: "UP" })}
          className={`border-b-4 border-black/40 py-5 text-base transition-all active:translate-y-0.5 ${
            direction === "UP" ? "bg-warm text-ink" : "bg-warm/15 text-warm"
          }`}
          style={direction === "UP" ? { boxShadow: "0 0 18px rgba(57,255,139,0.5)" } : undefined}
        >
          ▲ UP
        </button>
        <button
          onClick={() => configure({ direction: "DOWN" })}
          className={`border-b-4 border-black/40 py-5 text-base transition-all active:translate-y-0.5 ${
            direction === "DOWN" ? "bg-danger text-ink" : "bg-danger/15 text-danger"
          }`}
          style={direction === "DOWN" ? { boxShadow: "0 0 18px rgba(255,77,77,0.5)" } : undefined}
        >
          ▼ DOWN
        </button>
      </div>

      {/* stake + balance */}
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-white/45">CREDITS {credits}</span>
        <div className="flex items-center gap-2">
          <span className="text-white/45">STAKE</span>
          {[5, 10, 25].map((v) => (
            <button
              key={v}
              onClick={() => configure({ stake: v })}
              className={`border-2 px-2 py-1 ${stake === v ? "border-neon text-neon" : "border-white/15 text-white/45"}`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      <button disabled={stake > credits} onClick={onGo} className="arcade-btn text-sm disabled:opacity-40">
        ▶ START CLIMB
      </button>
      <p className="-mt-1 text-center text-[8px] text-white/40">
        stake {stake} · climb to win up to {Math.round(stake * (1 + risk.floorsPerWin * 0.2))}
      </p>
    </div>
  );
}
