// 4D-MC :: mob & NPC skin synthesis --------------------------------------
// Each creature gets a body tile and a face tile. Faces are drawn with a
// deliberately flat, chunky eye style so they read at any distance.

import { Painter, TEX_SIZE as N, hex, mix, shade, ramp } from './painter.js';

const P = (s) => new Painter(N, s);

function body(seed, base, opts = {}) {
  const p = P(seed);
  const sh = ramp(base, opts.shades || 4, opts.lo ?? 0.76, opts.hi ?? 1.10);
  p.grain(sh, 1);
  if (opts.spots) p.blotch(shade(base, opts.spotF ?? 0.62), opts.spots, 3.0, 5);
  if (opts.stripes) {
    for (let y = 0; y < N; y++)
      if ((y >> 1) % 2 === 0) for (let x = 0; x < N; x++) p.set(x, y, shade(p.get(x, y), 0.86));
  }
  if (opts.scales) {
    for (let y = 0; y < N; y += 3)
      for (let x = ((y / 3) % 2) * 2; x < N; x += 4) {
        p.set(x, y, shade(base, 1.16)); p.set(x + 1, y, shade(base, 1.16));
        p.set(x, y + 1, shade(base, 0.8));
      }
  }
  if (opts.lattice) {
    const g = opts.latticeColor || hex(0xffffff);
    p.frame(1, 1, 14, 14, g, 120);
    p.frame(4, 4, 8, 8, g, 170);
    p.line(1, 1, 4, 4, g, 120); p.line(14, 1, 11, 4, g, 120);
    p.line(1, 14, 4, 11, g, 120); p.line(14, 14, 11, 11, g, 120);
  }
  if (opts.tatters) p.pepper(shade(base, 0.5), 0.14, 9);
  if (opts.glow) p.pepper(opts.glow, 0.06, 11);
  return p;
}

function face(seed, base, opts = {}) {
  const p = body(seed, base, opts);
  const eye = opts.eye || hex(0x18141c);
  const pupil = opts.pupil || hex(0xffffff);
  const ex = opts.eyeX ?? 3, ey = opts.eyeY ?? 6, ew = opts.eyeW ?? 3, eh = opts.eyeH ?? 2;
  if (opts.eyes !== false) {
    p.rect(ex, ey, ew, eh, eye);
    p.rect(N - ex - ew, ey, ew, eh, eye);
    if (opts.glowEyes) {
      p.rect(ex, ey, ew, eh, opts.glowEyes);
      p.rect(N - ex - ew, ey, ew, eh, opts.glowEyes);
      p.set(ex + 1, ey, hex(0xffffff)); p.set(N - ex - ew + 1, ey, hex(0xffffff));
    } else if (opts.pupils !== false) {
      p.set(ex + ew - 1, ey + eh - 1, pupil);
      p.set(N - ex - 1, ey + eh - 1, pupil);
    }
  }
  const m = opts.mouth;
  if (m === 'line') p.rect(5, 11, 6, 1, hex(0x18141c));
  else if (m === 'grin') { p.rect(4, 11, 8, 1, hex(0x18141c)); p.set(4, 10, hex(0x18141c)); p.set(11, 10, hex(0x18141c)); }
  else if (m === 'fangs') {
    p.rect(4, 10, 8, 2, hex(0x120f16));
    for (let x = 5; x < 11; x += 2) p.set(x, 11, hex(0xe8e4d4));
  } else if (m === 'snout') {
    p.rect(5, 9, 6, 4, shade(base, 0.78));
    p.set(6, 10, hex(0x2a1f24)); p.set(9, 10, hex(0x2a1f24));
  } else if (m === 'beak') {
    p.rect(6, 9, 4, 3, hex(0xe0a032));
    p.set(6, 11, hex(0xb87a20)); p.set(9, 11, hex(0xb87a20));
  } else if (m === 'void') {
    p.rect(5, 9, 6, 4, hex(0x08060c));
    p.rect(6, 10, 4, 2, opts.glowEyes || hex(0x4fe5d7));
  } else if (m === 'beard') {
    p.rect(4, 11, 8, 4, shade(opts.beardColor || hex(0x6a4a30), 1.0));
    p.rect(6, 10, 4, 1, shade(opts.beardColor || hex(0x6a4a30), 1.1));
  }
  if (opts.brow) { p.rect(3, 5, 4, 1, opts.brow); p.rect(9, 5, 4, 1, opts.brow); }
  return p;
}

export function buildMobTextures() {
  const T = {};
  const add = (n, p) => { T[n] = p; };

  const skins = {
    // --- passive 3D natives
    pig:        { c: hex(0xe0a0a8), face: { mouth: 'snout', eyeY: 5, eyeW: 2 } },
    cow:        { c: hex(0x4a3a30), body: { spots: 4, spotF: 2.4 }, face: { mouth: 'snout', brow: hex(0xf0ece0) } },
    sheep:      { c: hex(0xe8e4dc), body: { shades: 3, lo: 0.9 }, face: { mouth: 'line', eyeY: 6 } },
    chicken:    { c: hex(0xf0eee6), face: { mouth: 'beak', eyeW: 2, eyeY: 6 } },
    hopper:     { c: hex(0xb8a48c), face: { mouth: 'line', eyeW: 2, eyeY: 6 } },
    inkfin:     { c: hex(0x2a3a6a), body: { scales: true }, face: { eyes: false, mouth: 'void' } },
    // --- hostile 3D natives
    zombie:     { c: hex(0x4a7a52), body: { tatters: true }, face: { glowEyes: hex(0x1a1a22), mouth: 'grin', brow: hex(0x2a4a30) } },
    skeleton:   { c: hex(0xd8d4c4), body: { shades: 3 }, face: { eye: hex(0x14141a), mouth: 'fangs', eyeW: 3 } },
    spider:     { c: hex(0x3a2a30), body: { tatters: true }, face: { glowEyes: hex(0xd03a3a), eyeY: 5, eyeW: 2, eyeH: 2, mouth: 'fangs' } },
    bloater:    { c: hex(0x5a9a4a), body: { spots: 5, spotF: 0.7 }, face: { eye: hex(0x14141a), mouth: 'void', eyeW: 4, eyeH: 3 } },
    gelid:      { c: hex(0x6ad08a), body: { shades: 3, lo: 0.85 }, face: { eye: hex(0x1a2a1a), mouth: 'line', eyeW: 2 } },
    // --- 4D natives
    phase_wraith:{ c: hex(0x7a5ad0), body: { lattice: true, latticeColor: hex(0xd8c8ff), glow: hex(0xe0d0ff) },
                   face: { glowEyes: hex(0xe8dcff), mouth: 'void', eyeW: 4 } },
    kata_drifter:{ c: hex(0x2f4a6a), body: { lattice: true, latticeColor: hex(0x7fd8e8), scales: true },
                   face: { glowEyes: hex(0x4fe5d7), mouth: 'void' } },
    tessellite: { c: hex(0x4fe5d7), body: { lattice: true, latticeColor: hex(0xffffff), shades: 3 },
                  face: { eyes: false, mouth: 'void', glowEyes: hex(0xffffff) } },
    null_crawler:{ c: hex(0x1e1a2c), body: { glow: hex(0x8f6adf) }, face: { glowEyes: hex(0x8f6adf), mouth: 'fangs', eyeW: 4 } },
    hyperslug:  { c: hex(0x9a6ad0), body: { scales: true, glow: hex(0xd8c0ff) }, face: { glowEyes: hex(0xfff0a0), eyeY: 4, mouth: 'line' } },
    slice_warden:{ c: hex(0x3a2a5a), body: { lattice: true, latticeColor: hex(0xffb84a), glow: hex(0xffb84a) },
                   face: { glowEyes: hex(0xffb84a), mouth: 'fangs', eyeW: 4, eyeH: 3 } },
    echo:       { c: hex(0x8a90a8), body: { lattice: true, latticeColor: hex(0xffffff), shades: 3, lo: 0.9 },
                  face: { glowEyes: hex(0xdfe8ff), mouth: 'line' } },
    // --- NPCs
    villager:   { c: hex(0xb08a68), body: { shades: 3 }, face: { mouth: 'beard', brow: hex(0x5a4030), eyeW: 2, beardColor: hex(0x6a4a30) } },
    cartographer:{ c: hex(0x7a8ab0), body: { shades: 3 }, face: { mouth: 'line', brow: hex(0x3a4a6a), eyeW: 2 } },
    weaver:     { c: hex(0x8a5aa8), body: { lattice: true, latticeColor: hex(0xe0d0ff) }, face: { glowEyes: hex(0xd8c8ff), mouth: 'line' } },
    hermit:     { c: hex(0x9a8a6a), body: { tatters: true }, face: { mouth: 'beard', beardColor: hex(0xd8d4c4), brow: hex(0xd8d4c4) } },
    tinker:     { c: hex(0x6a6a7a), body: { shades: 4 }, face: { mouth: 'grin', brow: hex(0x3a3a48), eyeW: 2 } },
    archivist:  { c: hex(0x4a5a7a), body: { shades: 3 }, face: { mouth: 'line', brow: hex(0x2a3448) } },
    rift_warden:{ c: hex(0x2a2a3a), body: { lattice: true, latticeColor: hex(0xff9a4a), glow: hex(0xff9a4a) },
                  face: { glowEyes: hex(0xff9a4a), mouth: 'void' } },
  };

  let s = 900;
  for (const [name, cfg] of Object.entries(skins)) {
    add(`mob_${name}`, body(s++, cfg.c, cfg.body || {}));
    add(`mob_${name}_face`, face(s++, cfg.c, { ...(cfg.body || {}), ...(cfg.face || {}) }));
  }

  // shared accessories
  add('mob_wool', body(s++, hex(0xf0eee8), { shades: 3, lo: 0.9 }));
  add('mob_leather', body(s++, hex(0x8a5f3c), { shades: 3 }));
  add('mob_robe_blue', body(s++, hex(0x3a4a80), { shades: 3 }));
  add('mob_robe_green', body(s++, hex(0x3a6a48), { shades: 3 }));
  add('mob_robe_violet', body(s++, hex(0x5a3a80), { shades: 3, glow: hex(0xd8c8ff) }));
  add('mob_apron', body(s++, hex(0x8a7a5a), { shades: 3 }));
  add('mob_iron', body(s++, hex(0xc8c6c0), { shades: 4 }));
  add('mob_shadow', body(s++, hex(0x14121c), { shades: 2, lo: 0.7 }));

  return T;
}
