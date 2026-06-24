import { useEffect, useRef, useState } from "react";
import { useGame } from "../store";
import { useSigner } from "../auth/useSigner";

const FAUCET = "https://faucet.sui.io/?network=testnet";

/**
 * One-time, hands-off setup for real climbs. Behind the scenes this opens the
 * player's manager (once) and loads their DUSDC into it — but there's no "fund"
 * form: their coins just carry over and become the balance they climb with,
 * round after round. Only surfaces if they're missing gas or coins.
 */
export function FundScene() {
  const setPhase = useGame((s) => s.setPhase);
  const enterReal = useGame((s) => s.enterReal);
  const { send, getWallet, address } = useSigner();

  const [status, setStatus] = useState("reading your stash…");
  const [need, setNeed] = useState<null | "gas" | "coins">(null);
  const [err, setErr] = useState<string | null>(null);
  const ran = useRef(false);

  const run = async () => {
    setErr(null);
    setNeed(null);
    try {
      let w = await getWallet();
      const gas = Number(w.sui) / 1e9;
      let walletCoins = Number(w.dusdc) / 1e6;
      let bank = Number(w.managerBalance) / 1e6;

      if (gas <= 0) {
        setNeed("gas");
        setStatus("");
        return;
      }
      // Nothing anywhere to play with → point them at the faucet.
      if (walletCoins <= 0 && bank <= 0) {
        setNeed("coins");
        setStatus("");
        return;
      }

      // Open a manager once.
      if (!w.managerId) {
        setStatus("opening your locker…");
        await send({ action: "createManager" });
        w = await getWallet();
        bank = Number(w.managerBalance) / 1e6;
        walletCoins = Number(w.dusdc) / 1e6;
      }
      // Load whatever's in the wallet into the manager (carries over after).
      if (w.managerId && walletCoins > 0) {
        setStatus("loading your coins…");
        await send({ action: "deposit", managerId: w.managerId, amount: String(Math.floor(walletCoins * 1e6)) });
        w = await getWallet();
        bank = Number(w.managerBalance) / 1e6;
      }
      if (!w.managerId || bank <= 0) {
        setNeed("coins");
        setStatus("");
        return;
      }
      enterReal(w.managerId, bank, w.address);
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

      {need === "gas" && (
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
      {need === "coins" && (
        <p className="text-[9px] leading-relaxed text-white/75">
          you have no DUSDC to play with yet.
          <br />
          send testnet DUSDC to:
          <br />
          <span className="text-white/55">{shortAddr}</span>
        </p>
      )}
      {err && <p className="max-w-[18rem] break-words text-[8px] text-danger">{err}</p>}

      {(need || err) && (
        <button
          className="arcade-btn text-xs"
          onClick={() => {
            setStatus("checking again…");
            void run();
          }}
        >
          ↻ CHECK AGAIN
        </button>
      )}

      <button className="text-[8px] text-white/40 underline" onClick={() => setPhase("PICK")}>
        keep practicing instead
      </button>
    </div>
  );
}
