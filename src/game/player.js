// 4D-MC :: player ----------------------------------------------------------

import { GRAVITY, TERMINAL_V, WORLD_H, W_LAYERS } from '../core/constants.js';
import { BLOCKS, blockId } from '../world/blocks.js';
import { Slice } from '../world/slice.js';
import { moveAABB, cellSolid, scanAABB, raycast } from './physics.js';
import { clamp, damp, lerp, mod, lookDir } from '../core/math.js';
import { audio } from '../core/audio.js';

const WIDTH = 0.6;
const HEIGHT = 1.8;
const EYE = 1.62;
const SNEAK_EYE = 1.44;

export class Player {
  constructor(world) {
    this.world = world;
    this.x = 0; this.y = 70; this.z = 0;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.yaw = 0; this.pitch = 0;
    this.onGround = false;
    this.sneaking = false;
    this.sprinting = false;
    this.inWater = false;
    this.inLava = false;
    this.onLadder = false;
    this.headUnderwater = false;
    this.flying = false;
    this.gameMode = 'survival';

    this.health = 20; this.maxHealth = 20;
    this.hunger = 20; this.maxHunger = 20;
    this.saturation = 5;
    this.breath = 300; this.maxBreath = 300;
    this.xp = 0; this.level = 0;
    this.armor = 0;
    this.hurtTime = 0;
    this.invulnerable = 0;
    this.fallStart = null;
    this.dead = false;

    // --- fourth-dimension travel
    this.wTarget = 0.5;
    this.wVelocity = 0;
    this.shifting = false;
    this.shiftBlocked = 0;
    this.lastBand = 0;
    this.phaseLockCooldown = 0;

    this.bob = 0;
    this.swing = 0;
    this.swinging = false;
    this.eyeHeight = EYE;
    this.stepTimer = 0;
    this.selectedSlot = 0;
    this.reach = 5.0;
  }

  get box() {
    const hw = WIDTH / 2;
    return { x0: this.x - hw, x1: this.x + hw, y0: this.y, y1: this.y + HEIGHT, z0: this.z - hw, z1: this.z + hw };
  }

  get eyeY() { return this.y + this.eyeHeight; }

  /** Can the player's body exist at this position on slice `w`? */
  canOccupy(w, x = this.x, y = this.y, z = this.z) {
    const world = this.world;
    const saved = world.slice.w;
    world.slice.w = w;
    const hw = WIDTH / 2;
    let blocked = false;
    const y0 = Math.floor(y + 1e-4), y1 = Math.floor(y + HEIGHT - 1e-4);
    for (let by = y0; by <= y1 && !blocked; by++)
      for (let bz = Math.floor(z - hw); bz <= Math.floor(z + hw - 1e-7); bz++)
        for (let bx = Math.floor(x - hw); bx <= Math.floor(x + hw - 1e-7); bx++)
          if (cellSolid(world, bx, by, bz, x - hw, z - hw, x + hw, z + hw)) { blocked = true; break; }
    world.slice.w = saved;
    return !blocked;
  }

  /** Push the player out of anything they have ended up inside. */
  resolveOverlap() {
    if (this.canOccupy(this.world.slice.w)) return true;
    for (let up = 0.25; up <= 2.5; up += 0.25) {
      if (this.canOccupy(this.world.slice.w, this.x, this.y + up, this.z)) {
        this.y += up; this.vy = Math.max(0, this.vy); return true;
      }
    }
    for (const [dx, dz] of [[0.4, 0], [-0.4, 0], [0, 0.4], [0, -0.4], [0.4, 0.4], [-0.4, -0.4]]) {
      if (this.canOccupy(this.world.slice.w, this.x + dx, this.y, this.z + dz)) {
        this.x += dx; this.z += dz; return true;
      }
    }
    return false;
  }

  look(dx, dy, sensitivity, invertY) {
    this.yaw -= dx * sensitivity;
    this.pitch += (invertY ? -dy : dy) * sensitivity;
    this.pitch = clamp(this.pitch, -Math.PI / 2 + 0.001, Math.PI / 2 - 0.001);
    this.yaw = mod(this.yaw, Math.PI * 2);
  }

  /**
   * Fourth-dimension travel. Held key + wheel scrubs the slice; motion is
   * deliberately slow and damped so the world flows rather than snapping.
   */
  updateHyperShift(input, binds, settings, dt) {
    const slice = this.world.slice;
    const holding = input.down(binds.hyperShift);
    this.shifting = holding;
    this.shiftBlocked = Math.max(0, this.shiftBlocked - dt * 2.4);

    if (holding && input.wheel !== 0) {
      // one notch ~= a fifth of a slice, so a full layer takes a few clicks
      this.wTarget -= input.wheel * 0.19 * settings.wScrollSpeed;
    }
    if (holding) {
      const fine = (input.down('ArrowUp') ? 1 : 0) - (input.down('ArrowDown') ? 1 : 0);
      if (fine) this.wTarget += fine * dt * 0.55 * settings.wScrollSpeed;
    }

    if (this.phaseLockCooldown > 0) this.phaseLockCooldown -= dt;
    if (input.justPressed(binds.phaseLock) && this.phaseLockCooldown <= 0) {
      this.wTarget = Math.round(this.wTarget - 0.5) + 0.5;
      this.phaseLockCooldown = 0.35;
      audio.sliceShift(1);
    }

    // Smooth, slow approach. Anything that would embed the player in matter
    // stalls the shift rather than teleporting them into a wall.
    const lambda = lerp(3.0, 9.0, 1 - settings.wSmoothing);
    let next = damp(slice.w, this.wTarget, lambda, dt);
    if (Math.abs(next - slice.w) > 1e-6) {
      const dir = Math.sign(next - slice.w);
      // walk toward the target in small increments, stopping at the first
      // position the player cannot physically occupy
      const stepCount = 6;
      let applied = slice.w;
      let lift = 0;
      for (let i = 1; i <= stepCount; i++) {
        const cand = lerp(slice.w, next, i / stepCount);
        if (this.canOccupy(cand, this.x, this.y + lift, this.z)) { applied = cand; continue; }
        // Try to ride up over a low obstruction rather than stalling dead —
        // travelling through w should feel like walking up a step, not a wall.
        let cleared = false;
        for (let up = 0.25; up <= 1.25; up += 0.25) {
          if (this.canOccupy(cand, this.x, this.y + lift + up, this.z)) {
            lift += up; applied = cand; cleared = true; break;
          }
        }
        if (!cleared) {
          this.shiftBlocked = 1;
          this.wTarget = applied;
          break;
        }
      }
      if (lift > 0) { this.y += lift; this.vy = Math.max(this.vy, 0); }
      const prevBand = Math.floor(slice.w + slice.u(this.x, this.z));
      slice.w = applied;
      const band = Math.floor(slice.w + slice.u(this.x, this.z));
      if (band !== this.lastBand) {
        this.lastBand = band;
        audio.sliceShift(band > prevBand ? 1 : -1);
      } else if (Math.abs(applied - this.wPrevTick) > 0.03) {
        audio.sliceTick(0.5);
        this.wPrevTick = applied;
      }
    }
    this.wPrevTick ??= slice.w;
    // keep the numbers small; the world is cyclic in w anyway
    if (slice.w > W_LAYERS * 4 || slice.w < -W_LAYERS * 4) {
      const shift = Math.round(slice.w / W_LAYERS) * W_LAYERS;
      slice.w -= shift; this.wTarget -= shift;
    }
  }

  update(dt, input, binds, settings) {
    const world = this.world;
    const slice = world.slice;
    if (this.dead) return;

    this.hurtTime = Math.max(0, this.hurtTime - dt);
    this.invulnerable = Math.max(0, this.invulnerable - dt);

    // --- environment probes
    const feet = world.getBlockSafe(Math.floor(this.x), Math.floor(this.y + 0.1), Math.floor(this.z), slice.layerAt(this.x, this.z));
    const head = world.getBlockSafe(Math.floor(this.x), Math.floor(this.eyeY), Math.floor(this.z), slice.layerAt(this.x, this.z));
    const fb = BLOCKS[feet], hb = BLOCKS[head];
    this.inWater = !!(fb && fb.name === 'water') || !!(hb && hb.name === 'water');
    this.inLava = !!(fb && fb.name === 'lava') || !!(hb && hb.name === 'lava');
    this.headUnderwater = !!(hb && hb.name === 'water');
    this.onLadder = scanAABB(world, this.box, (id) => BLOCKS[id] && BLOCKS[id].climbable);

    this.sneaking = input.down(binds.sneak) && !this.flying;
    const wantSprint = input.down(binds.sprint) && this.hunger > 6;
    this.eyeHeight = damp(this.eyeHeight, this.sneaking ? SNEAK_EYE : EYE, 16, dt);

    // --- input direction
    let fwd = 0, strafe = 0;
    if (input.down(binds.forward)) fwd += 1;
    if (input.down(binds.back)) fwd -= 1;
    if (input.down(binds.right)) strafe += 1;
    if (input.down(binds.left)) strafe -= 1;
    const moving = fwd !== 0 || strafe !== 0;
    this.sprinting = wantSprint && fwd > 0;
    if (moving) {
      const len = Math.hypot(fwd, strafe);
      fwd /= len; strafe /= len;
    }
    // strafe follows the camera's right vector: (-cos yaw, 0, sin yaw)
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const dirX = sy * fwd - cy * strafe;
    const dirZ = cy * fwd + sy * strafe;

    let speed = 4.32;
    if (this.sneaking) speed = 1.30;
    else if (this.sprinting) speed = 5.62;
    if (this.inWater) speed *= 0.55;
    if (this.flying) speed = this.sprinting ? 21 : 10.5;

    const accel = this.onGround || this.flying ? 46 : 12;
    const targetVX = dirX * speed, targetVZ = dirZ * speed;
    this.vx = damp(this.vx, targetVX, accel * (this.onGround ? 1 : 0.35), dt);
    this.vz = damp(this.vz, targetVZ, accel * (this.onGround ? 1 : 0.35), dt);

    // --- vertical
    if (this.flying) {
      let vy = 0;
      if (input.down(binds.jump)) vy += speed;
      if (input.down(binds.sneak)) vy -= speed;
      this.vy = damp(this.vy, vy, 24, dt);
    } else if (this.onLadder) {
      const climbing = input.down(binds.forward) || input.down(binds.jump);
      this.vy = input.down(binds.sneak) ? 0 : (climbing ? 3.0 : -1.6);
      if (input.down(binds.jump) && this.onGround) this.vy = 5.6;
    } else if (this.inWater || this.inLava) {
      const buoy = this.inLava ? -3.2 : -1.6;
      this.vy = damp(this.vy, input.down(binds.jump) ? 3.4 : buoy, 6, dt);
    } else {
      this.vy -= GRAVITY * dt;
      if (this.vy < -TERMINAL_V) this.vy = -TERMINAL_V;
      if (input.down(binds.jump) && this.onGround) {
        this.vy = 8.5;
        this.onGround = false;
        this.fallStart = this.y;
      }
    }

    // --- integrate with collision
    const before = this.y;
    const d = { x: this.vx * dt, y: this.vy * dt, z: this.vz * dt };
    const pos = { x: this.x, y: this.y, z: this.z };
    const hit = moveAABB(world, pos, { w: WIDTH, h: HEIGHT }, d);

    // step-up assist over single blocks (and over slice wedges)
    if ((hit.x || hit.z) && this.onGround && !this.sneaking) {
      const test = { x: this.x, y: this.y + 0.62, z: this.z };
      const d2 = { x: this.vx * dt, y: 0, z: this.vz * dt };
      const h2 = moveAABB(world, test, { w: WIDTH, h: HEIGHT }, d2);
      if (!h2.x && !h2.z && this.canOccupy(slice.w, test.x, test.y, test.z)) {
        pos.x = test.x; pos.z = test.z; pos.y = test.y;
        this.vy = Math.max(this.vy, 0.1);
      }
    }

    this.x = pos.x; this.z = pos.z;
    const wasGround = this.onGround;
    this.onGround = hit.y && this.vy <= 0;
    if (hit.y) this.vy = 0;
    this.y = pos.y;
    if (hit.x) this.vx = 0;
    if (hit.z) this.vz = 0;

    // --- fall damage
    if (!this.onGround && this.vy < 0 && this.fallStart === null) this.fallStart = this.y;
    if (this.onGround && !wasGround) {
      if (this.fallStart !== null) {
        const fall = this.fallStart - this.y;
        if (fall > 3.2 && !this.inWater && this.gameMode !== 'creative') {
          this.damage(Math.floor(fall - 3.2), 'fall');
        }
        if (fall > 0.8) audio.step(this.groundMaterial(), 0.8);
      }
      this.fallStart = null;
    }
    if (this.onGround || this.flying || this.inWater) this.fallStart = null;

    // --- footsteps & bob
    const hspeed = Math.hypot(this.vx, this.vz);
    if (this.onGround && hspeed > 0.7) {
      this.stepTimer += dt * hspeed;
      if (this.stepTimer > 1.65) {
        this.stepTimer = 0;
        audio.step(this.groundMaterial());
      }
    }
    this.bob = settings.viewBob
      ? this.bob + dt * hspeed * 1.8
      : 0;

    // --- breath, hunger, regeneration
    if (this.gameMode !== 'creative') {
      if (this.headUnderwater) {
        this.breath -= dt * 60;
        if (this.breath <= 0) { this.breath = 0; this.damage(1, 'drown'); }
      } else this.breath = Math.min(this.maxBreath, this.breath + dt * 180);

      if (this.inLava) this.damage(dt * 4, 'lava');

      const drain = (this.sprinting ? 0.030 : moving ? 0.011 : 0.0035) + (this.onGround ? 0 : 0.002);
      if (this.saturation > 0) this.saturation = Math.max(0, this.saturation - drain * dt * 8);
      else this.hunger = Math.max(0, this.hunger - drain * dt * 3.4);

      if (this.hunger >= 18 && this.health < this.maxHealth) {
        this.regen = (this.regen || 0) + dt;
        if (this.regen > 3.2) { this.regen = 0; this.health = Math.min(this.maxHealth, this.health + 1); }
      }
      if (this.hunger <= 0) {
        this.starve = (this.starve || 0) + dt;
        if (this.starve > 3) { this.starve = 0; this.damage(1, 'starve'); }
      }
    }

    if (this.y < -8) this.damage(1000, 'void');
    if (this.health <= 0) this.die();

    // --- swing animation
    if (this.swinging) {
      this.swing += dt * 5.4;
      if (this.swing >= 1) { this.swing = 0; this.swinging = false; }
    }
  }

  groundMaterial() {
    const w = this.world;
    const id = w.getBlockSafe(Math.floor(this.x), Math.floor(this.y - 0.1), Math.floor(this.z),
      w.slice.layerAt(this.x, this.z));
    const b = BLOCKS[id];
    return b ? b.sound : 'stone';
  }

  startSwing() { if (!this.swinging) { this.swinging = true; this.swing = 0.001; } }

  damage(amount, cause) {
    if (this.gameMode === 'creative' && cause !== 'void') return;
    if (this.invulnerable > 0 && cause !== 'void') return;
    const reduced = amount * (1 - Math.min(0.8, this.armor / 25));
    this.health -= reduced;
    this.hurtTime = 0.45;
    if (cause !== 'starve' && cause !== 'drown') this.invulnerable = 0.42;
    audio.hurt();
    if (this.health <= 0) this.die();
  }

  heal(v) { this.health = Math.min(this.maxHealth, this.health + v); }

  eat(item) {
    if (this.hunger >= this.maxHunger) return false;
    this.hunger = Math.min(this.maxHunger, this.hunger + item.food);
    this.saturation = Math.min(this.hunger, this.saturation + item.saturation);
    return true;
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    this.health = 0;
    this.vx = this.vy = this.vz = 0;
  }

  respawn(spawn) {
    this.dead = false;
    this.health = this.maxHealth;
    this.hunger = this.maxHunger;
    this.saturation = 5;
    this.breath = this.maxBreath;
    this.x = spawn.x; this.y = spawn.y; this.z = spawn.z;
    this.vx = this.vy = this.vz = 0;
    this.world.slice.w = spawn.w ?? 0.5;
    this.wTarget = this.world.slice.w;
  }

  pick(maxDist = this.reach) {
    const [dx, dy, dz] = lookDir(this.yaw, this.pitch);
    return raycast(this.world, this.x, this.eyeY, this.z, dx, dy, dz, maxDist);
  }

  serialize() {
    return {
      x: this.x, y: this.y, z: this.z, yaw: this.yaw, pitch: this.pitch,
      w: this.world.slice.w, wTarget: this.wTarget,
      health: this.health, hunger: this.hunger, saturation: this.saturation,
      breath: this.breath, xp: this.xp, level: this.level, gameMode: this.gameMode,
      flying: this.flying, selectedSlot: this.selectedSlot,
    };
  }

  deserialize(d) {
    if (!d) return;
    Object.assign(this, {
      x: d.x, y: d.y, z: d.z, yaw: d.yaw, pitch: d.pitch,
      health: d.health, hunger: d.hunger, saturation: d.saturation,
      breath: d.breath, xp: d.xp || 0, level: d.level || 0,
      gameMode: d.gameMode || 'survival', flying: !!d.flying,
      selectedSlot: d.selectedSlot || 0,
    });
    this.world.slice.w = d.w ?? 0.5;
    this.wTarget = d.wTarget ?? this.world.slice.w;
    this.dead = false;
  }
}
