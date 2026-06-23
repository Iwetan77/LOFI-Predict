import { useEffect, useRef } from "react";
import { Application, Container, Graphics } from "pixi.js";
import { useGame } from "../store";

/**
 * Procedural PixiJS climb. No art is required — the building, yeti, and FX are
 * drawn with Graphics so the loop is fully playable, and named sprite slots
 * (see public/art/README.md) can replace each primitive later without touching
 * the animation logic.
 *
 * Reads the store every frame:
 *  - prog (signed): >0 winning → LOFI climbs, warm windows, dust puffs.
 *                   <0 losing  → red windows, stones rain, screen shake.
 *  - liveFloors: how far up this round LOFI has reached.
 */
export function PixiClimb() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current!;
    let app: Application | null = null;
    let inited = false;
    let destroyed = false;

    const stones: { g: Graphics; vy: number }[] = [];
    const dust: { g: Graphics; life: number }[] = [];

    (async () => {
      // Construct + init a LOCAL app; only publish it once init is complete so
      // StrictMode's immediate cleanup can't destroy a half-initialized app
      // (which throws `_cancelResize is not a function` in Pixi v8).
      const a = new Application();
      await a.init({ resizeTo: host, backgroundAlpha: 0, antialias: false });
      if (destroyed) {
        a.destroy(true);
        return;
      }
      app = a;
      inited = true;
      host.appendChild(a.canvas);

      const W = () => a.screen.width;
      const H = () => a.screen.height;

      // world scrolls; window rows give the sense of climbing.
      const world = new Container();
      a.stage.addChild(world);
      const facade = new Graphics();
      world.addChild(facade);

      const yeti = new Graphics();
      a.stage.addChild(yeti);

      const fx = new Container();
      a.stage.addChild(fx);

      let scroll = 0; // accumulated climb scroll
      let yetiY = 0; // lerped screen Y for yeti
      let shake = 0;

      const drawFacade = (winning: boolean) => {
        facade.clear();
        const cols = 4;
        const rowH = 64;
        const cw = W() / cols;
        const offset = ((scroll % rowH) + rowH) % rowH;
        for (let r = -1; r < H() / rowH + 1; r++) {
          for (let c = 0; c < cols; c++) {
            const y = r * rowH + offset;
            // window lit state pseudo-random but stable per cell
            const lit = (((r + Math.floor(scroll / rowH)) * 7 + c * 3) % 5) < 2;
            const col = lit ? (winning ? 0x39ff8b : 0xff4d4d) : 0x241a52;
            facade.rect(c * cw + 8, y + 8, cw - 16, rowH - 20).fill({ color: col, alpha: lit ? 0.9 : 0.5 });
          }
        }
      };

      const spawnDust = (x: number, y: number) => {
        const g = new Graphics();
        g.circle(0, 0, 3).fill({ color: 0xfff2c4, alpha: 0.8 });
        g.x = x;
        g.y = y;
        fx.addChild(g);
        dust.push({ g, life: 1 });
      };

      const spawnStone = () => {
        const g = new Graphics();
        const s = 8 + Math.random() * 8;
        g.rect(0, 0, s, s).fill({ color: 0x8a5a3a });
        g.x = Math.random() * W();
        g.y = -20;
        fx.addChild(g);
        stones.push({ g, vy: 2 + Math.random() * 3 });
      };

      let stoneTimer = 0;
      a.ticker.add((ticker) => {
        const dt = ticker.deltaTime;
        const st = useGame.getState();
        const winning = st.prog >= 0;
        const losing = st.prog < -0.15;
        const climbTarget = Math.min(1, st.liveFloors / Math.max(1, st.risk.floorsPerWin));

        // scroll world up proportional to progress (climbing)
        const targetScroll = climbTarget * 240;
        scroll += (targetScroll - scroll) * 0.08 * dt;
        drawFacade(winning);

        // yeti rests ~55% down, rises a touch as it climbs; bobs while idle.
        const targetY = H() * (0.6 - climbTarget * 0.12);
        yetiY += (targetY - yetiY) * 0.12 * dt;
        const bob = Math.sin(performance.now() / (winning ? 180 : 320)) * (winning ? 4 : 1.5);
        yeti.clear();
        const size = 44;
        yeti.rect(-size / 2, -size / 2, size, size).fill({
          color: losing ? 0xff4d4d : 0x39ff8b,
          alpha: 0.92,
        });
        yeti.rect(-size / 2, -size / 2, size, size).stroke({ color: 0x000000, width: 3 });
        yeti.x = W() / 2;
        yeti.y = yetiY + bob;

        // climbing → dust puffs at feet
        if (winning && st.prog > 0.05 && Math.random() < 0.25 * dt) {
          spawnDust(yeti.x + (Math.random() * 30 - 15), yeti.y + size / 2);
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

        // losing → stones rain; intensity scales with how bad it is
        if (losing) {
          stoneTimer -= dt;
          if (stoneTimer <= 0) {
            spawnStone();
            stoneTimer = Math.max(2, 10 - Math.abs(st.prog) * 8);
          }
        }
        for (let i = stones.length - 1; i >= 0; i--) {
          const s = stones[i];
          s.g.y += s.vy * dt;
          s.g.rotation += 0.1 * dt;
          if (s.g.y > H() + 30) {
            s.g.destroy();
            stones.splice(i, 1);
          }
        }

        // screen shake when losing
        shake = losing ? Math.abs(st.prog) * 6 : shake * 0.8;
        a.stage.x = (Math.random() - 0.5) * shake;
        a.stage.y = (Math.random() - 0.5) * shake;
      });
    })();

    return () => {
      destroyed = true;
      // Only destroy a fully-initialized app; otherwise the async path above
      // handles teardown once init resolves.
      if (inited && app) app.destroy(true);
    };
  }, []);

  return <div ref={hostRef} className="absolute inset-0" />;
}
