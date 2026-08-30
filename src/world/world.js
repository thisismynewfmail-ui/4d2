// 4D-MC :: world -----------------------------------------------------------
// Chunk lifetime, block access across all four axes, lighting, and the bridge
// between the raw 4D field and the tilted slice the player actually inhabits.

import { CHUNK_X, CHUNK_Z, WORLD_H, W_LAYERS, SEA_LEVEL } from '../core/constants.js';
import { Chunk, idx } from './chunk.js';
import { WorldGen } from './worldgen.js';
import { Slice } from './slice.js';
import { BLOCKS, blockId, isOpaque, lightOf, block } from './blocks.js';
import { BIOMES } from './biomes.js';
import { clamp, mod } from '../core/math.js';

const AIR = 0;
// Ungenerated chunks report bedrock so the player can never fall out of the
// world while terrain is still streaming in.
let UNLOADED = 8;

export class World {
  constructor(seed, options = {}) {
    this.seed = seed >>> 0;
    this.options = options;
    this.gen = new WorldGen(seed, options);
    this.slice = new Slice(options.shear || 'normal');
    this.chunks = new Map();
    this.pending = new Map();       // chunkKey -> deferred writes from neighbours
    this.genQueue = [];
    this.edits = new Map();         // chunkKey -> Map(packedPos -> blockId) for saving
    this.time = 0;                  // 0..1 through the day
    this.dayLength = 900;           // seconds
    this.tickAccum = 0;
    this.lightBudget = 0;
    this.stats = { generated: 0, meshed: 0 };
    this.onBlockChange = null;
    this.structureSpawns = [];
    UNLOADED = blockId('bedrock');
  }

  key(cx, cz) { return `${cx},${cz}`; }

  getChunk(cx, cz) { return this.chunks.get(this.key(cx, cz)) || null; }

  ensureChunk(cx, cz) {
    const k = this.key(cx, cz);
    let c = this.chunks.get(k);
    if (!c) {
      c = new Chunk(cx, cz);
      this.chunks.set(k, c);
      this.genQueue.push(c);
    }
    return c;
  }

  /** Generate one queued chunk. Returns true when work was done. */
  generateOne() {
    while (this.genQueue.length) {
      const c = this.genQueue.shift();
      if (c.generated) continue;
      this.gen.generate(c, this.pending);
      this.applyPending(c);
      this.applyEdits(c);
      if (c.structureSpawns) {
        for (const s of c.structureSpawns) this.structureSpawns.push(s);
        c.structureSpawns = null;
      }
      c.markAllDirty();
      this.stats.generated++;
      // neighbours must remesh so their border faces stay correct
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = this.getChunk(c.cx + dx, c.cz + dz);
        if (n && n.generated) n.markAllDirty();
      }
      return true;
    }
    return false;
  }

  applyPending(c) {
    const list = this.pending.get(c.key);
    if (!list) return;
    for (const e of list) {
      if (e[0] === 'te') {
        const [, x, y, z, w, data] = e;
        c.setTE(x - c.cx * CHUNK_X, y, z - c.cz * CHUNK_Z, w, data);
      } else {
        const [x, y, z, w, id, force] = e;
        const lx = x - c.cx * CHUNK_X, lz = z - c.cz * CHUNK_Z;
        if (lx < 0 || lz < 0 || lx >= CHUNK_X || lz >= CHUNK_Z || y < 0 || y >= WORLD_H) continue;
        const i = idx(lx, y, lz, w);
        if (force || c.blocks[i] === AIR) c.blocks[i] = id;
      }
    }
    this.pending.delete(c.key);
  }

  applyEdits(c) {
    const m = this.edits.get(c.key);
    if (!m) return;
    for (const [packed, id] of m) {
      const w = packed & 7;
      const y = (packed >> 3) & 127;
      const lz = (packed >> 10) & 15;
      const lx = (packed >> 14) & 15;
      c.blocks[idx(lx, y, lz, w)] = id;
    }
  }

  // --- block access ------------------------------------------------------
  getBlock(x, y, z, w) {
    if (y < 0 || y >= WORLD_H) return AIR;
    const cx = x >> 4, cz = z >> 4;
    const c = this.chunks.get(this.key(cx, cz));
    if (!c || !c.generated) return AIR;
    return c.blocks[idx(x - (cx << 4), y, z - (cz << 4), mod(w, W_LAYERS))];
  }

  /** Like getBlock but reports stone for ungenerated chunks so the player never
   *  falls out of the world while terrain streams in. */
  getBlockSafe(x, y, z, w) {
    if (y < 0) return blockId('bedrock');
    if (y >= WORLD_H) return AIR;
    const cx = x >> 4, cz = z >> 4;
    const c = this.chunks.get(this.key(cx, cz));
    if (!c || !c.generated) return UNLOADED;
    return c.blocks[idx(x - (cx << 4), y, z - (cz << 4), mod(w, W_LAYERS))];
  }

  setBlock(x, y, z, w, id, opts = {}) {
    if (y < 0 || y >= WORLD_H) return false;
    const cx = x >> 4, cz = z >> 4;
    const c = this.chunks.get(this.key(cx, cz));
    if (!c || !c.generated) return false;
    const lx = x - (cx << 4), lz = z - (cz << 4);
    const ww = mod(w, W_LAYERS);
    const i = idx(lx, y, lz, ww);
    if (c.blocks[i] === id) return false;
    c.blocks[i] = id;

    if (!opts.noRecord) {
      let m = this.edits.get(c.key);
      if (!m) { m = new Map(); this.edits.set(c.key, m); }
      m.set((lx << 14) | (lz << 10) | (y << 3) | ww, id);
    }

    // surface height cache
    if (y >= c.heightAt(lx, lz, ww) && id !== AIR) c.setHeight(lx, lz, ww, y);
    else if (id === AIR && y === c.heightAt(lx, lz, ww)) {
      let h = 0;
      for (let yy = y; yy >= 0; yy--) if (c.blocks[idx(lx, yy, lz, ww)]) { h = yy; break; }
      c.setHeight(lx, lz, ww, h);
    }

    c.markDirty(ww);
    c.lit = false;
    // dirty the neighbouring chunk when we touched a border column, and the
    // adjacent w-layers because their cut caps depend on us
    if (lx === 0) this.dirtyNeighbour(cx - 1, cz, ww);
    if (lx === CHUNK_X - 1) this.dirtyNeighbour(cx + 1, cz, ww);
    if (lz === 0) this.dirtyNeighbour(cx, cz - 1, ww);
    if (lz === CHUNK_Z - 1) this.dirtyNeighbour(cx, cz + 1, ww);
    c.markDirty(mod(ww + 1, W_LAYERS));
    c.markDirty(mod(ww - 1, W_LAYERS));
    this.onBlockChange?.(x, y, z, ww, id);
    return true;
  }

  dirtyNeighbour(cx, cz, w) {
    const n = this.getChunk(cx, cz);
    if (n && n.generated) { n.markDirty(w); n.lit = false; }
  }

  // --- the visible slice --------------------------------------------------
  /** Layer visible at a horizontal position, honouring the shear. */
  layerAt(x, z) { return this.slice.layerAt(x, z); }

  /** Block the player would collide with at a continuous position. */
  blockAt(x, y, z) {
    return this.getBlockSafe(Math.floor(x), Math.floor(y), Math.floor(z), this.slice.layerAt(x, z));
  }

  blockAtBand(x, y, z, band) {
    return this.getBlockSafe(Math.floor(x), Math.floor(y), Math.floor(z), Slice.wrap(band));
  }

  biomeAt(x, z, w) {
    const cx = x >> 4, cz = z >> 4;
    const c = this.chunks.get(this.key(cx, cz));
    if (!c || !c.generated) return 2;
    return c.biomeAt(x - (cx << 4), z - (cz << 4), mod(w, W_LAYERS));
  }

  biomeAtSlice(x, z) { return this.biomeAt(Math.floor(x), Math.floor(z), this.layerAt(x, z)); }

  heightAt(x, z, w) {
    const cx = x >> 4, cz = z >> 4;
    const c = this.chunks.get(this.key(cx, cz));
    if (!c || !c.generated) return SEA_LEVEL;
    return c.heightAt(x - (cx << 4), z - (cz << 4), mod(w, W_LAYERS));
  }

  // --- tile entities ------------------------------------------------------
  getTE(x, y, z, w) {
    const c = this.getChunk(x >> 4, z >> 4);
    return c ? c.getTE(x - ((x >> 4) << 4), y, z - ((z >> 4) << 4), mod(w, W_LAYERS)) : null;
  }

  setTE(x, y, z, w, data) {
    const c = this.getChunk(x >> 4, z >> 4);
    if (c) c.setTE(x - ((x >> 4) << 4), y, z - ((z >> 4) << 4), mod(w, W_LAYERS), data);
  }

  removeTE(x, y, z, w) {
    const c = this.getChunk(x >> 4, z >> 4);
    if (c) c.removeTE(x - ((x >> 4) << 4), y, z - ((z >> 4) << 4), mod(w, W_LAYERS));
  }

  // --- lighting -----------------------------------------------------------
  /**
   * Flood-fill sky and block light for one w-layer of one chunk. Borders read
   * their neighbours' current values so light bleeds between chunks after a
   * second pass.
   */
  lightLayer(c, w) {
    const L = c.light;
    const base = w * CHUNK_X * CHUNK_Z * WORLD_H;
    const stride = CHUNK_X * CHUNK_Z;
    for (let i = 0; i < stride * WORLD_H; i++) L[base + i] = 0;

    const qx = [], qy = [], qz = [], ql = [];
    // sky: straight down until something opaque stops it
    for (let lz = 0; lz < CHUNK_Z; lz++)
      for (let lx = 0; lx < CHUNK_X; lx++) {
        let level = 15;
        for (let y = WORLD_H - 1; y >= 0; y--) {
          const id = c.blocks[idx(lx, y, lz, w)];
          if (id !== AIR) {
            const b = BLOCKS[id];
            if (b && b.opaque) break;
            if (b && b.liquid) level = Math.max(0, level - 2);
            else if (b) level = Math.max(0, level - 1);
          }
          L[base + (y * CHUNK_Z + lz) * CHUNK_X + lx] = level << 4;
          if (level > 1) { qx.push(lx); qy.push(y); qz.push(lz); ql.push(level); }
        }
      }

    // block light sources
    for (let y = 0; y < WORLD_H; y++)
      for (let lz = 0; lz < CHUNK_Z; lz++)
        for (let lx = 0; lx < CHUNK_X; lx++) {
          const id = c.blocks[idx(lx, y, lz, w)];
          if (!id) continue;
          const e = lightOf(id);
          if (e > 0) {
            const i = base + (y * CHUNK_Z + lz) * CHUNK_X + lx;
            L[i] = (L[i] & 0xf0) | e;
          }
        }

    // sky BFS (horizontal bleed into caves and overhangs)
    this.bfs(c, w, L, base, qx, qy, qz, ql, true);

    // block BFS
    const bx = [], by = [], bz = [], bl = [];
    for (let y = 0; y < WORLD_H; y++)
      for (let lz = 0; lz < CHUNK_Z; lz++)
        for (let lx = 0; lx < CHUNK_X; lx++) {
          const i = base + (y * CHUNK_Z + lz) * CHUNK_X + lx;
          const v = L[i] & 0x0f;
          if (v > 1) { bx.push(lx); by.push(y); bz.push(lz); bl.push(v); }
        }
    this.bfs(c, w, L, base, bx, by, bz, bl, false);
  }

  bfs(c, w, L, base, qx, qy, qz, ql, sky) {
    const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    let head = 0;
    while (head < qx.length && head < 900000) {
      const x = qx[head], y = qy[head], z = qz[head], l = ql[head];
      head++;
      if (l <= 1) continue;
      for (const [dx, dy, dz] of DIRS) {
        const nx = x + dx, ny = y + dy, nz = z + dz;
        if (ny < 0 || ny >= WORLD_H) continue;
        if (nx < 0 || nz < 0 || nx >= CHUNK_X || nz >= CHUNK_Z) continue;
        const id = c.blocks[idx(nx, ny, nz, w)];
        if (id !== AIR && BLOCKS[id] && BLOCKS[id].opaque) continue;
        const cost = (id !== AIR && BLOCKS[id] && BLOCKS[id].liquid) ? 2 : 1;
        const nl = l - cost;
        if (nl <= 0) continue;
        const i = base + (ny * CHUNK_Z + nz) * CHUNK_X + nx;
        const cur = sky ? (L[i] >> 4) : (L[i] & 0x0f);
        if (cur >= nl) continue;
        L[i] = sky ? ((nl << 4) | (L[i] & 0x0f)) : ((L[i] & 0xf0) | nl);
        qx.push(nx); qy.push(ny); qz.push(nz); ql.push(nl);
      }
    }
  }

  ensureLit(c, w) {
    if (!c.litLayers) c.litLayers = new Set();
    if (c.lit === false) { c.litLayers.clear(); c.lit = true; }
    if (c.litLayers.has(w)) return;
    this.lightLayer(c, w);
    c.litLayers.add(w);
  }

  getLightPacked(x, y, z, w) {
    if (y < 0) return 0;
    if (y >= WORLD_H) return 0xf0;
    const cx = x >> 4, cz = z >> 4;
    const c = this.chunks.get(this.key(cx, cz));
    if (!c || !c.generated) return 0xf0;
    this.ensureLit(c, w);
    return c.light[idx(x - (cx << 4), y, z - (cz << 4), w)];
  }

  // --- simulation ---------------------------------------------------------
  update(dt, px, pz, renderDistance, budgetMs = 6) {
    this.time = (this.time + dt / this.dayLength) % 1;
    const t0 = performance.now();
    const pcx = Math.floor(px / CHUNK_X), pcz = Math.floor(pz / CHUNK_Z);
    const R = renderDistance;

    // request chunks nearest-first
    if (this.genQueue.length === 0 || this._lastCx !== pcx || this._lastCz !== pcz) {
      this._lastCx = pcx; this._lastCz = pcz;
      const want = [];
      for (let dz = -R; dz <= R; dz++)
        for (let dx = -R; dx <= R; dx++) {
          const d = dx * dx + dz * dz;
          if (d > (R + 0.5) * (R + 0.5)) continue;
          want.push([d, pcx + dx, pcz + dz]);
        }
      want.sort((a, b) => a[0] - b[0]);
      for (const [, cx, cz] of want) this.ensureChunk(cx, cz);
      // evict distant chunks
      const keep = R + 2;
      for (const [k, c] of this.chunks) {
        if (Math.abs(c.cx - pcx) > keep || Math.abs(c.cz - pcz) > keep) {
          c.meshes.forEach((m) => m.dispose?.());
          this.chunks.delete(k);
        }
      }
    }

    while (performance.now() - t0 < budgetMs) {
      if (!this.generateOne()) break;
    }

    this.tickAccum += dt;
    while (this.tickAccum >= 0.05) {
      this.tickAccum -= 0.05;
      this.randomTick(pcx, pcz);
    }
  }

  /** Occasional block updates: crops grow, grass spreads, sand falls. */
  randomTick(pcx, pcz) {
    const GRASS = blockId('grass'), DIRT = blockId('dirt'), TALL = blockId('tall_grass');
    const SAND = blockId('sand'), GRAVEL = blockId('gravel');
    const FARM = blockId('farmland'), FARMW = blockId('farmland_wet'), WATER = blockId('water');
    for (let n = 0; n < 8; n++) {
      const cx = pcx + ((Math.random() * 5) | 0) - 2;
      const cz = pcz + ((Math.random() * 5) | 0) - 2;
      const c = this.getChunk(cx, cz);
      if (!c || !c.generated) continue;
      const lx = (Math.random() * CHUNK_X) | 0, lz = (Math.random() * CHUNK_Z) | 0;
      const w = (Math.random() * W_LAYERS) | 0;
      const h = c.heightAt(lx, lz, w);
      const y = clamp(h + ((Math.random() * 5) | 0) - 3, 1, WORLD_H - 2);
      const x = cx * CHUNK_X + lx, z = cz * CHUNK_Z + lz;
      const id = c.blocks[idx(lx, y, lz, w)];

      if (id === DIRT && this.getBlock(x, y + 1, z, w) === AIR && y >= h) {
        // spread grass from a lit neighbour
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (this.getBlock(x + dx, y, z + dz, w) === GRASS) {
            this.setBlock(x, y, z, w, GRASS);
            break;
          }
        }
      } else if ((id === SAND || id === GRAVEL) && this.getBlock(x, y - 1, z, w) === AIR) {
        this.setBlock(x, y, z, w, AIR);
        let fy = y - 1;
        while (fy > 1 && this.getBlock(x, fy - 1, z, w) === AIR) fy--;
        this.setBlock(x, fy, z, w, id);
      } else if (id === FARM || id === FARMW) {
        let wet = false;
        for (let dz = -2; dz <= 2 && !wet; dz++)
          for (let dx = -2; dx <= 2; dx++)
            if (this.getBlock(x + dx, y, z + dz, w) === WATER) { wet = true; break; }
        this.setBlock(x, y, z, w, wet ? FARMW : FARM);
      } else {
        const above = this.getBlock(x, y + 1, z, w);
        const b = BLOCKS[above];
        if (b && b.name && b.name.startsWith('wheat_')) {
          const stage = Number(b.name.slice(6));
          if (stage < 3 && (id === FARMW || Math.random() < 0.35))
            this.setBlock(x, y + 1, z, w, blockId(`wheat_${stage + 1}`));
        }
      }
      // grass slowly reclaims bare hyperflats and plains
      if (id === GRASS && this.getBlock(x, y + 1, z, w) === AIR && Math.random() < 0.02) {
        const bi = c.biomeAt(lx, lz, w);
        if (BIOMES[bi] && BIOMES[bi].grassChance > 0.2) this.setBlock(x, y + 1, z, w, TALL);
      }
    }
  }

  /** 0 = midnight, 0.5 = noon. */
  sunAngle() { return this.time * Math.PI * 2; }
  skyLightLevel() {
    const s = Math.sin((this.time - 0.25) * Math.PI * 2);
    return clamp(0.5 + s * 0.62, 0.06, 1.0);
  }

  serializeEdits() {
    const out = {};
    for (const [k, m] of this.edits) out[k] = Array.from(m.entries());
    return out;
  }

  loadEdits(data) {
    this.edits.clear();
    if (!data) return;
    for (const [k, arr] of Object.entries(data)) this.edits.set(k, new Map(arr));
  }
}
