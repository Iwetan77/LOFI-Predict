/**
 * Art slots. Drop a file into public/art with the matching name and it appears;
 * if a file is missing, the renderer falls back to a drawn placeholder. Keeps
 * the game fully playable with or without final art.
 */

import { Assets, type Texture } from "pixi.js";

export const ART = {
  lofi: "/art/lofi.png", // idle / standing placeholder
  lofiClimb: "/art/lofi_climb.png",
  lofiClimb2: "/art/lofi_climb2.png", // opposite limbs — alternate for a climb cycle
  lofiFall: "/art/lofi_fall.png",
  lofiCheer: "/art/lofi_cheer.png",
  lofiFly: "/art/lofi_fly.png",
  lofiWait: "/art/lofi_wait.png", // clinging to the wall between calls (timer ran out)
  btc: "/art/token_btc.svg",
  sky: "/art/sky.jpg",
  skyNight: "/art/sky_night.jpg", // swaps in every 7 floors, then back to day
  stones: ["/art/stone1.png", "/art/stone2.png"],
  /** 5 distinct towers; the climb cycles through them so all get seen. */
  building: (n: number) => `/art/building_tier${((((n - 1) % 5) + 5) % 5) + 1}.png`,
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
