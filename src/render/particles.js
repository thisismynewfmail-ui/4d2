// 4D-MC :: particles -------------------------------------------------------
// Billboards sampled from the block atlas, so a broken stone block throws
// stone-coloured crumbs.

import { texLayer } from '../world/atlas.js';
import { BLOCKS } from '../world/blocks.js';
import { GRAVITY } from '../core/constants.js';
import { Slice } from '../world/slice.js';

export class Particles {
  constructor(max = 1400) {
    this.max = max;
    this.list = [];
    this.count = 0;
  }

  spawn(x, y, z, w, opts = {}) {
    if (this.list.length >= this.max) this.list.shift();
    const p = {
      x, y, z, w,
      vx: opts.vx ?? (Math.random() - 0.5) * 2.2,
      vy: opts.vy ?? Math.random() * 2.6,
      vz: opts.vz ?? (Math.random() - 0.5) * 2.2,
      life: opts.life ?? (0.5 + Math.random() * 0.8),
      maxLife: 1,
      size: opts.size ?? (0.055 + Math.random() * 0.06),
      r: opts.r ?? 1, g: opts.g ?? 1, b: opts.b ?? 1,
      tex: opts.tex ?? texLayer('stone'),
      seed: Math.random(),
      gravity: opts.gravity ?? 1,
      drag: opts.drag ?? 0.86,
    };
    p.maxLife = p.life;
    this.list.push(p);
    this.count = this.list.length;
    return p;
  }

  blockBreak(x, y, z, w, blockIdValue, n = 18) {
    const b = BLOCKS[blockIdValue];
    if (!b) return;
    const tex = texLayer(b.faces[2]);
    for (let i = 0; i < n; i++) {
      this.spawn(x + Math.random(), y + Math.random(), z + Math.random(), w, {
        tex, life: 0.5 + Math.random() * 0.7, size: 0.05 + Math.random() * 0.05,
      });
    }
  }

  blockHit(x, y, z, w, blockIdValue, nx, ny, nz) {
    const b = BLOCKS[blockIdValue];
    if (!b) return;
    const tex = texLayer(b.faces[2]);
    for (let i = 0; i < 3; i++) {
      this.spawn(x + 0.5 + nx * 0.52, y + 0.5 + ny * 0.52, z + 0.5 + nz * 0.52, w, {
        tex, size: 0.04 + Math.random() * 0.03, life: 0.35,
        vx: nx * 1.4 + (Math.random() - 0.5), vy: ny * 1.4 + Math.random() * 1.2, vz: nz * 1.4 + (Math.random() - 0.5),
      });
    }
  }

  /** Violet motes that mark a seam being crossed. */
  sliceSpark(x, y, z, w, n = 6) {
    for (let i = 0; i < n; i++) {
      this.spawn(x + (Math.random() - 0.5) * 2.4, y + Math.random() * 2, z + (Math.random() - 0.5) * 2.4, w, {
        tex: texLayer('tesseract_shard'), size: 0.05 + Math.random() * 0.05,
        life: 0.7 + Math.random() * 0.6, gravity: 0.06, drag: 0.94,
        vx: (Math.random() - 0.5) * 0.8, vy: 0.6 + Math.random() * 0.8, vz: (Math.random() - 0.5) * 0.8,
        r: 0.7, g: 1.2, b: 1.3,
      });
    }
  }

  splash(x, y, z, w, n = 12) {
    for (let i = 0; i < n; i++)
      this.spawn(x, y, z, w, {
        tex: texLayer('water'), size: 0.04 + Math.random() * 0.04, life: 0.5,
        r: 0.7, g: 0.9, b: 1.3, vy: 1.5 + Math.random() * 2.4,
      });
  }

  smoke(x, y, z, w) {
    this.spawn(x, y, z, w, {
      tex: texLayer('gravel'), size: 0.08, life: 1.4, gravity: -0.08, drag: 0.95,
      r: 0.5, g: 0.5, b: 0.55, vx: (Math.random() - 0.5) * 0.3, vy: 0.4, vz: (Math.random() - 0.5) * 0.3,
    });
  }

  update(dt, world) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life -= dt;
      if (p.life <= 0) { this.list.splice(i, 1); continue; }
      p.vy -= GRAVITY * 0.55 * p.gravity * dt;
      const damp = Math.pow(p.drag, dt * 60);
      p.vx *= damp; p.vz *= damp;
      const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt, nz = p.z + p.vz * dt;
      // cheap floor collision against the particle's own slice
      const band = Slice.wrap(Math.floor(p.w));
      const id = world.getBlockSafe(Math.floor(nx), Math.floor(ny), Math.floor(nz), band);
      if (id && BLOCKS[id] && BLOCKS[id].solid) {
        p.vy = 0; p.vx *= 0.5; p.vz *= 0.5;
      } else { p.x = nx; p.y = ny; p.z = nz; }
      // fade by shrinking — the shader has no alpha blending for these
      p.size = Math.max(0.012, p.size * (0.5 + 0.5 * (p.life / p.maxLife)) + 0.0001);
    }
    this.count = this.list.length;
  }

  clear() { this.list.length = 0; this.count = 0; }
}
