// 4D-MC :: biome table ----------------------------------------------------
// Biomes vary along the fourth axis too: the same x/z can be pine forest in
// slice 2 and chroma badlands in slice 5.

export const BIOME = {
  OCEAN: 0, BEACH: 1, PLAINS: 2, FOREST: 3, TAIGA: 4, DESERT: 5, SAVANNA: 6,
  TUNDRA: 7, MOUNTAINS: 8, SWAMP: 9, BADLANDS: 10, HYPERFLATS: 11, RIFT_BARRENS: 12,
};

const c = (r, g, b) => [r / 255, g / 255, b / 255];

export const BIOMES = [
  {
    id: 0, name: 'ocean', display: 'Abyssal Shelf',
    surface: 'gravel', filler: 'stone', beach: null,
    grass: c(90, 150, 120), leaf: c(70, 130, 90), fog: c(60, 95, 140),
    tree: null, treeChance: 0, grassChance: 0, flowerChance: 0,
  },
  {
    id: 1, name: 'beach', display: 'Pale Strand',
    surface: 'sand', filler: 'sand', grass: c(150, 190, 120), leaf: c(110, 165, 90),
    fog: c(150, 175, 190), tree: null, treeChance: 0, grassChance: 0.02, flowerChance: 0,
  },
  {
    id: 2, name: 'plains', display: 'Open Plains',
    surface: 'grass', filler: 'dirt', grass: c(126, 200, 96), leaf: c(96, 175, 74),
    fog: c(150, 185, 215), tree: 'oak', treeChance: 0.006, grassChance: 0.26, flowerChance: 0.05,
  },
  {
    id: 3, name: 'forest', display: 'Deepwood',
    surface: 'grass', filler: 'dirt', grass: c(104, 176, 84), leaf: c(76, 152, 62),
    fog: c(140, 175, 200), tree: 'oak', treeChance: 0.075, grassChance: 0.22, flowerChance: 0.04,
  },
  {
    id: 4, name: 'taiga', display: 'Frostpine Taiga',
    surface: 'grass', filler: 'dirt', grass: c(92, 150, 116), leaf: c(56, 122, 88),
    fog: c(150, 175, 195), tree: 'pine', treeChance: 0.085, grassChance: 0.12, flowerChance: 0.01,
  },
  {
    id: 5, name: 'desert', display: 'Sunscar Desert',
    surface: 'sand', filler: 'sandstone', grass: c(190, 190, 110), leaf: c(170, 175, 95),
    fog: c(215, 200, 160), tree: 'cactus', treeChance: 0.012, grassChance: 0.01, flowerChance: 0,
  },
  {
    id: 6, name: 'savanna', display: 'Amber Savanna',
    surface: 'grass', filler: 'dirt', grass: c(180, 186, 96), leaf: c(154, 168, 82),
    fog: c(200, 195, 165), tree: 'birch', treeChance: 0.012, grassChance: 0.30, flowerChance: 0.02,
  },
  {
    id: 7, name: 'tundra', display: 'Hush Tundra',
    surface: 'snow_grass', filler: 'dirt', grass: c(150, 190, 175), leaf: c(120, 165, 150),
    fog: c(195, 210, 230), tree: 'pine', treeChance: 0.014, grassChance: 0.03, flowerChance: 0.005,
  },
  {
    id: 8, name: 'mountains', display: 'Shardpeak Range',
    surface: 'stone', filler: 'stone', grass: c(120, 170, 110), leaf: c(94, 150, 86),
    fog: c(170, 190, 210), tree: 'pine', treeChance: 0.010, grassChance: 0.05, flowerChance: 0.01,
  },
  {
    id: 9, name: 'swamp', display: 'Mirebound',
    surface: 'grass', filler: 'dirt', grass: c(106, 138, 78), leaf: c(84, 118, 62),
    fog: c(110, 135, 120), tree: 'oak', treeChance: 0.030, grassChance: 0.34, flowerChance: 0.03,
  },
  {
    id: 10, name: 'badlands', display: 'Chroma Badlands',
    surface: 'chroma_clay', filler: 'chroma_clay', grass: c(178, 150, 90), leaf: c(150, 130, 80),
    fog: c(210, 170, 130), tree: null, treeChance: 0, grassChance: 0.02, flowerChance: 0.005,
  },
  {
    id: 11, name: 'hyperflats', display: 'Hyperflats',
    surface: 'hyperstone', filler: 'slate', grass: c(160, 130, 235), leaf: c(140, 110, 220),
    fog: c(120, 100, 190), tree: 'hyper', treeChance: 0.020, grassChance: 0.10, flowerChance: 0.09,
  },
  {
    id: 12, name: 'rift_barrens', display: 'Rift Barrens',
    surface: 'slate', filler: 'slate', grass: c(120, 120, 160), leaf: c(100, 100, 140),
    fog: c(70, 60, 110), tree: null, treeChance: 0.004, grassChance: 0.03, flowerChance: 0.02,
  },
];

export function biomeOf(id) { return BIOMES[id] || BIOMES[2]; }
