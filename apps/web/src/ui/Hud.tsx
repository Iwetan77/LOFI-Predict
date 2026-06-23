import { useGame } from "../store";

/** Top arcade HUD: 1UP / HIGH SCORE / CREDIT (build prompt §9). */
export function Hud() {
  const { floor, highScore, lives, credits, playMoney } = useGame();
  return (
    <div className="flex items-start justify-between px-3 pt-3 text-[10px] sm:text-xs">
      <div className="text-neon text-glow">
        <div>1UP</div>
        <div className="text-white">FLOOR {String(floor).padStart(4, "0")}</div>
      </div>
      <div className="text-gold text-glow text-center">
        <div>HIGH SCORE</div>
        <div className="text-white">{String(highScore).padStart(4, "0")}</div>
      </div>
      <div className="text-hot text-glow text-right">
        <div>{"♥".repeat(lives)}<span className="text-white/30">{"♥".repeat(Math.max(0, 3 - lives))}</span></div>
        <div className="text-white">
          {playMoney ? "PLAY" : "CRED"} {credits.toFixed(0)}
        </div>
      </div>
    </div>
  );
}
