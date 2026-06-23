import { useGame } from "../store";

/** Title / attract screen. "PRESS START" gates into the play-money tutorial. */
export function BootScreen() {
  const pressStart = useGame((s) => s.pressStart);
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-10 px-6 text-center">
      <div className="animate-floaty">
        <h1 className="text-neon text-glow text-3xl sm:text-5xl leading-tight">
          LOFI
          <br />
          PREDICT
        </h1>
        <p className="mt-4 text-[10px] text-white/70 leading-relaxed">
          help lofi climb the tower.
          <br />
          call it right, climb higher.
        </p>
      </div>

      {/* placeholder yeti — real sprite drops into /art later */}
      <div
        className="h-24 w-24 bg-warm/80 border-4 border-black/50"
        style={{ imageRendering: "pixelated" }}
        aria-label="lofi placeholder"
      />

      <button className="arcade-btn text-sm animate-blink" onClick={pressStart}>
        ▶ PRESS START
      </button>
      <p className="text-[8px] text-white/40">INSERT COIN TO CONTINUE?</p>
    </div>
  );
}
