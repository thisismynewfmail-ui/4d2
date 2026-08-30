// 4D-MC :: renderer --------------------------------------------------------

import { Program, makeTextureArray, makeBuffer } from '../core/gl.js';
import {
  TERRAIN_VS, TERRAIN_FS, CAP_VS, CAP_FS, SKY_VS, SKY_FS,
  CLOUD_VS, CLOUD_FS, ENTITY_VS, ENTITY_FS, LINE_VS, LINE_FS,
  PARTICLE_VS, PARTICLE_FS,
} from './shaders.js';
import { CHUNK_X, CHUNK_Z, WORLD_H, W_LAYERS } from '../core/constants.js';
import { meshChunkLayer, initMesher } from './mesher.js';
import { atlas, texLayer } from '../world/atlas.js';
import { BIOMES } from '../world/biomes.js';
import { BLOCKS } from '../world/blocks.js';
import { Slice } from '../world/slice.js';
import {
  mat4, mPerspective, mView, mMul, mTranslate, mScale, mRotX, mRotY, mRotZ,
  frustumFromMat, aabbInFrustum, clamp, lerp, mod, mIdentity,
} from '../core/math.js';

const MAX_QUADS = 262144;

export class Renderer {
  constructor(gl, canvas) {
    this.gl = gl;
    this.canvas = canvas;
    this.vp = mat4();
    this.proj = mat4();
    this.view = mat4();
    this.invVP = mat4();
    this.frustum = new Float32Array(24);
    this.tmpA = mat4(); this.tmpB = mat4(); this.tmpC = mat4();
    this.meshBudgetMs = 5;
    this.stats = { drawCalls: 0, quads: 0, chunks: 0, meshBuilt: 0 };
    this.skyColor = [0.42, 0.62, 0.92];
  }

  init() {
    const gl = this.gl;
    initMesher();

    this.pTerrain = new Program(gl, TERRAIN_VS, TERRAIN_FS, 'terrain');
    this.pCap = new Program(gl, CAP_VS, CAP_FS, 'cap');
    this.pSky = new Program(gl, SKY_VS, SKY_FS, 'sky');
    this.pCloud = new Program(gl, CLOUD_VS, CLOUD_FS, 'cloud');
    this.pEntity = new Program(gl, ENTITY_VS, ENTITY_FS, 'entity');
    this.pLine = new Program(gl, LINE_VS, LINE_FS, 'line');
    this.pParticle = new Program(gl, PARTICLE_VS, PARTICLE_FS, 'particle');

    this.tex = makeTextureArray(gl, atlas.layers, atlas.size, { mip: true, nearest: true });
    this.crackLayer = texLayer('crack_0');

    // shared quad index buffer: 0 1 2, 0 2 3 per quad
    const idxData = new Uint32Array(MAX_QUADS * 6);
    for (let q = 0; q < MAX_QUADS; q++) {
      const v = q * 4, i = q * 6;
      idxData[i] = v; idxData[i + 1] = v + 1; idxData[i + 2] = v + 2;
      idxData[i + 3] = v; idxData[i + 4] = v + 2; idxData[i + 5] = v + 3;
    }
    this.ibo = makeBuffer(gl, gl.ELEMENT_ARRAY_BUFFER, idxData);

    // fullscreen triangle-pair for the sky
    this.skyVAO = gl.createVertexArray();
    gl.bindVertexArray(this.skyVAO);
    makeBuffer(gl, gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]));
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    this.buildCubeMesh();
    this.buildCloudMesh();
    this.buildLineMeshes();
    this.buildParticleBuffers();

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.frontFace(gl.CCW);
    gl.clearColor(0.45, 0.66, 0.95, 1);
  }

  // --- static meshes -----------------------------------------------------
  buildCubeMesh() {
    const gl = this.gl;
    const F = [
      { n: [1, 0, 0], v: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
      { n: [-1, 0, 0], v: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
      { n: [0, 1, 0], v: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
      { n: [0, -1, 0], v: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
      { n: [0, 0, 1], v: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
      { n: [0, 0, -1], v: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
    ];
    const UV = [[0, 1], [1, 1], [1, 0], [0, 0]];
    const data = [];
    for (const f of F)
      for (let i = 0; i < 4; i++)
        data.push(f.v[i][0] - 0.5, f.v[i][1] - 0.5, f.v[i][2] - 0.5,
          f.n[0], f.n[1], f.n[2], UV[i][0], UV[i][1]);
    this.cubeVAO = gl.createVertexArray();
    gl.bindVertexArray(this.cubeVAO);
    makeBuffer(gl, gl.ARRAY_BUFFER, new Float32Array(data));
    const st = 32;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, st, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, st, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, st, 24);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    gl.bindVertexArray(null);

    // a single flat quad (billboards, held flat items)
    const q = [];
    const qv = [[-0.5, -0.5, 0], [0.5, -0.5, 0], [0.5, 0.5, 0], [-0.5, 0.5, 0]];
    for (let i = 0; i < 4; i++) q.push(qv[i][0], qv[i][1], qv[i][2], 0, 0, 1, UV[i][0], UV[i][1]);
    this.quadVAO = gl.createVertexArray();
    gl.bindVertexArray(this.quadVAO);
    makeBuffer(gl, gl.ARRAY_BUFFER, new Float32Array(q));
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, st, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, st, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, st, 24);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    gl.bindVertexArray(null);
  }

  buildCloudMesh() {
    const gl = this.gl;
    const S = 900, Y = 128;
    const v = new Float32Array([
      -S, Y, -S, S, Y, -S, S, Y, S, -S, Y, S,
    ]);
    this.cloudVAO = gl.createVertexArray();
    gl.bindVertexArray(this.cloudVAO);
    makeBuffer(gl, gl.ARRAY_BUFFER, v);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    gl.bindVertexArray(null);
  }

  buildLineMeshes() {
    const gl = this.gl;
    const e = 0.002;
    const a = -e, b = 1 + e;
    const P = [
      [a, a, a], [b, a, a], [b, a, b], [a, a, b],
      [a, b, a], [b, b, a], [b, b, b], [a, b, b],
    ];
    const E = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4],
      [0, 4], [1, 5], [2, 6], [3, 7]];
    const d = [];
    for (const [i, j] of E) d.push(...P[i], ...P[j]);
    this.boxVAO = gl.createVertexArray();
    gl.bindVertexArray(this.boxVAO);
    makeBuffer(gl, gl.ARRAY_BUFFER, new Float32Array(d));
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.boxLineCount = E.length * 2;
  }

  buildParticleBuffers() {
    const gl = this.gl;
    this.maxParticles = 4096;
    this.particleData = new Float32Array(this.maxParticles * 4 * 11);
    this.particleVBO = gl.createBuffer();
    this.particleVAO = gl.createVertexArray();
    gl.bindVertexArray(this.particleVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.particleVBO);
    gl.bufferData(gl.ARRAY_BUFFER, this.particleData.byteLength, gl.DYNAMIC_DRAW);
    const st = 44;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, st, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, st, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, st, 20);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 2, gl.FLOAT, false, st, 36);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    gl.bindVertexArray(null);
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h;
    }
    this.aspect = w / h;
  }

  // --- mesh management ----------------------------------------------------
  uploadMesh(part) {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, part.buffer, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribIPointer(1, 1, gl.UNSIGNED_INT, 16, 12);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    gl.bindVertexArray(null);
    return {
      vao, vbo, quads: Math.min(part.quads, MAX_QUADS),
      dispose: () => { gl.deleteVertexArray(vao); gl.deleteBuffer(vbo); },
    };
  }

  buildChunkLayer(world, chunk, layer) {
    const parts = meshChunkLayer(world, chunk, layer);
    const old = chunk.meshes.get(layer);
    if (old) { old.solid?.dispose(); old.trans?.dispose(); old.caps?.dispose(); }
    const m = {
      solid: parts.solid ? this.uploadMesh(parts.solid) : null,
      trans: parts.trans ? this.uploadMesh(parts.trans) : null,
      caps: parts.caps ? this.uploadMesh(parts.caps) : null,
    };
    chunk.meshes.set(layer, m);
    chunk.dirtyLayers.delete(layer);
    this.stats.meshBuilt++;
    return m;
  }

  // --- frame --------------------------------------------------------------
  render(ctx) {
    const gl = this.gl;
    const { world, camera, settings, entities, particles, highlight, heldItem, dt } = ctx;
    const slice = world.slice;
    this.resize();
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.stats.drawCalls = 0; this.stats.quads = 0; this.stats.chunks = 0; this.stats.meshBuilt = 0;

    const far = Math.max(64, settings.renderDistance * CHUNK_X + 42);
    mPerspective(this.proj, camera.fov * Math.PI / 180, this.aspect, 0.06, far * 2.4);
    mView(this.view, camera.x, camera.y, camera.z, camera.yaw, camera.pitch);
    mMul(this.vp, this.proj, this.view);
    frustumFromMat(this.vp, this.frustum);
    invert(this.invVP, this.vp);

    // --- atmosphere
    const dayLight = world.skyLightLevel();
    const biome = BIOMES[world.biomeAtSlice(camera.x, camera.z)] || BIOMES[2];
    const underwater = ctx.underwater;
    const sunA = (world.time - 0.25) * Math.PI * 2;
    const sunDir = [Math.cos(sunA) * 0.4, Math.sin(sunA), Math.cos(sunA) * 0.9];

    const nightT = 1 - dayLight;
    const horizon = [
      lerp(biome.fog[0], 0.06, nightT * 0.86),
      lerp(biome.fog[1], 0.07, nightT * 0.86),
      lerp(biome.fog[2], 0.14, nightT * 0.82),
    ];
    const zenith = [
      lerp(0.30, 0.02, nightT), lerp(0.52, 0.03, nightT), lerp(0.92, 0.10, nightT),
    ];
    // dusk / dawn warmth
    const dusk = Math.max(0, 1 - Math.abs(Math.sin(sunA)) * 3.2) * (Math.cos(sunA) > -0.4 ? 1 : 0);
    horizon[0] = clamp(horizon[0] + dusk * 0.55, 0, 1);
    horizon[1] = clamp(horizon[1] + dusk * 0.22, 0, 1);
    horizon[2] = clamp(horizon[2] - dusk * 0.05, 0, 1);

    let fog = horizon;
    const fd = Math.max(0.05, settings.fogDensity ?? 1);
    let fogNear = far * 0.42 / fd, fogFar = far * 0.99 / fd;
    if (underwater) { fog = [0.10, 0.28, 0.48]; fogNear = 0.4; fogFar = 22; }
    else if (ctx.inLava) { fog = [0.62, 0.20, 0.04]; fogNear = 0.1; fogFar = 3; }
    this.skyColor = fog;

    gl.clearColor(fog[0], fog[1], fog[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // --- sky
    if (!underwater && !ctx.inLava) {
      gl.depthMask(false);
      gl.disable(gl.DEPTH_TEST);
      this.pSky.use();
      this.pSky.setMat('uInvVP', this.invVP);
      this.pSky.set3f('uZenith', zenith[0], zenith[1], zenith[2]);
      this.pSky.set3f('uHorizon', horizon[0], horizon[1], horizon[2]);
      this.pSky.set3f('uSunDir', sunDir[0], sunDir[1], sunDir[2]);
      this.pSky.set3f('uSunColor', 1.0, 0.94, 0.82);
      this.pSky.set1f('uDayLight', dayLight);
      this.pSky.set1f('uTime', ctx.elapsed);
      this.pSky.set1f('uW', slice.w);
      this.pSky.set3f('uCamPos', camera.x, camera.y, camera.z);
      gl.bindVertexArray(this.skyVAO);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      this.stats.drawCalls++;
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);
    }

    // --- gather visible chunk/band pairs
    const pcx = Math.floor(camera.x / CHUNK_X), pcz = Math.floor(camera.z / CHUNK_Z);
    const R = settings.renderDistance;
    const jobs = [];
    for (let dz = -R; dz <= R; dz++) {
      for (let dx = -R; dx <= R; dx++) {
        if (dx * dx + dz * dz > (R + 0.6) * (R + 0.6)) continue;
        const cx = pcx + dx, cz = pcz + dz;
        const chunk = world.getChunk(cx, cz);
        if (!chunk || !chunk.generated) continue;
        const x0 = cx * CHUNK_X, z0 = cz * CHUNK_Z;
        if (!aabbInFrustum(this.frustum, x0, 0, z0, x0 + CHUNK_X, WORLD_H, z0 + CHUNK_Z)) continue;
        const [b0, b1] = slice.bandRange(x0, z0, x0 + CHUNK_X, z0 + CHUNK_Z);
        const dist = dx * dx + dz * dz;
        for (let band = b0; band <= b1; band++) {
          jobs.push({ chunk, band, layer: Slice.wrap(band), x0, z0, dist });
        }
        this.stats.chunks++;
      }
    }
    jobs.sort((a, b) => a.dist - b.dist);

    // --- build any missing meshes within a time budget
    const t0 = performance.now();
    for (const j of jobs) {
      const has = j.chunk.meshes.get(j.layer);
      const dirty = j.chunk.dirtyLayers.has(j.layer);
      if (has && !dirty) continue;
      if (performance.now() - t0 > this.meshBudgetMs && has) continue;
      if (performance.now() - t0 > this.meshBudgetMs * 3) break;
      this.buildChunkLayer(world, j.chunk, j.layer);
    }

    // --- terrain (opaque + cutout)
    const P = this.pTerrain.use();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.tex);
    P.set1i('uAtlas', 0);
    P.setMat('uVP', this.vp);
    P.set2f('uShear', slice.ax, slice.az);
    P.set3f('uCamPos', camera.x, camera.y, camera.z);
    P.set3f('uFogColor', fog[0], fog[1], fog[2]);
    P.set1f('uFogNear', fogNear);
    P.set1f('uFogFar', fogFar);
    P.set1f('uDayLight', dayLight);
    P.set1f('uBrightness', settings.brightness);
    P.set3f('uGrassColor', biome.grass[0] * 1.35, biome.grass[1] * 1.35, biome.grass[2] * 1.35);
    P.set3f('uLeafColor', biome.leaf[0] * 1.45, biome.leaf[1] * 1.45, biome.leaf[2] * 1.45);
    P.set1f('uAlphaCutoff', 0.5);
    P.set1f('uSeamGlow', ctx.seamGlow ?? 0.35);
    P.set1f('uGlobalAlpha', 1.0);
    P.set1f('uTime', ctx.elapsed);
    P.set1i('uCrackStage', highlight && highlight.stage >= 0 ? highlight.stage : -1);
    P.set3f('uCrackBlock', highlight ? highlight.x : 0, highlight ? highlight.y : 0, highlight ? highlight.z : 0);
    P.set1f('uCrackLayer', this.crackLayer);
    P.set1i('uDebug', ctx.debugMode || 0);

    gl.enable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
    gl.depthMask(true);
    for (const j of jobs) {
      if (ctx.debugNoSolid) break;
      const m = j.chunk.meshes.get(j.layer);
      if (!m || !m.solid) continue;
      P.set3f('uChunkOrigin', j.x0, 0, j.z0);
      P.set1f('uBase', slice.w - j.band);
      gl.bindVertexArray(m.solid.vao);
      gl.drawElements(gl.TRIANGLES, m.solid.quads * 6, gl.UNSIGNED_INT, 0);
      this.stats.drawCalls++; this.stats.quads += m.solid.quads;
    }

    // --- cross-section caps
    if (!ctx.debugNoCaps) {
    const C = this.pCap.use();
    C.set1i('uAtlas', 0);
    C.setMat('uVP', this.vp);
    C.set2f('uShear', slice.ax, slice.az);
    C.set3f('uCamPos', camera.x, camera.y, camera.z);
    C.set3f('uFogColor', fog[0], fog[1], fog[2]);
    C.set1f('uFogNear', fogNear);
    C.set1f('uFogFar', fogFar);
    C.set1f('uDayLight', dayLight);
    C.set1f('uBrightness', settings.brightness);
    C.set3f('uGrassColor', biome.grass[0] * 1.35, biome.grass[1] * 1.35, biome.grass[2] * 1.35);
    C.set3f('uLeafColor', biome.leaf[0] * 1.45, biome.leaf[1] * 1.45, biome.leaf[2] * 1.45);
    C.set1f('uSeamGlow', ctx.seamGlow ?? 0.35);
    C.set1f('uTime', ctx.elapsed);
    gl.disable(gl.CULL_FACE);
    for (const j of jobs) {
      const m = j.chunk.meshes.get(j.layer);
      if (!m || !m.caps) continue;
      C.set3f('uChunkOrigin', j.x0, 0, j.z0);
      C.set1f('uBase', slice.w - j.band);
      gl.bindVertexArray(m.caps.vao);
      gl.drawElements(gl.TRIANGLES, m.caps.quads * 6, gl.UNSIGNED_INT, 0);
      this.stats.drawCalls++; this.stats.quads += m.caps.quads;
    }
    gl.enable(gl.CULL_FACE);
    }

    // --- entities
    this.drawEntities(ctx, fog, fogNear, fogFar, dayLight, settings);

    // --- clouds
    if (!underwater && settings.renderDistance > 2) {
      const CL = this.pCloud.use();
      CL.setMat('uVP', this.vp);
      CL.set3f('uOffset', Math.floor(camera.x / 12) * 12 + ctx.elapsed * 0.6, 0, Math.floor(camera.z / 12) * 12);
      CL.set3f('uCamPos', camera.x, camera.y, camera.z);
      CL.set3f('uFogColor', fog[0], fog[1], fog[2]);
      CL.set1f('uDayLight', dayLight);
      CL.set1f('uFogFar', fogFar);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.disable(gl.CULL_FACE);
      gl.bindVertexArray(this.cloudVAO);
      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_INT, 0);
      gl.enable(gl.CULL_FACE);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      this.stats.drawCalls++;
    }

    // --- selection outline
    if (highlight && highlight.hit) {
      const L = this.pLine.use();
      L.setMat('uVP', this.vp);
      L.set3f('uOffset', highlight.x, highlight.y, highlight.z);
      L.set2f('uShear', slice.ax, slice.az);
      L.set1f('uBase', slice.w - highlight.band);
      L.set4f('uColor', 0.03, 0.03, 0.05, 0.75);
      L.set1i('uClip', 1);
      gl.bindVertexArray(this.boxVAO);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArrays(gl.LINES, 0, this.boxLineCount);
      gl.disable(gl.BLEND);
      this.stats.drawCalls++;
    }

    // --- translucent terrain
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    this.pTerrain.use();
    P.set1f('uAlphaCutoff', 0.02);
    P.set1i('uCrackStage', -1);
    const back = jobs.slice().sort((a, b) => b.dist - a.dist);
    for (const j of back) {
      const m = j.chunk.meshes.get(j.layer);
      if (!m || !m.trans) continue;
      P.set3f('uChunkOrigin', j.x0, 0, j.z0);
      P.set1f('uBase', slice.w - j.band);
      gl.bindVertexArray(m.trans.vao);
      gl.drawElements(gl.TRIANGLES, m.trans.quads * 6, gl.UNSIGNED_INT, 0);
      this.stats.drawCalls++; this.stats.quads += m.trans.quads;
    }
    gl.depthMask(true);
    gl.disable(gl.BLEND);

    // --- particles
    if (particles && particles.count > 0 && settings.particles) {
      this.drawParticles(particles, camera, slice);
    }

    // --- first-person hand
    if (ctx.showHand !== false) this.drawHand(ctx, dayLight, settings, fog, fogNear, fogFar);

    gl.bindVertexArray(null);
  }

  drawEntities(ctx, fog, fogNear, fogFar, dayLight, settings) {
    const gl = this.gl;
    const { entities, world, camera } = ctx;
    if (!entities || entities.length === 0) return;
    const slice = world.slice;
    const E = this.pEntity.use();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.tex);
    E.set1i('uAtlas', 0);
    E.setMat('uVP', this.vp);
    E.set2f('uShear', slice.ax, slice.az);
    E.set3f('uCamPos', camera.x, camera.y, camera.z);
    E.set3f('uFogColor', fog[0], fog[1], fog[2]);
    E.set1f('uFogNear', fogNear);
    E.set1f('uFogFar', fogFar);
    E.set1f('uDayLight', dayLight);
    E.set1f('uBrightness', settings.brightness);
    E.set1f('uTime', ctx.elapsed);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(this.cubeVAO);

    for (const e of entities) {
      if (!e.parts) continue;
      const dx = e.x - camera.x, dz = e.z - camera.z;
      if (dx * dx + dz * dz > (settings.renderDistance * CHUNK_X + 20) ** 2) continue;
      // A creature is visible where the local slice coordinate is within half a
      // layer of its own w. Because the slice is tilted, that test cuts across
      // the creature's body — 4D natives are permanently sliced in half.
      const half = e.wHalf ?? 0.5;
      E.set1f('uBase', slice.w - e.w + half);
      E.set2f('uBandRange', 0, half * 2);
      E.set1f('uPhase', e.phase ?? 0);
      E.set1f('uHurt', e.hurtTime > 0 ? 1 : 0);
      E.set1f('uAlpha', e.alpha ?? 1);
      E.set1f('uEmissive', e.emissive ?? 0);
      const lit = world.getLightPacked(Math.floor(e.x), Math.floor(e.y + 0.6), Math.floor(e.z),
        mod(Math.floor(e.w), W_LAYERS));
      const lv = Math.max(((lit >> 4) & 15) / 15 * dayLight, (lit & 15) / 15);
      E.set1f('uLight', Math.max(0.16, lv));
      for (const p of e.parts) {
        const m = this.partMatrix(e, p);
        E.setMat('uModel', m);
        E.set1f('uTexLayer', p.tex);
        E.set3f('uColor', p.color ? p.color[0] : 1, p.color ? p.color[1] : 1, p.color ? p.color[2] : 1);
        gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_INT, 0);
        this.stats.drawCalls++;
      }
    }
    gl.disable(gl.BLEND);
  }

  partMatrix(e, p) {
    const A = this.tmpA, B = this.tmpB, C = this.tmpC;
    mTranslate(A, e.x, e.y, e.z);
    mRotY(B, e.yaw ?? 0);
    mMul(C, A, B);
    mTranslate(A, p.px, p.py, p.pz);
    mMul(B, C, A);
    if (p.rx || p.ry || p.rz) {
      if (p.rx) { mRotX(A, p.rx); mMul(C, B, A); B.set(C); }
      if (p.ry) { mRotY(A, p.ry); mMul(C, B, A); B.set(C); }
      if (p.rz) { mRotZ(A, p.rz); mMul(C, B, A); B.set(C); }
    }
    mScale(A, p.sx, p.sy, p.sz);
    mMul(C, B, A);
    return C;
  }

  drawParticles(particles, camera, slice) {
    const gl = this.gl;
    const n = Math.min(particles.count, this.maxParticles);
    const arr = this.particleData;
    const cy = Math.cos(camera.yaw), sy = Math.sin(camera.yaw);
    const cp = Math.cos(camera.pitch), sp = Math.sin(camera.pitch);
    const right = [-cy, 0, sy];
    const up = [sy * sp, cp, cy * sp];
    let o = 0;
    const CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (let i = 0; i < n; i++) {
      const p = particles.list[i];
      for (let c = 0; c < 4; c++) {
        arr[o++] = p.x; arr[o++] = p.y; arr[o++] = p.z;
        arr[o++] = CORNERS[c][0]; arr[o++] = CORNERS[c][1];
        arr[o++] = p.r; arr[o++] = p.g; arr[o++] = p.b; arr[o++] = p.size;
        arr[o++] = p.tex; arr[o++] = p.seed;
      }
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.particleVBO);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, arr, 0, o);
    const PR = this.pParticle.use();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.tex);
    PR.set1i('uAtlas', 0);
    PR.setMat('uVP', this.vp);
    PR.set3f('uRight', right[0], right[1], right[2]);
    PR.set3f('uUp', up[0], up[1], up[2]);
    PR.set2f('uShear', slice.ax, slice.az);
    PR.set1f('uW', slice.w);
    PR.set1f('uBandLo', -1e9);
    PR.set1f('uBandHi', 1e9);
    gl.bindVertexArray(this.particleVAO);
    gl.drawElements(gl.TRIANGLES, n * 6, gl.UNSIGNED_INT, 0);
    this.stats.drawCalls++;
  }

  /** First-person held item, drawn in view space over everything else. */
  drawHand(ctx, dayLight, settings, fog, fogNear, fogFar) {
    const gl = this.gl;
    const { camera, heldItem } = ctx;
    gl.clear(gl.DEPTH_BUFFER_BIT);
    const E = this.pEntity.use();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.tex);
    E.set1i('uAtlas', 0);
    const proj = mat4();
    mPerspective(proj, 68 * Math.PI / 180, this.aspect, 0.02, 6);
    E.setMat('uVP', proj);
    E.set2f('uShear', 0, 0);
    E.set1f('uBase', 0.5);
    E.set2f('uBandRange', -1e9, 1e9);
    E.set3f('uCamPos', 0, 0, 0);
    E.set3f('uFogColor', fog[0], fog[1], fog[2]);
    E.set1f('uFogNear', 1e6);
    E.set1f('uFogFar', 1e7);
    E.set1f('uDayLight', 1);
    E.set1f('uBrightness', settings.brightness);
    E.set1f('uPhase', ctx.handPhase ?? 0);
    E.set1f('uHurt', 0);
    E.set1f('uAlpha', 1);
    E.set1f('uEmissive', 0);
    E.set1f('uLight', Math.max(0.35, ctx.handLight ?? 0.8));
    E.set1f('uTime', ctx.elapsed);

    const sw = ctx.swing ?? 0;
    const sx = 0.56 - Math.sin(sw * Math.PI) * 0.18;
    const sy = -0.46 - Math.abs(Math.sin(sw * Math.PI * 2)) * 0.16 + (ctx.bobY ?? 0) * 0.4;
    const sz = -0.72 + Math.sin(sw * Math.PI) * 0.22;

    const A = mat4(), B = mat4(), M = mat4();
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    if (heldItem && heldItem.blockId) {
      const b = BLOCKS[heldItem.blockId];
      gl.bindVertexArray(this.cubeVAO);
      mTranslate(A, sx, sy, sz);
      mRotY(B, -0.55 - sw * 0.7); mMul(M, A, B);
      mRotX(A, 0.28 + sw * 0.5); mMul(B, M, A); M.set(B);
      mRotZ(A, 0.12); mMul(B, M, A); M.set(B);
      mScale(A, 0.30, 0.30, 0.30); mMul(B, M, A); M.set(B);
      E.setMat('uModel', M);
      E.set3f('uColor', 1, 1, 1);
      for (let f = 0; f < 6; f++) {
        E.set1f('uTexLayer', texLayer(b.faces[f]));
        gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_INT, f * 6 * 4);
        this.stats.drawCalls++;
      }
    } else if (heldItem && heldItem.icon !== undefined) {
      gl.bindVertexArray(this.quadVAO);
      mTranslate(A, sx + 0.06, sy + 0.04, sz);
      mRotY(B, -0.62); mMul(M, A, B);
      mRotZ(A, -0.62 + sw * 0.9); mMul(B, M, A); M.set(B);
      mRotX(A, 0.12 + sw * 0.6); mMul(B, M, A); M.set(B);
      mScale(A, 0.42, 0.42, 0.42); mMul(B, M, A); M.set(B);
      E.setMat('uModel', M);
      E.set1f('uTexLayer', heldItem.icon);
      E.set3f('uColor', 1, 1, 1);
      gl.disable(gl.CULL_FACE);
      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_INT, 0);
      gl.enable(gl.CULL_FACE);
      this.stats.drawCalls++;
    } else {
      // bare hand
      gl.bindVertexArray(this.cubeVAO);
      mTranslate(A, sx + 0.05, sy - 0.04, sz + 0.05);
      mRotY(B, -0.45); mMul(M, A, B);
      mRotX(A, 0.55 + sw * 0.7); mMul(B, M, A); M.set(B);
      mScale(A, 0.14, 0.40, 0.14); mMul(B, M, A); M.set(B);
      E.setMat('uModel', M);
      E.set1f('uTexLayer', texLayer('mob_villager'));
      E.set3f('uColor', 1.05, 0.92, 0.82);
      gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_INT, 0);
      this.stats.drawCalls++;
    }
    gl.disable(gl.BLEND);
  }
}

// --- 4x4 inverse (column-major) -------------------------------------------
function invert(out, m) {
  const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3];
  const a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7];
  const a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11];
  const a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10;
  const b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31;
  const b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) return mIdentity(out);
  det = 1.0 / det;
  out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
  out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
  out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
  out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
  out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
  out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
  out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
  out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
  out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
  out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
  out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
  out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
  out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
  out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
  return out;
}
