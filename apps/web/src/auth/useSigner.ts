import { useCallback } from "react";
import { Transaction } from "@mysten/sui/transactions";
import type { SuiClient } from "@mysten/sui/client";
import { useCurrentAccount, useDisconnectWallet, useSignAndExecuteTransaction, useSuiClient } from "@mysten/dapp-kit";
import {
  DUSDC_TYPE,
  EVENT,
  buildCreateManager,
  buildDeposit,
  buildWithdraw,
  buildMint,
  buildRedeem,
  readManagerBalance,
  fetchOracles,
  pickClimbOracle,
  latestPrice,
} from "@lofi/sui";
import { useZkLogin, type ClimbMarket, type GameAction, type MarketRef, type TxResult, type WalletState } from "./useZkLogin";

type SignerMode = "wallet" | "zk" | null;

function toRef(m: MarketRef) {
  return { oracleId: m.oracleId, expiry: m.expiry, strike: BigInt(m.strike), isUp: m.isUp };
}

/** Build a game transaction client-side (wallet path mirrors the server's /prepare). */
async function buildTx(client: SuiClient, sender: string, action: GameAction): Promise<Transaction> {
  if (action.action === "createManager") return buildCreateManager();
  if (action.action === "deposit") {
    const tx = new Transaction();
    const coins = await client.getCoins({ owner: sender, coinType: DUSDC_TYPE });
    if (coins.data.length === 0) throw new Error("no DUSDC to load");
    const primary = coins.data[0].coinObjectId;
    if (coins.data.length > 1) {
      tx.mergeCoins(tx.object(primary), coins.data.slice(1).map((c) => tx.object(c.coinObjectId)));
    }
    const [credit] = tx.splitCoins(tx.object(primary), [tx.pure.u64(BigInt(action.amount))]);
    buildDeposit({ managerId: action.managerId, coin: credit, tx });
    return tx;
  }
  if (action.action === "withdraw") {
    return buildWithdraw({ managerId: action.managerId, amount: BigInt(action.amount), recipient: sender });
  }
  if (action.action === "mint") {
    return buildMint({ managerId: action.managerId, market: toRef(action.market), quantity: BigInt(action.quantity) });
  }
  if (action.action === "redeem") {
    return buildRedeem({ managerId: action.managerId, market: toRef(action.market), quantity: BigInt(action.quantity) });
  }
  throw new Error("unknown action");
}

/**
 * One signer interface over two sign-in paths (build prompt: both on testnet):
 *  - wallet: a connected Sui wallet signs+submits via dapp-kit (lowest friction
 *    for players who already hold testnet SUI/DUSDC).
 *  - zk: Google/zkLogin via the relay routes (no wallet to install).
 * A connected wallet takes precedence. The game loop only sees `send`.
 */
export function useSigner() {
  const zk = useZkLogin();
  const account = useCurrentAccount();
  const client = useSuiClient();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const { mutate: disconnect } = useDisconnectWallet();

  const walletAddress = account?.address ?? null;
  const mode: SignerMode = walletAddress ? "wallet" : zk.user ? "zk" : null;
  const address = walletAddress ?? zk.user?.address ?? null;

  const walletSend = useCallback(
    async (action: GameAction): Promise<TxResult> => {
      const tx = await buildTx(client, walletAddress!, action);
      const { digest } = await signAndExecute({ transaction: tx });
      const full = await client.waitForTransaction({
        digest,
        options: { showEffects: true, showEvents: true },
      });
      if (full.effects?.status.status !== "success") {
        throw new Error(full.effects?.status.error ?? "transaction failed");
      }
      return {
        digest,
        objectChanges: [],
        events: (full.events ?? []).map((e) => ({ type: e.type, parsedJson: e.parsedJson })),
      };
    },
    [client, walletAddress, signAndExecute],
  );

  const walletGetWallet = useCallback(async (): Promise<WalletState> => {
    const addr = walletAddress!;
    const [sui, dusdc, evs] = await Promise.all([
      client.getBalance({ owner: addr }),
      client.getBalance({ owner: addr, coinType: DUSDC_TYPE }),
      client.queryEvents({ query: { Sender: addr }, order: "descending", limit: 50 }),
    ]);
    const created = evs.data.find((e) => e.type === EVENT.managerCreated);
    const managerId = created ? (created.parsedJson as { manager_id: string }).manager_id : null;
    const managerBalance = managerId ? (await readManagerBalance(client, managerId).catch(() => 0n)).toString() : "0";
    return { address: addr, sui: sui.totalBalance, dusdc: dusdc.totalBalance, managerId, managerBalance };
  }, [client, walletAddress]);

  const signOut = useCallback(async () => {
    if (walletAddress) disconnect();
    else await zk.signOut();
  }, [walletAddress, disconnect, zk]);

  // The current BTC climb market — read straight from the public Predict server
  // + fullnode (both CORS-open), so it needs no backend of ours.
  const getMarket = useCallback(async (): Promise<ClimbMarket> => {
    const o = pickClimbOracle(await fetchOracles(), { asset: "BTC", minMsLeft: 120_000 });
    if (!o) throw new Error("no active climb right now");
    const tick = await latestPrice(client, o.oracle_id);
    if (!tick) throw new Error("no live price yet");
    const minStrike = BigInt(o.min_strike);
    const ts = BigInt(o.tick_size);
    const strike = minStrike + ((tick.spotRaw - minStrike + ts / 2n) / ts) * ts;
    return {
      oracleId: o.oracle_id,
      expiry: o.expiry,
      strike: strike.toString(),
      spot: tick.spot,
      spotRaw: tick.spotRaw.toString(),
      msLeft: o.expiry - Date.now(),
    };
  }, [client]);

  return {
    mode,
    address,
    signedIn: !!address,
    name: zk.user?.name ?? null,
    send: mode === "wallet" ? walletSend : zk.send,
    getWallet: mode === "wallet" ? walletGetWallet : zk.getWallet,
    getMarket, // client-side: Predict server + fullnode, no backend needed
    googleSignIn: zk.signIn,
    signOut,
  };
}
