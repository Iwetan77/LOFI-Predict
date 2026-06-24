import { ConnectModal } from "@mysten/dapp-kit";
import { useGame } from "../store";
import { Confetti } from "./Confetti";
import { FlyingLofi } from "./FlyingLofi";
import { useSigner } from "../auth/useSigner";

/** Brief play-money intro before the first practice climbs. */
export function TutorialScene() {
  const setPhase = useGame((s) => s.setPhase);
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-8 text-center">
      <h2 className="text-neon text-glow text-lg">PRACTICE CLIMB</h2>
      <p className="text-[10px] leading-relaxed text-white/75">
        read the chart. call UP or DOWN.
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
  const { lastResult, floor, lives, realMode, credits, lastDigest } = useGame();
  if (!lastResult) return null;
  const { outcome, floorsGained, credited, staked } = lastResult;
  const net = credited - staked;
  const win = outcome !== "LOSS";
  return (
    <div className="relative flex flex-1 flex-col items-center justify-center gap-5 px-8 text-center">
      {win && <Confetti />}
      <h2 className={`text-glow text-xl ${win ? "text-warm" : "text-danger"}`}>
        {outcome === "WIN" ? "FLOOR REACHED!" : outcome === "CASHOUT" ? "LEDGE GRABBED!" : "LOFI FELL!"}
      </h2>
      <img
        src={win ? "/art/lofi_cheer.png" : "/art/lofi_fall.png"}
        alt=""
        className="h-28 w-28 animate-floaty object-contain"
        style={{ filter: `drop-shadow(0 0 12px ${win ? "rgba(57,255,139,0.5)" : "rgba(255,77,77,0.5)"})` }}
      />
      {win ? (
        <p className="text-sm text-white">+{floorsGained} 🏢 · FLOOR {floor}</p>
      ) : (
        <p className="text-sm text-white">lost a life · {"♥".repeat(lives)}</p>
      )}
      {realMode ? (
        <div className="flex flex-col items-center gap-1">
          <p className="text-[10px] text-warm">{credits.toFixed(2)} credits</p>
          {lastDigest && (
            <a
              href={`https://suiscan.xyz/testnet/tx/${lastDigest}`}
              target="_blank"
              rel="noreferrer"
              className="text-[8px] text-neon/70 underline"
            >
              on-chain ✓ {lastDigest.slice(0, 8)}…
            </a>
          )}
        </div>
      ) : (
        <p className={`text-[10px] ${net >= 0 ? "text-warm" : "text-danger"}`}>
          {net >= 0 ? "+" : ""}
          {net} credits
        </p>
      )}
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
    <div className="relative flex flex-1 flex-col items-center justify-center gap-6 overflow-hidden px-8 text-center">
      <FlyingLofi count={3} />
      <h2 className="text-danger text-glow z-10 text-2xl">GAME OVER</h2>
      <p className="z-10 text-sm text-white">FINAL HEIGHT · FLOOR {floor}</p>
      <p className="z-10 text-[10px] text-gold">HIGH SCORE {highScore}</p>
      <button className="arcade-btn z-10 text-sm animate-blink" onClick={restart}>
        ▶ INSERT COIN TO CONTINUE?
      </button>
    </div>
  );
}

/**
 * Sign-in gate for real climbs (both paths on testnet):
 *  - Connect Wallet — lowest friction if you already hold testnet SUI/DUSDC.
 *  - Google (zkLogin) — no wallet to install; funds a fresh address.
 */
export function ConnectScene() {
  const setPhase = useGame((s) => s.setPhase);
  const { signedIn, address, name, mode, googleSignIn, signOut } = useSigner();

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 px-8 text-center">
      <h2 className="text-neon text-glow text-lg">INSERT COIN</h2>
      {signedIn && address ? (
        <>
          <p className="text-[10px] leading-relaxed text-white/75">
            {mode === "wallet" ? "wallet connected" : "signed in"} as
            <br />
            <span className="text-gold">{name ?? `${address.slice(0, 6)}…${address.slice(-4)}`}</span>
            <br />
            <span className="text-[8px] text-white/40">
              {address.slice(0, 6)}…{address.slice(-4)}
            </span>
          </p>
          <button className="arcade-btn text-sm" onClick={() => setPhase("FUND")}>
            ▶ FUEL UP &amp; PLAY FOR REAL
          </button>
          <button className="text-[8px] text-white/40 underline" onClick={() => setPhase("PICK")}>
            keep practicing instead
          </button>
          <button className="text-[8px] text-white/40 underline" onClick={signOut}>
            {mode === "wallet" ? "disconnect" : "sign out"}
          </button>
        </>
      ) : (
        <>
          <p className="text-[10px] leading-relaxed text-white/75">
            nice climbing! to play for real,
            <br />
            connect a wallet or sign in.
          </p>
          <ConnectModal trigger={<button className="arcade-btn text-xs">▶ CONNECT WALLET</button>} />
          <button className="arcade-btn text-xs" onClick={googleSignIn}>
            ▶ SIGN IN WITH GOOGLE
          </button>
          <button className="text-[8px] text-white/40 underline" onClick={() => setPhase("PICK")}>
            keep practicing instead
          </button>
        </>
      )}
    </div>
  );
}
