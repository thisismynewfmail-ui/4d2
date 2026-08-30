// 4D-MC :: minimal WebGL2 wrapper ----------------------------------------
// Deliberately thin: the renderer needs precise control over the hyperslice
// shaders, so this file only removes boilerplate.

export function createGL(canvas) {
  const gl = canvas.getContext('webgl2', {
    antialias: false,
    alpha: false,
    depth: true,
    stencil: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: false,
  });
  if (!gl) throw new Error('WebGL2 is required to run 4D-MC.');
  gl.getExtension('EXT_color_buffer_float');
  gl.anisoExt = gl.getExtension('EXT_texture_filter_anisotropic');
  return gl;
}

export function compile(gl, type, src, label) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    const numbered = src.split('\n').map((l, i) => `${String(i + 1).padStart(3)}| ${l}`).join('\n');
    throw new Error(`Shader compile failed (${label}):\n${log}\n${numbered}`);
  }
  return sh;
}

export class Program {
  constructor(gl, vs, fs, label = 'program') {
    this.gl = gl;
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs, label + '.vert'));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs, label + '.frag'));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error(`Link failed (${label}): ${gl.getProgramInfoLog(p)}`);
    }
    this.p = p;
    this.u = {};
    this.a = {};
    const nu = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < nu; i++) {
      const info = gl.getActiveUniform(p, i);
      const name = info.name.replace(/\[0\]$/, '');
      this.u[name] = gl.getUniformLocation(p, name);
    }
    const na = gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES);
    for (let i = 0; i < na; i++) {
      const info = gl.getActiveAttrib(p, i);
      this.a[info.name] = gl.getAttribLocation(p, info.name);
    }
  }
  use() { this.gl.useProgram(this.p); return this; }
  set1f(n, v) { const l = this.u[n]; if (l) this.gl.uniform1f(l, v); return this; }
  set1i(n, v) { const l = this.u[n]; if (l !== undefined && l !== null) this.gl.uniform1i(l, v); return this; }
  set2f(n, a, b) { const l = this.u[n]; if (l) this.gl.uniform2f(l, a, b); return this; }
  set3f(n, a, b, c) { const l = this.u[n]; if (l) this.gl.uniform3f(l, a, b, c); return this; }
  set4f(n, a, b, c, d) { const l = this.u[n]; if (l) this.gl.uniform4f(l, a, b, c, d); return this; }
  setMat(n, m) { const l = this.u[n]; if (l) this.gl.uniformMatrix4fv(l, false, m); return this; }
}

export function makeBuffer(gl, target, data, usage = gl.STATIC_DRAW) {
  const b = gl.createBuffer();
  gl.bindBuffer(target, b);
  gl.bufferData(target, data, usage);
  return b;
}

/** Build a TEXTURE_2D_ARRAY from an array of same-sized ImageData / canvases. */
export function makeTextureArray(gl, canvases, size, { mip = true, nearest = true } = {}) {
  const tex = gl.createTexture();
  const depth = canvases.length;
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
  const levels = mip ? Math.floor(Math.log2(size)) + 1 : 1;
  gl.texStorage3D(gl.TEXTURE_2D_ARRAY, levels, gl.RGBA8, size, size, depth);
  for (let i = 0; i < depth; i++) {
    gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, i, size, size, 1,
      gl.RGBA, gl.UNSIGNED_BYTE, canvases[i]);
  }
  if (mip) gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, nearest ? gl.NEAREST : gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER,
    mip ? (nearest ? gl.NEAREST_MIPMAP_LINEAR : gl.LINEAR_MIPMAP_LINEAR) : gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.REPEAT);
  if (gl.anisoExt) {
    const max = gl.getParameter(gl.anisoExt.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
    gl.texParameterf(gl.TEXTURE_2D_ARRAY, gl.anisoExt.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(4, max));
  }
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);
  return tex;
}

export function makeTexture2D(gl, source, { nearest = true, mip = false } = {}) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  if (mip) gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, nearest ? gl.NEAREST : gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER,
    mip ? gl.NEAREST_MIPMAP_LINEAR : (nearest ? gl.NEAREST : gl.LINEAR));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return tex;
}
