/**
 * Encrypted session cookie (AES-256-GCM), keyed by SESSION_SECRET. Holds the
 * zkLogin session (JWT + salt + address). The JWT is a bearer credential — keep
 * the cookie httpOnly + Secure and never expose salt/JWT to the client.
 */

import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

export interface ZkSession {
  jwt: string;
  salt: string;
  address: string;
  email?: string;
  name?: string;
}

export const SESSION_COOKIE = "zk_session";
export const STATE_COOKIE = "zk_oauth_state";

function key(): Buffer {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET is not set (any random 32+ char string)");
  return createHash("sha256").update(s).digest();
}

export function sealSession(session: ZkSession): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const pt = Buffer.from(JSON.stringify(session), "utf8");
  const ct = Buffer.concat([cipher.update(pt), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString("base64url");
}

export function openSession(token: string | undefined | null): ZkSession | null {
  if (!token) return null;
  try {
    const buf = Buffer.from(token, "base64url");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const ct = buf.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", key(), iv);
    decipher.setAuthTag(tag);
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
    return JSON.parse(pt.toString("utf8")) as ZkSession;
  } catch {
    return null;
  }
}
