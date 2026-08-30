// 4D-MC :: the hyperslice ------------------------------------------------
//
// The single source of truth for how the fourth dimension folds into the three
// we can see.  The camera does not sit on a flat  w = const  hyperplane; it
// sits on a *tilted* one:
//
//     w_visible(x, z) = wPlayer + ax * x + az * z
//
// so the slice sweeps diagonally across the world.  Each integer band of that
// function shows a different layer of the 4D block field, and the boundaries
// between bands cut straight through individual voxels — which is exactly what
// turns cubes into wedges, prisms and triangles near a seam.
//
// Rendering, collision, ray-casting and entity visibility all call into here,
// so what you see is always precisely what you can touch.

import { W_LAYERS, SHEAR_PRESETS } from '../core/constants.js';

export class Slice {
  constructor(preset = 'normal') {
    this.setPreset(preset);
    this.w = 0;             // continuous player position along the 4th axis
  }

  setPreset(name) {
    const s = SHEAR_PRESETS[name] || SHEAR_PRESETS.normal;
    this.presetName = name;
    this.ax = s.x;
    this.az = s.z;
    this.mag2 = this.ax * this.ax + this.az * this.az;
    this.mag = Math.sqrt(this.mag2);
    // Perpendicular band width in blocks (Infinity when the tilt is off).
    this.bandWidth = this.mag > 1e-6 ? 1 / this.mag : Infinity;
  }

  /** Shear offset at a horizontal position. */
  u(x, z) { return this.ax * x + this.az * z; }

  /** Continuous, unwrapped slice coordinate seen at (x, z). */
  at(x, z, w = this.w) { return w + this.ax * x + this.az * z; }

  /** Unwrapped integer band index at (x, z). */
  bandAt(x, z, w = this.w) { return Math.floor(this.at(x, z, w)); }

  /** Cyclic data layer (0 .. W_LAYERS-1) visible at (x, z). */
  layerAt(x, z, w = this.w) {
    const b = Math.floor(this.at(x, z, w));
    return ((b % W_LAYERS) + W_LAYERS) % W_LAYERS;
  }

  /** How far through the current band we are at (x, z): 0 at entry, 1 at exit. */
  phaseAt(x, z, w = this.w) {
    const v = this.at(x, z, w);
    return v - Math.floor(v);
  }

  /** Map an unwrapped band index to its cyclic data layer. */
  static wrap(band) { return ((band % W_LAYERS) + W_LAYERS) % W_LAYERS; }

  /**
   * Range of unwrapped bands touching an axis-aligned horizontal box.
   * Used to decide which per-layer meshes a chunk must draw and to make
   * collision conservative across seams.
   */
  bandRange(x0, z0, x1, z1, w = this.w) {
    const a = this.ax, b = this.az;
    const uMin = (a >= 0 ? a * x0 : a * x1) + (b >= 0 ? b * z0 : b * z1);
    const uMax = (a >= 0 ? a * x1 : a * x0) + (b >= 0 ? b * z1 : b * z0);
    return [Math.floor(w + uMin), Math.floor(w + uMax)];
  }
}
