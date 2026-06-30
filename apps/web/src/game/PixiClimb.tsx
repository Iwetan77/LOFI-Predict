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
 *    tower triggers a visible rocket-booster LEAP to the next of five
 *    buildings — a floor-combo milestone within the same ongoing call, not a
 *    settlement; the call keeps running until it falls, cashes out, or its
 *    clock runs out (see useEngine/store.bankBuilding).
 *  - During the "ready?" beat (ARMING) he stands idle on the ledge.
 *  - Stones home in and knock him down on impact when he's failing.
 *
 * The Application/WebGL context (and everything built on it: sky, building,
 * yeti, ticker) is a module-level singleton, built exactly once and reused
 * for the life of the page — only the canvas's DOM parent changes as rounds
 * mount/unmount this component. Two reasons it's structured this way:
 *  1. Browsers cap the number of live WebGL contexts per tab; recreating one
 *     per betting session eventually exhausts that cap and a later context
 *     creation silently fails (canvas stays blank while the rest of the UI,
 *     including audio, keeps working fine).
 *  2. React's StrictMode double-invokes effects in dev (mount → cleanup →
 *     mount). The whole build lives inside ONE memoized promise keyed off
 *     module scope — not a per-effect flag — so no matter how many times or
 *     how quickly this component (re)mounts, the scene is built exactly once.
 */
let sharedAppPromise: Promise<Application> | null = null;

function getSharedApp(initialHost: HTMLDivElement): Promise<Application> {
  if (sharedAppPromise) return sharedAppPromise;
  sharedAppPromise = (async () => {
    const a = new Application();
    await a.init({ resizeTo: initialHost, backgroundAlpha: 0, antialias: false, preserveDrawingBuffer: true });
    initialHost.appendChild(a.canvas);
    a.start();

    const stones: { s: Sprite | Graphics; vy: number; vx: number }[] = [];
    const parts: { g: Graphics; life: number; vx: number; vy: number }[] = [];

    const W = () => a.screen.width;
      const H = () => a.screen.height;

      const [idleT, climb1T, climb2T, fallT, flyT, waitT, skyT, skyNightT, stoneTexes] = await Promise.all([
        tryLoad(ART.lofi),
        tryLoad(ART.lofiClimb),
        tryLoad(ART.lofiClimb2),
        tryLoad(ART.lofiFall),
        tryLoad(ART.lofiFly),
        tryLoad(ART.lofiWait),
        tryLoad(ART.sky),
        tryLoad(ART.skyNight),
        tryLoadAll(ART.stones),
      ]);
      const poseIdle = idleT ?? climb1T ?? fallT;
      const poseClimbA = climb1T ?? poseIdle;
      const poseClimbB = climb2T ?? climb1T ?? poseIdle;
      const poseFall = fallT ?? poseIdle;
      const poseFly = flyT ?? poseIdle;
      const poseWait = waitT ?? poseIdle; // clinging-to-wall pose between calls
      const stonePool = stoneTexes.filter((t): t is Texture => !!t);
      const buildingCache = new Map<number, Texture | null>();
      let curSeed = -1;

      // ── sky ── day + night, cross-toggled every 7 floors (see ticker)
      const makeSky = (tex: Texture) => {
        const sky = new Sprite(tex);
        const cover = Math.max(W() / tex.width, H() / tex.height) * 1.1;
        sky.width = tex.width * cover;
        sky.height = tex.height * cover;
        sky.anchor.set(0.5);
        sky.x = W() / 2;
        sky.y = H() / 2;
        a.stage.addChild(sky);
        return sky;
      };
      const daySky = skyT ? makeSky(skyT) : null;
      const nightSky = skyNightT ? makeSky(skyNightT) : null;
      if (!daySky && !nightSky) {
        a.stage.addChild(new Graphics().rect(0, 0, W(), H()).fill({ color: 0x160a33 }));
      }

      // ── building landmark ──
      const buildingLayer = new Container();
      a.stage.addChild(buildingLayer);
      let landmark: Sprite | null = null;
      let towerTopY = H() * 0.14;
      let towerBaseY = H() * 0.9; // foot of the tower (LOFI's feet rest here)
      const baseFracCache = new Map<number, number>();

      // Building art often has transparent padding below the visible structure
      // (a shadow/ground margin baked into the PNG). Anchoring to the raw image
      // bottom puts LOFI mid-floor instead of on the ground. Scan the decoded
      // pixels once per asset to find where the artwork actually ends.
      const findVisibleBottomFrac = (tex: Texture): number => {
        try {
          const res = (tex.source as unknown as { resource?: CanvasImageSource & { width?: number; height?: number } })
            .resource;
          if (!res) return 1;
          const w = res.width ?? tex.width;
          const h = res.height ?? tex.height;
          if (!w || !h) return 1;
          const c = document.createElement("canvas");
          c.width = w;
          c.height = h;
          const ctx = c.getContext("2d", { willReadFrequently: true });
          if (!ctx) return 1;
          ctx.drawImage(res, 0, 0, w, h);
          const step = Math.max(1, Math.floor(w / 40));
          for (let y = h - 1; y >= 0; y--) {
            const row = ctx.getImageData(0, y, w, 1).data;
            for (let x = 0; x < w; x += step) {
              if (row[x * 4 + 3] > 16) return y / h;
            }
          }
          return 1;
        } catch {
          return 1; // CORS or decode failure — fall back to "no padding"
        }
      };

      const ensureBuilding = async (seed: number) => {
        if (seed === curSeed) return;
        curSeed = seed;
        // Load (once), but NEVER cache a failure — a transient first-paint load
        // miss used to get cached as null and, because curSeed was already set,
        // never retried, leaving the building permanently blank for the whole
        // page session. Only successes are cached; a miss resets curSeed so the
        // next ticker frame tries again.
        let tex = buildingCache.get(seed) ?? null;
        if (!tex) {
          tex = await tryLoad(ART.building(seed));
          if (tex) buildingCache.set(seed, tex);
          else {
            if (curSeed === seed) curSeed = -1; // allow a retry next frame
            return;
          }
        }
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
          if (!baseFracCache.has(seed)) baseFracCache.set(seed, findVisibleBottomFrac(tex));
          const frac = baseFracCache.get(seed) ?? 1;
          towerTopY = H() - landmark.height * 0.9;
          towerBaseY = H() - landmark.height * (1 - frac); // actual ground line, not the image edge
        }
      };

      // ── yeti ── (anchored at the feet so he stands on the tower, not mid-air)
      const yeti = new Sprite(poseIdle ?? Texture.WHITE);
      yeti.anchor.set(0.5, 1);
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
      } else {
        // Normalise the starting size immediately. setPose only resizes on a
        // texture CHANGE, and the idle pose equals the sprite's initial texture
        // — so without this the very first frames (the ARMING/sign-wait beat)
        // render LOFI at his full native resolution, filling the screen.
        yeti.width = yetiW;
        yeti.height = (poseIdle.height / poseIdle.width) * yetiW;
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
      // round resolution: grip depletes from hits / sustained slipping → fall.
      let grip = 1;
      let falling = false;
      let fallTime = 0;
      let signaledTop = false;
      let signaledFall = false;
      let prevPhase = "";
      let prevProg = 0;
      let wasLosing = false;

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
        // Spawn just above LOFI so the drop is short and the hit reads clearly.
        s.x = towardX + (Math.random() - 0.5) * 80;
        s.y = yetiY - (110 + Math.random() * 70);
        fx.addChild(s);
        stones.push({ s, vy: 2.4 + Math.random() * 1.8, vx: (towardX - s.x) / 90 });
      };

      a.ticker.add((ticker) => {
        const dt = ticker.deltaTime;
        const dtSec = dt / 60;
        const st = useGame.getState();
        const phase = st.phase;
        const armed = phase === "CLIMB";
        const arming = phase === "ARMING";
        const prog = st.prog;
        const losing = prog < -0.15;
        const t = performance.now();

        // Waiting beat: the clock ran out and LOFI is clinging to the wall while
        // the next-call menu is up (RESOLVE-after-timeout, then NEXT). A fall or
        // manual cash-out is handled elsewhere and never reaches this pose.
        const waiting = phase === "NEXT" || (phase === "RESOLVE" && st.lastResult?.auto === true);

        // Day → night → day, flipping every 7 floors, tracking the floor the
        // player sees on the HUD (banked floors + this call's progress).
        if (daySky || nightSky) {
          const night = Math.floor((st.floor + st.liveFloors) / 7) % 2 === 1 && !!nightSky;
          if (daySky) daySky.visible = !night;
          if (nightSky) nightSky.visible = night;
        }

        void ensureBuilding(buildingSeed);

        // ── new round: reset the climb, grip, stones ──
        if (armed && prevPhase !== "CLIMB") {
          climbH = 0;
          grip = 1;
          falling = false;
          fallTime = 0;
          signaledTop = false;
          signaledFall = false;
          wasLosing = false;
          yetiX = W() / 2;
          yetiY = towerBaseY; // back to the foot of the tower
          // The scene (and this closure) now lives for the whole page session,
          // so re-sync which tower art is shown from the store's tier on every
          // fresh session — a brand-new bet resets it to 1, a win streak carries
          // it forward, same as before this became a persistent singleton.
          buildingSeed = Math.max(1, st.buildingTier);
          void ensureBuilding(buildingSeed);
          for (const s of stones) s.s.destroy();
          stones.length = 0;
        }
        prevPhase = phase;

        // market reversed in your favour after slipping → LOFI may dodge stones.
        if (prog < -0.1) wasLosing = true;
        if (prog > 0.05) wasLosing = false;
        const recovering = wasLosing && prog - prevProg > 0.012 && prog > -0.5;

        // ── rocket-booster leap to the next building (a win) ──
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
          for (let k = 0; k < 2; k++) spawnPart(yetiX + (Math.random() - 0.5) * 10, yetiY + 26, k ? 0xffd23f : 0xff7a1a, false, 2);
          yeti.x = yetiX;
          yeti.y = yetiY;
          yeti.rotation = 0;
          if (leapT <= 0) {
            leaping = false;
            signaledTop = false; // clear to top out again — one call can clear several buildings
          }
        } else if (falling) {
          // knocked off — tumble down and out.
          setPose(poseFall);
          fallTime += dt;
          yetiY += (2.5 + fallTime * 0.12) * dt;
          yeti.x = yetiX;
          yeti.y = yetiY;
          yeti.rotation += 0.06 * dt;
        } else if (armed) {
          // integrate climb height from price; topping out is a visual/floor
          // combo milestone now, not a settlement — the call (and its clock)
          // keeps running, so a hot streak can clear several buildings in a row.
          climbH += prog * 0.22 * dtSec * (prog < 0 ? 1.3 : 1);
          if (climbH < 0) climbH = 0;
          if (climbH >= 1 && !signaledTop) {
            signaledTop = true;
            leaping = true;
            leapT = LEAP_DUR;
            leapSwapped = false;
            sfx.cheer();
            buzz([15, 30, 15]);
            useGame.getState().bankBuilding();
          }
          // grip: bleeds when slipping hard, recovers when climbing. 0 → fall.
          if (prog < -0.5) grip -= 0.22 * dtSec;
          else if (prog > 0.1) grip = Math.min(1, grip + 0.25 * dtSec);
          if (grip <= 0 && !signaledFall) {
            grip = 0;
            signaledFall = true;
            falling = true;
            fallTime = 0;
            sfx.thud();
            buzz(40);
            useGame.getState().signalOutcome("FALL");
          }
        }

        if (!leaping && !falling && waiting) {
          // Clock ran out: LOFI swings to the LEFT EDGE of the tower and grips
          // the corner, breathing, while the next-call menu is up. He holds the
          // height he reached — no climbing, no stones. Anchor to the building's
          // actual left edge (its scaled width), with a small inset so he reads
          // as clinging to the corner rather than floating off it.
          setPose(poseWait);
          const leftEdge = landmark ? W() / 2 - landmark.width / 2 : W() * 0.1;
          const targetX = leftEdge + yetiW * 0.35;
          yetiX += (targetX - yetiX) * 0.1 * dt;
          yeti.x = yetiX;
          yeti.y = yetiY + Math.sin(t / 650) * 3; // gentle breathing, no drift
          yeti.rotation = 0;
        } else if (!leaping && !falling) {
          // During CLIMB he is ALWAYS climbing (hand-over-hand) — the idle pose
          // only shows during the brief ARMING beat, so it never lingers over the
          // action once the round starts.
          const climbing = armed;

          frameTimer -= ticker.deltaMS;
          if (frameTimer <= 0) {
            frameToggle = !frameToggle;
            frameTimer = FRAME_MS;
          }
          if (poseIdle) {
            if (climbing) setPose(frameToggle ? poseClimbA : poseClimbB);
            else setPose(poseIdle);
          } else {
            yeti.tint = losing ? 0xff4d4d : 0x39ff8b;
          }

          const reach = climbing ? Math.abs(Math.sin(t / 150)) * 5 : 0;
          const idleBob = arming ? Math.sin(t / 300) * 2 : 0;
          const targetY = towerBaseY - climbH * (towerBaseY - towerTopY) - reach + idleBob;
          yetiY += (targetY - yetiY) * 0.12 * dt;

          // weave left/right; only dodge stones when the market has turned back.
          const serp = Math.sin(climbH * Math.PI * 6 + t / 700) * (W() * 0.15);
          let dodge = 0;
          if (recovering) {
            for (const s of stones) {
              if (s.s.y < yetiY && s.s.y > yetiY - 150 && Math.abs(s.s.x - yetiX) < 70) {
                dodge += Math.sign(yetiX - s.s.x || 1) * 46;
              }
            }
          }
          const targetX = Math.max(W() * 0.16, Math.min(W() * 0.84, W() / 2 + serp + dodge));
          yetiX += (targetX - yetiX) * 0.12 * dt;

          // vibration ONLY from an actual stone impact (flinch), not from losing.
          if (flinch > 0) flinch -= dt;
          const knock = flinch > 0 ? Math.sin(flinch) * 6 : 0;
          yeti.x = yetiX + knock;
          yeti.y = yetiY;
          yeti.rotation = flinch > 0 ? 0.12 : 0;

          if (climbing && Math.random() < 0.25 * dt) spawnPart(yeti.x + (Math.random() * 20 - 10), yeti.y + 24, 0xfff2c4, true);
        }

        prevProg = prog;

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

        // stones rain only while the call is going against you
        if (armed && losing && !leaping && !falling) {
          stoneTimer -= dt;
          if (stoneTimer <= 0) {
            spawnStone(yetiX);
            stoneTimer = Math.max(3, 11 - Math.abs(prog) * 7);
          }
        }
        for (let i = stones.length - 1; i >= 0; i--) {
          const s = stones[i];
          s.s.y += s.vy * dt;
          s.s.x += s.vx * dt;
          s.s.rotation += 0.12 * dt;
          if (!leaping && !falling && Math.abs(s.s.x - yeti.x) < 24 && Math.abs(s.s.y - yeti.y) < 26) {
            for (let k = 0; k < 6; k++) spawnPart(s.s.x, s.s.y, 0xcaa27a, true, 2);
            climbH = Math.max(0, climbH - 0.05);
            grip -= 0.34; // a few clean hits and LOFI loses his grip
            flinch = 10;
            shake = 9;
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

        // screen shake comes from impacts only, then settles.
        shake *= 0.85;
        a.stage.x = (Math.random() - 0.5) * shake;
        a.stage.y = (Math.random() - 0.5) * shake;
    });

    return a;
  })();
  return sharedAppPromise;
}

export function PixiClimb() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current!;
    let mounted = true;

    getSharedApp(host).then((a) => {
      if (!mounted) return;
      if (a.canvas.parentNode !== host) {
        a.resizeTo = host;
        a.renderer.resize(host.clientWidth, host.clientHeight);
        host.appendChild(a.canvas);
      }
      a.start();
    });

    return () => {
      mounted = false;
      sharedAppPromise?.then((a) => {
        a.stop();
        if (a.canvas.parentNode === host) host.removeChild(a.canvas);
      });
    };
  }, []);

  return <div ref={hostRef} className="absolute inset-0" />;
}
