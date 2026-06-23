import { useGame } from "../store";

/** Brief play-money intro before the first practice climbs. */
export function TutorialScene() {
  const setPhase = useGame((s) => s.setPhase);
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-8 text-center">
      <h2 className="text-neon text-glow text-lg">PRACTICE CLIMB</h2>
      <p className="text-[10px] leading-relaxed text-white/75">
        pick a tower. call UP or DOWN.
        <br />
        if you're right, lofi climbs.
        <br />
        grab the ledge any time to bank it.
      </p>
      <p className="text-[8px] text-gold">3 free climbs · play money</p>
      <button className="arcade-btn text-sm" onClick={() => setPhase("PICK")}>
        ▶ GO
      </button>
    </div>
  );
}

export function SummaryScene({ onNext }: { onNext: () => void }) {
  const { lastResult, floor, lives } = useGame();
  if (!lastResult) return null;
  const { outcome, floorsGained, credited, staked } = lastResult;
  const net = credited - staked;
  const win = outcome !== "LOSS";
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 px-8 text-center">
      <h2 className={`text-glow text-xl ${win ? "text-warm" : "text-danger"}`}>
        {outcome === "WIN" ? "FLOOR REACHED!" : outcome === "CASHOUT" ? "LEDGE GRABBED!" : "LOFI FELL!"}
      </h2>
      {win ? (
        <p className="text-sm text-white">+{floorsGained} 🏢 · FLOOR {floor}</p>
      ) : (
        <p className="text-sm text-white">lost a life · {"♥".repeat(lives)}</p>
      )}
      <p className={`text-[10px] ${net >= 0 ? "text-warm" : "text-danger"}`}>
        {net >= 0 ? "+" : ""}
        {net} credits
      </p>
      <button className="arcade-btn text-sm" onClick={onNext}>
        ▶ ONE MORE
      </button>
    </div>
  );
}

export function BuildingSwapScene({ onNext }: { onNext: () => void }) {
  const tier = useGame((s) => s.buildingTier);
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-8 text-center">
      <h2 className="text-gold text-glow text-lg animate-floaty">NEW SKYLINE!</h2>
      <p className="text-[10px] text-white/75">lofi leaps to a flashier tower.</p>
      <div className="text-3xl">🏙️ → 🌃</div>
      <p className="text-[8px] text-white/50">building tier {tier}</p>
      <button className="arcade-btn text-sm" onClick={onNext}>
        ▶ KEEP CLIMBING
      </button>
    </div>
  );
}

export function GameOverScene() {
  const { floor, highScore, restart } = useGame();
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-8 text-center">
      <h2 className="text-danger text-glow text-2xl">GAME OVER</h2>
      <p className="text-sm text-white">FINAL HEIGHT · FLOOR {floor}</p>
      <p className="text-[10px] text-gold">HIGH SCORE {highScore}</p>
      <button className="arcade-btn text-sm animate-blink" onClick={restart}>
        ▶ INSERT COIN TO CONTINUE?
      </button>
    </div>
  );
}

/** Placeholder for the zkLogin / load-credits step (wired in the next stage). */
export function ConnectScene() {
  const setPhase = useGame((s) => s.setPhase);
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-8 text-center">
      <h2 className="text-neon text-glow text-lg">INSERT COIN</h2>
      <p className="text-[10px] leading-relaxed text-white/75">
        nice climbing! real climbs sign in with google
        <br />
        and load credits — coming in the next build.
      </p>
      <button className="arcade-btn text-xs" onClick={() => setPhase("PICK")}>
        ▶ KEEP PRACTICING
      </button>
    </div>
  );
}
