import { useEffect, useRef, useState } from "react";
import { useGame } from "../store";
import { useSigner } from "../auth/useSigner";

const FAUCET = "https://faucet.sui.io/?network=testnet";

/**
 * Hands-off entry to real climbs. We just make sure the player has a manager
 * (their on-chain bankroll) and drop them straight into the game — no deposit
 * here. They top up however much they want from the bet menu, whenever they
 * want. Only surfaces if they're missing gas.
 */
export function FundScene() {
  const setPhase = useGame((s) => s.setPhase);
  const enterReal = useGame((s) => s.enterReal);
  const { send, getWallet, address } = useSigner();

  const [status, setStatus] = useState("getting you in…");
  const [needGas, setNeedGas] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ran = useRef(false);

  const run = async () => {
    setErr(null);
    setNeedGas(false);
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
      enterReal(w.managerId, Number(w.managerBalance) / 1e6, w.address);
      setPhase("PICK");
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

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 px-8 text-center">
      <h2 className="text-gold text-glow text-lg">GETTING READY</h2>
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
      <button className="text-[8px] text-white/40 underline" onClick={() => setPhase("PICK")}>
        keep practicing instead
      </button>
    </div>
  );
}
