import { useEffect, useState } from "react";
import { useGame } from "../store";
import { useSigner } from "../auth/useSigner";

/**
 * Top up the on-chain bankroll by a chosen amount (deposit wallet DUSDC → the
 * player's manager). Used both on the home screen and inside the sky menu, so a
 * player fuels once and tops up only when they want more.
 */
export function FuelUp({ onClose }: { onClose: () => void }) {
  const managerId = useGame((s) => s.managerId);
  const syncBalance = useGame((s) => s.syncBalance);
  const { getWallet, send, readBalance } = useSigner();

  const [walletDusdc, setWalletDusdc] = useState<number | null>(null);
  const [amount, setAmount] = useState(10);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;
    getWallet()
      .then((w) => {
        if (stop) return;
        const avail = Number(w.dusdc) / 1e6;
        setWalletDusdc(avail);
        setAmount((a) => Math.min(Math.max(1, a), Math.max(1, Math.floor(avail))));
      })
      .catch(() => setWalletDusdc(0));
    return () => {
      stop = true;
    };
  }, [getWallet]);

  const avail = walletDusdc ?? 0;
  const canFuel = !!managerId && amount >= 1 && amount <= Math.floor(avail) && !busy;

  const fuel = async () => {
    if (!managerId) return;
    setBusy(true);
    setErr(null);
    try {
      await send({ action: "deposit", managerId, amount: String(Math.floor(amount * 1e6)) });
      syncBalance(await readBalance(managerId)); // reflect the true locker balance after the deposit
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex w-full flex-col gap-2 rounded-lg border-2 border-gold/40 bg-black/70 p-3 text-[10px]">
      <div className="flex items-center justify-between">
        <span className="text-gold">FUEL UP</span>
        <span className="text-white/45">
          in wallet: {walletDusdc == null ? "…" : `$${avail.toFixed(2)}`}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {[5, 10, 25].map((v) => (
          <button
            key={v}
            onClick={() => setAmount(v)}
            disabled={v > Math.floor(avail)}
            className={`flex-1 border-2 py-1.5 disabled:opacity-30 ${
              amount === v ? "border-gold text-gold" : "border-white/15 text-white/45"
            }`}
          >
            ${v}
          </button>
        ))}
        <div className="flex flex-1 items-center border-2 border-white/15 px-2 py-1.5 text-white/70">
          <span>$</span>
          <input
            type="number"
            min={1}
            value={amount}
            onChange={(e) => setAmount(Math.max(1, Math.floor(Number(e.target.value) || 0)))}
            className="w-full bg-transparent text-center outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
            aria-label="fuel amount"
          />
        </div>
      </div>
      {avail <= 0 && walletDusdc != null && (
        <p className="text-[8px] text-white/45">no DUSDC in your wallet — send some testnet DUSDC to your address first.</p>
      )}
      {err && <p className="break-words text-[8px] text-danger">{err}</p>}
      <div className="flex gap-2">
        <button onClick={onClose} className="flex-1 border-2 border-white/15 py-1.5 text-white/55">
          cancel
        </button>
        <button onClick={fuel} disabled={!canFuel} className="arcade-btn flex-1 text-xs disabled:opacity-40">
          {busy ? "fueling…" : `FUEL $${amount}`}
        </button>
      </div>
    </div>
  );
}
