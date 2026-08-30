// 4D-MC :: the game --------------------------------------------------------
// Ties the world, the player, the renderer and every screen together.

import { createGL } from '../core/gl.js';
import { Input } from '../core/input.js';
import { audio } from '../core/audio.js';
import {
  DEFAULT_SETTINGS, DEFAULT_KEYBINDS, GAME_STATE, W_LAYERS, WORLD_H, SEA_LEVEL, CHUNK_X,
} from '../core/constants.js';
import { buildAtlas, texLayer } from '../world/atlas.js';
import { World } from '../world/world.js';
import { Slice } from '../world/slice.js';
import { BLOCKS, blockId, TOOL, TIER } from '../world/blocks.js';
import { ITEMS } from '../world/items.js';
import { Renderer } from '../render/renderer.js';
import { Particles } from '../render/particles.js';
import { Player } from './player.js';
import { Inventory, Container, stack, sameItem } from './inventory.js';
import { EntityManager, Mob, NPC, ItemEntity } from './entities.js';
import { SMELTING } from './recipes.js';
import { HUD } from '../ui/hud.js';
import { Menu } from '../ui/menu.js';
import { InventoryUI } from '../ui/inventoryUI.js';
import * as save from './save.js';
import { clamp, lerp, mod, lookDir, hashSeed } from '../core/math.js';

const LOOT = {
  cache: [
    ['wood_pickaxe', 1, 1, 1.0], ['stone_pickaxe', 1, 1, 0.55], ['stone_axe', 1, 1, 0.5],
    ['stone_shovel', 1, 1, 0.4], ['torch', 4, 12, 0.9], ['bread', 1, 3, 0.7],
    ['apple', 1, 3, 0.5], ['coal', 2, 6, 0.75], ['iron_ingot', 1, 3, 0.45],
    ['oak_planks', 6, 16, 0.6], ['stick', 4, 8, 0.5], ['stone_sword', 1, 1, 0.4],
    ['leather_helmet', 1, 1, 0.25], ['bucket', 1, 1, 0.2],
  ],
  keep: [
    ['diamond', 1, 3, 0.5], ['hyper_shard', 2, 6, 0.8], ['tesseract_shard', 1, 2, 0.4],
    ['gold_ingot', 2, 5, 0.5], ['iron_ingot', 3, 8, 0.6], ['lumen', 2, 5, 0.4],
    ['diamond_pickaxe', 1, 1, 0.18], ['phase_lens', 1, 1, 0.2], ['anchor_rod', 1, 1, 0.15],
    ['book', 1, 3, 0.35], ['bread', 2, 5, 0.4],
  ],
  camp: [
    ['bread', 1, 4, 0.8], ['seeds', 2, 6, 0.6], ['wheat', 1, 4, 0.5],
    ['wool_white', 1, 3, 0.4], ['stick', 2, 8, 0.6], ['torch', 2, 6, 0.6],
    ['iron_ingot', 1, 2, 0.3], ['apple', 1, 2, 0.4], ['leather', 1, 3, 0.35],
  ],
  spawn: [
    ['wood_pickaxe', 1, 1, 1], ['wood_axe', 1, 1, 1], ['wood_shovel', 1, 1, 1],
    ['wood_sword', 1, 1, 1], ['torch', 12, 12, 1], ['bread', 3, 3, 1],
    ['oak_planks', 12, 12, 1], ['stick', 8, 8, 1], ['crafting_table', 1, 1, 1],
    ['coal', 5, 5, 1], ['apple', 2, 2, 1],
  ],
};

const LOADING_TIPS = [
  'Hold F and turn the scroll wheel to slide through the fourth dimension. Slowly.',
  'Blocks caught on a slice boundary render as wedges and prisms. They are still solid.',
  'Press G to snap yourself to the nearest whole slice.',
  'The world wraps after eight slices. Scroll far enough and you come home.',
  'Some creatures live between slices. You will only ever see part of them.',
  'A Hyperbench gives you a five-by-five grid. Your pack gives you four-by-four.',
  'Supply caches hold a starting kit. Look for stone rooms just under the surface.',
  'Rift spires pierce several slices at once. They make useful landmarks.',
  'Cross-sections are shaded differently to real block faces. That is how you spot a seam.',
  'Your inventory starts empty. Everything you carry, you dug up.',
];

export class Game {
  constructor(dom) {
    this.dom = dom;
    this.state = GAME_STATE.BOOT;
    this.settings = save.loadSettings(DEFAULT_SETTINGS);
    this.keybinds = save.loadKeybinds(DEFAULT_KEYBINDS);
    this.inGame = false;
    this.worldId = null;
    this.worldMeta = null;
    this.elapsed = 0;
    this.fps = 60;
    this.fpsAccum = 0;
    this.fpsFrames = 0;
    this.debug = false;
    this.hideHud = false;
    this.mining = null;
    this.useCooldown = 0;
    this.discoveries = new Set();
    this.autosaveTimer = 0;
    this.lastFrame = 0;
    this.bobPhase = 0;
  }

  // --- boot ---------------------------------------------------------------
  async boot() {
    const { glCanvas, hudCanvas, menuRoot, invRoot, loadingRoot } = this.dom;
    this.gl = createGL(glCanvas);
    buildAtlas();
    this.renderer = new Renderer(this.gl, glCanvas);
    this.renderer.init();
    this.input = new Input(glCanvas);
    this.hud = new HUD(hudCanvas);
    this.menu = new Menu(menuRoot, this);
    this.invUI = new InventoryUI(invRoot, this);
    this.particles = new Particles();
    this.loadingRoot = loadingRoot;

    audio.applySettings(this.settings);
    const unlock = () => { audio.init(); audio.resume(); };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });

    this.input.onLockChange((locked) => {
      if (!locked && this.state === GAME_STATE.PLAY && !this.invUI.open) this.pause();
    });

    // A quiet world runs behind the menus so the shear is visible before you play.
    this.startMenuWorld();
    this.state = GAME_STATE.MENU;
    this.menu.show('title');
    requestAnimationFrame((t) => this.frame(t));
  }

  startMenuWorld() {
    this.menuWorld = new World(hashSeed(`menu-${Math.floor(Math.random() * 9999)}`), { shear: 'normal' });
    this.menuWorld.time = 0.42;
    this.menuCam = { x: 38, y: 58, z: 8, yaw: -1.57, pitch: 0.42, fov: 66 };
    this.menuOrbit = 0;
    this.menuReady = false;
  }

  // --- world lifecycle ----------------------------------------------------
  enterWorld(id) {
    const data = save.loadWorld(id);
    if (!data) { this.hud.toast('That world could not be read.', '#e05a63'); return; }
    this.worldId = id;
    this.worldMeta = data.meta;
    this.state = GAME_STATE.LOADING;
    this.menu.hide();
    this.showLoading(`Weaving ${data.meta.name}`, LOADING_TIPS[Math.floor(Math.random() * LOADING_TIPS.length)]);

    this.world = new World(data.meta.seed, {
      shear: data.meta.shear || this.settings.shear,
      type: data.meta.worldType || 'continents',
      structures: data.meta.structures !== false,
    });
    this.world.loadEdits(data.edits);
    this.player = new Player(this.world);
    this.player.gameMode = data.meta.gameMode || 'survival';
    this.inventory = new Inventory();
    this.entities = new EntityManager(this.world);
    this.entities.onPickup = (e) => this.pickup(e);
    this.particles.clear();
    this.tileEntityCache = new Map();
    this.restoreTileEntities(data.tileEntities);
    this.discoveries = new Set(data.discoveries || []);
    this.freshWorld = !data.player;
    this.world.time = typeof data.time === 'number' ? data.time : 0.42;

    // stream the spawn area in over a few frames so the page stays responsive
    this.loadStep = 0;
    this.pendingSave = data;
    this.state = GAME_STATE.LOADING;
  }

  finishLoad() {
    const data = this.pendingSave;
    if (data.player) {
      this.player.deserialize(data.player);
      this.inventory.load(data.inventory);
      this.entities.load(data.entities);
    } else {
      const spawn = this.findSpawn();
      this.player.x = spawn.x; this.player.y = spawn.y; this.player.z = spawn.z;
      this.world.slice.w = spawn.w;
      this.player.wTarget = spawn.w;
      this.spawnPoint = spawn;
      this.placeStarterCache(spawn);
      if (this.player.gameMode === 'creative') this.player.flying = true;
    }
    this.spawnPoint = this.spawnPoint || {
      x: this.player.x, y: this.player.y, z: this.player.z, w: this.world.slice.w,
    };
    this.player.lastBand = this.world.slice.bandAt(this.player.x, this.player.z);
    this.inGame = true;
    this.state = GAME_STATE.PLAY;
    this.hideLoading();
    audio.init();
    audio.startDrone();
    this.input.requestLock();
    this.hud.toast(`Welcome to ${this.worldMeta.name}`, '#4fe5d7');
    if (this.freshWorld) {
      this.hud.unlock('Ana and Kata', 'Hold F and scroll to move through the fourth axis.');
      this.hud.toast('A supply cache was left at your spawn.', '#9ddc4a');
    }
    this.pendingSave = null;
  }

  /** Search outward for a stable, dry, open place to stand. */
  findSpawn() {
    const w = 0.5;
    this.world.slice.w = w;
    for (let r = 0; r < 40; r++) {
      const n = r === 0 ? 1 : r * 6;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const x = Math.round(Math.cos(a) * r * 4) + 0.5;
        const z = Math.round(Math.sin(a) * r * 4) + 0.5;
        for (let cz = -1; cz <= 1; cz++)
          for (let cx = -1; cx <= 1; cx++) this.world.ensureChunk((x >> 4) + cx, (z >> 4) + cz);
        let guard = 0;
        while (this.world.generateOne() && guard++ < 40);
        const layer = this.world.slice.layerAt(x, z);
        const h = this.world.heightAt(Math.floor(x), Math.floor(z), layer);
        if (h <= SEA_LEVEL || h > WORLD_H - 12) continue;
        const ground = this.world.getBlockSafe(Math.floor(x), h, Math.floor(z), layer);
        const gb = BLOCKS[ground];
        if (!gb || !gb.solid || gb.liquid) continue;
        // don't drop the player onto a tree canopy
        if (gb.name.endsWith('_leaves') || gb.name.endsWith('_log')) continue;
        if (this.player.canOccupy(w, x, h + 1, z)) return { x, y: h + 1, z, w };
      }
    }
    return { x: 0.5, y: 70, z: 0.5, w };
  }

  /** Every new world starts you next to a chest of basic gear. */
  placeStarterCache(spawn) {
    const bx = Math.floor(spawn.x) + 2;
    const bz = Math.floor(spawn.z);
    const band = this.world.slice.bandAt(bx + 0.5, bz + 0.5);
    const layer = Slice.wrap(band);
    let by = Math.floor(spawn.y);
    for (let k = 0; k < 6; k++) {
      if (this.world.getBlockSafe(bx, by, bz, layer) === 0) break;
      by++;
    }
    const below = this.world.getBlockSafe(bx, by - 1, bz, layer);
    if (!below) this.world.setBlock(bx, by - 1, bz, layer, blockId('cobblestone'));
    this.world.setBlock(bx, by, bz, layer, blockId('chest'));
    const c = new Container(27, 'Cache');
    for (const [name, lo, hi] of LOOT.spawn) {
      const n = lo + Math.floor(Math.random() * (hi - lo + 1));
      if (n > 0) c.add(stack(name, n));
    }
    this.world.setTE(bx, by, bz, layer, { type: 'chest', container: c.serialize() });
    this.tileEntityCache.set(`${bx},${by},${bz},${layer}`, { type: 'chest', container: c });
    // a torch so it is findable at night
    if (this.world.getBlockSafe(bx, by + 1, bz, layer) === 0)
      this.world.setBlock(bx, by + 1, bz, layer, blockId('torch'));
  }

  leaveWorld() {
    audio.stopDrone();
    this.inGame = false;
    this.world = null;
    this.player = null;
    this.entities = null;
    this.particles.clear();
    this.state = GAME_STATE.MENU;
    this.invUI.hide();
    this.input.exitLock();
    this.startMenuWorld();
    this.menu.show('title');
  }

  pause() {
    if (this.state !== GAME_STATE.PLAY) return;
    this.state = GAME_STATE.PAUSED;
    this.invUI.hide();
    this.input.exitLock();
    this.menu.show('pause');
  }

  resume() {
    if (!this.inGame) return;
    this.state = GAME_STATE.PLAY;
    this.menu.hide();
    this.input.requestLock();
  }

  respawn() {
    this.player.respawn(this.spawnPoint);
    this.state = GAME_STATE.PLAY;
    this.menu.hide();
    this.input.requestLock();
  }

  closeUI() {
    this.invUI.hide();
    if (this.state === GAME_STATE.PLAY) this.input.requestLock();
  }

  applySettings() {
    audio.applySettings(this.settings);
    save.saveSettings(this.settings);
  }

  applyShear(name) {
    if (this.world) {
      this.world.slice.setPreset(name);
      for (const c of this.world.chunks.values()) c.markAllDirty();
    }
    if (this.menuWorld) this.menuWorld.slice.setPreset(name);
  }

  // --- saving -------------------------------------------------------------
  saveGame() {
    if (!this.inGame) return;
    const tes = [];
    for (const [key, te] of this.tileEntityCache) {
      const entry = { key, type: te.type };
      if (te.container) entry.container = te.container.serialize();
      if (te.burnTime !== undefined) {
        entry.burnTime = te.burnTime; entry.burnMax = te.burnMax; entry.cookTime = te.cookTime;
      }
      tes.push(entry);
    }
    const ok = save.saveWorld(this.worldId, {
      meta: this.worldMeta,
      player: this.player.serialize(),
      inventory: this.inventory.serialize(),
      edits: this.world.serializeEdits(),
      entities: this.entities.serialize(),
      tileEntities: tes,
      discoveries: Array.from(this.discoveries),
      time: this.world.time,
    });
    this.hud.toast(ok ? 'World saved' : 'Save failed — storage full?', ok ? '#9ddc4a' : '#e05a63');
  }

  restoreTileEntities(list) {
    if (!list) return;
    for (const e of list) {
      const te = { type: e.type };
      if (e.container) te.container = Container.deserialize(e.container, e.type);
      if (e.burnTime !== undefined) {
        te.burnTime = e.burnTime; te.burnMax = e.burnMax; te.cookTime = e.cookTime;
      }
      this.tileEntityCache.set(e.key, te);
    }
  }

  /** Fetch (or lazily create) the live tile entity at a position. */
  tileEntity(x, y, z, layer, type) {
    const key = `${x},${y},${z},${layer}`;
    let te = this.tileEntityCache.get(key);
    if (te) return te;
    const stored = this.world.getTE(x, y, z, layer);
    if (type === 'chest') {
      const c = new Container(stored && stored.hyper ? 45 : 27, 'Chest');
      if (stored && stored.loot && LOOT[stored.loot]) {
        for (const [name, lo, hi, chance] of LOOT[stored.loot]) {
          if (Math.random() > chance) continue;
          const n = lo + Math.floor(Math.random() * (hi - lo + 1));
          if (n > 0) c.add(stack(name, n));
        }
      }
      te = { type: 'chest', container: c, hyper: !!(stored && stored.hyper) };
    } else if (type === 'furnace') {
      te = { type: 'furnace', container: new Container(3, 'Furnace'), burnTime: 0, burnMax: 0, cookTime: 0 };
    } else {
      te = { type };
    }
    this.tileEntityCache.set(key, te);
    return te;
  }

  // --- loading screen ------------------------------------------------------
  showLoading(title, tip) {
    const r = this.loadingRoot;
    r.innerHTML = `
      <div class="load-title">${title}</div>
      <div class="load-sub">generating the hypertorus…</div>
      <div class="load-bar"><div class="load-bar-fill" id="loadfill"></div></div>
      <div class="load-tip">${tip}</div>`;
    r.classList.add('visible');
    this.loadFill = document.getElementById('loadfill');
  }
  setLoadProgress(f) { if (this.loadFill) this.loadFill.style.width = `${Math.round(f * 100)}%`; }
  hideLoading() { this.loadingRoot.classList.remove('visible'); }

  // --- main loop -----------------------------------------------------------
  frame(t) {
    requestAnimationFrame((tt) => this.frame(tt));
    const now = t / 1000;
    let dt = this.lastFrame ? now - this.lastFrame : 1 / 60;
    this.lastFrame = now;
    dt = Math.min(dt, 0.1);
    this.elapsed += dt;

    this.fpsAccum += dt; this.fpsFrames++;
    if (this.fpsAccum > 0.4) {
      this.fps = this.fpsFrames / this.fpsAccum;
      this.fpsAccum = 0; this.fpsFrames = 0;
    }

    try {
      if (this.state === GAME_STATE.LOADING) this.updateLoading(dt);
      else if (this.inGame) this.updateGame(dt);
      else this.updateMenuWorld(dt);
    } catch (err) {
      this.fatal(err);
      return;
    }
    this.input.endFrame();
  }

  updateLoading(dt) {
    const t0 = performance.now();
    const R = 2;
    const p = this.player;
    for (let dz = -R; dz <= R; dz++)
      for (let dx = -R; dx <= R; dx++) this.world.ensureChunk(dx, dz);
    let made = 0;
    while (performance.now() - t0 < 22 && this.world.generateOne()) made++;
    this.loadStep += made;
    this.setLoadProgress(clamp(this.loadStep / 26, 0, 0.95));
    if (this.world.genQueue.length === 0 || this.loadStep > 40) {
      this.setLoadProgress(1);
      this.finishLoad();
    }
    this.renderMenuBackdrop(dt);
  }

  updateMenuWorld(dt) {
    const w = this.menuWorld;
    if (!w) return;
    const t0 = performance.now();
    const R = 3;
    const ccx = Math.floor(this.menuCam.x / CHUNK_X), ccz = Math.floor(this.menuCam.z / CHUNK_X);
    for (let dz = -R; dz <= R; dz++)
      for (let dx = -R; dx <= R; dx++) w.ensureChunk(ccx + dx, ccz + dz);
    while (performance.now() - t0 < 6 && w.generateOne());
    if (!this.menuReady && w.genQueue.length === 0) this.menuReady = true;
    // a slow orbit while the slice drifts, so the shear is legible at a glance
    this.menuOrbit = (this.menuOrbit || 0) + dt * 0.045;
    w.slice.w += dt * 0.05;
    w.time = (w.time + dt / 900) % 1;
    const r = 30;
    const cx = 8, cz = 8;
    this.menuCam.x = cx + Math.cos(this.menuOrbit) * r;
    this.menuCam.z = cz + Math.sin(this.menuOrbit) * r;
    this.menuCam.yaw = Math.atan2(cx - this.menuCam.x, cz - this.menuCam.z);
    this.menuCam.pitch = 0.42;
    const layer = w.slice.layerAt(this.menuCam.x, this.menuCam.z);
    const gh = w.heightAt(Math.floor(this.menuCam.x), Math.floor(this.menuCam.z), layer);
    this.menuCam.y = lerp(this.menuCam.y, Math.max(gh, SEA_LEVEL) + 16, Math.min(1, dt * 1.5));
    this.renderMenuBackdrop(dt);
  }

  renderMenuBackdrop(dt) {
    const w = this.state === GAME_STATE.LOADING ? this.world : this.menuWorld;
    const cam = this.state === GAME_STATE.LOADING
      ? { x: 8, y: 70, z: 8, yaw: this.elapsed * 0.15, pitch: 0.35, fov: 70 }
      : this.menuCam;
    if (!w) return;
    this.renderer.render({
      world: w, camera: cam,
      settings: { ...this.settings, renderDistance: 4, fogDensity: 0.75 },
      entities: [], particles: null, highlight: null, heldItem: null,
      dt, elapsed: this.elapsed, underwater: false, inLava: false,
      seamGlow: 0.5, showHand: false,
    });
    const ctx = this.hud.ctx;
    this.hud.resize();
    ctx.setTransform(this.hud.dpr, 0, 0, this.hud.dpr, 0, 0);
    ctx.clearRect(0, 0, this.hud.W, this.hud.H);
  }

  // --- gameplay ------------------------------------------------------------
  updateGame(dt) {
    const input = this.input;
    const binds = this.keybinds;
    const p = this.player;

    // --- global keys
    if (input.justPressed('Escape')) {
      if (this.invUI.open) this.closeUI();
      else if (this.state === GAME_STATE.PLAY) this.pause();
      else if (this.state === GAME_STATE.PAUSED) this.resume();
    }
    if (input.justPressed(binds.debug)) this.debug = !this.debug;
    if (input.justPressed('F1')) this.hideHud = !this.hideHud;
    if (input.justPressed(binds.screenshot)) this.screenshot();

    if (this.state === GAME_STATE.DEAD) {
      this.renderWorld(dt);
      return;
    }
    if (this.state !== GAME_STATE.PLAY) {
      this.renderWorld(dt);
      return;
    }

    if (this.invUI.open) {
      if (input.justPressed(binds.inventory) || input.justPressed('Escape')) this.closeUI();
      if (input.justPressed(binds.drop)) this.invUI.dropHovered();
      this.world.update(dt, p.x, p.z, this.settings.renderDistance);
      this.tickFurnaces(dt);
      this.entities.update(dt, p);
      this.particles.update(dt, this.world);
      this.renderWorld(dt);
      return;
    }

    // --- look
    if (input.locked) p.look(input.mouse.dx, input.mouse.dy, this.settings.sensitivity, this.settings.invertY);

    // --- hotbar selection
    for (let i = 0; i < 9; i++) {
      if (input.justPressed(`Digit${i + 1}`)) this.selectSlot(i);
    }
    if (!p.shifting && input.wheel !== 0) {
      const dir = input.wheel > 0 ? 1 : -1;
      this.selectSlot(mod(this.inventory.selected + dir, 9));
    }

    // --- fourth-dimension travel
    p.updateHyperShift(input, binds, this.settings, dt);
    if (p.shifting && Math.random() < dt * 6 && this.settings.particles)
      this.particles.sliceSpark(p.x, p.y, p.z, this.world.slice.at(p.x, p.z), 2);

    // --- movement & world
    p.update(dt, input, binds, this.settings);
    if (!p.canOccupy(this.world.slice.w)) p.resolveOverlap();

    if (p.dead && this.state === GAME_STATE.PLAY) {
      this.state = GAME_STATE.DEAD;
      this.input.exitLock();
      this.dropInventoryOnDeath();
      this.menu.show('dead');
    }

    if (input.justPressed(binds.inventory)) {
      this.openInventory();
    }
    if (input.justPressed(binds.drop)) this.dropSelected(input.down('ShiftLeft'));
    if (input.justPressed(binds.ghostToggle)) {
      this.settings.ghostLayers = !this.settings.ghostLayers;
      this.hud.toast(`Seam shimmer ${this.settings.ghostLayers ? 'on' : 'off'}`);
      save.saveSettings(this.settings);
    }
    if (input.justPressed(binds.perspective) && p.gameMode === 'creative') {
      p.flying = !p.flying;
      this.hud.toast(p.flying ? 'Flight enabled' : 'Flight disabled');
    }
    if (input.justPressed('KeyF') === false && input.justPressed('KeyC')) { /* reserved */ }

    // --- targeting
    const hit = p.pick();
    this.target = hit;
    this.useCooldown = Math.max(0, this.useCooldown - dt);
    this.handleMining(dt, hit);
    this.handleUse(hit);

    // --- world simulation
    this.world.update(dt, p.x, p.z, this.settings.renderDistance);
    this.tickFurnaces(dt);
    this.entities.update(dt, p);
    if (this.settings.particles) this.particles.update(dt, this.world);

    this.checkDiscoveries();

    this.autosaveTimer += dt;
    if (this.autosaveTimer > 120) { this.autosaveTimer = 0; this.saveGame(); }

    this.renderWorld(dt);
  }

  selectSlot(i) {
    if (this.inventory.selected === i) return;
    this.inventory.selected = i;
    const s = this.inventory.get(i);
    if (s) this.hud.showItem(s.name);
    audio.tone({ freq: 620, dur: 0.04, type: 'square', gain: 0.05 });
  }

  openInventory() {
    // a Hyperbench within reach upgrades the grid to 5x5
    const hit = this.player.pick(4.5);
    let mode = 'inventory';
    if (hit.hit && BLOCKS[hit.id] && BLOCKS[hit.id].name === 'crafting_table') mode = 'bench';
    this.invUI.show(mode);
    this.input.exitLock();
  }

  // --- mining --------------------------------------------------------------
  handleMining(dt, hit) {
    const p = this.player;
    const input = this.input;
    if (!input.mouse.left) {
      this.mining = null;
      return;
    }
    // attack a creature first if one is in the way
    const dir = lookDir(p.yaw, p.pitch);
    const ent = this.entities.pickEntity(p, dir, Math.min(p.reach, hit.hit ? hit.dist : p.reach));
    if (ent && input.clicked.left) {
      p.startSwing();
      const held = this.inventory.heldItem();
      const def = held ? ITEMS[held.name] : null;
      const dmg = def ? def.damage : 1;
      const a = Math.atan2(ent.x - p.x, ent.z - p.z);
      ent.hurt(dmg, Math.sin(a), Math.cos(a));
      this.hud.hitMarker = 1;
      if (def && def.durability) this.inventory.damageSelected(1);
      return;
    }
    if (!hit.hit) { this.mining = null; return; }

    const b = BLOCKS[hit.id];
    if (!b || b.hardness < 0) return;
    p.startSwing();

    const key = `${hit.x},${hit.y},${hit.z},${hit.band}`;
    if (!this.mining || this.mining.key !== key) {
      this.mining = { key, progress: 0, x: hit.x, y: hit.y, z: hit.z, band: hit.band, id: hit.id };
      audio.dig(b.sound);
    }

    const held = this.inventory.heldItem();
    const def = held ? ITEMS[held.name] : null;
    let speed = 1;
    let canHarvest = b.tier === TIER.HAND;
    if (def && def.kind === 'tool') {
      if (def.tool === b.tool) speed = def.speed;
      if (def.tier >= b.tier) canHarvest = true;
    }
    if (p.gameMode === 'creative') { speed = 1000; canHarvest = true; }
    if (!p.onGround) speed *= 0.55;
    if (p.inWater) speed *= 0.5;

    this.mining.progress += (dt * speed) / Math.max(0.05, b.hardness * 1.5);
    this.mining.canHarvest = canHarvest;

    if (Math.random() < dt * 12 && this.settings.particles)
      this.particles.blockHit(hit.x, hit.y, hit.z, hit.band, hit.id, hit.nx, hit.ny, hit.nz);
    if (Math.random() < dt * 4) audio.dig(b.sound);

    if (this.mining.progress >= 1) {
      this.breakBlock(hit.x, hit.y, hit.z, hit.band, hit.id, canHarvest);
      this.mining = null;
    }
  }

  breakBlock(x, y, z, band, id, canHarvest) {
    const layer = Slice.wrap(band);
    const b = BLOCKS[id];
    if (!b) return;
    this.world.setBlock(x, y, z, layer, 0);
    // a door is two blocks
    if (b.name === 'door_lower') this.world.setBlock(x, y + 1, z, layer, 0);
    if (b.name === 'door_upper') this.world.setBlock(x, y - 1, z, layer, 0);

    audio.breakBlock(b.sound);
    if (this.settings.particles) this.particles.blockBreak(x, y, z, band + 0.5, id);

    // spill container contents
    const te = this.tileEntityCache.get(`${x},${y},${z},${layer}`);
    if (te && te.container) {
      for (const s of te.container.slots) if (s) this.entities.spawnItem(x + 0.5, y + 0.5, z + 0.5, band + 0.5, s);
      this.tileEntityCache.delete(`${x},${y},${z},${layer}`);
      this.world.removeTE(x, y, z, layer);
    }

    if (this.player.gameMode === 'creative') return;
    if (canHarvest && b.drop) {
      const dropName = b.drop === b.name && ITEMS[b.name] ? b.name : b.drop;
      if (ITEMS[dropName]) {
        this.entities.spawnItem(x + 0.5, y + 0.5, z + 0.5, band + 0.5,
          stack(dropName, b.dropCount));
      }
    }
    const held = this.inventory.heldItem();
    if (held && ITEMS[held.name] && ITEMS[held.name].durability) this.inventory.damageSelected(1);
    if (b.name.endsWith('_ore')) {
      this.entities.spawnXP(x + 0.5, y + 0.6, z + 0.5, band + 0.5, 2);
      this.discover(`ore_${b.name}`, `First ${b.display}`, 'Something worth carrying home.');
    }
  }

  // --- using / placing ------------------------------------------------------
  handleUse(hit) {
    if (!this.input.clicked.right || this.useCooldown > 0) return;
    this.useCooldown = 0.22;
    const p = this.player;
    const held = this.inventory.heldItem();
    const def = held ? ITEMS[held.name] : null;

    // talk to whoever is in front of us
    const dir = lookDir(p.yaw, p.pitch);
    const ent = this.entities.pickEntity(p, dir, 4.2);
    if (ent && ent.kind === 'npc') {
      this.hud.say(ent.type.display, ent.greet());
      this.invUI.show('trade', { npc: ent });
      this.input.exitLock();
      p.startSwing();
      return;
    }

    if (hit.hit) {
      const b = BLOCKS[hit.id];
      const layer = Slice.wrap(hit.band);
      // interact with the block we are pointing at, unless sneaking
      if (b && b.interact && !this.input.down(this.keybinds.sneak)) {
        this.interactBlock(hit, b, layer);
        return;
      }
      // tool-specific block actions
      if (def && def.kind === 'tool' && held.name.endsWith('_hoe') &&
          (b.name === 'grass' || b.name === 'dirt')) {
        this.world.setBlock(hit.x, hit.y, hit.z, layer, blockId('farmland'));
        audio.place('dirt');
        this.inventory.damageSelected(1);
        p.startSwing();
        return;
      }
      if (def && def.kind === 'seed' && (b.name === 'farmland' || b.name === 'farmland_wet')) {
        if (this.world.getBlockSafe(hit.x, hit.y + 1, hit.z, layer) === 0) {
          this.world.setBlock(hit.x, hit.y + 1, hit.z, layer, blockId('wheat_0'));
          this.inventory.consumeSelected(1);
          audio.place('grass');
          p.startSwing();
        }
        return;
      }
      if (held && held.name === 'bucket' && b.liquid) {
        this.world.setBlock(hit.x, hit.y, hit.z, layer, 0);
        this.inventory.consumeSelected(1);
        const left = this.inventory.give(stack(b.name === 'water' ? 'water_bucket' : 'lava_bucket', 1));
        if (left) this.dropStack(left);
        audio.splash();
        return;
      }
    }

    if (!held) return;

    if (held.name === 'water_bucket' || held.name === 'lava_bucket') {
      if (!hit.hit) return;
      const layer = Slice.wrap(hit.pband);
      this.world.setBlock(hit.px, hit.py, hit.pz, layer, blockId(held.name === 'water_bucket' ? 'water' : 'lava'));
      this.inventory.consumeSelected(1);
      this.inventory.give(stack('bucket', 1));
      audio.splash();
      return;
    }

    if (held.name === 'anchor_rod') {
      p.wTarget = Math.round(p.wTarget - 0.5) + 0.5;
      audio.sliceShift(1);
      this.hud.toast('Phase locked to the nearest whole slice', '#4fe5d7');
      this.particles.sliceSpark(p.x, p.y, p.z, this.world.slice.at(p.x, p.z), 18);
      return;
    }

    if (def && def.kind === 'food') {
      if (p.eat(def)) {
        this.inventory.consumeSelected(1);
        audio.step('cloth', 0.7);
        this.hud.toast(`Ate ${def.display}`, '#e0a03c');
      } else this.hud.toast('Not hungry', '#8a95ab');
      return;
    }

    if (def && def.place) {
      this.placeBlock(hit, def);
    }
  }

  interactBlock(hit, b, layer) {
    const p = this.player;
    p.startSwing();
    if (b.interact === 'chest') {
      const te = this.tileEntity(hit.x, hit.y, hit.z, layer, 'chest');
      te.hyper = b.name === 'hyperchest';
      this.invUI.show('chest', { chest: te });
      this.input.exitLock();
      audio.step('wood', 0.8);
    } else if (b.interact === 'crafting') {
      this.invUI.show('bench');
      this.input.exitLock();
      audio.uiClick();
    } else if (b.interact === 'furnace') {
      const te = this.tileEntity(hit.x, hit.y, hit.z, layer, 'furnace');
      te.pos = { x: hit.x, y: hit.y, z: hit.z, layer };
      this.activeFurnaces = this.activeFurnaces || new Set();
      this.activeFurnaces.add(te);
      this.invUI.show('furnace', { furnace: te });
      this.input.exitLock();
      audio.step('stone', 0.8);
    } else if (b.interact === 'door') {
      const isLower = b.name === 'door_lower';
      const ly = isLower ? hit.y : hit.y - 1;
      const open = this.world.getBlockSafe(hit.x, ly, hit.z, layer) === blockId('door_lower');
      // a door here simply pops out of the way and back
      this.world.setBlock(hit.x, ly, hit.z, layer, open ? 0 : blockId('door_lower'));
      this.world.setBlock(hit.x, ly + 1, hit.z, layer, open ? 0 : blockId('door_upper'));
      audio.step('wood', 0.9);
    } else if (b.interact === 'rift') {
      // a rift stone nudges you one whole slice along
      p.wTarget += 1;
      audio.sliceShift(1);
      this.hud.toast('The rift pushes you one slice ana', '#a487ff');
      this.particles.sliceSpark(hit.x + 0.5, hit.y + 1, hit.z + 0.5, hit.band + 0.5, 26);
      this.discover('rift_used', 'Through the Seam', 'A rift stone carried you into the next slice.');
    } else if (b.interact === 'anchor') {
      p.wTarget = Math.round(p.wTarget - 0.5) + 0.5;
      audio.sliceShift(-1);
      this.hud.toast('Anchored to a whole slice', '#4fe5d7');
    }
  }

  placeBlock(hit, def) {
    if (!hit.hit) return;
    const p = this.player;
    const id = blockId(def.place);
    if (!id) return;
    const band = hit.pband;
    const layer = Slice.wrap(band);
    const x = hit.px, y = hit.py, z = hit.pz;
    if (y < 0 || y >= WORLD_H - 1) return;
    const existing = this.world.getBlockSafe(x, y, z, layer);
    if (existing !== 0 && !(BLOCKS[existing] && BLOCKS[existing].liquid)) return;

    // never wall yourself in
    const saved = this.world.slice.w;
    this.world.setBlock(x, y, z, layer, id);
    const blocksPlayer = !p.canOccupy(saved);
    if (blocksPlayer) {
      this.world.setBlock(x, y, z, layer, existing);
      audio.uiDenied();
      return;
    }
    if (def.place === 'door_lower') {
      if (this.world.getBlockSafe(x, y + 1, z, layer) !== 0) {
        this.world.setBlock(x, y, z, layer, existing);
        audio.uiDenied();
        return;
      }
      this.world.setBlock(x, y + 1, z, layer, blockId('door_upper'));
    }

    const b = BLOCKS[id];
    audio.place(b.sound);
    p.startSwing();
    if (this.player.gameMode !== 'creative') this.inventory.consumeSelected(1);
    if (b.interact === 'chest') this.tileEntity(x, y, z, layer, 'chest');
    if (b.interact === 'furnace') this.tileEntity(x, y, z, layer, 'furnace');
  }

  // --- furnaces -------------------------------------------------------------
  tickFurnaces(dt) {
    if (!this.activeFurnaces) return;
    for (const te of this.activeFurnaces) {
      const c = te.container;
      const input = c.get(0), fuel = c.get(1), out = c.get(2);
      const recipe = input ? SMELTING[input.name] : null;

      if (te.burnTime > 0) te.burnTime -= dt * 20;
      if (te.burnTime <= 0 && recipe && fuel && ITEMS[fuel.name] && ITEMS[fuel.name].fuel > 0) {
        const canOut = !out || (out.name === recipe && out.count < 64);
        if (canOut) {
          te.burnMax = ITEMS[fuel.name].fuel / 20;
          te.burnTime = te.burnMax;
          fuel.count -= 1;
          if (fuel.count <= 0) c.set(1, null);
          c.touch();
        }
      }
      if (te.burnTime > 0 && recipe) {
        const canOut = !out || (out.name === recipe && out.count < 64);
        if (canOut) {
          te.cookTime += dt * 20;
          if (te.cookTime >= 200) {
            te.cookTime = 0;
            if (out) out.count += 1; else c.set(2, stack(recipe, 1));
            input.count -= 1;
            if (input.count <= 0) c.set(0, null);
            c.touch();
            audio.tone({ freq: 420, dur: 0.12, type: 'sine', gain: 0.06 });
          }
        }
      } else te.cookTime = Math.max(0, te.cookTime - dt * 40);

      // reflect the lit state in the world
      if (te.pos) {
        const { x, y, z, layer } = te.pos;
        const cur = this.world.getBlockSafe(x, y, z, layer);
        const want = te.burnTime > 0 ? blockId('furnace_lit') : blockId('furnace');
        if ((cur === blockId('furnace') || cur === blockId('furnace_lit')) && cur !== want)
          this.world.setBlock(x, y, z, layer, want);
        if (te.burnTime > 0 && Math.random() < dt * 3 && this.settings.particles)
          this.particles.smoke(x + 0.5, y + 1.1, z + 0.5, layer + 0.5);
      }
      // repaint the furnace screen only when a bar visibly moves
      if (this.invUI.open && this.invUI.furnace === te) {
        const sig = `${Math.round(te.cookTime / 4)}:${Math.round(te.burnTime)}:${te.container.version}`;
        if (sig !== this._furnaceSig) { this._furnaceSig = sig; this.invUI.render(); }
      }
    }
  }

  // --- items ----------------------------------------------------------------
  pickup(e) {
    if (e.kind === 'xp') {
      const p = this.player;
      p.xp += e.amount;
      const need = 12 + p.level * 6;
      while (p.xp >= need) { p.xp -= need; p.level++; }
      audio.tone({ freq: 900, dur: 0.06, type: 'sine', gain: 0.07, glide: 1.4 });
      return true;
    }
    const left = this.inventory.give(e.stack);
    if (left && left.count === e.stack.count) return false;
    audio.pickup();
    const def = ITEMS[e.stack.name];
    this.hud.toast(`+${e.stack.count - (left ? left.count : 0)} ${def ? def.display : e.stack.name}`);
    if (left) { e.stack = left; return false; }
    return true;
  }

  dropStack(s) {
    if (!s) return;
    const p = this.player;
    const dir = lookDir(p.yaw, p.pitch);
    const e = this.entities.spawnItem(
      p.x + dir[0] * 0.6, p.eyeY - 0.2, p.z + dir[2] * 0.6,
      this.world.slice.at(p.x, p.z), s, 0);
    e.vx = dir[0] * 5; e.vy = dir[1] * 4 + 1.6; e.vz = dir[2] * 5;
    e.pickupDelay = 1.1;
  }

  dropSelected(all) {
    const s = this.inventory.heldItem();
    if (!s) return;
    if (all || s.count === 1) {
      this.dropStack(s);
      this.inventory.set(this.inventory.selected, null);
    } else {
      this.dropStack({ ...s, count: 1 });
      s.count -= 1;
      this.inventory.touch();
    }
  }

  dropInventoryOnDeath() {
    if (this.player.gameMode === 'creative') return;
    for (let i = 0; i < this.inventory.size; i++) {
      const s = this.inventory.get(i);
      if (s) { this.dropStack(s); this.inventory.set(i, null); }
    }
  }

  onCrafted(name) {
    this.discover(`craft_${name}`, `Crafted ${ITEMS[name] ? ITEMS[name].display : name}`, 'The matrix obliges.');
  }

  discover(key, title, sub) {
    if (this.discoveries.has(key)) return;
    this.discoveries.add(key);
    this.hud.unlock(title, sub);
    audio.tone({ freq: 660, dur: 0.16, type: 'triangle', gain: 0.1, glide: 1.5 });
  }

  checkDiscoveries() {
    const p = this.player;
    const w = this.world.slice.at(p.x, p.z);
    if (Math.abs(w - (this.player.lastCheckW ?? w)) > 1.5) {
      this.discover('travelled', 'Ana-ward', 'You crossed a whole slice of the fourth dimension.');
    }
    this.player.lastCheckW = this.player.lastCheckW ?? w;
    const biome = this.world.biomeAtSlice(p.x, p.z);
    if (biome === 11) this.discover('hyperflats', 'The Hyperflats', 'Ground that only exists in some slices.');
    if (biome === 12) this.discover('barrens', 'Rift Barrens', 'Where the seams have worn through.');
    if (p.y < 12) this.discover('deep', 'Deep Slice', 'Bedrock is the same in every layer. Almost.');
  }

  screenshot() {
    try {
      const a = document.createElement('a');
      a.download = `4dmc-${Date.now()}.png`;
      a.href = this.dom.glCanvas.toDataURL('image/png');
      a.click();
      this.hud.toast('Screenshot saved');
    } catch (_) { this.hud.toast('Screenshot failed', '#e05a63'); }
  }

  fatal(err) {
    console.error(err);
    const f = document.getElementById('fatal');
    if (f) {
      f.innerHTML = `<div><h2>4D-MC hit a problem</h2><pre>${(err && err.stack) || err}</pre></div>`;
      f.classList.add('visible');
    }
  }

  // --- render ---------------------------------------------------------------
  renderWorld(dt) {
    const p = this.player;
    const slice = this.world.slice;
    const bob = this.settings.viewBob && p.onGround
      ? Math.sin(p.bob * 2) * 0.045 * Math.min(1, Math.hypot(p.vx, p.vz) / 4)
      : 0;
    const bobX = this.settings.viewBob && p.onGround
      ? Math.cos(p.bob) * 0.035 * Math.min(1, Math.hypot(p.vx, p.vz) / 4)
      : 0;
    const camera = {
      x: p.x + bobX * Math.cos(p.yaw), y: p.eyeY + bob, z: p.z - bobX * Math.sin(p.yaw),
      yaw: p.yaw, pitch: p.pitch, fov: this.settings.fov + (p.sprinting ? 4 : 0),
    };
    const headBlock = this.world.getBlockSafe(
      Math.floor(camera.x), Math.floor(camera.y), Math.floor(camera.z), slice.layerAt(camera.x, camera.z));
    const hb = BLOCKS[headBlock];

    const held = this.inventory.heldItem();
    let heldItem = null;
    if (held) {
      const def = ITEMS[held.name];
      if (def && def.place && blockId(def.place)) heldItem = { blockId: blockId(def.place) };
      else if (def) heldItem = { icon: texLayer(def.icon) };
    }

    const highlight = this.target && this.target.hit ? {
      hit: true, x: this.target.x, y: this.target.y, z: this.target.z, band: this.target.band,
      stage: this.mining ? Math.min(9, Math.floor(this.mining.progress * 10)) : -1,
    } : null;

    const light = this.world.getLightPacked(
      Math.floor(p.x), Math.floor(p.eyeY), Math.floor(p.z), slice.layerAt(p.x, p.z));
    const handLight = Math.max(((light >> 4) & 15) / 15 * this.world.skyLightLevel(), (light & 15) / 15, 0.28);

    this.renderer.render({
      world: this.world, camera, settings: this.settings,
      entities: this.entities.visibleList(p, this.settings.renderDistance * CHUNK_X + 12),
      particles: this.particles,
      highlight, heldItem, dt, elapsed: this.elapsed,
      underwater: !!(hb && hb.name === 'water'),
      inLava: !!(hb && hb.name === 'lava'),
      seamGlow: this.settings.ghostLayers ? (p.shifting ? 0.85 : 0.32) : 0,
      swing: p.swing, bobY: bob, handLight,
      handPhase: p.shifting ? 0.35 : 0,
      showHand: !this.hideHud,
    });

    audio.updateDrone(slice.at(p.x, p.z), clamp((SEA_LEVEL - p.y) / 34, 0, 1), p.shifting);

    this.hud.draw({
      player: p, world: this.world, inventory: this.inventory, settings: this.settings,
      fps: this.fps, debug: this.debug, hideHud: this.hideHud,
      renderStats: this.renderer.stats,
      entityCount: this.entities.list.length,
      particleCount: this.particles.count,
    }, dt);
  }
}
