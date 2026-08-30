// 4D-MC :: shared constants ----------------------------------------------

export const CHUNK_X = 16;
export const CHUNK_Z = 16;
export const WORLD_H = 88;          // vertical build limit
export const SEA_LEVEL = 34;
export const W_LAYERS = 8;          // number of cyclic slices of the 4th dimension

// The viewing hyperplane is *tilted*: at horizontal position (x,z) the world we
// see comes from w-layer  floor(playerW + shear.x*x + shear.z*z).  That tilt is
// what carves blocks into wedges and prisms along the band boundaries.
export const SHEAR_PRESETS = {
  off:    { x: 0.0,   z: 0.0   },
  subtle: { x: 0.055, z: 0.045 },
  normal: { x: 0.150, z: 0.120 },
  strong: { x: 0.240, z: 0.190 },
  extreme:{ x: 0.380, z: 0.300 },
};

export const FACE = { PX: 0, NX: 1, PY: 2, NY: 3, PZ: 4, NZ: 5, CUT: 6 };

// Per-face normals, matching FACE order.
export const FACE_N = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
];

// Beta-flavoured directional shading. Slightly warmer on +X than -X so the
// world reads as lit from the south-east.
export const FACE_SHADE = [0.78, 0.68, 1.0, 0.52, 0.86, 0.62];

export const GAME_STATE = {
  BOOT: 'boot', MENU: 'menu', LOADING: 'loading', PLAY: 'play', PAUSED: 'paused', DEAD: 'dead',
};

export const TICK_RATE = 20;        // world ticks per second
export const TICK_DT = 1 / TICK_RATE;

export const GRAVITY = 28.0;
export const TERMINAL_V = 55.0;

export const DEFAULT_SETTINGS = {
  fov: 74,
  renderDistance: 5,
  sensitivity: 0.0022,
  invertY: false,
  shear: 'normal',
  wScrollSpeed: 1.0,
  wSmoothing: 0.82,
  ghostLayers: true,
  brightness: 1.0,
  fogDensity: 1.0,
  masterVolume: 0.7,
  musicVolume: 0.35,
  showFps: true,
  viewBob: true,
  particles: true,
  smoothLighting: true,
  guiScale: 1.0,
  crosshairStyle: 'hyper',
};

export const DEFAULT_KEYBINDS = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD',
  jump: 'Space', sneak: 'ShiftLeft', sprint: 'ControlLeft',
  inventory: 'KeyE', drop: 'KeyQ', hyperShift: 'KeyF', phaseLock: 'KeyG',
  ghostToggle: 'KeyH', map: 'KeyM', perspective: 'F5', debug: 'F3',
  screenshot: 'F2', chat: 'KeyT',
};
