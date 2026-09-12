import * as THREE from "three";
import { BARN_D, BARN_H, BARN_W } from "./constants";
import { type AABB, boxAABB } from "./collision";

export type Tex = {
  floor: THREE.Texture;
  wall: THREE.Texture;
  hay: THREE.Texture;
  dirt: THREE.Texture;
  burlap: THREE.Texture;
};

function lambert(map: THREE.Texture, color = 0xffffff) {
  return new THREE.MeshLambertMaterial({ map, color });
}

function repeat(tex: THREE.Texture, x: number, y: number) {
  const t = tex.clone();
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(x, y);
  t.needsUpdate = true;
  return t;
}

export function buildBarn(scene: THREE.Scene, tex: Tex) {
  const obstacles: AABB[] = [];
  const occluders: THREE.Object3D[] = [];
  const cover: Array<{ x: number; z: number }> = [];
  const perches: Array<{ x: number; y: number; z: number; yaw: number }> = [];
  const disposables: THREE.Object3D[] = [];
  const mats: THREE.Material[] = [];
  const geos: THREE.BufferGeometry[] = [];

  const track = <T extends THREE.Object3D>(o: T) => {
    scene.add(o);
    disposables.push(o);
    return o;
  };
  const block = <T extends THREE.Object3D>(o: T) => {
    occluders.push(o);
    return track(o);
  };
  const ring = (x: number, z: number, r = 1.2) => {
    cover.push({ x: x + r, z }, { x: x - r, z }, { x, z: z + r }, { x, z: z - r });
  };

  const floorMap = repeat(tex.floor, 10, 16);
  const floorMat = lambert(floorMap, 0x6a5e4e);
  mats.push(floorMat);
  const floorGeo = new THREE.PlaneGeometry(BARN_W, BARN_D);
  geos.push(floorGeo);
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  track(floor);

  const dirtMap = repeat(tex.dirt, 4, 14);
  const dirtMat = lambert(dirtMap, 0x4e463c);
  mats.push(dirtMat);
  const dirtGeo = new THREE.PlaneGeometry(4.4, BARN_D - 2);
  geos.push(dirtGeo);
  const aisle = new THREE.Mesh(dirtGeo, dirtMat);
  aisle.rotation.x = -Math.PI / 2;
  aisle.position.y = 0.008;
  track(aisle);

  const wallMap = repeat(tex.wall, 8, 2.2);
  const wallMat = lambert(wallMap, 0x6a5e52);
  mats.push(wallMat);
  const thick = 0.28;
  const wallSeg = (x: number, y: number, z: number, w: number, h: number, d: number) => {
    const g = new THREE.BoxGeometry(w, h, d);
    geos.push(g);
    const m = new THREE.Mesh(g, wallMat);
    m.position.set(x, y, z);
    block(m);
  };
  wallSeg(0, BARN_H / 2, -BARN_D / 2, BARN_W + thick, BARN_H, thick);
  wallSeg(0, BARN_H / 2, BARN_D / 2, BARN_W + thick, BARN_H, thick);

  const sill = 1.08;
  const winH = 1.72;
  const winTop = sill + winH;
  const winHalf = 0.98;
  const openings = [-15.4, -8.6, 1.8, 8.4];
  const frameMat = new THREE.MeshLambertMaterial({ color: 0x3a3228 });
  const glassMat = new THREE.MeshLambertMaterial({
    color: 0x8aaf90,
    transparent: true,
    opacity: 0.09,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  mats.push(frameMat, glassMat);

  const frameBar = (x: number, y: number, z: number, w: number, h: number, d: number) => {
    const g = new THREE.BoxGeometry(w, h, d);
    geos.push(g);
    const m = new THREE.Mesh(g, frameMat);
    m.position.set(x, y, z);
    track(m);
  };

  const addWindow = (x: number, side: number, z: number) => {
    const depth = 0.22;
    const fw = 0.09;
    const cx = x + side * 0.02;
    frameBar(cx, sill + winH / 2, z - winHalf, depth, winH + 0.12, fw);
    frameBar(cx, sill + winH / 2, z + winHalf, depth, winH + 0.12, fw);
    frameBar(cx, sill, z, depth, fw, winHalf * 2 + 0.1);
    frameBar(cx, winTop, z, depth, fw, winHalf * 2 + 0.1);
    frameBar(cx, sill + winH / 2, z, depth * 0.7, winH, 0.045);
    frameBar(cx, sill + winH * 0.52, z, depth * 0.7, 0.045, winHalf * 2);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(winHalf * 2 - 0.08, winH - 0.08), glassMat);
    geos.push(glass.geometry);
    glass.position.set(x + side * 0.14, sill + winH / 2, z);
    glass.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    track(glass);
  };

  const sideWall = (side: number) => {
    const x = side * (BARN_W / 2);
    wallSeg(x, sill / 2, 0, thick, sill, BARN_D);
    const topH = BARN_H - winTop;
    wallSeg(x, winTop + topH / 2, 0, thick, topH, BARN_D);
    const edge = BARN_D / 2;
    const holes = openings.map((z) => [z - winHalf, z + winHalf] as const);
    let cursor = -edge;
    for (const [a, b] of holes) {
      const len = a - cursor;
      if (len > 0.12) wallSeg(x, sill + winH / 2, (cursor + a) / 2, thick, winH, len);
      cursor = b;
    }
    const tail = edge - cursor;
    if (tail > 0.12) wallSeg(x, sill + winH / 2, (cursor + edge) / 2, thick, winH, tail);
    for (const z of openings) addWindow(x, side, z);
  };
  sideWall(-1);
  sideWall(1);

  const beamMat = new THREE.MeshLambertMaterial({ color: 0x4a3c30 });
  mats.push(beamMat);
  for (let i = -3; i <= 3; i++) {
    const g = new THREE.BoxGeometry(BARN_W - 0.4, 0.22, 0.28);
    geos.push(g);
    const beam = new THREE.Mesh(g, beamMat);
    beam.position.set(0, 4.85, i * 4.6);
    track(beam);
  }
  for (const x of [-7.4, 7.4]) {
    for (const z of [-12, -4.5, 4.5, 12]) {
      const g = new THREE.BoxGeometry(0.28, 5.0, 0.28);
      geos.push(g);
      const post = new THREE.Mesh(g, beamMat);
      post.position.set(x, 2.5, z);
      block(post);
      obstacles.push(boxAABB(x, z, 0.5, 0.5));
    }
  }

  const roofMat = new THREE.MeshLambertMaterial({ color: 0x2a241c, side: THREE.DoubleSide });
  mats.push(roofMat);
  const roofGeo = new THREE.BoxGeometry(BARN_W / 2 + 1.4, 0.14, BARN_D + 0.8);
  geos.push(roofGeo);
  const roofL = new THREE.Mesh(roofGeo, roofMat);
  roofL.position.set(-BARN_W / 4 + 0.2, 5.55, 0);
  roofL.rotation.z = 0.32;
  track(roofL);
  const roofR = roofL.clone();
  roofR.position.x *= -1;
  roofR.rotation.z *= -1;
  track(roofR);

  const hayMat = lambert(repeat(tex.hay, 1.2, 0.7), 0x5c4a28);
  mats.push(hayMat);
  const hayGeo = new THREE.BoxGeometry(1.02, 0.4, 0.52);
  geos.push(hayGeo);

  const hayPlacements: Array<[number, number, number, number]> = [];
  const addStack = (ox: number, oz: number, cols: number, rows: number, stacks: number, rot = 0) => {
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        for (let s = 0; s < stacks; s++) {
          hayPlacements.push([ox + c * 1.06, 0.2 + s * 0.4, oz + r * 0.56, rot]);
        }
      }
    }
  };
  addStack(-8.6, -13.2, 3, 2, 2);
  addStack(-8.4, 10.5, 2, 3, 2, 0.2);
  addStack(7.6, -6, 3, 2, 3, Math.PI / 2);
  addStack(7.8, 11.2, 2, 2, 2);
  addStack(-3.4, -14.6, 2, 1, 1);
  addStack(3.2, 14.8, 2, 1, 2);
  addStack(-1.6, 1.8, 1, 2, 1, 0.35);
  addStack(2.4, -4.1, 2, 1, 1, 0.12);
  addStack(-2.8, -8.4, 1, 1, 2, 0.7);
  ring(-8.0, -12.6, 1.5);
  ring(-8.0, 11.2, 1.4);
  ring(8.2, -5.6, 1.6);
  ring(8.2, 11.6, 1.3);
  ring(-1.6, 1.8, 1.1);
  ring(2.4, -4.1, 1.15);
  ring(-2.8, -8.4, 1.05);

  const hayMesh = new THREE.InstancedMesh(hayGeo, hayMat, hayPlacements.length);
  const dummy = new THREE.Object3D();
  hayPlacements.forEach(([x, y, z, rot], i) => {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, rot, 0);
    dummy.updateMatrix();
    hayMesh.setMatrixAt(i, dummy.matrix);
    const c = Math.abs(Math.cos(rot));
    const w = c > 0.5 ? 1.1 : 0.6;
    const d = c > 0.5 ? 0.6 : 1.1;
    obstacles.push(boxAABB(x, z, w, d));
  });
  hayMesh.instanceMatrix.needsUpdate = true;
  block(hayMesh);

  const perchKey = new Map<string, { x: number; y: number; z: number; yaw: number }>();
  for (const [x, y, z, rot] of hayPlacements) {
    const k = `${x.toFixed(2)}|${z.toFixed(2)}`;
    const top = y + 0.22;
    const cur = perchKey.get(k);
    if (!cur || top > cur.y) perchKey.set(k, { x, y: top, z, yaw: rot + Math.PI / 2 });
  }
  perches.push(...perchKey.values());

  const burlapMat = lambert(repeat(tex.burlap, 1, 1), 0x7a6240);
  mats.push(burlapMat);
  const sackGeo = new THREE.SphereGeometry(0.28, 8, 6);
  geos.push(sackGeo);
  const sackSpots: Array<[number, number, number]> = [
    [8.6, 0.28, -13.4],
    [8.95, 0.28, -13.1],
    [8.75, 0.52, -13.25],
    [8.4, 0.28, -12.8],
    [-9.0, 0.28, 0.6],
    [-8.7, 0.28, 1.0],
    [-8.85, 0.52, 0.8],
    [9.0, 0.28, 6.4],
    [8.7, 0.28, 6.8],
  ];
  sackSpots.forEach(([x, y, z], i) => {
    const m = new THREE.Mesh(sackGeo, burlapMat);
    m.position.set(x, y, z);
    m.scale.set(1.05, 1.15 + (i % 3) * 0.05, 0.95);
    block(m);
  });
  obstacles.push(boxAABB(8.7, -13.1, 1.4, 1.2));
  obstacles.push(boxAABB(-8.85, 0.8, 1.2, 1.1));
  obstacles.push(boxAABB(8.85, 6.6, 1.2, 1.0));

  const stallMat = new THREE.MeshLambertMaterial({ color: 0x3e3228 });
  mats.push(stallMat);
  for (let i = 0; i < 4; i++) {
    const z = -6 + i * 3.4;
    const g = new THREE.BoxGeometry(2.6, 1.15, 0.1);
    geos.push(g);
    const rail = new THREE.Mesh(g, stallMat);
    rail.position.set(-8.8, 0.58, z);
    block(rail);
    obstacles.push(boxAABB(-8.8, z, 2.6, 0.28));
    cover.push({ x: -7.2, z: z + 0.7 });
  }
  const stallBack = new THREE.BoxGeometry(0.1, 1.15, 12);
  geos.push(stallBack);
  const back = new THREE.Mesh(stallBack, stallMat);
  back.position.set(-10.1, 0.58, 0);
  block(back);

  const troughGeo = new THREE.BoxGeometry(2.8, 0.42, 0.55);
  geos.push(troughGeo);
  const trough = new THREE.Mesh(troughGeo, stallMat);
  trough.position.set(4.6, 0.22, -10.5);
  block(trough);
  obstacles.push(boxAABB(4.6, -10.5, 2.9, 0.7));
  ring(4.6, -10.5, 1.6);

  const crateGeo = new THREE.BoxGeometry(0.7, 0.55, 0.7);
  geos.push(crateGeo);
  const crateMat = new THREE.MeshLambertMaterial({ color: 0x6a543c });
  mats.push(crateMat);
  const crates: Array<[number, number, number]> = [
    [5.4, 0.28, 8.2],
    [6.1, 0.28, 8.35],
    [5.7, 0.78, 8.25],
    [-4.8, 0.28, 13.6],
  ];
  crates.forEach(([x, y, z]) => {
    const m = new THREE.Mesh(crateGeo, crateMat);
    m.position.set(x, y, z);
    m.rotation.y = (x + z) * 0.15;
    block(m);
  });
  obstacles.push(boxAABB(5.8, 8.3, 1.6, 1.2));
  obstacles.push(boxAABB(-4.8, 13.6, 0.9, 0.9));
  ring(5.8, 8.3, 1.2);
  cover.push({ x: -4.8, z: 12.6 });

  const slitMat = new THREE.MeshBasicMaterial({ color: 0x2a3a28 });
  mats.push(slitMat);
  for (let i = 0; i < 5; i++) {
    const g = new THREE.PlaneGeometry(0.08, 1.6);
    geos.push(g);
    const slit = new THREE.Mesh(g, slitMat);
    slit.position.set(-BARN_W / 2 + 0.16, 3.4, -10 + i * 5);
    slit.rotation.y = Math.PI / 2;
    track(slit);
    const slit2 = slit.clone();
    slit2.position.x = BARN_W / 2 - 0.16;
    slit2.rotation.y = -Math.PI / 2;
    track(slit2);
  }

  const bound = 0.55;
  const hw = BARN_W / 2 - bound;
  const hd = BARN_D / 2 - bound;

  const strawMap = repeat(tex.hay, 0.4, 0.2);
  const strawMat = lambert(strawMap, 0x4a3c22);
  mats.push(strawMat);
  const strawGeo = new THREE.BoxGeometry(0.32, 0.018, 0.055);
  geos.push(strawGeo);
  const strawN = 90;
  const straw = new THREE.InstancedMesh(strawGeo, strawMat, strawN);
  const sd = new THREE.Object3D();
  for (let i = 0; i < strawN; i++) {
    sd.position.set((Math.random() - 0.5) * (BARN_W - 2.4), 0.012, (Math.random() - 0.5) * (BARN_D - 2.4));
    sd.rotation.set(0, Math.random() * Math.PI, (Math.random() - 0.5) * 0.2);
    sd.scale.set(0.6 + Math.random() * 1.4, 1, 0.7 + Math.random());
    sd.updateMatrix();
    straw.setMatrixAt(i, sd.matrix);
  }
  straw.instanceMatrix.needsUpdate = true;
  track(straw);

  const fieldMap = repeat(tex.dirt, 18, 18);
  const fieldMat = lambert(fieldMap, 0x2c3828);
  mats.push(fieldMat);
  const fieldGeo = new THREE.PlaneGeometry(160, 160);
  geos.push(fieldGeo);
  const field = new THREE.Mesh(fieldGeo, fieldMat);
  field.rotation.x = -Math.PI / 2;
  field.position.y = -0.06;
  track(field);

  const cropMat = new THREE.MeshLambertMaterial({ color: 0x3a4a2c });
  mats.push(cropMat);
  const cropGeo = new THREE.BoxGeometry(22, 0.12, 1.1);
  geos.push(cropGeo);
  for (let i = 0; i < 8; i++) {
    const row = new THREE.Mesh(cropGeo, cropMat);
    row.position.set(24, 0.02, -16 + i * 4.2);
    track(row);
    const rowW = row.clone();
    rowW.position.x = -24;
    track(rowW);
  }

  const barkMat = new THREE.MeshLambertMaterial({ color: 0x2a241c, emissive: 0x0c140c, emissiveIntensity: 0.15 });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x1c2a18, emissive: 0x152414, emissiveIntensity: 0.22 });
  mats.push(barkMat, leafMat);
  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.28, 2.4, 5);
  const crownGeo = new THREE.ConeGeometry(1.35, 3.4, 6);
  geos.push(trunkGeo, crownGeo);
  const treeSpots: Array<[number, number, number, number]> = [
    [22, -16, 1.1, 0],
    [26, -8, 1.35, 0.4],
    [31, 2, 1.6, 0.2],
    [24, 12, 1.2, 0.7],
    [34, 18, 1.8, 0.1],
    [28, -22, 1.45, 0.5],
    [-23, -14, 1.15, 0.3],
    [-29, -4, 1.5, 0.6],
    [-25, 8, 1.25, 0.15],
    [-33, 16, 1.7, 0.45],
    [-27, 22, 1.3, 0.8],
    [18, 26, 1.1, 0.25],
    [-18, -26, 1.4, 0.55],
    [38, -2, 1.9, 0.35],
  ];
  const trunks = new THREE.InstancedMesh(trunkGeo, barkMat, treeSpots.length);
  const crowns = new THREE.InstancedMesh(crownGeo, leafMat, treeSpots.length);
  treeSpots.forEach(([x, z, s, rot], i) => {
    dummy.position.set(x, 1.2 * s, z);
    dummy.rotation.set(0, rot, 0);
    dummy.scale.set(s, s, s);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    dummy.position.y = 2.6 * s;
    dummy.updateMatrix();
    crowns.setMatrixAt(i, dummy.matrix);
  });
  trunks.instanceMatrix.needsUpdate = true;
  crowns.instanceMatrix.needsUpdate = true;
  track(trunks);
  track(crowns);

  const fenceMat = new THREE.MeshLambertMaterial({ color: 0x4a4030, emissive: 0x1a1810, emissiveIntensity: 0.12 });
  mats.push(fenceMat);
  const postGeo = new THREE.BoxGeometry(0.09, 1.05, 0.09);
  geos.push(postGeo);
  const postN = 36;
  const posts = new THREE.InstancedMesh(postGeo, fenceMat, postN);
  for (let i = 0; i < postN; i++) {
    const east = i < postN / 2;
    const k = i % (postN / 2);
    dummy.position.set(east ? 16.4 : -16.4, 0.52, -20 + k * (40 / 17));
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    posts.setMatrixAt(i, dummy.matrix);
  }
  posts.instanceMatrix.needsUpdate = true;
  track(posts);
  const railGeo = new THREE.BoxGeometry(0.06, 0.07, 40);
  geos.push(railGeo);
  for (const x of [16.4, -16.4]) {
    for (const y of [0.38, 0.72]) {
      const rail = new THREE.Mesh(railGeo, fenceMat);
      rail.position.set(x, y, 0);
      track(rail);
    }
  }

  const siloMat = new THREE.MeshLambertMaterial({ color: 0x4a5248, emissive: 0x1c241c, emissiveIntensity: 0.18 });
  mats.push(siloMat);
  const silo = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.7, 7.2, 10), siloMat);
  geos.push(silo.geometry);
  silo.position.set(30, 3.6, -14);
  track(silo);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(1.85, 1.6, 10), siloMat);
  geos.push(cap.geometry);
  cap.position.set(30, 8.0, -14);
  track(cap);

  const shedMat = new THREE.MeshLambertMaterial({ color: 0x3a342c, emissive: 0x141810, emissiveIntensity: 0.14 });
  mats.push(shedMat);
  const shed = new THREE.Mesh(new THREE.BoxGeometry(6.2, 2.6, 4.4), shedMat);
  geos.push(shed.geometry);
  shed.position.set(-32, 1.3, 10);
  track(shed);
  const shedRoof = new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.16, 5.0), shedMat);
  geos.push(shedRoof.geometry);
  shedRoof.position.set(-32, 2.72, 10);
  shedRoof.rotation.z = 0.18;
  track(shedRoof);

  const skyMat = new THREE.MeshBasicMaterial({ color: 0x050908, side: THREE.BackSide, fog: false });
  mats.push(skyMat);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(90, 16, 12), skyMat);
  geos.push(sky.geometry);
  track(sky);

  const starN = 160;
  const starPos = new Float32Array(starN * 3);
  for (let i = 0; i < starN; i++) {
    const a = Math.random() * Math.PI * 2;
    const e = 0.15 + Math.random() * 1.15;
    starPos[i * 3] = Math.cos(a) * Math.cos(e) * 72;
    starPos[i * 3 + 1] = Math.sin(e) * 72;
    starPos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * 72;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
  geos.push(starGeo);
  const stars = new THREE.Points(
    starGeo,
    new THREE.PointsMaterial({ color: 0xd4e8c4, size: 0.55, sizeAttenuation: true, fog: false, depthWrite: false }),
  );
  mats.push(stars.material);
  track(stars);

  const moonMat = new THREE.MeshBasicMaterial({ color: 0xdde8c8, fog: false });
  mats.push(moonMat);
  const moon = new THREE.Mesh(new THREE.SphereGeometry(3.4, 12, 10), moonMat);
  geos.push(moon.geometry);
  moon.position.set(48, 34, -8);
  track(moon);
  const moonLight = new THREE.DirectionalLight(0xc4dcb4, 0.22);
  moonLight.position.copy(moon.position);
  track(moonLight);

  return {
    floor,
    obstacles,
    occluders,
    cover,
    perches,
    bounds: { hw, hd },
    dispose() {
      for (const o of disposables) {
        scene.remove(o);
      }
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
      floorMap.dispose();
      dirtMap.dispose();
      wallMap.dispose();
      strawMap.dispose();
      fieldMap.dispose();
    },
  };
}
