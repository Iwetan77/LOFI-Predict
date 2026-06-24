/**
 * Real testnet mint -> redeem cycle on DeepBook Predict, signed with the CLI
 * key (passed via SUI_PK env; never logged). Proves the full on-chain loop.
 */
import { SuiClient } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import {
  FULLNODE_URL,
  buildMint,
  buildRedeem,
  fetchOracles,
  pickClimbOracle,
  latestPrice,
  dusdcToFloat,
  type MarketRef,
} from "../src/index.js";

const MANAGER = process.env.MANAGER ?? "0x3edda5bd9e6aabcb39a4e0163e645a638cfde270ed94af1b8b137dd76451a8f0";

(async () => {
  const kp = Ed25519Keypair.fromSecretKey(process.env.SUI_PK!);
  const addr = kp.getPublicKey().toSuiAddress();
  const client = new SuiClient({ url: FULLNODE_URL });

  const o = pickClimbOracle(await fetchOracles(), { asset: "BTC", minMsLeft: 180_000 });
  if (!o) throw new Error("no oracle");
  const tick = await latestPrice(client, o.oracle_id);
  if (!tick) throw new Error("no tick");
  const minStrike = BigInt(o.min_strike);
  const ts = BigInt(o.tick_size);
  const strike = minStrike + ((tick.spotRaw - minStrike + ts / 2n) / ts) * ts;
  const market: MarketRef = { oracleId: o.oracle_id, expiry: o.expiry, strike, isUp: true };
  const qty = 1_000_000n;
  console.log(`signer ${addr}`);
  console.log(`oracle ${o.oracle_id}  strike ${(Number(strike) / 1e9).toFixed(0)}  spot ${tick.spot.toFixed(0)}`);

  const run = async (label: string, tx: any) => {
    tx.setSender(addr);
    const res = await client.signAndExecuteTransaction({
      transaction: tx,
      signer: kp,
      options: { showEffects: true, showEvents: true },
    });
    await client.waitForTransaction({ digest: res.digest });
    const status = res.effects?.status.status;
    console.log(`${label}: ${status}  ${res.digest}`);
    if (status !== "success") console.log(`   err: ${res.effects?.status.error}`);
    for (const e of res.events ?? []) {
      const t = e.type.split("::").pop();
      if (t === "PositionMinted" || t === "PositionRedeemed") {
        const j: any = e.parsedJson;
        console.log(`   ${t}: qty ${j.quantity} ${t === "PositionMinted" ? `cost ${dusdcToFloat(j.cost)}` : `payout ${dusdcToFloat(j.payout ?? j.amount ?? 0)}`}`);
      }
    }
    return status;
  };

  const m = await run("MINT (place UP call)", buildMint({ managerId: MANAGER, market, quantity: qty }));
  if (m !== "success") process.exit(1);
  const r = await run("REDEEM (cash out)", buildRedeem({ managerId: MANAGER, market, quantity: qty }));
  if (r !== "success") process.exit(1);
  console.log("FULL CYCLE OK");
})().catch((e) => {
  console.error("CYCLE FAILED:", e.message ?? e);
  process.exit(1);
});
