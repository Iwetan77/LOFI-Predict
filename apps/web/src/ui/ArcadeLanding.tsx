import { useMemo } from "react";
import { ConnectModal } from "@mysten/dapp-kit";
import { useGame } from "../store";
import { useSigner } from "../auth/useSigner";

/**
 * The attract / landing screen — a coin-op cabinet. This is the disguise: a
 * prediction market that reads as a neon arcade climber. Big marquee, blinking
 * PRESS START, a lit-window tower backdrop, and a scrolling instruction ticker.
 */
export function ArcadeLanding() {
  const pressStart = useGame((s) => s.pressStart);
  const highScore = useGame((s) => s.highScore);
  const setPhase = useGame((s) => s.setPhase);
  const { signedIn, address, name, mode, googleSignIn, signOut } = useSigner();

  // A static field of tower windows that gently twinkle.
  const windows = useMemo(
    () =>
      Array.from({ length: 60 }, (_, i) => ({
        left: 6 + (i % 6) * 15 + (Math.random() * 4 - 2),
        top: 8 + Math.floor(i / 6) * 9 + (Math.random() * 2 - 1),
        on: Math.random() > 0.45,
        delay: (Math.random() * 4).toFixed(2),
      })),
    [],
  );

  return (
    <div
      className="relative flex flex-1 flex-col items-center overflow-hidden"
      style={{
        backgroundImage: "linear-gradient(rgba(11,4,32,0.55),rgba(11,4,32,0.9)), url(/art/sky.jpg)",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      {/* tower backdrop with lit windows */}
      <div className="pointer-events-none absolute inset-0 z-0">
        <div className="absolute inset-x-10 bottom-0 top-16 bg-gradient-to-b from-[#160a33] to-[#0b0420] opacity-80" />
        {windows.map((w, i) => (
          <span
            key={i}
            className="absolute h-1.5 w-2"
            style={{
              left: `${w.left}%`,
              top: `${w.top}%`,
              background: w.on ? "#ffd23f" : "#2a1f55",
              boxShadow: w.on ? "0 0 6px #ffd23f" : "none",
              animation: w.on ? `twinkle ${3 + (i % 4)}s ease-in-out ${w.delay}s infinite` : undefined,
            }}
          />
        ))}
      </div>

      {/* neon cabinet frame */}
      <div className="relative z-10 m-3 flex w-[calc(100%-1.5rem)] flex-1 flex-col items-center justify-between border-4 border-neon/60 p-4"
           style={{ boxShadow: "0 0 24px rgba(61,245,255,0.35), inset 0 0 24px rgba(61,245,255,0.15)" }}>
        {/* marquee header */}
        <div className="w-full text-center">
          <div className="text-[8px] tracking-[0.3em] text-hot text-glow flicker">★ ARCADE ★</div>
          <h1 className="mt-3 leading-none">
            <span className="block text-4xl sm:text-5xl text-neon text-glow" style={{ animation: "hue 12s linear infinite" }}>
              LOFI
            </span>
            <span className="mt-2 block text-2xl sm:text-3xl text-gold text-glow">PREDICT</span>
          </h1>
          <div className="mx-auto mt-3 h-1 w-3/4 bg-gradient-to-r from-transparent via-neon to-transparent" />
        </div>

        {/* yeti on a ledge (placeholder until art drops in) */}
        <div className="flex flex-col items-center gap-2">
          <img
            src="/art/lofi.png"
            alt="LOFI the yeti"
            className="h-24 w-24 animate-floaty object-contain"
            style={{ filter: "drop-shadow(0 0 14px rgba(57,255,139,0.55))" }}
          />
          <div className="h-2 w-24 bg-white/30" aria-label="ledge" />
          <p className="mt-2 max-w-[16rem] text-center text-[9px] leading-relaxed text-white/70">
            help lofi climb the tower.
            <br />
            call it right, climb higher.
          </p>
        </div>

        {/* start + sign-in + score */}
        <div className="flex w-full flex-col items-center gap-2.5">
          <div className="flex w-full justify-between text-[9px]">
            <span className="text-neon">CREDIT 00</span>
            <span className="text-gold text-glow">HI {String(highScore).padStart(4, "0")}</span>
          </div>
          <button className="arcade-btn animate-blink text-sm" onClick={pressStart}>
            ▶ PRESS START
          </button>
          <div className="flex w-full items-center gap-2 text-[7px] tracking-[0.25em] text-white/30">
            <span className="h-px flex-1 bg-white/15" />
            OR PLAY FOR REAL
            <span className="h-px flex-1 bg-white/15" />
          </div>
          {signedIn && address ? (
            <>
              <button className="arcade-btn text-xs" onClick={() => setPhase("FUND")}>
                ▶ FUEL UP &amp; PLAY FOR REAL
              </button>
              <p className="text-[8px] text-white/40">
                {mode === "wallet" ? "wallet" : "signed in"}: {name ?? `${address.slice(0, 6)}…${address.slice(-4)}`}
                {" · "}
                <button className="underline" onClick={signOut}>
                  {mode === "wallet" ? "disconnect" : "sign out"}
                </button>
              </p>
            </>
          ) : (
            <div className="flex w-full flex-col items-stretch gap-2">
              <ConnectModal trigger={<button className="arcade-btn w-full text-xs">▶ CONNECT WALLET</button>} />
              <button className="arcade-btn text-xs" onClick={googleSignIn}>
                ▶ SIGN IN WITH GOOGLE
              </button>
            </div>
          )}
        </div>
      </div>

      {/* scrolling instruction ticker */}
      <div className="relative z-10 w-full overflow-hidden border-t-2 border-neon/30 bg-black/40 py-1">
        <div className="marquee-track whitespace-nowrap text-[8px] tracking-widest text-neon/80">
          {Array(2)
            .fill("CALL UP OR DOWN ★ CLIMB HIGHER ★ GRAB THE LEDGE TO BANK IT ★ 3 LIVES ★ HOW HIGH CAN LOFI GO? ★ ")
            .join("")}
        </div>
      </div>
    </div>
  );
}
