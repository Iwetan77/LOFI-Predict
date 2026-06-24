import { useCallback, useEffect, useState } from "react";
import { fromBase64 } from "@mysten/sui/utils";
import {
  createEphemeralSession,
  saveEphemeral,
  loadEphemeral,
  clearEphemeral,
  signTxBytes,
} from "./ephemeral";

/**
 * All requests go same-origin through the Vite proxy → first-party cookie.
 * Resolves to {} if the auth backend isn't deployed (e.g. wallet-only static
 * hosting) so the rest of the app keeps working.
 */
const api = async (p: string, init?: RequestInit) => {
  try {
    const r = await fetch(`/api/zklogin${p}`, { credentials: "include", ...init });
    return await r.json();
  } catch {
    return {};
  }
};

export interface ZkUser {
  address: string;
  email: string | null;
  name: string | null;
}

/** The binary market a real climb mints against (protocol detail, never shown). */
export interface ClimbMarket {
  oracleId: string;
  expiry: number;
  strike: string;
  spot: number;
  spotRaw: string;
  msLeft: number;
}

/** Signed-in player's on-chain state. */
export interface WalletState {
  address: string;
  sui: string; // MIST (9-dec)
  dusdc: string; // DUSDC in the wallet, raw (6-dec)
  managerId: string | null;
  managerBalance: string; // playable DUSDC inside the manager, raw (6-dec)
}

export interface TxResult {
  digest: string;
  objectChanges: unknown[];
  events: { type: string; parsedJson: unknown }[];
}

/** The on-chain market key a mint/redeem targets (UP vs DOWN packed in). */
export interface MarketRef {
  oracleId: string;
  expiry: number;
  strike: string;
  isUp: boolean;
}

/** A game action the server knows how to build into a transaction. */
export type GameAction =
  | { action: "createManager" }
  | { action: "deposit"; managerId: string; amount: string }
  | { action: "withdraw"; managerId: string; amount: string }
  | { action: "mint" | "redeem"; managerId: string; market: MarketRef; quantity: string };

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

  /** Build → sign locally → execute. Returns the on-chain digest + events. */
  const send = useCallback(async (action: GameAction): Promise<TxResult> => {
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
    return { digest: res.digest, objectChanges: res.objectChanges ?? [], events: res.events ?? [] };
  }, []);

  /** The market a real climb should mint against right now. */
  const getMarket = useCallback(async (): Promise<ClimbMarket> => {
    const m = await api("/market");
    if (!m.oracleId) throw new Error(m.error ?? "no market");
    return m as ClimbMarket;
  }, []);

  /** Signed-in player's balances + existing manager (or null). */
  const getWallet = useCallback(async (): Promise<WalletState> => {
    const w = await api("/wallet");
    if (!w.address) throw new Error(w.error ?? "not signed in");
    return w as WalletState;
  }, []);

  return { user, loading, signIn, signOut, send, refresh, getMarket, getWallet };
}
