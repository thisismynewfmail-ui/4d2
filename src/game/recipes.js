// 4D-MC :: crafting & smelting -------------------------------------------
// Recipes are written on a grid of any size and matched by their bounding box,
// so a 2x2 recipe works in the 4x4 inventory matrix and in the 5x5 Hyperbench.

import { stack } from './inventory.js';
import { TOOL_MATERIALS } from '../world/items.js';

export const RECIPES = [];

function shaped(pattern, key, out, count = 1, needsBench = false) {
  RECIPES.push({ type: 'shaped', pattern, key, out, count, needsBench,
    w: Math.max(...pattern.map((r) => r.length)), h: pattern.length });
}
function shapeless(items, out, count = 1, needsBench = false) {
  RECIPES.push({ type: 'shapeless', items, out, count, needsBench });
}

// --- wood chain ----------------------------------------------------------
for (const w of ['oak', 'pine', 'birch']) {
  shapeless([`${w}_log`], `${w}_planks`, 4);
}
shaped(['P', 'P'], { P: 'oak_planks' }, 'stick', 4);
shaped(['PP', 'PP'], { P: 'oak_planks' }, 'crafting_table', 1);
shaped(['CCC', 'C C', 'CCC'], { C: 'cobblestone' }, 'furnace', 1, true);
shaped(['PPP', 'P P', 'PPP'], { P: 'oak_planks' }, 'chest', 1, true);
shaped(['SSS', 'S S', 'SSS'], { S: 'hyperstone' }, 'hyperchest', 1, true);
shaped(['PP', 'PP', 'PP'], { P: 'oak_planks' }, 'door', 2, true);
shaped(['S S', 'SSS', 'S S'], { S: 'stick' }, 'ladder', 4);
shaped(['PPP', 'BBB', 'PPP'], { P: 'oak_planks', B: 'book' }, 'bookshelf', 1, true);

// --- light ---------------------------------------------------------------
shaped(['C', 'S'], { C: 'coal', S: 'stick' }, 'torch', 4);
shaped(['H', 'S'], { H: 'charcoal', S: 'stick' }, 'torch', 4);
shaped([' I ', 'ITI', ' I '], { I: 'iron_ingot', T: 'torch' }, 'lantern', 1, true);

// --- stone & decoration --------------------------------------------------
shaped(['SS', 'SS'], { S: 'stone' }, 'stone_bricks', 4);
shaped(['BB', 'BB'], { B: 'brick_item' }, 'brick_block', 1);
shaped(['SS', 'SS'], { S: 'sand' }, 'sandstone', 1);
shapeless(['cobblestone', 'tall_grass'], 'mossy_cobblestone', 1);
shaped(['DD', 'DD'], { D: 'dark_prism' }, 'dark_prism', 4, true);

// --- tools & armour ------------------------------------------------------
const TOOL_PATTERNS = {
  pickaxe: ['MMM', ' S ', ' S '],
  axe: ['MM', 'MS', ' S'],
  shovel: ['M', 'S', 'S'],
  sword: ['M', 'M', 'S'],
  hoe: ['MM', ' S', ' S'],
};
const ARMOR_PATTERNS = {
  helmet: ['MMM', 'M M'],
  chestplate: ['M M', 'MMM', 'MMM'],
  leggings: ['MMM', 'M M', 'M M'],
  boots: ['M M', 'M M'],
};
for (const [mat, M] of Object.entries(TOOL_MATERIALS)) {
  for (const [kind, pat] of Object.entries(TOOL_PATTERNS))
    shaped(pat, { M: M.ing, S: 'stick' }, `${mat}_${kind}`, 1, true);
}
const ARMOR_ING = {
  leather: 'leather', iron: 'iron_ingot', diamond: 'diamond', hyper: 'hyper_shard',
};
for (const [mat, ing] of Object.entries(ARMOR_ING))
  for (const [piece, pat] of Object.entries(ARMOR_PATTERNS))
    shaped(pat, { M: ing }, `${mat}_${piece}`, 1, true);

// --- food & sundries -----------------------------------------------------
shaped(['WWW'], { W: 'wheat' }, 'bread', 1);
shaped(['SSS'], { S: 'sand' }, 'paper', 3);
shaped(['PPP'], { P: 'paper' }, 'book', 1);
shaped(['I I', ' I '], { I: 'iron_ingot' }, 'bucket', 1, true);
shapeless(['clay_ball', 'clay_ball', 'clay_ball', 'clay_ball'], 'clay', 1);

// --- 4D apparatus --------------------------------------------------------
shaped([' T ', 'THT', ' T '], { T: 'tesseract_shard', H: 'hyper_shard' }, 'phase_anchor', 1, true);
shaped(['HHH', 'HTH', 'HHH'], { H: 'hyperstone', T: 'tesseract_shard' }, 'rift_block', 1, true);
shaped(['GHG', 'H H', 'GHG'], { G: 'gold_ingot', H: 'hyper_shard' }, 'phase_lens', 1, true);
shaped([' P ', 'PIP', ' P '], { P: 'pulse_dust', I: 'iron_ingot' }, 'rift_compass', 1, true);
shaped([' T ', ' S ', ' S '], { T: 'tesseract_shard', S: 'hyper_shard' }, 'anchor_rod', 1, true);
shaped(['AAA', 'APA', 'AAA'], { A: 'azure_dust', P: 'paper' }, 'slice_map', 1, true);
shaped(['GG', 'GG'], { G: 'glass' }, 'hyperglass', 2, true);
shaped(['HH', 'HH'], { H: 'hyper_shard' }, 'hyperstone', 4);
shaped(['LL', 'LL'], { L: 'lumen' }, 'lumen', 4);

// --- wool dyeing (kept simple: wool from string) --------------------------
shaped(['SS', 'SS'], { S: 'string' }, 'wool_white', 1);

// --- smelting ------------------------------------------------------------
export const SMELTING = {
  iron_ore: 'iron_ingot',
  gold_ore: 'gold_ingot',
  sand: 'glass',
  cobblestone: 'stone',
  clay_ball: 'brick_item',
  clay: 'brick_block',
  raw_porkchop: 'cooked_porkchop',
  raw_beef: 'steak',
  raw_chicken: 'cooked_chicken',
  oak_log: 'charcoal',
  pine_log: 'charcoal',
  birch_log: 'charcoal',
  hyper_ore: 'hyper_shard',
  stone: 'marble',
  chroma_clay: 'brick_item',
};

// --- matching ------------------------------------------------------------
function gridBounds(slots, size) {
  let minX = size, minY = size, maxX = -1, maxY = -1;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      if (slots[y * size + x]) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
  return { minX, minY, maxX, maxY, empty: maxX < 0 };
}

function matchShaped(r, slots, size) {
  const b = gridBounds(slots, size);
  if (b.empty) return false;
  if (b.maxX - b.minX + 1 !== r.w || b.maxY - b.minY + 1 !== r.h) return false;
  for (let y = 0; y < r.h; y++) {
    const row = r.pattern[y];
    for (let x = 0; x < r.w; x++) {
      const ch = row[x] || ' ';
      const want = ch === ' ' ? null : r.key[ch];
      const got = slots[(b.minY + y) * size + (b.minX + x)];
      if (!want && got) return false;
      if (want && (!got || got.name !== want)) return false;
    }
  }
  return true;
}

function matchShapeless(r, slots) {
  const have = [];
  for (const s of slots) if (s) have.push(s.name);
  if (have.length !== r.items.length) return false;
  const pool = have.slice();
  for (const need of r.items) {
    const i = pool.indexOf(need);
    if (i < 0) return false;
    pool.splice(i, 1);
  }
  return true;
}

/** Find the recipe a grid currently satisfies. */
export function findRecipe(container, size, hasBench) {
  const slots = container.slots;
  for (const r of RECIPES) {
    if (r.needsBench && !hasBench) continue;
    if (r.type === 'shaped') {
      if (r.w > size || r.h > size) continue;
      if (matchShaped(r, slots, size)) return r;
    } else if (matchShapeless(r, slots)) return r;
  }
  return null;
}

export function craftResult(container, size, hasBench) {
  const r = findRecipe(container, size, hasBench);
  return r ? stack(r.out, r.count) : null;
}

/** Remove one of each ingredient after a craft. */
export function consumeCraft(container) {
  for (let i = 0; i < container.slots.length; i++) {
    const s = container.slots[i];
    if (!s) continue;
    s.count -= 1;
    if (s.count <= 0) container.slots[i] = null;
  }
  container.touch();
}

/** Recipes the player could make right now, for the recipe book. */
export function availableRecipes(inv, hasBench) {
  const have = new Map();
  for (const s of inv.slots) if (s) have.set(s.name, (have.get(s.name) || 0) + s.count);
  const out = [];
  for (const r of RECIPES) {
    if (r.needsBench && !hasBench) continue;
    const need = new Map();
    if (r.type === 'shaped') {
      for (const row of r.pattern)
        for (const ch of row) {
          if (ch === ' ') continue;
          const n = r.key[ch];
          need.set(n, (need.get(n) || 0) + 1);
        }
    } else for (const n of r.items) need.set(n, (need.get(n) || 0) + 1);
    let ok = true;
    for (const [n, c] of need) if ((have.get(n) || 0) < c) { ok = false; break; }
    if (ok) out.push(r);
  }
  return out;
}
