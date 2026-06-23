import { useGame } from "../store";
import { RISK_TIERS } from "../game/round";

/** PICK: choose token, RISK (how bold), UP/DOWN, stake. No finance words. */
export function PickScene({ liveSpot, onGo }: { liveSpot: number; onGo: () => void }) {
  const { token, direction, risk, stake, credits, configure } = useGame();
  const tokens = ["BTC"]; // only BTC is live on testnet; data-driven for future

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-3">
      <p className="text-center text-[10px] text-white/70">WHICH TOWER WILL LOFI CLIMB?</p>

      <div className="flex justify-center gap-2">
        {tokens.map((t) => (
          <button
            key={t}
            onClick={() => configure({ token: t })}
            className={`pixel-panel text-xs ${token === t ? "text-neon" : "text-white/50"}`}
          >
            {t}
            <div className="mt-1 text-[8px] text-white/60">${liveSpot.toFixed(0)}</div>
          </button>
        ))}
      </div>

      <div>
        <p className="mb-1 text-[10px] text-gold">HOW HIGH WILL LOFI JUMP?</p>
        <div className="grid grid-cols-3 gap-2">
          {RISK_TIERS.map((r) => (
            <button
              key={r.id}
              onClick={() => configure({ risk: r })}
              className={`border-2 px-1 py-2 text-[8px] ${risk.id === r.id ? "border-gold text-gold" : "border-white/20 text-white/60"}`}
            >
              {r.label}
              <div className="mt-1 text-white/50">+{r.floorsPerWin}🏢</div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1 text-[10px] text-white/70">WILL THE PRICE GO…</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => configure({ direction: "UP" })}
            className={`py-4 text-sm ${direction === "UP" ? "bg-warm text-ink" : "bg-warm/20 text-warm"}`}
          >
            ▲ UP
          </button>
          <button
            onClick={() => configure({ direction: "DOWN" })}
            className={`py-4 text-sm ${direction === "DOWN" ? "bg-danger text-ink" : "bg-danger/20 text-danger"}`}
          >
            ▼ DOWN
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between text-[10px]">
        <span className="text-white/70">STAKE</span>
        <div className="flex items-center gap-2">
          {[5, 10, 25].map((v) => (
            <button
              key={v}
              onClick={() => configure({ stake: v })}
              className={`border-2 px-2 py-1 ${stake === v ? "border-neon text-neon" : "border-white/20 text-white/50"}`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      <button
        disabled={stake > credits}
        onClick={onGo}
        className="arcade-btn mt-1 text-sm disabled:opacity-40"
      >
        ▶ CLIMB!
      </button>
      <p className="text-center text-[8px] text-white/40">
        play {stake} · win up to {Math.round(stake * (1 + risk.floorsPerWin * 0.2))}
      </p>
    </div>
  );
}
