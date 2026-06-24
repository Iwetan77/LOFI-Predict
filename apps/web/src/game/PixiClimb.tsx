import { useEffect, useRef } from "react";
import { Application, Container, Graphics, Sprite, Texture } from "pixi.js";
import { useGame } from "../store";
import { ART, tryLoad, tryLoadAll } from "./art";
import { sfx, buzz } from "./audio";

/**
 * PixiJS climb. Layers: sky → a fixed building landmark → LOFI climbing its
 * face → falling-stone / dust FX.
 *
 * Climbing is integrated from price, not snapped: LOFI gains height while the
 * call is winning and slides back down when it's losing, so the ascent feels
 * earned. Topping a tower swaps in the next of the five buildings. Stones home
 * in on LOFI when he's failing and knock him down on impact.
 */
export function PixiClimb() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current!;
    let app: Application | null = null;
    let inited = false;
    let destroyed = false;

    const stones: { s: Sprite | Graphics; vy: number; vx: number }[] = [];
    const dust: { g: Graphics; life: number; vx: number; vy: number }[] = [];

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

      const [idleT, climbT, fallT, skyT, stoneTexes] = await Promise.all([
        tryLoad(ART.lofi),
        tryLoad(ART.lofiClimb),
        tryLoad(ART.lofiFall),
        tryLoad(ART.sky),
        tryLoadAll(ART.stones),
      ]);
      const poseIdle = idleT ?? climbT ?? fallT;
      const poseClimb = climbT ?? poseIdle;
      const poseFall = fallT ?? poseIdle;
      const stonePool = stoneTexes.filter((t): t is Texture => !!t);
      const buildingCache = new Map<number, Texture | null>();
      let curSeed = -1;

      // ── sky ──
      const skyLayer = new Container();
      a.stage.addChild(skyLayer);
      if (skyT) {
        const sky = new Sprite(skyT);
        const cover = Math.max(W() / skyT.width, H() / skyT.height) * 1.1;
        sky.width = skyT.width * cover;
        sky.height = skyT.height * cover;
        sky.anchor.set(0.5);
        sky.x = W() / 2;
        sky.y = H() / 2;
        skyLayer.addChild(sky);
      } else {
        skyLayer.addChild(new Graphics().rect(0, 0, W(), H()).fill({ color: 0x160a33 }));
      }

      // ── building landmark (single fixed sprite, swapped per tower) ──
      const buildingLayer = new Container();
      a.stage.addChild(buildingLayer);
      let landmark: Sprite | null = null;
      const facadeGfx = new Graphics();
      buildingLayer.addChild(facadeGfx);
      let towerTopY = H() * 0.12;
      let towerBaseY = H() * 0.86;

      const ensureBuilding = async (seed: number) => {
        if (seed === curSeed) return;
        curSeed = seed;
        if (!buildingCache.has(seed)) buildingCache.set(seed, await tryLoad(ART.building(seed)));
        const tex = buildingCache.get(seed) ?? null;
        if (landmark) {
          landmark.destroy();
          landmark = null;
        }
        if (tex) {
          landmark = new Sprite(tex);
          landmark.anchor.set(0.5, 1);
          const scale = Math.min((H() * 0.96) / tex.height, (W() * 0.95) / tex.width);
          landmark.width = tex.width * scale;
          landmark.height = tex.height * scale;
          landmark.x = W() / 2;
          landmark.y = H();
          buildingLayer.addChildAt(landmark, 0);
          // climb between just below the roof and the street.
          towerTopY = H() - landmark.height * 0.92;
          towerBaseY = H() * 0.88;
          facadeGfx.clear();
        } else {
          towerTopY = H() * 0.12;
          towerBaseY = H() * 0.86;
        }
      };

      // ── yeti ──
      const yeti = new Sprite(poseClimb ?? Texture.WHITE);
      yeti.anchor.set(0.5, 0.5);
      const yetiW = 60;
      const setPose = (tex: Texture | null | undefined) => {
        if (tex && yeti.texture !== tex) {
          yeti.texture = tex;
          yeti.width = yetiW;
          yeti.height = (tex.height / tex.width) * yetiW;
        }
      };
      setPose(poseIdle);
      if (!poseIdle) {
        yeti.width = yeti.height = 44;
        yeti.tint = 0x39ff8b;
      }
      a.stage.addChild(yeti);

      const fx = new Container();
      a.stage.addChild(fx);

      let climbH = 0; // 0..1 height up the current tower
      let buildingSeed = Math.max(1, useGame.getState().buildingTier);
      let yetiScreenY = towerBaseY;
      let flinch = 0; // knockback timer
      let shake = 0;
      let stoneTimer = 0;

      const spawnDust = (x: number, y: number, spread = 1) => {
        const g = new Graphics();
        g.circle(0, 0, 2 + Math.random() * 2).fill({ color: 0xfff2c4, alpha: 0.85 });
        g.x = x;
        g.y = y;
        fx.addChild(g);
        dust.push({ g, life: 1, vx: (Math.random() - 0.5) * 1.2 * spread, vy: -Math.random() * spread });
      };

      const spawnStone = (towardX: number) => {
        let s: Sprite | Graphics;
        if (stonePool.length) {
          const sp = new Sprite(stonePool[Math.floor(Math.random() * stonePool.length)]);
          sp.anchor.set(0.5);
          sp.width = sp.height = 20 + Math.random() * 16;
          s = sp;
        } else {
          const g = new Graphics();
          const sz = 10 + Math.random() * 8;
          g.rect(-sz / 2, -sz / 2, sz, sz).fill({ color: 0x8a5a3a });
          s = g;
        }
        // aim near LOFI so stones actually threaten him
        s.x = towardX + (Math.random() - 0.5) * 90;
        s.y = -20;
        const vx = (towardX - s.x) / 90; // drift toward him
        fx.addChild(s);
        stones.push({ s, vy: 3 + Math.random() * 3, vx });
      };

      a.ticker.add((ticker) => {
        const dt = ticker.deltaTime;
        const dtSec = dt / 60;
        const st = useGame.getState();
        const winning = st.prog >= 0;
        const losing = st.prog < -0.15;

        void ensureBuilding(buildingSeed);

        // integrate climb height from price progress (gradual, earned).
        const speed = 0.16;
        climbH += st.prog * speed * dtSec * (st.prog < 0 ? 1.5 : 1);
        if (climbH >= 1) {
          climbH -= 1;
          buildingSeed += 1; // topped this tower → next of the five
        }
        if (climbH < 0) climbH = 0;

        // hand-over-hand: gentle sway + reach bob while actively climbing.
        const climbing = winning && st.prog > 0.05;
        const t = performance.now();
        const sway = climbing ? Math.sin(t / 150) * 6 : Math.sin(t / 320) * 1.5;
        const reach = climbing ? Math.abs(Math.sin(t / 150)) * 6 : 0;

        const targetY = towerBaseY - climbH * (towerBaseY - towerTopY) - reach;
        yetiScreenY += (targetY - yetiScreenY) * 0.12 * dt;

        // flinch knockback when a stone connects
        if (flinch > 0) flinch -= dt;
        const knock = flinch > 0 ? Math.sin(flinch) * 6 : 0;

        yeti.x = W() / 2 + sway + knock;
        yeti.y = yetiScreenY;
        if (poseIdle) setPose(losing || flinch > 0 ? poseFall : climbing ? poseClimb : poseIdle);
        else yeti.tint = losing ? 0xff4d4d : 0x39ff8b;
        yeti.rotation = losing ? Math.sin(t / 60) * 0.08 : flinch > 0 ? 0.12 : 0;

        // climbing dust at the feet
        if (climbing && Math.random() < 0.25 * dt) spawnDust(yeti.x + (Math.random() * 24 - 12), yeti.y + 26);
        for (let i = dust.length - 1; i >= 0; i--) {
          const d = dust[i];
          d.life -= 0.04 * dt;
          d.g.x += d.vx * dt;
          d.g.y += d.vy * dt + 0.4 * dt;
          d.g.alpha = Math.max(0, d.life);
          if (d.life <= 0) {
            d.g.destroy();
            dust.splice(i, 1);
          }
        }

        // stones rain harder the worse it's going
        if (losing) {
          stoneTimer -= dt;
          if (stoneTimer <= 0) {
            spawnStone(yeti.x);
            stoneTimer = Math.max(2, 9 - Math.abs(st.prog) * 7);
          }
        }
        for (let i = stones.length - 1; i >= 0; i--) {
          const s = stones[i];
          s.s.y += s.vy * dt;
          s.s.x += s.vx * dt;
          s.s.rotation += 0.12 * dt;
          // collision with LOFI
          if (Math.abs(s.s.x - yeti.x) < 26 && Math.abs(s.s.y - yeti.y) < 28) {
            for (let k = 0; k < 6; k++) spawnDust(s.s.x, s.s.y, 2);
            climbH = Math.max(0, climbH - 0.06); // knocked down a notch
            flinch = 10;
            shake = 8;
            sfx.thud();
            buzz(25);
            s.s.destroy();
            stones.splice(i, 1);
            continue;
          }
          if (s.s.y > H() + 30) {
            s.s.destroy();
            stones.splice(i, 1);
          }
        }

        shake = losing ? Math.max(shake, Math.abs(st.prog) * 5) : shake * 0.85;
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
