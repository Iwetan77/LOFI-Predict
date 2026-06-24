import { useEffect, useState } from "react";
import { useGame } from "../store";
import { useSigner } from "../auth/useSigner";

/** Top arcade HUD: 1UP / HIGH SCORE / lives + balance (build prompt §9). */
export function Hud() {
  const { floor, highScore, lives, credits, playMoney, realMode, managerId } = useGame();
  const syncBalance = useGame((s) => s.syncBalance);
  const setPhase = useGame((s) => s.setPhase);
  const { address, getWallet, send, signOut } = useSigner();

  // Once connected, show the player's real on-chain DUSDC so the chip is live
  // immediately — even before they fuel up the manager.
  const [walletBal, setWalletBal] = useState<number | null>(null);
  useEffect(() => {
    if (!address || realMode) return;
    let stop = false;
    getWallet()
      .then((w) => !stop && setWalletBal((Number(w.dusdc) + Number(w.managerBalance)) / 1e6))
      .catch(() => {});
    return () => {
      stop = true;
    };
  }, [address, realMode, getWallet]);

  const balance = realMode ? credits : walletBal;

  const withdraw = async () => {
    if (!managerId || credits <= 0) return;
    try {
      await send({ action: "withdraw", managerId, amount: String(Math.floor(credits * 1e6)) });
      syncBalance(0);
    } catch {
      /* surfaced elsewhere */
    }
  };

  const disconnect = async () => {
    await signOut();
    setPhase("BOOT");
  };

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
      <div className="flex flex-col items-end gap-1">
        <div className="text-hot text-glow">
          {"♥".repeat(lives)}
          <span className="text-white/30">{"♥".repeat(Math.max(0, 3 - lives))}</span>
        </div>
        {address ? (
          <WalletChip
            balance={balance}
            address={address}
            canWithdraw={realMode && (credits ?? 0) > 0}
            onWithdraw={withdraw}
            onDisconnect={disconnect}
          />
        ) : (
          <div className="text-white text-glow">
            {playMoney ? "PLAY" : "CRED"} {credits.toFixed(0)}
          </div>
        )}
      </div>
    </div>
  );
}

/** Balance + address pill. Tap to open: copy / withdraw winnings / disconnect. */
function WalletChip({
  balance,
  address,
  canWithdraw,
  onWithdraw,
  onDisconnect,
}: {
  balance: number | null;
  address: string;
  canWithdraw: boolean;
  onWithdraw: () => void;
  onDisconnect: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const short = `${address.slice(0, 4)}…${address.slice(-4)}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/40 px-2 py-1 transition-colors active:bg-black/60"
      >
        <span
          className="h-7 w-7 shrink-0 rounded-md"
          style={{ background: "linear-gradient(135deg,#7c4dff 0%,#ff4db8 55%,#3df5ff 100%)" }}
        />
        <span className="flex flex-col items-start leading-tight">
          <span className="text-neon text-glow text-[11px] font-semibold">
            {balance == null ? "$—" : `$${balance.toFixed(2)}`}
          </span>
          <span className="font-mono text-[9px] text-white/45">{short}</span>
        </span>
        <span className="h-2 w-2 shrink-0 rounded-full bg-[#39ff8b]" style={{ boxShadow: "0 0 6px #39ff8b" }} />
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-1 flex w-44 flex-col overflow-hidden rounded-lg border border-white/15 bg-[#0b0420]/95 text-[10px] shadow-xl">
          <button className="px-3 py-2 text-left text-white/80 hover:bg-white/10" onClick={copy}>
            {copied ? "✓ copied!" : "⧉ copy address"}
          </button>
          <button
            className="px-3 py-2 text-left text-gold hover:bg-white/10 disabled:opacity-40"
            disabled={!canWithdraw || busy}
            onClick={async () => {
              setBusy(true);
              await onWithdraw();
              setBusy(false);
              setOpen(false);
            }}
          >
            {busy ? "withdrawing…" : "↗ withdraw winnings"}
          </button>
          <button
            className="px-3 py-2 text-left text-danger hover:bg-white/10"
            onClick={() => {
              setOpen(false);
              onDisconnect();
            }}
          >
            ⏏ disconnect
          </button>
        </div>
      )}
    </div>
  );
}
