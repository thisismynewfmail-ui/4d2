// 4D-MC :: core math -----------------------------------------------------
// Small, allocation-light math helpers. Column-major 4x4 matrices to match
// WebGL's expectations.

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (t) => t * t * (3 - 2 * t);
export const smootherstep = (t) => t * t * t * (t * (t * 6 - 15) + 10);
export const fract = (v) => v - Math.floor(v);
export const mod = (v, m) => ((v % m) + m) % m;
export const sign = Math.sign;

/** Frame-rate independent exponential approach. */
export function damp(current, target, lambda, dt) {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

// --- matrices ------------------------------------------------------------
export function mat4() {
  const m = new Float32Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

export function mIdentity(m) {
  m.fill(0);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

export function mPerspective(out, fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2);
  out.fill(0);
  out[0] = f / aspect;
  out[5] = f;
  out[11] = -1;
  const nf = 1 / (near - far);
  out[10] = (far + near) * nf;
  out[14] = 2 * far * near * nf;
  return out;
}

export function mOrtho(out, l, r, b, t, n, f) {
  out.fill(0);
  out[0] = 2 / (r - l);
  out[5] = 2 / (t - b);
  out[10] = -2 / (f - n);
  out[12] = -(r + l) / (r - l);
  out[13] = -(t + b) / (t - b);
  out[14] = -(f + n) / (f - n);
  out[15] = 1;
  return out;
}

export function mMul(out, a, b) {
  const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
  const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
  const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
  const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
  for (let i = 0; i < 4; i++) {
    const b0 = b[i * 4], b1 = b[i * 4 + 1], b2 = b[i * 4 + 2], b3 = b[i * 4 + 3];
    out[i * 4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[i * 4 + 1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[i * 4 + 2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[i * 4 + 3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
  }
  return out;
}

export function mTranslate(out, x, y, z) {
  mIdentity(out);
  out[12] = x; out[13] = y; out[14] = z;
  return out;
}

export function mScale(out, x, y, z) {
  mIdentity(out);
  out[0] = x; out[5] = y; out[10] = z;
  return out;
}

export function mRotY(out, a) {
  const s = Math.sin(a), c = Math.cos(a);
  mIdentity(out);
  out[0] = c; out[2] = -s; out[8] = s; out[10] = c;
  return out;
}

export function mRotX(out, a) {
  const s = Math.sin(a), c = Math.cos(a);
  mIdentity(out);
  out[5] = c; out[6] = s; out[9] = -s; out[10] = c;
  return out;
}

export function mRotZ(out, a) {
  const s = Math.sin(a), c = Math.cos(a);
  mIdentity(out);
  out[0] = c; out[1] = s; out[4] = -s; out[5] = c;
  return out;
}

/** Camera view matrix from position + yaw/pitch (radians). */
export function mView(out, x, y, z, yaw, pitch) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  // Right-handed camera basis (view looks down -Z).
  //   right = normalize(cross(worldUp, -forward))  ->  (-cos yaw, 0, sin yaw)
  // Getting this sign wrong mirrors the world and inverts back-face culling.
  const rx = -cy, ry = 0, rz = sy;
  const ux = sy * sp, uy = cp, uz = cy * sp;
  const fx = sy * cp, fy = -sp, fz = cy * cp; // look direction
  out[0] = rx; out[4] = ry; out[8] = rz; out[12] = -(rx * x + ry * y + rz * z);
  out[1] = ux; out[5] = uy; out[9] = uz; out[13] = -(ux * x + uy * y + uz * z);
  out[2] = -fx; out[6] = -fy; out[10] = -fz; out[14] = fx * x + fy * y + fz * z;
  out[3] = 0; out[7] = 0; out[11] = 0; out[15] = 1;
  return out;
}

export function lookDir(yaw, pitch) {
  const cp = Math.cos(pitch);
  return [Math.sin(yaw) * cp, -Math.sin(pitch), Math.cos(yaw) * cp];
}

/** Camera right vector, matching mView's basis. */
export function rightDir(yaw) {
  return [-Math.cos(yaw), 0, Math.sin(yaw)];
}

/** Extract the 6 frustum planes from a view-projection matrix. */
export function frustumFromMat(m, out) {
  const p = out || new Float32Array(24);
  const set = (i, a, b, c, d) => {
    const l = Math.hypot(a, b, c) || 1;
    p[i * 4] = a / l; p[i * 4 + 1] = b / l; p[i * 4 + 2] = c / l; p[i * 4 + 3] = d / l;
  };
  set(0, m[3] + m[0], m[7] + m[4], m[11] + m[8], m[15] + m[12]);   // left
  set(1, m[3] - m[0], m[7] - m[4], m[11] - m[8], m[15] - m[12]);   // right
  set(2, m[3] + m[1], m[7] + m[5], m[11] + m[9], m[15] + m[13]);   // bottom
  set(3, m[3] - m[1], m[7] - m[5], m[11] - m[9], m[15] - m[13]);   // top
  set(4, m[3] + m[2], m[7] + m[6], m[11] + m[10], m[15] + m[14]);  // near
  set(5, m[3] - m[2], m[7] - m[6], m[11] - m[10], m[15] - m[14]);  // far
  return p;
}

export function aabbInFrustum(p, x0, y0, z0, x1, y1, z1) {
  for (let i = 0; i < 6; i++) {
    const a = p[i * 4], b = p[i * 4 + 1], c = p[i * 4 + 2], d = p[i * 4 + 3];
    const px = a > 0 ? x1 : x0;
    const py = b > 0 ? y1 : y0;
    const pz = c > 0 ? z1 : z0;
    if (a * px + b * py + c * pz + d < 0) return false;
  }
  return true;
}

// --- deterministic randomness -------------------------------------------

/** xmur3 string hash -> 32-bit seed. */
export function hashSeed(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

/** mulberry32 PRNG. */
export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stateless integer hash — the backbone of the noise fields. */
export function ihash(x, y, z, w, seed) {
  let h = seed >>> 0;
  h = Math.imul(h ^ (x | 0), 0x27d4eb2d);
  h ^= h >>> 15;
  h = Math.imul(h ^ (y | 0), 0x165667b1);
  h ^= h >>> 13;
  h = Math.imul(h ^ (z | 0), 0x9e3779b1);
  h ^= h >>> 16;
  h = Math.imul(h ^ (w | 0), 0x85ebca6b);
  h ^= h >>> 13;
  return h >>> 0;
}

export const hash01 = (x, y, z, w, seed) => ihash(x, y, z, w, seed) / 4294967296;
