/**
 * LOFI PREDICT relay API. Reads the public Predict server + Sui events, relays a
 * live price tape over WebSocket, serves the building list and leaderboard.
 * Custodies nothing — all value flow is on-chain via the player's wallet.
 */

import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { fetchOracles, type RawOracle } from "@lofi/sui";
import { Tape } from "./tape.js";
import { toBuildings } from "./buildings.js";
import { Leaderboard } from "./leaderboard.js";

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? "0.0.0.0";

const tape = new Tape();
const board = new Leaderboard();

// Tiny TTL cache for the oracle/building list (the public server is the source).
let oracleCache: { at: number; data: RawOracle[] } | null = null;
async function getOracles(): Promise<RawOracle[]> {
  if (oracleCache && Date.now() - oracleCache.at < 4000) return oracleCache.data;
  const data = await fetchOracles();
  oracleCache = { at: Date.now(), data };
  return data;
}

async function main() {
  const app = Fastify({ logger: true });
  await app.register(cors, { origin: true });
  await app.register(websocket);

  app.get("/health", async () => ({ ok: true, ts: Date.now() }));

  app.get("/buildings", async () => {
    const buildings = toBuildings(await getOracles());
    return { buildings };
  });

  app.get<{ Params: { oracleId: string } }>("/buildings/:oracleId/price", async (req) => {
    const tick = tape.latestFor(req.params.oracleId);
    return { tick: tick ? { ...tick, spotRaw: tick.spotRaw.toString() } : null };
  });

  app.get("/leaderboard", async () => ({ scores: board.top() }));

  app.post<{ Body: { name?: string; floor?: number } }>("/leaderboard", async (req, reply) => {
    const { name, floor } = req.body ?? {};
    if (typeof floor !== "number" || floor < 0) {
      return reply.code(400).send({ error: "floor must be a non-negative number" });
    }
    return { score: board.submit(name ?? "LOFI", Math.floor(floor)) };
  });

  // Live tape: client sends {subscribe: oracleId}; server pushes price/settle frames.
  app.get("/live", { websocket: true }, (socket) => {
    let oracleId: string | null = null;

    const offPrice = tape.onPrice((t) => {
      if (t.oracleId === oracleId) socket.send(JSON.stringify({ type: "price", ...t, spotRaw: t.spotRaw.toString() }));
    });
    const offSettle = tape.onSettle((s) => {
      if (s.oracleId === oracleId)
        socket.send(JSON.stringify({ type: "settle", ...s, settlementRaw: s.settlementRaw.toString() }));
    });

    socket.on("message", (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (typeof msg.subscribe === "string") {
          oracleId = msg.subscribe;
          const last = tape.latestFor(msg.subscribe);
          if (last) socket.send(JSON.stringify({ type: "price", ...last, spotRaw: last.spotRaw.toString() }));
        }
      } catch {
        /* ignore malformed frames */
      }
    });

    socket.on("close", () => {
      offPrice();
      offSettle();
    });
  });

  tape.start();
  await app.listen({ port: PORT, host: HOST });
  app.log.info(`LOFI CLIMB relay listening on ${HOST}:${PORT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
