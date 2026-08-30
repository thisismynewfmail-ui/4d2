// 4D-MC :: item icon synthesis -------------------------------------------
// Icons are drawn as small silhouettes and then auto-outlined, which is what
// gives them the crisp, readable look of hand-pixelled inventory art.

import { Painter, TEX_SIZE as N, hex, mix, shade, ramp } from './painter.js';
import { PAL } from './blockTextures.js';

const P = (seed) => new Painter(N, seed);

/** Add a 1px dark rim around every opaque cluster. */
function outline(p, color = [12, 10, 16], alpha = 255) {
  const src = new Uint8ClampedArray(p.data);
  const at = (x, y) => (x < 0 || y < 0 || x >= N || y >= N) ? 0 : src[(y * N + x) * 4 + 3];
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      if (at(x, y) > 0) continue;
      if (at(x - 1, y) > 80 || at(x + 1, y) > 80 || at(x, y - 1) > 80 || at(x, y + 1) > 80)
        p.set(x, y, color, alpha);
    }
  return p;
}

/** Fake a light source at the upper-left of an already-filled silhouette. */
function shadeSilhouette(p, base) {
  const lit = shade(base, 1.26), dark = shade(base, 0.70), mid = base;
  const src = new Uint8ClampedArray(p.data);
  const solid = (x, y) => (x < 0 || y < 0 || x >= N || y >= N) ? false : src[(y * N + x) * 4 + 3] > 0;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      if (!solid(x, y)) continue;
      if (!solid(x - 1, y) || !solid(x, y - 1)) p.set(x, y, lit);
      else if (!solid(x + 1, y) || !solid(x, y + 1)) p.set(x, y, dark);
      else p.set(x, y, mid);
    }
  return p;
}

const HANDLE = [hex(0x6b4b2c), hex(0x9a7448), hex(0x4a3320)];

function drawHandle(p, x0 = 3, y0 = 14, len = 9) {
  for (let i = 0; i < len; i++) {
    p.set(x0 + i, y0 - i, HANDLE[0]);
    p.set(x0 + i + 1, y0 - i, HANDLE[1]);
    if (i > 0) p.set(x0 + i, y0 - i + 1, HANDLE[2]);
  }
}

const MATERIALS = {
  wood:    hex(0x9a7448),
  stone:   hex(0x8f929c),
  iron:    hex(0xd8d6d0),
  gold:    hex(0xf3c944),
  diamond: hex(0x64ded6),
  hyper:   hex(0x9c76ef),
};

function toolIcon(seed, kind, matName) {
  const base = MATERIALS[matName];
  const p = P(seed).clear();
  const sh = ramp(base, 4, 0.68, 1.24);
  const put = (x, y, t = 2) => p.set(x, y, sh[t]);

  if (kind === 'sword') {
    // blade from lower-left hilt to upper-right point
    for (let i = 0; i < 10; i++) { put(4 + i, 12 - i, 2); put(5 + i, 12 - i, 3); put(4 + i, 13 - i, 1); }
    put(14, 1, 3); put(13, 1, 3); put(14, 2, 2);
    // cross guard
    for (let i = 0; i < 5; i++) p.set(2 + i, 13 - i + (i > 2 ? 0 : 0), HANDLE[1]);
    p.set(2, 11, HANDLE[0]); p.set(3, 12, HANDLE[0]); p.set(5, 14, HANDLE[0]);
    p.set(1, 14, HANDLE[0]); p.set(2, 14, HANDLE[1]); p.set(2, 15, HANDLE[2]);
    p.set(1, 13, HANDLE[1]); p.set(3, 14, HANDLE[2]);
    return outline(p);
  }

  drawHandle(p);
  if (kind === 'pickaxe') {
    const arc = [[4, 6], [5, 5], [6, 4], [7, 3], [9, 2], [11, 2], [13, 3], [14, 4], [15, 5]];
    arc.forEach(([x, y], i) => { put(x, y, i < 2 || i > 6 ? 1 : 3); put(x, y + 1, 2); });
    put(3, 7, 1); put(15, 6, 1);
  } else if (kind === 'axe') {
    for (let y = 2; y <= 8; y++) {
      const w = 5 - Math.abs(y - 5);
      for (let x = 9; x < 9 + w + 2; x++) put(x, y, x === 9 ? 3 : x > 12 ? 1 : 2);
    }
    put(9, 4, 3); put(10, 3, 3);
  } else if (kind === 'shovel') {
    for (let y = 1; y <= 6; y++)
      for (let x = 9; x <= 13; x++) {
        if ((y === 1 || y === 6) && (x === 9 || x === 13)) continue;
        put(x, y, y === 1 ? 3 : y === 6 ? 1 : 2);
      }
  } else if (kind === 'hoe') {
    for (let x = 9; x <= 14; x++) put(x, 2, x < 11 ? 3 : 2);
    for (let x = 9; x <= 14; x++) put(x, 3, 1);
    put(9, 4, 2); put(9, 5, 1);
  }
  return outline(p);
}

function armorIcon(seed, piece, matName) {
  const base = MATERIALS[matName] || hex(0x8a5f3c);
  const p = P(seed).clear();
  const draw = (cells) => cells.forEach(([x, y, w, h]) => p.rect(x, y, w, h, base));
  if (piece === 'helmet') draw([[4, 3, 8, 3], [3, 4, 10, 5], [3, 9, 3, 3], [10, 9, 3, 3]]);
  if (piece === 'chestplate') draw([[3, 3, 10, 3], [2, 4, 3, 7], [11, 4, 3, 7], [5, 5, 6, 8]]);
  if (piece === 'leggings') draw([[3, 2, 10, 4], [3, 6, 4, 8], [9, 6, 4, 8]]);
  if (piece === 'boots') draw([[3, 5, 4, 6], [9, 5, 4, 6], [2, 11, 6, 3], [8, 11, 6, 3]]);
  shadeSilhouette(p, base);
  return outline(p);
}

function blob(p, cells, color) { cells.forEach(([x, y]) => p.set(x, y, color)); return p; }

function roundIcon(seed, color, r = 5, detail) {
  const p = P(seed).clear();
  const cx = 7.5, cy = 8;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d <= r + p.rand(x, y, 3) * 0.6) p.set(x, y, color);
    }
  shadeSilhouette(p, color);
  detail?.(p);
  return outline(p);
}

function gemIcon(seed, color) {
  const p = P(seed).clear();
  const cells = [
    [7, 2], [8, 2], [5, 3], [6, 3], [7, 3], [8, 3], [9, 3], [10, 3],
    [4, 4], [5, 4], [6, 4], [7, 4], [8, 4], [9, 4], [10, 4], [11, 4],
    [4, 5], [5, 5], [6, 5], [7, 5], [8, 5], [9, 5], [10, 5], [11, 5],
    [4, 6], [5, 6], [6, 6], [7, 6], [8, 6], [9, 6], [10, 6], [11, 6],
    [5, 7], [6, 7], [7, 7], [8, 7], [9, 7], [10, 7],
    [5, 8], [6, 8], [7, 8], [8, 8], [9, 8], [10, 8],
    [6, 9], [7, 9], [8, 9], [9, 9], [7, 10], [8, 10],
  ];
  blob(p, cells, color);
  shadeSilhouette(p, color);
  blob(p, [[6, 4], [7, 4], [6, 5]], shade(color, 1.5));
  return outline(p);
}

function ingotIcon(seed, color) {
  const p = P(seed).clear();
  for (let y = 5; y <= 10; y++) {
    const inset = y <= 6 ? 3 : y >= 9 ? 1 : 2;
    for (let x = inset; x < N - inset; x++) p.set(x, y, color);
  }
  shadeSilhouette(p, color);
  for (let x = 4; x < 10; x++) p.set(x, 6, shade(color, 1.45));
  return outline(p);
}

function dustIcon(seed, color) {
  const p = P(seed).clear();
  for (let i = 0; i < 34; i++) {
    const x = 3 + ((p.rand(i, 1, 2) * 10) | 0);
    const y = 4 + ((p.rand(1, i, 3) * 9) | 0);
    p.set(x, y, p.rand(x, y, 4) > 0.6 ? shade(color, 1.3) : color);
  }
  return outline(p);
}

function stickIcon(seed = 601) {
  const p = P(seed).clear();
  for (let i = 0; i < 10; i++) {
    p.set(4 + i, 12 - i, HANDLE[0]);
    p.set(5 + i, 12 - i, HANDLE[1]);
  }
  return outline(p);
}

function foodIcon(seed, kind) {
  const p = P(seed).clear();
  if (kind === 'apple') {
    roundIconInto(p, hex(0xc0392b), 5);
    p.set(8, 2, hex(0x6b4b2c)); p.set(8, 3, hex(0x6b4b2c));
    p.set(9, 2, hex(0x4f9a4a)); p.set(10, 2, hex(0x4f9a4a)); p.set(10, 1, hex(0x4f9a4a));
    return outline(p);
  }
  if (kind === 'bread') {
    for (let y = 5; y <= 11; y++) {
      const inset = y === 5 || y === 11 ? 3 : 2;
      for (let x = inset; x < N - inset; x++) p.set(x, y, hex(0xc08c46));
    }
    shadeSilhouette(p, hex(0xc08c46));
    for (const [x, y] of [[5, 6], [8, 6], [11, 7], [6, 9], [9, 9]]) p.set(x, y, hex(0xe0b070));
    return outline(p);
  }
  if (kind === 'meat_raw' || kind === 'meat_cooked' || kind === 'meat_raw_beef') {
    const c = kind === 'meat_raw' ? hex(0xe08a90)
            : kind === 'meat_raw_beef' ? hex(0xa8484e) : hex(0xa8622f);
    for (let y = 4; y <= 12; y++)
      for (let x = 3; x <= 12; x++) {
        const d = Math.hypot((x - 7.5) / 5, (y - 8) / 4.5);
        if (d < 1) p.set(x, y, c);
      }
    shadeSilhouette(p, c);
    for (const [x, y] of [[6, 6], [9, 8], [7, 10]]) p.set(x, y, shade(c, 1.28));
    p.rect(11, 10, 2, 3, hex(0xf0e8d0));
    return outline(p);
  }
  if (kind === 'wheat') {
    const g = hex(0xd9bb4a);
    for (let y = 2; y < 14; y++) { p.set(7, y, hex(0x8a7a30)); }
    for (let i = 0; i < 5; i++) {
      const y = 3 + i * 2;
      p.set(5, y, g); p.set(6, y, shade(g, 1.2)); p.set(8, y, shade(g, 1.2)); p.set(9, y, g);
    }
    return outline(p);
  }
  if (kind === 'seeds') {
    for (const [x, y] of [[5, 6], [8, 5], [10, 8], [6, 10], [9, 11], [7, 8]]) {
      p.set(x, y, hex(0x9aa84a)); p.set(x + 1, y, hex(0x7a8a34)); p.set(x, y + 1, hex(0x6a7a2c));
    }
    return outline(p);
  }
  return p;
}

function roundIconInto(p, color, r) {
  const cx = 7.5, cy = 8.5;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++)
      if (Math.hypot(x - cx, y - cy) <= r) p.set(x, y, color);
  shadeSilhouette(p, color);
  return p;
}

function tesseractShardIcon(seed = 701) {
  const p = P(seed).clear();
  const c = PAL.tess, g = shade(c, 1.4), d = shade(c, 0.6);
  const outer = [[7, 1], [8, 1], [4, 3], [11, 3], [3, 7], [12, 7], [4, 11], [11, 11], [7, 14], [8, 14]];
  // outer octahedral silhouette
  for (let y = 1; y < 15; y++) {
    const half = Math.round(6 - Math.abs(y - 7.5) * 0.72);
    for (let x = 7 - half; x <= 8 + half; x++) if (half > 0) p.set(x, y, c);
  }
  shadeSilhouette(p, c);
  // inner cube edges — the tesseract signature
  p.frame(5, 5, 6, 6, g, 255);
  p.frame(3, 3, 10, 10, d, 200);
  p.line(3, 3, 5, 5, g); p.line(12, 3, 10, 5, g);
  p.line(3, 12, 5, 10, g); p.line(12, 12, 10, 10, g);
  outer.forEach(([x, y]) => p.set(x, y, g));
  return outline(p);
}

function lensIcon(seed = 703) {
  const p = P(seed).clear();
  const frame = hex(0x3a3f52);
  p.frame(1, 5, 6, 6, frame); p.frame(9, 5, 6, 6, frame);
  p.rect(7, 7, 2, 1, frame);
  p.rect(2, 6, 4, 4, mix(PAL.tess, hex(0x000000), 0.25));
  p.rect(10, 6, 4, 4, mix(PAL.hyper, hex(0x000000), 0.25));
  p.set(3, 7, hex(0xd8fffa)); p.set(11, 7, hex(0xe8dcff));
  return outline(p);
}

function compassIcon(seed = 705) {
  const p = P(seed).clear();
  roundIconInto(p, hex(0x4a4f62), 6);
  roundIconInto(p, hex(0x22252f), 4);
  p.line(8, 4, 8, 11, PAL.pulse);
  p.set(8, 4, hex(0xff9a9a));
  p.line(7, 11, 9, 11, hex(0xd8d8e4));
  p.set(4, 8, hex(0x8a8fa4)); p.set(12, 8, hex(0x8a8fa4));
  return outline(p);
}

function rodIcon(seed = 707) {
  const p = P(seed).clear();
  for (let i = 0; i < 11; i++) { p.set(3 + i, 12 - i, hex(0x6a6f84)); p.set(4 + i, 12 - i, hex(0x9aa0b8)); }
  p.rect(11, 1, 4, 4, PAL.tess);
  p.frame(11, 1, 4, 4, shade(PAL.tess, 1.4));
  p.set(12, 2, hex(0xffffff));
  return outline(p);
}

function mapIcon(seed = 709) {
  const p = P(seed).clear();
  p.rect(2, 3, 12, 10, hex(0xe4dcc0));
  p.frame(2, 3, 12, 10, hex(0x8a7a56));
  for (let i = 0; i < 5; i++) p.line(4, 5 + i * 2, 12 - (i % 2) * 3, 5 + i * 2, hex(0xb8a880));
  p.set(9, 8, PAL.pulse); p.set(9, 7, PAL.pulse);
  return outline(p);
}

function bucketIcon(seed, fill) {
  const p = P(seed).clear();
  const metal = hex(0xb8bcc8);
  for (let y = 5; y <= 13; y++) {
    const inset = 3 + Math.floor((y - 5) / 5);
    for (let x = inset; x < N - inset; x++) p.set(x, y, metal);
  }
  shadeSilhouette(p, metal);
  if (fill) p.rect(4, 6, 8, 5, fill);
  p.line(4, 5, 7, 3, metal); p.line(8, 3, 11, 5, metal);
  return outline(p);
}

function paperIcon(seed = 711) {
  const p = P(seed).clear();
  p.rect(3, 2, 10, 12, hex(0xeeeadc));
  shadeSilhouette(p, hex(0xeeeadc));
  for (let i = 0; i < 4; i++) p.line(5, 5 + i * 2, 11, 5 + i * 2, hex(0xb8b4a4));
  return outline(p);
}

function bookIcon(seed = 713) {
  const p = P(seed).clear();
  p.rect(3, 3, 10, 11, hex(0x8a4a3a));
  p.rect(4, 3, 1, 11, hex(0x6a3428));
  p.rect(6, 4, 7, 9, hex(0xeeeadc));
  shadeSilhouette(p, hex(0x8a4a3a));
  p.rect(6, 4, 7, 9, hex(0xeeeadc));
  for (let i = 0; i < 3; i++) p.line(7, 6 + i * 2, 11, 6 + i * 2, hex(0xb8b4a4));
  return outline(p);
}

function boneIcon(seed = 715) {
  const p = P(seed).clear();
  const c = hex(0xe8e4d4);
  for (let i = 0; i < 8; i++) { p.set(4 + i, 11 - i, c); p.set(5 + i, 11 - i, c); }
  p.rect(2, 10, 3, 3, c); p.rect(11, 3, 3, 3, c);
  shadeSilhouette(p, c);
  return outline(p);
}

function featherIcon(seed = 717) {
  const p = P(seed).clear();
  const c = hex(0xf0f0f6);
  for (let i = 0; i < 12; i++) p.set(3 + i, 13 - i, hex(0xc0c0cc));
  for (let i = 2; i < 10; i++) {
    const w = Math.max(1, 4 - Math.abs(i - 6));
    for (let k = 1; k <= w; k++) p.set(3 + i - k, 13 - i - k + 1, c);
  }
  return outline(p);
}

function stringIcon(seed = 719) {
  const p = P(seed).clear();
  const c = hex(0xe0e0e8);
  const pts = [[3, 3], [4, 4], [5, 5], [6, 6], [7, 7], [8, 8], [9, 9], [10, 10], [11, 11], [12, 12],
    [4, 2], [6, 3], [9, 4], [11, 6], [12, 9], [10, 12], [7, 13], [4, 12], [3, 9], [3, 6]];
  blob(p, pts, c);
  return outline(p);
}

function eggIcon(seed = 721) {
  const p = P(seed).clear();
  const c = hex(0xf0e4d0);
  for (let y = 3; y <= 13; y++) {
    const half = Math.round(4 * Math.sin(((y - 2) / 12) * Math.PI) + (y > 8 ? 0.6 : 0));
    for (let x = 8 - half; x <= 7 + half; x++) p.set(x, y, c);
  }
  shadeSilhouette(p, c);
  return outline(p);
}

export function buildItemTextures() {
  const T = {};
  const add = (n, p) => { T[n] = p; };

  add('stick', stickIcon());
  add('coal', roundIcon(603, hex(0x24202a), 4.6));
  add('charcoal', roundIcon(605, hex(0x3a3038), 4.6));
  add('iron_ingot', ingotIcon(607, PAL.iron));
  add('gold_ingot', ingotIcon(609, PAL.gold));
  add('diamond', gemIcon(611, PAL.diamond));
  add('azure_dust', dustIcon(613, PAL.azure));
  add('pulse_dust', dustIcon(615, PAL.pulse));
  add('hyper_shard', gemIcon(617, PAL.hyper));
  add('tesseract_shard', tesseractShardIcon());
  add('clay_ball', roundIcon(619, PAL.clay, 4.4));
  add('brick_item', (() => {
    const p = P(621).clear();
    p.rect(3, 5, 10, 6, PAL.brick);
    shadeSilhouette(p, PAL.brick);
    p.line(3, 8, 12, 8, shade(PAL.brick, 0.7));
    return outline(p);
  })());
  add('flint', (() => {
    const p = P(623).clear();
    blob(p, [[5, 5], [6, 4], [7, 4], [8, 5], [9, 5], [10, 6], [10, 7], [9, 8], [10, 9], [9, 10],
      [8, 11], [7, 11], [6, 10], [5, 9], [4, 8], [4, 7], [5, 6], [6, 5], [7, 5], [8, 6], [7, 6],
      [6, 6], [6, 7], [7, 7], [8, 7], [9, 7], [5, 8], [6, 8], [7, 8], [8, 8], [9, 9], [6, 9],
      [7, 9], [8, 9], [7, 10]], hex(0x4a4650));
    shadeSilhouette(p, hex(0x4a4650));
    return outline(p);
  })());
  add('gunpowder', dustIcon(625, hex(0x5a5a62)));
  add('leather', (() => {
    const p = P(627).clear();
    p.rect(3, 4, 10, 9, hex(0xa06a3c));
    shadeSilhouette(p, hex(0xa06a3c));
    p.pepper(hex(0x8a5630), 0.15, 3);
    return outline(p);
  })());
  add('paper', paperIcon());
  add('book', bookIcon());
  add('bone', boneIcon());
  add('feather', featherIcon());
  add('string', stringIcon());
  add('egg', eggIcon());
  add('apple', foodIcon(631, 'apple'));
  add('bread', foodIcon(633, 'bread'));
  add('wheat', foodIcon(635, 'wheat'));
  add('seeds', foodIcon(637, 'seeds'));
  add('raw_porkchop', foodIcon(639, 'meat_raw'));
  add('cooked_porkchop', foodIcon(641, 'meat_cooked'));
  add('raw_beef', foodIcon(643, 'meat_raw_beef'));
  add('steak', foodIcon(645, 'meat_cooked'));
  add('raw_chicken', foodIcon(647, 'meat_raw'));
  add('cooked_chicken', foodIcon(649, 'meat_cooked'));
  add('bucket', bucketIcon(651, null));
  add('water_bucket', bucketIcon(653, PAL.water));
  add('lava_bucket', bucketIcon(655, PAL.lava));
  add('slice_map', mapIcon());
  add('phase_lens', lensIcon());
  add('rift_compass', compassIcon());
  add('anchor_rod', rodIcon());

  let s = 800;
  for (const mat of Object.keys(MATERIALS))
    for (const kind of ['pickaxe', 'axe', 'shovel', 'sword', 'hoe'])
      add(`${mat}_${kind}`, toolIcon(s++, kind, mat));

  for (const mat of ['leather', 'iron', 'diamond', 'hyper'])
    for (const piece of ['helmet', 'chestplate', 'leggings', 'boots'])
      add(`${mat}_${piece}`, armorIcon(s++, piece, mat === 'leather' ? undefined : mat));

  return T;
}
