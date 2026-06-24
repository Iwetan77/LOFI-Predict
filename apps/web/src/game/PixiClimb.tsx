import { useEffect, useRef } from "react";
import { Application, Container, Graphics, Sprite, Texture } from "pixi.js";
import { useGame } from "../store";
import { ART, tryLoad, tryLoadAll } from "./art";
import { sfx, buzz } from "./audio";

const LEAP_DUR = 74; // ticks (~1.2s) for the rocket leap between towers
const FRAME_MS = 220; // climb-cycle frame swap

/**
 * PixiJS climb.
 *  - LOFI alternates two climbing frames (opposite limbs) for a hand-over-hand
 *    cycle, and weaves left/right up the face, dodging stones when he's winning.
 *  - Climb height is integrated from price (earned, not snapped). Topping a
 *    tower triggers a visible rocket-booster LEAP to the next of five buildings.
 *  - During the "ready?" beat (ARMING) he stands idle on the ledge.
 *  - Stones home in and knock him down on impact when he's failing.
 */
export function PixiClimb() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current!;
    let app: Application | null = null;
    let inited = false;
    let destroyed = false;

    const stones: { s: Sprite | Graphics; vy: number; vx: number }[] = [];
    const parts: { g: Graphics; life: number; vx: number; vy: number }[] = [];

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

      const [idleT, climb1T, climb2T, fallT, flyT, skyT, stoneTexes] = await Promise.all([
        tryLoad(ART.lofi),
        tryLoad(ART.lofiClimb),
        tryLoad(ART.lofiClimb2),
        tryLoad(ART.lofiFall),
        tryLoad(ART.lofiFly),
        tryLoad(ART.sky),
        tryLoadAll(ART.stones),
      ]);
      const poseIdle = idleT ?? climb1T ?? fallT;
      const poseClimbA = climb1T ?? poseIdle;
      const poseClimbB = climb2T ?? climb1T ?? poseIdle;
      const poseFall = fallT ?? poseIdle;
      const poseFly = flyT ?? poseIdle;
      const stonePool = stoneTexes.filter((t): t is Texture => !!t);
      const buildingCache = new Map<number, Texture | null>();
      let curSeed = -1;

      // ── sky ──
      if (skyT) {
        const sky = new Sprite(skyT);
        const cover = Math.max(W() / skyT.width, H() / skyT.height) * 1.1;
        sky.width = skyT.width * cover;
        sky.height = skyT.height * cover;
        sky.anchor.set(0.5);
        sky.x = W() / 2;
        sky.y = H() / 2;
        a.stage.addChild(sky);
      } else {
        a.stage.addChild(new Graphics().rect(0, 0, W(), H()).fill({ color: 0x160a33 }));
      }

      // ── building landmark ──
      const buildingLayer = new Container();
      a.stage.addChild(buildingLayer);
      let landmark: Sprite | null = null;
      let towerTopY = H() * 0.14;
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
          buildingLayer.addChild(landmark);
          towerTopY = H() - landmark.height * 0.9;
          towerBaseY = H() * 0.86;
        }
      };

      // ── yeti ──
      const yeti = new Sprite(poseIdle ?? Texture.WHITE);
      yeti.anchor.set(0.5, 0.5);
      const yetiW = 60;
      const setPose = (tex: Texture | null | undefined) => {
        if (tex && yeti.texture !== tex) {
          yeti.texture = tex;
          yeti.width = yetiW;
          yeti.height = (tex.height / tex.width) * yetiW;
        }
      };
      if (!poseIdle) {
        yeti.width = yeti.height = 44;
        yeti.tint = 0x39ff8b;
      }
      a.stage.addChild(yeti);

      const fx = new Container();
      a.stage.addChild(fx);

      let climbH = 0;
      let buildingSeed = Math.max(1, useGame.getState().buildingTier);
      let yetiX = W() / 2;
      let yetiY = towerBaseY;
      let frameTimer = 0;
      let frameToggle = false;
      let flinch = 0;
      let shake = 0;
      let stoneTimer = 0;
      // leap state
      let leaping = false;
      let leapT = 0;
      let leapSwapped = false;

      const spawnPart = (x: number, y: number, color: number, up: boolean, spread = 1) => {
        const g = new Graphics();
        g.circle(0, 0, 2 + Math.random() * 2).fill({ color, alpha: 0.9 });
        g.x = x;
        g.y = y;
        fx.addChild(g);
        parts.push({
          g,
          life: 1,
          vx: (Math.random() - 0.5) * 1.4 * spread,
          vy: up ? -Math.random() * spread : 1 + Math.random() * 2 * spread,
        });
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
        s.x = towardX + (Math.random() - 0.5) * 100;
        s.y = -20;
        fx.addChild(s);
        stones.push({ s, vy: 3 + Math.random() * 3, vx: (towardX - s.x) / 110 });
      };

      a.ticker.add((ticker) => {
        const dt = ticker.deltaTime;
        const dtSec = dt / 60;
        const st = useGame.getState();
        const armed = st.phase === "CLIMB";
        const arming = st.phase === "ARMING";
        const winning = st.prog >= 0;
        const losing = st.prog < -0.15;
        const t = performance.now();

        void ensureBuilding(buildingSeed);

        // ── rocket-booster leap between towers ──
        if (leaping) {
          leapT -= dt;
          const p = 1 - leapT / LEAP_DUR;
          setPose(poseFly);
          if (p < 0.5) {
            const u = p / 0.5;
            yetiY = towerBaseY + (-(H() * 0.5 + 100) - towerBaseY) * (u * u);
          } else {
            if (!leapSwapped) {
              buildingSeed += 1;
              void ensureBuilding(buildingSeed);
              leapSwapped = true;
            }
            const u = (p - 0.5) / 0.5;
            yetiY = -(H() * 0.5 + 100) + (towerBaseY + (H() * 0.5 + 100)) * (u * u);
            climbH = 0;
          }
          // rocket flame under his feet
          for (let k = 0; k < 2; k++) spawnPart(yetiX + (Math.random() - 0.5) * 10, yetiY + 26, k ? 0xffd23f : 0xff7a1a, false, 2);
          yeti.x = yetiX;
          yeti.y = yetiY;
          yeti.rotation = 0;
          if (leapT <= 0) leaping = false;
        } else if (armed) {
          // integrate climb height from price (gradual). slide down when losing.
          climbH += st.prog * 0.15 * dtSec * (st.prog < 0 ? 1.5 : 1);
          if (climbH >= 1) {
            leaping = true;
            leapT = LEAP_DUR;
            leapSwapped = false;
            sfx.cheer();
            buzz([15, 30, 15]);
          }
          if (climbH < 0) climbH = 0;
        }

        if (!leaping) {
          const climbing = armed && winning && st.prog > 0.05;

          // animation frames: alternate the two climbing poses
          frameTimer -= ticker.deltaMS;
          if (frameTimer <= 0) {
            frameToggle = !frameToggle;
            frameTimer = FRAME_MS;
          }
          if (poseIdle) {
            if (arming) setPose(poseIdle);
            else if (losing || flinch > 0) setPose(poseFall);
            else if (climbing) setPose(frameToggle ? poseClimbA : poseClimbB);
            else setPose(poseIdle);
          } else {
            yeti.tint = losing ? 0xff4d4d : 0x39ff8b;
          }

          // vertical position from climb height (idle bob during the ready beat)
          const reach = climbing ? Math.abs(Math.sin(t / 150)) * 5 : 0;
          const idleBob = arming ? Math.sin(t / 300) * 2 : 0;
          const targetY = towerBaseY - climbH * (towerBaseY - towerTopY) - reach + idleBob;
          yetiY += (targetY - yetiY) * 0.12 * dt;

          // weave left/right, and dodge stones (more when winning)
          const serp = Math.sin(climbH * Math.PI * 6 + t / 700) * (W() * 0.15);
          let dodge = 0;
          const strength = winning ? 1 : 0.25;
          for (const s of stones) {
            if (s.s.y < yetiY && s.s.y > yetiY - 150 && Math.abs(s.s.x - yetiX) < 70) {
              dodge += Math.sign(yetiX - s.s.x || 1) * 42 * strength;
            }
          }
          const targetX = Math.max(W() * 0.16, Math.min(W() * 0.84, W() / 2 + serp + dodge));
          yetiX += (targetX - yetiX) * 0.12 * dt;

          if (flinch > 0) flinch -= dt;
          const knock = flinch > 0 ? Math.sin(flinch) * 6 : 0;
          yeti.x = yetiX + knock;
          yeti.y = yetiY;
          yeti.rotation = losing ? Math.sin(t / 60) * 0.07 : flinch > 0 ? 0.12 : 0;

          if (climbing && Math.random() < 0.25 * dt) spawnPart(yeti.x + (Math.random() * 20 - 10), yeti.y + 24, 0xfff2c4, true);
        }

        // particles
        for (let i = parts.length - 1; i >= 0; i--) {
          const d = parts[i];
          d.life -= 0.045 * dt;
          d.g.x += d.vx * dt;
          d.g.y += d.vy * dt;
          d.g.alpha = Math.max(0, d.life);
          if (d.life <= 0) {
            d.g.destroy();
            parts.splice(i, 1);
          }
        }

        // stones
        if (armed && losing && !leaping) {
          stoneTimer -= dt;
          if (stoneTimer <= 0) {
            spawnStone(yetiX);
            stoneTimer = Math.max(2, 9 - Math.abs(st.prog) * 7);
          }
        }
        for (let i = stones.length - 1; i >= 0; i--) {
          const s = stones[i];
          s.s.y += s.vy * dt;
          s.s.x += s.vx * dt;
          s.s.rotation += 0.12 * dt;
          if (!leaping && Math.abs(s.s.x - yeti.x) < 24 && Math.abs(s.s.y - yeti.y) < 26) {
            for (let k = 0; k < 6; k++) spawnPart(s.s.x, s.s.y, 0xcaa27a, true, 2);
            climbH = Math.max(0, climbH - 0.06);
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
