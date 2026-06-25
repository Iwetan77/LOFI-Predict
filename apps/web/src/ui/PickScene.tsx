import { useEffect, useRef, useState } from "react";
import { useGame } from "../store";
import { useSigner } from "../auth/useSigner";
import { RISK_TIERS, ROUND_MS } from "../game/round";
import { BtcChart } from "./BtcChart";
import { FuelUp } from "./FuelUp";

/**
 * PICK — the console. A live BTC chart you can read, then one call: how high
 * will LOFI climb? Choose how bold (multiplier), call UP/DOWN, set the stake.
 * No finance words.
 */
export function PickScene({ liveSpot, onGo }: { liveSpot: number; onGo: () => void }) {
  const { direction, risk, stake, credits, playMoney, realMode, managerId, setPhase } = useGame();
  const configure = useGame((s) => s.configure);
  const { send } = useSigner();
  const [cashingOut, setCashingOut] = useState(false);
  const [fueling, setFueling] = useState(false);

  // Pull the whole on-chain balance back to the wallet, then head home.
  const cashOutToWallet = async () => {
    if (!managerId || credits <= 0) {
      setPhase("BOOT");
      return;
    }
    setCashingOut(true);
    try {
      await send({ action: "withdraw", managerId, amount: String(Math.floor(credits * 1e6)) });
    } catch {
      /* leave it in the manager — it carries over next time */
    } finally {
      setCashingOut(false);
      setPhase("BOOT");
    }
  };

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
      {/* go again or leave */}
      <div className="flex items-center justify-between text-[9px]">
        <button className="text-white/45 hover:text-white" onClick={() => setPhase("BOOT")}>
          ⌂ HOME
        </button>
        {realMode && (
          <button className="text-gold/80 hover:text-gold disabled:opacity-40" onClick={cashOutToWallet} disabled={cashingOut}>
            {cashingOut ? "cashing out…" : "cash out to wallet ↗"}
          </button>
        )}
      </div>

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
      <div className="flex flex-col gap-1.5 text-[10px]">
        <div className="flex items-center justify-between">
          <span className="text-white/45">BAL ${credits.toFixed(playMoney ? 0 : 2)}</span>
          {realMode && (
            <button onClick={() => setFueling((f) => !f)} className="text-gold/80 hover:text-gold">
              ⛽ FUEL UP
            </button>
          )}
          <span className="text-white/45">STAKE</span>
        </div>
        {fueling && <FuelUp onClose={() => setFueling(false)} />}
        <div className="flex items-center gap-2">
          {[5, 10, 25].map((v) => (
            <button
              key={v}
              onClick={() => configure({ stake: v })}
              className={`flex-1 border-2 py-1.5 ${stake === v ? "border-neon text-neon" : "border-white/15 text-white/45"}`}
            >
              ${v}
            </button>
          ))}
          <div
            className={`flex flex-1 items-center border-2 px-2 py-1.5 ${
              ![5, 10, 25].includes(stake) ? "border-gold text-gold" : "border-white/15 text-white/45"
            }`}
          >
            <span>$</span>
            <input
              type="number"
              min={1}
              inputMode="numeric"
              value={stake}
              onChange={(e) => {
                const v = Math.max(1, Math.floor(Number(e.target.value) || 0));
                configure({ stake: Math.min(v, Math.max(1, Math.floor(credits))) });
              }}
              className="w-full bg-transparent text-center outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
              aria-label="custom stake"
            />
          </div>
        </div>
      </div>

      {/* INSERT COIN — the start control, as an arcade token */}
      <div className="flex flex-col items-center gap-1.5 pt-1">
        <button
          disabled={stake > credits}
          onClick={onGo}
          aria-label="start climb"
          className="group relative h-20 w-20 rounded-full transition-transform active:translate-y-0.5 active:scale-95 disabled:opacity-40"
          style={{
            background: "radial-gradient(circle at 35% 30%, #ffe89a 0%, #ffd23f 38%, #e6a417 70%, #b87a0c 100%)",
            boxShadow:
              "0 0 22px rgba(255,210,63,0.55), inset 0 2px 3px rgba(255,255,255,0.7), inset 0 -4px 6px rgba(120,70,0,0.55)",
            animation: stake > credits ? undefined : "floaty 2.4s ease-in-out infinite",
          }}
        >
          {/* embossed rim */}
          <span className="absolute inset-1.5 rounded-full border-2 border-[#b87a0c]/60" />
          {/* coin face: a climbing arrow + $ */}
          <span
            className="absolute inset-0 flex flex-col items-center justify-center leading-none text-[#7a4d00]"
            style={{ textShadow: "0 1px 0 rgba(255,255,255,0.5)" }}
          >
            <span className="text-lg">▲</span>
            <span className="text-base font-black">$</span>
          </span>
          {/* sweeping shine */}
          <span
            className="pointer-events-none absolute inset-0 rounded-full opacity-70"
            style={{
              background: "linear-gradient(115deg, transparent 40%, rgba(255,255,255,0.85) 50%, transparent 60%)",
              animation: stake > credits ? undefined : "coinShine 2.8s linear infinite",
            }}
          />
        </button>
        <div className="text-gold text-glow text-xs tracking-widest">START CLIMB</div>
        <p className="text-center text-[8px] text-white/40">
          stake ${stake} · climb to win up to ${Math.round(stake * (1 + risk.floorsPerWin * 0.2))}
        </p>
        <p className="text-center text-[8px] text-white/30">
          ⏱ this call is live for {Math.round(ROUND_MS / 1000)}s — grab the ledge anytime to bank it early
        </p>
      </div>
    </div>
  );
}
