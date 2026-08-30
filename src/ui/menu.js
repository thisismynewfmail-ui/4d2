// 4D-MC :: menus -----------------------------------------------------------
// A live slice of the world runs behind every screen, slowly scrolling through
// the fourth dimension, so the menu is a demonstration of the mechanic before
// the player has touched a key.

import { DEFAULT_SETTINGS, SHEAR_PRESETS } from '../core/constants.js';
import { hashSeed } from '../core/math.js';
import * as save from '../game/save.js';
import { audio } from '../core/audio.js';

const WORLD_TYPES = [
  { id: 'continents', name: 'Continents', desc: 'Broad landmasses, deep oceans, the default shape of things.' },
  { id: 'islands', name: 'Archipelago', desc: 'Scattered islands separated by open water.' },
  { id: 'amplified', name: 'Amplified', desc: 'Towering ridges and violent relief. Demanding.' },
  { id: 'flat', name: 'Flatlands', desc: 'A quiet plane. Ideal for building and for studying seams.' },
];

const SHEAR_OPTIONS = [
  { id: 'off', name: 'Flat Slices', desc: 'Layers swap wholesale. No wedge cuts.' },
  { id: 'subtle', name: 'Subtle', desc: 'Wide bands, gentle terracing.' },
  { id: 'normal', name: 'Standard', desc: 'The intended experience.' },
  { id: 'strong', name: 'Strong', desc: 'Narrow bands, dramatic wedges and prisms.' },
  { id: 'extreme', name: 'Extreme', desc: 'Barely a cube left intact. Disorienting.' },
];

const NAME_WORDS = ['Ana', 'Kata', 'Tesseract', 'Seam', 'Drift', 'Hollow', 'Prism', 'Verge',
  'Lattice', 'Quiet', 'Amber', 'Cinder', 'Vellum', 'Fathom', 'Orbit', 'Umbra'];
const NAME_SUFFIX = ['Reach', 'Hollow', 'Expanse', 'Basin', 'Rise', 'Shelf', 'Fold', 'Marches'];

function el(tag, cls, text) {
  const d = document.createElement(tag);
  if (cls) d.className = cls;
  if (text !== undefined) d.textContent = text;
  return d;
}

function randomName() {
  const a = NAME_WORDS[Math.floor(Math.random() * NAME_WORDS.length)];
  const b = NAME_SUFFIX[Math.floor(Math.random() * NAME_SUFFIX.length)];
  return `${a} ${b}`;
}

function randomSeed() {
  return Math.floor(Math.random() * 1e9).toString(36).toUpperCase();
}

export class Menu {
  constructor(root, game) {
    this.root = root;
    this.game = game;
    this.screen = 'title';
    this.pendingWorld = null;
    this.settings = game.settings;
    this.visible = true;
  }

  show(screen = 'title') {
    this.screen = screen;
    this.visible = true;
    this.root.classList.add('visible');
    this.render();
  }

  hide() {
    this.visible = false;
    this.root.classList.remove('visible');
  }

  go(screen) {
    audio.uiClick();
    this.screen = screen;
    this.render();
  }

  back(screen) {
    audio.uiBack();
    this.screen = screen;
    this.render();
  }

  render() {
    this.root.innerHTML = '';
    const shell = el('div', 'menu-shell');
    this.root.appendChild(shell);
    switch (this.screen) {
      case 'title': shell.appendChild(this.titleScreen()); break;
      case 'singleplayer': shell.appendChild(this.worldList()); break;
      case 'create': shell.appendChild(this.createWorldScreen()); break;
      case 'settings': shell.appendChild(this.settingsScreen()); break;
      case 'controls': shell.appendChild(this.controlsScreen()); break;
      case 'pause': shell.appendChild(this.pauseScreen()); break;
      case 'dead': shell.appendChild(this.deathScreen()); break;
      case 'quit': shell.appendChild(this.quitScreen()); break;
      default: shell.appendChild(this.titleScreen());
    }
  }

  // --- title ---------------------------------------------------------------
  titleScreen() {
    const p = el('div', 'panel panel-title');
    const logo = el('div', 'logo');
    logo.innerHTML = `<span class="logo-4d">4D</span><span class="logo-dash">–</span><span class="logo-mc">MC</span>`;
    p.appendChild(logo);
    p.appendChild(el('div', 'tagline', 'A first-person sandbox with one dimension too many'));

    const nav = el('div', 'nav');
    nav.appendChild(this.navButton('Singleplayer', 'Create or continue a world', () => this.go('singleplayer')));
    nav.appendChild(this.navButton('Multiplayer', 'Shared slices across the network', null, 'Coming Soon'));
    nav.appendChild(this.navButton('Settings', 'Video, controls, hyperslice tuning', () => this.go('settings')));
    nav.appendChild(this.navButton('Mods', 'Extend blocks, mobs and dimensions', null, 'Coming Soon'));
    nav.appendChild(this.navButton('Quit', 'Close the game', () => this.go('quit')));
    p.appendChild(nav);

    const foot = el('div', 'menu-foot');
    foot.innerHTML = `<span>Hold <b>F</b> and scroll to travel through the fourth dimension</span>`;
    p.appendChild(foot);
    return p;
  }

  navButton(label, sub, onClick, badge) {
    const b = el('button', `nav-btn${badge ? ' nav-btn-disabled' : ''}`);
    const l = el('div', 'nav-label', label);
    b.appendChild(l);
    b.appendChild(el('div', 'nav-sub', sub));
    if (badge) {
      const s = el('span', 'badge', badge);
      l.appendChild(s);
      b.disabled = true;
      b.title = `${label} is not available yet`;
      b.onclick = () => audio.uiDenied();
    } else {
      b.onclick = onClick;
      b.onmouseenter = () => audio.uiHover();
    }
    return b;
  }

  // --- world list ----------------------------------------------------------
  worldList() {
    const p = el('div', 'panel panel-wide');
    p.appendChild(this.header('Singleplayer', 'Your saved slices of reality'));

    const list = el('div', 'world-list');
    const worlds = save.listWorlds();
    if (!worlds.length) {
      const e = el('div', 'empty');
      e.innerHTML = '<b>No worlds yet.</b><br>Create one and pick a seed — every seed grows a different hypertorus.';
      list.appendChild(e);
    }
    for (const w of worlds) {
      const row = el('div', 'world-row');
      const info = el('div', 'world-info');
      info.appendChild(el('div', 'world-name', w.name));
      const meta = el('div', 'world-meta');
      const date = new Date(w.lastPlayed || w.created);
      meta.textContent = `${w.gameMode} · ${w.worldType} · seed "${w.seedText}" · ${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      info.appendChild(meta);
      row.appendChild(info);

      const play = el('button', 'btn btn-primary', 'Play');
      play.onclick = () => { audio.uiClick(); this.game.enterWorld(w.id); };
      row.appendChild(play);

      const del = el('button', 'btn btn-danger', 'Delete');
      del.onclick = () => {
        audio.uiBack();
        if (del.dataset.confirm) {
          save.deleteWorld(w.id);
          this.render();
        } else {
          del.dataset.confirm = '1';
          del.textContent = 'Confirm?';
          setTimeout(() => { if (del.isConnected) { delete del.dataset.confirm; del.textContent = 'Delete'; } }, 3000);
        }
      };
      row.appendChild(del);
      list.appendChild(row);
    }
    p.appendChild(list);

    const row = el('div', 'row-actions');
    const create = el('button', 'btn btn-primary btn-lg', 'Create New World');
    create.onclick = () => { this.pendingWorld = null; this.go('create'); };
    row.appendChild(create);
    const back = el('button', 'btn', 'Back');
    back.onclick = () => this.back('title');
    row.appendChild(back);
    p.appendChild(row);
    return p;
  }

  // --- world creation ------------------------------------------------------
  createWorldScreen() {
    const state = this.pendingWorld || (this.pendingWorld = {
      name: randomName(),
      seedText: '',
      gameMode: 'survival',
      worldType: 'continents',
      shear: this.settings.shear,
      structures: true,
    });

    const p = el('div', 'panel panel-wide');
    p.appendChild(this.header('Create a World', 'Name it, seed it, then step inside'));

    const form = el('div', 'form');

    // name
    const nameField = el('div', 'field');
    nameField.appendChild(el('label', '', 'World name'));
    const nameRow = el('div', 'field-row');
    const nameInput = el('input', 'text-input');
    nameInput.type = 'text';
    nameInput.value = state.name;
    nameInput.maxLength = 40;
    nameInput.placeholder = 'Name this world';
    nameInput.oninput = () => { state.name = nameInput.value; validate(); };
    nameRow.appendChild(nameInput);
    const nameDice = el('button', 'btn btn-icon', '⟳');
    nameDice.title = 'Random name';
    nameDice.onclick = () => { state.name = randomName(); nameInput.value = state.name; audio.uiClick(); validate(); };
    nameRow.appendChild(nameDice);
    nameField.appendChild(nameRow);
    const nameErr = el('div', 'field-error');
    nameField.appendChild(nameErr);
    form.appendChild(nameField);

    // seed
    const seedField = el('div', 'field');
    seedField.appendChild(el('label', '', 'Seed'));
    const seedRow = el('div', 'field-row');
    const seedInput = el('input', 'text-input');
    seedInput.type = 'text';
    seedInput.value = state.seedText;
    seedInput.maxLength = 48;
    seedInput.placeholder = 'Leave blank for a random world';
    seedInput.oninput = () => { state.seedText = seedInput.value; updateSeedHint(); };
    seedRow.appendChild(seedInput);
    const seedDice = el('button', 'btn btn-icon', '⟳');
    seedDice.title = 'Random seed';
    seedDice.onclick = () => { state.seedText = randomSeed(); seedInput.value = state.seedText; audio.uiClick(); updateSeedHint(); };
    seedRow.appendChild(seedDice);
    seedField.appendChild(seedRow);
    const seedHint = el('div', 'field-hint');
    seedField.appendChild(seedHint);
    form.appendChild(seedField);

    const updateSeedHint = () => {
      const text = state.seedText.trim();
      const n = text ? hashSeed(text) : null;
      seedHint.textContent = text
        ? `Numeric seed ${n} · the same text always grows the same world`
        : 'A random seed will be chosen when you create the world';
    };
    updateSeedHint();

    // game mode
    form.appendChild(this.choiceField('Game mode', [
      { id: 'survival', name: 'Survival', desc: 'Health, energy, mining, mobs. The full experience.' },
      { id: 'creative', name: 'Creative', desc: 'Fly, unlimited blocks, no damage. For building.' },
    ], state.gameMode, (v) => { state.gameMode = v; }));

    form.appendChild(this.choiceField('World type', WORLD_TYPES, state.worldType, (v) => { state.worldType = v; }));

    form.appendChild(this.choiceField('Hyperslice shear', SHEAR_OPTIONS, state.shear, (v) => { state.shear = v; }, (v) => {
      const s = SHEAR_PRESETS[v];
      const width = Math.hypot(s.x, s.z) > 1e-4 ? (1 / Math.hypot(s.x, s.z)).toFixed(1) : '∞';
      return `Band width ≈ ${width} blocks`;
    }));

    // structures
    const structField = el('div', 'field');
    structField.appendChild(el('label', '', 'World features'));
    const toggle = el('button', `toggle${state.structures ? ' on' : ''}`);
    toggle.innerHTML = `<span class="toggle-knob"></span><span class="toggle-text">Generate structures</span>`;
    toggle.onclick = () => {
      state.structures = !state.structures;
      toggle.classList.toggle('on', state.structures);
      audio.uiClick();
    };
    structField.appendChild(toggle);
    structField.appendChild(el('div', 'field-hint',
      'Supply caches, hyperkeeps, rift spires and camps. Caches hold starting tools.'));
    form.appendChild(structField);

    p.appendChild(form);

    const actions = el('div', 'row-actions');
    const createBtn = el('button', 'btn btn-primary btn-lg', 'Create World');
    actions.appendChild(createBtn);
    const back = el('button', 'btn', 'Back');
    back.onclick = () => this.back('singleplayer');
    actions.appendChild(back);
    p.appendChild(actions);

    const validate = () => {
      const name = state.name.trim();
      let err = '';
      if (!name) err = 'Give the world a name.';
      else if (save.worldExists(name)) err = 'A world with that name already exists.';
      nameErr.textContent = err;
      createBtn.disabled = !!err;
      return !err;
    };
    validate();

    createBtn.onclick = () => {
      if (!validate()) { audio.uiDenied(); return; }
      const seedText = state.seedText.trim() || randomSeed();
      const entry = save.createWorld({
        name: state.name.trim(),
        seedText,
        seed: hashSeed(seedText),
        gameMode: state.gameMode,
        worldType: state.worldType,
        shear: state.shear,
        structures: state.structures,
      });
      audio.uiClick();
      this.pendingWorld = null;
      this.game.enterWorld(entry.id);
    };
    return p;
  }

  choiceField(label, options, current, onChange, hintFn) {
    const f = el('div', 'field');
    f.appendChild(el('label', '', label));
    const row = el('div', 'choice-row');
    const desc = el('div', 'field-hint');
    const update = (v) => {
      const opt = options.find((o) => o.id === v);
      desc.textContent = (opt ? opt.desc : '') + (hintFn ? ` · ${hintFn(v)}` : '');
    };
    for (const o of options) {
      const b = el('button', `choice${o.id === current ? ' active' : ''}`, o.name);
      b.onclick = () => {
        row.querySelectorAll('.choice').forEach((c) => c.classList.remove('active'));
        b.classList.add('active');
        onChange(o.id);
        update(o.id);
        audio.uiClick();
      };
      b.onmouseenter = () => audio.uiHover();
      row.appendChild(b);
    }
    f.appendChild(row);
    update(current);
    f.appendChild(desc);
    return f;
  }

  // --- settings ------------------------------------------------------------
  settingsScreen() {
    const s = this.settings;
    const p = el('div', 'panel panel-wide');
    p.appendChild(this.header('Settings', 'Tune the view, the feel and the fourth axis'));

    const cols = el('div', 'settings-cols');

    const video = el('div', 'settings-col');
    video.appendChild(el('h3', '', 'Video'));
    video.appendChild(this.slider('Field of view', s.fov, 60, 110, 1, (v) => { s.fov = v; }, (v) => `${v}°`));
    video.appendChild(this.slider('Render distance', s.renderDistance, 2, 9, 1, (v) => { s.renderDistance = v; }, (v) => `${v} chunks`));
    video.appendChild(this.slider('Brightness', s.brightness, 0.5, 2.0, 0.05, (v) => { s.brightness = v; }, (v) => `${Math.round(v * 100)}%`));
    video.appendChild(this.slider('Fog density', s.fogDensity, 0.2, 2.0, 0.05, (v) => { s.fogDensity = v; }, (v) => `${Math.round(v * 100)}%`));
    video.appendChild(this.toggleRow('View bobbing', s.viewBob, (v) => { s.viewBob = v; }));
    video.appendChild(this.toggleRow('Particles', s.particles, (v) => { s.particles = v; }));
    video.appendChild(this.toggleRow('Show FPS', s.showFps, (v) => { s.showFps = v; }));
    cols.appendChild(video);

    const control = el('div', 'settings-col');
    control.appendChild(el('h3', '', 'Controls'));
    control.appendChild(this.slider('Mouse sensitivity', s.sensitivity * 1000, 0.4, 6, 0.1,
      (v) => { s.sensitivity = v / 1000; }, (v) => v.toFixed(1)));
    control.appendChild(this.toggleRow('Invert Y axis', s.invertY, (v) => { s.invertY = v; }));
    const bindBtn = el('button', 'btn', 'Key bindings…');
    bindBtn.onclick = () => this.go('controls');
    control.appendChild(bindBtn);

    control.appendChild(el('h3', '', 'Audio'));
    control.appendChild(this.slider('Master volume', s.masterVolume, 0, 1, 0.05,
      (v) => { s.masterVolume = v; audio.applySettings(s); }, (v) => `${Math.round(v * 100)}%`));
    control.appendChild(this.slider('Ambience', s.musicVolume, 0, 1, 0.05,
      (v) => { s.musicVolume = v; audio.applySettings(s); }, (v) => `${Math.round(v * 100)}%`));
    cols.appendChild(control);

    const hyper = el('div', 'settings-col');
    hyper.appendChild(el('h3', '', 'Fourth dimension'));
    const shearRow = el('div', 'field');
    shearRow.appendChild(el('label', '', 'Shear (applies to new worlds and now)'));
    const choices = el('div', 'choice-row');
    for (const o of SHEAR_OPTIONS) {
      const b = el('button', `choice${o.id === s.shear ? ' active' : ''}`, o.name);
      b.onclick = () => {
        choices.querySelectorAll('.choice').forEach((c) => c.classList.remove('active'));
        b.classList.add('active');
        s.shear = o.id;
        this.game.applyShear(o.id);
        audio.uiClick();
      };
      choices.appendChild(b);
    }
    shearRow.appendChild(choices);
    shearRow.appendChild(el('div', 'field-hint',
      'The tilt of the viewing hyperplane. Stronger shear cuts blocks into wedges and prisms.'));
    hyper.appendChild(shearRow);
    hyper.appendChild(this.slider('Scroll speed', s.wScrollSpeed, 0.25, 3, 0.05,
      (v) => { s.wScrollSpeed = v; }, (v) => `${v.toFixed(2)}×`));
    hyper.appendChild(this.slider('Travel smoothing', s.wSmoothing, 0, 0.97, 0.01,
      (v) => { s.wSmoothing = v; }, (v) => `${Math.round(v * 100)}%`));
    hyper.appendChild(this.toggleRow('Seam shimmer', s.ghostLayers, (v) => { s.ghostLayers = v; }));
    hyper.appendChild(el('div', 'field-hint',
      'Hold F and turn the wheel to move. Press G to snap to the nearest whole slice.'));
    cols.appendChild(hyper);

    p.appendChild(cols);

    const actions = el('div', 'row-actions');
    const done = el('button', 'btn btn-primary btn-lg', 'Done');
    done.onclick = () => {
      save.saveSettings(s);
      this.game.applySettings();
      this.back(this.game.inGame ? 'pause' : 'title');
    };
    actions.appendChild(done);
    const reset = el('button', 'btn', 'Reset to defaults');
    reset.onclick = () => {
      Object.assign(s, DEFAULT_SETTINGS);
      save.saveSettings(s);
      this.game.applySettings();
      this.game.applyShear(s.shear);
      audio.uiBack();
      this.render();
    };
    actions.appendChild(reset);
    p.appendChild(actions);
    return p;
  }

  controlsScreen() {
    const p = el('div', 'panel panel-wide');
    p.appendChild(this.header('Key Bindings', 'Click a binding, then press a key'));
    const binds = this.game.keybinds;
    const labels = {
      forward: 'Walk forward', back: 'Walk back', left: 'Strafe left', right: 'Strafe right',
      jump: 'Jump / swim up', sneak: 'Sneak / descend', sprint: 'Sprint',
      inventory: 'Inventory', drop: 'Drop item', hyperShift: 'Hyperslice travel (hold)',
      phaseLock: 'Phase lock to whole slice', ghostToggle: 'Toggle seam shimmer',
      map: 'Slice map', perspective: 'Cycle view', debug: 'Debug overlay', screenshot: 'Screenshot',
    };
    const list = el('div', 'bind-list');
    for (const [key, label] of Object.entries(labels)) {
      const row = el('div', 'bind-row');
      row.appendChild(el('span', 'bind-label', label));
      const b = el('button', 'btn bind-key', prettyKey(binds[key]));
      b.onclick = () => {
        audio.uiClick();
        b.textContent = 'press a key…';
        b.classList.add('listening');
        const handler = (e) => {
          e.preventDefault();
          binds[key] = e.code;
          save.saveKeybinds(binds);
          b.textContent = prettyKey(e.code);
          b.classList.remove('listening');
          window.removeEventListener('keydown', handler, true);
        };
        window.addEventListener('keydown', handler, true);
      };
      row.appendChild(b);
      list.appendChild(row);
    }
    p.appendChild(list);
    const actions = el('div', 'row-actions');
    const done = el('button', 'btn btn-primary btn-lg', 'Done');
    done.onclick = () => this.back('settings');
    actions.appendChild(done);
    p.appendChild(actions);
    return p;
  }

  slider(label, value, min, max, step, onChange, fmt) {
    const f = el('div', 'field slider-field');
    const head = el('div', 'slider-head');
    head.appendChild(el('label', '', label));
    const val = el('span', 'slider-value', fmt ? fmt(value) : String(value));
    head.appendChild(val);
    f.appendChild(head);
    const input = el('input', 'slider');
    input.type = 'range';
    input.min = min; input.max = max; input.step = step; input.value = value;
    input.oninput = () => {
      const v = Number(input.value);
      val.textContent = fmt ? fmt(v) : String(v);
      onChange(v);
    };
    f.appendChild(input);
    return f;
  }

  toggleRow(label, value, onChange) {
    const b = el('button', `toggle${value ? ' on' : ''}`);
    b.innerHTML = `<span class="toggle-knob"></span><span class="toggle-text"></span>`;
    b.querySelector('.toggle-text').textContent = label;
    b.onclick = () => {
      const v = !b.classList.contains('on');
      b.classList.toggle('on', v);
      onChange(v);
      audio.uiClick();
    };
    return b;
  }

  // --- pause / death / quit ------------------------------------------------
  pauseScreen() {
    const p = el('div', 'panel panel-title');
    p.appendChild(this.header('Paused', this.game.worldMeta ? this.game.worldMeta.name : ''));
    const nav = el('div', 'nav');
    nav.appendChild(this.navButton('Back to Game', 'Return to the slice', () => this.game.resume()));
    nav.appendChild(this.navButton('Settings', 'Video, controls, hyperslice', () => this.go('settings')));
    nav.appendChild(this.navButton('Save', 'Write this world to storage', () => {
      this.game.saveGame();
      audio.uiClick();
    }));
    nav.appendChild(this.navButton('Save & Quit to Title', 'Store progress and leave', () => {
      this.game.saveGame();
      this.game.leaveWorld();
    }));
    p.appendChild(nav);
    return p;
  }

  deathScreen() {
    const p = el('div', 'panel panel-title panel-dead');
    p.appendChild(this.header('You Died', 'Your matter dispersed across the slices'));
    const nav = el('div', 'nav');
    nav.appendChild(this.navButton('Respawn', 'Reassemble at the world spawn', () => this.game.respawn()));
    nav.appendChild(this.navButton('Quit to Title', 'Leave this world', () => {
      this.game.saveGame();
      this.game.leaveWorld();
    }));
    p.appendChild(nav);
    return p;
  }

  quitScreen() {
    const p = el('div', 'panel panel-title');
    p.appendChild(this.header('Goodbye', 'You may now close this tab'));
    const nav = el('div', 'nav');
    nav.appendChild(this.navButton('Actually, stay', 'Return to the title screen', () => this.back('title')));
    p.appendChild(nav);
    // best effort — browsers only allow this for script-opened windows
    setTimeout(() => { try { window.close(); } catch (_) { /* ignore */ } }, 60);
    return p;
  }

  header(title, sub) {
    const h = el('div', 'panel-header');
    h.appendChild(el('h2', '', title));
    if (sub) h.appendChild(el('p', '', sub));
    return h;
  }
}

function prettyKey(code) {
  if (!code) return '—';
  return code
    .replace(/^Key/, '')
    .replace(/^Digit/, '')
    .replace('ControlLeft', 'L-Ctrl').replace('ControlRight', 'R-Ctrl')
    .replace('ShiftLeft', 'L-Shift').replace('ShiftRight', 'R-Shift')
    .replace('AltLeft', 'L-Alt').replace('AltRight', 'R-Alt')
    .replace('Space', 'Space');
}
