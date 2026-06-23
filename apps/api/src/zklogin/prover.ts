/**
 * Wallet (address + salt) and proof generation.
 *
 * Two backends, chosen at runtime:
 *   - Shinami (when SHINAMI_API_KEY is set): hosted zkLogin wallet + prover.
 *     Shinami manages a deterministic salt per (iss, sub).
 *   - Mysten dev prover (fallback for testnet): we derive a deterministic salt
 *     locally via HMAC(SALT_SECRET, sub) and call the public dev prover.
 *
 * Both return the same proof shape (minus addressSeed, which we compute locally).
 */

import { createHmac } from "node:crypto";
import { deriveAddress, type ZkProof } from "./sig.js";

const SHINAMI_WALLET = "https://api.us1.shinami.com/sui/zkwallet/v1";
const SHINAMI_PROVER = "https://api.us1.shinami.com/sui/zkprover/v1";
const DEV_PROVER = process.env.SUI_DEV_PROVER_URL ?? "https://prover-dev.mystenlabs.com/v1";

type ProofCore = Omit<ZkProof, "addressSeed">;

const useShinami = () => !!process.env.SHINAMI_API_KEY;

// ─── Shinami (JSON-RPC) ──────────────────────────────────────────────────────

async function shinamiRpc<T>(url: string, method: string, params: unknown[]): Promise<T> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": process.env.SHINAMI_API_KEY! },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!r.ok) throw new Error(`shinami ${method} ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = (await r.json()) as { result?: T; error?: { code: number; message: string } };
  if (j.error) throw new Error(`shinami ${method}: ${j.error.message} (${j.error.code})`);
  return j.result as T;
}

function decodeSalt(salt: string): string {
  if (/^\d+$/.test(salt)) return salt;
  return BigInt("0x" + Buffer.from(salt, "base64").toString("hex")).toString();
}

// ─── Dev fallback: deterministic local salt ──────────────────────────────────

function localSalt(sub: string): string {
  const secret = process.env.SALT_SECRET ?? process.env.SESSION_SECRET ?? "lofi-dev-salt";
  const hex = createHmac("sha256", secret).update(sub).digest("hex");
  // zkLogin salt must be < 2^128; take the low 16 bytes.
  return BigInt("0x" + hex.slice(0, 32)).toString();
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** Resolve this user's Sui address + salt from their Google JWT. */
export async function getZkLoginWallet(jwt: string, sub: string): Promise<{ address: string; salt: string }> {
  if (useShinami()) {
    const w = await shinamiRpc<{ salt: string; address: string }>(
      SHINAMI_WALLET,
      "shinami_zkw_getOrCreateZkLoginWallet",
      [jwt],
    );
    return { address: w.address, salt: decodeSalt(w.salt) };
  }
  const salt = localSalt(sub);
  return { address: deriveAddress(jwt, salt), salt };
}

/** Mint a zkLogin proof (the slow ~2-4s step; cache per ephemeral session). */
export async function createZkLoginProof(opts: {
  jwt: string;
  maxEpoch: number;
  extendedEphemeralPublicKey: string;
  jwtRandomness: string;
  salt: string;
  keyClaimName?: string;
}): Promise<ProofCore> {
  if (useShinami()) {
    const { zkProof } = await shinamiRpc<{ zkProof: ProofCore }>(SHINAMI_PROVER, "shinami_zkp_createZkLoginProof", [
      opts.jwt,
      String(opts.maxEpoch),
      opts.extendedEphemeralPublicKey,
      opts.jwtRandomness,
      opts.salt,
      opts.keyClaimName ?? "sub",
    ]);
    return zkProof;
  }
  // Mysten dev prover REST shape.
  const r = await fetch(DEV_PROVER, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jwt: opts.jwt,
      extendedEphemeralPublicKey: opts.extendedEphemeralPublicKey,
      maxEpoch: String(opts.maxEpoch),
      jwtRandomness: opts.jwtRandomness,
      salt: opts.salt,
      keyClaimName: opts.keyClaimName ?? "sub",
    }),
  });
  if (!r.ok) throw new Error(`dev prover ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json()) as ProofCore;
}
