// Quick liveness check for the relay API. Usage: node scripts/check.mjs
const BASE = process.env.BASE ?? "http://127.0.0.1:8787";

const j = async (p) => (await fetch(`${BASE}${p}`)).json();

const { buildings } = await j("/buildings");
console.log(`buildings: ${buildings.length} joinable`);
const b = buildings[0];
console.log(`  soonest: ${b.asset} oracle ${b.oracleId.slice(0, 10)}… (${(b.msLeft / 60000).toFixed(2)} min left)`);

// give the tape a moment to have polled this oracle
await new Promise((r) => setTimeout(r, 2500));
const { tick } = await j(`/buildings/${b.oracleId}/price`);
console.log(`price tick: ${tick ? `spot ${tick.spot.toFixed(2)} @ ${new Date(tick.timestamp).toISOString()}` : "none yet"}`);

const lb = await j("/leaderboard");
console.log(`leaderboard: ${lb.scores.length} scores`);
console.log(tick ? "OK" : "WARN: no tick (oracle may be idle)");
