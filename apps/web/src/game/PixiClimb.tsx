import { useEffect, useRef } from "react";
import { Application, Container, Graphics, Sprite, TilingSprite, Texture } from "pixi.js";
import { useGame } from "../store";
import { ART, tryLoad, tryLoadAll } from "./art";

/**
 * PixiJS climb. Loads the art slots (yeti, building façades, stones) and falls
 * back to drawn primitives if a file is missing, so the loop always plays.
 *
 * Reads the store every frame:
 *  - prog (signed): >0 winning → LOFI climbs, dust puffs.
 *                   <0 losing  → stones rain, red tint, screen shake.
 *  - liveFloors: how far up this round LOFI has reached.
 *  - buildingTier: which façade to show (swaps every 20 floors).
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
      a.start(); // ensure the render/ticker loop is running

      const W = () => a.screen.width;
      const H = () => a.screen.height;

      // Load art (null when a slot is empty → fall back to drawn shapes).
      const [lofiTex, stoneTexes] = await Promise.all([tryLoad(ART.lofi), tryLoadAll(ART.stones)]);
      const stonePool = stoneTexes.filter((t): t is Texture => !!t);
      const buildingCache = new Map<number, Texture | null>();
      let curTier = -1;

      // ── façade: tiling building art, or a procedural window grid ──
      const world = new Container();
      a.stage.addChild(world);
      let facadeTiling: TilingSprite | null = null;
      const facadeGfx = new Graphics();
      world.addChild(facadeGfx);

      const ensureFacade = async (tier: number) => {
        if (tier === curTier) return;
        curTier = tier;
        if (!buildingCache.has(tier)) buildingCache.set(tier, await tryLoad(ART.building(tier)));
        const tex = buildingCache.get(tier) ?? null;
        if (facadeTiling) {
          facadeTiling.destroy();
          facadeTiling = null;
        }
        if (tex) {
          const scale = W() / tex.width;
          facadeTiling = new TilingSprite({ texture: tex, width: W(), height: H() });
          facadeTiling.tileScale.set(scale, scale);
          world.addChildAt(facadeTiling, 0);
          facadeGfx.clear();
        }
      };

      const drawFacadeGfx = (winning: boolean, scroll: number) => {
        if (facadeTiling) return; // art present; skip procedural grid
        facadeGfx.clear();
        const cols = 4;
        const rowH = 64;
        const cw = W() / cols;
        const offset = ((scroll % rowH) + rowH) % rowH;
        for (let r = -1; r < H() / rowH + 1; r++) {
          for (let c = 0; c < cols; c++) {
            const y = r * rowH + offset;
            const lit = (((r + Math.floor(scroll / rowH)) * 7 + c * 3) % 5) < 2;
            const col = lit ? (winning ? 0x39ff8b : 0xff4d4d) : 0x241a52;
            facadeGfx.rect(c * cw + 8, y + 8, cw - 16, rowH - 20).fill({ color: col, alpha: lit ? 0.9 : 0.5 });
          }
        }
      };

      // ── yeti: sprite or drawn square ──
      let yetiSprite: Sprite | null = null;
      const yetiGfx = new Graphics();
      if (lofiTex) {
        yetiSprite = new Sprite(lofiTex);
        yetiSprite.anchor.set(0.5, 0.5);
        const w = 72;
        yetiSprite.width = w;
        yetiSprite.height = (lofiTex.height / lofiTex.width) * w;
        a.stage.addChild(yetiSprite);
      } else {
        a.stage.addChild(yetiGfx);
      }

      const fx = new Container();
      a.stage.addChild(fx);

      let scroll = 0;
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
        const climbTarget = Math.min(1, st.liveFloors / Math.max(1, st.risk.floorsPerWin));

        void ensureFacade(st.buildingTier);

        const targetScroll = climbTarget * 240;
        scroll += (targetScroll - scroll) * 0.08 * dt;
        if (facadeTiling) facadeTiling.tilePosition.y = scroll;
        else drawFacadeGfx(winning, scroll);

        // yeti rises as it climbs; bobs while idle.
        const targetY = H() * (0.6 - climbTarget * 0.12);
        yetiY += (targetY - yetiY) * 0.12 * dt;
        const bob = Math.sin(performance.now() / (winning ? 180 : 320)) * (winning ? 4 : 1.5);

        if (yetiSprite) {
          yetiSprite.x = W() / 2;
          yetiSprite.y = yetiY + bob;
          yetiSprite.tint = losing ? 0xff8a8a : 0xffffff;
          yetiSprite.rotation = losing ? Math.sin(performance.now() / 60) * 0.06 : 0;
        } else {
          yetiGfx.clear();
          const size = 44;
          yetiGfx.rect(-size / 2, -size / 2, size, size).fill({ color: losing ? 0xff4d4d : 0x39ff8b, alpha: 0.92 });
          yetiGfx.rect(-size / 2, -size / 2, size, size).stroke({ color: 0x000000, width: 3 });
          yetiGfx.x = W() / 2;
          yetiGfx.y = yetiY + bob;
        }
        const feetY = yetiY + bob + 28;

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
