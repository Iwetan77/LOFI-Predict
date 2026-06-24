import { useEffect, useRef } from "react";
import { Application, Container, Graphics, Sprite, Texture } from "pixi.js";
import { useGame } from "../store";
import { FLOORS_PER_BUILDING } from "./phases";
import { ART, tryLoad, tryLoadAll } from "./art";

/**
 * PixiJS climb. Layers: sky backdrop → a single fixed building landmark for the
 * current tier → LOFI climbing its face → falling-stone / dust FX. Loads the
 * art slots and falls back to drawn primitives if a file is missing.
 *
 * Reads the store every frame:
 *  - prog (signed): >0 winning → LOFI climbs, dust puffs.
 *                   <0 losing  → stones rain, red tint, screen shake.
 *  - floor + liveFloors: position up the current building (one tier per
 *    FLOORS_PER_BUILDING floors).
 *  - buildingTier: which landmark to show.
 */
export function PixiClimb() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current!;
    let app: Application | null = null;
    let inited = false;
    let destroyed = false;

    const stones: { s: Sprite | Graphics; vy: number }[] = [];
    const dust: { g: Graphics; life: number }[] = [];

    (async () => {
      const a = new Application();
      await a.init({ resizeTo: host, backgroundAlpha: 0, antialias: false, preserveDrawingBuffer: true });
      if (destroyed) {
        a.destroy(true);
        return;
      }
      app = a;
      inited = true;
      host.appendChild(a.canvas);
      a.start();

      const W = () => a.screen.width;
      const H = () => a.screen.height;

      const [lofiTex, skyTex, stoneTexes] = await Promise.all([
        tryLoad(ART.lofi),
        tryLoad(ART.sky),
        tryLoadAll(ART.stones),
      ]);
      const stonePool = stoneTexes.filter((t): t is Texture => !!t);
      const buildingCache = new Map<number, Texture | null>();
      let curTier = -1;

      // ── sky backdrop ──
      const skyLayer = new Container();
      a.stage.addChild(skyLayer);
      if (skyTex) {
        const sky = new Sprite(skyTex);
        const cover = Math.max(W() / skyTex.width, H() / skyTex.height) * 1.1;
        sky.width = skyTex.width * cover;
        sky.height = skyTex.height * cover;
        sky.anchor.set(0.5, 0.5);
        sky.x = W() / 2;
        sky.y = H() / 2;
        skyLayer.addChild(sky);
      } else {
        const g = new Graphics();
        g.rect(0, 0, W(), H()).fill({ color: 0x160a33 });
        skyLayer.addChild(g);
      }

      // ── building landmark (single fixed sprite per tier) ──
      const buildingLayer = new Container();
      a.stage.addChild(buildingLayer);
      let landmark: Sprite | null = null;
      const facadeGfx = new Graphics();
      buildingLayer.addChild(facadeGfx);

      const ensureBuilding = async (tier: number) => {
        if (tier === curTier) return;
        curTier = tier;
        if (!buildingCache.has(tier)) buildingCache.set(tier, await tryLoad(ART.building(tier)));
        const tex = buildingCache.get(tier) ?? null;
        if (landmark) {
          landmark.destroy();
          landmark = null;
        }
        if (tex) {
          landmark = new Sprite(tex);
          landmark.anchor.set(0.5, 1); // bottom-centered
          const targetH = H() * 0.96;
          const scale = Math.min(targetH / tex.height, (W() * 0.95) / tex.width);
          landmark.height = tex.height * scale;
          landmark.width = tex.width * scale;
          landmark.x = W() / 2;
          landmark.y = H();
          buildingLayer.addChildAt(landmark, 0);
          facadeGfx.clear();
        }
      };

      const drawFacadeGfx = (winning: boolean) => {
        if (landmark) return; // art present; skip procedural fallback
        facadeGfx.clear();
        const cols = 4;
        const rowH = 64;
        const cw = W() / cols;
        for (let r = 0; r < H() / rowH + 1; r++) {
          for (let c = 0; c < cols; c++) {
            const lit = ((r * 7 + c * 3) % 5) < 2;
            const col = lit ? (winning ? 0x39ff8b : 0xff4d4d) : 0x241a52;
            facadeGfx.rect(c * cw + 8, r * rowH + 8, cw - 16, rowH - 20).fill({ color: col, alpha: lit ? 0.9 : 0.5 });
          }
        }
      };

      // ── yeti ──
      let yetiSprite: Sprite | null = null;
      const yetiGfx = new Graphics();
      if (lofiTex) {
        yetiSprite = new Sprite(lofiTex);
        yetiSprite.anchor.set(0.5, 0.5);
        const w = 64;
        yetiSprite.width = w;
        yetiSprite.height = (lofiTex.height / lofiTex.width) * w;
        a.stage.addChild(yetiSprite);
      } else {
        a.stage.addChild(yetiGfx);
      }

      const fx = new Container();
      a.stage.addChild(fx);

      let yetiY = 0;
      let shake = 0;

      const spawnDust = (x: number, y: number) => {
        const g = new Graphics();
        g.circle(0, 0, 3).fill({ color: 0xfff2c4, alpha: 0.8 });
        g.x = x;
        g.y = y;
        fx.addChild(g);
        dust.push({ g, life: 1 });
      };

      const spawnStone = () => {
        let s: Sprite | Graphics;
        if (stonePool.length) {
          const sp = new Sprite(stonePool[Math.floor(Math.random() * stonePool.length)]);
          sp.anchor.set(0.5);
          sp.width = sp.height = 18 + Math.random() * 16;
          s = sp;
        } else {
          const g = new Graphics();
          const sz = 8 + Math.random() * 8;
          g.rect(-sz / 2, -sz / 2, sz, sz).fill({ color: 0x8a5a3a });
          s = g;
        }
        s.x = Math.random() * W();
        s.y = -20;
        fx.addChild(s);
        stones.push({ s, vy: 2 + Math.random() * 3 });
      };

      let stoneTimer = 0;
      a.ticker.add((ticker) => {
        const dt = ticker.deltaTime;
        const st = useGame.getState();
        const winning = st.prog >= 0;
        const losing = st.prog < -0.15;

        void ensureBuilding(st.buildingTier);
        drawFacadeGfx(winning);

        // how far up the CURRENT building LOFI is (one tier per building).
        const floorsIntoTier = st.floor % FLOORS_PER_BUILDING;
        const upNorm = Math.min(1, (floorsIntoTier + st.liveFloors) / FLOORS_PER_BUILDING);

        // map to screen: base near the bottom, top near the roof.
        const targetY = H() * (0.86 - upNorm * 0.72);
        yetiY += (targetY - yetiY) * 0.1 * dt;
        const bob = Math.sin(performance.now() / (winning ? 180 : 320)) * (winning ? 4 : 1.5);

        if (yetiSprite) {
          yetiSprite.x = W() / 2;
          yetiSprite.y = yetiY + bob;
          yetiSprite.tint = losing ? 0xff8a8a : 0xffffff;
          yetiSprite.rotation = losing ? Math.sin(performance.now() / 60) * 0.06 : 0;
        } else {
          yetiGfx.clear();
          const size = 40;
          yetiGfx.rect(-size / 2, -size / 2, size, size).fill({ color: losing ? 0xff4d4d : 0x39ff8b, alpha: 0.92 });
          yetiGfx.x = W() / 2;
          yetiGfx.y = yetiY + bob;
        }
        const feetY = yetiY + bob + 26;

        if (winning && st.prog > 0.05 && Math.random() < 0.25 * dt) {
          spawnDust(W() / 2 + (Math.random() * 30 - 15), feetY);
        }
        for (let i = dust.length - 1; i >= 0; i--) {
          const d = dust[i];
          d.life -= 0.04 * dt;
          d.g.y += 0.6 * dt;
          d.g.alpha = Math.max(0, d.life);
          if (d.life <= 0) {
            d.g.destroy();
            dust.splice(i, 1);
          }
        }

        if (losing) {
          stoneTimer -= dt;
          if (stoneTimer <= 0) {
            spawnStone();
            stoneTimer = Math.max(2, 10 - Math.abs(st.prog) * 8);
          }
        }
        for (let i = stones.length - 1; i >= 0; i--) {
          const s = stones[i];
          s.s.y += s.vy * dt;
          s.s.rotation += 0.1 * dt;
          if (s.s.y > H() + 30) {
            s.s.destroy();
            stones.splice(i, 1);
          }
        }

        shake = losing ? Math.abs(st.prog) * 6 : shake * 0.8;
        a.stage.x = (Math.random() - 0.5) * shake;
        a.stage.y = (Math.random() - 0.5) * shake;
      });
    })();

    return () => {
      destroyed = true;
      if (inited && app) app.destroy(true);
    };
  }, []);

  return <div ref={hostRef} className="absolute inset-0" />;
}
