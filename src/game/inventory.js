// 4D-MC :: containers, stacks and crafting -------------------------------

import { ITEMS, maxStack } from '../world/items.js';

export function stack(name, count = 1, meta = null) {
  const it = ITEMS[name];
  return { name, count, durability: it && it.durability ? it.durability : 0, meta };
}

export function sameItem(a, b) {
  if (!a || !b) return false;
  if (a.name !== b.name) return false;
  const ai = ITEMS[a.name];
  if (ai && ai.durability) return a.durability === b.durability;
  return true;
}

export class Container {
  constructor(size, label = 'Container') {
    this.slots = new Array(size).fill(null);
    this.label = label;
    this.version = 0;
  }
  get size() { return this.slots.length; }
  get(i) { return this.slots[i] || null; }
  set(i, s) { this.slots[i] = s && s.count > 0 ? s : null; this.version++; }
  touch() { this.version++; }

  /** Merge into existing stacks first, then empty slots. Returns the leftover. */
  add(item, from = 0, to = this.slots.length) {
    if (!item) return null;
    let remaining = item.count;
    const cap = maxStack(item.name);
    for (let i = from; i < to && remaining > 0; i++) {
      const s = this.slots[i];
      if (s && sameItem(s, item) && s.count < cap) {
        const take = Math.min(cap - s.count, remaining);
        s.count += take; remaining -= take;
      }
    }
    for (let i = from; i < to && remaining > 0; i++) {
      if (!this.slots[i]) {
        const take = Math.min(cap, remaining);
        this.slots[i] = { ...item, count: take };
        remaining -= take;
      }
    }
    this.version++;
    return remaining > 0 ? { ...item, count: remaining } : null;
  }

  countOf(name) {
    let n = 0;
    for (const s of this.slots) if (s && s.name === name) n += s.count;
    return n;
  }

  removeCount(name, n) {
    let left = n;
    for (let i = 0; i < this.slots.length && left > 0; i++) {
      const s = this.slots[i];
      if (!s || s.name !== name) continue;
      const take = Math.min(s.count, left);
      s.count -= take; left -= take;
      if (s.count <= 0) this.slots[i] = null;
    }
    this.version++;
    return n - left;
  }

  isEmpty() { return this.slots.every((s) => !s); }

  serialize() {
    return this.slots.map((s) => (s ? [s.name, s.count, s.durability | 0, s.meta || null] : null));
  }
  static deserialize(data, label) {
    const c = new Container(data.length, label);
    data.forEach((e, i) => {
      if (e) c.slots[i] = { name: e[0], count: e[1], durability: e[2] || 0, meta: e[3] || null };
    });
    return c;
  }
}

/**
 * Player inventory: 9 hotbar slots (0-8), 27 main slots (9-35), 4 armour
 * slots (36-39) and one off-hand slot (40).
 */
export const HOTBAR_START = 0, HOTBAR_END = 9;
export const MAIN_START = 9, MAIN_END = 36;
export const ARMOR_START = 36, ARMOR_END = 40;
export const OFFHAND = 40;
export const INV_SIZE = 41;

export class Inventory extends Container {
  constructor() {
    super(INV_SIZE, 'Inventory');
    this.selected = 0;
    this.held = null;         // stack floating with the cursor
    this.craft = new Container(16, 'Hypercraft Matrix');   // 4x4
    this.craftResult = null;
    this.craftGridSize = 4;
  }

  heldItem() { return this.slots[this.selected]; }

  /** Add to hotbar first (it is what the player can reach), then the backpack. */
  give(item) {
    let left = this.add(item, HOTBAR_START, HOTBAR_END);
    if (left) left = this.add(left, MAIN_START, MAIN_END);
    return left;
  }

  consumeSelected(n = 1) {
    const s = this.slots[this.selected];
    if (!s) return false;
    s.count -= n;
    if (s.count <= 0) this.slots[this.selected] = null;
    this.version++;
    return true;
  }

  /** Wear down the held tool; returns true when it breaks. */
  damageSelected(amount = 1) {
    const s = this.slots[this.selected];
    if (!s) return false;
    const it = ITEMS[s.name];
    if (!it || !it.durability) return false;
    s.durability -= amount;
    this.version++;
    if (s.durability <= 0) {
      this.slots[this.selected] = null;
      return true;
    }
    return false;
  }

  armorValue() {
    let v = 0;
    for (let i = ARMOR_START; i < ARMOR_END; i++) {
      const s = this.slots[i];
      if (s && ITEMS[s.name]) v += ITEMS[s.name].armor;
    }
    return v;
  }

  serialize() {
    return {
      slots: super.serialize(),
      craft: this.craft.serialize(),
      selected: this.selected,
    };
  }

  load(d) {
    if (!d) return;
    (d.slots || []).forEach((e, i) => {
      this.slots[i] = e ? { name: e[0], count: e[1], durability: e[2] || 0, meta: e[3] || null } : null;
    });
    (d.craft || []).forEach((e, i) => {
      this.craft.slots[i] = e ? { name: e[0], count: e[1], durability: e[2] || 0, meta: e[3] || null } : null;
    });
    this.selected = d.selected || 0;
    this.version++;
  }
}
