import * as THREE from "three";
import { buildBarn, type Tex } from "./barn";
import {
  FIRE_COOLDOWN,
  FOV_HIP,
  FOV_ZOOM,
  PLAYER_HEIGHT,
  PLAYER_RADIUS,
  SPRINT_SPEED,
  WALK_SPEED,
} from "./constants";
import { resolve } from "./collision";
import { createMice, loadMouseTemplate } from "./mice";
import { createDust, createMoths } from "./particles";
import {
  playBoltCycle,
  playDry,
  playFloorboard,
  playHit,
  playImpact,
  playPerch,
  playShot,
  playStep,
  resumeAudio,
  setMasterMuted,
  getFlash,
  getStorm,
  tickFlash,
} from "./audio";
import { useGameStore } from "./store";

export type GameHandle = {
  dispose: () => void;
  requestLock: () => void;
  setJoy: (x: number, y: number) => void;
  look: (dx: number, dy: number) => void;
  fire: () => void;
  setZoom: (v: boolean) => void;
  setHold: (v: boolean) => void;
};

function loadTex(url: string) {
  return new Promise<THREE.Texture>((resolve, reject) => {
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    loader.load(
      url,
      (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 4;
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        resolve(t);
      },
      undefined,
      reject,
    );
  });
}

export async function createGame(canvas: HTMLCanvasElement): Promise<GameHandle> {
  const store = useGameStore;
  const isTouch =
    window.matchMedia("(pointer: coarse)").matches ||
    navigator.maxTouchPoints > 0 ||
    window.innerWidth < 700;
  store.getState().setTouch(isTouch);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: "high-performance",
    alpha: false,
  });
  renderer.setClearColor(0x020604, 1);
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const dprCap = isTouch ? 1.15 : 1.5;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020604);
  scene.fog = new THREE.FogExp2(0x030805, 0.019);

  const camera = new THREE.PerspectiveCamera(FOV_HIP, 1, 0.05, 150);
  scene.add(new THREE.AmbientLight(0x152214, 0.1));
  const hemi = new THREE.HemisphereLight(0x1c2e1c, 0x080604, 0.22);
  scene.add(hemi);
  const fill = new THREE.DirectionalLight(0x6a8860, 0.07);
  fill.position.set(6, 10, 2);
  scene.add(fill);
  const bulb = new THREE.PointLight(0x5a7848, 1.35, 16, 2.1);
  bulb.position.set(0, 4.1, 0);
  scene.add(bulb);
  const ir = new THREE.SpotLight(0xd4ffc4, 48, 36, 0.7, 0.42, 1.2);
  ir.position.set(0, 0, 0);
  camera.add(ir);
  camera.add(ir.target);
  ir.target.position.set(0, -0.22, -5);
  scene.add(camera);
  // Lightning: cool white wash that floods the barn on a strike.
  const bolt = new THREE.DirectionalLight(0xd8e8ff, 0);
  bolt.position.set(-8, 18, 6);
  scene.add(bolt);

  const dustMotesGeo = new THREE.BufferGeometry();
  const moteCount = isTouch ? 40 : 90;
  const motePos = new Float32Array(moteCount * 3);
  for (let i = 0; i < moteCount; i++) {
    motePos[i * 3] = (Math.random() - 0.5) * 20;
    motePos[i * 3 + 1] = 0.2 + Math.random() * 4;
    motePos[i * 3 + 2] = (Math.random() - 0.5) * 32;
  }
  dustMotesGeo.setAttribute("position", new THREE.BufferAttribute(motePos, 3));
  const motes = new THREE.Points(
    dustMotesGeo,
    new THREE.PointsMaterial({
      color: 0x6a8858,
      size: 0.022,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    }),
  );
  scene.add(motes);

  let tex: Tex;
  let fur: THREE.Texture | null = null;
  try {
    const [floor, wall, hay, dirt, burlap, furTex] = await Promise.all([
      loadTex("/textures/wood-floor.jpg"),
      loadTex("/textures/wood-wall.jpg"),
      loadTex("/textures/hay.jpg"),
      loadTex("/textures/dirt.jpg"),
      loadTex("/textures/burlap.jpg"),
      loadTex("/textures/mouse-fur.jpg"),
    ]);
    tex = { floor, wall, hay, dirt, burlap };
    furTex.wrapS = furTex.wrapT = THREE.RepeatWrapping;
    furTex.repeat.set(2.2, 1.6);
    fur = furTex;
  } catch {
    const mk = (c: string) => {
      const cnv = document.createElement("canvas");
      cnv.width = cnv.height = 8;
      const g = cnv.getContext("2d")!;
      g.fillStyle = c;
      g.fillRect(0, 0, 8, 8);
      const t = new THREE.CanvasTexture(cnv);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };
    tex = {
      floor: mk("#6a5a48"),
      wall: mk("#5a4a3a"),
      hay: mk("#b89a4a"),
      dirt: mk("#4a3c30"),
      burlap: mk("#8a6a40"),
    };
  }

  const barn = buildBarn(scene, tex);
  const mouseTpl = await loadMouseTemplate();
  const mice = createMice(
    scene,
    barn.obstacles,
    barn.bounds,
    barn.cover,
    fur,
    barn.perches,
    mouseTpl,
    () => playPerch(),
  );
  const dust = createDust(scene);
  const moths = createMoths(scene);

  let yaw = 0.12;
  let pitch = -0.42;
  let px = 0;
  let pz = 14.2;
  let vx = 0;
  let vz = 0;
  let fov = FOV_HIP;
  let zoom = false;
  let holdBtn = false;
  let holdT = 0;
  let exhausted = 0;
  let recoilP = 0;
  let recoilY = 0;
  let trauma = 0;
  let flash = 0;
  let lastFire = -10;
  let boltT = 99;
  let wary = 0;
  let sessionT = 0;
  let sessionKills = 0;
  let prevFlash = 0;
  let prevPhase = store.getState().phase;
  let distWalk = 0;
  let lastStep = 0;
  let joyX = 0;
  let joyY = 0;
  let injected: Set<string> | null = null;
  const held = new Set<string>();
  let raf = 0;
  let last = performance.now();
  let acc = 0;
  let disposed = false;
  const FIXED = 1 / 60;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function resize() {
    const w = Math.max(1, canvas.clientWidth);
    const h = Math.max(1, canvas.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(canvas.parentElement || canvas);

  function isDown(code: string) {
    if (injected) return injected.has(code);
    return held.has(code);
  }

  function applyLook(dx: number, dy: number) {
    const phase = store.getState().phase;
    if (phase !== "playing") return;
    const st = store.getState();
    const zoomFactor = camera.fov / FOV_HIP;
    const sens = (isTouch ? 0.0038 : 0.00215) * zoomFactor * st.look;
    yaw -= dx * sens;
    pitch -= dy * sens * (st.invertY ? -1 : 1);
    const lim = Math.PI / 2 - 0.02;
    pitch = Math.max(-lim, Math.min(lim, pitch));
  }

  function fire() {
    const phase = store.getState().phase;
    if (phase !== "playing") return;
    const t = performance.now() / 1000;
    if (t - lastFire < FIRE_COOLDOWN) {
      playDry();
      return;
    }
    lastFire = t;
    playShot();
    playBoltCycle();
    flash = 1;
    boltT = 0;
    recoilP += 0.048;
    recoilY += (Math.random() - 0.5) * 0.02;
    trauma = Math.min(1, trauma + 0.42);

    camera.rotation.order = "YXZ";
    camera.rotation.y = yaw;
    camera.rotation.x = pitch;
    camera.position.set(px, PLAYER_HEIGHT, pz);
    camera.updateMatrixWorld();

    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(0, 0), camera);
    const mouseHits = ray.intersectObjects(mice.hitMeshes, false);
    const blockHits = ray.intersectObjects(barn.occluders, false);
    const mouseD = mouseHits[0]?.distance ?? Infinity;
    const blockD = blockHits[0]?.distance ?? Infinity;
    if (mouseD < blockD && mouseD < 48) {
      const id = mouseHits[0].object.userData.mouseId as number;
      const pt = mouseHits[0].point;
      if (mice.kill(id)) {
        playHit();
        sessionKills += 1;
        store.getState().pulseHit();
        store.getState().addKill();
        dust.emit(pt.x, pt.y, pt.z, 16);
        mice.startle(pt.x, pt.z, 3.6);
      }
    } else if (blockD < 48) {
      const pt = blockHits[0].point;
      dust.emit(pt.x, pt.y, pt.z, 10);
      playImpact();
      mice.startle(pt.x, pt.z, 2.2);
    } else {
      const floorHit = ray.intersectObject(barn.floor, false);
      if (floorHit[0]) {
        dust.emit(floorHit[0].point.x, 0.02, floorHit[0].point.z, 8);
        playImpact();
        mice.startle(floorHit[0].point.x, floorHit[0].point.z, 2.8);
      } else {
        playImpact();
      }
    }
  }

  function locked() {
    return document.pointerLockElement === canvas;
  }

  function requestLock() {
    if (isTouch) return;
    const opts = { unadjustedMovement: true } as PointerLockOptions;
    const p = canvas.requestPointerLock(opts) as unknown as Promise<void> | void;
    if (p && typeof (p as Promise<void>).catch === "function") {
      (p as Promise<void>).catch(() => {
        canvas.requestPointerLock();
      });
    }
  }

  function onPointerMove(e: PointerEvent) {
    if (!locked()) return;
    applyLook(e.movementX, e.movementY);
  }

  function onPointerDown(e: PointerEvent) {
    if (store.getState().phase !== "playing") return;
    if (isTouch) return;
    if (!locked()) {
      requestLock();
      return;
    }
    if (e.button === 0) fire();
    if (e.button === 2) zoom = true;
  }

  function onPointerUp(e: PointerEvent) {
    if (e.button === 2) zoom = false;
  }

  let lookId: number | null = null;
  let lookLastX = 0;
  let lookLastY = 0;
  function onTouchStart(e: TouchEvent) {
    if (store.getState().phase !== "playing") return;
    if (e.changedTouches.length && lookId === null) {
      const t = e.changedTouches[0];
      if (t.clientX > window.innerWidth * 0.36) {
        lookId = t.identifier;
        lookLastX = t.clientX;
        lookLastY = t.clientY;
      }
    }
  }
  function onTouchMove(e: TouchEvent) {
    e.preventDefault();
    if (lookId === null) return;
    for (let i = 0; i < e.touches.length; i++) {
      const t = e.touches[i];
      if (t.identifier === lookId) {
        applyLook(t.clientX - lookLastX, t.clientY - lookLastY);
        lookLastX = t.clientX;
        lookLastY = t.clientY;
      }
    }
  }
  function onTouchEnd(e: TouchEvent) {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === lookId) lookId = null;
    }
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.code === "Space" && store.getState().phase === "playing") e.preventDefault();
    held.add(e.code);
    if (e.code === "KeyM") store.getState().toggleMute();
    if (e.code === "Escape" && store.getState().phase === "playing") {
      store.getState().pause();
      if (locked()) document.exitPointerLock();
    }
  }
  function onKeyUp(e: KeyboardEvent) {
    held.delete(e.code);
  }

  let everLocked = false;
  function onLockChange() {
    if (locked()) {
      everLocked = true;
      return;
    }
    if (everLocked && store.getState().phase === "playing" && !isTouch) {
      store.getState().pause();
    }
  }

  function onContext(e: Event) {
    e.preventDefault();
  }

  function onBlur() {
    held.clear();
    injected = null;
  }

  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("touchstart", onTouchStart, { passive: true });
  canvas.addEventListener("touchmove", onTouchMove, { passive: false });
  canvas.addEventListener("touchend", onTouchEnd);
  canvas.addEventListener("contextmenu", onContext);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  document.addEventListener("pointerlockchange", onLockChange);
  window.addEventListener("blur", onBlur);
  const onVis = () => {
    if (document.visibilityState === "visible") resumeAudio();
  };
  document.addEventListener("visibilitychange", onVis);

  const tmpF = new THREE.Vector3();
  const tmpR = new THREE.Vector3();
  const tmpLook = new THREE.Vector3();

  function fixedUpdate(dt: number) {
    const phase = store.getState().phase;
    const playing = phase === "playing";

    // The barn learns: wariness grows with kills and time, resets on re-entry.
    if (playing && prevPhase !== "playing") {
      wary = 0;
      sessionT = 0;
      sessionKills = 0;
    }
    prevPhase = phase;
    if (playing) {
      sessionT += dt;
      wary = Math.min(1, sessionKills * 0.07 + sessionT / 240);
      mice.setWary(wary);
    }

    tmpLook.set(
      -Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      -Math.cos(yaw) * Math.cos(pitch),
    );
    mice.update(dt, px, pz, tmpLook, PLAYER_HEIGHT, zoom || isDown("KeyC"));
    dust.update(dt);
    moths.update(dt);

    if (playing) {
      tmpF.set(-Math.sin(yaw), 0, -Math.cos(yaw));
      tmpR.set(Math.cos(yaw), 0, -Math.sin(yaw));
      let ix = 0;
      let iz = 0;
      if (isDown("KeyW") || isDown("ArrowUp")) iz += 1;
      if (isDown("KeyS") || isDown("ArrowDown")) iz -= 1;
      if (isDown("KeyD") || isDown("ArrowRight")) ix += 1;
      if (isDown("KeyA") || isDown("ArrowLeft")) ix -= 1;
      ix += joyX;
      iz += joyY;
      const len = Math.hypot(ix, iz);
      if (len > 1) {
        ix /= len;
        iz /= len;
      }
      const sprint = isDown("ShiftLeft") || isDown("ShiftRight");
      const max = sprint ? SPRINT_SPEED : WALK_SPEED;
      const wishX = tmpF.x * iz + tmpR.x * ix;
      const wishZ = tmpF.z * iz + tmpR.z * ix;
      vx += (wishX * max - vx) * (1 - Math.exp(-10 * dt));
      vz += (wishZ * max - vz) * (1 - Math.exp(-10 * dt));
      let nx = px + vx * dt;
      let nz = pz + vz * dt;
      nx = THREE.MathUtils.clamp(nx, -barn.bounds.hw, barn.bounds.hw);
      nz = THREE.MathUtils.clamp(nz, -barn.bounds.hd, barn.bounds.hd);
      const r = resolve(nx, nz, PLAYER_RADIUS, barn.obstacles);
      px = r.x;
      pz = r.z;
      const spd = Math.hypot(vx, vz);
      distWalk += spd * dt;
      if (spd > 0.6 && distWalk - lastStep > (sprint ? 0.48 : 0.62)) {
        lastStep = distWalk;
        playStep();
        if (Math.random() < 0.22) playFloorboard();
      }
    } else {
      vx = 0;
      vz = 0;
    }

    recoilP *= Math.exp(-7 * dt);
    recoilY *= Math.exp(-7 * dt);
    boltT += dt;
    trauma = Math.max(0, trauma - dt * 1.8);
    flash = Math.max(0, flash - dt * 6);
    exhausted = Math.max(0, exhausted - dt);
    const wanting =
      playing && (zoom || isDown("KeyC")) && (holdBtn || isDown("Space") || isDown("KeyF"));
    if (wanting && exhausted <= 0) {
      holdT += dt;
      if (holdT > 3.35) {
        exhausted = 1.7;
        holdT = 0;
      }
    } else {
      holdT = Math.max(0, holdT - dt * 1.5);
    }
  }

  function render(time: number, dt: number) {
    const phase = store.getState().phase;
    const t = time * 0.001;

    if (phase === "title") {
      const orbit = t * 0.06;
      camera.position.set(Math.sin(orbit) * 2.2 + 3.4, 1.85, Math.cos(orbit) * 2.4 + 7.2);
      camera.lookAt(0.3, 0.04, 1.6);
      camera.fov = 50;
      camera.updateProjectionMatrix();
    } else {
      const st = store.getState();
      const still =
        (zoom || isDown("KeyC")) &&
        (holdBtn || isDown("Space") || isDown("KeyF")) &&
        exhausted <= 0;
      const bob =
        reduced || Math.hypot(vx, vz) < 0.4 ? 0 : Math.sin(distWalk * 9) * (still ? 0.01 : 0.028);
      const sway = reduced ? 0 : Math.sin(t * 0.8) * (still ? 0.001 : zoom ? 0.006 : 0.004);
      const shakeOn = st.shake && !reduced;
      const shake = (shakeOn ? trauma * trauma : 0) + (exhausted > 0 ? 0.18 : 0);
      const ox = (Math.random() - 0.5) * shake * 0.05;
      const oy = (Math.random() - 0.5) * shake * 0.05;
      camera.position.set(px + ox, PLAYER_HEIGHT + bob + oy, pz);
      camera.rotation.order = "YXZ";
      camera.rotation.y = yaw + recoilY + sway;
      const breath = reduced || still ? 0 : Math.sin(t * 1.05) * (zoom ? 0.01 : 0.003);
      camera.rotation.x = pitch + recoilP + breath;
      // Working the bolt: the scope dips and resettles over the cycle.
      if (!reduced && boltT < 1.05) {
        const k = boltT / 1.05;
        camera.rotation.x += -Math.sin(k * Math.PI) * 0.02;
        camera.rotation.y += Math.sin(k * Math.PI * 2) * 0.004 * (1 - k);
      }
      camera.rotation.z = (Math.random() - 0.5) * shake * 0.012;
      const targetFov = zoom || isDown("KeyC") ? FOV_ZOOM * (still ? 0.92 : 1) : FOV_HIP;
      fov += (targetFov - fov) * (1 - Math.exp(-10 * dt));
      if (Math.abs(camera.fov - fov) > 0.05) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }
    }

    ir.intensity = 40 + Math.sin(t * 1.7) * 1.2 + flash * 28;
    bulb.intensity = 1.35 + flash * 10;
    tickFlash(dt);
    const lf = getFlash();
    if (lf > 0.55 && prevFlash <= 0.55) {
      // A strike startles the barn: scatter at two random points.
      mice.startle(px + (Math.random() - 0.5) * 12, pz + (Math.random() - 0.5) * 12, 7);
      mice.startle(px + (Math.random() - 0.5) * 12, pz + (Math.random() - 0.5) * 12, 7);
    }
    prevFlash = lf;
    bolt.intensity = lf * 9;
    hemi.intensity = 0.22 + lf * 0.9;
    const fog = scene.fog as THREE.FogExp2 | null;
    if (fog) fog.density = 0.019 + getStorm() * 0.008;
    setMasterMuted(store.getState().muted);
    renderer.render(scene, camera);
  }

  function loop(now: number) {
    if (disposed) return;
    raf = requestAnimationFrame(loop);
    let dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    acc += dt;
    const phase = store.getState().phase;
    while (acc >= FIXED) {
      if (phase !== "paused") fixedUpdate(FIXED);
      acc -= FIXED;
    }
    render(now, dt);
  }

  store.getState().setLoaded(true);
  raf = requestAnimationFrame(loop);

  const probe = {
    getYaw: () => yaw,
    getSpeed: () => Math.hypot(vx, vz),
    setKeys: (codes: string[]) => {
      injected = codes.length ? new Set(codes) : null;
    },
    setSteer: (v: number) => {
      joyX = -v;
    },
  };
  window.__controlsTest = probe;
  window.__game = {
    fire,
    getAlive: () => mice.mice.filter((m) => m.state !== "dead").length,
    lookDown: () => {
      pitch = -0.7;
    },
    lookAtNearest: () => {
      let best: (typeof mice.mice)[number] | null = null;
      let bestD = 1e9;
      for (const m of mice.mice) {
        if (m.state === "dead") continue;
        const d = Math.hypot(m.x - px, m.z - pz);
        if (d < 2.6) continue;
        if (d < bestD) {
          bestD = d;
          best = m;
        }
      }
      if (!best) return 0;
      const dx = best.x - px;
      const dz = best.z - pz;
      yaw = Math.atan2(-dx, -dz);
      pitch = -Math.atan2(PLAYER_HEIGHT - (best.y + 0.08 * best.scale), Math.max(0.2, bestD));
      return bestD;
    },
    lookAtHero: () => {
      const h = mice.mice.find((m) => m.state === "hero");
      if (!h) return 0;
      const dx = h.x - px;
      const dz = h.z - pz;
      const d = Math.hypot(dx, dz);
      yaw = Math.atan2(-dx, -dz);
      pitch = -Math.atan2(PLAYER_HEIGHT - (h.y + 0.08 * h.scale), Math.max(0.2, d));
      return d;
    },
    getStates: () => {
      const c: Record<string, number> = {};
      for (const m of mice.mice) c[m.state] = (c[m.state] ?? 0) + 1;
      return c;
    },
    hasGlb: () => !!mouseTpl,
    lookAtPoint: (x: number, y: number, z: number) => {
      const dx = x - px;
      const dz = z - pz;
      const d = Math.hypot(dx, dz);
      yaw = Math.atan2(-dx, -dz);
      pitch = -Math.atan2(PLAYER_HEIGHT - y, Math.max(0.2, d));
      return d;
    },
    getPos: () => ({ x: px, z: pz, yaw, pitch }),
  };

  return {
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
      canvas.removeEventListener("contextmenu", onContext);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      document.removeEventListener("pointerlockchange", onLockChange);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVis);
      if (locked()) document.exitPointerLock();
      mice.dispose();
      dust.dispose();
      moths.dispose();
      barn.dispose();
      renderer.dispose();
      Object.values(tex).forEach((t) => t.dispose());
      fur?.dispose();
      dustMotesGeo.dispose();
      (motes.material as THREE.Material).dispose();
      delete window.__controlsTest;
      delete window.__game;
    },
    requestLock,
    setJoy(x, y) {
      joyX = THREE.MathUtils.clamp(x, -1, 1);
      joyY = THREE.MathUtils.clamp(y, -1, 1);
    },
    look: applyLook,
    fire,
    setZoom(v) {
      zoom = v;
    },
    setHold(v) {
      holdBtn = v;
    },
  };
}

declare global {
  interface Window {
    __controlsTest?: {
      getYaw: () => number;
      getSpeed: () => number;
      setKeys?: (codes: string[]) => void;
      setSteer?: (v: number) => void;
    };
    __game?: {
      fire: () => void;
      getAlive: () => number;
      lookDown: () => void;
      lookAtNearest: () => number;
      lookAtHero: () => number;
      getStates: () => Record<string, number>;
      hasGlb: () => boolean;
      lookAtPoint: (x: number, y: number, z: number) => number;
      getPos: () => { x: number; z: number; yaw: number; pitch: number };
    };
  }
}
