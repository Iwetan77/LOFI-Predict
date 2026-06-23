/**
 * Server-side zkLogin signature assembly. The ephemeral private key never
 * reaches here — only the ephemeral public key + the user's signature.
 */

import {
  genAddressSeed,
  getExtendedEphemeralPublicKey,
  getZkLoginSignature,
  jwtToAddress,
} from "@mysten/sui/zklogin";
import { Ed25519PublicKey } from "@mysten/sui/keypairs/ed25519";
import { fromBase64 } from "@mysten/sui/utils";

export interface ZkProof {
  proofPoints: { a: string[]; b: string[][]; c: string[] };
  issBase64Details: { value: string; indexMod4: number };
  headerBase64: string;
  addressSeed: string;
}

export function deriveAddress(jwt: string, salt: string): string {
  return jwtToAddress(jwt, salt, false);
}

export function addressSeed(opts: { salt: string; sub: string; aud: string; keyClaimName?: string }): string {
  return genAddressSeed(BigInt(opts.salt), opts.keyClaimName ?? "sub", opts.sub, opts.aud).toString();
}

export function extendedEphemeralPublicKey(publicKeyB64: string): string {
  return getExtendedEphemeralPublicKey(new Ed25519PublicKey(fromBase64(publicKeyB64)));
}

export function assembleSignature(opts: {
  proof: ZkProof;
  maxEpoch: number;
  userSignature: string;
}): string {
  return getZkLoginSignature({
    inputs: opts.proof,
    maxEpoch: opts.maxEpoch,
    userSignature: opts.userSignature,
  });
}
