// 4D-MC :: heads-up display ----------------------------------------------
//
// Drawn on a single 2D canvas so it stays crisp and cheap. The look is its own
// thing rather than a copy of anything: chamfered obsidian plates, a hotbar
// carried on a shallow rail, vital signs as segmented arcs down the left edge,
// and — bottom right — the Tesseract Compass, a real cross-section readout of
// where the player sits along the fourth axis.

import { W_LAYERS } from '../core/constants.js';
import { iconCanvasFor } from '../world/atlas.js';
import { ITEMS } from '../world/items.js';
import { BIOMES } from '../world/biomes.js';
import { clamp, lerp, mod } from '../core/math.js';

const ACCENT = '#4fe5d7';
const ACCENT_DIM = 'rgba(79,229,215,0.35)';
const VIOLET = '#a487ff';
const PLATE = 'rgba(12,11,20,0.66)';
const PLATE_EDGE = 'rgba(150,170,210,0.22)';
const HEALTH = '#e05a63';
const FOOD = '#e0a03c';
const BREATH = '#5ab4e0';
const XP_COL = '#9ddc4a';

/** Rounded-with-chamfered-corners plate — the signature panel shape. */
function chamfer(ctx, x, y, w, h, c = 7) {
  ctx.beginPath();
  ctx.moveTo(x + c, y);
  ctx.lineTo(x + w - c, y);
  ctx.lineTo(x + w, y + c);
  ctx.lineTo(x + w, y + h - c);
  ctx.lineTo(x + w - c, y + h);
  ctx.lineTo(x + c, y + h);
  ctx.lineTo(x, y + h - c);
  ctx.lineTo(x, y + c);
  ctx.closePath();
}

function plate(ctx, x, y, w, h, c = 7, fill = PLATE, stroke = PLATE_EDGE) {
  chamfer(ctx, x, y, w, h, c);
  ctx.fillStyle = fill; ctx.fill();
  ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke();
}

// --- tesseract geometry ---------------------------------------------------
const TESS_V = [];
for (let i = 0; i < 16; i++)
  TESS_V.push([(i & 1) ? 1 : -1, (i & 2) ? 1 : -1, (i & 4) ? 1 : -1, (i & 8) ? 1 : -1]);
const TESS_E = [];
for (let i = 0; i < 16; i++)
  for (let b = 0; b < 4; b++) {
    const j = i ^ (1 << b);
    if (j > i) TESS_E.push([i, j]);
  }

export class HUD {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.toasts = [];
    this.itemLabel = null;
    this.itemLabelTime = 0;
    this.time = 0;
    this.hitMarker = 0;
    this.damageFlash = 0;
    this.scale = 1;
    this.dialogue = null;
    this.dialogueTime = 0;
    this.achievement = null;
    this.achievementTime = 0;
  }

  toast(text, color = ACCENT) {
    this.toasts.push({ text, color, life: 3.2 });
    if (this.toasts.length > 6) this.toasts.shift();
  }

  showItem(name) {
    this.itemLabel = name;
    this.itemLabelTime = 2.2;
  }

  say(speaker, text) {
    this.dialogue = { speaker, text };
    this.dialogueTime = 6.5;
  }

  unlock(title, sub) {
    this.achievement = { title, sub };
    this.achievementTime = 5.0;
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(this.canvas.clientWidth * dpr);
    const h = Math.floor(this.canvas.clientHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h;
    }
    this.dpr = dpr;
    this.W = this.canvas.clientWidth;
    this.H = this.canvas.clientHeight;
    this.scale = clamp(Math.min(this.W / 1280, this.H / 760), 0.62, 1.5);
  }

  draw(state, dt) {
    this.resize();
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.W, this.H);
    this.time += dt;

    for (let i = this.toasts.length - 1; i >= 0; i--) {
      this.toasts[i].life -= dt;
      if (this.toasts[i].life <= 0) this.toasts.splice(i, 1);
    }
    this.itemLabelTime = Math.max(0, this.itemLabelTime - dt);
    this.dialogueTime = Math.max(0, this.dialogueTime - dt);
    this.achievementTime = Math.max(0, this.achievementTime - dt);
    this.hitMarker = Math.max(0, this.hitMarker - dt * 3);
    this.damageFlash = Math.max(0, this.damageFlash - dt * 1.8);

    if (state.player.hurtTime > 0.3) this.damageFlash = 1;

    this.drawVignette(state);
    if (!state.hideHud) {
      this.drawCrosshair(state);
      this.drawVitals(state);
      this.drawHotbar(state);
      this.drawSliceRibbon(state);
      this.drawCompass(state);
      this.drawContextChip(state);
      this.drawToasts(state);
      this.drawDialogue(state);
      this.drawAchievement(state);
      if (state.settings.showFps || state.debug) this.drawStats(state);
    }
  }

  // --- overlays -----------------------------------------------------------
  drawVignette(state) {
    const ctx = this.ctx;
    if (this.damageFlash > 0.01) {
      ctx.save();
      const g = ctx.createRadialGradient(this.W / 2, this.H / 2, Math.min(this.W, this.H) * 0.25,
        this.W / 2, this.H / 2, Math.max(this.W, this.H) * 0.62);
      g.addColorStop(0, 'rgba(190,20,30,0)');
      g.addColorStop(1, `rgba(190,20,30,${0.55 * this.damageFlash})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.W, this.H);
      ctx.restore();
    }
    if (state.player.shifting) {
      // a faint interference wash while travelling through w
      ctx.save();
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = VIOLET;
      for (let y = 0; y < this.H; y += 4) {
        const a = 0.25 + 0.25 * Math.sin(y * 0.08 + this.time * 5);
        ctx.globalAlpha = 0.05 * a;
        ctx.fillRect(0, y, this.W, 1.4);
      }
      ctx.restore();
      const g = this.ctx.createLinearGradient(0, 0, this.W, 0);
      g.addColorStop(0, 'rgba(79,229,215,0.16)');
      g.addColorStop(0.5, 'rgba(79,229,215,0)');
      g.addColorStop(1, 'rgba(164,135,255,0.16)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.W, this.H);
    }
  }

  drawCrosshair(state) {
    const ctx = this.ctx;
    const cx = this.W / 2, cy = this.H / 2;
    const s = this.scale;
    ctx.save();
    ctx.lineCap = 'round';
    const shifting = state.player.shifting;
    const grow = shifting ? 1 + Math.sin(this.time * 4) * 0.12 : 1;

    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = shifting ? ACCENT : 'rgba(240,246,255,0.88)';
    ctx.lineWidth = 1.8 * s;
    const r0 = 3.2 * s * grow, r1 = 9.5 * s * grow;
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2 + (shifting ? Math.PI / 4 : 0);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      ctx.stroke();
    }
    if (shifting) {
      // the "ana / kata" pair only appears while travelling
      ctx.strokeStyle = VIOLET;
      ctx.lineWidth = 1.2 * s;
      ctx.beginPath();
      ctx.arc(cx, cy, 15 * s * grow, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([3 * s, 5 * s]);
      ctx.beginPath();
      ctx.arc(cx, cy, 21 * s, this.time * 1.4, this.time * 1.4 + Math.PI * 1.2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.beginPath();
    ctx.arc(cx, cy, 1.2 * s, 0, Math.PI * 2);
    ctx.fillStyle = shifting ? ACCENT : '#f0f6ff';
    ctx.fill();

    if (this.hitMarker > 0) {
      ctx.strokeStyle = `rgba(255,90,80,${this.hitMarker})`;
      ctx.lineWidth = 2.4 * s;
      const d = 6 * s, o = 13 * s;
      for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        ctx.beginPath();
        ctx.moveTo(cx + sx * d, cy + sy * d);
        ctx.lineTo(cx + sx * o, cy + sy * o);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // --- vitals -------------------------------------------------------------
  drawVitals(state) {
    const ctx = this.ctx;
    const p = state.player;
    const s = this.scale;
    const x = 26 * s;
    const bottom = this.H - 34 * s;
    const h = 150 * s;

    const bar = (bx, value, max, color, label, segments) => {
      const w = 9 * s;
      ctx.save();
      plate(ctx, bx - 3 * s, bottom - h - 3 * s, w + 6 * s, h + 6 * s, 4 * s,
        'rgba(10,10,18,0.55)', 'rgba(150,170,210,0.16)');
      const frac = clamp(value / max, 0, 1);
      const segH = h / segments;
      for (let i = 0; i < segments; i++) {
        const segFrac = clamp(frac * segments - i, 0, 1);
        const y = bottom - (i + 1) * segH + 1.2 * s;
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.fillRect(bx, y, w, segH - 2.4 * s);
        if (segFrac > 0) {
          ctx.fillStyle = color;
          ctx.globalAlpha = 0.35 + 0.65 * segFrac;
          ctx.fillRect(bx, y + (segH - 2.4 * s) * (1 - segFrac), w, (segH - 2.4 * s) * segFrac);
          ctx.globalAlpha = 1;
        }
      }
      ctx.fillStyle = color;
      ctx.font = `600 ${8 * s}px ui-monospace, Menlo, Consolas, monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(label, bx + w / 2, bottom + 12 * s);
      ctx.restore();
    };

    if (p.gameMode !== 'creative') {
      bar(x, p.health, p.maxHealth, HEALTH, 'HP', 10);
      bar(x + 20 * s, p.hunger, p.maxHunger, FOOD, 'NRG', 10);
      if (p.breath < p.maxBreath) bar(x + 40 * s, p.breath, p.maxBreath, BREATH, 'O2', 10);
    }

    // armour pips
    const armor = state.inventory.armorValue();
    if (armor > 0) {
      ctx.save();
      ctx.fillStyle = 'rgba(190,210,240,0.85)';
      ctx.font = `600 ${9 * s}px ui-monospace, monospace`;
      ctx.textAlign = 'left';
      ctx.fillText(`⛊ ${armor}`, x, bottom - h - 12 * s);
      ctx.restore();
    }
  }

  // --- hotbar -------------------------------------------------------------
  drawHotbar(state) {
    const ctx = this.ctx;
    const s = this.scale;
    const slot = 46 * s;
    const gap = 5 * s;
    const n = 9;
    const totalW = n * slot + (n - 1) * gap;
    const x0 = (this.W - totalW) / 2;
    const y0 = this.H - slot - 26 * s;

    // the rail the slots ride on
    ctx.save();
    plate(ctx, x0 - 12 * s, y0 - 8 * s, totalW + 24 * s, slot + 20 * s, 10 * s,
      'rgba(10,10,18,0.5)', 'rgba(150,170,210,0.14)');
    ctx.strokeStyle = ACCENT_DIM;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0 - 4 * s, y0 + slot + 6 * s);
    ctx.lineTo(x0 + totalW + 4 * s, y0 + slot + 6 * s);
    ctx.stroke();
    ctx.restore();

    for (let i = 0; i < n; i++) {
      const sel = i === state.inventory.selected;
      const x = x0 + i * (slot + gap);
      const y = y0 - (sel ? 6 * s : 0);
      const sz = slot + (sel ? 4 * s : 0);
      ctx.save();
      plate(ctx, x - (sel ? 2 * s : 0), y, sz, sz, 6 * s,
        sel ? 'rgba(24,30,44,0.88)' : 'rgba(14,14,24,0.62)',
        sel ? ACCENT : 'rgba(150,170,210,0.2)');
      if (sel) {
        ctx.shadowColor = ACCENT; ctx.shadowBlur = 10 * s;
        chamfer(ctx, x - 2 * s, y, sz, sz, 6 * s);
        ctx.strokeStyle = ACCENT; ctx.lineWidth = 1.4; ctx.stroke();
        ctx.shadowBlur = 0;
        // corner brackets
        ctx.strokeStyle = ACCENT;
        ctx.lineWidth = 2;
        const b = 7 * s;
        ctx.beginPath();
        ctx.moveTo(x - 2 * s, y + b); ctx.lineTo(x - 2 * s, y); ctx.lineTo(x - 2 * s + b, y);
        ctx.moveTo(x - 2 * s + sz - b, y + sz); ctx.lineTo(x - 2 * s + sz, y + sz); ctx.lineTo(x - 2 * s + sz, y + sz - b);
        ctx.stroke();
      }
      ctx.restore();
      this.drawSlotContents(state.inventory.get(i), x + (sel ? -2 * s : 0), y, sz, s);
      // slot number
      ctx.save();
      ctx.font = `600 ${8 * s}px ui-monospace, monospace`;
      ctx.fillStyle = sel ? ACCENT : 'rgba(190,205,230,0.4)';
      ctx.textAlign = 'left';
      ctx.fillText(String(i + 1), x + 3 * s, y + 10 * s);
      ctx.restore();
    }

    // held item name
    if (this.itemLabelTime > 0 && this.itemLabel) {
      const a = clamp(this.itemLabelTime / 0.6, 0, 1);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.font = `600 ${13 * s}px ui-monospace, monospace`;
      ctx.textAlign = 'center';
      const it = ITEMS[this.itemLabel];
      const rarity = it ? it.rarity : 'common';
      ctx.fillStyle = rarity === 'epic' ? VIOLET : rarity === 'rare' ? ACCENT : '#e8eef8';
      ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 4;
      ctx.fillText(it ? it.display : this.itemLabel, this.W / 2, y0 - 18 * s);
      if (it && it.lore) {
        ctx.globalAlpha = a * 0.7;
        ctx.font = `${10 * s}px ui-monospace, monospace`;
        ctx.fillStyle = 'rgba(190,205,230,0.8)';
        ctx.fillText(it.lore, this.W / 2, y0 - 5 * s);
      }
      ctx.restore();
    }

    // XP rail under the hotbar
    const p = state.player;
    const need = 12 + p.level * 6;
    const frac = clamp(p.xp / need, 0, 1);
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(x0, y0 + slot + 10 * s, totalW, 3 * s);
    ctx.fillStyle = XP_COL;
    ctx.fillRect(x0, y0 + slot + 10 * s, totalW * frac, 3 * s);
    if (p.level > 0) {
      ctx.font = `700 ${10 * s}px ui-monospace, monospace`;
      ctx.textAlign = 'center';
      ctx.fillStyle = XP_COL;
      ctx.fillText(String(p.level), this.W / 2, y0 + slot + 22 * s);
    }
    ctx.restore();
  }

  drawSlotContents(item, x, y, size, s) {
    if (!item) return;
    const ctx = this.ctx;
    const icon = iconCanvasFor(item.name);
    const pad = size * 0.14;
    if (icon) {
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(icon, x + pad, y + pad, size - pad * 2, size - pad * 2);
      ctx.restore();
    }
    if (item.count > 1) {
      ctx.save();
      ctx.font = `700 ${11 * s}px ui-monospace, monospace`;
      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(0,0,0,0.85)';
      ctx.fillText(String(item.count), x + size - 3 * s + 1, y + size - 4 * s + 1);
      ctx.fillStyle = '#f4f7ff';
      ctx.fillText(String(item.count), x + size - 3 * s, y + size - 4 * s);
      ctx.restore();
    }
    const def = ITEMS[item.name];
    if (def && def.durability && item.durability < def.durability) {
      const frac = clamp(item.durability / def.durability, 0, 1);
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(x + 5 * s, y + size - 9 * s, size - 10 * s, 3.4 * s);
      ctx.fillStyle = `hsl(${frac * 120}, 82%, 52%)`;
      ctx.fillRect(x + 5 * s, y + size - 9 * s, (size - 10 * s) * frac, 3.4 * s);
      ctx.restore();
    }
  }

  // --- slice ribbon (top centre) ------------------------------------------
  drawSliceRibbon(state) {
    const ctx = this.ctx;
    const s = this.scale;
    const slice = state.world.slice;
    const wNow = slice.at(state.player.x, state.player.z);
    const W = 420 * s, H = 22 * s;
    const x0 = (this.W - W) / 2, y0 = 14 * s;

    ctx.save();
    plate(ctx, x0, y0, W, H, 6 * s, 'rgba(10,10,18,0.5)', 'rgba(150,170,210,0.16)');

    // The ribbon shows five bands either side of the player, horizontally,
    // exactly the axis the scroll wheel drives.
    const span = 5;
    const cellW = W / (span * 2 + 1);
    const frac = wNow - Math.floor(wNow);
    for (let i = -span; i <= span; i++) {
      const band = Math.floor(wNow) + i;
      const layer = mod(band, W_LAYERS);
      const cx = x0 + W / 2 + (i - frac + 0.5) * cellW;
      if (cx < x0 - cellW || cx > x0 + W + cellW) continue;
      const dist = Math.abs(i - frac + 0.5);
      const a = clamp(1 - dist / (span + 0.6), 0.08, 1);
      const cur = band === Math.floor(wNow);
      ctx.globalAlpha = a;
      ctx.fillStyle = cur ? ACCENT : 'rgba(160,180,215,0.45)';
      const bh = cur ? H * 0.62 : H * 0.34;
      ctx.fillRect(cx - cellW * 0.36, y0 + (H - bh) / 2, cellW * 0.72, bh);
      ctx.globalAlpha = a * 0.9;
      ctx.font = `700 ${8 * s}px ui-monospace, monospace`;
      ctx.textAlign = 'center';
      ctx.fillStyle = cur ? '#08131a' : 'rgba(20,24,34,0.9)';
      if (cellW > 22 * s) ctx.fillText(String(layer), cx, y0 + H / 2 + 3 * s);
    }
    ctx.globalAlpha = 1;

    // centre marker = the player
    ctx.strokeStyle = '#f2f7ff';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x0 + W / 2, y0 - 3 * s);
    ctx.lineTo(x0 + W / 2, y0 + H + 3 * s);
    ctx.stroke();

    ctx.font = `600 ${8.5 * s}px ui-monospace, monospace`;
    ctx.fillStyle = 'rgba(180,198,228,0.75)';
    ctx.textAlign = 'right';
    ctx.fillText('KATA ◀', x0 - 8 * s, y0 + H / 2 + 3 * s);
    ctx.textAlign = 'left';
    ctx.fillText('▶ ANA', x0 + W + 8 * s, y0 + H / 2 + 3 * s);
    ctx.restore();
  }

  // --- Tesseract Compass (bottom right) -----------------------------------
  drawCompass(state) {
    const ctx = this.ctx;
    const s = this.scale;
    const size = 168 * s;
    const x0 = this.W - size - 18 * s;
    const y0 = this.H - size - 18 * s;
    const slice = state.world.slice;
    const p = state.player;
    const wNow = slice.at(p.x, p.z);
    const layer = mod(Math.floor(wNow), W_LAYERS);
    const frac = wNow - Math.floor(wNow);

    ctx.save();
    plate(ctx, x0, y0, size, size, 10 * s, 'rgba(9,9,16,0.72)', 'rgba(150,170,210,0.22)');

    // header
    ctx.font = `700 ${9 * s}px ui-monospace, monospace`;
    ctx.fillStyle = ACCENT_DIM;
    ctx.textAlign = 'left';
    ctx.fillText('HYPERSLICE', x0 + 10 * s, y0 + 14 * s);
    ctx.textAlign = 'right';
    ctx.fillStyle = p.shifting ? ACCENT : 'rgba(160,180,215,0.5)';
    ctx.fillText(p.shifting ? 'TRAVERSING' : 'LOCKED', x0 + size - 10 * s, y0 + 14 * s);

    // --- 3D cross-section diagram: a tesseract cut by the viewing hyperplane
    const cx = x0 + size / 2, cy = y0 + size * 0.44;
    const R = size * 0.235;
    const t = this.time;
    // 4D rotation: the xw plane turns with the player's actual w position, so
    // the drawing *is* the readout, not decoration.
    const aXW = frac * Math.PI * 0.5 + 0.35;
    const aYZ = t * 0.22;
    const aXY = 0.52;
    const proj = TESS_V.map((v) => {
      let [X, Y, Z, Wc] = v;
      let c = Math.cos(aXW), sn = Math.sin(aXW);
      [X, Wc] = [X * c - Wc * sn, X * sn + Wc * c];
      c = Math.cos(aYZ); sn = Math.sin(aYZ);
      [Y, Z] = [Y * c - Z * sn, Y * sn + Z * c];
      c = Math.cos(aXY); sn = Math.sin(aXY);
      [X, Y] = [X * c - Y * sn, X * sn + Y * c];
      // 4D -> 3D perspective, then 3D -> 2D
      const k4 = 2.4 / (2.4 - Wc * 0.55);
      const x3 = X * k4, y3 = Y * k4, z3 = Z * k4;
      const k3 = 2.6 / (2.6 - z3 * 0.5);
      return { x: cx + x3 * R * k3, y: cy - y3 * R * k3, depth: z3, w: Wc };
    });

    for (const [a, b] of TESS_E) {
      const A = proj[a], B = proj[b];
      const inner = (TESS_V[a][3] > 0) === (TESS_V[b][3] > 0);
      const wSide = TESS_V[a][3] > 0 && TESS_V[b][3] > 0;
      ctx.strokeStyle = inner
        ? (wSide ? 'rgba(164,135,255,0.75)' : 'rgba(120,150,190,0.42)')
        : ACCENT_DIM;
      ctx.lineWidth = (inner && wSide ? 1.5 : 1) * s;
      ctx.beginPath();
      ctx.moveTo(A.x, A.y);
      ctx.lineTo(B.x, B.y);
      ctx.stroke();
    }

    // the cutting hyperplane: a horizontal blade sweeping with `frac`
    const bladeY = cy - R * 1.15 + frac * R * 2.3;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createLinearGradient(cx - R * 1.4, 0, cx + R * 1.4, 0);
    g.addColorStop(0, 'rgba(79,229,215,0)');
    g.addColorStop(0.5, 'rgba(79,229,215,0.85)');
    g.addColorStop(1, 'rgba(79,229,215,0)');
    ctx.strokeStyle = g;
    ctx.lineWidth = 2 * s;
    ctx.beginPath();
    ctx.moveTo(cx - R * 1.35, bladeY);
    ctx.lineTo(cx + R * 1.35, bladeY);
    ctx.stroke();
    ctx.fillStyle = 'rgba(79,229,215,0.10)';
    ctx.fillRect(cx - R * 1.35, bladeY - 3 * s, R * 2.7, 6 * s);
    ctx.restore();

    // --- horizontal slice ladder: which layer are we standing in
    const lx = x0 + 12 * s, lw = size - 24 * s;
    const ly = y0 + size - 38 * s;
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.fillRect(lx, ly, lw, 10 * s);
    const cell = lw / W_LAYERS;
    for (let i = 0; i < W_LAYERS; i++) {
      const active = i === layer;
      ctx.fillStyle = active ? ACCENT : 'rgba(150,175,210,0.24)';
      ctx.fillRect(lx + i * cell + 1, ly + (active ? 0 : 3 * s), cell - 2, active ? 10 * s : 4 * s);
    }
    // smooth marker riding between cells
    const mx = lx + mod(wNow, W_LAYERS) * cell;
    ctx.save();
    ctx.shadowColor = ACCENT; ctx.shadowBlur = 8 * s;
    ctx.fillStyle = '#eafcfa';
    ctx.beginPath();
    ctx.moveTo(mx, ly - 4 * s);
    ctx.lineTo(mx + 4 * s, ly - 9 * s);
    ctx.lineTo(mx - 4 * s, ly - 9 * s);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // numeric readout
    ctx.font = `700 ${13 * s}px ui-monospace, monospace`;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#eafcfa';
    ctx.fillText(`W ${mod(wNow, W_LAYERS).toFixed(2)}`, x0 + 12 * s, y0 + size - 12 * s);
    ctx.font = `600 ${9 * s}px ui-monospace, monospace`;
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(170,190,220,0.7)';
    ctx.fillText(`LAYER ${layer} / ${W_LAYERS}`, x0 + size - 12 * s, y0 + size - 12 * s);

    if (p.shiftBlocked > 0.02) {
      ctx.save();
      ctx.globalAlpha = clamp(p.shiftBlocked, 0, 1);
      ctx.fillStyle = '#ff6b5e';
      ctx.font = `700 ${10 * s}px ui-monospace, monospace`;
      ctx.textAlign = 'center';
      ctx.fillText('PHASE BLOCKED', x0 + size / 2, y0 + size * 0.80);
      ctx.restore();
    }
    ctx.restore();
  }

  // --- context chip (top left) --------------------------------------------
  drawContextChip(state) {
    const ctx = this.ctx;
    const s = this.scale;
    const p = state.player;
    const biome = BIOMES[state.world.biomeAtSlice(p.x, p.z)] || BIOMES[2];
    const t = state.world.time;
    const hours = Math.floor(t * 24), mins = Math.floor((t * 24 % 1) * 60);
    const lines = [
      biome.display,
      `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`,
    ];
    ctx.save();
    ctx.font = `600 ${10 * s}px ui-monospace, monospace`;
    const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 22 * s;
    plate(ctx, 14 * s, 14 * s, w, 34 * s, 5 * s, 'rgba(10,10,18,0.5)', 'rgba(150,170,210,0.14)');
    ctx.fillStyle = '#dfe8f6';
    ctx.textAlign = 'left';
    ctx.fillText(lines[0], 24 * s, 27 * s);
    ctx.fillStyle = 'rgba(170,190,220,0.7)';
    ctx.fillText(lines[1], 24 * s, 41 * s);
    ctx.restore();
  }

  drawToasts(state) {
    const ctx = this.ctx;
    const s = this.scale;
    ctx.save();
    ctx.font = `600 ${11 * s}px ui-monospace, monospace`;
    ctx.textAlign = 'right';
    let y = this.H * 0.34;
    for (let i = this.toasts.length - 1; i >= 0; i--) {
      const t = this.toasts[i];
      const a = clamp(t.life / 0.5, 0, 1);
      ctx.globalAlpha = a;
      const w = ctx.measureText(t.text).width + 20 * s;
      plate(ctx, this.W - w - 16 * s, y - 14 * s, w, 22 * s, 4 * s,
        'rgba(10,10,18,0.6)', 'rgba(150,170,210,0.14)');
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, this.W - 26 * s, y + 1 * s);
      y -= 27 * s;
    }
    ctx.restore();
  }

  drawDialogue(state) {
    if (this.dialogueTime <= 0 || !this.dialogue) return;
    const ctx = this.ctx;
    const s = this.scale;
    const a = clamp(this.dialogueTime / 0.6, 0, 1);
    const W = Math.min(640 * s, this.W - 60 * s);
    const H = 66 * s;
    const x0 = (this.W - W) / 2, y0 = this.H - 200 * s;
    ctx.save();
    ctx.globalAlpha = a;
    plate(ctx, x0, y0, W, H, 8 * s, 'rgba(8,8,15,0.86)', ACCENT_DIM);
    ctx.fillStyle = ACCENT;
    ctx.font = `700 ${11 * s}px ui-monospace, monospace`;
    ctx.textAlign = 'left';
    ctx.fillText(this.dialogue.speaker.toUpperCase(), x0 + 16 * s, y0 + 20 * s);
    ctx.fillStyle = '#e6edf8';
    ctx.font = `${12 * s}px ui-monospace, monospace`;
    wrapText(ctx, this.dialogue.text, x0 + 16 * s, y0 + 40 * s, W - 32 * s, 15 * s);
    ctx.restore();
  }

  drawAchievement(state) {
    if (this.achievementTime <= 0 || !this.achievement) return;
    const ctx = this.ctx;
    const s = this.scale;
    const a = clamp(this.achievementTime / 0.7, 0, 1);
    const W = 300 * s, H = 56 * s;
    const slideIn = clamp((5.0 - this.achievementTime) * 4, 0, 1);
    const x0 = this.W - W - 18 * s;
    const y0 = 60 * s - (1 - slideIn) * 70 * s;
    ctx.save();
    ctx.globalAlpha = a;
    plate(ctx, x0, y0, W, H, 8 * s, 'rgba(14,10,26,0.9)', VIOLET);
    ctx.fillStyle = VIOLET;
    ctx.font = `700 ${9 * s}px ui-monospace, monospace`;
    ctx.textAlign = 'left';
    ctx.fillText('DISCOVERY', x0 + 14 * s, y0 + 18 * s);
    ctx.fillStyle = '#f0eaff';
    ctx.font = `700 ${13 * s}px ui-monospace, monospace`;
    ctx.fillText(this.achievement.title, x0 + 14 * s, y0 + 36 * s);
    ctx.fillStyle = 'rgba(200,190,235,0.75)';
    ctx.font = `${9.5 * s}px ui-monospace, monospace`;
    ctx.fillText(this.achievement.sub, x0 + 14 * s, y0 + 49 * s);
    ctx.restore();
  }

  drawStats(state) {
    const ctx = this.ctx;
    const s = this.scale;
    const p = state.player;
    const slice = state.world.slice;
    const lines = [`${state.fps.toFixed(0)} fps`];
    if (state.debug) {
      lines.push(
        `xyz ${p.x.toFixed(1)} ${p.y.toFixed(1)} ${p.z.toFixed(1)}`,
        `w ${slice.w.toFixed(3)}  local ${slice.at(p.x, p.z).toFixed(3)}  layer ${slice.layerAt(p.x, p.z)}`,
        `shear ${slice.ax.toFixed(3)},${slice.az.toFixed(3)}  band ${slice.bandWidth.toFixed(1)}b`,
        `chunks ${state.world.chunks.size}  draws ${state.renderStats.drawCalls}  quads ${state.renderStats.quads}`,
        `entities ${state.entityCount}  particles ${state.particleCount}`,
        `biome ${(BIOMES[state.world.biomeAtSlice(p.x, p.z)] || {}).display}`,
      );
    }
    ctx.save();
    ctx.font = `${10 * s}px ui-monospace, monospace`;
    ctx.textAlign = 'left';
    let y = 62 * s;
    for (const l of lines) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillText(l, 15 * s, y + 1);
      ctx.fillStyle = 'rgba(190,225,255,0.85)';
      ctx.fillText(l, 14 * s, y);
      y += 13 * s;
    }
    ctx.restore();
  }
}

function wrapText(ctx, text, x, y, maxW, lineH) {
  const words = String(text).split(' ');
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, y);
      y += lineH;
      line = word;
    } else line = test;
  }
  if (line) ctx.fillText(line, x, y);
}
