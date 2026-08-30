// 4D-MC :: texture atlas assembly ----------------------------------------
// All tiles land in one TEXTURE_2D_ARRAY. HTML-side inventory icons are baked
// separately: blocks become little isometric cubes, everything else is the raw
// 16x16 icon scaled up with nearest-neighbour.

import { buildBlockTextures } from './blockTextures.js';
import { buildItemTextures } from './itemTextures.js';
import { buildMobTextures } from './mobTextures.js';
import { TEX_SIZE } from './painter.js';
import { BLOCKS, BY_NAME } from './blocks.js';
import { ITEMS } from './items.js';

export const atlas = {
  index: {},        // texture name -> array layer
  layers: [],       // ImageData per layer
  painters: {},     // texture name -> Painter (for icon baking)
  size: TEX_SIZE,
  count: 0,
  iconURL: {},      // item name -> data URL
  iconCanvas: {},   // item name -> HTMLCanvasElement (for canvas HUD drawing)
};

export function buildAtlas() {
  const all = { ...buildBlockTextures(), ...buildItemTextures(), ...buildMobTextures() };
  const names = Object.keys(all);
  atlas.painters = all;
  atlas.layers = [];
  atlas.index = {};
  names.forEach((n, i) => {
    atlas.index[n] = i;
    atlas.layers.push(all[n].toImageData());
  });
  atlas.count = names.length;
  bakeIcons();
  return atlas;
}

export function texLayer(name) {
  const i = atlas.index[name];
  return i === undefined ? 0 : i;
}

// --- inventory icon baking ----------------------------------------------

function painterToCanvas(p, scale = 1) {
  const c = document.createElement('canvas');
  c.width = TEX_SIZE * scale; c.height = TEX_SIZE * scale;
  const ctx = c.getContext('2d');
  const tmp = document.createElement('canvas');
  tmp.width = tmp.height = TEX_SIZE;
  tmp.getContext('2d').putImageData(p.toImageData(), 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tmp, 0, 0, c.width, c.height);
  return c;
}

/**
 * Draw a 16x16 tile as one face of an isometric cube by shearing it into a
 * parallelogram. `mode` picks which of the three visible faces.
 */
function drawIsoFace(ctx, tile, mode, S, brightness) {
  const half = S / 2, q = S / 4;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (mode === 'top') {
    ctx.transform(1, 0.5, -1, 0.5, half, 0);
  } else if (mode === 'left') {
    ctx.transform(1, 0.5, 0, 1, 0, half * 0.5);
  } else {
    ctx.transform(-1, 0.5, 0, 1, S, 0);
    ctx.translate(0, half * 0.5);
  }
  ctx.globalAlpha = 1;
  ctx.drawImage(tile, 0, 0, half, half);
  ctx.restore();
  if (brightness !== 1) {
    // multiply-darken the face we just drew
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    ctx.restore();
  }
}

function bakeCubeIcon(blockName, S = 48) {
  const b = BY_NAME[blockName];
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  if (!b) return c;

  const tileTop = painterToCanvas(atlas.painters[b.faces[2]] || atlas.painters.stone, 4);
  const tileL = painterToCanvas(atlas.painters[b.faces[5]] || atlas.painters.stone, 4);
  const tileR = painterToCanvas(atlas.painters[b.faces[0]] || atlas.painters.stone, 4);

  if (b.render === 1 || b.render === 3 || b.render === 4) {  // cross / torch / ladder — flat
    const t = painterToCanvas(atlas.painters[b.faces[0]] || atlas.painters.stone, 4);
    ctx.drawImage(t, S * 0.08, S * 0.08, S * 0.84, S * 0.84);
    return c;
  }

  const w = S * 0.82, h = w * 0.5;
  const cx = S / 2, cy = S * 0.5;
  const topY = cy - h * 0.62;

  const face = (tile, pts, shadeF) => {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.clip();
    // affine map the square tile onto the parallelogram (p0=origin, p1=+u, p3=+v)
    const [p0, p1, , p3] = pts;
    const ux = (p1[0] - p0[0]) / 16, uy = (p1[1] - p0[1]) / 16;
    const vx = (p3[0] - p0[0]) / 16, vy = (p3[1] - p0[1]) / 16;
    ctx.setTransform(ux, uy, vx, vy, p0[0], p0[1]);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tile, 0, 0, 16, 16);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = `rgba(0,0,0,${1 - shadeF})`;
    ctx.fill();
    ctx.restore();
  };

  const tN = [cx, topY];
  const tE = [cx + w / 2, topY + h / 2];
  const tS = [cx, topY + h];
  const tW = [cx - w / 2, topY + h / 2];
  const bS = [cx, topY + h + h * 0.95];
  const bE = [cx + w / 2, topY + h / 2 + h * 0.95];
  const bW = [cx - w / 2, topY + h / 2 + h * 0.95];

  face(tileTop, [tW, tN, tE, tS], 1.0);
  face(tileL, [tW, tS, bS, bW], 0.72);
  face(tileR, [tS, tE, bE, bS], 0.56);

  if (!b.opaque) { /* transparent blocks keep their alpha from the tiles */ }
  return c;
}

function bakeIcons() {
  for (const [name, it] of Object.entries(ITEMS)) {
    let canvas;
    if (it.isBlockIcon && BY_NAME[it.place]) canvas = bakeCubeIcon(it.place, 48);
    else canvas = painterToCanvas(atlas.painters[it.icon] || atlas.painters.stick, 3);
    atlas.iconCanvas[name] = canvas;
    try { atlas.iconURL[name] = canvas.toDataURL(); } catch (_) { atlas.iconURL[name] = ''; }
  }
}

export function iconFor(itemName) { return atlas.iconURL[itemName] || ''; }
export function iconCanvasFor(itemName) { return atlas.iconCanvas[itemName] || null; }
