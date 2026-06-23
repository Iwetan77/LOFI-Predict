import { useGame } from "./store";
import { useEngine } from "./game/useEngine";
import { Hud } from "./ui/Hud";
import { ArcadeLanding } from "./ui/ArcadeLanding";
import { PickScene } from "./ui/PickScene";
import { ClimbScene } from "./ui/ClimbScene";
import {
  TutorialScene,
  SummaryScene,
  BuildingSwapScene,
  GameOverScene,
  ConnectScene,
} from "./ui/Scenes";

export default function App() {
  const phase = useGame((s) => s.phase);
  const nextRound = useGame((s) => s.nextRound);
  const { liveSpot, startRound } = useEngine();

  return (
    <div className="crt mx-auto flex h-full max-w-md flex-col">
      <Hud />
      {phase === "BOOT" && <ArcadeLanding />}
      {phase === "TUTORIAL" && <TutorialScene />}
      {phase === "PICK" && <PickScene liveSpot={liveSpot} onGo={startRound} />}
      {(phase === "CLIMB" || phase === "ARMING" || phase === "REDEEM") && <ClimbScene />}
      {(phase === "SETTLE" || phase === "SETTLE_SUMMARY") && <SummaryScene onNext={nextRound} />}
      {phase === "BUILDING_SWAP" && <BuildingSwapScene onNext={() => useGame.getState().setPhase("PICK")} />}
      {phase === "CONNECT" && <ConnectScene />}
      {phase === "FUND" && <ConnectScene />}
      {phase === "GAME_OVER" && <GameOverScene />}
    </div>
  );
}
