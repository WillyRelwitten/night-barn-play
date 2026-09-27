import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { BARN_D, BARN_W, MOUSE_COUNT } from "./constants";
import { type AABB, blocked, resolve } from "./collision";
import { playSkitter } from "./audio";

export type Mouse = {
  id: number;
  x: number;
  z: number;
  y: number;
  yaw: number;
  speed: number;
  state: "idle" | "walk" | "nibble" | "dart" | "dead" | "freeze" | "hero";
  resume: "idle" | "walk" | "nibble";
  timer: number;
  targetX: number;
  targetZ: number;
  anim: number;
  scale: number;
  deadT: number;
  flash: number;
  group: THREE.Group;
  bodyMat: THREE.MeshLambertMaterial;
  flashMats: THREE.MeshLambertMaterial[];
};

const BODY_COLOR = 0x5a4c3c;
const BODY_EMISSIVE = 0x8eae6c;
const BODY_EMISSIVE_I = 0.58;
const FLASH_EMISSIVE = 0xd8ffb0;

type Assets = {
  bodyGeo: THREE.SphereGeometry;
  headGeo: THREE.SphereGeometry;
  snoutGeo: THREE.SphereGeometry;
  earGeo: THREE.SphereGeometry;
  tailGeo: THREE.CylinderGeometry;
  tailTipGeo: THREE.CylinderGeometry;
  legGeo: THREE.CylinderGeometry;
  pawGeo: THREE.SphereGeometry;
  whiskerGeo: THREE.CylinderGeometry;
  noseGeo: THREE.SphereGeometry;
  eyeGeo: THREE.SphereGeometry;
  eyeMat: THREE.MeshLambertMaterial;
  pinkMat: THREE.MeshLambertMaterial;
  whiskerMat: THREE.MeshLambertMaterial;
  hitGeo: THREE.SphereGeometry;
  hitMat: THREE.MeshBasicMaterial;
};

function makeAssets(): Assets {
  const tailGeo = new THREE.CylinderGeometry(0.011, 0.006, 0.14, 6);
  tailGeo.rotateX(Math.PI / 2);
  const tailTipGeo = new THREE.CylinderGeometry(0.006, 0.0022, 0.11, 5);
  tailTipGeo.rotateX(Math.PI / 2);
  const whiskerGeo = new THREE.CylinderGeometry(0.0011, 0.0006, 0.058, 3);
  whiskerGeo.rotateZ(Math.PI / 2);
  const legGeo = new THREE.CylinderGeometry(0.009, 0.013, 0.052, 6);
  return {
    bodyGeo: new THREE.SphereGeometry(0.08, 12, 10),
    headGeo: new THREE.SphereGeometry(0.048, 10, 8),
    snoutGeo: new THREE.SphereGeometry(0.018, 8, 6),
    earGeo: new THREE.SphereGeometry(0.021, 8, 6),
    tailGeo,
    tailTipGeo,
    legGeo,
    pawGeo: new THREE.SphereGeometry(0.011, 6, 5),
    whiskerGeo,
    noseGeo: new THREE.SphereGeometry(0.007, 6, 5),
    eyeGeo: new THREE.SphereGeometry(0.009, 6, 5),
    eyeMat: new THREE.MeshLambertMaterial({
      color: 0xf4ffd4,
      emissive: 0xc6ff7a,
      emissiveIntensity: 2.6,
    }),
    pinkMat: new THREE.MeshLambertMaterial({
      color: 0xc48a78,
      emissive: 0x8a5a48,
      emissiveIntensity: 0.55,
    }),
    whiskerMat: new THREE.MeshLambertMaterial({
      color: 0xd8d4c4,
      emissive: 0x8a9a70,
      emissiveIntensity: 0.4,
    }),
    hitGeo: new THREE.SphereGeometry(0.3, 6, 4),
    hitMat: new THREE.MeshBasicMaterial({ visible: false }),
  };
}

function makeMouseGroup(assets: Assets, bodyMat: THREE.MeshLambertMaterial) {
  const root = new THREE.Group();
  const body = new THREE.Mesh(assets.bodyGeo, bodyMat);
  body.scale.set(1.14, 0.82, 1.88);
  body.position.y = 0.072;

  const head = new THREE.Mesh(assets.headGeo, bodyMat);
  head.position.set(0, 0.074, 0.118);
  head.scale.set(1.04, 0.94, 1.14);

  const snout = new THREE.Mesh(assets.snoutGeo, bodyMat);
  snout.position.set(0, -0.006, 0.042);
  snout.scale.set(0.72, 0.52, 1.18);

  const nose = new THREE.Mesh(assets.noseGeo, assets.pinkMat);
  nose.position.set(0, -0.002, 0.028);
  snout.add(nose);

  const earL = new THREE.Mesh(assets.earGeo, bodyMat);
  earL.position.set(-0.025, 0.038, -0.008);
  earL.scale.set(0.72, 1.4, 0.3);
  const innerL = new THREE.Mesh(assets.earGeo, assets.pinkMat);
  innerL.position.set(0, 0, 0.35);
  innerL.scale.set(0.55, 0.55, 0.4);
  earL.add(innerL);
  const earR = earL.clone();
  earR.position.x = 0.025;

  const eyeL = new THREE.Mesh(assets.eyeGeo, assets.eyeMat);
  eyeL.position.set(-0.018, 0.01, 0.038);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.018;

  const wAng = [-0.35, 0, 0.32];
  const wY = [-0.008, 0.002, 0.01];
  for (const side of [-1, 1]) {
    wAng.forEach((a, i) => {
      const w = new THREE.Mesh(assets.whiskerGeo, assets.whiskerMat);
      w.position.set(side * 0.02, wY[i], 0.036);
      w.rotation.y = side * (0.55 + a * 0.4);
      w.rotation.z = a * 0.5;
      snout.add(w);
    });
  }

  head.add(earL, earR, eyeL, eyeR, snout);

  const tail = new THREE.Mesh(assets.tailGeo, bodyMat);
  tail.position.set(0, 0.052, -0.14);
  tail.rotation.x = 0.16;
  const tip = new THREE.Mesh(assets.tailTipGeo, assets.pinkMat);
  tip.position.set(0, 0, -0.12);
  tail.add(tip);

  const legOffsets: Array<[number, number, number]> = [
    [-0.034, 0.026, 0.044],
    [0.034, 0.026, 0.044],
    [-0.036, 0.026, -0.046],
    [0.036, 0.026, -0.046],
  ];
  const legs: THREE.Mesh[] = [];
  for (const [x, y, z] of legOffsets) {
    const leg = new THREE.Mesh(assets.legGeo, bodyMat);
    leg.position.set(x, y, z);
    const paw = new THREE.Mesh(assets.pawGeo, assets.pinkMat);
    paw.position.set(0, -0.026, 0.006);
    paw.scale.set(1.1, 0.7, 1.25);
    leg.add(paw);
    root.add(leg);
    legs.push(leg);
  }

  const hit = new THREE.Mesh(assets.hitGeo, assets.hitMat);
  hit.position.y = 0.055;
  root.add(body, head, tail, hit);
  root.userData.body = body;
  root.userData.head = head;
  root.userData.tail = tail;
  root.userData.hit = hit;
  root.userData.legs = legs;
  return root;
}

function rand(a: number, b: number) {
  return a + Math.random() * (b - a);
}

function wrapAngle(a: number) {
  const t = Math.PI * 2;
  return ((((a + Math.PI) % t) + t) % t) - Math.PI;
}

function lerpAng(a: number, b: number, t: number) {
  return a + wrapAngle(b - a) * t;
}

function paintBody(mats: THREE.MeshLambertMaterial[], flash: boolean) {
  for (const mat of mats) {
    if (flash) {
      mat.emissive.setHex(FLASH_EMISSIVE);
      mat.emissiveIntensity = 1.35;
    } else {
      const skin = (mat.userData.kind as string) === "skin";
      mat.emissive.setHex(skin ? 0xc9a090 : 0xb8e08a);
      mat.emissiveIntensity = skin ? 0.85 : 1.15;
    }
  }
}

function named(root: THREE.Object3D, name: string) {
  return root.getObjectByName(name) as THREE.Object3D | undefined;
}

function nvMat(src: THREE.Material): THREE.MeshLambertMaterial {
  const any = src as THREE.MeshStandardMaterial;
  const skin = (src.name || "").toLowerCase().includes("skin");
  const mat = new THREE.MeshLambertMaterial({
    map: any.map ?? null,
    color: 0xffffff,
    emissive: skin ? 0xc9a090 : 0xb8e08a,
    emissiveMap: any.map ?? null,
    emissiveIntensity: skin ? 0.85 : 1.15,
    side: src.side,
  });
  mat.userData.kind = skin ? "skin" : "fur";
  return mat;
}

function instantiateGlb(
  template: THREE.Group,
  hitGeo: THREE.SphereGeometry,
  hitMat: THREE.MeshBasicMaterial,
) {
  const root = template.clone(true);
  const flashMats: THREE.MeshLambertMaterial[] = [];
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const src = mesh.material;
    if (Array.isArray(src)) {
      mesh.material = src.map((s) => {
        const m = nvMat(s);
        flashMats.push(m);
        return m;
      });
    } else {
      const m = nvMat(src);
      flashMats.push(m);
      mesh.material = m;
    }
  });
  const hit = new THREE.Mesh(hitGeo, hitMat);
  hit.position.y = 0.05;
  root.add(hit);
  root.userData.body = named(root, "Body") ?? root;
  root.userData.head = named(root, "Head") ?? root;
  root.userData.tail = named(root, "Tail") ?? root;
  root.userData.hit = hit;
  root.userData.legs = [
    named(root, "LegFL"),
    named(root, "LegFR"),
    named(root, "LegBL"),
    named(root, "LegBR"),
  ].filter(Boolean);
  root.userData.flashMats = flashMats;
  return root;
}

export async function loadMouseTemplate(): Promise<THREE.Group | null> {
  try {
    const gltf = await new GLTFLoader().loadAsync("/models/house-mouse.glb");
    const mouse = named(gltf.scene, "Mouse") as THREE.Group | undefined;
    const root = mouse ?? gltf.scene;
    root.updateMatrixWorld(true);
    // Rest the feet on the floor: the rat model's paws dip below y=0. The root's
    // own position is overwritten per frame, so lift its children instead.
    const minY = new THREE.Box3().setFromObject(root).min.y;
    if (Number.isFinite(minY) && Math.abs(minY) > 1e-4) {
      for (const c of root.children) c.position.y -= minY;
      root.updateMatrixWorld(true);
    }
    return root;
  } catch {
    return null;
  }
}

export function createMice(
  scene: THREE.Scene,
  obstacles: AABB[],
  bounds: { hw: number; hd: number },
  cover: Array<{ x: number; z: number }>,
  fur: THREE.Texture | null,
  perches: Array<{ x: number; y: number; z: number; yaw: number }>,
  template: THREE.Group | null,
  onHero?: () => void,
) {
  const assets = makeAssets();
  const mice: Mouse[] = [];
  const hitMeshes: THREE.Object3D[] = [];
  let heroId = -1;
  let heroWait = rand(2.5, 6);
  // Session wariness 0..1: the barn learns. Set via setWary by the engine.
  let waryLevel = 0;

  const pickPos = (avoidX?: number, avoidZ?: number, minDist = 0) => {
    for (let n = 0; n < 30; n++) {
      const x = rand(-bounds.hw + 0.6, bounds.hw - 0.6);
      const z = rand(-bounds.hd + 0.6, bounds.hd - 0.6);
      if (blocked(x, z, 0.2, obstacles)) continue;
      if (avoidX !== undefined && Math.hypot(x - avoidX, z - (avoidZ ?? 0)) < minDist) continue;
      return { x, z };
    }
    return { x: rand(-4, 4), z: rand(-8, 8) };
  };

  const pickCover = (avoidX?: number, avoidZ?: number, minDist = 0) => {
    if (cover.length === 0) return pickPos(avoidX, avoidZ, minDist);
    for (let n = 0; n < 16; n++) {
      const c = cover[(Math.random() * cover.length) | 0];
      const jx = c.x + rand(-0.35, 0.35);
      const jz = c.z + rand(-0.35, 0.35);
      if (blocked(jx, jz, 0.2, obstacles)) continue;
      if (avoidX !== undefined && Math.hypot(jx - avoidX, jz - (avoidZ ?? 0)) < minDist) continue;
      const cx = THREE.MathUtils.clamp(jx, -bounds.hw + 0.4, bounds.hw - 0.4);
      const cz = THREE.MathUtils.clamp(jz, -bounds.hd + 0.4, bounds.hd - 0.4);
      return { x: cx, z: cz };
    }
    return pickPos(avoidX, avoidZ, minDist);
  };

  function spawnInto(m: Mouse, avoidX?: number, avoidZ?: number) {
    if (m.id === heroId) heroId = -1;
    const keep = 3.5 * waryLevel;
    const p =
      Math.random() < 0.72
        ? pickCover(avoidX, avoidZ, 6.5 + keep)
        : pickPos(avoidX, avoidZ, 7 + keep);
    m.x = p.x;
    m.z = p.z;
    m.y = 0;
    m.yaw = rand(0, Math.PI * 2);
    m.speed = 0;
    m.state = Math.random() < 0.5 ? "idle" : "walk";
    m.resume = "idle";
    m.timer = rand(0.4, 2.2);
    m.targetX = m.x;
    m.targetZ = m.z;
    m.anim = Math.random() * 10;
    m.deadT = 0;
    m.flash = 0;
    paintBody(m.flashMats, false);
    m.group.visible = true;
    m.group.rotation.set(0, m.yaw, 0);
    m.group.position.set(m.x, 0, m.z);
    const hit = m.group.userData.hit as THREE.Mesh;
    if (!hitMeshes.includes(hit)) hitMeshes.push(hit);
    pickWalkTarget(m);
  }

  function pickWalkTarget(m: Mouse) {
    const p = Math.random() < 0.62 ? pickCover() : pickPos();
    m.targetX = p.x;
    m.targetZ = p.z;
  }

  for (let i = 0; i < MOUSE_COUNT; i++) {
    let group: THREE.Group;
    let bodyMat: THREE.MeshLambertMaterial;
    let flashMats: THREE.MeshLambertMaterial[];
    if (template) {
      group = instantiateGlb(template, assets.hitGeo, assets.hitMat);
      flashMats = group.userData.flashMats as THREE.MeshLambertMaterial[];
      bodyMat = flashMats[0];
    } else {
      bodyMat = new THREE.MeshLambertMaterial({
        map: fur,
        color: fur ? 0xc8b8a0 : BODY_COLOR,
        emissive: BODY_EMISSIVE,
        emissiveIntensity: BODY_EMISSIVE_I,
      });
      group = makeMouseGroup(assets, bodyMat);
      flashMats = [bodyMat];
    }
    const scale = template ? rand(1.85, 2.45) : rand(1.4, 1.9);
    group.scale.setScalar(scale);
    scene.add(group);
    const hit = group.userData.hit as THREE.Mesh;
    hit.userData.mouseId = i;
    hitMeshes.push(hit);
    const m: Mouse = {
      id: i,
      x: 0,
      z: 0,
      y: 0,
      yaw: 0,
      speed: 0,
      state: "idle",
      resume: "idle",
      timer: 1,
      targetX: 0,
      targetZ: 0,
      anim: 0,
      scale,
      deadT: 0,
      flash: 0,
      group,
      bodyMat,
      flashMats,
    };
    mice.push(m);
    spawnInto(m);
  }

  function setState(m: Mouse, state: Mouse["state"], t: number) {
    const was = m.state;
    if (was === "hero" && state !== "hero" && m.id === heroId) heroId = -1;
    m.state = state;
    m.timer = t;
    if (state === "walk" || state === "dart") pickWalkTarget(m);
    if (state === "dart" && was !== "dart") playSkitter();
  }

  function pickPerch(playerX: number, playerZ: number) {
    if (perches.length === 0) return null;
    let best = perches[0];
    let bestS = -1;
    for (const p of perches) {
      const d = Math.hypot(p.x - playerX, p.z - playerZ);
      if (d < 4.2) continue;
      const s = d * 0.2 + p.y * 3 + Math.random();
      if (s > bestS) {
        bestS = s;
        best = p;
      }
    }
    return bestS < 0 ? perches[(Math.random() * perches.length) | 0] : best;
  }

  function makeHero(playerX: number, playerZ: number) {
    if (heroId >= 0 && mice[heroId]?.state === "hero") return;
    const perch = pickPerch(playerX, playerZ);
    if (!perch) return;
    const pool = mice.filter((m) => m.state !== "dead" && m.state !== "dart");
    if (pool.length === 0) return;
    const m = pool[(Math.random() * pool.length) | 0];
    m.x = perch.x + rand(-0.08, 0.08);
    m.z = perch.z + rand(-0.06, 0.06);
    m.y = perch.y;
    m.yaw = perch.yaw + rand(-0.2, 0.2);
    m.speed = 0;
    m.state = "hero";
    m.resume = "nibble";
    m.timer = rand(9, 22);
    m.targetX = m.x;
    m.targetZ = m.z;
    heroId = m.id;
    onHero?.();
  }

  function inBeam(
    m: Mouse,
    playerX: number,
    playerZ: number,
    look: THREE.Vector3,
    camY: number,
    zoomed: boolean,
  ) {
    const dx = m.x - playerX;
    const dy = m.y + 0.04 - camY;
    const dz = m.z - playerZ;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1.5 || len > 28) return false;
    const ang = Math.acos(
      THREE.MathUtils.clamp((dx * look.x + dy * look.y + dz * look.z) / len, -1, 1),
    );
    const tight = zoomed ? 0.09 : 0.13;
    if (m.state === "freeze") return ang < 0.22;
    return ang < tight;
  }

  function gait(m: Mouse) {
    const legs = m.group.userData.legs as THREE.Mesh[] | undefined;
    if (!legs || legs.length < 4) return;
    const amp =
      m.state === "freeze" || m.state === "hero"
        ? 0.04
        : m.speed > 0.05
          ? m.state === "dart"
            ? 1.05
            : 0.82
          : 0.05;
    const g = m.anim * (m.state === "dart" ? 3.4 : 2.15);
    legs[0].rotation.x = Math.sin(g) * amp;
    legs[1].rotation.x = Math.sin(g + Math.PI) * amp;
    legs[2].rotation.x = Math.sin(g + Math.PI) * amp;
    legs[3].rotation.x = Math.sin(g) * amp;
  }

  function update(
    dt: number,
    playerX: number,
    playerZ: number,
    look: THREE.Vector3,
    camY: number,
    zoomed: boolean,
  ) {
    heroWait -= dt;
    if (heroWait <= 0) {
      makeHero(playerX, playerZ);
      heroWait = rand(4, 10);
    }

    for (const m of mice) {
      if (m.state === "dead") {
        m.deadT += dt;
        m.y = Math.max(0.02, m.y - dt * 0.8);
        m.group.rotation.z = Math.min(m.deadT * 6, Math.PI / 2);
        m.group.position.set(m.x, m.y, m.z);
        const tail = m.group.userData.tail as THREE.Mesh;
        tail.rotation.y = Math.sin(m.deadT * 18) * Math.max(0, 0.5 - m.deadT);
        if (m.deadT > 9.4) spawnInto(m, playerX, playerZ);
        continue;
      }

      if (m.flash > 0) {
        m.flash -= dt;
        if (m.flash <= 0) paintBody(m.flashMats, false);
      }

      const watched = inBeam(m, playerX, playerZ, look, camY, zoomed);
      if (watched && m.state !== "dart" && m.state !== "hero") {
        if (m.state !== "freeze") {
          m.resume = m.state === "nibble" || m.state === "walk" ? m.state : "idle";
          m.state = "freeze";
          m.speed = 0;
        }
        // Wary mice hold the freeze for less time.
        m.timer = 0.35 * (1 - 0.65 * waryLevel);
      } else if (m.state === "freeze" && !watched) {
        setState(m, m.resume, rand(0.4, 1.2));
      }

      m.timer -= dt;

      if (m.timer <= 0 && m.state !== "freeze") {
        const r = Math.random();
        if (m.state === "idle") setState(m, r < 0.7 ? "walk" : "nibble", rand(0.8, 2.4));
        else if (m.state === "nibble")
          setState(m, r < 0.22 + 0.35 * waryLevel ? "dart" : "walk", rand(0.4, 2));
        else if (m.state === "dart") setState(m, "idle", rand(0.5, 1.4));
        else if (m.state === "hero") {
          setState(m, "walk", rand(0.8, 1.6));
          heroWait = rand(3, 8);
        } else setState(m, r < 0.12 ? "dart" : r < 0.45 ? "idle" : "nibble", rand(0.5, 1.8));
      }

      const want =
        m.state === "dart" ? 1.55 * (1 + 0.6 * waryLevel) : m.state === "walk" ? 0.38 : 0;
      m.speed += (want - m.speed) * Math.min(1, dt * 6);

      if (m.speed > 0.02) {
        const tx = m.targetX - m.x;
        const tz = m.targetZ - m.z;
        const desired = Math.atan2(tx, tz);
        m.yaw = lerpAng(m.yaw, desired, 1 - Math.exp(-(m.state === "dart" ? 8 : 4) * dt));
        const step = m.speed * dt;
        let nx = m.x + Math.sin(m.yaw) * step;
        let nz = m.z + Math.cos(m.yaw) * step;
        nx = THREE.MathUtils.clamp(nx, -bounds.hw + 0.35, bounds.hw - 0.35);
        nz = THREE.MathUtils.clamp(nz, -bounds.hd + 0.35, bounds.hd - 0.35);
        const r = resolve(nx, nz, 0.12, obstacles);
        if (Math.hypot(r.x - m.x, r.z - m.z) < step * 0.2) pickWalkTarget(m);
        m.x = r.x;
        m.z = r.z;
        if (Math.hypot(m.targetX - m.x, m.targetZ - m.z) < 0.35) pickWalkTarget(m);
      }

      const wantY = m.state === "hero" ? m.y : 0;
      if (m.state !== "hero") m.y += (wantY - m.y) * Math.min(1, dt * 6);
      if (m.y < 0.002) m.y = 0;

      m.anim += dt * (2 + m.speed * 16);
      const bob =
        m.state === "hero" || m.state === "freeze"
          ? Math.sin(m.anim * 0.55) * 0.002
          : m.speed > 0.05
            ? Math.abs(Math.sin(m.anim * 2.2)) * 0.016
            : Math.sin(m.anim * 0.8) * 0.004;
      m.group.position.set(m.x, m.y + bob, m.z);
      m.group.rotation.set(0, m.yaw, 0);
      const head = m.group.userData.head as THREE.Mesh;
      if (m.state === "nibble" || m.state === "hero")
        head.rotation.x = (template ? 0.16 : 0.42) + Math.sin(m.anim * 2.4) * 0.08;
      else if (m.state === "freeze") head.rotation.x = Math.sin(m.anim * 0.35) * 0.03;
      else head.rotation.x = Math.sin(m.anim * 0.7) * 0.08;
      const tail = m.group.userData.tail as THREE.Mesh;
      const tailAmp =
        m.state === "freeze" ? 0.08 : m.state === "hero" ? 0.18 : template ? 0.22 : 0.45;
      tail.rotation.y = Math.sin(m.anim * (m.state === "freeze" ? 0.6 : 1.6)) * tailAmp;
      gait(m);
    }
  }

  function kill(id: number) {
    const m = mice[id];
    if (!m || m.state === "dead") return false;
    if (m.id === heroId) {
      heroId = -1;
      heroWait = rand(3.5, 8);
    }
    m.state = "dead";
    m.deadT = 0;
    m.speed = 0;
    m.flash = 0.12;
    paintBody(m.flashMats, true);
    const hit = m.group.userData.hit as THREE.Mesh;
    const idx = hitMeshes.indexOf(hit);
    if (idx >= 0) hitMeshes.splice(idx, 1);
    return true;
  }

  function startle(x: number, z: number, radius = 3.4) {
    for (const m of mice) {
      if (m.state === "dead") continue;
      const d = Math.hypot(m.x - x, m.z - z);
      if (d > radius || d < 0.08) continue;
      if (m.state === "hero") m.y = Math.max(0, m.y - 0.15);
      const p = pickCover(x, z, 2.2);
      setState(m, "dart", rand(0.45, 1.15));
      m.targetX = p.x;
      m.targetZ = p.z;
    }
  }

  function dispose() {
    for (const m of mice) {
      scene.remove(m.group);
      for (const mat of m.flashMats) mat.dispose();
    }
    if (!template) {
      assets.bodyGeo.dispose();
      assets.headGeo.dispose();
      assets.snoutGeo.dispose();
      assets.earGeo.dispose();
      assets.tailGeo.dispose();
      assets.tailTipGeo.dispose();
      assets.legGeo.dispose();
      assets.pawGeo.dispose();
      assets.whiskerGeo.dispose();
      assets.noseGeo.dispose();
      assets.eyeGeo.dispose();
      assets.eyeMat.dispose();
      assets.pinkMat.dispose();
      assets.whiskerMat.dispose();
    }
    assets.hitGeo.dispose();
    assets.hitMat.dispose();
  }

  return {
    mice,
    hitMeshes,
    update,
    kill,
    startle,
    dispose,
    setWary: (v: number) => {
      waryLevel = Math.min(1, Math.max(0, v));
    },
  };
}

export function randomBarnPoint() {
  return {
    x: (Math.random() - 0.5) * (BARN_W - 4),
    z: (Math.random() - 0.5) * (BARN_D - 4),
  };
}
