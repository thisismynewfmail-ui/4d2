// 4D-MC :: chunk storage --------------------------------------------------
// A chunk is a 16 x 16 column of the world repeated across every layer of the
// fourth dimension. Layer-major ordering keeps a single w-layer contiguous,
// which is what the mesher walks.

import { CHUNK_X, CHUNK_Z, WORLD_H, W_LAYERS } from '../core/constants.js';

export const LAYER_STRIDE = CHUNK_X * CHUNK_Z * WORLD_H;
export const CHUNK_VOLUME = LAYER_STRIDE * W_LAYERS;

export const idx = (x, y, z, w) =>
  w * LAYER_STRIDE + (y * CHUNK_Z + z) * CHUNK_X + x;

export const idxLocal = (x, y, z) => (y * CHUNK_Z + z) * CHUNK_X + x;

export class Chunk {
  constructor(cx, cz) {
    this.cx = cx; this.cz = cz;
    this.key = `${cx},${cz}`;
    this.blocks = new Uint8Array(CHUNK_VOLUME);
    // packed light: high nibble = skylight, low nibble = block light
    this.light = new Uint8Array(CHUNK_VOLUME);
    // per (w, z, x) surface height, for fast sky lighting and decoration
    this.height = new Uint8Array(W_LAYERS * CHUNK_X * CHUNK_Z);
    this.biome = new Uint8Array(W_LAYERS * CHUNK_X * CHUNK_Z);
    this.generated = false;
    this.lit = false;
    this.dirtyLayers = new Set();     // layers whose mesh must be rebuilt
    this.meshes = new Map();          // layer -> mesh handle
    this.tileEntities = new Map();    // "x,y,z,w" -> { type, ... }
    this.entitySeeds = null;
    this.lastUsed = 0;
  }

  get(x, y, z, w) {
    if (y < 0 || y >= WORLD_H) return 0;
    return this.blocks[idx(x, y, z, w)];
  }

  set(x, y, z, w, id) {
    if (y < 0 || y >= WORLD_H) return;
    this.blocks[idx(x, y, z, w)] = id;
  }

  getLight(x, y, z, w) {
    if (y < 0) return 0;
    if (y >= WORLD_H) return 0xf0;
    return this.light[idx(x, y, z, w)];
  }

  heightAt(x, z, w) { return this.height[(w * CHUNK_Z + z) * CHUNK_X + x]; }
  setHeight(x, z, w, h) { this.height[(w * CHUNK_Z + z) * CHUNK_X + x] = h; }
  biomeAt(x, z, w) { return this.biome[(w * CHUNK_Z + z) * CHUNK_X + x]; }
  setBiome(x, z, w, b) { this.biome[(w * CHUNK_Z + z) * CHUNK_X + x] = b; }

  markDirty(w) {
    this.dirtyLayers.add(w);
    this.lit = false;
  }

  markAllDirty() {
    for (let w = 0; w < W_LAYERS; w++) this.dirtyLayers.add(w);
    this.lit = false;
  }

  teKey(x, y, z, w) { return `${x},${y},${z},${w}`; }
  getTE(x, y, z, w) { return this.tileEntities.get(this.teKey(x, y, z, w)) || null; }
  setTE(x, y, z, w, data) { this.tileEntities.set(this.teKey(x, y, z, w), data); }
  removeTE(x, y, z, w) { this.tileEntities.delete(this.teKey(x, y, z, w)); }
}
