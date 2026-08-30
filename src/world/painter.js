// 4D-MC :: pixel-art painter ---------------------------------------------
// A tiny deterministic drawing surface used to synthesise every texture in the
// game. The aesthetic target is early-beta Minecraft — 16x16, a handful of
// shades per material, heavy ordered dithering — pushed a little further with
// cooler shadows and a faint violet cast so the world reads as "4D".

import { ihash } from '../core/math.js';

export const TEX_SIZE = 16;

export function hex(h) {
  return [(h >> 16) & 255, (h >> 8) & 255, h & 255];
}

export function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function shade(c, f) {
  return [Math.min(255, c[0] * f), Math.min(255, c[1] * f), Math.min(255, c[2] * f)];
}

/** Build a ramp of `n` shades around a base colour with a cool shadow tint. */
export function ramp(base, n = 4, lo = 0.62, hi = 1.16) {
  const out = [];
  const cool = [0.86, 0.90, 1.06];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 1 : i / (n - 1);
    const f = lo + (hi - lo) * t;
    const c = shade(base, f);
    const k = 1 - t; // shadows lean cool, highlights lean warm
    out.push([
      Math.min(255, c[0] * (1 - k * 0.14 + (1 - k) * 0.03)),
      Math.min(255, c[1] * (1 - k * 0.10)),
      Math.min(255, c[2] * (1 + k * 0.10)),
    ]);
  }
  return out;
}

export class Painter {
  constructor(size = TEX_SIZE, seed = 1) {
    this.n = size;
    this.seed = seed >>> 0;
    this.data = new Uint8ClampedArray(size * size * 4);
  }

  rand(x, y, salt = 0) {
    return ihash(x, y, salt, this.seed, 0x4d4d4d) / 4294967296;
  }

  set(x, y, c, a = 255) {
    const n = this.n;
    x = ((x % n) + n) % n; y = ((y % n) + n) % n;
    const i = (y * n + x) * 4;
    this.data[i] = c[0]; this.data[i + 1] = c[1]; this.data[i + 2] = c[2]; this.data[i + 3] = a;
  }

  get(x, y) {
    const n = this.n;
    x = ((x % n) + n) % n; y = ((y % n) + n) % n;
    const i = (y * n + x) * 4;
    return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]];
  }

  fill(c, a = 255) {
    for (let y = 0; y < this.n; y++) for (let x = 0; x < this.n; x++) this.set(x, y, c, a);
    return this;
  }

  clear() { this.data.fill(0); return this; }

  rect(x0, y0, w, h, c, a = 255) {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.set(x, y, c, a);
    return this;
  }

  frame(x0, y0, w, h, c, a = 255) {
    for (let x = x0; x < x0 + w; x++) { this.set(x, y0, c, a); this.set(x, y0 + h - 1, c, a); }
    for (let y = y0; y < y0 + h; y++) { this.set(x0, y, c, a); this.set(x0 + w - 1, y, c, a); }
    return this;
  }

  line(x0, y0, x1, y1, c, a = 255) {
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy, x = x0, y = y0;
    for (let i = 0; i < 64; i++) {
      this.set(x, y, c, a);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
    }
    return this;
  }

  /** Classic beta granular fill: pick a shade per texel from a small ramp. */
  grain(shades, salt = 0, bias = 0) {
    for (let y = 0; y < this.n; y++) {
      for (let x = 0; x < this.n; x++) {
        let r = this.rand(x, y, salt);
        r = Math.min(0.999, Math.max(0, r + bias));
        this.set(x, y, shades[(r * shades.length) | 0]);
      }
    }
    return this;
  }

  /** Overlay grain only where the mask predicate passes. */
  grainMask(shades, mask, salt = 0) {
    for (let y = 0; y < this.n; y++)
      for (let x = 0; x < this.n; x++)
        if (mask(x, y)) this.set(x, y, shades[(this.rand(x, y, salt) * shades.length) | 0]);
    return this;
  }

  /** Soft blotches — moss, lichen, ore haze. */
  blotch(c, count, radius, salt = 0, alpha = 255) {
    for (let i = 0; i < count; i++) {
      const cx = this.rand(i, 0, salt) * this.n;
      const cy = this.rand(0, i, salt + 1) * this.n;
      const r = radius * (0.5 + this.rand(i, i, salt + 2));
      for (let y = Math.floor(cy - r); y <= cy + r; y++)
        for (let x = Math.floor(cx - r); x <= cx + r; x++) {
          const d = Math.hypot(x - cx, y - cy);
          if (d <= r * (0.7 + this.rand(x, y, salt + 3) * 0.6)) this.set(x, y, c, alpha);
        }
    }
    return this;
  }

  /** Darken/lighten the outer ring — cheap bevelling that reads well at 16px. */
  bevel(lightF = 1.16, darkF = 0.74, thickness = 1) {
    const n = this.n;
    for (let t = 0; t < thickness; t++) {
      for (let x = t; x < n - t; x++) {
        this.set(x, t, shade(this.get(x, t), lightF));
        this.set(x, n - 1 - t, shade(this.get(x, n - 1 - t), darkF));
      }
      for (let y = t; y < n - t; y++) {
        this.set(t, y, shade(this.get(t, y), lightF * 0.97));
        this.set(n - 1 - t, y, shade(this.get(n - 1 - t, y), darkF * 1.05));
      }
    }
    return this;
  }

  /** Scatter individual darker/lighter pixels for texture "crunch". */
  pepper(c, chance, salt = 0, alpha = 255) {
    for (let y = 0; y < this.n; y++)
      for (let x = 0; x < this.n; x++)
        if (this.rand(x, y, salt) < chance) this.set(x, y, c, alpha);
    return this;
  }

  /** Multiply every texel by a vertical gradient. */
  vgrad(topF, botF) {
    for (let y = 0; y < this.n; y++) {
      const f = topF + (botF - topF) * (y / (this.n - 1));
      for (let x = 0; x < this.n; x++) this.set(x, y, shade(this.get(x, y), f), this.get(x, y)[3]);
    }
    return this;
  }

  copyFrom(other) { this.data.set(other.data); return this; }

  toImageData() {
    return new ImageData(new Uint8ClampedArray(this.data), this.n, this.n);
  }
}

/** Draw an ore vein overlay onto a stone base. */
export function oreOn(base, gemColors, seed, count = 6) {
  const p = new Painter(TEX_SIZE, seed).copyFrom(base);
  const n = TEX_SIZE;
  for (let i = 0; i < count; i++) {
    const cx = 2 + ((p.rand(i, 3, 11) * (n - 4)) | 0);
    const cy = 2 + ((p.rand(3, i, 13) * (n - 4)) | 0);
    const sz = 1 + ((p.rand(i, i, 17) * 2.4) | 0);
    for (let y = cy - sz; y <= cy + sz; y++)
      for (let x = cx - sz; x <= cx + sz; x++) {
        const d = Math.abs(x - cx) + Math.abs(y - cy);
        if (d > sz) continue;
        const t = d / Math.max(1, sz);
        const idx = Math.min(gemColors.length - 1, Math.floor(t * gemColors.length));
        p.set(x, y, gemColors[idx]);
        if (d === 0) p.set(x, y, shade(gemColors[0], 1.25));
      }
  }
  return p;
}
