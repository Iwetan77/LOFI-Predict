import { useEffect, useRef, useState } from "react";
import { useSuiClient } from "@mysten/dapp-kit";
import { useGame } from "../store";
import { SimPriceSource, LivePriceSource, type PriceSource } from "./priceSource";
import { useSigner } from "../auth/useSigner";
import { type MarketRef } from "../auth/useZkLogin";

/** Position size minted per credit of stake (6-dec). stake $5 → 5.0 position. */
const QTY_PER_STAKE = 1_000_000n;
const qtyOf = (stake: number) => (BigInt(Math.max(1, Math.round(stake))) * QTY_PER_STAKE).toString();

/** Pull a 6-dec DUSDC amount field out of the first matching on-chain event. */
function eventAmount(events: { type: string; parsedJson: unknown }[], endsWith: string, fields: string[]): number {
  const e = events.find((ev) => ev.type.endsWith(endsWith));
  if (!e) return 0;
  const j = e.parsedJson as Record<string, string>;
  for (const f of fields) if (j[f] != null) return Number(j[f]) / 1e6;
  return 0;
}

/**
 * Owns the round lifecycle for both modes. Each round is ONE call, live for its
 * whole clock (ROUND_MS): LOFI can climb through several buildings on a streak
 * (each one a visual/floor-combo milestone, see store.bankBuilding), and the
 * call only resolves when he's knocked off (lose a life), the player grabs the
 * ledge early (cash out, ends the run), or the clock simply runs out (banks
 * automatically, then offers the in-game continue/exit menu — same as a win
 * used to). PixiClimb reports the fall moment via the store; we resolve it here
 * (redeem on-chain in real mode either way) and route accordingly.
 */
export function useEngine() {
  const { send, getMarket } = useSigner();
  const client = useSuiClient();
  const sendRef = useRef(send);
  const getMarketRef = useRef(getMarket);
  sendRef.current = send;
  getMarketRef.current = getMarket;

  const simRef = useRef<SimPriceSource>();
  const liveRef = useRef<LivePriceSource>();
  const offRef = useRef<() => void>();
  const armTokenRef = useRef(0);
  const [liveSpot, setLiveSpot] = useState(62000);

  if (!simRef.current) simRef.current = new SimPriceSource(62000);

  const subscribeTo = (src: PriceSource) => {
    offRef.current?.();
    offRef.current = src.subscribe((tick) => {
      setLiveSpot(tick.spot);
      const st = useGame.getState();
      if (st.phase === "CLIMB") st.onTick(tick.spot);
    });
  };

  useEffect(() => {
    const sim = simRef.current!;
    sim.start();
    subscribeTo(sim);

    // Anchor the practice walk to the real BTC price (re-synced periodically).
    let stop = false;
    const anchor = async () => {
      try {
        const m = await getMarketRef.current();
        if (!stop && useGame.getState().phase !== "CLIMB") sim.setSpot(m.spot);
      } catch {
        /* offline / no market — the sim keeps walking on its own */
      }
    };
    void anchor();
    const resync = setInterval(anchor, 15_000);

    return () => {
      stop = true;
      clearInterval(resync);
      offRef.current?.();
      sim.stop();
      liveRef.current?.stop();
    };
  }, []);

  // Watch for the top/fall moment PixiClimb signals, and resolve the round.
  // Also auto-bank a call once its visible clock runs out — keeps every round
  // bounded so it can never outlast the window we minted the position for.
  useEffect(() => {
    const id = setInterval(() => {
      const st = useGame.getState();
      if (st.phase !== "CLIMB") return;
      if (st.pendingOutcome) {
        const o = st.pendingOutcome;
        useGame.getState().signalOutcome(null);
        void resolveRound(o);
      } else if (st.roundEndsAt && Date.now() >= st.roundEndsAt) {
        void resolveRound("TIMEOUT");
      }
    }, 100);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- start a round -------------------------------------------------------

  const beginPlayRound = () => {
    const spot = simRef.current!.current() ?? 62000;
    useGame.getState().startRound(spot);
  };

  const beginRealRound = async () => {
    const g = useGame.getState();
    if (!g.managerId) {
      g.setTx("error", "load credits first");
      g.setPhase("FUND");
      return;
    }
    // Token guards the whole arm→mint→climb sequence. The market fetch and the
    // wallet signature are slow and out of our control; if the player cancels
    // (or starts another round) while one is in flight, this lets us drop the
    // stale result instead of yanking them back into a climb after the fact.
    const myToken = ++armTokenRef.current;
    g.armRound(liveSpot); // "get ready" beat while the mint is in flight
    g.setTx("pending");
    try {
      const market = await getMarketRef.current();
      if (armTokenRef.current !== myToken) return;
      const mref: MarketRef = {
        oracleId: market.oracleId,
        expiry: market.expiry,
        strike: market.strike,
        isUp: g.direction === "UP",
      };
      const res = await sendRef.current({ action: "mint", managerId: g.managerId, market: mref, quantity: qtyOf(g.stake) });
      if (armTokenRef.current !== myToken) return; // cancelled while signing — discard
      const cost = eventAmount(res.events, "PositionMinted", ["cost"]);

      liveRef.current?.stop();
      liveRef.current = new LivePriceSource(market.oracleId, client, market.spot);
      liveRef.current.start();
      subscribeTo(liveRef.current);

      const st = useGame.getState();
      st.setMarket(mref);
      st.syncBalance(st.credits - cost);
      st.setTx("idle", null, res.digest);
      st.startRound(market.spot);
    } catch (e) {
      if (armTokenRef.current !== myToken) return;
      const st = useGame.getState();
      st.setTx("error", (e as Error).message);
      st.setPhase("PICK");
    }
  };

  // Bail out of a slow/stuck "readying" beat (e.g. the wallet never prompted).
  // Invalidates the in-flight arm so a late result can't drag the player back.
  const cancelArm = () => {
    armTokenRef.current++;
    const st = useGame.getState();
    st.setTx("idle");
    st.setPhase("PICK");
  };

  // ---- resolve a round (fall / cash-out / clock ran out) -------------------

  const resolveRound = async (reason: "FALL" | "CASHOUT" | "TIMEOUT") => {
    const g = useGame.getState();
    if (g.phase !== "CLIMB") return; // already resolving
    const outcome: "LOSS" | "CASHOUT" = reason === "FALL" ? "LOSS" : "CASHOUT";
    // A fall forfeits the whole call, banked buildings included. Otherwise you
    // keep everything earned across however many buildings this one call cleared.
    const floorsGained = outcome === "LOSS" ? 0 : g.liveFloors;

    g.setPhase("RESOLVE");
    liveRef.current?.stop();
    subscribeTo(simRef.current!);

    // Real mode: redeem the position; the payout lands in the manager balance.
    let chainCredits: number | undefined;
    if (g.realMode && g.market && g.managerId) {
      g.setTx("pending");
      try {
        const res = await sendRef.current({ action: "redeem", managerId: g.managerId, market: g.market, quantity: qtyOf(g.stake) });
        const payout = eventAmount(res.events, "PositionRedeemed", ["payout", "amount"]);
        chainCredits = useGame.getState().credits + payout;
        useGame.getState().setTx("idle", null, res.digest);
      } catch (e) {
        useGame.getState().setTx("error", (e as Error).message);
      }
      useGame.getState().setMarket(null);
    }

    // Play-money economy uses the credited/staked arithmetic; real uses chain.
    const stake = g.stake;
    const credited = outcome === "CASHOUT" ? g.liveCashOut : 0;
    const result = g.realMode
      ? { outcome, floorsGained, credited: 0, staked: 0, auto: reason === "TIMEOUT" }
      : { outcome, floorsGained, credited, staked: stake, auto: reason === "TIMEOUT" };
    const lives = useGame.getState().applyResult(result, chainCredits);

    // Grabbing the ledge early ENDS the run — bank everything back to the
    // wallet, then show the run summary. No continuing after a manual cash-out.
    if (reason === "CASHOUT") {
      const c = useGame.getState();
      if (c.realMode && c.managerId && c.credits > 0) {
        try {
          await sendRef.current({ action: "withdraw", managerId: c.managerId, amount: String(Math.floor(c.credits * 1e6)) });
          useGame.getState().syncBalance(0);
        } catch (e) {
          useGame.getState().setTx("error", (e as Error).message);
        }
      }
      window.setTimeout(() => useGame.getState().setPhase("GAME_OVER"), 1200);
      return;
    }

    // A FALL ends the run outright. A clean TIMEOUT (the clock ran out without
    // falling) offers the in-game continue/exit menu — the only other moment
    // you're asked a new question.
    window.setTimeout(() => {
      if (reason === "FALL" || lives <= 0) useGame.getState().setPhase("GAME_OVER");
      else useGame.getState().nextRound();
    }, reason === "FALL" ? 1500 : 1400);
  };

  // ---- public handlers (mode-aware) ---------------------------------------

  const startRound = () => {
    if (useGame.getState().realMode) void beginRealRound();
    else beginPlayRound();
  };

  const cashOut = () => {
    if (useGame.getState().phase === "CLIMB") void resolveRound("CASHOUT");
  };

  // Leave the run: pull all winnings back to the wallet (real mode), go home.
  const exitGame = async () => {
    const g = useGame.getState();
    if (g.realMode && g.managerId && g.credits > 0) {
      g.setTx("pending");
      try {
        await sendRef.current({ action: "withdraw", managerId: g.managerId, amount: String(Math.floor(g.credits * 1e6)) });
        useGame.getState().syncBalance(0);
        useGame.getState().setTx("idle");
      } catch (e) {
        useGame.getState().setTx("error", (e as Error).message);
      }
    }
    useGame.getState().setPhase("BOOT");
  };

  return { liveSpot, startRound, cashOut, exitGame, cancelArm };
}
