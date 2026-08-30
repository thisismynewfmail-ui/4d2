// 4D-MC :: persistence ----------------------------------------------------
// Worlds live in localStorage as a seed plus a delta of everything the player
// has changed, which keeps saves small no matter how far they roam.

const KEY_INDEX = '4dmc:worlds';
const KEY_WORLD = (id) => `4dmc:world:${id}`;
const KEY_SETTINGS = '4dmc:settings';
const KEY_BINDS = '4dmc:keybinds';

function safeGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (_) { return fallback; }
}

function safeSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch (e) { console.warn('4D-MC: could not save —', e.message); return false; }
}

export function listWorlds() {
  const idx = safeGet(KEY_INDEX, []);
  return Array.isArray(idx) ? idx.sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0)) : [];
}

export function worldExists(name) {
  return listWorlds().some((w) => w.name.toLowerCase() === name.toLowerCase());
}

export function createWorld(meta) {
  const id = `w${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
  const entry = {
    id,
    name: meta.name,
    seedText: meta.seedText,
    seed: meta.seed,
    gameMode: meta.gameMode,
    worldType: meta.worldType,
    shear: meta.shear,
    structures: meta.structures !== false,
    created: Date.now(),
    lastPlayed: Date.now(),
    playTime: 0,
  };
  const idx = listWorlds();
  idx.push(entry);
  safeSet(KEY_INDEX, idx);
  safeSet(KEY_WORLD(id), { meta: entry, player: null, edits: {}, entities: [], inventory: null, tileEntities: [] });
  return entry;
}

export function deleteWorld(id) {
  const idx = listWorlds().filter((w) => w.id !== id);
  safeSet(KEY_INDEX, idx);
  try { localStorage.removeItem(KEY_WORLD(id)); } catch (_) { /* ignore */ }
}

export function loadWorld(id) {
  return safeGet(KEY_WORLD(id), null);
}

export function saveWorld(id, data) {
  const idx = listWorlds();
  const entry = idx.find((w) => w.id === id);
  if (entry) {
    entry.lastPlayed = Date.now();
    entry.playTime = data.meta?.playTime ?? entry.playTime;
    safeSet(KEY_INDEX, idx);
  }
  return safeSet(KEY_WORLD(id), data);
}

export function loadSettings(defaults) {
  return { ...defaults, ...safeGet(KEY_SETTINGS, {}) };
}
export function saveSettings(s) { safeSet(KEY_SETTINGS, s); }

export function loadKeybinds(defaults) {
  return { ...defaults, ...safeGet(KEY_BINDS, {}) };
}
export function saveKeybinds(b) { safeSet(KEY_BINDS, b); }

export function estimateUsage() {
  let total = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('4dmc:')) total += (localStorage.getItem(k) || '').length;
    }
  } catch (_) { /* ignore */ }
  return total;
}
