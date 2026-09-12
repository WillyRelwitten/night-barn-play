import * as THREE from "three";

type P = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
};

export function createDust(scene: THREE.Scene) {
  const max = 80;
  const pool: P[] = [];
  const positions = new Float32Array(max * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xc4b48a,
    size: 0.045,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const points = new THREE.Points(geo, mat);
  scene.add(points);

  function emit(x: number, y: number, z: number, n = 10) {
    for (let i = 0; i < n; i++) {
      if (pool.length >= max) pool.shift();
      const a = Math.random() * Math.PI * 2;
      const s = 0.4 + Math.random() * 1.1;
      pool.push({
        x,
        y: y + 0.02,
        z,
        vx: Math.cos(a) * s,
        vy: 0.6 + Math.random() * 1.1,
        vz: Math.sin(a) * s,
        life: 0.35 + Math.random() * 0.35,
        max: 0.55,
      });
    }
  }

  function update(dt: number) {
    for (let i = pool.length - 1; i >= 0; i--) {
      const p = pool[i];
      p.life -= dt;
      if (p.life <= 0) {
        pool.splice(i, 1);
        continue;
      }
      p.vy -= 4.5 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < 0.01) {
        p.y = 0.01;
        p.vy *= -0.2;
        p.vx *= 0.6;
        p.vz *= 0.6;
      }
    }
    for (let i = 0; i < max; i++) {
      const p = pool[i];
      if (p) {
        positions[i * 3] = p.x;
        positions[i * 3 + 1] = p.y;
        positions[i * 3 + 2] = p.z;
      } else {
        positions[i * 3] = 0;
        positions[i * 3 + 1] = -10;
        positions[i * 3 + 2] = 0;
      }
    }
    geo.attributes.position.needsUpdate = true;
    geo.setDrawRange(0, pool.length);
  }

  function dispose() {
    scene.remove(points);
    geo.dispose();
    mat.dispose();
  }

  return { emit, update, dispose };
}

export function createMoths(scene: THREE.Scene) {
  const n = 18;
  const pos = new Float32Array(n * 3);
  const moths: Array<{ x: number; y: number; z: number; vx: number; vy: number; vz: number; t: number }> = [];
  for (let i = 0; i < n; i++) {
    moths.push({
      x: (Math.random() - 0.5) * 18,
      y: 0.4 + Math.random() * 3.2,
      z: (Math.random() - 0.5) * 30,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.25,
      vz: (Math.random() - 0.5) * 0.4,
      t: Math.random() * 10,
    });
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xeaffc8,
    size: 0.032,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const points = new THREE.Points(geo, mat);
  scene.add(points);

  function update(dt: number) {
    for (let i = 0; i < n; i++) {
      const m = moths[i];
      m.t += dt;
      m.vx += Math.sin(m.t * 3.1 + i) * 0.35 * dt;
      m.vy += Math.cos(m.t * 2.4 + i * 0.7) * 0.22 * dt;
      m.vz += Math.sin(m.t * 2.2 + i * 1.3) * 0.35 * dt;
      const sp = Math.hypot(m.vx, m.vy, m.vz);
      if (sp > 0.7) {
        m.vx *= 0.7 / sp;
        m.vy *= 0.7 / sp;
        m.vz *= 0.7 / sp;
      }
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      m.z += m.vz * dt;
      if (Math.abs(m.x) > 10) m.vx *= -1;
      if (Math.abs(m.z) > 16) m.vz *= -1;
      if (m.y < 0.25) {
        m.y = 0.25;
        m.vy = Math.abs(m.vy);
      }
      if (m.y > 4.4) {
        m.y = 4.4;
        m.vy = -Math.abs(m.vy);
      }
      pos[i * 3] = m.x;
      pos[i * 3 + 1] = m.y;
      pos[i * 3 + 2] = m.z;
    }
    geo.attributes.position.needsUpdate = true;
  }

  function dispose() {
    scene.remove(points);
    geo.dispose();
    mat.dispose();
  }

  return { update, dispose };
}
