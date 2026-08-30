// 4D-MC :: GLSL ------------------------------------------------------------
// The hyperslice lives here. Every world-space fragment computes
//
//     e = uBase + dot(uShear, worldPos.xz)
//
// and is thrown away unless it lands inside [0, 1) — the band belonging to the
// w-layer this draw call represents. Because the shear tilts the hyperplane,
// that test slices through individual voxels and leaves wedges and triangles
// at the seams, exactly the way a hyperplane cuts a tesseract.

export const COMMON = `
const float PI = 3.14159265359;

vec3 applyTint(vec3 c, uint tint, vec3 grassCol, vec3 leafCol) {
  if (tint == 1u) return c * grassCol;
  if (tint == 2u) return c * leafCol;
  if (tint == 3u) return c * vec3(0.45, 0.72, 1.05);
  return c;
}
`;

export const TERRAIN_VS = `#version 300 es
precision highp float;
precision highp int;

layout(location = 0) in vec3 aPos;
layout(location = 1) in uint aData;

uniform mat4 uVP;
uniform vec3 uChunkOrigin;
uniform vec2 uShear;
uniform float uBase;
uniform float uTime;

out vec3 vWorld;
out vec2 vUV;
flat out uint vTex;
flat out uint vFace;
flat out uint vTint;
out vec2 vLight;
out float vAO;
out float vE;

const vec2 UVS[4] = vec2[4](vec2(0.0, 1.0), vec2(1.0, 1.0), vec2(1.0, 0.0), vec2(0.0, 0.0));

void main() {
  vec3 world = aPos + uChunkOrigin;
  uint tex   = aData & 0x1ffu;
  uint face  = (aData >> 9) & 7u;
  uint sky   = (aData >> 12) & 15u;
  uint blk   = (aData >> 16) & 15u;
  uint ao    = (aData >> 20) & 3u;
  uint uv    = (aData >> 22) & 3u;
  uint tint  = (aData >> 24) & 7u;
  uint anim  = (aData >> 27) & 1u;

  vTex = tex;
  vFace = face;
  vTint = tint;
  vLight = vec2(float(sky) / 15.0, float(blk) / 15.0);
  vAO = 0.55 + 0.45 * (float(ao) / 3.0);
  vUV = UVS[uv];
  if (anim == 1u) vUV += vec2(0.0, fract(uTime * 0.35)) * 0.0;

  vWorld = world;
  vE = uBase + dot(uShear, world.xz);
  gl_Position = uVP * vec4(world, 1.0);
}
`;

export const TERRAIN_FS = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2DArray;

in vec3 vWorld;
in vec2 vUV;
flat in uint vTex;
flat in uint vFace;
flat in uint vTint;
in vec2 vLight;
in float vAO;
in float vE;

uniform sampler2DArray uAtlas;
uniform vec3 uCamPos;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uDayLight;
uniform float uBrightness;
uniform vec3 uGrassColor;
uniform vec3 uLeafColor;
uniform float uAlphaCutoff;
uniform float uSeamGlow;
uniform float uGlobalAlpha;
uniform float uTime;
uniform int uCrackStage;
uniform vec3 uCrackBlock;
uniform float uCrackLayer;
uniform int uDebug;

out vec4 outColor;

${COMMON}

const float SHADE[6] = float[6](0.80, 0.70, 1.0, 0.55, 0.88, 0.64);

void main() {
  if (uDebug != 4 && (vE < 0.0 || vE >= 1.0)) discard;
  if (uDebug == 1) { outColor = vec4(vec3(vLight.x), 1.0); return; }
  if (uDebug == 2) { outColor = vec4(float(vFace) / 5.0, 1.0 - float(vFace) / 5.0, 0.4, 1.0); return; }
  if (uDebug == 3) { outColor = vec4(vec3(vAO), 1.0); return; }
  if (uDebug == 5) { outColor = vec4(fract(vE), fract(vE * 3.0), 0.5, 1.0); return; }

  vec4 tex = texture(uAtlas, vec3(vUV, float(vTex)));
  if (tex.a < uAlphaCutoff) discard;

  vec3 c = applyTint(tex.rgb, vTint, uGrassColor, uLeafColor);

  // Night and deep caves stay dark, but never so dark you cannot navigate.
  float sky = vLight.x * max(uDayLight, 0.16);
  float blk = vLight.y;
  float light = clamp(max(sky, blk * 1.05) * 0.88 + 0.13, 0.0, 1.6);
  // block light leans warm, sky light leans cool
  vec3 lightCol = mix(vec3(1.0, 0.86, 0.68), vec3(0.86, 0.92, 1.06), clamp(sky / max(0.001, sky + blk), 0.0, 1.0));

  c *= SHADE[vFace] * light * vAO * uBrightness;
  c *= lightCol;

  // Seam shimmer: blocks that are only just inside the band pick up a faint
  // violet-cyan rim, so you can see matter fading into the slice.
  float edge = min(vE, 1.0 - vE);
  float rim = smoothstep(0.10, 0.0, edge);
  c += rim * uSeamGlow * vec3(0.16, 0.42, 0.55) * (0.6 + 0.4 * sin(uTime * 2.0 + vWorld.y));

  // block breaking overlay
  if (uCrackStage >= 0 &&
      abs(floor(vWorld.x + 0.001) - uCrackBlock.x) < 0.5 &&
      abs(floor(vWorld.y + 0.001) - uCrackBlock.y) < 0.5 &&
      abs(floor(vWorld.z + 0.001) - uCrackBlock.z) < 0.5) {
    vec4 cr = texture(uAtlas, vec3(vUV, uCrackLayer + float(uCrackStage)));
    c = mix(c, c * 0.25, cr.a);
  }

  float d = length(vWorld - uCamPos);
  float fog = clamp((d - uFogNear) / max(1.0, uFogFar - uFogNear), 0.0, 1.0);
  fog = fog * fog;
  c = mix(c, uFogColor, fog);

  outColor = vec4(c, tex.a * uGlobalAlpha);
}
`;

// --- cross-section caps ---------------------------------------------------
// A cap is a vertical quad living exactly on a band boundary. The vertex
// shader intersects the boundary plane with the voxel's footprint and emits
// the resulting segment; when the boundary misses the voxel the quad collapses
// to zero area and costs nothing.
export const CAP_VS = `#version 300 es
precision highp float;
precision highp int;

layout(location = 0) in vec3 aCell;
layout(location = 1) in uint aData;

uniform mat4 uVP;
uniform vec3 uChunkOrigin;
uniform vec2 uShear;
uniform float uBase;

out vec3 vWorld;
out vec2 vUV;
flat out uint vTex;
flat out uint vTint;
out vec2 vLight;
flat out float vSide;

void main() {
  uint corner = aData & 3u;
  uint side   = (aData >> 2) & 1u;
  vTex        = (aData >> 3) & 0x1ffu;
  uint sky    = (aData >> 12) & 15u;
  uint blk    = (aData >> 16) & 15u;
  vTint       = (aData >> 20) & 7u;
  vLight = vec2(float(sky) / 15.0, float(blk) / 15.0);
  vSide = float(side);

  vec3 origin = aCell + uChunkOrigin;
  vec2 cmin = origin.xz;
  vec2 cmax = cmin + vec2(1.0);

  vec2 n = uShear;
  float nn = max(dot(n, n), 1e-12);
  float C = float(side) - uBase;          // plane: dot(n, p) = C
  vec2 p0 = n * (C / nn);
  vec2 dir = normalize(vec2(n.y, -n.x));

  float tmin = -1e18, tmax = 1e18;
  if (abs(dir.x) > 1e-9) {
    float t1 = (cmin.x - p0.x) / dir.x;
    float t2 = (cmax.x - p0.x) / dir.x;
    tmin = max(tmin, min(t1, t2));
    tmax = min(tmax, max(t1, t2));
  } else if (p0.x < cmin.x || p0.x > cmax.x) { tmax = -1e18; tmin = 1e18; }
  if (abs(dir.y) > 1e-9) {
    float t1 = (cmin.y - p0.y) / dir.y;
    float t2 = (cmax.y - p0.y) / dir.y;
    tmin = max(tmin, min(t1, t2));
    tmax = min(tmax, max(t1, t2));
  } else if (p0.y < cmin.y || p0.y > cmax.y) { tmax = -1e18; tmin = 1e18; }

  vec3 pos;
  if (tmax <= tmin) {
    pos = vec3(cmin.x, origin.y, cmin.y);   // degenerate — no fragments
    vUV = vec2(0.0);
  } else {
    float t = (corner == 1u || corner == 2u) ? tmax : tmin;
    vec2 p = p0 + dir * t;
    float y = origin.y + ((corner >= 2u) ? 1.0 : 0.0);
    pos = vec3(p.x, y, p.y);
    // UV local to the voxel footprint: one tile per cut, texel density matched
    // to the block faces around it.
    vUV = vec2(dot(p - cmin, dir), -y);
  }
  vWorld = pos;
  gl_Position = uVP * vec4(pos, 1.0);
}
`;

export const CAP_FS = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2DArray;

in vec3 vWorld;
in vec2 vUV;
flat in uint vTex;
flat in uint vTint;
in vec2 vLight;
flat in float vSide;

uniform sampler2DArray uAtlas;
uniform vec3 uCamPos;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uDayLight;
uniform float uBrightness;
uniform vec3 uGrassColor;
uniform vec3 uLeafColor;
uniform float uSeamGlow;
uniform float uTime;

out vec4 outColor;

${COMMON}

void main() {
  vec4 tex = texture(uAtlas, vec3(vUV, float(vTex)));
  if (tex.a < 0.5) discard;
  vec3 c = applyTint(tex.rgb, vTint, uGrassColor, uLeafColor);

  float sky = vLight.x * max(uDayLight, 0.16);
  float light = clamp(max(sky, vLight.y * 1.05) * 0.88 + 0.13, 0.0, 1.6);

  // A cut face is not a real block face: desaturate it slightly and lay a
  // faint interference pattern over it so cross-sections read as cross-sections.
  float band = 0.90 + 0.10 * sin(vWorld.y * 6.2831 * 0.5 + uTime * 0.6);
  vec3 cut = mix(c, vec3(dot(c, vec3(0.33))), 0.22) * (vSide > 0.5 ? 0.66 : 0.74);
  cut *= light * band * uBrightness;
  cut += uSeamGlow * vec3(0.10, 0.30, 0.40) * (0.5 + 0.5 * sin(uTime * 1.7 + vWorld.y * 2.0));

  float d = length(vWorld - uCamPos);
  float fog = clamp((d - uFogNear) / max(1.0, uFogFar - uFogNear), 0.0, 1.0);
  fog = fog * fog;
  outColor = vec4(mix(cut, uFogColor, fog), 1.0);
}
`;

// --- sky ------------------------------------------------------------------
export const SKY_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
uniform mat4 uInvVP;
uniform vec3 uCamPos;
out vec3 vDir;
void main() {
  vec4 near = uInvVP * vec4(aPos, -1.0, 1.0);
  vec4 far  = uInvVP * vec4(aPos,  1.0, 1.0);
  vDir = normalize(far.xyz / far.w - near.xyz / near.w);
  gl_Position = vec4(aPos, 1.0, 1.0);
}
`;

export const SKY_FS = `#version 300 es
precision highp float;
in vec3 vDir;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uDayLight;
uniform float uTime;
uniform float uW;
out vec4 outColor;

float hash21(vec2 p) {
  p = fract(p * vec2(233.34, 851.73));
  p += dot(p, p + 23.45);
  return fract(p.x * p.y);
}

void main() {
  vec3 d = normalize(vDir);
  float up = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 c = mix(uHorizon, uZenith, pow(up, 0.85));

  // sun / moon disc
  float sd = dot(d, normalize(uSunDir));
  c += uSunColor * pow(max(sd, 0.0), 900.0) * 6.0;
  c += uSunColor * pow(max(sd, 0.0), 12.0) * 0.14;
  float md = dot(d, -normalize(uSunDir));
  c += vec3(0.85, 0.88, 1.0) * pow(max(md, 0.0), 1400.0) * 3.2 * (1.0 - uDayLight);

  // stars, faded out by daylight
  if (d.y > -0.05) {
    vec2 sp = d.xz / max(0.08, abs(d.y) + 0.35) * 40.0;
    float st = hash21(floor(sp));
    float tw = 0.5 + 0.5 * sin(uTime * 1.7 + st * 60.0);
    c += vec3(step(0.9965, st)) * (1.0 - uDayLight) * (0.6 + 0.6 * tw);
  }

  // slice aurora: faint bands that drift as the player moves through w
  float aur = sin(d.x * 3.0 + uW * 0.9) * sin(d.z * 2.4 - uW * 0.6);
  c += vec3(0.05, 0.10, 0.16) * max(0.0, aur) * smoothstep(0.0, 0.5, d.y) * (1.0 - uDayLight * 0.7);

  outColor = vec4(c, 1.0);
}
`;

// --- clouds ---------------------------------------------------------------
export const CLOUD_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPos;
uniform mat4 uVP;
uniform vec3 uOffset;
out vec2 vUV;
out vec3 vWorld;
void main() {
  vec3 p = aPos + uOffset;
  vWorld = p;
  vUV = p.xz * 0.0125;
  gl_Position = uVP * vec4(p, 1.0);
}
`;

export const CLOUD_FS = `#version 300 es
precision highp float;
in vec2 vUV;
in vec3 vWorld;
uniform vec3 uCamPos;
uniform vec3 uFogColor;
uniform float uDayLight;
uniform float uFogFar;
out vec4 outColor;

float hash21(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1, 0)), f.x),
             mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), f.x), f.y);
}

void main() {
  float n = vnoise(vUV) * 0.6 + vnoise(vUV * 2.3) * 0.3 + vnoise(vUV * 5.1) * 0.1;
  // chunky, beta-flavoured cloud edges rather than soft blobs
  float a = smoothstep(0.52, 0.62, n);
  if (a < 0.02) discard;
  vec3 col = mix(vec3(0.72, 0.75, 0.82), vec3(1.0, 0.99, 0.97), uDayLight);
  float d = length(vWorld.xz - uCamPos.xz);
  float fade = 1.0 - clamp(d / (uFogFar * 2.2), 0.0, 1.0);
  outColor = vec4(mix(uFogColor, col, fade), a * 0.86 * fade);
}
`;

// --- entities -------------------------------------------------------------
export const ENTITY_VS = `#version 300 es
precision highp float;
precision highp int;
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec2 aUV;

uniform mat4 uVP;
uniform mat4 uModel;
uniform vec2 uShear;
uniform float uBase;

out vec3 vWorld;
out vec3 vNormal;
out vec2 vUV;
out float vE;

void main() {
  vec4 wp = uModel * vec4(aPos, 1.0);
  vWorld = wp.xyz;
  vNormal = mat3(uModel) * aNormal;
  vUV = aUV;
  vE = uBase + dot(uShear, wp.xz);
  gl_Position = uVP * wp;
}
`;

export const ENTITY_FS = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2DArray;

in vec3 vWorld;
in vec3 vNormal;
in vec2 vUV;
in float vE;

uniform sampler2DArray uAtlas;
uniform float uTexLayer;
uniform vec3 uCamPos;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uDayLight;
uniform float uBrightness;
uniform vec3 uColor;
uniform float uLight;
uniform float uAlpha;
uniform float uHurt;
uniform float uPhase;      // 0 = fully inside the slice, 1 = deep in another
uniform float uEmissive;
uniform float uTime;
uniform vec2 uBandRange;   // visible e range for this entity

out vec4 outColor;

void main() {
  if (vE < uBandRange.x || vE > uBandRange.y) discard;

  vec4 tex = texture(uAtlas, vec3(vUV, uTexLayer));
  if (tex.a < 0.4) discard;

  vec3 n = normalize(vNormal);
  float diff = 0.55 + 0.45 * clamp(dot(n, normalize(vec3(0.45, 0.85, 0.28))), 0.0, 1.0);
  vec3 c = tex.rgb * uColor * diff * max(uLight, 0.12) * uBrightness;
  c = mix(c, vec3(1.0, 0.25, 0.22), uHurt * 0.6);
  c += uEmissive * tex.rgb * (0.5 + 0.5 * sin(uTime * 3.0));

  // creatures caught between slices get a scanline ghosting
  if (uPhase > 0.01) {
    float scan = 0.5 + 0.5 * sin(vWorld.y * 30.0 + uTime * 6.0);
    c = mix(c, vec3(0.45, 0.85, 0.95), uPhase * 0.45 * scan);
  }

  float d = length(vWorld - uCamPos);
  float fog = clamp((d - uFogNear) / max(1.0, uFogFar - uFogNear), 0.0, 1.0);
  fog = fog * fog;
  outColor = vec4(mix(c, uFogColor, fog), tex.a * uAlpha);
}
`;

// --- simple coloured lines (selection box, debug) -------------------------
export const LINE_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPos;
uniform mat4 uVP;
uniform vec3 uOffset;
uniform vec2 uShear;
uniform float uBase;
out float vE;
out vec3 vWorld;
void main() {
  vec3 p = aPos + uOffset;
  vWorld = p;
  vE = uBase + dot(uShear, p.xz);
  gl_Position = uVP * vec4(p, 1.0);
}
`;

export const LINE_FS = `#version 300 es
precision highp float;
in float vE;
in vec3 vWorld;
uniform vec4 uColor;
uniform int uClip;
out vec4 outColor;
void main() {
  if (uClip == 1 && (vE < -0.05 || vE > 1.05)) discard;
  outColor = uColor;
}
`;

// --- particles ------------------------------------------------------------
export const PARTICLE_VS = `#version 300 es
precision highp float;
precision highp int;
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec2 aCorner;
layout(location = 2) in vec4 aColorSize;   // rgb + size
layout(location = 3) in vec2 aMeta;        // texLayer, uvOffset seed

uniform mat4 uVP;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec2 uShear;
uniform float uW;

out vec2 vUV;
out vec3 vColor;
out float vE;
flat out float vTex;

void main() {
  vec3 p = aPos + uRight * aCorner.x * aColorSize.w + uUp * aCorner.y * aColorSize.w;
  vColor = aColorSize.rgb;
  vUV = fract(vec2(aMeta.y, aMeta.y * 1.7)) + (aCorner * 0.5 + 0.25) * 0.25;
  vTex = aMeta.x;
  vE = uW + dot(uShear, p.xz);
  gl_Position = uVP * vec4(p, 1.0);
}
`;

export const PARTICLE_FS = `#version 300 es
precision highp float;
precision highp sampler2DArray;
in vec2 vUV;
in vec3 vColor;
in float vE;
flat in float vTex;
uniform sampler2DArray uAtlas;
uniform float uBandLo;
uniform float uBandHi;
out vec4 outColor;
void main() {
  if (vE < uBandLo || vE > uBandHi) discard;
  vec4 t = texture(uAtlas, vec3(vUV, vTex));
  if (t.a < 0.4) discard;
  outColor = vec4(t.rgb * vColor, 1.0);
}
`;
