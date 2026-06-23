import { useCallback, useEffect, useState } from "react";
import { fromBase64 } from "@mysten/sui/utils";
import {
  createEphemeralSession,
  saveEphemeral,
  loadEphemeral,
  clearEphemeral,
  signTxBytes,
} from "./ephemeral";

/** All requests go same-origin through the Vite proxy → first-party cookie. */
const api = (p: string, init?: RequestInit) =>
  fetch(`/api/zklogin${p}`, { credentials: "include", ...init }).then((r) => r.json());

export interface ZkUser {
  address: string;
  email: string | null;
  name: string | null;
}

/** A game action the server knows how to build into a transaction. */
export type GameAction =
  | { action: "createManager" }
  | { action: "deposit"; managerId: string; amount: string }
  | { action: "mint" | "redeem"; managerId: string; market: unknown; quantity: string };

export function useZkLogin() {
  const [user, setUser] = useState<ZkUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const r = await api("/me");
    setUser(r.signedIn ? { address: r.address, email: r.email, name: r.name } : null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signIn = useCallback(async () => {
    const { epoch } = await api("/epoch");
    const eph = createEphemeralSession(Number(epoch));
    saveEphemeral(eph);
    window.location.href = `/api/zklogin/login?nonce=${encodeURIComponent(eph.nonce)}`;
  }, []);

  const signOut = useCallback(async () => {
    clearEphemeral();
    await api("/logout", { method: "POST" }).catch(() => {});
    setUser(null);
  }, []);

  /** Build → sign locally → execute. Returns the on-chain digest. */
  const send = useCallback(async (action: GameAction): Promise<{ digest: string; objectChanges: unknown[] }> => {
    const eph = loadEphemeral();
    if (!eph) throw new Error("No ephemeral session — sign in again.");

    const { txBytesB64, error } = await api("/prepare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(action),
    });
    if (!txBytesB64) throw new Error(error ?? "prepare failed");

    const userSignature = await signTxBytes(eph, fromBase64(txBytesB64));

    const res = await api("/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        txBytesB64,
        userSignature,
        ephemeralPubKeyB64: eph.publicKeyB64,
        maxEpoch: eph.maxEpoch,
        randomness: eph.randomness,
      }),
    });
    if (!res.digest) throw new Error(res.detail ?? res.error ?? "execute failed");
    return { digest: res.digest, objectChanges: res.objectChanges ?? [] };
  }, []);

  return { user, loading, signIn, signOut, send, refresh };
}
