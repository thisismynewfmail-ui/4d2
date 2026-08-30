// 4D-MC :: noise ----------------------------------------------------------
// Perlin-style gradient noise in 3 and 4 dimensions. The w axis is *cyclic*:
// the hyperworld wraps after W_PERIOD layers so a player can scroll through
// the fourth dimension forever and come home again.

import { ihash, smootherstep } from './math.js';

// 32 well-spread 4D gradient directions (edge midpoints of a tesseract).
const G4 = new Int8Array([
  0, 1, 1, 1, 0, 1, 1, -1, 0, 1, -1, 1, 0, 1, -1, -1,
  0, -1, 1, 1, 0, -1, 1, -1, 0, -1, -1, 1, 0, -1, -1, -1,
  1, 0, 1, 1, 1, 0, 1, -1, 1, 0, -1, 1, 1, 0, -1, -1,
  -1, 0, 1, 1, -1, 0, 1, -1, -1, 0, -1, 1, -1, 0, -1, -1,
  1, 1, 0, 1, 1, 1, 0, -1, 1, -1, 0, 1, 1, -1, 0, -1,
  -1, 1, 0, 1, -1, 1, 0, -1, -1, -1, 0, 1, -1, -1, 0, -1,
  1, 1, 1, 0, 1, 1, -1, 0, 1, -1, 1, 0, 1, -1, -1, 0,
  -1, 1, 1, 0, -1, 1, -1, 0, -1, -1, 1, 0, -1, -1, -1, 0,
]);

const G3 = new Int8Array([
  1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0,
  1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1,
  0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1,
]);

function grad3(hx, x, y, z) {
  const i = (hx % 12) * 3;
  return G3[i] * x + G3[i + 1] * y + G3[i + 2] * z;
}

function grad4(hx, x, y, z, w) {
  const i = (hx & 31) * 4;
  return G4[i] * x + G4[i + 1] * y + G4[i + 2] * z + G4[i + 3] * w;
}

export function perlin3(x, y, z, seed) {
  const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z);
  const fx = x - X, fy = y - Y, fz = z - Z;
  const u = smootherstep(fx), v = smootherstep(fy), t = smootherstep(fz);
  let n = 0;
  const c = (dx, dy, dz) =>
    grad3(ihash(X + dx, Y + dy, Z + dz, 0, seed) >>> 3, fx - dx, fy - dy, fz - dz);
  const x00 = c(0, 0, 0) + u * (c(1, 0, 0) - c(0, 0, 0));
  const x10 = c(0, 1, 0) + u * (c(1, 1, 0) - c(0, 1, 0));
  const x01 = c(0, 0, 1) + u * (c(1, 0, 1) - c(0, 0, 1));
  const x11 = c(0, 1, 1) + u * (c(1, 1, 1) - c(0, 1, 1));
  const y0 = x00 + v * (x10 - x00);
  const y1 = x01 + v * (x11 - x01);
  n = y0 + t * (y1 - y0);
  return n * 0.98;
}

/**
 * 4D gradient noise. `wp` is the lattice period along w — the lattice index is
 * wrapped modulo `wp`, which makes the field seamlessly cyclic in the fourth
 * dimension.
 */
export function perlin4(x, y, z, w, seed, wp) {
  const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z), W = Math.floor(w);
  const fx = x - X, fy = y - Y, fz = z - Z, fw = w - W;
  const u = smootherstep(fx), v = smootherstep(fy), t = smootherstep(fz), s = smootherstep(fw);
  const w0 = wp ? ((W % wp) + wp) % wp : W;
  const w1 = wp ? ((W + 1) % wp + wp) % wp : W + 1;

  const c = (dx, dy, dz, dw, wi) =>
    grad4(ihash(X + dx, Y + dy, Z + dz, wi, seed) >>> 3, fx - dx, fy - dy, fz - dz, fw - dw);

  let acc = 0;
  for (let dw = 0; dw <= 1; dw++) {
    const wi = dw ? w1 : w0;
    const x00 = c(0, 0, 0, dw, wi) + u * (c(1, 0, 0, dw, wi) - c(0, 0, 0, dw, wi));
    const x10 = c(0, 1, 0, dw, wi) + u * (c(1, 1, 0, dw, wi) - c(0, 1, 0, dw, wi));
    const x01 = c(0, 0, 1, dw, wi) + u * (c(1, 0, 1, dw, wi) - c(0, 0, 1, dw, wi));
    const x11 = c(0, 1, 1, dw, wi) + u * (c(1, 1, 1, dw, wi) - c(0, 1, 1, dw, wi));
    const y0 = x00 + v * (x10 - x00);
    const y1 = x01 + v * (x11 - x01);
    const zz = y0 + t * (y1 - y0);
    acc += dw ? s * zz : (1 - s) * zz;
  }
  return acc * 1.12;
}

/** Fractal Brownian motion over perlin4. */
// NOTE: the w coordinate is deliberately *not* scaled by the octave frequency.
// Detail octaves must stay coherent along the fourth axis, otherwise adjacent
// slices decorrelate completely and the world shatters instead of flowing.
export function fbm4(x, y, z, w, seed, wp, octaves = 4, lac = 2.0, gain = 0.5) {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * perlin4(x * freq, y * freq, z * freq, w, seed + o * 7919, wp);
    norm += amp;
    amp *= gain;
    freq *= lac;
  }
  return sum / norm;
}

/** Ridged multifractal — good for mountain spines and cave walls. */
export function ridged4(x, y, z, w, seed, wp, octaves = 4) {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let o = 0; o < octaves; o++) {
    const n = 1 - Math.abs(perlin4(x * freq, y * freq, z * freq, w, seed + o * 6151, wp));
    sum += amp * n * n;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

/** Cheap cell/worley noise used for ore clusters and biome shattering. */
export function worley4(x, y, z, w, seed, wp) {
  const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z), W = Math.floor(w);
  let best = 8;
  for (let dw = -1; dw <= 1; dw++) {
    const wi = wp ? (((W + dw) % wp) + wp) % wp : W + dw;
    for (let dz = -1; dz <= 1; dz++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const h = ihash(X + dx, Y + dy, Z + dz, wi, seed);
          const px = X + dx + ((h & 255) / 255);
          const py = Y + dy + (((h >>> 8) & 255) / 255);
          const pz = Z + dz + (((h >>> 16) & 255) / 255);
          const pw = W + dw + (((h >>> 24) & 255) / 255);
          const d = (px - x) ** 2 + (py - y) ** 2 + (pz - z) ** 2 + (pw - w) ** 2;
          if (d < best) best = d;
        }
  }
  return Math.sqrt(best);
}
