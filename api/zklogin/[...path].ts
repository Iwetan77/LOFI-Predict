/**
 * Vercel serverless entry for the zkLogin / Google auth API. Plain handlers (no
 * Fastify — it doesn't bundle cleanly on Vercel's esbuild) that reuse the same
 * framework-agnostic helpers as the local dev server. Handles the catch-all
 * /api/zklogin/* routes: epoch, login, callback, me, logout, market, wallet,
 * prepare, execute. The wallet sign-in path needs no backend — only this does.
 *
 * Env vars to set in the Vercel project:
 *   SESSION_SECRET        32+ char secret for the session cookie
 *   GOOGLE_CLIENT_ID      Google OAuth web client id
 *   GOOGLE_CLIENT_SECRET  Google OAuth web client secret
 *   GOOGLE_REDIRECT_URI   https://<domain>/api/zklogin/callback
 *   WEB_URL               https://<domain>
 *   (optional) SHINAMI_API_KEY, SALT_SECRET
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { randomBytes } from "node:crypto";
import { SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { fromBase64, toBase64 } from "@mysten/sui/utils";
import {
  FULLNODE_URL,
  DUSDC_TYPE,
  EVENT,
  buildCreateManager,
  buildDeposit,
  buildWithdraw,
  buildMint,
  buildRedeem,
  fetchOracles,
  pickClimbOracle,
  latestPrice,
  readManagerBalance,
  type MarketRef,
} from "@lofi/sui";
import { googleAuthUrl, exchangeCodeForIdToken, verifyGoogleIdToken } from "../../apps/api/src/zklogin/google.js";
import { getZkLoginWallet, createZkLoginProof } from "../../apps/api/src/zklogin/prover.js";
import { extendedEphemeralPublicKey, addressSeed, assembleSignature } from "../../apps/api/src/zklogin/sig.js";
import { sealSession, openSession, SESSION_COOKIE, STATE_COOKIE } from "../../apps/api/src/zklogin/session.js";

const client = new SuiClient({ url: FULLNODE_URL });
const WEB_URL = process.env.WEB_URL ?? "http://localhost:5174";
const secure = process.env.NODE_ENV === "production";

function cookie(name: string, value: string, maxAge: number): string {
  const bits = [`${name}=${value}`, "HttpOnly", "Path=/", "SameSite=Lax", `Max-Age=${maxAge}`];
  if (secure) bits.push("Secure");
  return bits.join("; ");
}
function clearCookie(name: string): string {
  const bits = [`${name}=`, "HttpOnly", "Path=/", "SameSite=Lax", "Max-Age=0"];
  if (secure) bits.push("Secure");
  return bits.join("; ");
}
function addCookie(res: VercelResponse, c: string) {
  const prev = res.getHeader("Set-Cookie");
  const list = Array.isArray(prev) ? prev : prev ? [String(prev)] : [];
  list.push(c);
  res.setHeader("Set-Cookie", list);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const segs = req.query.path;
  const route = (Array.isArray(segs) ? segs[segs.length - 1] : segs ?? "").toString();
  const cookies = req.cookies ?? {};

  try {
    // ── GET /epoch ──
    if (route === "epoch") {
      const sys = await client.getLatestSuiSystemState();
      return res.json({ epoch: Number(sys.epoch) });
    }

    // ── GET /login?nonce= ──
    if (route === "login") {
      const nonce = (req.query.nonce as string) || "";
      if (!nonce) return res.status(400).json({ error: "missing nonce" });
      const state = randomBytes(16).toString("hex");
      addCookie(res, cookie(STATE_COOKIE, state, 600));
      return res.redirect(302, googleAuthUrl({ nonce, state }));
    }

    // ── GET /callback?code&state ──
    if (route === "callback") {
      const code = req.query.code as string | undefined;
      const state = req.query.state as string | undefined;
      const expected = cookies[STATE_COOKIE];
      if (!code || !state || !expected || state !== expected) {
        return res.redirect(302, `${WEB_URL}/?error=oauth_state`);
      }
      try {
        const idToken = await exchangeCodeForIdToken(code);
        const claims = await verifyGoogleIdToken(idToken);
        const { address, salt } = await getZkLoginWallet(idToken, claims.sub);
        addCookie(
          res,
          cookie(
            SESSION_COOKIE,
            sealSession({ jwt: idToken, salt, address, email: claims.email, name: claims.name }),
            60 * 60 * 24,
          ),
        );
        addCookie(res, clearCookie(STATE_COOKIE));
        return res.redirect(302, `${WEB_URL}/?signedin=1`);
      } catch {
        return res.redirect(302, `${WEB_URL}/?error=oauth_exchange`);
      }
    }

    // ── GET /me ──
    if (route === "me") {
      const s = openSession(cookies[SESSION_COOKIE]);
      return res.json(
        s ? { signedIn: true, address: s.address, email: s.email ?? null, name: s.name ?? null } : { signedIn: false },
      );
    }

    // ── POST /logout ──
    if (route === "logout") {
      addCookie(res, clearCookie(SESSION_COOKIE));
      return res.json({ ok: true });
    }

    // ── GET /market ──
    if (route === "market") {
      const o = pickClimbOracle(await fetchOracles(), { asset: "BTC", minMsLeft: 120_000 });
      if (!o) return res.status(503).json({ error: "no active climb right now" });
      const tick = await latestPrice(client, o.oracle_id);
      if (!tick) return res.status(503).json({ error: "no live price yet" });
      const minStrike = BigInt(o.min_strike);
      const ts = BigInt(o.tick_size);
      const strike = minStrike + ((tick.spotRaw - minStrike + ts / 2n) / ts) * ts;
      return res.json({
        oracleId: o.oracle_id,
        expiry: o.expiry,
        strike: strike.toString(),
        spot: tick.spot,
        spotRaw: tick.spotRaw.toString(),
        msLeft: o.expiry - Date.now(),
      });
    }

    // ── GET /wallet ── (auth)
    if (route === "wallet") {
      const s = openSession(cookies[SESSION_COOKIE]);
      if (!s) return res.status(401).json({ error: "not signed in" });
      const [sui, dusdc, evs] = await Promise.all([
        client.getBalance({ owner: s.address }),
        client.getBalance({ owner: s.address, coinType: DUSDC_TYPE }),
        client.queryEvents({ query: { Sender: s.address }, order: "descending", limit: 50 }),
      ]);
      const created = evs.data.find((e) => e.type === EVENT.managerCreated);
      const managerId = created ? (created.parsedJson as { manager_id: string }).manager_id : null;
      const managerBalance = managerId ? (await readManagerBalance(client, managerId).catch(() => 0n)).toString() : "0";
      return res.json({ address: s.address, sui: sui.totalBalance, dusdc: dusdc.totalBalance, managerId, managerBalance });
    }

    // ── POST /prepare ── (auth) build a game tx, return BCS bytes to sign
    if (route === "prepare") {
      const s = openSession(cookies[SESSION_COOKIE]);
      if (!s) return res.status(401).json({ error: "not signed in" });
      const body = (req.body ?? {}) as {
        action: string;
        managerId?: string;
        amount?: string | number;
        market?: MarketRef;
        quantity?: string | number;
      };
      let tx: Transaction;
      if (body.action === "createManager") {
        tx = buildCreateManager();
      } else if (body.action === "deposit") {
        tx = new Transaction();
        const coins = await client.getCoins({ owner: s.address, coinType: DUSDC_TYPE });
        if (coins.data.length === 0) return res.status(400).json({ error: "no DUSDC to load" });
        const primary = coins.data[0].coinObjectId;
        if (coins.data.length > 1)
          tx.mergeCoins(tx.object(primary), coins.data.slice(1).map((c) => tx.object(c.coinObjectId)));
        const [credit] = tx.splitCoins(tx.object(primary), [tx.pure.u64(BigInt(body.amount!))]);
        buildDeposit({ managerId: body.managerId!, coin: credit, tx });
      } else if (body.action === "withdraw") {
        tx = buildWithdraw({ managerId: body.managerId!, amount: BigInt(body.amount!), recipient: s.address });
      } else if (body.action === "mint") {
        tx = buildMint({ managerId: body.managerId!, market: body.market!, quantity: BigInt(body.quantity!) });
      } else if (body.action === "redeem") {
        tx = buildRedeem({ managerId: body.managerId!, market: body.market!, quantity: BigInt(body.quantity!) });
      } else {
        return res.status(400).json({ error: "unknown action" });
      }
      tx.setSender(s.address);
      const txBytes = await tx.build({ client });
      return res.json({ txBytesB64: toBase64(txBytes) });
    }

    // ── POST /execute ── (auth) assemble zkLogin signature + submit
    if (route === "execute") {
      const s = openSession(cookies[SESSION_COOKIE]);
      if (!s) return res.status(401).json({ error: "not signed in" });
      const { txBytesB64, userSignature, ephemeralPubKeyB64, maxEpoch, randomness } = (req.body ?? {}) as {
        txBytesB64: string;
        userSignature: string;
        ephemeralPubKeyB64: string;
        maxEpoch: number;
        randomness: string;
      };
      if (!txBytesB64 || !userSignature || !ephemeralPubKeyB64 || maxEpoch == null || !randomness) {
        return res.status(400).json({ error: "missing fields" });
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
        const r = await client.executeTransactionBlock({
          transactionBlock: fromBase64(txBytesB64),
          signature,
          options: { showEffects: true, showObjectChanges: true, showEvents: true },
        });
        if (r.effects?.status.status !== "success") {
          return res.status(502).json({ error: "tx failed", detail: r.effects?.status.error ?? "unknown" });
        }
        return res.json({
          digest: r.digest,
          objectChanges: r.objectChanges ?? [],
          events: (r.events ?? []).map((e) => ({ type: e.type, parsedJson: e.parsedJson })),
        });
      } catch (e) {
        return res.status(502).json({ error: "execute failed", detail: (e as Error).message });
      }
    }

    return res.status(404).json({ error: "not found" });
  } catch (e) {
    return res.status(500).json({ error: (e as Error).message });
  }
}
