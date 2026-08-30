// 4D-MC :: chunk meshing --------------------------------------------------
//
// One mesh is built per (chunk, w-layer). The renderer draws only the two to
// five layers whose slice bands actually cross that chunk, and the fragment
// shader trims each layer to its band — that trim is what carves cubes into
// wedges at a seam.
//
// Alongside the ordinary block faces we emit *cut caps*: vertical quads that
// the vertex shader positions exactly on the band boundary, so a block whose
// neighbour in the fourth dimension is empty shows a solid cross-section
// instead of a hole.

import { CHUNK_X, CHUNK_Z, WORLD_H, W_LAYERS, FACE } from '../core/constants.js';
import { idx } from '../world/chunk.js';
import { BLOCKS, RENDER, blocksFace } from '../world/blocks.js';
import { BIOMES } from '../world/biomes.js';
import { texLayer } from '../world/atlas.js';
import { mod } from '../core/math.js';

const PX = CHUNK_X + 2, PZ = CHUNK_Z + 2;
const pidx = (x, y, z) => (y * PZ + (z + 1)) * PX + (x + 1);

// Face corner offsets, wound counter-clockwise seen from outside.
const FACE_VERTS = [
  [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]],   // +X
  [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]],   // -X
  [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]],   // +Y
  [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]],   // -Y
  [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]],   // +Z
  [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]],   // -Z
];
const FACE_DIR = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

// For ambient occlusion: the two edge neighbours and the corner neighbour of
// each face vertex, expressed as offsets from the block being lit.
const AO_NEIGHBORS = buildAO();
function buildAO() {
  const out = [];
  for (let f = 0; f < 6; f++) {
    const n = FACE_DIR[f];
    const verts = FACE_VERTS[f];
    const per = [];
    for (const v of verts) {
      // tangent offsets: for each axis not equal to the face axis, -1 or +1
      const off = [0, 0, 0];
      for (let a = 0; a < 3; a++) {
        if (n[a] !== 0) { off[a] = n[a]; continue; }
        off[a] = v[a] === 1 ? 1 : -1;
      }
      const axes = [0, 1, 2].filter((a) => n[a] === 0);
      const s1 = [n[0], n[1], n[2]]; s1[axes[0]] = off[axes[0]];
      const s2 = [n[0], n[1], n[2]]; s2[axes[1]] = off[axes[1]];
      per.push({ s1, s2, c: off.map((v2, a) => (n[a] !== 0 ? n[a] : v2)) });
    }
    out.push(per);
  }
  return out;
}

const UV_FOR_CORNER = [0, 1, 2, 3];

function pack(tex, face, sky, blk, ao, uv, tint, anim) {
  return (tex & 0x1ff) | ((face & 7) << 9) | ((sky & 15) << 12) | ((blk & 15) << 16) |
    ((ao & 3) << 20) | ((uv & 3) << 22) | ((tint & 7) << 24) | ((anim & 1) << 27);
}

const TINT = { none: 0, grass: 1, leaf: 2, water: 3 };

class Builder {
  constructor() {
    this.pos = [];
    this.data = [];
    this.count = 0;
  }
  quad(vx, packed) {
    for (let i = 0; i < 4; i++) {
      this.pos.push(vx[i][0], vx[i][1], vx[i][2]);
      this.data.push(packed[i]);
    }
    this.count += 4;
  }
  get empty() { return this.count === 0; }
  finish() {
    const n = this.count;
    const buf = new ArrayBuffer(n * 16);
    const f = new Float32Array(buf);
    const u = new Uint32Array(buf);
    for (let i = 0; i < n; i++) {
      f[i * 4] = this.pos[i * 3];
      f[i * 4 + 1] = this.pos[i * 3 + 1];
      f[i * 4 + 2] = this.pos[i * 3 + 2];
      u[i * 4 + 3] = this.data[i];
    }
    return { buffer: buf, verts: n, quads: n / 4 };
  }
}

class CapBuilder {
  constructor() { this.arr = []; this.count = 0; }
  cap(x, y, z, side, tex, sky, blk, tint) {
    // one quad; the vertex shader resolves the exact boundary segment
    for (let c = 0; c < 4; c++) {
      this.arr.push(x, y, z,
        (c & 3) | (side << 2) | ((tex & 0x1ff) << 3) | ((sky & 15) << 12) |
        ((blk & 15) << 16) | ((tint & 7) << 20));
    }
    this.count += 4;
  }
  get empty() { return this.count === 0; }
  finish() {
    const n = this.count;
    const buf = new ArrayBuffer(n * 16);
    const f = new Float32Array(buf);
    const u = new Uint32Array(buf);
    for (let i = 0; i < n; i++) {
      f[i * 4] = this.arr[i * 4];
      f[i * 4 + 1] = this.arr[i * 4 + 1];
      f[i * 4 + 2] = this.arr[i * 4 + 2];
      u[i * 4 + 3] = this.arr[i * 4 + 3];
    }
    return { buffer: buf, verts: n, quads: n / 4 };
  }
}

// Scratch buffers reused across meshing calls.
const padBlocks = new Uint8Array(PX * WORLD_H * PZ);
const padLight = new Uint8Array(PX * WORLD_H * PZ);
const wPrev = new Uint8Array(CHUNK_X * WORLD_H * CHUNK_Z);
const wNext = new Uint8Array(CHUNK_X * WORLD_H * CHUNK_Z);
const cidx = (x, y, z) => (y * CHUNK_Z + z) * CHUNK_X + x;

const TRANSLUCENT = new Set();

export function initMesher() {
  TRANSLUCENT.clear();
  for (const b of BLOCKS) {
    if (!b) continue;
    if (b.liquid || b.name === 'glass' || b.name === 'hyperglass' || b.name === 'ice')
      TRANSLUCENT.add(b.id);
  }
}

/** Build the geometry for one w-layer of one chunk. */
export function meshChunkLayer(world, chunk, w) {
  const bx0 = chunk.cx * CHUNK_X, bz0 = chunk.cz * CHUNK_Z;

  // gather a padded copy of blocks + light so the inner loops never branch on
  // chunk boundaries
  padBlocks.fill(0);
  padLight.fill(0);
  for (let z = -1; z <= CHUNK_Z; z++)
    for (let x = -1; x <= CHUNK_X; x++) {
      const inside = x >= 0 && z >= 0 && x < CHUNK_X && z < CHUNK_Z;
      if (inside) {
        world.ensureLit(chunk, w);
        for (let y = 0; y < WORLD_H; y++) {
          padBlocks[pidx(x, y, z)] = chunk.blocks[idx(x, y, z, w)];
          padLight[pidx(x, y, z)] = chunk.light[idx(x, y, z, w)];
        }
      } else {
        const wx = bx0 + x, wz = bz0 + z;
        const nc = world.getChunk(wx >> 4, wz >> 4);
        if (!nc || !nc.generated) {
          for (let y = 0; y < WORLD_H; y++) { padBlocks[pidx(x, y, z)] = 0; padLight[pidx(x, y, z)] = 0xf0; }
        } else {
          world.ensureLit(nc, w);
          const lx = wx - ((wx >> 4) << 4), lz = wz - ((wz >> 4) << 4);
          for (let y = 0; y < WORLD_H; y++) {
            padBlocks[pidx(x, y, z)] = nc.blocks[idx(lx, y, lz, w)];
            padLight[pidx(x, y, z)] = nc.light[idx(lx, y, lz, w)];
          }
        }
      }
    }

  const wp = mod(w - 1, W_LAYERS), wn = mod(w + 1, W_LAYERS);
  for (let z = 0; z < CHUNK_Z; z++)
    for (let x = 0; x < CHUNK_X; x++)
      for (let y = 0; y < WORLD_H; y++) {
        wPrev[cidx(x, y, z)] = chunk.blocks[idx(x, y, z, wp)];
        wNext[cidx(x, y, z)] = chunk.blocks[idx(x, y, z, wn)];
      }

  const solid = new Builder();
  const trans = new Builder();
  const caps = new CapBuilder();

  const gb = (x, y, z) => (y < 0 || y >= WORLD_H) ? 0 : padBlocks[pidx(x, y, z)];
  const gl = (x, y, z) => (y < 0) ? 0 : (y >= WORLD_H ? 0xf0 : padLight[pidx(x, y, z)]);

  for (let z = 0; z < CHUNK_Z; z++) {
    for (let x = 0; x < CHUNK_X; x++) {
      const biome = BIOMES[chunk.biomeAt(x, z, w)] || BIOMES[2];
      for (let y = 0; y < WORLD_H; y++) {
        const id = padBlocks[pidx(x, y, z)];
        if (!id) continue;
        const b = BLOCKS[id];
        if (!b) continue;
        const B = TRANSLUCENT.has(id) ? trans : solid;
        const tintId = b.tint === 'grass' ? TINT.grass : b.tint === 'leaf' ? TINT.leaf : TINT.none;

        if (b.render === RENDER.CROSS) {
          emitCross(B, x, y, z, b, gl(x, y, z), tintId);
        } else if (b.render === RENDER.TORCH) {
          emitTorch(B, x, y, z, b);
        } else if (b.render === RENDER.LADDER) {
          emitLadder(B, x, y, z, b, gb, gl);
        } else {
          const liquid = b.render === RENDER.LIQUID;
          for (let f = 0; f < 6; f++) {
            const d = FACE_DIR[f];
            const nx = x + d[0], ny = y + d[1], nz = z + d[2];
            const nid = gb(nx, ny, nz);
            if (blocksFace(id, nid)) continue;
            if (liquid && f !== FACE.PY && nid === id) continue;
            emitFace(B, x, y, z, f, b, gb, gl, tintId, liquid);
          }
        }

        // --- cut caps: exposed cross-section along the fourth axis
        if (b.render === RENDER.CUBE || b.render === RENDER.LIQUID) {
          const i = cidx(x, y, z);
          const prev = wPrev[i], next = wNext[i];
          const tex = texLayer(b.faces[0]);
          // A cut face has no natural neighbour to borrow light from, so take
          // the brightest cell touching it — otherwise every cross-section
          // renders pitch black.
          let sky = 0, blk = 0;
          for (let k = 0; k < 6; k++) {
            const dd = FACE_DIR[k];
            const l = gl(x + dd[0], y + dd[1], z + dd[2]);
            const s2 = (l >> 4) & 15, b2 = l & 15;
            if (s2 > sky) sky = s2;
            if (b2 > blk) blk = b2;
          }
          const selfLit = gl(x, y, z);
          sky = Math.max(sky, (selfLit >> 4) & 15);
          blk = Math.max(blk, selfLit & 15);
          if (!blocksFace(id, prev)) caps.cap(x, y, z, 0, tex, sky, blk, tintId);
          if (!blocksFace(id, next)) caps.cap(x, y, z, 1, tex, sky, blk, tintId);
        }
      }
    }
  }

  return {
    solid: solid.empty ? null : solid.finish(),
    trans: trans.empty ? null : trans.finish(),
    caps: caps.empty ? null : caps.finish(),
  };
}

function faceLight(gl, gb, x, y, z, f) {
  const d = FACE_DIR[f];
  return gl(x + d[0], y + d[1], z + d[2]);
}

function emitFace(B, x, y, z, f, b, gb, gl, tintId, liquid) {
  const verts = FACE_VERTS[f];
  const lit = faceLight(gl, gb, x, y, z, f);
  const sky = (lit >> 4) & 15, blk = lit & 15;
  const tex = texLayer(b.faces[f]);
  const ao = AO_NEIGHBORS[f];
  const vx = [], pk = [];
  const top = liquid && f === FACE.PY;
  const drop = liquid ? 0.12 : 0;
  for (let i = 0; i < 4; i++) {
    const v = verts[i];
    let vy = y + v[1];
    if (liquid && v[1] === 1) vy -= drop;
    vx.push([x + v[0], vy, z + v[2]]);
    const a = ao[i];
    const s1 = solidAt(gb, x + a.s1[0], y + a.s1[1], z + a.s1[2]);
    const s2 = solidAt(gb, x + a.s2[0], y + a.s2[1], z + a.s2[2]);
    const cc = solidAt(gb, x + a.c[0], y + a.c[1], z + a.c[2]);
    const occ = (s1 && s2) ? 0 : 3 - (s1 + s2 + cc);
    pk.push(pack(tex, f, sky, blk, occ, UV_FOR_CORNER[i], tintId, b.animated));
  }
  B.quad(vx, pk);
}

function solidAt(gb, x, y, z) {
  const id = gb(x, y, z);
  if (!id) return 0;
  const b = BLOCKS[id];
  return b && b.opaque ? 1 : 0;
}

function emitCross(B, x, y, z, b, lit, tintId) {
  const sky = (lit >> 4) & 15, blk = lit & 15;
  const tex = texLayer(b.faces[0]);
  const k = 0.1464;      // (1 - 1/sqrt(2)) / 2 — inset so the X fits the cube
  const planes = [
    [[k, 0, k], [1 - k, 0, 1 - k]],
    [[1 - k, 0, k], [k, 0, 1 - k]],
  ];
  for (const [a, c] of planes) {
    for (let side = 0; side < 2; side++) {
      const p0 = side ? c : a, p1 = side ? a : c;
      const vx = [
        [x + p0[0], y, z + p0[2]],
        [x + p1[0], y, z + p1[2]],
        [x + p1[0], y + 1, z + p1[2]],
        [x + p0[0], y + 1, z + p0[2]],
      ];
      const pk = [0, 1, 2, 3].map((i) => pack(tex, FACE.PY, sky, blk, 3, i, tintId, 0));
      B.quad(vx, pk);
    }
  }
}

function emitTorch(B, x, y, z, b) {
  const tex = texLayer('torch');
  const s = 0.0625, h = 0.625;
  const cx = x + 0.5, cz = z + 0.5;
  const sides = [
    [[cx + s, y, cz + s], [cx + s, y, cz - s]],
    [[cx - s, y, cz - s], [cx - s, y, cz + s]],
    [[cx - s, y, cz + s], [cx + s, y, cz + s]],
    [[cx + s, y, cz - s], [cx - s, y, cz - s]],
  ];
  for (const [p0, p1] of sides) {
    const vx = [
      [p0[0], y, p0[2]], [p1[0], y, p1[2]],
      [p1[0], y + h, p1[2]], [p0[0], y + h, p0[2]],
    ];
    const pk = [0, 1, 2, 3].map((i) => pack(tex, FACE.PZ, 12, 15, 3, i, 0, 0));
    B.quad(vx, pk);
  }
  // glowing top face
  const vx = [
    [cx - s, y + h, cz + s], [cx + s, y + h, cz + s],
    [cx + s, y + h, cz - s], [cx - s, y + h, cz - s],
  ];
  B.quad(vx, [0, 1, 2, 3].map((i) => pack(tex, FACE.PY, 12, 15, 3, i, 0, 0)));
}

function emitLadder(B, x, y, z, b, gb, gl) {
  const tex = texLayer('ladder');
  // attach to whichever side has a solid block behind it
  let f = FACE.NZ;
  for (const cand of [FACE.NZ, FACE.PZ, FACE.NX, FACE.PX]) {
    const d = FACE_DIR[cand];
    const id = gb(x - d[0], y - d[1], z - d[2]);
    if (id && BLOCKS[id] && BLOCKS[id].opaque) { f = cand; break; }
  }
  const e = 0.06;
  const lit = gl(x, y, z);
  const sky = (lit >> 4) & 15, blk = lit & 15;
  const verts = FACE_VERTS[f].map((v) => {
    const d = FACE_DIR[f];
    return [x + v[0] - d[0] * e * (v[0] === 1 ? 1 : -1) * 0,
      y + v[1], z + v[2]];
  });
  const d = FACE_DIR[f];
  const off = [d[0] * -e, 0, d[2] * -e];
  const shift = FACE_VERTS[f].map((v) => [x + v[0] + off[0] + (d[0] > 0 ? 0 : 0), y + v[1], z + v[2] + off[2]]);
  const pk = [0, 1, 2, 3].map((i) => pack(tex, f, sky, blk, 3, i, 0, 0));
  B.quad(shift, pk);
  const back = [shift[3], shift[2], shift[1], shift[0]];
  B.quad(back, [3, 2, 1, 0].map((i) => pack(tex, f, sky, blk, 3, i, 0, 0)));
}
