import { useGame } from "./store";
import { Hud } from "./ui/Hud";
import { BootScreen } from "./ui/BootScreen";

export default function App() {
  const phase = useGame((s) => s.phase);

  return (
    <div className="crt mx-auto flex h-full max-w-md flex-col">
      <Hud />
      {phase === "BOOT" ? (
        <BootScreen />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="text-neon text-glow text-sm">{phase}</p>
          <p className="text-[10px] text-white/60">scene coming next…</p>
          <button className="arcade-btn text-xs" onClick={() => useGame.getState().setPhase("BOOT")}>
            ◀ BACK
          </button>
        </div>
      )}
    </div>
  );
}
