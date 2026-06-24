/** Prints the live values needed to run a real mint->redeem via the Sui CLI. */
import { SuiClient } from "@mysten/sui/client";
import { FULLNODE_URL, DUSDC_TYPE, fetchOracles, pickClimbOracle, latestPrice } from "../src/index.js";

const SENDER = process.env.SENDER ?? "0x20af017ce1efd98c3572537104c436bd96ab2fa31c090ed2f938f4a94c8c42dd";

(async () => {
  const client = new SuiClient({ url: FULLNODE_URL });
  const oracles = await fetchOracles();
  const o = pickClimbOracle(oracles, { asset: "BTC", minMsLeft: 180_000 });
  if (!o) throw new Error("no BTC oracle with >3min left");
  const tick = await latestPrice(client, o.oracle_id);
  if (!tick) throw new Error("no price tick");
  const minStrike = BigInt(o.min_strike);
  const t = BigInt(o.tick_size);
  const strike = minStrike + ((tick.spotRaw - minStrike + t / 2n) / t) * t;
  const coins = await client.getCoins({ owner: SENDER, coinType: DUSDC_TYPE });
  const coin = coins.data[0];
  console.log(`ORACLE=${o.oracle_id}`);
  console.log(`EXPIRY=${o.expiry}`);
  console.log(`STRIKE=${strike.toString()}`);
  console.log(`SPOT=${tick.spot.toFixed(2)}`);
  console.log(`DUSDC_COIN=${coin?.coinObjectId ?? "NONE"}`);
  console.log(`DUSDC_BAL=${coin?.balance ?? "0"}`);
})().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
