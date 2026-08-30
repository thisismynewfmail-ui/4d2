// 4D-MC :: slice-aware collision & ray-casting ---------------------------
// Everything here samples the world through the tilted hyperplane, so the
// wedge you can see at a band seam is exactly the wedge you bump into.

import { WORLD_H } from '../core/constants.js';
import { BLOCKS } from '../world/blocks.js';
import { Slice } from '../world/slice.js';

/** Is any part of voxel (bx,by,bz) that overlaps the box [x0,x1]x[z0,z1] solid? */
export function cellSolid(world, bx, by, bz, x0, z0, x1, z1) {
  if (by < 0) return true;
  if (by >= WORLD_H) return false;
  const ox0 = Math.max(bx, x0), ox1 = Math.min(bx + 1, x1);
  const oz0 = Math.max(bz, z0), oz1 = Math.min(bz + 1, z1);
  if (ox1 <= ox0 || oz1 <= oz0) return false;
  const [b0, b1] = world.slice.bandRange(ox0, oz0, ox1, oz1);
  for (let band = b0; band <= b1; band++) {
    const id = world.getBlockSafe(bx, by, bz, Slice.wrap(band));
    if (id && BLOCKS[id] && BLOCKS[id].solid) return true;
  }
  return false;
}

/** Any block of a given predicate overlapping an AABB. */
export function scanAABB(world, box, fn) {
  const x0 = Math.floor(box.x0), x1 = Math.floor(box.x1 - 1e-7);
  const y0 = Math.floor(box.y0), y1 = Math.floor(box.y1 - 1e-7);
  const z0 = Math.floor(box.z0), z1 = Math.floor(box.z1 - 1e-7);
  for (let y = y0; y <= y1; y++)
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++) {
        const [b0, b1] = world.slice.bandRange(
          Math.max(x, box.x0), Math.max(z, box.z0),
          Math.min(x + 1, box.x1), Math.min(z + 1, box.z1));
        for (let band = b0; band <= b1; band++) {
          const id = world.getBlockSafe(x, y, z, Slice.wrap(band));
          if (id && fn(id, x, y, z, band)) return true;
        }
      }
  return false;
}

/**
 * Sweep an AABB by (dx,dy,dz), resolving one axis at a time.
 * Returns the collision flags so callers can zero their velocity.
 */
export function moveAABB(world, pos, size, d) {
  const hw = size.w / 2, h = size.h;
  const hit = { x: false, y: false, z: false };
  const STEP = 0.4;
  // subdivide long moves so nothing tunnels through thin geometry
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(d.x), Math.abs(d.y), Math.abs(d.z)) / STEP));
  const dx = d.x / n, dy = d.y / n, dz = d.z / n;

  for (let s = 0; s < n; s++) {
    // Y
    if (dy !== 0) {
      const ny = pos.y + dy;
      const y0 = Math.floor(dy > 0 ? ny + h : ny);
      const yc = dy > 0 ? y0 : y0;
      let blocked = false;
      const bx0 = Math.floor(pos.x - hw), bx1 = Math.floor(pos.x + hw - 1e-7);
      const bz0 = Math.floor(pos.z - hw), bz1 = Math.floor(pos.z + hw - 1e-7);
      for (let bz = bz0; bz <= bz1 && !blocked; bz++)
        for (let bx = bx0; bx <= bx1; bx++)
          if (cellSolid(world, bx, yc, bz, pos.x - hw, pos.z - hw, pos.x + hw, pos.z + hw)) {
            blocked = true; break;
          }
      if (blocked) {
        pos.y = dy > 0 ? yc - h - 1e-4 : yc + 1 + 1e-4;
        hit.y = true;
        d.y = 0;
      } else pos.y = ny;
    }
    // X
    if (dx !== 0) {
      const nx = pos.x + dx;
      const edge = dx > 0 ? nx + hw : nx - hw;
      const bx = Math.floor(dx > 0 ? edge - 1e-7 : edge);
      let blocked = false;
      const by0 = Math.floor(pos.y + 1e-4), by1 = Math.floor(pos.y + h - 1e-4);
      const bz0 = Math.floor(pos.z - hw), bz1 = Math.floor(pos.z + hw - 1e-7);
      for (let by = by0; by <= by1 && !blocked; by++)
        for (let bz = bz0; bz <= bz1; bz++)
          if (cellSolid(world, bx, by, bz,
            Math.min(nx - hw, pos.x - hw), pos.z - hw,
            Math.max(nx + hw, pos.x + hw), pos.z + hw)) { blocked = true; break; }
      if (blocked) { hit.x = true; d.x = 0; }
      else pos.x = nx;
    }
    // Z
    if (dz !== 0) {
      const nz = pos.z + dz;
      const edge = dz > 0 ? nz + hw : nz - hw;
      const bz = Math.floor(dz > 0 ? edge - 1e-7 : edge);
      let blocked = false;
      const by0 = Math.floor(pos.y + 1e-4), by1 = Math.floor(pos.y + h - 1e-4);
      const bx0 = Math.floor(pos.x - hw), bx1 = Math.floor(pos.x + hw - 1e-7);
      for (let by = by0; by <= by1 && !blocked; by++)
        for (let bx = bx0; bx <= bx1; bx++)
          if (cellSolid(world, bx, by, bz, pos.x - hw,
            Math.min(nz - hw, pos.z - hw), pos.x + hw,
            Math.max(nz + hw, pos.z + hw))) { blocked = true; break; }
      if (blocked) { hit.z = true; d.z = 0; }
      else pos.z = nz;
    }
  }
  return hit;
}

/**
 * March a ray through the hyperslice. The layer is re-evaluated at every
 * sample, so the ray follows the same wedges the renderer draws.
 */
export function raycast(world, ox, oy, oz, dx, dy, dz, maxDist, opts = {}) {
  const step = opts.step || 0.02;
  const n = Math.ceil(maxDist / step);
  let px = -1, py = -1, pz = -1, pband = 0;
  const liquids = opts.liquids || false;
  for (let i = 0; i <= n; i++) {
    const t = i * step;
    const x = ox + dx * t, y = oy + dy * t, z = oz + dz * t;
    const bx = Math.floor(x), by = Math.floor(y), bz = Math.floor(z);
    const band = world.slice.bandAt(x, z);
    if (bx !== px || by !== py || bz !== pz || band !== pband) {
      const id = world.getBlockSafe(bx, by, bz, Slice.wrap(band));
      const b = BLOCKS[id];
      const blocking = id && b && (liquids ? true : (b.solid || b.render === 1 || b.render === 3 || b.render === 4));
      if (blocking) {
        let nx = 0, ny = 0, nz = 0;
        if (px !== -1 || py !== -1 || pz !== -1) {
          nx = px - bx; ny = py - by; nz = pz - bz;
          if (Math.abs(nx) + Math.abs(ny) + Math.abs(nz) !== 1) {
            // the band changed rather than the cell — pick the dominant axis
            const ax = Math.abs(dx), ay = Math.abs(dy), az = Math.abs(dz);
            nx = ny = nz = 0;
            if (ax >= ay && ax >= az) nx = dx > 0 ? -1 : 1;
            else if (ay >= az) ny = dy > 0 ? -1 : 1;
            else nz = dz > 0 ? -1 : 1;
          }
        }
        return {
          hit: true, id, x: bx, y: by, z: bz, band, dist: t,
          nx, ny, nz,
          px: bx + nx, py: by + ny, pz: bz + nz,
          pband: world.slice.bandAt(bx + nx + 0.5, bz + nz + 0.5),
          hx: x, hy: y, hz: z,
        };
      }
      px = bx; py = by; pz = bz; pband = band;
    }
  }
  return { hit: false, dist: maxDist };
}
