/**
 * Browser half of zkLogin: the ephemeral keypair that signs transactions. It
 * lives in sessionStorage and NEVER goes to the server — only its public key
 * and the produced signature do.
 */

import { generateNonce, generateRandomness } from "@mysten/sui/zklogin";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

const EPH_KEY = "zk.ephemeral";

export interface EphemeralSession {
  secretKey: string; // suiprivkey1… (browser only)
  publicKeyB64: string;
  randomness: string;
  maxEpoch: number;
  nonce: string;
}

export function createEphemeralSession(currentEpoch: number, epochsValid = 2): EphemeralSession {
  const keypair = new Ed25519Keypair();
  const randomness = generateRandomness();
  const maxEpoch = currentEpoch + epochsValid;
  const publicKey = keypair.getPublicKey();
  return {
    secretKey: keypair.getSecretKey(),
    publicKeyB64: publicKey.toBase64(),
    randomness,
    maxEpoch,
    nonce: generateNonce(publicKey, maxEpoch, randomness),
  };
}

export function saveEphemeral(s: EphemeralSession) {
  sessionStorage.setItem(EPH_KEY, JSON.stringify(s));
}

export function loadEphemeral(): EphemeralSession | null {
  try {
    return JSON.parse(sessionStorage.getItem(EPH_KEY) ?? "null");
  } catch {
    return null;
  }
}

export function clearEphemeral() {
  sessionStorage.removeItem(EPH_KEY);
}

export async function signTxBytes(s: EphemeralSession, txBytes: Uint8Array): Promise<string> {
  const { signature } = await Ed25519Keypair.fromSecretKey(s.secretKey).signTransaction(txBytes);
  return signature;
}
