/**
 * zkLogin routes (mounted under /api/zklogin). The browser holds the ephemeral
 * key; the server holds JWT/salt/address in an httpOnly cookie and assembles
 * the final signature. Served same-origin via the web app's Vite proxy, so the
 * session cookie is first-party.
 */

import type { FastifyInstance } from "fastify";
import { randomBytes } from "node:crypto";
import { SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { fromBase64, toBase64 } from "@mysten/sui/utils";
import {
  FULLNODE_URL,
  DUSDC_TYPE,
  buildCreateManager,
  buildDeposit,
  buildMint,
  buildRedeem,
  type MarketRef,
} from "@lofi/sui";
import { googleAuthUrl, exchangeCodeForIdToken, verifyGoogleIdToken } from "./google.js";
import { getZkLoginWallet, createZkLoginProof } from "./prover.js";
import { extendedEphemeralPublicKey, addressSeed, assembleSignature } from "./sig.js";
import { sealSession, openSession, SESSION_COOKIE, STATE_COOKIE } from "./session.js";

const client = new SuiClient({ url: FULLNODE_URL });
const WEB_URL = process.env.WEB_URL ?? "http://localhost:5174";
const secure = process.env.NODE_ENV === "production";

type PrepareBody =
  | { action: "createManager" }
  | { action: "deposit"; managerId: string; amount: string | number }
  | { action: "mint" | "redeem"; managerId: string; market: MarketRef; quantity: string | number };

export async function zkLoginRoutes(app: FastifyInstance) {
  // Current Sui epoch — the browser needs it to size the ephemeral session.
  app.get("/epoch", async () => {
    const sys = await client.getLatestSuiSystemState();
    return { epoch: Number(sys.epoch) };
  });

  // Begin sign-in: set CSRF state, bounce to Google with the ephemeral nonce.
  app.get<{ Querystring: { nonce?: string } }>("/login", async (req, reply) => {
    const nonce = req.query.nonce;
    if (!nonce) return reply.code(400).send({ error: "missing nonce" });
    const state = randomBytes(16).toString("hex");
    reply.setCookie(STATE_COOKIE, state, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 600 });
    return reply.redirect(googleAuthUrl({ nonce, state }));
  });

  // Google redirects here. Verify, resolve wallet, seal the session cookie.
  app.get<{ Querystring: { code?: string; state?: string } }>("/callback", async (req, reply) => {
    const { code, state } = req.query;
    const expected = req.cookies[STATE_COOKIE];
    if (!code || !state || !expected || state !== expected) {
      return reply.redirect(`${WEB_URL}/?error=oauth_state`);
    }
    try {
      const idToken = await exchangeCodeForIdToken(code);
      const claims = await verifyGoogleIdToken(idToken);
      const { address, salt } = await getZkLoginWallet(idToken, claims.sub);
      reply.setCookie(
        SESSION_COOKIE,
        sealSession({ jwt: idToken, salt, address, email: claims.email, name: claims.name }),
        { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 },
      );
      reply.clearCookie(STATE_COOKIE, { path: "/" });
      return reply.redirect(`${WEB_URL}/?signedin=1`);
    } catch (e) {
      app.log.error({ err: (e as Error).message }, "zklogin/callback");
      return reply.redirect(`${WEB_URL}/?error=oauth_exchange`);
    }
  });

  app.get("/me", async (req) => {
    const s = openSession(req.cookies[SESSION_COOKIE]);
    return s ? { signedIn: true, address: s.address, email: s.email ?? null, name: s.name ?? null } : { signedIn: false };
  });

  app.post("/logout", async (_req, reply) => {
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return { ok: true };
  });

  // Build the requested game transaction from the signed-in address; return the
  // BCS bytes for the browser to sign with its ephemeral key.
  app.post<{ Body: PrepareBody }>("/prepare", async (req, reply) => {
    const s = openSession(req.cookies[SESSION_COOKIE]);
    if (!s) return reply.code(401).send({ error: "not signed in" });
    const body = req.body;

    let tx: Transaction;
    if (body.action === "createManager") {
      tx = buildCreateManager();
    } else if (body.action === "deposit") {
      tx = new Transaction();
      const coins = await client.getCoins({ owner: s.address, coinType: DUSDC_TYPE });
      if (coins.data.length === 0) return reply.code(400).send({ error: "no DUSDC to load" });
      const primary = coins.data[0].coinObjectId;
      if (coins.data.length > 1) tx.mergeCoins(tx.object(primary), coins.data.slice(1).map((c) => tx.object(c.coinObjectId)));
      const [credit] = tx.splitCoins(tx.object(primary), [tx.pure.u64(BigInt(body.amount))]);
      buildDeposit({ managerId: body.managerId, coin: credit, tx });
    } else if (body.action === "mint") {
      tx = buildMint({ managerId: body.managerId, market: body.market, quantity: BigInt(body.quantity) });
    } else if (body.action === "redeem") {
      tx = buildRedeem({ managerId: body.managerId, market: body.market, quantity: BigInt(body.quantity) });
    } else {
      return reply.code(400).send({ error: "unknown action" });
    }

    tx.setSender(s.address);
    const txBytes = await tx.build({ client });
    return { txBytesB64: toBase64(txBytes) };
  });

  // Assemble proof + ephemeral signature → zkLoginSignature, then submit.
  app.post<{
    Body: {
      txBytesB64: string;
      userSignature: string;
      ephemeralPubKeyB64: string;
      maxEpoch: number;
      randomness: string;
    };
  }>("/execute", async (req, reply) => {
    const s = openSession(req.cookies[SESSION_COOKIE]);
    if (!s) return reply.code(401).send({ error: "not signed in" });
    const { txBytesB64, userSignature, ephemeralPubKeyB64, maxEpoch, randomness } = req.body;
    if (!txBytesB64 || !userSignature || !ephemeralPubKeyB64 || maxEpoch == null || !randomness) {
      return reply.code(400).send({ error: "missing fields" });
    }
    const claims = JSON.parse(Buffer.from(s.jwt.split(".")[1], "base64url").toString("utf8")) as {
      sub: string;
      aud: string;
    };
    try {
      const proofCore = await createZkLoginProof({
        jwt: s.jwt,
        maxEpoch,
        extendedEphemeralPublicKey: extendedEphemeralPublicKey(ephemeralPubKeyB64),
        jwtRandomness: randomness,
        salt: s.salt,
      });
      const signature = assembleSignature({
        proof: { ...proofCore, addressSeed: addressSeed({ salt: s.salt, sub: claims.sub, aud: claims.aud }) },
        maxEpoch,
        userSignature,
      });
      const res = await client.executeTransactionBlock({
        transactionBlock: fromBase64(txBytesB64),
        signature,
        options: { showEffects: true, showObjectChanges: true },
      });
      return { digest: res.digest, objectChanges: res.objectChanges ?? [] };
    } catch (e) {
      app.log.error({ err: (e as Error).message }, "zklogin/execute");
      return reply.code(502).send({ error: "execute failed", detail: (e as Error).message });
    }
  });
}
