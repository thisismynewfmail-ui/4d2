// 4D-MC :: world generation ----------------------------------------------
// Terrain, caves, ores, flora and structures are all functions of (x, y, z, w).
// The w axis is cyclic, so scrolling far enough through the fourth dimension
// brings you home. Layers change gently, which keeps the seams between slice
// bands readable instead of chaotic.

import { CHUNK_X, CHUNK_Z, WORLD_H, W_LAYERS, SEA_LEVEL } from '../core/constants.js';
import { idx } from './chunk.js';
import { blockId } from './blocks.js';
import { BIOME, BIOMES } from './biomes.js';
import { perlin4, fbm4, ridged4, worley4 } from '../core/noise.js';
import { hash01, ihash, clamp, lerp, smoothstep, rng } from '../core/math.js';

const B = {};
for (const n of [
  'stone', 'cobblestone', 'mossy_cobblestone', 'stone_bricks', 'cracked_stone_bricks', 'slate',
  'marble', 'bedrock', 'dirt', 'grass', 'snow_grass', 'sand', 'sandstone', 'gravel', 'clay',
  'snow', 'ice', 'chroma_clay', 'obsidian', 'oak_log', 'oak_leaves', 'pine_log', 'pine_leaves',
  'birch_log', 'birch_leaves', 'water', 'lava', 'coal_ore', 'iron_ore', 'gold_ore', 'diamond_ore',
  'azure_ore', 'pulse_ore', 'hyper_ore', 'tesseract_ore', 'hyperstone', 'rift_block', 'phase_anchor',
  'lumen', 'emberstone', 'dark_prism', 'tall_grass', 'flower_red', 'flower_yellow', 'flower_violet',
  'mushroom_red', 'mushroom_brown', 'cactus', 'chest', 'hyperchest', 'torch', 'crafting_table',
  'furnace', 'oak_planks', 'glass', 'hyperglass', 'bookshelf', 'ladder', 'lantern', 'wool_white',
  'wool_red', 'wool_blue', 'wool_purple', 'brick_block', 'sandstone', 'gravel',
]) B[n] = blockId(n);

// --- noise field configuration ------------------------------------------
// Frequencies along w are chosen so that W_LAYERS * f is a whole number: that
// is what makes the fourth dimension wrap seamlessly.
const WF = {
  drift: 0.25,     // 2 lattice cells across the 8 slices — a slow, cyclic breath
  climate: 0.25,
  cave: 0.5,
  weird: 0.25,
};
const WP = (f) => Math.round(W_LAYERS * f);

export class WorldGen {
  constructor(seed, options = {}) {
    this.seed = seed >>> 0;
    this.options = { structures: true, type: 'continents', ...options };
    this.s = {
      cont: this.seed ^ 0x1a2b3c,
      drift: this.seed ^ 0x0d21f7,
      ero: this.seed ^ 0x2b3c4d,
      ridge: this.seed ^ 0x3c4d5e,
      temp: this.seed ^ 0x4d5e6f,
      humid: this.seed ^ 0x5e6f70,
      weird: this.seed ^ 0x6f7081,
      cave1: this.seed ^ 0x708192,
      cave2: this.seed ^ 0x8192a3,
      cavern: this.seed ^ 0x92a3b4,
      ore: this.seed ^ 0xa3b4c5,
      deco: this.seed ^ 0xb4c5d6,
      struct: this.seed ^ 0xc5d6e7,
    };
    this.flat = this.options.type === 'flat';
    this.amplified = this.options.type === 'amplified';
    this.islands = this.options.type === 'islands';
  }

  // --- climate & shape ---------------------------------------------------
  // The expensive fields are low frequency, so they are evaluated on a coarse
  // 5x5 grid per chunk-layer and interpolated; only a cheap detail octave runs
  // at full resolution. That is the difference between 400 ms and 25 ms.
  /**
   * The large-scale shape of the land does not depend on w: continents,
   * erosion and ridges are the same in every slice. What changes is a bounded
   * *drift* field, so neighbouring slices differ by a couple of blocks rather
   * than a couple of biomes. That is what makes the world flow when you scroll
   * through the fourth dimension instead of shattering.
   */
  baseFields(cx, cz) {
    const cacheKey = `${cx},${cz}`;
    if (this._baseCache && this._baseCache.key === cacheKey) return this._baseCache;
    const G = 5, STEP = CHUNK_X / (G - 1);
    const cont = new Float32Array(G * G), ero = new Float32Array(G * G);
    const ridge = new Float32Array(G * G);
    for (let j = 0; j < G; j++) {
      const z = cz * CHUNK_Z + j * STEP;
      for (let i = 0; i < G; i++) {
        const x = cx * CHUNK_X + i * STEP;
        const k = j * G + i;
        cont[k] = fbm4(x * 0.0032, 7.5, z * 0.0032, 0, this.s.cont, 0, 4);
        ero[k] = fbm4(x * 0.0090, 19.5, z * 0.0090, 0, this.s.ero, 0, 3);
        ridge[k] = ridged4(x * 0.0125, 3.5, z * 0.0125, 0, this.s.ridge, 0, 4);
      }
    }
    this._baseCache = { key: cacheKey, G, STEP, cont, ero, ridge };
    return this._baseCache;
  }

  /** Per-slice fields: the drift that lifts and lowers the land, plus climate. */
  layerFields(cx, cz, w) {
    const G = 5, STEP = CHUNK_X / (G - 1);
    const drift = new Float32Array(G * G), driftFine = new Float32Array(G * G);
    const temp = new Float32Array(G * G), humid = new Float32Array(G * G);
    const weird = new Float32Array(G * G);
    const wn = w * WF.drift, wpD = WP(WF.drift);
    const wc = w * WF.climate, wpC = WP(WF.climate);
    const ww = w * WF.weird, wpW = WP(WF.weird);
    for (let j = 0; j < G; j++) {
      const z = cz * CHUNK_Z + j * STEP;
      for (let i = 0; i < G; i++) {
        const x = cx * CHUNK_X + i * STEP;
        const k = j * G + i;
        drift[k] = fbm4(x * 0.0048, 5.5, z * 0.0048, wn, this.s.drift, wpD, 2);
        driftFine[k] = fbm4(x * 0.0190, 61.5, z * 0.0190, wn, this.s.drift + 31, wpD, 2);
        temp[k] = fbm4(x * 0.0021, 41.5, z * 0.0021, wc, this.s.temp, wpC, 2);
        humid[k] = fbm4(x * 0.0025, 88.5, z * 0.0025, wc, this.s.humid, wpC, 2);
        weird[k] = fbm4(x * 0.0052, 13.5, z * 0.0052, ww, this.s.weird, wpW, 3);
      }
    }
    return { G, STEP, drift, driftFine, temp, humid, weird };
  }

  sampleCoarse(f, arr, lx, lz) {
    const G = f.G, S = f.STEP;
    const fx = lx / S, fz = lz / S;
    const i0 = Math.min(G - 2, fx | 0), j0 = Math.min(G - 2, fz | 0);
    const tx = fx - i0, tz = fz - j0;
    const a = arr[j0 * G + i0], b = arr[j0 * G + i0 + 1];
    const c = arr[(j0 + 1) * G + i0], d = arr[(j0 + 1) * G + i0 + 1];
    return lerp(lerp(a, b, tx), lerp(c, d, tx), tz);
  }

  heightFrom(cont, ero, ridge, detail, drift, driftFine) {
    if (this.flat) return SEA_LEVEL + 2 + Math.round((drift || 0) * 1.5);
    let base = SEA_LEVEL - 2 + cont * (this.islands ? 34 : 26);
    const mountain = smoothstep(clamp((cont - 0.20) / 0.42, 0, 1));
    const amp = this.amplified ? 1.75 : 1;
    base += mountain * ridge * 40 * amp;
    base += ero * 7 * amp;
    base += detail * 2.2;
    // bounded slice drift: the same hillside sits a metre or two higher in the
    // neighbouring slice, which is what carves the diagonal terraces
    base += (drift || 0) * 4.0 + (driftFine || 0) * 1.7;
    if (this.islands) base -= 6;
    return clamp(Math.round(base), 3, WORLD_H - 12);
  }

  /** Single-point height query (used by spawn search, not by bulk generation). */
  terrainHeight(x, z, w) {
    const wn = w * WF.drift, wpD = WP(WF.drift);
    const cont = fbm4(x * 0.0032, 7.5, z * 0.0032, 0, this.s.cont, 0, 4);
    const ero = fbm4(x * 0.0090, 19.5, z * 0.0090, 0, this.s.ero, 0, 3);
    const ridge = ridged4(x * 0.0125, 3.5, z * 0.0125, 0, this.s.ridge, 0, 4);
    const detail = perlin4(x * 0.05, 0.5, z * 0.05, wn, this.s.ero + 991, wpD);
    const drift = fbm4(x * 0.0048, 5.5, z * 0.0048, wn, this.s.drift, wpD, 2);
    const driftFine = fbm4(x * 0.0190, 61.5, z * 0.0190, wn, this.s.drift + 31, wpD, 2);
    return this.heightFrom(cont, ero, ridge, detail, drift, driftFine);
  }

  climate(x, z, w) {
    const wc = w * WF.climate, wpC = WP(WF.climate);
    const t = fbm4(x * 0.0021, 41.5, z * 0.0021, wc, this.s.temp, wpC, 2);
    const h = fbm4(x * 0.0025, 88.5, z * 0.0025, wc, this.s.humid, wpC, 2);
    const wd = fbm4(x * 0.0052, 13.5, z * 0.0052, w * WF.weird, this.s.weird, WP(WF.weird), 3);
    return [t, h, wd];
  }

  biomeFrom(t, h, wd, height) {
    if (height < SEA_LEVEL - 2) return BIOME.OCEAN;
    if (wd > 0.60) return BIOME.HYPERFLATS;
    if (wd < -0.66 && height > SEA_LEVEL + 4) return BIOME.RIFT_BARRENS;
    if (height <= SEA_LEVEL + 1) return BIOME.BEACH;
    if (height > 64 + (this.amplified ? 12 : 0)) return BIOME.MOUNTAINS;
    if (t < -0.34) return BIOME.TUNDRA;
    if (t < 0.02) return h > 0.05 ? BIOME.TAIGA : BIOME.PLAINS;
    if (t < 0.42) {
      if (h > 0.34 && height < SEA_LEVEL + 5) return BIOME.SWAMP;
      if (h > -0.08) return BIOME.FOREST;
      return BIOME.PLAINS;
    }
    if (h < -0.40) return wd > 0.18 ? BIOME.BADLANDS : BIOME.DESERT;
    if (h < 0.12) return BIOME.SAVANNA;
    return BIOME.FOREST;
  }

  pickBiome(x, z, w, height) {
    const [t, h, wd] = this.climate(x, z, w);
    return this.biomeFrom(t, h, wd, height);
  }

  // --- caves -------------------------------------------------------------
  /**
   * Coarse cave field for one w-layer of one chunk, sampled every STEP blocks
   * and trilinearly interpolated. Values > 0 are carved out.
   */
  caveField(cx, cz, w, maxY, STEP = 4) {
    const nx = CHUNK_X / STEP + 1;
    const ny = Math.min(Math.ceil(WORLD_H / STEP) + 1, Math.ceil((maxY + 6) / STEP) + 1);
    const nz = CHUNK_Z / STEP + 1;
    const f = new Float32Array(nx * ny * nz);
    const wn = w * WF.cave, wp = WP(WF.cave);
    for (let j = 0; j < ny; j++) {
      const y = j * STEP;
      if (y > WORLD_H) break;
      const depthBias = y < 12 ? (12 - y) * 0.06 : 0;
      for (let k = 0; k < nz; k++) {
        const z = cz * CHUNK_Z + k * STEP;
        for (let i = 0; i < nx; i++) {
          const x = cx * CHUNK_X + i * STEP;
          // twin ridged tunnels: carve where both fields cross zero together
          const a = perlin4(x * 0.0195, y * 0.0330, z * 0.0195, wn, this.s.cave1, wp);
          const b = perlin4(x * 0.0195, y * 0.0330, z * 0.0195, wn + 3.7, this.s.cave2, wp);
          const worm = 0.0135 - (a * a + b * b);
          // wide open caverns lower down
          const cav = fbm4(x * 0.0115, y * 0.0180, z * 0.0115, wn, this.s.cavern, wp, 3);
          const cavern = (y < 46 ? (-cav - 0.34) * 0.06 : -1);
          f[(j * nz + k) * nx + i] = Math.max(worm, cavern) - depthBias;
        }
      }
    }
    return { f, nx, ny, nz, STEP };
  }

  sampleCave(cf, lx, y, lz) {
    const { f, nx, ny, nz, STEP } = cf;
    const fx = lx / STEP, fy = y / STEP, fz = lz / STEP;
    const i0 = Math.min(nx - 2, Math.max(0, fx | 0));
    const j0 = Math.min(ny - 2, Math.max(0, fy | 0));
    const k0 = Math.min(nz - 2, Math.max(0, fz | 0));
    const tx = fx - i0, ty = clamp(fy - j0, 0, 1), tz = fz - k0;
    const g = (i, j, k) => f[(j * nz + k) * nx + i];
    const c00 = lerp(g(i0, j0, k0), g(i0 + 1, j0, k0), tx);
    const c10 = lerp(g(i0, j0 + 1, k0), g(i0 + 1, j0 + 1, k0), tx);
    const c01 = lerp(g(i0, j0, k0 + 1), g(i0 + 1, j0, k0 + 1), tx);
    const c11 = lerp(g(i0, j0 + 1, k0 + 1), g(i0 + 1, j0 + 1, k0 + 1), tx);
    return lerp(lerp(c00, c10, ty), lerp(c01, c11, ty), tz);
  }

  // --- ores --------------------------------------------------------------
  // Veins are stamped as small blobs from a handful of seed points per
  // chunk-layer. Far cheaper than sampling a cell field per voxel, and it
  // produces the clustered look of the originals.
  ORE_TABLE = [
    { block: 'coal_ore', tries: 22, size: 12, yMin: 6, yMax: 74 },
    { block: 'iron_ore', tries: 16, size: 8, yMin: 4, yMax: 58 },
    { block: 'azure_ore', tries: 5, size: 7, yMin: 3, yMax: 32 },
    { block: 'gold_ore', tries: 4, size: 6, yMin: 2, yMax: 34 },
    { block: 'pulse_ore', tries: 6, size: 8, yMin: 2, yMax: 26 },
    { block: 'diamond_ore', tries: 3, size: 5, yMin: 2, yMax: 15 },
    { block: 'hyper_ore', tries: 5, size: 6, yMin: 3, yMax: 40 },
    { block: 'tesseract_ore', tries: 2, size: 4, yMin: 2, yMax: 20 },
  ];

  stampOres(chunk, w) {
    const r = rng(ihash(chunk.cx, chunk.cz, w, this.s.ore, 0x0e75));
    const blocks = chunk.blocks;
    for (const spec of this.ORE_TABLE) {
      const id = B[spec.block];
      const tries = spec.tries;
      for (let t = 0; t < tries; t++) {
        const ox = r() * CHUNK_X, oz = r() * CHUNK_Z;
        const oy = spec.yMin + r() * (spec.yMax - spec.yMin);
        const count = 3 + ((r() * spec.size) | 0);
        let px = ox, py = oy, pz = oz;
        for (let k = 0; k < count; k++) {
          px += (r() - 0.5) * 2.2; py += (r() - 0.5) * 1.8; pz += (r() - 0.5) * 2.2;
          const bx = px | 0, by = py | 0, bz = pz | 0;
          if (bx < 0 || bz < 0 || bx >= CHUNK_X || bz >= CHUNK_Z || by < 1 || by >= WORLD_H) continue;
          const i = idx(bx, by, bz, w);
          const cur = blocks[i];
          if (cur === B.stone || cur === B.slate) blocks[i] = id;
        }
      }
    }
  }

  // --- main entry --------------------------------------------------------
  generate(chunk, pending) {
    const { cx, cz } = chunk;
    const blocks = chunk.blocks;
    const worldX0 = cx * CHUNK_X, worldZ0 = cz * CHUNK_Z;

    const BASE = this.baseFields(cx, cz);
    for (let w = 0; w < W_LAYERS; w++) {
      const F = this.layerFields(cx, cz, w);
      // first pass: heights and biomes, so the cave field knows how deep to go
      let maxH = 0;
      const hCol = new Int16Array(CHUNK_X * CHUNK_Z);
      const bCol = new Uint8Array(CHUNK_X * CHUNK_Z);
      for (let lz = 0; lz < CHUNK_Z; lz++)
        for (let lx = 0; lx < CHUNK_X; lx++) {
          const x = worldX0 + lx, z = worldZ0 + lz;
          const detail = perlin4(x * 0.05, 0.5, z * 0.05, w * WF.drift, this.s.ero + 991, WP(WF.drift));
          const h = this.heightFrom(
            this.sampleCoarse(BASE, BASE.cont, lx, lz),
            this.sampleCoarse(BASE, BASE.ero, lx, lz),
            this.sampleCoarse(BASE, BASE.ridge, lx, lz), detail,
            this.sampleCoarse(F, F.drift, lx, lz),
            this.sampleCoarse(F, F.driftFine, lx, lz));
          const bId = this.biomeFrom(
            this.sampleCoarse(F, F.temp, lx, lz),
            this.sampleCoarse(F, F.humid, lx, lz),
            this.sampleCoarse(F, F.weird, lx, lz), h);
          hCol[lz * CHUNK_X + lx] = h;
          bCol[lz * CHUNK_X + lx] = bId;
          if (h > maxH) maxH = h;
          chunk.setHeight(lx, lz, w, Math.min(255, h));
          chunk.setBiome(lx, lz, w, bId);
        }

      const cf = this.caveField(cx, cz, w, Math.max(maxH, SEA_LEVEL));
      for (let lz = 0; lz < CHUNK_Z; lz++) {
        const z = worldZ0 + lz;
        for (let lx = 0; lx < CHUNK_X; lx++) {
          const x = worldX0 + lx;
          const h = hCol[lz * CHUNK_X + lx];
          const bId = bCol[lz * CHUNK_X + lx];
          const biome = BIOMES[bId];
          const surface = B[biome.surface] ?? B.grass;
          const filler = B[biome.filler] ?? B.dirt;
          const r = rng(ihash(x, z, w, this.seed, 0x5eed));
          const soilDepth = 3 + ((r() * 2.5) | 0);
          const top = Math.max(h, SEA_LEVEL);

          for (let y = 0; y <= top; y++) {
            let id = 0;
            if (y === 0) id = B.bedrock;
            else if (y < 4 && r() < 0.62 - y * 0.14) id = B.bedrock;
            else if (y > h) id = y <= SEA_LEVEL ? B.water : 0;
            else if (y === h) id = h <= SEA_LEVEL + 1 && bId !== BIOME.HYPERFLATS
              ? (bId === BIOME.OCEAN ? B.gravel : B.sand) : surface;
            else if (y > h - soilDepth) id = filler;
            else id = bId === BIOME.RIFT_BARRENS && y > h - 14 ? B.slate : B.stone;

            if (id && id !== B.bedrock && id !== B.water && y > 1 && y < h) {
              if (this.sampleCave(cf, lx, y, lz) > 0) id = y < 9 && r() < 0.30 ? B.lava : 0;
            }
            if (id) blocks[idx(lx, y, lz, w)] = id;
          }

          let realTop = 0;
          for (let y = top; y >= 0; y--) if (blocks[idx(lx, y, lz, w)]) { realTop = y; break; }
          chunk.setHeight(lx, lz, w, realTop);
          if (h > 62 && realTop === h && blocks[idx(lx, h, lz, w)] === surface && bId !== BIOME.HYPERFLATS)
            blocks[idx(lx, h, lz, w)] = B.snow_grass;
        }
      }
      this.stampOres(chunk, w);
      this.decorate(chunk, w, pending);
    }

    if (this.options.structures) this.structures(chunk, pending);
    chunk.generated = true;
  }

  // --- flora -------------------------------------------------------------
  decorate(chunk, w, pending) {
    const { cx, cz } = chunk;
    const put = (x, y, z, id, force = false) => this.place(chunk, pending, x, y, z, w, id, force);
    const get = (x, y, z) => this.read(chunk, x, y, z, w);

    for (let lz = 0; lz < CHUNK_Z; lz++) {
      for (let lx = 0; lx < CHUNK_X; lx++) {
        const x = cx * CHUNK_X + lx, z = cz * CHUNK_Z + lz;
        const h = chunk.heightAt(lx, lz, w);
        const bId = chunk.biomeAt(lx, lz, w);
        const biome = BIOMES[bId];
        if (h < 1 || h >= WORLD_H - 8) continue;
        const ground = chunk.blocks[idx(lx, h, lz, w)];
        if (ground === B.water || ground === B.lava || ground === 0) continue;
        const r = rng(ihash(x, z, w * 31 + 7, this.s.deco, 0xdec0));

        const canPlant = ground === B.grass || ground === B.snow_grass ||
                         ground === B.dirt || ground === B.hyperstone || ground === B.sand ||
                         ground === B.slate || ground === B.chroma_clay;
        if (!canPlant) continue;

        // trees
        if (biome.tree && r() < biome.treeChance) {
          this.tree(chunk, pending, x, h + 1, z, w, biome.tree);
          continue;
        }
        // ground cover
        const rv = r();
        if (rv < biome.grassChance && (ground === B.grass || ground === B.hyperstone)) {
          put(x, h + 1, z, B.tall_grass);
        } else if (rv < biome.grassChance + biome.flowerChance) {
          const f = r();
          const flower = bId === BIOME.HYPERFLATS ? B.flower_violet
            : f < 0.42 ? B.flower_red : f < 0.84 ? B.flower_yellow : B.flower_violet;
          put(x, h + 1, z, flower);
        } else if (bId === BIOME.SWAMP && rv < 0.40) {
          put(x, h + 1, z, r() < 0.5 ? B.mushroom_brown : B.mushroom_red);
        } else if (bId === BIOME.HYPERFLATS && rv < 0.16) {
          put(x, h + 1, z, B.lumen);
        }
      }
    }

    // cave mushrooms and glow patches
    const rr = rng(ihash(cx, cz, w, this.s.deco, 0xcafe));
    for (let i = 0; i < 26; i++) {
      const lx = (rr() * CHUNK_X) | 0, lz = (rr() * CHUNK_Z) | 0;
      const y = 6 + ((rr() * 46) | 0);
      if (get(cx * CHUNK_X + lx, y, cz * CHUNK_Z + lz) !== 0) continue;
      const below = chunk.blocks[idx(lx, y - 1, lz, w)];
      if (below !== B.stone && below !== B.slate) continue;
      const pick = rr();
      chunk.blocks[idx(lx, y, lz, w)] =
        pick < 0.42 ? B.mushroom_brown : pick < 0.7 ? B.mushroom_red :
        pick < 0.88 ? B.lumen : B.hyperstone;
    }
  }

  tree(chunk, pending, x, y, z, w, kind) {
    const put = (px, py, pz, id, force) => this.place(chunk, pending, px, py, pz, w, id, force);
    const r = rng(ihash(x, z, w, this.s.deco, 0x7a3e));
    if (kind === 'cactus') {
      const h = 2 + ((r() * 3) | 0);
      for (let i = 0; i < h; i++) put(x, y + i, z, B.cactus, true);
      return;
    }
    if (kind === 'hyper') {
      const h = 5 + ((r() * 4) | 0);
      for (let i = 0; i < h; i++) put(x, y + i, z, B.hyperstone, true);
      for (let dy = -2; dy <= 2; dy++)
        for (let dz = -2; dz <= 2; dz++)
          for (let dx = -2; dx <= 2; dx++) {
            const d = Math.abs(dx) + Math.abs(dy) + Math.abs(dz);
            if (d > 3 || (dx === 0 && dz === 0 && dy < 0)) continue;
            if (r() < 0.22) continue;
            put(x + dx, y + h - 1 + dy, z + dz, d === 0 ? B.lumen : B.hyperglass);
          }
      return;
    }
    const log = kind === 'pine' ? B.pine_log : kind === 'birch' ? B.birch_log : B.oak_log;
    const leaf = kind === 'pine' ? B.pine_leaves : kind === 'birch' ? B.birch_leaves : B.oak_leaves;

    if (kind === 'pine') {
      const h = 7 + ((r() * 5) | 0);
      for (let i = 0; i < h; i++) put(x, y + i, z, log, true);
      for (let ly = 2; ly < h + 2; ly++) {
        const t = (h + 2 - ly);
        const rad = Math.max(0, Math.min(3, Math.round(t * 0.45)));
        for (let dz = -rad; dz <= rad; dz++)
          for (let dx = -rad; dx <= rad; dx++) {
            if (Math.abs(dx) + Math.abs(dz) > rad + 1) continue;
            if (dx === 0 && dz === 0 && ly < h) continue;
            if (rad > 1 && Math.abs(dx) === rad && Math.abs(dz) === rad) continue;
            put(x + dx, y + ly, z + dz, leaf);
          }
      }
      put(x, y + h + 1, z, leaf);
      return;
    }

    const h = (kind === 'birch' ? 6 : 5) + ((r() * 3) | 0);
    for (let i = 0; i < h; i++) put(x, y + i, z, log, true);
    const top = y + h;
    for (let dy = -2; dy <= 1; dy++) {
      const rad = dy <= -1 ? 2 : dy === 0 ? 2 : 1;
      for (let dz = -rad; dz <= rad; dz++)
        for (let dx = -rad; dx <= rad; dx++) {
          if (dx === 0 && dz === 0 && dy <= 0) continue;
          if (Math.abs(dx) === rad && Math.abs(dz) === rad && (dy > 0 || r() < 0.55)) continue;
          put(x + dx, top + dy, z + dz, leaf);
        }
    }
    put(x, top + 1, z, leaf);
  }

  // --- structures --------------------------------------------------------
  structures(chunk, pending) {
    const { cx, cz } = chunk;
    for (let w = 0; w < W_LAYERS; w++) {
      const r = rng(ihash(cx, cz, w, this.s.struct, 0x5721));
      const roll = r();
      if (roll < 0.055) this.supplyCache(chunk, pending, w, r);
      else if (roll < 0.075) this.hyperkeep(chunk, pending, w, r);
      else if (roll < 0.098) this.riftSpire(chunk, pending, w, r);
      else if (roll < 0.120) this.camp(chunk, pending, w, r);
    }
  }

  /** A small buried stone room with a chest of starting gear. */
  supplyCache(chunk, pending, w, r) {
    const lx = 3 + ((r() * 9) | 0), lz = 3 + ((r() * 9) | 0);
    const x = chunk.cx * CHUNK_X + lx, z = chunk.cz * CHUNK_Z + lz;
    const surf = chunk.heightAt(lx, lz, w);
    if (surf < 8) return;
    const y = Math.max(6, surf - 4 - ((r() * 6) | 0));
    const put = (px, py, pz, id, f) => this.place(chunk, pending, px, py, pz, w, id, f);

    for (let dy = 0; dy < 5; dy++)
      for (let dz = -3; dz <= 3; dz++)
        for (let dx = -3; dx <= 3; dx++) {
          const shell = dy === 0 || dy === 4 || Math.abs(dx) === 3 || Math.abs(dz) === 3;
          if (shell) put(x + dx, y + dy, z + dz, r() < 0.24 ? B.mossy_cobblestone : B.cobblestone, true);
          else put(x + dx, y + dy, z + dz, 0, true);
        }
    put(x, y + 1, z, B.chest, true);
    this.markTE(chunk, pending, x, y + 1, z, w, { type: 'chest', loot: 'cache' });
    put(x - 2, y + 3, z - 2, B.torch, true);
    put(x + 2, y + 3, z + 2, B.torch, true);
    put(x + 2, y + 1, z - 2, B.crafting_table, true);
    put(x - 2, y + 1, z + 2, B.furnace, true);
    this.markTE(chunk, pending, x - 2, y + 1, z + 2, w, { type: 'furnace' });
  }

  /** Deep vault of slate brick guarded by rift stone. */
  hyperkeep(chunk, pending, w, r) {
    const lx = 4 + ((r() * 7) | 0), lz = 4 + ((r() * 7) | 0);
    const x = chunk.cx * CHUNK_X + lx, z = chunk.cz * CHUNK_Z + lz;
    const y = 10 + ((r() * 16) | 0);
    const put = (px, py, pz, id, f) => this.place(chunk, pending, px, py, pz, w, id, f);
    const R = 5, H = 7;
    for (let dy = 0; dy < H; dy++)
      for (let dz = -R; dz <= R; dz++)
        for (let dx = -R; dx <= R; dx++) {
          const shell = dy === 0 || dy === H - 1 || Math.abs(dx) === R || Math.abs(dz) === R;
          if (shell) {
            const pick = r();
            put(x + dx, y + dy, z + dz,
              pick < 0.14 ? B.cracked_stone_bricks : pick < 0.24 ? B.mossy_cobblestone :
              pick < 0.30 ? B.dark_prism : B.stone_bricks, true);
          } else put(x + dx, y + dy, z + dz, 0, true);
        }
    // pillars + rift core
    for (const [dx, dz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]])
      for (let dy = 1; dy < H - 1; dy++) put(x + dx, y + dy, z + dz, B.dark_prism, true);
    put(x, y + 1, z, B.rift_block, true);
    put(x, y + 2, z, B.hyperglass, true);
    for (const [dx, dz] of [[-2, 0], [2, 0], [0, -2], [0, 2]]) {
      put(x + dx, y + 1, z + dz, B.hyperchest, true);
      this.markTE(chunk, pending, x + dx, y + 1, z + dz, w, { type: 'chest', loot: 'keep' });
    }
    for (const [dx, dz] of [[-4, -1], [4, 1], [-1, 4], [1, -4]])
      put(x + dx, y + 3, z + dz, B.torch, true);
    this.markSpawn(chunk, pending, x, y + 1, z, w, 'keep');
  }

  /** A tower of rift stone breaking the surface — a landmark and a warning. */
  riftSpire(chunk, pending, w, r) {
    const lx = 4 + ((r() * 8) | 0), lz = 4 + ((r() * 8) | 0);
    const x = chunk.cx * CHUNK_X + lx, z = chunk.cz * CHUNK_Z + lz;
    const base = chunk.heightAt(lx, lz, w);
    if (base < SEA_LEVEL) return;
    const h = 9 + ((r() * 10) | 0);
    const put = (px, py, pz, id, f) => this.place(chunk, pending, px, py, pz, w, id, f);
    for (let dy = 0; dy < h; dy++) {
      const rad = Math.max(0, 2 - Math.floor(dy / (h / 3)));
      for (let dz = -rad; dz <= rad; dz++)
        for (let dx = -rad; dx <= rad; dx++) {
          if (Math.abs(dx) === rad && Math.abs(dz) === rad && rad > 1) continue;
          put(x + dx, base + dy, z + dz, r() < 0.18 ? B.rift_block : B.obsidian, true);
        }
    }
    put(x, base + h, z, B.rift_block, true);
    put(x, base + h + 1, z, B.lumen, true);
    this.markTE(chunk, pending, x, base + h, z, w, { type: 'rift' });
    this.markSpawn(chunk, pending, x, base + h + 2, z, w, 'spire');
  }

  /** A tiny surface camp: the seed for wandering NPCs. */
  camp(chunk, pending, w, r) {
    const lx = 4 + ((r() * 8) | 0), lz = 4 + ((r() * 8) | 0);
    const x = chunk.cx * CHUNK_X + lx, z = chunk.cz * CHUNK_Z + lz;
    const y = chunk.heightAt(lx, lz, w) + 1;
    if (y < SEA_LEVEL + 1) return;
    const put = (px, py, pz, id, f) => this.place(chunk, pending, px, py, pz, w, id, f);
    const plank = B.oak_planks;
    for (let dz = -2; dz <= 2; dz++)
      for (let dx = -2; dx <= 2; dx++) {
        put(x + dx, y - 1, z + dz, plank, true);
        if (Math.abs(dx) === 2 || Math.abs(dz) === 2) {
          put(x + dx, y, z + dz, r() < 0.3 ? B.glass : plank, true);
          put(x + dx, y + 1, z + dz, plank, true);
        }
      }
    for (let dz = -2; dz <= 2; dz++)
      for (let dx = -2; dx <= 2; dx++) put(x + dx, y + 2, z + dz, B.oak_planks, true);
    put(x, y, z - 2, 0, true); put(x, y + 1, z - 2, 0, true);   // doorway
    put(x + 1, y, z + 1, B.chest, true);
    this.markTE(chunk, pending, x + 1, y, z + 1, w, { type: 'chest', loot: 'camp' });
    put(x - 1, y, z + 1, B.crafting_table, true);
    put(x - 1, y, z - 1, B.furnace, true);
    this.markTE(chunk, pending, x - 1, y, z - 1, w, { type: 'furnace' });
    put(x, y + 1, z + 2, B.torch, true);
    this.markSpawn(chunk, pending, x, y, z, w, 'camp');
  }

  // --- helpers -----------------------------------------------------------
  read(chunk, x, y, z, w) {
    const lx = x - chunk.cx * CHUNK_X, lz = z - chunk.cz * CHUNK_Z;
    if (lx < 0 || lz < 0 || lx >= CHUNK_X || lz >= CHUNK_Z || y < 0 || y >= WORLD_H) return -1;
    return chunk.blocks[idx(lx, y, lz, w)];
  }

  /** Write a block, deferring anything that falls outside this chunk. */
  place(chunk, pending, x, y, z, w, id, force = false) {
    if (y < 0 || y >= WORLD_H) return;
    const lx = x - chunk.cx * CHUNK_X, lz = z - chunk.cz * CHUNK_Z;
    if (lx >= 0 && lz >= 0 && lx < CHUNK_X && lz < CHUNK_Z) {
      const i = idx(lx, y, lz, w);
      if (force || chunk.blocks[i] === 0) chunk.blocks[i] = id;
      return;
    }
    const ccx = Math.floor(x / CHUNK_X), ccz = Math.floor(z / CHUNK_Z);
    const key = `${ccx},${ccz}`;
    let list = pending.get(key);
    if (!list) { list = []; pending.set(key, list); }
    list.push([x, y, z, w, id, force ? 1 : 0]);
  }

  markTE(chunk, pending, x, y, z, w, data) {
    const ccx = Math.floor(x / CHUNK_X), ccz = Math.floor(z / CHUNK_Z);
    if (ccx === chunk.cx && ccz === chunk.cz) {
      chunk.setTE(x - ccx * CHUNK_X, y, z - ccz * CHUNK_Z, w, data);
      return;
    }
    const key = `${ccx},${ccz}`;
    let list = pending.get(key);
    if (!list) { list = []; pending.set(key, list); }
    list.push(['te', x, y, z, w, data]);
  }

  markSpawn(chunk, pending, x, y, z, w, kind) {
    (chunk.structureSpawns ||= []).push({ x: x + 0.5, y, z: z + 0.5, w: w + 0.5, kind });
  }
}
