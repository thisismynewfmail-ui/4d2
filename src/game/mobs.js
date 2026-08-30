// 4D-MC :: creature roster ------------------------------------------------
// Every creature is a handful of boxes. Some live squarely inside one slice of
// the fourth dimension; others drift between slices and are therefore only
// ever partly here.

import { texLayer } from '../world/atlas.js';

const T = (n) => texLayer(n);

// --- model builders ------------------------------------------------------
// part = { px,py,pz, sx,sy,sz, tex, color, role }
// role drives the animation: 'legFL','legFR','legBL','legBR','head','body','arm*'

export function humanoid(skin, faceTex, opts = {}) {
  const s = opts.scale || 1;
  const body = opts.bodyTex || skin;
  return [
    { px: 0, py: 1.4 * s, pz: 0, sx: 0.5 * s, sy: 0.5 * s, sz: 0.5 * s, tex: faceTex, role: 'head' },
    { px: 0, py: 0.95 * s, pz: 0, sx: 0.55 * s, sy: 0.62 * s, sz: 0.3 * s, tex: body, role: 'body' },
    { px: -0.36 * s, py: 0.95 * s, pz: 0, sx: 0.2 * s, sy: 0.6 * s, sz: 0.24 * s, tex: skin, role: 'armL' },
    { px: 0.36 * s, py: 0.95 * s, pz: 0, sx: 0.2 * s, sy: 0.6 * s, sz: 0.24 * s, tex: skin, role: 'armR' },
    { px: -0.14 * s, py: 0.35 * s, pz: 0, sx: 0.22 * s, sy: 0.7 * s, sz: 0.24 * s, tex: opts.legTex || body, role: 'legFL' },
    { px: 0.14 * s, py: 0.35 * s, pz: 0, sx: 0.22 * s, sy: 0.7 * s, sz: 0.24 * s, tex: opts.legTex || body, role: 'legFR' },
  ];
}

export function quadruped(skin, faceTex, opts = {}) {
  const s = opts.scale || 1;
  const h = opts.height || 0.55;
  return [
    { px: 0, py: h + 0.18 * s, pz: -0.42 * s, sx: 0.42 * s, sy: 0.42 * s, sz: 0.42 * s, tex: faceTex, role: 'head' },
    { px: 0, py: h, pz: 0, sx: 0.55 * s, sy: 0.5 * s, sz: 0.95 * s, tex: skin, role: 'body' },
    { px: -0.2 * s, py: h * 0.42, pz: -0.3 * s, sx: 0.18 * s, sy: h * 0.9, sz: 0.18 * s, tex: skin, role: 'legFL' },
    { px: 0.2 * s, py: h * 0.42, pz: -0.3 * s, sx: 0.18 * s, sy: h * 0.9, sz: 0.18 * s, tex: skin, role: 'legFR' },
    { px: -0.2 * s, py: h * 0.42, pz: 0.3 * s, sx: 0.18 * s, sy: h * 0.9, sz: 0.18 * s, tex: skin, role: 'legBL' },
    { px: 0.2 * s, py: h * 0.42, pz: 0.3 * s, sx: 0.18 * s, sy: h * 0.9, sz: 0.18 * s, tex: skin, role: 'legBR' },
  ];
}

export function blob(skin, faceTex, opts = {}) {
  const s = opts.scale || 1;
  return [
    { px: 0, py: 0.42 * s, pz: 0, sx: 0.85 * s, sy: 0.8 * s, sz: 0.85 * s, tex: skin, role: 'body' },
    { px: 0, py: 0.5 * s, pz: -0.4 * s, sx: 0.5 * s, sy: 0.45 * s, sz: 0.1 * s, tex: faceTex, role: 'head' },
  ];
}

export function floater(skin, faceTex, opts = {}) {
  const s = opts.scale || 1;
  return [
    { px: 0, py: 1.15 * s, pz: 0, sx: 0.52 * s, sy: 0.52 * s, sz: 0.52 * s, tex: faceTex, role: 'head' },
    { px: 0, py: 0.62 * s, pz: 0, sx: 0.62 * s, sy: 0.72 * s, sz: 0.42 * s, tex: skin, role: 'body' },
    { px: -0.42 * s, py: 0.72 * s, pz: 0, sx: 0.18 * s, sy: 0.62 * s, sz: 0.2 * s, tex: skin, role: 'armL' },
    { px: 0.42 * s, py: 0.72 * s, pz: 0, sx: 0.18 * s, sy: 0.62 * s, sz: 0.2 * s, tex: skin, role: 'armR' },
    { px: 0, py: 0.12 * s, pz: 0, sx: 0.4 * s, sy: 0.34 * s, sz: 0.3 * s, tex: skin, role: 'tail' },
  ];
}

export function crawler(skin, faceTex, opts = {}) {
  const s = opts.scale || 1;
  return [
    { px: 0, py: 0.3 * s, pz: -0.5 * s, sx: 0.44 * s, sy: 0.4 * s, sz: 0.44 * s, tex: faceTex, role: 'head' },
    { px: 0, py: 0.3 * s, pz: 0.1 * s, sx: 0.7 * s, sy: 0.44 * s, sz: 0.8 * s, tex: skin, role: 'body' },
    { px: -0.46 * s, py: 0.2 * s, pz: -0.2 * s, sx: 0.5 * s, sy: 0.1 * s, sz: 0.1 * s, tex: skin, role: 'legFL' },
    { px: 0.46 * s, py: 0.2 * s, pz: -0.2 * s, sx: 0.5 * s, sy: 0.1 * s, sz: 0.1 * s, tex: skin, role: 'legFR' },
    { px: -0.46 * s, py: 0.2 * s, pz: 0.3 * s, sx: 0.5 * s, sy: 0.1 * s, sz: 0.1 * s, tex: skin, role: 'legBL' },
    { px: 0.46 * s, py: 0.2 * s, pz: 0.3 * s, sx: 0.5 * s, sy: 0.1 * s, sz: 0.1 * s, tex: skin, role: 'legBR' },
  ];
}

export function tesseractBody(skin, opts = {}) {
  const s = opts.scale || 1;
  return [
    { px: 0, py: 1.0 * s, pz: 0, sx: 0.7 * s, sy: 0.7 * s, sz: 0.7 * s, tex: skin, role: 'spinOuter' },
    { px: 0, py: 1.0 * s, pz: 0, sx: 0.34 * s, sy: 0.34 * s, sz: 0.34 * s, tex: skin, role: 'spinInner' },
  ];
}

// --- roster --------------------------------------------------------------
// hostile: attacks the player.  passive: flees.  neutral: ignores.
// native4D: drifts along w and so is only ever partly inside your slice.

export const MOB_TYPES = {
  // ---- 3D-native passive
  pig: {
    display: 'Pig', model: 'quadruped', skin: 'mob_pig', face: 'mob_pig_face',
    hp: 10, speed: 1.5, behaviour: 'passive', voice: 'pig', size: [0.8, 0.9],
    drops: [['raw_porkchop', 1, 3]], spawn: { light: 'day', biomes: ['plains', 'forest', 'savanna'], group: [2, 4] },
  },
  cow: {
    display: 'Cow', model: 'quadruped', skin: 'mob_cow', face: 'mob_cow_face',
    hp: 12, speed: 1.4, behaviour: 'passive', voice: 'cow', size: [0.9, 1.2], scale: 1.15,
    drops: [['raw_beef', 1, 3], ['leather', 0, 2]], spawn: { light: 'day', biomes: ['plains', 'forest'], group: [2, 4] },
  },
  sheep: {
    display: 'Sheep', model: 'quadruped', skin: 'mob_wool', face: 'mob_sheep_face',
    hp: 10, speed: 1.4, behaviour: 'passive', voice: 'sheep', size: [0.85, 1.1],
    drops: [['wool_white', 1, 2]], spawn: { light: 'day', biomes: ['plains', 'taiga', 'tundra'], group: [3, 5] },
  },
  chicken: {
    display: 'Chicken', model: 'quadruped', skin: 'mob_chicken', face: 'mob_chicken_face',
    hp: 6, speed: 1.3, behaviour: 'passive', voice: 'chicken', size: [0.5, 0.7], scale: 0.6,
    drops: [['raw_chicken', 1, 1], ['feather', 0, 2]], spawn: { light: 'day', biomes: ['plains', 'forest', 'swamp'], group: [2, 4] },
  },
  hopper: {
    display: 'Dune Hopper', model: 'quadruped', skin: 'mob_hopper', face: 'mob_hopper_face',
    hp: 5, speed: 2.6, behaviour: 'skittish', voice: 'generic', size: [0.45, 0.6], scale: 0.55,
    drops: [['leather', 0, 1]], spawn: { light: 'day', biomes: ['desert', 'savanna', 'plains', 'tundra'], group: [1, 3] },
  },
  inkfin: {
    display: 'Inkfin', model: 'blob', skin: 'mob_inkfin', face: 'mob_inkfin_face',
    hp: 8, speed: 1.1, behaviour: 'aquatic', voice: 'generic', size: [0.8, 0.8],
    drops: [['azure_dust', 1, 3]], spawn: { light: 'any', water: true, group: [2, 4] },
  },

  // ---- 3D-native hostile
  zombie: {
    display: 'Husk-Walker', model: 'humanoid', skin: 'mob_zombie', face: 'mob_zombie_face',
    hp: 20, speed: 1.9, damage: 3, behaviour: 'hostile', voice: 'zombie', size: [0.6, 1.85],
    drops: [['leather', 0, 1]], burnsInDay: true,
    spawn: { light: 'dark', biomes: null, group: [1, 3] },
  },
  skeleton: {
    display: 'Bonefiddler', model: 'humanoid', skin: 'mob_skeleton', face: 'mob_skeleton_face',
    hp: 16, speed: 2.1, damage: 2, ranged: true, behaviour: 'hostile', voice: 'skeleton', size: [0.6, 1.85],
    drops: [['bone', 1, 2], ['flint', 0, 1]], burnsInDay: true,
    spawn: { light: 'dark', biomes: null, group: [1, 2] },
  },
  spider: {
    display: 'Silkstalker', model: 'crawler', skin: 'mob_spider', face: 'mob_spider_face',
    hp: 14, speed: 2.8, damage: 2, behaviour: 'hostile', voice: 'spider', size: [1.1, 0.8],
    drops: [['string', 1, 2]], climbs: true,
    spawn: { light: 'dark', biomes: null, group: [1, 3] },
  },
  bloater: {
    display: 'Bloater', model: 'humanoid', skin: 'mob_bloater', face: 'mob_bloater_face',
    hp: 18, speed: 1.7, damage: 0, behaviour: 'exploder', voice: 'slime', size: [0.6, 1.7],
    drops: [['gunpowder', 1, 2]],
    spawn: { light: 'dark', biomes: null, group: [1, 2] },
  },
  gelid: {
    display: 'Gelid', model: 'blob', skin: 'mob_gelid', face: 'mob_gelid_face',
    hp: 12, speed: 1.4, damage: 2, behaviour: 'hopper', voice: 'slime', size: [0.9, 0.9],
    drops: [['clay_ball', 1, 2]],
    spawn: { light: 'dark', biomes: ['swamp'], underground: true, group: [2, 4] },
  },

  // ---- 4D natives: never wholly inside your slice
  phase_wraith: {
    display: 'Phase Wraith', model: 'floater', skin: 'mob_phase_wraith', face: 'mob_phase_wraith_face',
    hp: 22, speed: 2.2, damage: 4, behaviour: 'hostile', voice: 'wraith', size: [0.7, 1.9],
    native4D: true, wDrift: 0.35, wHalf: 0.34, emissive: 0.25, flies: true,
    drops: [['hyper_shard', 1, 2]],
    spawn: { light: 'dark', biomes: null, group: [1, 2] },
  },
  kata_drifter: {
    display: 'Kata Drifter', model: 'floater', skin: 'mob_kata_drifter', face: 'mob_kata_drifter_face',
    hp: 30, speed: 1.2, damage: 5, behaviour: 'hostile', voice: 'drifter', size: [0.9, 2.1], scale: 1.15,
    native4D: true, wDrift: 0.18, wHalf: 0.30, emissive: 0.2, flies: true,
    drops: [['hyper_shard', 1, 3], ['tesseract_shard', 0, 1]],
    spawn: { light: 'any', biomes: ['hyperflats', 'rift_barrens'], group: [1, 1] },
  },
  tessellite: {
    display: 'Tessellite', model: 'tesseract', skin: 'mob_tessellite', face: 'mob_tessellite_face',
    hp: 14, speed: 1.0, damage: 0, behaviour: 'neutral', voice: 'tessellite', size: [0.7, 1.4],
    native4D: true, wDrift: 0.5, wHalf: 0.42, emissive: 0.5, flies: true,
    drops: [['tesseract_shard', 1, 2]],
    spawn: { light: 'any', biomes: ['hyperflats'], group: [1, 2] },
  },
  null_crawler: {
    display: 'Null Crawler', model: 'crawler', skin: 'mob_null_crawler', face: 'mob_null_crawler_face',
    hp: 18, speed: 3.0, damage: 3, behaviour: 'hostile', voice: 'spider', size: [1.0, 0.7],
    native4D: true, wDrift: 0.55, wHalf: 0.26, emissive: 0.3,
    drops: [['hyper_shard', 0, 2], ['string', 1, 2]],
    spawn: { light: 'dark', underground: true, group: [1, 3] },
  },
  hyperslug: {
    display: 'Hyperslug', model: 'blob', skin: 'mob_hyperslug', face: 'mob_hyperslug_face',
    hp: 16, speed: 0.7, damage: 2, behaviour: 'neutral', voice: 'slime', size: [1.0, 0.7],
    native4D: true, wDrift: 0.28, wHalf: 0.38, emissive: 0.35,
    drops: [['hyper_shard', 1, 1], ['lumen', 0, 1]],
    spawn: { light: 'any', underground: true, group: [1, 2] },
  },
  slice_warden: {
    display: 'Warden of Slices', model: 'humanoid', skin: 'mob_slice_warden', face: 'mob_slice_warden_face',
    hp: 60, speed: 2.0, damage: 8, behaviour: 'hostile', voice: 'drifter', size: [0.9, 2.6], scale: 1.4,
    native4D: true, wDrift: 0.12, wHalf: 0.45, emissive: 0.45, boss: true,
    drops: [['tesseract_shard', 2, 4], ['hyper_shard', 2, 5], ['diamond', 0, 2]],
    spawn: { structure: 'keep', group: [1, 1] },
  },
  echo: {
    display: 'Echo', model: 'humanoid', skin: 'mob_echo', face: 'mob_echo_face',
    hp: 20, speed: 2.4, damage: 3, behaviour: 'mimic', voice: 'wraith', size: [0.6, 1.85],
    native4D: true, wDrift: 0.22, wHalf: 0.30, emissive: 0.15, alpha: 0.82,
    drops: [['hyper_shard', 0, 1]],
    spawn: { light: 'dark', biomes: ['rift_barrens', 'hyperflats'], group: [1, 1] },
  },
};

// --- NPCs ----------------------------------------------------------------
export const NPC_TYPES = {
  farmer: {
    display: 'Farmer', skin: 'mob_apron', face: 'mob_villager_face', profession: 'Farmer',
    lines: [
      'The wheat grows different in every slice. Same field, different harvest.',
      'Plant on wet farmland. Water within two blocks does it.',
      'I once lost a whole crop by scrolling two layers left. Never again.',
    ],
    trades: [
      { give: ['wheat', 8], get: ['bread', 3] },
      { give: ['hyper_shard', 1], get: ['seeds', 8] },
      { give: ['apple', 4], get: ['iron_ingot', 1] },
    ],
  },
  blacksmith: {
    display: 'Blacksmith', skin: 'mob_iron', face: 'mob_villager_face', profession: 'Blacksmith',
    lines: [
      'Bring me iron and I will make you something that bites.',
      'A hyper pickaxe cuts through matter that is only partly there.',
      'Diamond is common. Tesseract shards are not.',
    ],
    trades: [
      { give: ['iron_ingot', 5], get: ['iron_pickaxe', 1] },
      { give: ['iron_ingot', 8], get: ['iron_chestplate', 1] },
      { give: ['hyper_shard', 6], get: ['hyper_sword', 1] },
    ],
  },
  librarian: {
    display: 'Librarian', skin: 'mob_robe_blue', face: 'mob_villager_face', profession: 'Librarian',
    lines: [
      'Eight slices. Scroll far enough and you arrive where you began.',
      'The world is a hypertorus. Comforting, once you stop panicking.',
      'A block you can see only half of is still a whole block. Elsewhere.',
    ],
    trades: [
      { give: ['paper', 12], get: ['book', 3] },
      { give: ['book', 3], get: ['slice_map', 1] },
      { give: ['azure_dust', 9], get: ['phase_lens', 1] },
    ],
  },
  butcher: {
    display: 'Butcher', skin: 'mob_leather', face: 'mob_villager_face', profession: 'Butcher',
    lines: [
      'Cooked meat keeps you upright. Raw meat keeps you humble.',
      'Never chase a pig across a slice boundary. It will win.',
    ],
    trades: [
      { give: ['raw_beef', 6], get: ['steak', 5] },
      { give: ['raw_porkchop', 6], get: ['cooked_porkchop', 5] },
      { give: ['leather', 6], get: ['leather_chestplate', 1] },
    ],
  },
  mason: {
    display: 'Mason', skin: 'mob_villager', face: 'mob_villager_face', profession: 'Mason',
    lines: [
      'Build across a seam and half your wall lives next door.',
      'Stone brick holds its edge when the slice cuts it. Cobble crumbles.',
    ],
    trades: [
      { give: ['cobblestone', 24], get: ['stone_bricks', 16] },
      { give: ['clay_ball', 12], get: ['brick_block', 6] },
      { give: ['stone', 20], get: ['marble', 12] },
    ],
  },
  cartographer: {
    display: 'Cartographer of Slices', skin: 'mob_cartographer', face: 'mob_cartographer_face',
    profession: 'Cartographer',
    lines: [
      'I map where the layers disagree. Those are the interesting places.',
      'A rift spire pierces three slices at once. Climb one and see.',
      'The seams run north-east. They always run north-east.',
    ],
    trades: [
      { give: ['paper', 8], get: ['slice_map', 1] },
      { give: ['hyper_shard', 3], get: ['rift_compass', 1] },
      { give: ['tesseract_shard', 1], get: ['anchor_rod', 1] },
    ],
  },
  weaver: {
    display: 'The Weaver', skin: 'mob_robe_violet', face: 'mob_weaver_face', profession: 'Weaver',
    emissive: 0.2,
    lines: [
      'I move things between layers. For a price, and never for free.',
      'Matter does not travel through w. It is simply already there.',
      'Anchor a place and it stops arguing with the fourth axis.',
    ],
    trades: [
      { give: ['hyper_shard', 4], get: ['phase_anchor', 1] },
      { give: ['tesseract_shard', 2], get: ['rift_block', 1] },
      { give: ['hyperstone', 12], get: ['hyperglass', 8] },
    ],
  },
  hermit: {
    display: 'Slice Hermit', skin: 'mob_hermit', face: 'mob_hermit_face', profession: 'Hermit',
    lines: [
      'Hold F. Turn the wheel. Slowly — always slowly.',
      'Press G and the world snaps back to a whole number. It is a mercy.',
      'I lived a year between two slices. The bread was terrible.',
    ],
    trades: [
      { give: ['bread', 4], get: ['hyper_shard', 1] },
      { give: ['mushroom_brown', 6], get: ['lumen', 2] },
    ],
  },
  tinker: {
    display: 'Wandering Tinker', skin: 'mob_tinker', face: 'mob_tinker_face', profession: 'Tinker',
    lines: [
      'Broken tools, mended. Whole tools, improved. Prices, negotiable.',
      'A hoe is a tool. People forget that.',
    ],
    trades: [
      { give: ['iron_ingot', 3], get: ['bucket', 1] },
      { give: ['stick', 12], get: ['torch', 16] },
      { give: ['gold_ingot', 4], get: ['gold_pickaxe', 1] },
    ],
  },
  archivist: {
    display: 'Archivist', skin: 'mob_archivist', face: 'mob_archivist_face', profession: 'Archivist',
    lines: [
      'Slice zero is the record. The rest are variations on a theme.',
      'Every hyperkeep was built by someone who could not scroll back.',
    ],
    trades: [
      { give: ['book', 2], get: ['bookshelf', 3] },
      { give: ['tesseract_shard', 1], get: ['book', 6] },
    ],
  },
  rift_warden: {
    display: 'Rift Warden', skin: 'mob_rift_warden', face: 'mob_rift_warden_face', profession: 'Warden',
    emissive: 0.35,
    lines: [
      'Do not open what you cannot close.',
      'The spires are not decoration. They are stitches.',
      'Bring me shards and I will keep the seam shut a little longer.',
    ],
    trades: [
      { give: ['tesseract_shard', 3], get: ['hyper_pickaxe', 1] },
      { give: ['hyper_shard', 10], get: ['hyper_helmet', 1] },
    ],
  },
};

export function buildModel(type) {
  const skin = T(type.skin), face = T(type.face || type.skin);
  const opts = { scale: type.scale || 1 };
  switch (type.model) {
    case 'quadruped': return quadruped(skin, face, { ...opts, height: (type.size?.[1] || 1) * 0.55 });
    case 'blob': return blob(skin, face, opts);
    case 'floater': return floater(skin, face, opts);
    case 'crawler': return crawler(skin, face, opts);
    case 'tesseract': return tesseractBody(skin, opts);
    default: return humanoid(skin, face, opts);
  }
}
