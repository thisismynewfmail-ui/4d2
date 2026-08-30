// 4D-MC :: item registry --------------------------------------------------

import { BLOCKS, BY_NAME, TOOL, TIER } from './blocks.js';

export const ITEMS = {};
const order = [];

function item(name, opts = {}) {
  const it = {
    name,
    display: opts.display || name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    icon: opts.icon || name,
    kind: opts.kind || 'material',
    maxStack: opts.maxStack ?? 64,
    place: opts.place || null,
    tool: opts.tool ?? TOOL.NONE,
    tier: opts.tier ?? TIER.HAND,
    speed: opts.speed ?? 1,
    damage: opts.damage ?? 1,
    durability: opts.durability ?? 0,
    food: opts.food ?? 0,
    saturation: opts.saturation ?? 0,
    fuel: opts.fuel ?? 0,
    armor: opts.armor ?? 0,
    slot: opts.slot || null,
    lore: opts.lore || '',
    rarity: opts.rarity || 'common',
    isBlockIcon: opts.isBlockIcon ?? false,
  };
  ITEMS[name] = it;
  order.push(name);
  return it;
}

// --- placeable block items ----------------------------------------------
const NOT_PLACEABLE = new Set(['water', 'lava', 'furnace_lit', 'door_upper', 'farmland_wet',
  'wheat_0', 'wheat_1', 'wheat_2', 'wheat_3', 'bedrock']);

for (const b of BLOCKS) {
  if (!b) continue;
  if (NOT_PLACEABLE.has(b.name)) continue;
  item(b.name, {
    display: b.display,
    kind: 'block',
    place: b.name,
    isBlockIcon: true,
    icon: b.faces[2],
    fuel: b.fuel,
    lore: b.interact ? 'Right-click to use.' : '',
  });
}

// door places two blocks at once
item('door', { display: 'Oak Door', kind: 'block', place: 'door_lower', icon: 'door_bottom', isBlockIcon: true, maxStack: 16 });

// --- materials -----------------------------------------------------------
item('stick', { fuel: 100, lore: 'The universal handle.' });
item('coal', { fuel: 1600 });
item('charcoal', { fuel: 1600 });
item('iron_ingot', {});
item('gold_ingot', {});
item('diamond', { rarity: 'rare' });
item('azure_dust', { display: 'Azure Dust' });
item('pulse_dust', { display: 'Pulse Dust' });
item('hyper_shard', { display: 'Hyper Shard', rarity: 'rare', lore: 'Hums when you shift slices.' });
item('tesseract_shard', { display: 'Tesseract Shard', rarity: 'epic', lore: 'A cube that is also a cube.' });
item('clay_ball', {});
item('brick_item', { display: 'Brick' });
item('flint', {});
item('gunpowder', {});
item('leather', {});
item('paper', {});
item('book', {});
item('bone', {});
item('feather', {});
item('string', {});
item('egg', { maxStack: 16 });

// --- food ----------------------------------------------------------------
item('apple', { kind: 'food', food: 4, saturation: 2.4 });
item('bread', { kind: 'food', food: 5, saturation: 6 });
item('wheat', {});
item('seeds', { kind: 'seed', place: 'wheat_0' });
item('raw_porkchop', { kind: 'food', food: 3, saturation: 1.8 });
item('cooked_porkchop', { kind: 'food', food: 8, saturation: 12.8 });
item('raw_beef', { kind: 'food', food: 3, saturation: 1.8 });
item('steak', { kind: 'food', food: 8, saturation: 12.8 });
item('raw_chicken', { kind: 'food', food: 2, saturation: 1.2 });
item('cooked_chicken', { kind: 'food', food: 6, saturation: 7.2 });

// --- tools ---------------------------------------------------------------
const TOOL_MATS = {
  wood:    { tier: TIER.WOOD,    speed: 2,   dur: 59,   dmg: 0, ing: 'oak_planks' },
  stone:   { tier: TIER.STONE,   speed: 4,   dur: 131,  dmg: 1, ing: 'cobblestone' },
  iron:    { tier: TIER.IRON,    speed: 6,   dur: 250,  dmg: 2, ing: 'iron_ingot' },
  gold:    { tier: TIER.STONE,   speed: 12,  dur: 33,   dmg: 0, ing: 'gold_ingot' },
  diamond: { tier: TIER.DIAMOND, speed: 8,   dur: 1561, dmg: 3, ing: 'diamond' },
  hyper:   { tier: TIER.HYPER,   speed: 13,  dur: 2400, dmg: 4, ing: 'hyper_shard' },
};
export const TOOL_MATERIALS = TOOL_MATS;

const TOOL_KINDS = {
  pickaxe: { tool: TOOL.PICK,   dmg: 2, name: 'Pickaxe' },
  axe:     { tool: TOOL.AXE,    dmg: 3, name: 'Axe' },
  shovel:  { tool: TOOL.SHOVEL, dmg: 1, name: 'Shovel' },
  sword:   { tool: TOOL.SWORD,  dmg: 4, name: 'Sword' },
  hoe:     { tool: TOOL.NONE,   dmg: 1, name: 'Hoe' },
};

for (const [m, M] of Object.entries(TOOL_MATS))
  for (const [k, K] of Object.entries(TOOL_KINDS))
    item(`${m}_${k}`, {
      display: `${m[0].toUpperCase()}${m.slice(1)} ${K.name}`,
      kind: 'tool', maxStack: 1, tool: K.tool, tier: M.tier, speed: M.speed,
      damage: K.dmg + M.dmg, durability: Math.round(M.dur * (k === 'sword' ? 1 : 1)),
      fuel: m === 'wood' ? 200 : 0,
      rarity: m === 'hyper' ? 'epic' : m === 'diamond' ? 'rare' : 'common',
      lore: m === 'hyper' ? 'Cuts through more than three dimensions.' : '',
    });

// --- armour --------------------------------------------------------------
const ARMOR_MATS = { leather: 1, iron: 2, diamond: 3, hyper: 4 };
const ARMOR_PIECES = { helmet: 1, chestplate: 3, leggings: 2, boots: 1 };
for (const [m, mv] of Object.entries(ARMOR_MATS))
  for (const [p, pv] of Object.entries(ARMOR_PIECES))
    item(`${m}_${p}`, {
      display: `${m[0].toUpperCase()}${m.slice(1)} ${p[0].toUpperCase()}${p.slice(1)}`,
      kind: 'armor', maxStack: 1, armor: mv * pv, slot: p,
      durability: 60 * mv * pv, rarity: m === 'hyper' ? 'epic' : m === 'diamond' ? 'rare' : 'common',
    });

// --- special -------------------------------------------------------------
item('bucket', { maxStack: 16 });
item('water_bucket', { maxStack: 1 });
item('lava_bucket', { maxStack: 1 });
item('slice_map', { display: 'Slice Map', maxStack: 1, rarity: 'rare', lore: 'Charts the bands of the fourth axis.' });
item('phase_lens', {
  display: 'Phase Lens', maxStack: 1, rarity: 'rare',
  lore: 'Hold to glimpse neighbouring slices.',
});
item('rift_compass', {
  display: 'Rift Compass', maxStack: 1, rarity: 'rare',
  lore: 'Always points toward slice zero.',
});
item('anchor_rod', {
  display: 'Anchor Rod', maxStack: 1, rarity: 'epic',
  lore: 'Right-click to snap yourself to the nearest whole slice.',
});

export const ITEM_ORDER = order;
export function getItem(name) { return ITEMS[name] || null; }
export function itemDisplay(name) { return ITEMS[name]?.display || name; }
export function maxStack(name) { return ITEMS[name]?.maxStack ?? 64; }
