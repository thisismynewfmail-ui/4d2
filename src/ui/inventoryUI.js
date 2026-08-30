// 4D-MC :: inventory, crafting and container screens ----------------------
// DOM based so drag-and-drop, tooltips and scrolling behave the way people
// expect. Left click takes or places a whole stack, right click splits or
// places one, shift-click shunts a stack between panes, Q drops.

import { iconFor } from '../world/atlas.js';
import { ITEMS, maxStack } from '../world/items.js';
import { Container, sameItem, stack, HOTBAR_START, HOTBAR_END, MAIN_START, MAIN_END, ARMOR_START, ARMOR_END, OFFHAND } from '../game/inventory.js';
import { craftResult, consumeCraft, findRecipe, availableRecipes, SMELTING } from '../game/recipes.js';
import { audio } from '../core/audio.js';

const ARMOR_SLOT_NAMES = ['helmet', 'chestplate', 'leggings', 'boots'];

export class InventoryUI {
  constructor(root, game) {
    this.root = root;
    this.game = game;
    this.open = false;
    this.mode = 'inventory';
    this.grid = null;        // active crafting grid container
    this.gridSize = 4;
    this.chest = null;
    this.furnace = null;
    this.npc = null;
    this.hoverSlot = null;
    this.tooltip = null;
    this.showBook = false;
    this._build();
  }

  get inv() { return this.game.inventory; }

  _build() {
    this.root.innerHTML = '';
    this.root.className = 'inv-root';
    this.panel = el('div', 'inv-panel');
    this.root.appendChild(this.panel);

    this.cursor = el('div', 'inv-cursor');
    this.root.appendChild(this.cursor);

    this.tooltip = el('div', 'inv-tooltip');
    this.root.appendChild(this.tooltip);

    this.root.addEventListener('mousemove', (e) => {
      this.cursor.style.left = `${e.clientX}px`;
      this.cursor.style.top = `${e.clientY}px`;
      this.tooltip.style.left = `${e.clientX + 16}px`;
      this.tooltip.style.top = `${e.clientY + 16}px`;
    });
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
    this.root.addEventListener('mouseleave', () => this.hideTooltip());
  }

  show(mode, extra = {}) {
    this.open = true;
    this.mode = mode;
    this.chest = extra.chest || null;
    this.furnace = extra.furnace || null;
    this.npc = extra.npc || null;
    this.benchPos = extra.pos || null;
    this.gridSize = mode === 'bench' ? 5 : 4;
    if (!this.grid || this.grid.size !== this.gridSize * this.gridSize)
      this.grid = new Container(this.gridSize * this.gridSize, 'Craft');
    this.root.classList.add('visible');
    this.render();
  }

  hide() {
    if (!this.open) return;
    this.open = false;
    this.root.classList.remove('visible');
    // return the crafting grid and anything on the cursor to the player
    if (this.grid) {
      for (let i = 0; i < this.grid.size; i++) {
        const s = this.grid.get(i);
        if (s) { const left = this.inv.give(s); if (left) this.game.dropStack(left); this.grid.set(i, null); }
      }
    }
    if (this.inv.held) { this.game.dropStack(this.inv.held); this.inv.held = null; }
    this.hideTooltip();
  }

  toggle(mode, extra) {
    if (this.open) this.hide();
    else this.show(mode || 'inventory', extra);
  }

  // --- rendering ----------------------------------------------------------
  render() {
    if (!this.open) return;
    const p = this.panel;
    p.innerHTML = '';
    p.appendChild(this._header());

    const body = el('div', 'inv-body');
    p.appendChild(body);

    if (this.mode === 'trade') {
      body.appendChild(this._tradePane());
      body.appendChild(this._playerPane());
      this._renderCursor();
      return;
    }

    const left = el('div', 'inv-col');
    body.appendChild(left);

    if (this.mode === 'chest') left.appendChild(this._chestPane());
    else if (this.mode === 'furnace') left.appendChild(this._furnacePane());
    else left.appendChild(this._craftPane());

    body.appendChild(this._playerPane());

    if (this.showBook && this.mode !== 'chest' && this.mode !== 'furnace')
      p.appendChild(this._recipeBook());

    this._renderCursor();
  }

  _header() {
    const titles = {
      inventory: 'HYPERCRAFT MATRIX · 4 × 4',
      bench: 'HYPERBENCH · 5 × 5',
      chest: this.chest && this.chest.hyper ? 'HYPERCHEST' : 'STORAGE CACHE',
      furnace: 'FURNACE',
      trade: this.npc ? this.npc.type.display.toUpperCase() : 'TRADE',
    };
    const h = el('div', 'inv-header');
    const t = el('div', 'inv-title');
    t.textContent = titles[this.mode] || 'INVENTORY';
    h.appendChild(t);

    const sub = el('div', 'inv-sub');
    sub.textContent = this.mode === 'trade'
      ? 'Click an offer to trade'
      : 'LMB take · RMB split · Shift+click move · Q drop';
    h.appendChild(sub);

    if (this.mode === 'inventory' || this.mode === 'bench') {
      const b = el('button', 'inv-btn');
      b.textContent = this.showBook ? 'Hide Recipes' : 'Recipes';
      b.onclick = () => { this.showBook = !this.showBook; audio.uiClick(); this.render(); };
      h.appendChild(b);
    }
    const close = el('button', 'inv-btn inv-close');
    close.textContent = '✕';
    close.onclick = () => { audio.uiBack(); this.game.closeUI(); };
    h.appendChild(close);
    return h;
  }

  _slotEl(container, index, cls = '') {
    const d = el('div', `slot ${cls}`);
    const item = container.get(index);
    if (item) {
      const img = el('div', 'slot-icon');
      img.style.backgroundImage = `url(${iconFor(item.name)})`;
      d.appendChild(img);
      if (item.count > 1) {
        const c = el('div', 'slot-count');
        c.textContent = item.count;
        d.appendChild(c);
      }
      const def = ITEMS[item.name];
      if (def && def.durability && item.durability < def.durability) {
        const bar = el('div', 'slot-dur');
        const fill = el('div', 'slot-dur-fill');
        const f = Math.max(0, item.durability / def.durability);
        fill.style.width = `${f * 100}%`;
        fill.style.background = `hsl(${f * 120},82%,52%)`;
        bar.appendChild(fill);
        d.appendChild(bar);
      }
      if (def && def.rarity !== 'common') d.classList.add(`rarity-${def.rarity}`);
    }
    d.onmousedown = (e) => {
      e.preventDefault();
      this.slotClick(container, index, e.button, e.shiftKey);
    };
    d.onmouseenter = () => {
      this.hoverSlot = { container, index };
      const it = container.get(index);
      if (it) this.showTooltip(it); else this.hideTooltip();
    };
    d.onmouseleave = () => { this.hoverSlot = null; this.hideTooltip(); };
    return d;
  }

  _gridEl(container, from, count, cols, cls = '') {
    const g = el('div', `slot-grid ${cls}`);
    g.style.gridTemplateColumns = `repeat(${cols}, var(--slot))`;
    for (let i = 0; i < count; i++) g.appendChild(this._slotEl(container, from + i));
    return g;
  }

  _craftPane() {
    const pane = el('div', 'pane');
    pane.appendChild(sectionTitle(this.mode === 'bench' ? 'Hyperbench' : 'Hypercraft Matrix'));
    const row = el('div', 'craft-row');
    row.appendChild(this._gridEl(this.grid, 0, this.gridSize * this.gridSize, this.gridSize));

    const arrow = el('div', 'craft-arrow');
    arrow.innerHTML = '<span>▶</span>';
    row.appendChild(arrow);

    const result = craftResult(this.grid, this.gridSize, this.mode === 'bench');
    const rc = new Container(1);
    rc.set(0, result);
    const rWrap = el('div', 'craft-result');
    const rSlot = this._slotEl(rc, 0, 'slot-result');
    rSlot.onmousedown = (e) => {
      e.preventDefault();
      this.takeCraft(e.shiftKey);
    };
    rWrap.appendChild(rSlot);
    row.appendChild(rWrap);
    pane.appendChild(row);

    if (this.mode !== 'bench') {
      const hint = el('div', 'pane-hint');
      hint.textContent = 'Place a Hyperbench for a 5 × 5 grid.';
      pane.appendChild(hint);
    }
    return pane;
  }

  _chestPane() {
    const pane = el('div', 'pane');
    pane.appendChild(sectionTitle(this.chest.hyper ? 'Hyperchest — contents shift with the slice' : 'Storage Cache'));
    pane.appendChild(this._gridEl(this.chest.container, 0, this.chest.container.size, 9, 'chest-grid'));
    return pane;
  }

  _furnacePane() {
    const f = this.furnace;
    const pane = el('div', 'pane furnace-pane');
    pane.appendChild(sectionTitle('Furnace'));
    const row = el('div', 'furnace-row');

    const col = el('div', 'furnace-col');
    col.appendChild(this._slotEl(f.container, 0));
    const flame = el('div', 'furnace-flame');
    const fi = el('div', 'furnace-flame-fill');
    fi.style.height = `${Math.round((f.burnTime / Math.max(1, f.burnMax)) * 100)}%`;
    flame.appendChild(fi);
    col.appendChild(flame);
    col.appendChild(this._slotEl(f.container, 1));
    row.appendChild(col);

    const prog = el('div', 'furnace-progress');
    const pf = el('div', 'furnace-progress-fill');
    pf.style.width = `${Math.round((f.cookTime / 200) * 100)}%`;
    prog.appendChild(pf);
    row.appendChild(prog);

    const out = el('div', 'furnace-out');
    out.appendChild(this._slotEl(f.container, 2, 'slot-result'));
    row.appendChild(out);

    pane.appendChild(row);
    const hint = el('div', 'pane-hint');
    hint.textContent = 'Top: ore or food · Bottom: fuel (coal, planks, sticks)';
    pane.appendChild(hint);
    return pane;
  }

  _playerPane() {
    const pane = el('div', 'pane');
    const top = el('div', 'player-top');

    const armor = el('div', 'armor-col');
    armor.appendChild(sectionTitle('Worn'));
    const ag = el('div', 'slot-grid');
    ag.style.gridTemplateColumns = 'var(--slot)';
    for (let i = 0; i < 4; i++) {
      const s = this._slotEl(this.inv, ARMOR_START + i, 'slot-armor');
      if (!this.inv.get(ARMOR_START + i)) s.dataset.ghost = ARMOR_SLOT_NAMES[i];
      ag.appendChild(s);
    }
    armor.appendChild(ag);
    top.appendChild(armor);

    const mid = el('div', 'player-mid');
    const stats = el('div', 'player-stats');
    const p = this.game.player;
    stats.innerHTML = `
      <div class="stat"><span>HEALTH</span><b>${Math.ceil(p.health)} / ${p.maxHealth}</b></div>
      <div class="stat"><span>ENERGY</span><b>${Math.ceil(p.hunger)} / ${p.maxHunger}</b></div>
      <div class="stat"><span>ARMOUR</span><b>${this.inv.armorValue()}</b></div>
      <div class="stat"><span>SLICE</span><b>${(this.game.world.slice.at(p.x, p.z)).toFixed(2)}</b></div>
      <div class="stat"><span>MODE</span><b>${p.gameMode}</b></div>`;
    mid.appendChild(stats);
    const off = el('div', 'offhand');
    off.appendChild(sectionTitle('Off-hand'));
    off.appendChild(this._slotEl(this.inv, OFFHAND, 'slot-offhand'));
    mid.appendChild(off);
    top.appendChild(mid);
    pane.appendChild(top);

    pane.appendChild(sectionTitle('Pack'));
    pane.appendChild(this._gridEl(this.inv, MAIN_START, MAIN_END - MAIN_START, 9, 'main-grid'));
    pane.appendChild(sectionTitle('Rail'));
    const hb = el('div', 'slot-grid hotbar-grid');
    hb.style.gridTemplateColumns = `repeat(9, var(--slot))`;
    for (let i = 0; i < 9; i++) {
      const s = this._slotEl(this.inv, i, i === this.inv.selected ? 'slot-selected' : '');
      hb.appendChild(s);
    }
    pane.appendChild(hb);
    return pane;
  }

  _tradePane() {
    const pane = el('div', 'pane trade-pane');
    pane.appendChild(sectionTitle(this.npc.type.profession));
    const line = el('div', 'trade-line');
    line.textContent = `"${this.npc.type.lines[this.npc.lineIndex]}"`;
    pane.appendChild(line);
    for (const offer of this.npc.type.trades) {
      const row = el('div', 'trade-offer');
      const give = el('div', 'trade-side');
      give.appendChild(itemChip(offer.give[0], offer.give[1]));
      row.appendChild(give);
      const arrow = el('div', 'trade-arrow');
      arrow.textContent = '→';
      row.appendChild(arrow);
      const get = el('div', 'trade-side');
      get.appendChild(itemChip(offer.get[0], offer.get[1]));
      row.appendChild(get);
      const have = this.inv.countOf(offer.give[0]);
      const ok = have >= offer.give[1];
      row.classList.add(ok ? 'trade-ok' : 'trade-no');
      const btn = el('button', 'inv-btn');
      btn.textContent = ok ? 'Trade' : `Need ${offer.give[1] - have}`;
      btn.disabled = !ok;
      btn.onclick = () => {
        if (!ok) { audio.uiDenied(); return; }
        this.inv.removeCount(offer.give[0], offer.give[1]);
        const left = this.inv.give(stack(offer.get[0], offer.get[1]));
        if (left) this.game.dropStack(left);
        audio.craft();
        this.game.hud.toast(`Traded for ${ITEMS[offer.get[0]].display}`, '#9ddc4a');
        this.render();
      };
      row.appendChild(btn);
      pane.appendChild(row);
    }
    return pane;
  }

  _recipeBook() {
    const wrap = el('div', 'recipe-book');
    wrap.appendChild(sectionTitle('Craftable now'));
    const list = el('div', 'recipe-list');
    const recipes = availableRecipes(this.inv, this.mode === 'bench');
    if (!recipes.length) {
      const e = el('div', 'pane-hint');
      e.textContent = 'Gather materials to unlock recipes.';
      list.appendChild(e);
    }
    for (const r of recipes.slice(0, 60)) {
      const b = el('button', 'recipe-item');
      const img = el('div', 'slot-icon');
      img.style.backgroundImage = `url(${iconFor(r.out)})`;
      b.appendChild(img);
      const label = el('span');
      label.textContent = `${ITEMS[r.out] ? ITEMS[r.out].display : r.out}${r.count > 1 ? ` ×${r.count}` : ''}`;
      b.appendChild(label);
      b.onclick = () => { this.autoFill(r); };
      list.appendChild(b);
    }
    wrap.appendChild(list);
    return wrap;
  }

  // --- interaction --------------------------------------------------------
  slotClick(container, index, button, shift) {
    const held = this.inv.held;
    const item = container.get(index);
    const isArmor = container === this.inv && index >= ARMOR_START && index < ARMOR_END;

    if (shift && item && !held) {
      this.quickMove(container, index);
      audio.uiClick();
      this.render();
      return;
    }

    if (button === 2) {
      // right click: split a stack, or place a single item
      if (!held && item) {
        const half = Math.ceil(item.count / 2);
        this.inv.held = { ...item, count: half };
        item.count -= half;
        if (item.count <= 0) container.set(index, null);
      } else if (held) {
        if (!item) {
          if (isArmor && !this.armorFits(held, index)) { audio.uiDenied(); return; }
          container.set(index, { ...held, count: 1 });
          held.count -= 1;
        } else if (sameItem(item, held) && item.count < maxStack(item.name)) {
          item.count += 1; held.count -= 1;
        }
        if (held.count <= 0) this.inv.held = null;
      }
    } else {
      if (held && !item) {
        if (isArmor && !this.armorFits(held, index)) { audio.uiDenied(); return; }
        container.set(index, held);
        this.inv.held = null;
      } else if (held && item) {
        if (sameItem(item, held)) {
          const cap = maxStack(item.name);
          const move = Math.min(cap - item.count, held.count);
          item.count += move; held.count -= move;
          if (held.count <= 0) this.inv.held = null;
          if (move === 0) { // full stack: swap instead
            this.inv.held = item; container.set(index, held);
          }
        } else {
          if (isArmor && !this.armorFits(held, index)) { audio.uiDenied(); return; }
          this.inv.held = item;
          container.set(index, held);
        }
      } else if (item) {
        this.inv.held = item;
        container.set(index, null);
      }
    }
    container.touch();
    audio.uiClick();
    this.render();
  }

  armorFits(item, index) {
    const def = ITEMS[item.name];
    return !!def && def.kind === 'armor' && def.slot === ARMOR_SLOT_NAMES[index - ARMOR_START];
  }

  /** Shift-click: shunt a stack to the sensible other pane. */
  quickMove(container, index) {
    const item = container.get(index);
    if (!item) return;
    let left = null;
    if (container === this.inv) {
      if (index < HOTBAR_END) {
        // hotbar -> external, else -> pack
        if (this.chest) left = this.chest.container.add(item);
        else if (this.furnace) left = this.furnace.container.add(item, 0, 2);
        else if (this.grid) left = this.grid.add(item);
        else left = this.inv.add(item, MAIN_START, MAIN_END);
        if (left === item) left = this.inv.add(item, MAIN_START, MAIN_END);
      } else if (index >= MAIN_START && index < MAIN_END) {
        if (this.chest) left = this.chest.container.add(item);
        else if (this.furnace) left = this.furnace.container.add(item, 0, 2);
        else if (this.grid) left = this.grid.add(item);
        else left = this.inv.add(item, HOTBAR_START, HOTBAR_END);
        if (left === item) left = this.inv.add(item, HOTBAR_START, HOTBAR_END);
      } else {
        left = this.inv.give(item);
      }
    } else {
      left = this.inv.give(item);
    }
    container.set(index, left);
  }

  takeCraft(all) {
    const result = craftResult(this.grid, this.gridSize, this.mode === 'bench');
    if (!result) { audio.uiDenied(); return; }
    let made = 0;
    do {
      const r = craftResult(this.grid, this.gridSize, this.mode === 'bench');
      if (!r) break;
      if (this.inv.held) {
        if (!sameItem(this.inv.held, r) || this.inv.held.count + r.count > maxStack(r.name)) break;
        this.inv.held.count += r.count;
      } else {
        const left = this.inv.give(r);
        if (left) { this.game.dropStack(left); }
      }
      consumeCraft(this.grid);
      made++;
    } while (all && made < 64);
    if (made) {
      audio.craft();
      this.game.onCrafted?.(result.name);
    }
    this.render();
  }

  /** Lay a recipe out in the grid, pulling ingredients from the inventory. */
  autoFill(r) {
    // return whatever is currently in the grid
    for (let i = 0; i < this.grid.size; i++) {
      const s = this.grid.get(i);
      if (s) { const left = this.inv.give(s); if (left) this.game.dropStack(left); this.grid.set(i, null); }
    }
    const size = this.gridSize;
    const place = (row, col, name) => {
      if (this.inv.removeCount(name, 1) < 1) return false;
      this.grid.set(row * size + col, stack(name, 1));
      return true;
    };
    let ok = true;
    if (r.type === 'shaped') {
      for (let y = 0; y < r.h && ok; y++)
        for (let x = 0; x < r.w; x++) {
          const ch = r.pattern[y][x] || ' ';
          if (ch === ' ') continue;
          if (!place(y, x, r.key[ch])) { ok = false; break; }
        }
    } else {
      r.items.forEach((n, i) => {
        if (i < size * size && ok) ok = place(Math.floor(i / size), i % size, n);
      });
    }
    audio.uiClick();
    this.render();
  }

  dropHovered() {
    if (this.inv.held) {
      this.game.dropStack(this.inv.held);
      this.inv.held = null;
    } else if (this.hoverSlot) {
      const { container, index } = this.hoverSlot;
      const item = container.get(index);
      if (item) { this.game.dropStack(item); container.set(index, null); }
    }
    this.render();
  }

  _renderCursor() {
    const held = this.inv.held;
    if (!held) { this.cursor.style.display = 'none'; return; }
    this.cursor.style.display = 'block';
    this.cursor.innerHTML = '';
    const img = el('div', 'slot-icon');
    img.style.backgroundImage = `url(${iconFor(held.name)})`;
    this.cursor.appendChild(img);
    if (held.count > 1) {
      const c = el('div', 'slot-count');
      c.textContent = held.count;
      this.cursor.appendChild(c);
    }
  }

  showTooltip(item) {
    const def = ITEMS[item.name];
    if (!def) return;
    this.tooltip.innerHTML = '';
    const t = el('div', `tip-title rarity-${def.rarity}`);
    t.textContent = def.display;
    this.tooltip.appendChild(t);
    const meta = [];
    if (def.kind === 'tool') meta.push(`Mining speed ${def.speed}×`, `Damage ${def.damage}`);
    if (def.kind === 'armor') meta.push(`Armour ${def.armor}`);
    if (def.food) meta.push(`Restores ${def.food} energy`);
    if (def.fuel) meta.push(`Fuel: ${Math.round(def.fuel / 200)} items`);
    if (def.durability) meta.push(`Durability ${item.durability} / ${def.durability}`);
    if (SMELTING[item.name]) meta.push(`Smelts into ${ITEMS[SMELTING[item.name]]?.display || SMELTING[item.name]}`);
    for (const m of meta) {
      const d = el('div', 'tip-meta');
      d.textContent = m;
      this.tooltip.appendChild(d);
    }
    if (def.lore) {
      const l = el('div', 'tip-lore');
      l.textContent = def.lore;
      this.tooltip.appendChild(l);
    }
    this.tooltip.classList.add('visible');
  }

  hideTooltip() { this.tooltip.classList.remove('visible'); }
}

function el(tag, cls) {
  const d = document.createElement(tag);
  if (cls) d.className = cls;
  return d;
}

function sectionTitle(text) {
  const d = el('div', 'section-title');
  d.textContent = text;
  return d;
}

function itemChip(name, count) {
  const d = el('div', 'item-chip');
  const img = el('div', 'slot-icon');
  img.style.backgroundImage = `url(${iconFor(name)})`;
  d.appendChild(img);
  const s = el('span');
  s.textContent = `${ITEMS[name] ? ITEMS[name].display : name} ×${count}`;
  d.appendChild(s);
  return d;
}
