/**
 * Art slots. Drop a file into public/art with the matching name and it appears;
 * if a file is missing, the renderer falls back to a drawn placeholder. Keeps
 * the game fully playable with or without final art.
 */

import { Assets, type Texture } from "pixi.js";

export const ART = {
  lofi: "/art/lofi.png",
  btc: "/art/token_btc.svg",
  stones: ["/art/stone1.png", "/art/stone2.png"],
  building: (tier: number) => `/art/building_tier${Math.min(5, Math.max(1, tier))}.png`,
};

/** Load a texture, or null if it isn't there (so callers can fall back). */
export async function tryLoad(url: string): Promise<Texture | null> {
  try {
    return await Assets.load(url);
  } catch {
    return null;
  }
}

export async function tryLoadAll(urls: string[]): Promise<(Texture | null)[]> {
  return Promise.all(urls.map(tryLoad));
}
