import { useEffect, useState } from "react";
import { useGame } from "../store";
import { PixiClimb } from "../game/PixiClimb";
import { ErrorBoundary } from "./ErrorBoundary";
import { NextMenu } from "./NextMenu";
import { sfx } from "../game/audio";

/**
 * CLIMB: the live price drives LOFI up the tower. Each call auto-banks when
 * its clock runs out (see ROUND_MS / useEngine), so the climb until he tops
 * out (win → fly to the next building), gets knocked off (lose a life), or
 * the player grabs the ledge to bank it early. The RESOLVE beat shows the
 * outcome before the in-game menu returns.
 */
export function ClimbScene({
  onCashOut,
  onContinue,
  onExit,
  onCancelArm,
}: {
  onCashOut: () => void;
  onContinue: () => void;
  onExit: () => void;
  onCancelArm: () => void;
}) {
  const {
    phase,
    direction,
    risk,
    prog,
    liveFloors,
    liveCashOut,
    spot,
    entrySpot,
    floor,
    txStatus,
    txError,
    realMode,
    lastResult,
    roundEndsAt,
  } = useGame();
  const arming = phase === "ARMING";
  const resolving = phase === "RESOLVE";
  const choosing = phase === "NEXT";
  const redeeming = phase === "REDEEM" || txStatus === "pending";

  const winning = prog >= 0;
  const losing = prog < -0.15;
  const failing = prog < -0.6; // close to being knocked off

  // heartbeat thud when the call is going badly
  useEffect(() => {
    if (!failing || phase !== "CLIMB") return;
    const id = setInterval(() => sfx.heartbeat(), 650);
    return () => clearInterval(id);
  }, [failing, phase]);

  // The clock this call is live for — ticks every quarter-second so players
  // always know the window they're climbing for, without us ever saying
  // "expiry"/"strike"/anything that reads as a finance term.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (phase !== "CLIMB") return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [phase]);
  const secsLeft = Math.max(0, Math.ceil((roundEndsAt - now) / 1000));
  const clockLabel = `${Math.floor(secsLeft / 60)}:${String(secsLeft % 60).padStart(2, "0")}`;

  const cashOutGlow = winning ? Math.min(1, 0.3 + prog) : 0.15;
  // altitude/momentum bar: centred at 0, fills toward the top as the call wins.
  const climbFrac = Math.max(0, Math.min(1, (prog + 0.2) / 1.2));

  return (
    <div className="relative flex flex-1 flex-col px-4 py-3">
      {/* danger wash when the call is going against you */}
      <div
        className="pointer-events-none absolute inset-0 z-0 transition-opacity"
        style={{
          background: losing
            ? "radial-gradient(circle at center, transparent 40%, rgba(255,40,40,0.32))"
            : "transparent",
          opacity: losing ? 0.5 + 0.5 * Math.min(1, Math.abs(prog)) : 0,
        }}
      />

      {/* header: the call + how long it's live for + a climb-progress bar */}
      {!choosing && (
        <div className="z-10 mb-2">
          <div className="flex justify-between text-[10px]">
            <span className="text-white/70">
              {direction === "UP" ? "▲ UP" : "▼ DOWN"} · {risk.label}
            </span>
            <span className={failing ? "text-danger animate-blink" : winning ? "text-warm" : "text-white/60"}>
              {arming ? "READY?" : resolving ? "—" : winning ? "CLIMBING" : "SLIPPING"}
            </span>
          </div>
          {!arming && !resolving && (
            <div className="mt-0.5 flex justify-center">
              <span
                className={`text-[9px] tracking-widest ${secsLeft <= 10 ? "text-danger animate-blink" : "text-white/45"}`}
              >
                ⏱ {clockLabel} LEFT ON THIS CALL
              </span>
            </div>
          )}
          <div className="mt-1 h-2 w-full bg-white/10">
            <div
              className="h-full transition-all"
              style={{ width: `${arming ? 0 : climbFrac * 100}%`, background: winning ? "#39ff8b" : "#ff4d4d" }}
            />
          </div>
        </div>
      )}

      {/* the tower + LOFI */}
      <div className="z-10 relative flex-1 overflow-hidden border-2 border-white/15 bg-black/30">
        <ErrorBoundary>
          <PixiClimb />
        </ErrorBoundary>
        <div className="pointer-events-none absolute inset-x-0 top-1 z-10 text-center text-[9px] text-white/50">
          FLOOR {floor + liveFloors}
        </div>
        {arming && (
          <div className="absolute inset-x-0 bottom-2 z-10 flex flex-col items-center gap-1 px-4">
            <span className="text-gold text-glow animate-blink text-[10px] tracking-widest">
              {realMode ? "CONFIRM IN YOUR WALLET…" : "READYING…"}
            </span>
            {realMode && (
              <span className="text-center text-[8px] leading-snug text-white/45">
                opening your climb on-chain — approve the popup
              </span>
            )}
            {/* Escape hatch: the wallet may not have prompted, or the network
                stalled. Don't trap the player on this screen. */}
            <button
              onClick={onCancelArm}
              className="pointer-events-auto mt-0.5 rounded border border-white/20 px-2 py-0.5 text-[8px] text-white/60 hover:text-white"
            >
              ✕ cancel
            </button>
          </div>
        )}
        {/* a failed mint/redeem bounces back with a reason instead of a silent hang */}
        {txStatus === "error" && txError && (phase === "CLIMB" || phase === "ARMING") && (
          <div className="pointer-events-none absolute inset-x-0 top-6 z-10 flex justify-center px-4">
            <span className="rounded bg-danger/80 px-2 py-0.5 text-center text-[9px] text-white">{txError}</span>
          </div>
        )}
        {/* outcome banner — up in the sky so it never sits over the building */}
        {resolving && lastResult && (
          <div className="pointer-events-none absolute inset-x-0 top-6 z-10 flex flex-col items-center gap-1">
            <span
              className="text-glow rounded bg-black/45 px-2 py-0.5 text-lg"
              style={{ color: lastResult.outcome === "LOSS" ? "#ff4d4d" : "#39ff8b" }}
            >
              {lastResult.outcome === "LOSS"
                ? "LOFI FELL!"
                : lastResult.auto
                  ? "TIME'S UP — BANKED!"
                  : "LEDGE GRABBED!"}
            </span>
            {lastResult.outcome !== "LOSS" && (
              <span className="text-gold rounded bg-black/45 px-2 text-[10px]">+{lastResult.floorsGained} 🏢</span>
            )}
          </div>
        )}
        {/* in-game next-call menu, floating in the sky */}
        {choosing && <NextMenu onContinue={onContinue} onExit={onExit} />}
      </div>

      {!choosing && (
        <div className="z-10 mt-1 text-center text-[9px] text-white/50">
          ${spot.toFixed(0)} {spot >= entrySpot ? "▲" : "▼"} from ${entrySpot.toFixed(0)}
        </div>
      )}

      {/* CASH OUT — alive, reacts to PnL. Shows the real $ you'd bank now. */}
      {!choosing && (
      <button
        onClick={onCashOut}
        disabled={arming || resolving || redeeming}
        className="z-10 mt-2 flex w-full items-center justify-between rounded-xl border border-white/15 px-4 py-3 transition-all active:translate-y-0.5 disabled:opacity-60"
        style={{
          background:
            arming || resolving || redeeming ? "rgba(90,85,102,0.5)" : winning ? "rgba(255,210,63,0.14)" : "rgba(138,133,151,0.14)",
          boxShadow: arming || resolving || redeeming ? "none" : `0 0 ${8 + cashOutGlow * 26}px rgba(255,210,63,${cashOutGlow})`,
          borderColor: winning && !arming && !resolving && !redeeming ? "rgba(255,210,63,0.5)" : "rgba(255,255,255,0.15)",
        }}
      >
        <span className="flex flex-col items-start leading-none">
          <span className="text-[8px] uppercase tracking-[0.2em] text-white/55">
            {arming ? "steady…" : resolving ? "—" : redeeming ? "grabbing…" : "grab the ledge"}
          </span>
          <span className="mt-1 text-[9px] text-white/40">cash out now</span>
        </span>
        <span
          className="flex items-center gap-1.5 text-lg font-black"
          style={{
            color: winning && !arming && !resolving && !redeeming ? "#ffd23f" : "#cfcbd8",
            textShadow: winning && !arming && !resolving && !redeeming ? "0 0 10px rgba(255,210,63,0.6)" : "none",
          }}
        >
          💵 ${liveCashOut.toFixed(2)}
        </span>
      </button>
      )}
    </div>
  );
}
