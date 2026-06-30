import { useEffect, useRef, useState } from "react";
import { useGame } from "../store";
import { useSigner } from "../auth/useSigner";
import { FuelUp } from "./FuelUp";

const FAUCET = "https://faucet.sui.io/?network=testnet";

/**
 * Entry to real climbs. Make sure the player has a manager (their on-chain
 * locker), then REQUIRE a real DUSDC deposit before letting them in — you climb
 * against that on-chain balance, so playing for real with an empty locker would
 * be a lie. Once funded they drop into the game and can top up any time from the
 * bet menu. Only the first load is gated here.
 */
export function FundScene() {
  const setPhase = useGame((s) => s.setPhase);
  const enterReal = useGame((s) => s.enterReal);
  const credits = useGame((s) => s.credits);
  const { send, getWallet, address } = useSigner();

  const [status, setStatus] = useState("getting you in…");
  const [needGas, setNeedGas] = useState(false);
  const [ready, setReady] = useState(false);
  const [topUp, setTopUp] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ran = useRef(false);

  const run = async () => {
    setErr(null);
    setNeedGas(false);
    setReady(false);
    setStatus("getting you in…");
    try {
      let w = await getWallet();
      if (Number(w.sui) <= 0) {
        setNeedGas(true);
        setStatus("");
        return;
      }
      if (!w.managerId) {
        setStatus("setting up your locker…");
        await send({ action: "createManager" });
        w = await getWallet();
      }
      if (!w.managerId) throw new Error("could not set up your locker");
      // Enter real mode with whatever is already in the locker; the fuel-up gate
      // below requires a positive balance before play actually starts.
      enterReal(w.managerId, Number(w.managerBalance) / 1e6, w.address);
      setStatus("");
      setReady(true);
    } catch (e) {
      setErr((e as Error).message);
      setStatus("");
    }
  };

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shortAddr = address ? `${address.slice(0, 10)}…${address.slice(-6)}` : "";
  const funded = credits > 0;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 px-8 text-center">
      <h2 className="text-gold text-glow text-lg">{funded && !topUp ? "READY TO CLIMB" : "FUEL UP FOR REAL"}</h2>

      {status && <p className="text-[10px] text-gold animate-blink">{status}</p>}

      {needGas && (
        <p className="text-[9px] leading-relaxed text-danger">
          you need a little testnet SUI for gas.
          <br />
          grab some at{" "}
          <a className="text-neon underline" href={FAUCET} target="_blank" rel="noreferrer">
            faucet.sui.io
          </a>
          <br />
          <span className="text-white/60">{shortAddr}</span>
        </p>
      )}
      {err && <p className="max-w-[18rem] break-words text-[8px] text-danger">{err}</p>}

      {(needGas || err) && (
        <button className="arcade-btn text-xs" onClick={() => void run()}>
          ↻ CHECK AGAIN
        </button>
      )}

      {/* Funded already → straight to play, with the option to load more. */}
      {ready && !needGas && funded && !topUp && (
        <>
          <p className="text-[11px] text-warm">${credits.toFixed(2)} loaded on-chain</p>
          <button className="arcade-btn text-sm" onClick={() => setPhase("PICK")}>
            ▶ PLAY FOR REAL
          </button>
          <button className="text-[9px] text-gold/80 underline" onClick={() => setTopUp(true)}>
            ＋ load more DUSDC
          </button>
        </>
      )}

      {/* Not funded yet (or topping up) → the deposit is REQUIRED to play real. */}
      {ready && !needGas && (!funded || topUp) && (
        <>
          <p className="max-w-[16rem] text-[9px] leading-relaxed text-white/70">
            load real DUSDC into your locker — every climb is staked from this balance.
          </p>
          <div className="w-full max-w-[18rem]">
            <FuelUp
              onClose={() => {
                // Funded now → into play. Still empty (they cancelled) → home,
                // since real play with an empty locker isn't real.
                if (useGame.getState().credits > 0) setTopUp(false);
                else setPhase("BOOT");
              }}
            />
          </div>
        </>
      )}

      <button className="text-[8px] text-white/40 underline" onClick={() => setPhase("BOOT")}>
        back
      </button>
    </div>
  );
}
