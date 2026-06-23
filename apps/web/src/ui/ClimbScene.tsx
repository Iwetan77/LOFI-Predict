import { useEffect, useState } from "react";
import { useGame } from "../store";
import { PixiClimb } from "../game/PixiClimb";
import { ErrorBoundary } from "./ErrorBoundary";
import { sfx } from "../game/audio";

/**
 * CLIMB: the live price drives LOFI up/down. The CASH OUT button shows the
 * bankable amount and reacts to how the round is going (calm → glow → frantic).
 * Falling-stone tension is conveyed with red flicker + shake when losing.
 * (PixiJS canvas replaces these placeholders in the climb-engine step.)
 */
export function ClimbScene() {
  const { direction, risk, prog, liveFloors, liveCashOut, spot, entrySpot, roundEndsAt, floor, cashOut } = useGame();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, []);

  const totalMs = 14_000;
  const remaining = Math.max(0, roundEndsAt - now);
  const remFrac = Math.min(1, remaining / totalMs);
  const winning = prog >= 0;
  const losing = prog < -0.15;
  const tension = remaining > 0 && remFrac < 0.25; // final seconds

  // heartbeat thud while the clock runs down
  useEffect(() => {
    if (!tension) return;
    const id = setInterval(() => sfx.heartbeat(), 600);
    return () => clearInterval(id);
  }, [tension]);

  const cashOutGlow = winning ? Math.min(1, 0.3 + prog) : 0.15;

  return (
    <div
      className="relative flex flex-1 flex-col px-4 py-3"
      style={{ animation: losing ? "shake 0.18s linear infinite" : undefined }}
    >
      {/* danger wash when losing / tension vignette in final seconds */}
      <div
        className="pointer-events-none absolute inset-0 z-0 transition-opacity"
        style={{
          background: losing
            ? "radial-gradient(circle at center, transparent 40%, rgba(255,40,40,0.35))"
            : "transparent",
          opacity: losing ? 0.6 + 0.4 * Math.abs(prog) : 0,
        }}
      />
      {tension && (
        <div
          className="pointer-events-none absolute inset-0 z-0"
          style={{ boxShadow: "inset 0 0 120px 40px rgba(0,0,0,0.7)" }}
        />
      )}

      {/* countdown */}
      <div className="z-10 mb-2">
        <div className="flex justify-between text-[10px]">
          <span className="text-white/70">{direction === "UP" ? "▲ UP" : "▼ DOWN"} · {risk.label}</span>
          <span className={tension ? "text-danger animate-blink" : "text-neon"}>{(remaining / 1000).toFixed(1)}s</span>
        </div>
        <div className="mt-1 h-2 w-full bg-white/10">
          <div className={`h-full ${tension ? "bg-danger" : "bg-neon"}`} style={{ width: `${remFrac * 100}%` }} />
        </div>
      </div>

      {/* the tower + LOFI — rendered on the PixiJS canvas */}
      <div className="z-10 relative flex-1 overflow-hidden border-2 border-white/15 bg-black/30">
        <ErrorBoundary>
          <PixiClimb />
        </ErrorBoundary>
        <div className="pointer-events-none absolute inset-x-0 top-1 z-10 text-center text-[9px] text-white/50">
          FLOOR {floor + liveFloors}
        </div>
      </div>

      <div className="z-10 mt-1 text-center text-[9px] text-white/50">
        ${spot.toFixed(0)} {spot >= entrySpot ? "▲" : "▼"} from ${entrySpot.toFixed(0)}
      </div>

      {/* CASH OUT — alive, reacts to PnL */}
      <button
        onClick={cashOut}
        className="z-10 mt-2 w-full border-b-4 border-black/40 py-4 text-sm uppercase tracking-wider text-ink transition-all active:translate-y-0.5"
        style={{
          background: winning ? "#ffd23f" : "#8a8597",
          boxShadow: `0 0 ${10 + cashOutGlow * 30}px rgba(255,210,63,${cashOutGlow})`,
          transform: winning && prog > 0.5 ? "scale(1.03)" : "scale(1)",
        }}
      >
        GRAB THE LEDGE · {liveCashOut}
      </button>
    </div>
  );
}
