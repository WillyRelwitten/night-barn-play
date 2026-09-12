export type AABB = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

export function boxAABB(x: number, z: number, w: number, d: number): AABB {
  const hw = w * 0.5;
  const hd = d * 0.5;
  return { minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd };
}

export function overlaps(x: number, z: number, r: number, b: AABB) {
  return x + r > b.minX && x - r < b.maxX && z + r > b.minZ && z - r < b.maxZ;
}

export function resolve(x: number, z: number, r: number, boxes: AABB[]): { x: number; z: number } {
  let nx = x;
  let nz = z;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (!overlaps(nx, nz, r, b)) continue;
    const left = nx + r - b.minX;
    const right = b.maxX - (nx - r);
    const top = nz + r - b.minZ;
    const bot = b.maxZ - (nz - r);
    const m = Math.min(left, right, top, bot);
    if (m === left) nx = b.minX - r;
    else if (m === right) nx = b.maxX + r;
    else if (m === top) nz = b.minZ - r;
    else nz = b.maxZ + r;
  }
  return { x: nx, z: nz };
}

export function blocked(x: number, z: number, r: number, boxes: AABB[]) {
  for (let i = 0; i < boxes.length; i++) {
    if (overlaps(x, z, r, boxes[i])) return true;
  }
  return false;
}
