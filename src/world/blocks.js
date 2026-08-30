// 4D-MC :: block registry -------------------------------------------------
// Ids are stable numbers (they end up inside save files), so append rather
// than reorder.

export const RENDER = { CUBE: 0, CROSS: 1, LIQUID: 2, TORCH: 3, LADDER: 4, NONE: 5 };
export const TOOL = { NONE: 0, PICK: 1, AXE: 2, SHOVEL: 3, SHEARS: 4, SWORD: 5 };

/** Harvest tiers — a block only yields its drop when mined at or above tier. */
export const TIER = { HAND: 0, WOOD: 1, STONE: 2, IRON: 3, DIAMOND: 4, HYPER: 5 };

const B = [];
let nextId = 1;

function def(name, opts = {}) {
  const id = opts.id !== undefined ? opts.id : nextId++;
  if (opts.id !== undefined) nextId = Math.max(nextId, id + 1);
  const t = opts.tex || name;
  const block = {
    id, name,
    display: opts.display || name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    render: opts.render ?? RENDER.CUBE,
    // faces: [+X, -X, +Y, -Y, +Z, -Z]
    faces: opts.faces || (Array.isArray(t) ? t : [t, t, t, t, t, t]),
    solid: opts.solid ?? true,
    opaque: opts.opaque ?? (opts.render === undefined || opts.render === RENDER.CUBE),
    liquid: opts.liquid ?? false,
    climbable: opts.climbable ?? false,
    light: opts.light ?? 0,
    hardness: opts.hardness ?? 1.0,
    tool: opts.tool ?? TOOL.NONE,
    tier: opts.tier ?? TIER.HAND,
    sound: opts.sound || 'stone',
    drop: opts.drop === undefined ? name : opts.drop,      // item name, or null
    dropCount: opts.dropCount || 1,
    fuel: opts.fuel || 0,                                   // ticks of smelting fuel
    gravity: opts.gravity ?? false,
    flammable: opts.flammable ?? false,
    tint: opts.tint || null,                                // [r,g,b] multiply
    // 4D behaviour
    anchored: opts.anchored ?? false,   // resists slice drift (Phase Anchor)
    interact: opts.interact || null,    // 'chest' | 'crafting' | 'furnace' | 'door' | 'rift'
    tileSize: opts.tileSize || 1,
    animated: opts.animated || 0,
  };
  B[id] = block;
  return block;
}

export const AIR = 0;

// --- terrain -------------------------------------------------------------
def('stone', { hardness: 1.5, tool: TOOL.PICK, tier: TIER.WOOD, drop: 'cobblestone' });
def('cobblestone', { hardness: 2.0, tool: TOOL.PICK, tier: TIER.WOOD });
def('mossy_cobblestone', { hardness: 2.0, tool: TOOL.PICK, tier: TIER.WOOD });
def('stone_bricks', { hardness: 1.8, tool: TOOL.PICK, tier: TIER.WOOD });
def('cracked_stone_bricks', { hardness: 1.8, tool: TOOL.PICK, tier: TIER.WOOD });
def('slate', { hardness: 2.4, tool: TOOL.PICK, tier: TIER.WOOD });
def('marble', { hardness: 1.6, tool: TOOL.PICK, tier: TIER.WOOD });
def('bedrock', { hardness: -1, tool: TOOL.PICK, tier: TIER.HYPER, drop: null });
def('dirt', { hardness: 0.6, tool: TOOL.SHOVEL, sound: 'dirt' });
def('grass', {
  faces: ['grass_side', 'grass_side', 'grass_top', 'dirt', 'grass_side', 'grass_side'],
  hardness: 0.7, tool: TOOL.SHOVEL, sound: 'grass', drop: 'dirt', tint: 'grass',
});
def('snow_grass', {
  display: 'Snowy Grass',
  faces: ['grass_side_snow', 'grass_side_snow', 'snow', 'dirt', 'grass_side_snow', 'grass_side_snow'],
  hardness: 0.7, tool: TOOL.SHOVEL, sound: 'snow', drop: 'dirt',
});
def('sand', { hardness: 0.5, tool: TOOL.SHOVEL, sound: 'sand', gravity: true });
def('sandstone', {
  faces: ['sandstone_side', 'sandstone_side', 'sandstone_top', 'sandstone_top', 'sandstone_side', 'sandstone_side'],
  hardness: 1.2, tool: TOOL.PICK, tier: TIER.WOOD,
});
def('gravel', { hardness: 0.6, tool: TOOL.SHOVEL, sound: 'dirt', gravity: true });
def('clay', { hardness: 0.6, tool: TOOL.SHOVEL, sound: 'dirt', drop: 'clay_ball', dropCount: 4 });
def('snow', { hardness: 0.3, tool: TOOL.SHOVEL, sound: 'snow' });
def('ice', { hardness: 0.5, tool: TOOL.PICK, sound: 'glass', opaque: false, drop: null });
def('chroma_clay', { display: 'Chroma Clay', hardness: 1.2, tool: TOOL.PICK, tier: TIER.WOOD });
def('obsidian', { hardness: 18, tool: TOOL.PICK, tier: TIER.DIAMOND });

// --- wood ----------------------------------------------------------------
for (const w of ['oak', 'pine', 'birch']) {
  def(`${w}_log`, {
    faces: [`${w}_log_side`, `${w}_log_side`, `${w}_log_top`, `${w}_log_top`, `${w}_log_side`, `${w}_log_side`],
    hardness: 2.0, tool: TOOL.AXE, sound: 'wood', fuel: 300, flammable: true,
  });
  def(`${w}_planks`, { hardness: 2.0, tool: TOOL.AXE, sound: 'wood', fuel: 300, flammable: true });
  def(`${w}_leaves`, {
    hardness: 0.2, tool: TOOL.SHEARS, sound: 'grass', opaque: false,
    drop: null, flammable: true, tint: w === 'oak' ? 'leaf' : null,
  });
}

// --- crafted -------------------------------------------------------------
def('brick_block', { display: 'Bricks', tex: 'brick', hardness: 2.0, tool: TOOL.PICK, tier: TIER.WOOD });
def('glass', { hardness: 0.3, sound: 'glass', opaque: false, drop: null });
def('hyperglass', { display: 'Hyperglass', hardness: 0.4, sound: 'glass', opaque: false, light: 3, drop: null });
def('bookshelf', {
  faces: ['bookshelf', 'bookshelf', 'oak_planks', 'oak_planks', 'bookshelf', 'bookshelf'],
  hardness: 1.5, tool: TOOL.AXE, sound: 'wood', fuel: 300, drop: 'book', dropCount: 3,
});
def('crafting_table', {
  display: 'Hyperbench',
  faces: ['crafting_table_side', 'crafting_table_front', 'crafting_table_top', 'oak_planks',
    'crafting_table_front', 'crafting_table_side'],
  hardness: 2.5, tool: TOOL.AXE, sound: 'wood', fuel: 300, interact: 'crafting',
});
def('furnace', {
  faces: ['furnace_side', 'furnace_side', 'furnace_top', 'furnace_top', 'furnace_front', 'furnace_side'],
  hardness: 3.5, tool: TOOL.PICK, tier: TIER.WOOD, interact: 'furnace',
});
def('furnace_lit', {
  display: 'Furnace',
  faces: ['furnace_side', 'furnace_side', 'furnace_top', 'furnace_top', 'furnace_front_lit', 'furnace_side'],
  hardness: 3.5, tool: TOOL.PICK, tier: TIER.WOOD, light: 13, interact: 'furnace', drop: 'furnace',
});
def('chest', {
  faces: ['chest_side', 'chest_side', 'chest_top', 'chest_top', 'chest_front', 'chest_side'],
  hardness: 2.5, tool: TOOL.AXE, sound: 'wood', opaque: false, interact: 'chest', fuel: 300,
});
def('hyperchest', {
  display: 'Hyperchest',
  faces: ['hyperchest_side', 'hyperchest_side', 'hyperchest_top', 'hyperchest_top',
    'hyperchest_front', 'hyperchest_side'],
  hardness: 3.0, tool: TOOL.AXE, sound: 'wood', opaque: false, interact: 'chest', light: 4,
});
def('torch', {
  render: RENDER.TORCH, solid: false, opaque: false, light: 14, hardness: 0.05, sound: 'wood',
});
def('lantern', { render: RENDER.CUBE, opaque: false, light: 15, hardness: 3.0, tool: TOOL.PICK, sound: 'metal' });
def('ladder', { render: RENDER.LADDER, solid: false, opaque: false, climbable: true, hardness: 0.4, sound: 'wood' });
def('door_lower', {
  display: 'Oak Door', tex: 'door_bottom', render: RENDER.CUBE, opaque: false,
  hardness: 3.0, tool: TOOL.AXE, sound: 'wood', interact: 'door', drop: 'door',
});
def('door_upper', {
  display: 'Oak Door', tex: 'door_top', render: RENDER.CUBE, opaque: false,
  hardness: 3.0, tool: TOOL.AXE, sound: 'wood', interact: 'door', drop: null,
});

for (const c of ['white', 'red', 'orange', 'yellow', 'green', 'blue', 'purple', 'black', 'cyan', 'pink'])
  def(`wool_${c}`, { tex: `wool_${c}`, hardness: 0.8, sound: 'cloth', flammable: true, fuel: 100 });

// --- ores ----------------------------------------------------------------
def('coal_ore', { hardness: 3.0, tool: TOOL.PICK, tier: TIER.WOOD, drop: 'coal', fuel: 0 });
def('iron_ore', { hardness: 3.0, tool: TOOL.PICK, tier: TIER.STONE, drop: 'iron_ore' });
def('gold_ore', { hardness: 3.0, tool: TOOL.PICK, tier: TIER.IRON, drop: 'gold_ore' });
def('diamond_ore', { hardness: 3.0, tool: TOOL.PICK, tier: TIER.IRON, drop: 'diamond' });
def('azure_ore', { display: 'Azure Ore', hardness: 3.0, tool: TOOL.PICK, tier: TIER.STONE, drop: 'azure_dust', dropCount: 5 });
def('pulse_ore', { display: 'Pulse Ore', hardness: 3.0, tool: TOOL.PICK, tier: TIER.IRON, drop: 'pulse_dust', dropCount: 4, light: 6 });
def('hyper_ore', { display: 'Hyperlode', hardness: 4.0, tool: TOOL.PICK, tier: TIER.IRON, drop: 'hyper_shard', dropCount: 2, light: 4 });
def('tesseract_ore', { display: 'Tesseract Ore', hardness: 5.0, tool: TOOL.PICK, tier: TIER.DIAMOND, drop: 'tesseract_shard', light: 7 });
def('hyperstone', { display: 'Hyperstone', hardness: 3.2, tool: TOOL.PICK, tier: TIER.STONE, light: 2 });
def('rift_block', { display: 'Rift Stone', hardness: 4.0, tool: TOOL.PICK, tier: TIER.IRON, light: 8, interact: 'rift' });
def('phase_anchor', {
  display: 'Phase Anchor', hardness: 4.0, tool: TOOL.PICK, tier: TIER.IRON,
  light: 10, anchored: true, interact: 'anchor',
});
def('lumen', { display: 'Lumenstone', hardness: 0.5, tool: TOOL.PICK, light: 15, sound: 'glass' });
def('emberstone', { display: 'Emberstone', hardness: 0.8, tool: TOOL.PICK, tier: TIER.WOOD, light: 3 });
def('dark_prism', { display: 'Dark Prism', hardness: 2.2, tool: TOOL.PICK, tier: TIER.STONE, light: 4 });

// --- plants & liquids ----------------------------------------------------
def('tall_grass', {
  display: 'Tall Grass', render: RENDER.CROSS, solid: false, opaque: false, hardness: 0.05,
  sound: 'grass', drop: 'seeds', tint: 'grass', flammable: true,
});
def('flower_red', { display: 'Crimson Bloom', render: RENDER.CROSS, solid: false, opaque: false, hardness: 0.05, sound: 'grass' });
def('flower_yellow', { display: 'Sunwhorl', render: RENDER.CROSS, solid: false, opaque: false, hardness: 0.05, sound: 'grass' });
def('flower_violet', { display: 'Kata Violet', render: RENDER.CROSS, solid: false, opaque: false, hardness: 0.05, sound: 'grass', light: 2 });
def('mushroom_red', { display: 'Crimson Cap', render: RENDER.CROSS, solid: false, opaque: false, hardness: 0.05, sound: 'grass' });
def('mushroom_brown', { display: 'Umber Cap', render: RENDER.CROSS, solid: false, opaque: false, hardness: 0.05, sound: 'grass', light: 1 });
def('cactus', {
  faces: ['cactus_side', 'cactus_side', 'cactus_top', 'cactus_top', 'cactus_side', 'cactus_side'],
  hardness: 0.4, sound: 'grass',
});
def('farmland', {
  faces: ['dirt', 'dirt', 'farmland', 'dirt', 'dirt', 'dirt'],
  hardness: 0.6, tool: TOOL.SHOVEL, sound: 'dirt', drop: 'dirt',
});
def('farmland_wet', {
  display: 'Farmland',
  faces: ['dirt', 'dirt', 'farmland_wet', 'dirt', 'dirt', 'dirt'],
  hardness: 0.6, tool: TOOL.SHOVEL, sound: 'dirt', drop: 'dirt',
});
for (let s = 0; s < 4; s++)
  def(`wheat_${s}`, {
    display: 'Wheat Crop', tex: `wheat_${s}`, render: RENDER.CROSS, solid: false, opaque: false,
    hardness: 0.05, sound: 'grass', drop: s === 3 ? 'wheat' : 'seeds', dropCount: s === 3 ? 2 : 1,
  });

def('water', {
  render: RENDER.LIQUID, solid: false, opaque: false, liquid: true, hardness: -1,
  sound: 'liquid', drop: null, animated: 1,
});
def('lava', {
  render: RENDER.LIQUID, solid: false, opaque: false, liquid: true, hardness: -1,
  light: 15, sound: 'liquid', drop: null, animated: 1,
});

// --- lookups -------------------------------------------------------------
export const BLOCKS = B;
export const BY_NAME = {};
for (const b of B) if (b) BY_NAME[b.name] = b;

export const ID = {};
for (const b of B) if (b) ID[b.name.toUpperCase()] = b.id;

export function block(id) { return B[id] || null; }
export function blockId(name) { return BY_NAME[name] ? BY_NAME[name].id : 0; }
export function isSolid(id) { return id !== 0 && B[id] && B[id].solid; }
export function isOpaque(id) { return id !== 0 && B[id] && B[id].opaque; }
export function lightOf(id) { return id === 0 ? 0 : (B[id] ? B[id].light : 0); }

/** Blocks that can be seen through but still occupy space for meshing. */
export function blocksFace(id, neighborId) {
  if (neighborId === 0) return false;
  const n = B[neighborId];
  if (!n) return false;
  if (n.opaque) return true;
  // same-material transparent blocks hide their shared face (glass, leaves, water)
  return id === neighborId && n.render !== 1 && n.render !== 3;
}

export const BLOCK_COUNT = B.length;
