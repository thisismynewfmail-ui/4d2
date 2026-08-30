// 4D-MC :: block texture synthesis ---------------------------------------
// Every tile is generated from a seeded painter so the whole set shares one
// palette language: cool violet-leaning shadows, warm highlights, chunky
// two-bit dithering. Early-beta in spirit, not a copy of it.

import { Painter, TEX_SIZE as N, hex, mix, shade, ramp, oreOn } from './painter.js';

const P = (seed) => new Painter(N, seed);

function ihashLocal(x, y, i, s) {
  let h = (x * 374761393 + y * 668265263 + i * 2147483647 + s * 1013904223) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

export const PAL = {
  stone:    hex(0x8a8d99),
  slate:    hex(0x474a58),
  marble:   hex(0xd2d5e0),
  dirt:     hex(0x7a5738),
  grass:    hex(0x6fae4c),
  sand:     hex(0xdbd2a2),
  sandstone:hex(0xcfc490),
  gravel:   hex(0x8d8a8b),
  clay:     hex(0x9fa1b3),
  oak:      hex(0x8c6b41),
  pine:     hex(0x5c452f),
  birch:    hex(0xd3cab2),
  leafOak:  hex(0x4e8c39),
  leafPine: hex(0x2e6b45),
  leafBirch:hex(0x79ab62),
  brick:    hex(0xa14c3b),
  snow:     hex(0xf1f5ff),
  ice:      hex(0x9ecfef),
  water:    hex(0x2f6cc0),
  lava:     hex(0xe8691b),
  obsidian: hex(0x1a1229),
  lumen:    hex(0xffd88a),
  ember:    hex(0x8b3a30),
  hyper:    hex(0x8e69de),
  tess:     hex(0x4fe5d7),
  rift:     hex(0x2a1b46),
  chroma:   hex(0xc07a4a),
  iron:     hex(0xd8d6d0),
  gold:     hex(0xf6cf55),
  diamond:  hex(0x6fe6dd),
  coal:     hex(0x241f22),
  azure:    hex(0x2a52c8),
  pulse:    hex(0xd6303a),
};

// ---- base materials -----------------------------------------------------

function stoneTex(seed = 11, base = PAL.stone, crunch = 0.10) {
  const p = P(seed);
  p.grain(ramp(base, 5, 0.66, 1.14), 0);
  p.pepper(shade(base, 0.50), crunch, 3);
  p.pepper(shade(base, 1.26), crunch * 0.7, 5);
  // a few larger flat patches keep it from looking like TV static
  for (let i = 0; i < 4; i++) {
    const cx = (p.rand(i, 4, 21) * N) | 0, cy = (p.rand(4, i, 22) * N) | 0;
    const c = shade(base, 0.82 + p.rand(i, i, 23) * 0.4);
    for (let y = cy; y < cy + 2 + ((p.rand(i, 1, 24) * 3) | 0); y++)
      for (let x = cx; x < cx + 2 + ((p.rand(1, i, 25) * 3) | 0); x++) p.set(x, y, c);
  }
  return p;
}

function cobbleTex(seed = 21, base = PAL.stone) {
  const p = P(seed);
  const sh = ramp(base, 5, 0.60, 1.14);
  p.fill(shade(base, 0.42));
  // irregular stones separated by dark mortar
  const cells = [
    [0, 0, 6, 5], [7, 0, 5, 4], [13, 0, 3, 6], [0, 6, 4, 5], [5, 5, 6, 6],
    [12, 7, 4, 5], [0, 12, 7, 4], [8, 12, 4, 4], [13, 13, 3, 3], [5, 11, 2, 5],
  ];
  for (let ci = 0; ci < cells.length; ci++) {
    const [x0, y0, w, h] = cells[ci];
    for (let y = y0; y < y0 + h - 1; y++)
      for (let x = x0; x < x0 + w - 1; x++) {
        const r = p.rand(x, y, ci + 7);
        let c = sh[1 + ((r * 3) | 0)];
        if (y === y0) c = shade(c, 1.20);
        if (y === y0 + h - 2) c = shade(c, 0.80);
        p.set(x, y, c);
      }
  }
  p.pepper(shade(base, 0.5), 0.06, 31);
  return p;
}

function dirtTex(seed = 31) {
  const p = P(seed);
  p.grain(ramp(PAL.dirt, 5, 0.70, 1.14), 0);
  p.pepper(shade(PAL.dirt, 0.58), 0.10, 2);
  p.pepper(shade(PAL.dirt, 1.22), 0.06, 4);
  return p;
}

function grassTop(seed = 41, base = PAL.grass) {
  const p = P(seed);
  p.grain(ramp(base, 6, 0.68, 1.16), 0);
  p.pepper(shade(base, 1.30), 0.09, 9);
  p.pepper(shade(base, 0.60), 0.09, 13);
  // a couple of lighter blades for movement
  for (let i = 0; i < 5; i++) {
    const x = (p.rand(i, 1, 21) * N) | 0, y = (p.rand(1, i, 22) * N) | 0;
    p.set(x, y, shade(base, 1.38));
    p.set(x, y + 1, shade(base, 1.22));
  }
  return p;
}

function grassSide(seed = 51, base = PAL.grass, soil = PAL.dirt) {
  const p = dirtTex(seed + 1);
  const gs = ramp(base, 5, 0.70, 1.18);
  // ragged fringe: per-column grass depth 3..6 px
  for (let x = 0; x < N; x++) {
    const d = 3 + ((p.rand(x, 0, 77) * 3.4) | 0);
    for (let y = 0; y < d; y++) {
      const t = y / d;
      const c = gs[Math.min(gs.length - 1, 1 + ((p.rand(x, y, 5) * 3) | 0))];
      p.set(x, y, shade(c, 1.06 - t * 0.24));
    }
    p.set(x, d, mix(soil, base, 0.35));
  }
  return p;
}

function snowSide(seed = 55) {
  const p = dirtTex(seed);
  const gs = ramp(PAL.snow, 4, 0.82, 1.06);
  for (let x = 0; x < N; x++) {
    const d = 3 + ((p.rand(x, 0, 79) * 3) | 0);
    for (let y = 0; y < d; y++) p.set(x, y, gs[(p.rand(x, y, 6) * gs.length) | 0]);
  }
  return p;
}

function sandTex(seed = 61, base = PAL.sand) {
  const p = P(seed);
  p.grain(ramp(base, 4, 0.84, 1.08), 0);
  p.pepper(shade(base, 0.74), 0.07, 3);
  return p;
}

function sandstoneSide(seed = 63) {
  const p = sandTex(seed, PAL.sandstone);
  const dark = shade(PAL.sandstone, 0.66);
  for (const y of [0, 5, 10, 15]) for (let x = 0; x < N; x++) p.set(x, y, dark);
  for (let x = 0; x < N; x++) { p.set(x, 1, shade(PAL.sandstone, 1.12)); p.set(x, 6, shade(PAL.sandstone, 1.10)); }
  return p;
}

function gravelTex(seed = 71) {
  const p = P(seed);
  p.fill(shade(PAL.gravel, 0.55));
  const sh = ramp(PAL.gravel, 5, 0.64, 1.16);
  for (let i = 0; i < 26; i++) {
    const cx = (p.rand(i, 2, 3) * N) | 0, cy = (p.rand(2, i, 4) * N) | 0;
    const r = 1 + ((p.rand(i, i, 5) * 1.9) | 0);
    const c = sh[1 + ((p.rand(i, 9, 6) * 4) | 0)];
    for (let y = cy - r; y <= cy + r; y++)
      for (let x = cx - r; x <= cx + r; x++)
        if (Math.abs(x - cx) + Math.abs(y - cy) <= r) p.set(x, y, y === cy - r ? shade(c, 1.2) : c);
  }
  return p;
}

function logSide(seed = 81, bark = PAL.oak) {
  const p = P(seed);
  const sh = ramp(bark, 5, 0.58, 1.14);
  for (let x = 0; x < N; x++) {
    const band = Math.floor(p.rand(x, 0, 1) * sh.length);
    for (let y = 0; y < N; y++) {
      const jitter = p.rand(x, y, 2) < 0.22 ? 1 : 0;
      p.set(x, y, sh[Math.min(sh.length - 1, band + jitter)]);
    }
  }
  // vertical grooves
  for (const x of [2, 6, 9, 13]) for (let y = 0; y < N; y++)
    if (p.rand(x, y, 8) > 0.18) p.set(x, y, shade(bark, 0.52));
  return p;
}

function logTop(seed = 83, bark = PAL.oak, core = null) {
  const heart = core || shade(bark, 1.24);
  const p = P(seed);
  p.grain(ramp(bark, 4, 0.60, 0.92), 0);
  const cx = 7.5, cy = 7.5;
  const rings = ramp(heart, 4, 0.80, 1.14);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const d = Math.hypot(x - cx, y - cy) + p.rand(x, y, 4) * 0.7;
      if (d < 6.4) p.set(x, y, rings[Math.min(3, Math.floor(d) % 4)]);
    }
  return p;
}

function planks(seed = 91, wood = PAL.oak) {
  const p = P(seed);
  const sh = ramp(wood, 5, 0.70, 1.14);
  for (let y = 0; y < N; y++) {
    const plank = Math.floor(y / 4);
    for (let x = 0; x < N; x++) {
      const r = p.rand(x, plank, 3);
      let c = sh[1 + ((r * 3 + p.rand(x, y, 4) * 0.9) | 0) % 3];
      if (y % 4 === 0) c = shade(wood, 0.50);          // seam
      else if (y % 4 === 1) c = shade(c, 1.10);
      else if (y % 4 === 3) c = shade(c, 0.88);
      p.set(x, y, c);
    }
    // nail / knot marks
  }
  for (const [x, y] of [[3, 2], [11, 6], [6, 10], [13, 14]]) p.set(x, y, shade(wood, 0.46));
  return p;
}

function leaves(seed = 101, base = PAL.leafOak) {
  const p = P(seed);
  const sh = ramp(base, 6, 0.52, 1.22);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const r = p.rand(x, y, 1);
      p.set(x, y, sh[(r * sh.length) | 0], r < 0.14 ? 0 : 255);   // punch-through gaps
    }
  p.pepper(shade(base, 1.34), 0.07, 7);
  return p;
}

function brickTex(seed = 111, base = PAL.brick, mortarC = null) {
  const p = P(seed);
  const mortar = mortarC || mix(base, hex(0xd9d2c6), 0.72);
  p.fill(mortar);
  const sh = ramp(base, 4, 0.74, 1.12);
  const rows = [0, 4, 8, 12];
  rows.forEach((y0, ri) => {
    const off = ri % 2 ? 4 : 0;
    for (let bx = -1; bx < 3; bx++) {
      const x0 = off + bx * 8;
      for (let y = y0; y < y0 + 3; y++)
        for (let x = x0; x < x0 + 7; x++) {
          const c = sh[1 + ((p.rand(x, y, ri) * 3) | 0)];
          p.set(x, y, y === y0 ? shade(c, 1.12) : y === y0 + 2 ? shade(c, 0.84) : c);
        }
    }
  });
  return p;
}

function stoneBricks(seed = 121, base = PAL.stone, cracked = false) {
  const p = brickTex(seed, base, shade(base, 0.46));
  if (cracked) {
    const d = shade(base, 0.30), d2 = shade(base, 0.44);
    p.line(2, 0, 4, 3, d); p.line(4, 3, 3, 6, d); p.line(3, 6, 6, 10, d);
    p.line(10, 1, 12, 5, d); p.line(12, 5, 10, 8, d2); p.line(10, 8, 13, 12, d);
    p.line(6, 10, 8, 15, d2); p.line(0, 8, 3, 9, d2);
    p.set(5, 5, d); p.set(7, 12, d); p.set(11, 14, d2);
  }
  return p;
}

function glassTex(seed = 131, tint = hex(0xcfe6ff), alpha = 56) {
  const p = P(seed);
  p.fill(tint, alpha);
  const edge = hex(0xeaf4ff);
  p.frame(0, 0, N, N, edge, 210);
  p.frame(1, 1, N - 2, N - 2, tint, 90);
  // two short highlight ticks rather than one long streak
  for (let i = 0; i < 3; i++) p.set(3 + i, 4 + i, hex(0xffffff), 120);
  for (let i = 0; i < 2; i++) p.set(11 + i, 10 + i, hex(0xffffff), 90);
  p.set(4, 11, hex(0xffffff), 70);
  return p;
}

function waterTex(seed = 141) {
  const p = P(seed);
  const sh = ramp(PAL.water, 4, 0.78, 1.18);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const wv = (Math.sin(x * 0.62 + Math.cos(y * 0.5) * 1.6) * 0.5 + 0.5) * 0.55
               + (Math.sin(y * 0.4) * 0.5 + 0.5) * 0.45;
      const r = p.rand(x, y, 2) * 0.30 + wv * 0.70;
      p.set(x, y, sh[(r * sh.length) | 0], 178);
    }
  return p;
}

function lavaTex(seed = 151) {
  const p = P(seed);
  const sh = [hex(0x5c1a06), hex(0x8f2c08), hex(0xd4560f), PAL.lava, hex(0xffb038), hex(0xffe58a)];
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const v = Math.sin(x * 0.7 + Math.cos(y * 0.5) * 2) * 0.5 + 0.5;
      const r = v * 0.65 + p.rand(x, y, 3) * 0.35;
      p.set(x, y, sh[Math.min(sh.length - 1, (r * sh.length) | 0)]);
    }
  return p;
}

function iceTex(seed = 161) {
  const p = P(seed);
  p.grain(ramp(PAL.ice, 4, 0.86, 1.10), 0);
  for (let i = 0; i < 4; i++) {
    const x0 = (p.rand(i, 1, 9) * N) | 0, y0 = (p.rand(1, i, 8) * N) | 0;
    p.line(x0, y0, x0 + 5 - (i % 3) * 4, y0 + 6, hex(0xe6f6ff), 220);
  }
  return p;
}

function torchTex(seed = 171) {
  const p = P(seed).clear();
  const wood = ramp(PAL.oak, 3, 0.7, 1.05);
  for (let y = 6; y < N; y++) for (let x = 7; x <= 8; x++) p.set(x, y, wood[x === 7 ? 2 : 0]);
  // flame
  const flame = [hex(0xfff3b0), hex(0xffcc44), hex(0xff8a1e), hex(0xd94a12)];
  const shape = [[7, 2], [8, 2], [6, 3], [7, 3], [8, 3], [9, 3], [6, 4], [7, 4], [8, 4], [9, 4], [7, 5], [8, 5]];
  shape.forEach(([x, y], i) => p.set(x, y, flame[(i * 7) % 4]));
  p.set(7, 1, flame[0]); p.set(8, 1, flame[1]);
  return p;
}

function craftingTop(seed = 181) {
  const p = planks(seed, PAL.oak);
  p.frame(0, 0, N, N, shade(PAL.oak, 0.44));
  // tool silhouettes carved into the surface
  const dark = shade(PAL.oak, 0.42), light = shade(PAL.oak, 1.2);
  p.line(3, 3, 6, 6, dark); p.line(3, 6, 6, 3, dark);
  p.rect(9, 3, 4, 1, dark); p.rect(10, 4, 1, 3, dark);
  p.rect(3, 10, 4, 4, dark); p.rect(4, 11, 2, 2, light);
  p.line(10, 10, 13, 13, dark); p.set(10, 13, dark); p.set(13, 10, dark);
  return p;
}

function craftingSide(seed = 183, front = false) {
  const p = planks(seed, PAL.oak);
  const dark = shade(PAL.oak, 0.40);
  p.rect(0, 0, N, 4, shade(PAL.oak, 0.86));
  for (let x = 0; x < N; x++) p.set(x, 4, dark);
  if (front) {
    p.rect(2, 6, 12, 8, shade(PAL.oak, 0.62));
    p.frame(2, 6, 12, 8, dark);
    // grid of four slots
    for (const [gx, gy] of [[3, 7], [8, 7], [3, 10], [8, 10]]) {
      p.rect(gx, gy, 4, 3, shade(PAL.oak, 1.05));
      p.frame(gx, gy, 4, 3, dark);
    }
  } else {
    p.pepper(dark, 0.05, 12);
  }
  return p;
}

function furnaceFront(seed = 191, lit = false) {
  const p = cobbleTex(seed, PAL.stone);
  const dark = shade(PAL.stone, 0.34);
  p.rect(3, 6, 10, 8, dark);
  p.frame(2, 5, 12, 10, shade(PAL.stone, 0.60));
  if (lit) {
    const flame = [hex(0xffe58a), hex(0xffab30), hex(0xe0530f)];
    for (let y = 8; y < 14; y++)
      for (let x = 4; x < 12; x++) {
        const t = (14 - y) / 6 + p.rand(x, y, 5) * 0.4;
        if (t > 0.35) p.set(x, y, flame[Math.min(2, (t * 2.2) | 0)]);
      }
  } else {
    p.rect(4, 8, 8, 5, hex(0x1b1b22));
    for (let x = 4; x < 12; x += 2) p.set(x, 12, shade(PAL.stone, 0.5));
  }
  return p;
}

function chestTex(seed = 201, kind = 'front', accent = PAL.gold, wood = PAL.oak) {
  const p = P(seed);
  const sh = ramp(wood, 4, 0.66, 1.12);
  p.grain(sh, 1);
  const dark = shade(wood, 0.40);
  if (kind === 'top') {
    p.frame(0, 0, N, N, dark);
    p.rect(0, 0, N, 5, shade(wood, 1.05));
    for (let x = 0; x < N; x++) p.set(x, 5, dark);
    p.rect(6, 6, 4, 3, accent);
    p.frame(6, 6, 4, 3, shade(accent, 0.6));
    return p;
  }
  p.frame(0, 0, N, N, dark);
  p.rect(0, 4, N, 1, dark);
  p.rect(0, 5, N, 1, shade(wood, 1.08));
  if (kind === 'front') {
    p.rect(6, 6, 4, 4, accent);
    p.frame(6, 6, 4, 4, shade(accent, 0.55));
    p.set(7, 7, shade(accent, 1.3)); p.set(8, 8, shade(accent, 0.7));
    p.rect(7, 3, 2, 3, shade(accent, 0.85));
  }
  return p;
}

function ladderTex(seed = 211) {
  const p = P(seed).clear();
  const sh = ramp(PAL.oak, 3, 0.72, 1.10);
  for (let y = 0; y < N; y++) { p.set(2, y, sh[2]); p.set(3, y, sh[0]); p.set(12, y, sh[2]); p.set(13, y, sh[0]); }
  for (const y of [2, 7, 12]) for (let x = 3; x < 13; x++) { p.set(x, y, sh[2]); p.set(x, y + 1, sh[0]); }
  return p;
}

function cactusSide(seed = 221) {
  const p = P(seed);
  const g = hex(0x3f7a3a);
  p.grain(ramp(g, 4, 0.72, 1.10), 1);
  for (const x of [0, 1, 14, 15]) for (let y = 0; y < N; y++)
    p.set(x, y, shade(g, x === 0 || x === 15 ? 0.52 : 0.68));
  for (const x of [4, 8, 12]) for (let y = 0; y < N; y++) {
    p.set(x, y, shade(g, 0.62)); p.set(x + 1, y, shade(g, 1.14));
  }
  for (let y = 1; y < N; y += 5) for (const x of [2, 6, 10, 14]) {
    p.set(x, y, hex(0xdfe6c0)); p.set(x, y + 1, shade(g, 0.45));
  }
  return p;
}

function plantTex(seed, colors, tall = false) {
  const p = P(seed).clear();
  const [stem, leaf, bloom] = colors;
  for (let y = tall ? 2 : 6; y < N; y++) { p.set(7, y, stem); p.set(8, y, shade(stem, 0.82)); }
  for (const [x, y] of [[5, 8], [10, 9], [4, 11], [11, 12], [6, 13]]) {
    p.set(x, y, leaf); p.set(x + 1, y, shade(leaf, 0.85));
  }
  if (bloom) {
    const pts = [[6, 3], [7, 2], [8, 2], [9, 3], [6, 4], [9, 4], [7, 5], [8, 5], [7, 3], [8, 3], [7, 4], [8, 4]];
    pts.forEach(([x, y], i) => p.set(x, y, i > 7 ? shade(bloom, 1.25) : bloom));
  }
  return p;
}

function tallGrassTex(seed = 231) {
  const p = P(seed).clear();
  const sh = ramp(PAL.grass, 4, 0.62, 1.18);
  for (let i = 0; i < 11; i++) {
    const x = 1 + ((p.rand(i, 3, 2) * 14) | 0);
    const h = 6 + ((p.rand(3, i, 3) * 9) | 0);
    const bend = p.rand(i, i, 4) > 0.5 ? 1 : -1;
    for (let y = 0; y < h; y++) {
      const xx = x + (y > h * 0.6 ? 0 : Math.round((h - y) / 6) * bend);
      p.set(xx, N - 1 - y, sh[Math.min(3, 1 + ((y / h) * 3) | 0)]);
    }
  }
  return p;
}

function mushroomTex(seed, capColor) {
  const p = P(seed).clear();
  const stem = hex(0xe0dcc8);
  for (let y = 8; y < 14; y++) for (let x = 6; x < 10; x++) p.set(x, y, x < 8 ? stem : shade(stem, 0.82));
  for (let y = 3; y < 9; y++) {
    const w = y < 5 ? 4 : y < 7 ? 6 : 5;
    for (let x = 8 - w; x <= 7 + w; x++) p.set(x, y, y === 3 ? shade(capColor, 1.2) : capColor);
  }
  for (const [x, y] of [[5, 5], [10, 6], [7, 4]]) p.set(x, y, hex(0xf2ecd8));
  return p;
}

function woolTex(seed, color) {
  const p = P(seed);
  p.grain(ramp(color, 4, 0.84, 1.10), 1);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++)
      if ((x + y) % 4 === 0 && p.rand(x, y, 5) > 0.4) p.set(x, y, shade(color, 0.86));
  p.pepper(shade(color, 1.16), 0.08, 6);
  return p;
}

function bookshelfTex(seed = 241) {
  const p = planks(seed, PAL.oak);
  p.rect(0, 2, N, 5, shade(PAL.oak, 0.36));
  p.rect(0, 9, N, 5, shade(PAL.oak, 0.36));
  const spines = [hex(0xb5453c), hex(0x3f6bb0), hex(0x4f9a52), hex(0xd0a63f), hex(0x8a4fb0), hex(0xc76a2e)];
  for (const y0 of [2, 9]) {
    let x = 0;
    let i = 0;
    while (x < N) {
      const w = 1 + ((p.rand(x, y0, 3) * 2) | 0);
      const c = spines[(p.rand(x, y0, 4) * spines.length) | 0];
      const h = 4 + (p.rand(x, y0, 6) > 0.6 ? 1 : 0);
      for (let y = y0 + (5 - h); y < y0 + 5; y++)
        for (let xx = x; xx < Math.min(N, x + w); xx++)
          p.set(xx, y, y === y0 + (5 - h) ? shade(c, 1.2) : c);
      x += w + 1; i++;
    }
  }
  return p;
}

function farmlandTex(seed = 251, wet = false) {
  const base = wet ? shade(PAL.dirt, 0.72) : PAL.dirt;
  const p = P(seed);
  p.grain(ramp(base, 4, 0.72, 1.10), 1);
  for (const y of [3, 7, 11]) for (let x = 0; x < N; x++) {
    p.set(x, y, shade(base, 0.56));
    p.set(x, y + 1, shade(base, 1.14));
  }
  if (wet) p.pepper(shade(hex(0x3a2a1a), 1.0), 0.10, 8);
  return p;
}

function wheatTex(seed, stage) {
  const p = P(seed).clear();
  const green = hex(0x6ea83c), gold = hex(0xd9bb4a);
  const c = stage < 2 ? green : stage === 2 ? mix(green, gold, 0.5) : gold;
  const h = 5 + stage * 3;
  for (let i = 0; i < 5; i++) {
    const x = 1 + i * 3 + ((p.rand(i, 1, 3) * 2) | 0);
    for (let y = 0; y < h; y++) p.set(x, N - 1 - y, y > h - 3 ? shade(c, 1.15) : c);
    if (stage >= 2) { p.set(x - 1, N - h, shade(c, 0.85)); p.set(x + 1, N - h + 1, shade(c, 0.85)); }
  }
  return p;
}

function doorTex(seed, top) {
  const p = planks(seed, PAL.oak);
  const dark = shade(PAL.oak, 0.38);
  p.frame(0, 0, N, N, dark);
  p.rect(1, 0, 1, N, shade(PAL.oak, 1.10));
  if (top) {
    p.rect(4, 2, 8, 6, hex(0x2a3242));
    p.frame(3, 1, 10, 8, dark);
    p.rect(7, 1, 2, 8, dark);
    p.rect(3, 4, 10, 2, dark);
  } else {
    p.rect(11, 6, 2, 2, PAL.iron);
    p.set(12, 8, shade(PAL.iron, 0.6));
  }
  return p;
}

// ---- 4D-native materials -----------------------------------------------

function hyperstoneTex(seed = 261) {
  const p = stoneTex(seed, mix(PAL.slate, PAL.hyper, 0.38), 0.08);
  // tesseract lattice etched into the surface: bright edge over a dark groove
  const g = hex(0xd8c4ff), d = hex(0x2a1b46);
  const etch = (fn) => { fn(d, 1); fn(g, 0); };
  etch((c, o) => p.frame(2 + o, 2 + o, 12, 12, c));
  etch((c, o) => p.frame(5 + o, 5 + o, 6, 6, c));
  p.line(2, 2, 5, 5, g); p.line(13, 2, 10, 5, g);
  p.line(2, 13, 5, 10, g); p.line(13, 13, 10, 10, g);
  for (const [x, y] of [[2, 2], [13, 2], [2, 13], [13, 13], [5, 5], [10, 5], [5, 10], [10, 10]])
    p.set(x, y, hex(0xffffff));
  return p;
}

function tesseractOreTex(seed = 263) {
  const base = stoneTex(seed, PAL.stone);
  const p = oreOn(base, [shade(PAL.tess, 1.35), PAL.tess, shade(PAL.tess, 0.72)], seed + 4, 5);
  p.set(4, 4, hex(0xffffff)); p.set(11, 10, hex(0xd8fffa));
  return p;
}

function riftTex(seed = 265) {
  const p = P(seed);
  const sh = ramp(PAL.rift, 5, 0.55, 1.25);
  p.grain(sh, 1);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const d = Math.abs(Math.sin((x - y) * 0.5) + Math.cos((x + y) * 0.4));
      if (d > 1.5) p.set(x, y, mix(PAL.hyper, PAL.tess, (x * 7 + y * 3) % 16 / 16));
    }
  p.pepper(hex(0xe6d8ff), 0.05, 9);
  return p;
}

function phaseAnchorTex(seed = 267) {
  const p = stoneTex(seed, PAL.slate);
  const g = PAL.tess;
  p.frame(1, 1, 14, 14, shade(PAL.slate, 0.5));
  p.rect(6, 2, 4, 12, shade(PAL.slate, 0.62));
  p.rect(2, 6, 12, 4, shade(PAL.slate, 0.62));
  p.rect(6, 6, 4, 4, g);
  p.frame(6, 6, 4, 4, shade(g, 1.4));
  p.set(7, 7, hex(0xffffff));
  for (const [x, y] of [[3, 3], [12, 3], [3, 12], [12, 12]]) p.set(x, y, shade(g, 1.2));
  return p;
}

function lumenTex(seed = 271) {
  const p = P(seed);
  const sh = ramp(PAL.lumen, 5, 0.66, 1.16);
  p.grain(sh, 1);
  for (let i = 0; i < 14; i++) {
    const cx = (p.rand(i, 5, 2) * N) | 0, cy = (p.rand(5, i, 3) * N) | 0;
    p.set(cx, cy, hex(0xfff6cf));
    p.set(cx + 1, cy, shade(PAL.lumen, 1.25));
    p.set(cx, cy + 1, shade(PAL.lumen, 1.15));
  }
  return p;
}

function emberTex(seed = 273) {
  const p = P(seed);
  p.grain(ramp(PAL.ember, 5, 0.60, 1.18), 1);
  p.pepper(hex(0x2a1010), 0.14, 4);
  p.pepper(hex(0xff8a3c), 0.05, 6);
  return p;
}

function chromaClayTex(seed = 275) {
  const p = P(seed);
  const bands = [hex(0xc07a4a), hex(0xa8613c), hex(0xd6a05c), hex(0x8d4f38), hex(0xe0bd7a)];
  for (let y = 0; y < N; y++) {
    const c = bands[Math.floor((y + Math.sin(y * 0.8) * 1.4) / 3) % bands.length];
    for (let x = 0; x < N; x++) p.set(x, y, p.rand(x, y, 3) > 0.75 ? shade(c, 0.88) : c);
  }
  return p;
}

function bedrockTex(seed = 277) {
  const p = P(seed);
  const sh = ramp(hex(0x2b2b33), 5, 0.5, 1.5);
  p.grain(sh, 1);
  p.pepper(hex(0x0a0a0e), 0.22, 3);
  p.pepper(hex(0x5a5a6a), 0.10, 4);
  return p;
}

function obsidianTex(seed = 279) {
  const p = P(seed);
  p.grain(ramp(PAL.obsidian, 4, 0.68, 1.5), 1);
  for (let i = 0; i < 5; i++) {
    const x = (p.rand(i, 2, 7) * N) | 0, y = (p.rand(2, i, 8) * N) | 0;
    p.set(x, y, hex(0x6a4fa0)); p.set(x + 1, y + 1, hex(0x4a3070));
  }
  return p;
}

function mossyCobble(seed = 281) {
  const p = cobbleTex(seed, PAL.stone);
  p.blotch(hex(0x4a7a3a), 4, 1.7, 3);
  p.pepper(hex(0x5d8a4c), 0.16, 6);
  p.pepper(hex(0x76a862), 0.07, 8);
  return p;
}

function darkPrismTex(seed = 283) {
  const p = P(seed);
  const base = hex(0x2f4a52);
  p.grain(ramp(base, 4, 0.72, 1.14), 1);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++)
      if ((x >> 2) % 2 === (y >> 2) % 2) p.set(x, y, shade(p.get(x, y), 1.16));
  p.frame(0, 0, N, N, shade(base, 0.6));
  p.pepper(hex(0x7fd8c8), 0.05, 5);
  return p;
}

function lanternTex(seed = 285) {
  const p = P(seed).clear();
  const metal = ramp(hex(0x5a4a3a), 3, 0.7, 1.1);
  p.frame(4, 2, 8, 12, metal[0]);
  p.rect(5, 3, 6, 10, hex(0xffdc8a));
  p.rect(6, 4, 4, 8, hex(0xfff2c4));
  for (let y = 3; y < 13; y += 3) for (let x = 5; x < 11; x++) p.set(x, y, metal[2]);
  p.rect(6, 0, 4, 2, metal[1]);
  return p;
}

// ---- registry -----------------------------------------------------------

export function buildBlockTextures() {
  const T = {};
  const add = (name, painter) => { T[name] = painter; };

  add('stone', stoneTex(11));
  add('cobblestone', cobbleTex(21));
  add('mossy_cobblestone', mossyCobble());
  add('stone_bricks', stoneBricks(121, PAL.stone, false));
  add('cracked_stone_bricks', stoneBricks(123, PAL.stone, true));
  add('slate', stoneTex(13, PAL.slate, 0.12));
  add('marble', stoneTex(15, PAL.marble, 0.06));
  add('bedrock', bedrockTex());
  add('dirt', dirtTex());
  add('grass_top', grassTop());
  add('grass_side', grassSide());
  add('grass_side_snow', snowSide());
  add('sand', sandTex());
  add('sandstone_top', sandTex(62, PAL.sandstone));
  add('sandstone_side', sandstoneSide());
  add('gravel', gravelTex());
  add('clay', stoneTex(17, PAL.clay, 0.05));
  add('snow', (() => { const p = P(301); p.grain(ramp(PAL.snow, 3, 0.9, 1.04), 1); return p; })());
  add('ice', iceTex());
  add('water', waterTex());
  add('lava', lavaTex());
  add('obsidian', obsidianTex());
  add('chroma_clay', chromaClayTex());

  add('oak_log_side', logSide(81, PAL.oak));
  add('oak_log_top', logTop(83, PAL.oak));
  add('oak_planks', planks(91, PAL.oak));
  add('oak_leaves', leaves(101, PAL.leafOak));
  add('pine_log_side', logSide(85, PAL.pine));
  add('pine_log_top', logTop(87, PAL.pine));
  add('pine_planks', planks(93, PAL.pine));
  add('pine_leaves', leaves(103, PAL.leafPine));
  add('birch_log_side', (() => {
    const p = P(89);
    p.grain(ramp(PAL.birch, 4, 0.86, 1.08), 1);
    for (let i = 0; i < 7; i++) {
      const y = (p.rand(i, 2, 5) * N) | 0, x = (p.rand(2, i, 6) * N) | 0, w = 2 + ((p.rand(i, i, 7) * 3) | 0);
      for (let k = 0; k < w; k++) p.set(x + k, y, hex(0x3a3428));
    }
    return p;
  })());
  add('birch_log_top', logTop(95, PAL.birch));
  add('birch_planks', planks(97, PAL.birch));
  add('birch_leaves', leaves(105, PAL.leafBirch));

  add('brick', brickTex());
  add('glass', glassTex());
  add('hyperglass', glassTex(133, mix(PAL.tess, hex(0xffffff), 0.4), 70));

  const stoneBase = stoneTex(19);
  add('coal_ore', oreOn(stoneBase, [shade(PAL.coal, 1.6), PAL.coal, hex(0x0d0b0e)], 401, 6));
  add('iron_ore', oreOn(stoneBase, [hex(0xf0d8bc), hex(0xc39a76), hex(0x8d6b50)], 403, 6));
  add('gold_ore', oreOn(stoneBase, [hex(0xfff0a0), PAL.gold, hex(0xb98f22)], 405, 5));
  add('diamond_ore', oreOn(stoneBase, [hex(0xd6fffb), PAL.diamond, hex(0x2f9d98)], 407, 5));
  add('azure_ore', oreOn(stoneBase, [hex(0x7ea0ff), PAL.azure, hex(0x1a3183)], 409, 6));
  add('pulse_ore', oreOn(stoneBase, [hex(0xff7d80), PAL.pulse, hex(0x8b1219)], 411, 7));
  add('hyper_ore', oreOn(stoneBase, [hex(0xd2bcff), PAL.hyper, hex(0x4d2f92)], 413, 5));
  add('tesseract_ore', tesseractOreTex());
  add('hyperstone', hyperstoneTex());
  add('rift_block', riftTex());
  add('phase_anchor', phaseAnchorTex());
  add('lumen', lumenTex());
  add('emberstone', emberTex());
  add('dark_prism', darkPrismTex());
  add('lantern', lanternTex());

  add('crafting_table_top', craftingTop());
  add('crafting_table_side', craftingSide(183, false));
  add('crafting_table_front', craftingSide(185, true));
  add('furnace_front', furnaceFront(191, false));
  add('furnace_front_lit', furnaceFront(193, true));
  add('furnace_side', cobbleTex(195, PAL.stone));
  add('furnace_top', (() => {
    const p = cobbleTex(197, PAL.stone);
    p.rect(4, 4, 8, 8, shade(PAL.stone, 0.45));
    p.frame(4, 4, 8, 8, shade(PAL.stone, 0.68));
    return p;
  })());
  add('chest_front', chestTex(201, 'front'));
  add('chest_side', chestTex(203, 'side'));
  add('chest_top', chestTex(205, 'top'));
  add('hyperchest_front', chestTex(207, 'front', PAL.tess, mix(PAL.oak, PAL.hyper, 0.55)));
  add('hyperchest_side', chestTex(209, 'side', PAL.tess, mix(PAL.oak, PAL.hyper, 0.55)));
  add('hyperchest_top', chestTex(210, 'top', PAL.tess, mix(PAL.oak, PAL.hyper, 0.55)));
  add('bookshelf', bookshelfTex());

  add('torch', torchTex());
  add('ladder', ladderTex());
  add('cactus_side', cactusSide());
  add('cactus_top', (() => { const p = cactusSide(223); p.rect(2, 2, 12, 12, hex(0x4f8f46)); p.pepper(hex(0x6fae55), 0.2, 4); return p; })());
  add('tall_grass', tallGrassTex());
  add('flower_red', plantTex(311, [hex(0x3f7a3a), hex(0x4f9a4a), hex(0xd9403a)]));
  add('flower_yellow', plantTex(313, [hex(0x3f7a3a), hex(0x4f9a4a), hex(0xf0cf3a)]));
  add('flower_violet', plantTex(315, [hex(0x3f7a3a), hex(0x4f9a4a), PAL.hyper]));
  add('mushroom_red', mushroomTex(317, hex(0xc0392b)));
  add('mushroom_brown', mushroomTex(319, hex(0x9a6b3f)));

  const WOOLS = {
    white: hex(0xe8e8ee), red: hex(0xb03a34), orange: hex(0xd97a2c), yellow: hex(0xe0c33c),
    green: hex(0x4f8a3a), blue: hex(0x3a5aa8), purple: hex(0x7a4aa0), black: hex(0x2a2a30),
    cyan: hex(0x3f9aa0), pink: hex(0xd88aa8),
  };
  for (const [k, c] of Object.entries(WOOLS)) add(`wool_${k}`, woolTex(331 + k.length, c));

  // destruction stages, drawn as an overlay on the block being mined
  for (let st = 0; st < 10; st++) {
    const p = P(900 + st).clear();
    const c = hex(0x0d0b12);
    const density = (st + 1) / 10;
    const seeds = [[8, 8], [4, 3], [12, 5], [3, 11], [11, 12], [7, 1], [1, 7], [14, 9], [6, 14]];
    const branches = Math.max(1, Math.round(density * seeds.length));
    for (let i = 0; i < branches; i++) {
      let [x, y] = seeds[i];
      const len = 3 + Math.round(density * 9);
      for (let k = 0; k < len; k++) {
        p.set(x, y, c, 235);
        if (density > 0.55) p.set(x + 1, y, c, 120);
        const r = ihashLocal(x, y, i, st);
        x += (r & 3) === 0 ? -1 : (r & 3) === 1 ? 1 : 0;
        y += ((r >> 2) & 3) === 0 ? -1 : ((r >> 2) & 3) === 1 ? 1 : 1;
        if (x < 0 || x > 15 || y < 0 || y > 15) break;
      }
    }
    add(`crack_${st}`, p);
  }

  add('farmland', farmlandTex(251, false));
  add('farmland_wet', farmlandTex(253, true));
  for (let s = 0; s < 4; s++) add(`wheat_${s}`, wheatTex(261 + s, s));
  add('door_top', doorTex(291, true));
  add('door_bottom', doorTex(293, false));

  return T;
}
