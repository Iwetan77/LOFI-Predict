/**
 * Ground truth for DeepBook Predict on Sui TESTNET (branch predict-testnet-4-16).
 *
 * Every on-chain identifier the game touches lives here — no raw
 * "package::module::function" strings are scattered through the codebase.
 * Verified 2026-06-23 against the live registry, fullnode, and predict server.
 *
 * NOTE: this deployment is BTC-only. The data model stays asset-agnostic so
 * additional assets light up automatically if their oracles ever appear, but
 * only BTC markets exist on-chain today.
 */

export const NETWORK = "testnet" as const;

export const FULLNODE_URL = "https://fullnode.testnet.sui.io:443";
export const PREDICT_SERVER = "https://predict-server.testnet.mystenlabs.com";

/** Predict package — the published `deepbook_predict` Move package. */
export const PREDICT_PACKAGE =
  "0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138";

/** The shared `Predict` object (one per deployment). */
export const PREDICT_OBJECT =
  "0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a";

/** The `Registry` shared object. */
export const REGISTRY_OBJECT =
  "0x43af14fed5480c20ff77e2263d5f794c35b9fab7e2212903127062f4fe2a6e64";

/** Quote/settlement asset: DUSDC, 6 decimals. */
export const DUSDC_TYPE =
  "0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC";
export const DUSDC_DECIMALS = 6;

/** PLP coin type (provider liquidity — not used by the game loop, kept for completeness). */
export const PLP_TYPE = `${PREDICT_PACKAGE}::plp::PLP`;

/** Sui system clock object — required by mint/redeem/preview. */
export const CLOCK_OBJECT = "0x6";

/** Oracle/forward prices are quoted with 9 decimals. */
export const PRICE_DECIMALS = 9;

/** Fully-qualified Move targets. */
export const TARGET = {
  createManager: `${PREDICT_PACKAGE}::predict::create_manager`,
  getTradeAmounts: `${PREDICT_PACKAGE}::predict::get_trade_amounts`,
  askBounds: `${PREDICT_PACKAGE}::predict::ask_bounds`,
  mint: `${PREDICT_PACKAGE}::predict::mint`,
  redeem: `${PREDICT_PACKAGE}::predict::redeem`,
  redeemPermissionless: `${PREDICT_PACKAGE}::predict::redeem_permissionless`,
  managerDeposit: `${PREDICT_PACKAGE}::predict_manager::deposit`,
  managerWithdraw: `${PREDICT_PACKAGE}::predict_manager::withdraw`,
  managerBalance: `${PREDICT_PACKAGE}::predict_manager::balance`,
  marketKeyNew: `${PREDICT_PACKAGE}::market_key::new`,
} as const;

/** Move event type strings (the live game data — NOT the 404 REST routes). */
export const EVENT = {
  pricesUpdated: `${PREDICT_PACKAGE}::oracle::OraclePricesUpdated`,
  settled: `${PREDICT_PACKAGE}::oracle::OracleSettled`,
  sviUpdated: `${PREDICT_PACKAGE}::oracle::OracleSVIUpdated`,
  activated: `${PREDICT_PACKAGE}::oracle::OracleActivated`,
  positionMinted: `${PREDICT_PACKAGE}::predict::PositionMinted`,
  positionRedeemed: `${PREDICT_PACKAGE}::predict::PositionRedeemed`,
  managerCreated: `${PREDICT_PACKAGE}::predict_manager::PredictManagerCreated`,
} as const;

/** Helpers for the 9-decimal price scale used by oracles. */
export const priceToFloat = (raw: string | bigint | number): number =>
  Number(BigInt(raw)) / 10 ** PRICE_DECIMALS;

/** Helpers for the 6-decimal DUSDC "credits" scale. */
export const dusdcToFloat = (raw: string | bigint | number): number =>
  Number(BigInt(raw)) / 10 ** DUSDC_DECIMALS;
export const floatToDusdc = (credits: number): bigint =>
  BigInt(Math.round(credits * 10 ** DUSDC_DECIMALS));
