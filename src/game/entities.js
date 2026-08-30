// 4D-MC :: entity simulation ---------------------------------------------
// Mobs, NPCs and dropped items all carry a continuous w coordinate, so they
// obey the same hyperslice rules as the terrain: step across a seam and half a
// creature can vanish.

import { GRAVITY, W_LAYERS, WORLD_H, SEA_LEVEL } from '../core/constants.js';
import { moveAABB, cellSolid, raycast } from './physics.js';
import { MOB_TYPES, NPC_TYPES, buildModel } from './mobs.js';
import { BLOCKS, blockId } from '../world/blocks.js';
import { BIOMES } from '../world/biomes.js';
import { texLayer } from '../world/atlas.js';
import { ITEMS } from '../world/items.js';
import { Slice } from '../world/slice.js';
import { clamp, lerp, damp, mod, rng, hash01 } from '../core/math.js';
import { audio } from '../core/audio.js';

let nextId = 1;

export class Entity {
  constructor(world, x, y, z, w) {
    this.id = nextId++;
    this.world = world;
    this.x = x; this.y = y; this.z = z;
    this.w = w;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.yaw = Math.random() * Math.PI * 2;
    this.onGround = false;
    this.dead = false;
    this.age = 0;
    this.hurtTime = 0;
    this.width = 0.6; this.height = 1.8;
    this.parts = null;
    this.wHalf = 0.5;
    this.phase = 0;
    this.alpha = 1;
    this.emissive = 0;
    this.gravity = true;
  }

  get box() {
    const hw = this.width / 2;
    return { x0: this.x - hw, x1: this.x + hw, y0: this.y, y1: this.y + this.height, z0: this.z - hw, z1: this.z + hw };
  }

  /** How far this creature is from the slice the camera occupies. */
  sliceOffset() {
    return this.world.slice.at(this.x, this.z) - this.w;
  }

  visible() { return Math.abs(this.sliceOffset()) < this.wHalf + 0.25; }

  physics(dt) {
    if (this.gravity) {
      this.vy -= GRAVITY * dt;
      if (this.vy < -55) this.vy = -55;
    }
    const saved = this.world.slice.w;
    // entities collide against their own slice, not the player's
    this.world.slice.w = this.w - this.world.slice.u(this.x, this.z);
    const pos = { x: this.x, y: this.y, z: this.z };
    const d = { x: this.vx * dt, y: this.vy * dt, z: this.vz * dt };
    const hit = moveAABB(this.world, pos, { w: this.width, h: this.height }, d);
    this.world.slice.w = saved;
    this.x = pos.x; this.y = pos.y; this.z = pos.z;
    this.onGround = hit.y && this.vy <= 0;
    if (hit.y) this.vy = 0;
    if (hit.x) this.vx = 0;
    if (hit.z) this.vz = 0;
    return hit;
  }

  /** Is the block at the entity's feet solid in its own slice? */
  solidAtOwnSlice(x, y, z) {
    const band = Math.floor(this.w);
    const id = this.world.getBlockSafe(Math.floor(x), Math.floor(y), Math.floor(z), Slice.wrap(band));
    return id !== 0 && BLOCKS[id] && BLOCKS[id].solid;
  }
}

// --- dropped items -------------------------------------------------------
export class ItemEntity extends Entity {
  constructor(world, x, y, z, w, stack) {
    super(world, x, y, z, w);
    this.kind = 'item';
    this.stack = stack;
    this.width = 0.28; this.height = 0.28;
    this.pickupDelay = 0.6;
    this.life = 300;
    this.bob = Math.random() * Math.PI * 2;
    this.spin = Math.random() * Math.PI * 2;
    const it = ITEMS[stack.name];
    const tex = it && it.isBlockIcon && BLOCKS[blockId(it.place)]
      ? texLayer(BLOCKS[blockId(it.place)].faces[2])
      : texLayer(it ? it.icon : 'stick');
    this.isBlock = !!(it && it.isBlockIcon);
    this.parts = [{
      px: 0, py: 0.22, pz: 0,
      sx: this.isBlock ? 0.30 : 0.36, sy: this.isBlock ? 0.30 : 0.36, sz: this.isBlock ? 0.30 : 0.06,
      tex, role: 'item',
    }];
    this.wHalf = 0.5;
  }

  update(dt, player) {
    this.age += dt;
    this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }
    this.pickupDelay = Math.max(0, this.pickupDelay - dt);
    this.bob += dt * 2.4;
    this.spin += dt * 1.5;
    this.yaw = this.spin;
    this.vx *= this.onGround ? 0.72 : 0.98;
    this.vz *= this.onGround ? 0.72 : 0.98;
    this.physics(dt);
    this.parts[0].py = 0.22 + Math.sin(this.bob) * 0.07;
    this.parts[0].rx = this.isBlock ? 0.4 : 0;
  }
}

// --- experience ----------------------------------------------------------
export class XPOrb extends Entity {
  constructor(world, x, y, z, w, amount) {
    super(world, x, y, z, w);
    this.kind = 'xp';
    this.amount = amount;
    this.width = 0.22; this.height = 0.22;
    this.life = 240;
    this.emissive = 0.7;
    this.parts = [{ px: 0, py: 0.18, pz: 0, sx: 0.22, sy: 0.22, sz: 0.22, tex: texLayer('lumen'), role: 'orb' }];
  }
  update(dt) {
    this.age += dt; this.life -= dt;
    if (this.life <= 0) this.dead = true;
    this.yaw += dt * 2.2;
    this.vx *= 0.9; this.vz *= 0.9;
    this.physics(dt);
    this.parts[0].py = 0.18 + Math.sin(this.age * 4) * 0.06;
  }
}

// --- living creatures ----------------------------------------------------
export class Mob extends Entity {
  constructor(world, typeName, x, y, z, w) {
    super(world, x, y, z, w);
    this.kind = 'mob';
    this.typeName = typeName;
    const t = MOB_TYPES[typeName];
    this.type = t;
    this.hp = t.hp; this.maxHp = t.hp;
    this.width = t.size[0]; this.height = t.size[1];
    this.speed = t.speed;
    this.damage = t.damage || 0;
    this.parts = buildModel(t);
    this.native4D = !!t.native4D;
    this.wHalf = t.wHalf ?? 0.5;
    this.emissive = t.emissive || 0;
    this.alpha = t.alpha ?? 1;
    this.gravity = !t.flies;
    this.state = 'idle';
    this.stateTimer = 0;
    this.targetYaw = this.yaw;
    this.walkCycle = 0;
    this.attackCooldown = 0;
    this.voiceTimer = 2 + Math.random() * 12;
    this.wPhase = Math.random() * Math.PI * 2;
    this.fuseTime = 0;
    this.hover = 0;
  }

  hurt(amount, knockX = 0, knockZ = 0) {
    this.hp -= amount;
    this.hurtTime = 0.4;
    this.vx += knockX * 5; this.vz += knockZ * 5;
    if (this.gravity) this.vy = Math.max(this.vy, 4);
    audio.mobCall(this.type.voice);
    if (this.hp <= 0) this.dead = true;
  }

  update(dt, player, manager) {
    this.age += dt;
    this.hurtTime = Math.max(0, this.hurtTime - dt);
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.stateTimer -= dt;
    this.voiceTimer -= dt;
    if (this.voiceTimer <= 0) {
      this.voiceTimer = 8 + Math.random() * 22;
      if (this.visible() && this.distTo(player) < 22) audio.mobCall(this.type.voice);
    }

    // 4D natives drift along the fourth axis, so they slide in and out of view
    if (this.native4D) {
      this.wPhase += dt * (this.type.wDrift || 0.3);
      this.w += Math.sin(this.wPhase) * dt * (this.type.wDrift || 0.3) * 1.6;
    }
    this.phase = this.native4D
      ? clamp(Math.abs(this.sliceOffset()) / Math.max(0.01, this.wHalf), 0, 1) * 0.8
      : 0;

    const dist = this.distTo(player);
    const canSee = dist < 26 && Math.abs(this.sliceOffset()) < this.wHalf + 0.5;

    switch (this.type.behaviour) {
      case 'hostile': this.aiHostile(dt, player, dist, canSee); break;
      case 'exploder': this.aiExploder(dt, player, dist, canSee, manager); break;
      case 'mimic': this.aiMimic(dt, player, dist, canSee); break;
      case 'skittish': this.aiFlee(dt, player, dist, canSee, 10); break;
      case 'passive': this.aiFlee(dt, player, dist, canSee, 5); break;
      case 'hopper': this.aiHop(dt, player, dist, canSee); break;
      case 'aquatic': this.aiSwim(dt, player); break;
      default: this.aiWander(dt); break;
    }

    if (this.type.flies) {
      this.hover += dt;
      const targetY = this.findHoverHeight();
      this.vy = damp(this.vy, (targetY - this.y) * 1.6 + Math.sin(this.hover * 1.4) * 0.4, 3, dt);
    }

    this.physics(dt);

    // burn in daylight
    if (this.type.burnsInDay && this.world.skyLightLevel() > 0.75) {
      const lit = this.world.getLightPacked(Math.floor(this.x), Math.floor(this.y + 1),
        Math.floor(this.z), Slice.wrap(Math.floor(this.w)));
      if (((lit >> 4) & 15) > 12) {
        this.burn = (this.burn || 0) + dt;
        if (this.burn > 1.2) { this.burn = 0; this.hurt(2); }
      }
    }

    if (this.y < -6) this.dead = true;
    this.animate(dt);
  }

  findHoverHeight() {
    const w = Slice.wrap(Math.floor(this.w));
    const h = this.world.heightAt(Math.floor(this.x), Math.floor(this.z), w);
    return Math.max(h + 2.2, SEA_LEVEL + 1);
  }

  distTo(p) { return Math.hypot(p.x - this.x, (p.y - this.y) * 0.6, p.z - this.z); }

  faceTowards(tx, tz) {
    this.targetYaw = Math.atan2(tx - this.x, tz - this.z);
  }

  step(dt, speedMul = 1) {
    const s = this.speed * speedMul;
    this.vx = damp(this.vx, Math.sin(this.yaw) * s, 8, dt);
    this.vz = damp(this.vz, Math.cos(this.yaw) * s, 8, dt);
    // hop over small obstacles
    if (this.onGround && (Math.abs(this.vx) < s * 0.25 && Math.abs(this.vz) < s * 0.25)) {
      const fx = this.x + Math.sin(this.yaw) * 0.7, fz = this.z + Math.cos(this.yaw) * 0.7;
      if (this.solidAtOwnSlice(fx, this.y + 0.2, fz)) this.vy = 6.4;
      else this.stateTimer = Math.min(this.stateTimer, 0.1);
    }
  }

  halt(dt) {
    this.vx = damp(this.vx, 0, 10, dt);
    this.vz = damp(this.vz, 0, 10, dt);
  }

  aiWander(dt) {
    if (this.stateTimer <= 0) {
      this.state = Math.random() < 0.45 ? 'idle' : 'walk';
      this.stateTimer = 1.5 + Math.random() * 4;
      if (this.state === 'walk') this.targetYaw = Math.random() * Math.PI * 2;
    }
    if (this.state === 'walk') this.step(dt, 0.6); else this.halt(dt);
  }

  aiFlee(dt, player, dist, canSee, range) {
    if (canSee && dist < range) {
      this.faceTowards(2 * this.x - player.x, 2 * this.z - player.z);
      this.state = 'flee';
      this.stateTimer = 1.4;
      this.step(dt, 1.25);
    } else this.aiWander(dt);
  }

  aiHostile(dt, player, dist, canSee) {
    if (canSee && dist < 20 && !player.dead) {
      this.faceTowards(player.x, player.z);
      this.state = 'chase';
      if (dist > 1.5) this.step(dt, 1.0);
      else {
        this.halt(dt);
        if (this.attackCooldown <= 0) {
          this.attackCooldown = 1.1;
          this.swingTime = 0.3;
          player.damage(this.damage, 'mob');
          const a = Math.atan2(player.x - this.x, player.z - this.z);
          player.vx += Math.sin(a) * 4; player.vz += Math.cos(a) * 4; player.vy = Math.max(player.vy, 3.4);
        }
      }
      if (this.type.ranged && dist > 4 && dist < 16 && this.attackCooldown <= 0) {
        this.attackCooldown = 1.8;
        player.damage(this.damage, 'arrow');
      }
    } else this.aiWander(dt);
  }

  aiExploder(dt, player, dist, canSee) {
    if (canSee && dist < 16) {
      this.faceTowards(player.x, player.z);
      if (dist > 1.9) { this.step(dt, 1.05); this.fuseTime = 0; }
      else {
        this.halt(dt);
        this.fuseTime += dt;
        if (this.fuseTime > 1.5) {
          this.explode(player);
          this.dead = true;
        }
      }
    } else { this.fuseTime = 0; this.aiWander(dt); }
  }

  explode(player) {
    audio.explode();
    const R = 3.2;
    const band = Slice.wrap(Math.floor(this.w));
    for (let dy = -R; dy <= R; dy++)
      for (let dz = -R; dz <= R; dz++)
        for (let dx = -R; dx <= R; dx++) {
          if (dx * dx + dy * dy + dz * dz > R * R) continue;
          const bx = Math.floor(this.x + dx), by = Math.floor(this.y + dy), bz = Math.floor(this.z + dz);
          const id = this.world.getBlockSafe(bx, by, bz, band);
          const b = BLOCKS[id];
          if (id && b && b.hardness >= 0 && b.hardness < 12) this.world.setBlock(bx, by, bz, band, 0);
        }
    const d = this.distTo(player);
    if (d < 6) player.damage(Math.round(14 * (1 - d / 6)), 'explosion');
  }

  aiMimic(dt, player, dist, canSee) {
    // an Echo copies the player's motion a beat late, from the next slice over
    if (canSee && dist < 24) {
      this.faceTowards(player.x, player.z);
      this.state = 'chase';
      if (dist > 2.2) this.step(dt, 1.0);
      else {
        this.halt(dt);
        if (this.attackCooldown <= 0) {
          this.attackCooldown = 1.4;
          player.damage(this.damage, 'echo');
        }
      }
      // keep drifting toward the player's own slice, but never quite arriving
      const target = this.world.slice.at(this.x, this.z);
      this.w = damp(this.w, target + 0.45, 0.6, dt);
    } else this.aiWander(dt);
  }

  aiHop(dt, player, dist, canSee) {
    if (this.onGround && this.stateTimer <= 0) {
      this.stateTimer = 0.9 + Math.random() * 0.7;
      if (canSee && dist < 14) this.faceTowards(player.x, player.z);
      else this.targetYaw = Math.random() * Math.PI * 2;
      this.vy = 6.2;
      this.vx = Math.sin(this.yaw) * this.speed * 1.4;
      this.vz = Math.cos(this.yaw) * this.speed * 1.4;
    }
    if (canSee && dist < 1.6 && this.attackCooldown <= 0) {
      this.attackCooldown = 1.0;
      player.damage(this.damage, 'mob');
    }
  }

  aiSwim(dt, player) {
    this.gravity = false;
    if (this.stateTimer <= 0) {
      this.stateTimer = 2 + Math.random() * 3;
      this.targetYaw = Math.random() * Math.PI * 2;
      this.vy = (Math.random() - 0.5) * 1.4;
    }
    this.step(dt, 0.5);
    this.vy = damp(this.vy, 0, 1.5, dt);
  }

  animate(dt) {
    this.yaw = this.yaw + Math.atan2(Math.sin(this.targetYaw - this.yaw), Math.cos(this.targetYaw - this.yaw)) * Math.min(1, dt * 7);
    const speed = Math.hypot(this.vx, this.vz);
    this.walkCycle += dt * (2.2 + speed * 2.4);
    const swing = Math.sin(this.walkCycle) * Math.min(0.85, speed * 0.36);
    const swing2 = Math.sin(this.walkCycle + Math.PI) * Math.min(0.85, speed * 0.36);
    for (const p of this.parts) {
      switch (p.role) {
        case 'legFL': case 'legBR': p.rx = swing; break;
        case 'legFR': case 'legBL': p.rx = swing2; break;
        case 'armL': p.rx = this.swingTime > 0 ? -1.6 : swing2 * 0.8; break;
        case 'armR': p.rx = this.swingTime > 0 ? -1.6 : swing * 0.8; break;
        case 'head': p.ry = Math.sin(this.age * 0.6) * 0.22; break;
        case 'spinOuter': p.ry = this.age * 0.9; p.rx = this.age * 0.55; break;
        case 'spinInner': p.ry = -this.age * 1.5; p.rz = this.age * 0.8; break;
        case 'tail': p.rx = Math.sin(this.age * 2.4) * 0.3; break;
        default: break;
      }
    }
    if (this.swingTime > 0) this.swingTime -= dt;
    if (this.type.behaviour === 'exploder' && this.fuseTime > 0) {
      const f = 1 + Math.sin(this.fuseTime * 26) * 0.16 * (this.fuseTime / 1.5);
      for (const p of this.parts) { p.sxBase ??= p.sx; p.syBase ??= p.sy; p.sx = p.sxBase * f; p.sy = p.syBase * f; }
    }
  }

  lootDrops() {
    const out = [];
    for (const [name, lo, hi] of this.type.drops || []) {
      const n = lo + Math.floor(Math.random() * (hi - lo + 1));
      if (n > 0) out.push({ name, count: n });
    }
    return out;
  }
}

// --- NPCs ----------------------------------------------------------------
export class NPC extends Entity {
  constructor(world, typeName, x, y, z, w) {
    super(world, x, y, z, w);
    this.kind = 'npc';
    this.typeName = typeName;
    const t = NPC_TYPES[typeName];
    this.type = t;
    this.width = 0.6; this.height = 1.85;
    this.speed = 1.3;
    this.hp = 20;
    this.emissive = t.emissive || 0;
    this.parts = buildModel({ model: 'humanoid', skin: t.skin, face: t.face });
    this.home = { x, z };
    this.state = 'idle';
    this.stateTimer = 0;
    this.targetYaw = this.yaw;
    this.walkCycle = 0;
    this.talkCooldown = 0;
    this.lineIndex = Math.floor(Math.random() * t.lines.length);
  }

  greet() {
    this.lineIndex = (this.lineIndex + 1) % this.type.lines.length;
    audio.mobCall('villager');
    return this.type.lines[this.lineIndex];
  }

  update(dt, player) {
    this.age += dt;
    this.hurtTime = Math.max(0, this.hurtTime - dt);
    this.talkCooldown = Math.max(0, this.talkCooldown - dt);
    this.stateTimer -= dt;
    const dist = this.distTo(player);

    if (dist < 4.5 && Math.abs(this.sliceOffset()) < 0.6) {
      this.faceTowards(player.x, player.z);
      this.halt(dt);
      this.state = 'talk';
    } else if (this.stateTimer <= 0) {
      this.state = Math.random() < 0.5 ? 'idle' : 'walk';
      this.stateTimer = 2 + Math.random() * 4;
      if (this.state === 'walk') {
        const back = Math.hypot(this.x - this.home.x, this.z - this.home.z) > 9;
        this.targetYaw = back
          ? Math.atan2(this.home.x - this.x, this.home.z - this.z)
          : Math.random() * Math.PI * 2;
      }
    }
    if (this.state === 'walk') this.step(dt, 0.55); else if (this.state !== 'talk') this.halt(dt);
    this.physics(dt);
    Mob.prototype.animate.call(this, dt);
  }

  distTo(p) { return Math.hypot(p.x - this.x, (p.y - this.y) * 0.6, p.z - this.z); }
  faceTowards(tx, tz) { this.targetYaw = Math.atan2(tx - this.x, tz - this.z); }
  step(dt, m) { Mob.prototype.step.call(this, dt, m); }
  halt(dt) { Mob.prototype.halt.call(this, dt); }
  hurt(a) { this.hp -= a; this.hurtTime = 0.4; audio.mobCall('villager'); if (this.hp <= 0) this.dead = true; }
  solidAtOwnSlice(x, y, z) { return Entity.prototype.solidAtOwnSlice.call(this, x, y, z); }
}

// --- manager -------------------------------------------------------------
const HOSTILE = Object.entries(MOB_TYPES).filter(([, t]) => t.spawn && t.spawn.light === 'dark').map(([k]) => k);
const PASSIVE = Object.entries(MOB_TYPES).filter(([, t]) => t.spawn && t.spawn.light === 'day').map(([k]) => k);
const ANY = Object.entries(MOB_TYPES).filter(([, t]) => t.spawn && t.spawn.light === 'any').map(([k]) => k);
const NPC_NAMES = Object.keys(NPC_TYPES);

export class EntityManager {
  constructor(world) {
    this.world = world;
    this.list = [];
    this.spawnTimer = 0;
    this.maxMobs = 46;
    this.structureQueue = [];
    this.onPickup = null;
  }

  add(e) { this.list.push(e); return e; }

  spawnItem(x, y, z, w, stack, spread = 0.22) {
    const e = new ItemEntity(this.world, x, y, z, w, stack);
    e.vx = (Math.random() - 0.5) * spread * 8;
    e.vz = (Math.random() - 0.5) * spread * 8;
    e.vy = 2 + Math.random();
    return this.add(e);
  }

  spawnXP(x, y, z, w, amount) {
    const e = new XPOrb(this.world, x, y, z, w, amount);
    e.vy = 2.4; e.vx = (Math.random() - 0.5) * 2; e.vz = (Math.random() - 0.5) * 2;
    return this.add(e);
  }

  countMobs() { return this.list.reduce((n, e) => n + (e.kind === 'mob' ? 1 : 0), 0); }

  update(dt, player) {
    // structures generated this frame want their guardians and residents
    for (const s of this.world.structureSpawns) this.structureQueue.push(s);
    this.world.structureSpawns.length = 0;
    while (this.structureQueue.length) {
      const s = this.structureQueue.pop();
      this.spawnForStructure(s);
    }

    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      const d = Math.hypot(e.x - player.x, e.z - player.z);
      if (d > 170) { this.list.splice(i, 1); continue; }
      if (d > 96 && e.kind === 'mob') { this.list.splice(i, 1); continue; }
      e.update(dt, player, this);
      if (e.dead) {
        if (e.kind === 'mob') {
          for (const drop of e.lootDrops())
            this.spawnItem(e.x, e.y + 0.4, e.z, e.w, { name: drop.name, count: drop.count, durability: 0 });
          if (e.type.behaviour === 'hostile' || e.type.boss)
            this.spawnXP(e.x, e.y + 0.4, e.z, e.w, e.type.boss ? 40 : 5);
        }
        this.list.splice(i, 1);
        continue;
      }
      // Item magnetism. Distance is measured to the player's *body*, not to a
      // point: an item resting at their feet is touching them even though its
      // centre is a metre from their chest.
      const ready = (e.kind === 'item' || e.kind === 'xp') &&
        (e.pickupDelay === undefined || e.pickupDelay <= 0);
      if (ready) {
        const dx = player.x - e.x, dz = player.z - e.z;
        const dyBody = e.y < player.y ? player.y - e.y
          : (e.y > player.y + 1.8 ? e.y - (player.y + 1.8) : 0);
        const dd = Math.hypot(dx, dyBody, dz);
        const sliceOk = Math.abs(e.sliceOffset()) < 0.85;
        if (dd < 2.1 && sliceOk) {
          const pullY = (player.y + 0.6) - e.y;
          const f = 10 / Math.max(0.5, dd);
          e.vx += dx * f * dt; e.vy += pullY * f * dt + 0.5 * dt; e.vz += dz * f * dt;
        }
        if (dd < 1.05 && sliceOk && this.onPickup && this.onPickup(e)) {
          this.list.splice(i, 1);
        }
      }
    }

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 2.2;
      this.trySpawn(player);
    }
  }

  spawnForStructure(s) {
    if (s.kind === 'camp') {
      const n = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        const name = NPC_NAMES[Math.floor(Math.random() * NPC_NAMES.length)];
        this.add(new NPC(this.world, name,
          s.x + (Math.random() - 0.5) * 5, s.y + 1, s.z + (Math.random() - 0.5) * 5, s.w));
      }
    } else if (s.kind === 'keep') {
      this.add(new Mob(this.world, 'slice_warden', s.x, s.y + 1, s.z, s.w));
      for (let i = 0; i < 3; i++)
        this.add(new Mob(this.world, 'null_crawler',
          s.x + (Math.random() - 0.5) * 6, s.y + 1, s.z + (Math.random() - 0.5) * 6, s.w + (Math.random() - 0.5) * 0.6));
    } else if (s.kind === 'spire') {
      this.add(new NPC(this.world, 'rift_warden', s.x, s.y, s.z, s.w));
      this.add(new Mob(this.world, 'tessellite', s.x + 2, s.y + 2, s.z, s.w + 0.4));
    }
  }

  /** Attempt one spawn near, but not too near, the player. */
  trySpawn(player) {
    if (this.countMobs() >= this.maxMobs) return;
    const night = this.world.skyLightLevel() < 0.35;
    const angle = Math.random() * Math.PI * 2;
    const r = 18 + Math.random() * 34;
    const x = Math.floor(player.x + Math.cos(angle) * r);
    const z = Math.floor(player.z + Math.sin(angle) * r);
    // spawn a little off the player's own slice so creatures wander in from
    // neighbouring layers
    const wOff = (Math.random() - 0.5) * 2.4;
    const w = this.world.slice.at(x + 0.5, z + 0.5) + wOff;
    const layer = Slice.wrap(Math.floor(w));
    const chunk = this.world.getChunk(x >> 4, z >> 4);
    if (!chunk || !chunk.generated) return;
    const h = this.world.heightAt(x, z, layer);
    if (h < 2 || h > WORLD_H - 6) return;
    const ground = this.world.getBlockSafe(x, h, z, layer);
    const gb = BLOCKS[ground];
    if (!gb || !gb.solid || gb.liquid) return;
    const above = this.world.getBlockSafe(x, h + 1, z, layer);
    if (above !== 0) return;

    const lit = this.world.getLightPacked(x, h + 1, z, layer);
    const sky = ((lit >> 4) & 15) / 15 * this.world.skyLightLevel();
    const blk = (lit & 15) / 15;
    const bright = Math.max(sky, blk);

    const biome = BIOMES[this.world.biomeAt(x, z, layer)];
    const pool = [];
    for (const [name, t] of Object.entries(MOB_TYPES)) {
      const sp = t.spawn;
      if (!sp || sp.structure) continue;
      if (sp.water) continue;
      if (sp.light === 'dark' && bright > 0.28) continue;
      if (sp.light === 'day' && (bright < 0.5 || night)) continue;
      if (sp.biomes && !sp.biomes.includes(biome.name)) continue;
      if (sp.underground && h > SEA_LEVEL + 4) continue;
      if (t.boss) continue;
      pool.push([name, t]);
    }
    if (!pool.length) return;
    const [name, t] = pool[Math.floor(Math.random() * pool.length)];
    const [lo, hi] = t.spawn.group || [1, 1];
    const n = lo + Math.floor(Math.random() * (hi - lo + 1));
    for (let i = 0; i < n; i++) {
      const mx = x + 0.5 + (Math.random() - 0.5) * 3;
      const mz = z + 0.5 + (Math.random() - 0.5) * 3;
      const mw = t.native4D ? w + (Math.random() - 0.5) * 0.7 : Math.floor(w) + 0.5;
      this.add(new Mob(this.world, name, mx, h + 1, mz, mw));
    }
    // occasionally a lone wanderer with something to say
    if (Math.random() < 0.05 && !night) {
      const npcName = NPC_NAMES[Math.floor(Math.random() * NPC_NAMES.length)];
      this.add(new NPC(this.world, npcName, x + 0.5, h + 1, z + 0.5, Math.floor(w) + 0.5));
    }
  }

  /** Entities to draw this frame, nearest first. */
  visibleList(player, maxDist) {
    const out = [];
    for (const e of this.list) {
      if (!e.parts) continue;
      const dx = e.x - player.x, dz = e.z - player.z;
      if (dx * dx + dz * dz > maxDist * maxDist) continue;
      if (Math.abs(e.sliceOffset()) > e.wHalf + 0.3) continue;
      out.push(e);
    }
    return out;
  }

  /** The nearest attackable creature along the player's look ray. */
  pickEntity(player, dir, maxDist) {
    let best = null, bestT = maxDist;
    for (const e of this.list) {
      if (e.kind !== 'mob' && e.kind !== 'npc') continue;
      if (Math.abs(e.sliceOffset()) > e.wHalf + 0.2) continue;
      const ox = e.x - player.x, oy = (e.y + e.height * 0.5) - player.eyeY, oz = e.z - player.z;
      const t = ox * dir[0] + oy * dir[1] + oz * dir[2];
      if (t < 0 || t > bestT) continue;
      const px = ox - dir[0] * t, py = oy - dir[1] * t, pz = oz - dir[2] * t;
      const rad = Math.max(e.width, e.height * 0.5) * 0.6;
      if (px * px + py * py + pz * pz < rad * rad) { best = e; bestT = t; }
    }
    return best;
  }

  serialize() {
    return this.list.filter((e) => e.kind === 'mob' || e.kind === 'npc').slice(0, 200).map((e) => ({
      k: e.kind, t: e.typeName, x: e.x, y: e.y, z: e.z, w: e.w, hp: e.hp,
    }));
  }

  load(data) {
    if (!data) return;
    for (const d of data) {
      try {
        const e = d.k === 'mob' ? new Mob(this.world, d.t, d.x, d.y, d.z, d.w)
          : new NPC(this.world, d.t, d.x, d.y, d.z, d.w);
        e.hp = d.hp;
        this.add(e);
      } catch (_) { /* unknown type from an older save */ }
    }
  }
}
