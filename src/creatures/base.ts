// Creature base: an Entity wrapping a FishModel. Handles steering + terrain / surface avoidance, smooth 3D
// turning (fish swing their nose through the camera when they change direction), pitch from velocity, hit
// reactions (white flash, knockback, squash-and-stretch, particles, sound) and a short dying animation before
// removal (belly-up flip + pop) with coin / material drops.
import * as THREE from 'three';
import type { Entity, World, Team, DamageKind } from '../game/types';
import { buildFish, FishModel } from '../fish';
import { audio } from '../audio/audio';
import { damp, clamp } from '../core/math';

/** play the first sound id that exists (clips are added over time; never crash on a missing one) */
export function sfx(w: World, ids: string | string[], x?: number, vol = 1, rate = 1) {
  const l = typeof ids === 'string' ? [ids] : ids;
  for (const id of l) if (audio.has(id)) { w.sfx(id, x, vol, rate); return; }
  w.sfx(l[0], x, vol, rate);
}

export interface CreatureOpts {
  team?: Team; hp?: number; r?: number; scale?: number; seed?: number;
  /** coins dropped on death [min, max] */
  coins?: [number, number];
  /** optional material / item id dropped on death (chance) */
  loot?: { item: string; chance: number }[];
  /** colour of the death debris / goo */
  gore?: string;
  speed?: number;
}

let SEED = 1;

export abstract class Creature implements Entity {
  kind: string;
  team: Team;
  x: number; y: number; vx = 0; vy = 0;
  r: number;
  alive = true;
  hp: number; maxHp: number;
  obj = new THREE.Group();
  model: FishModel;
  /** model pivot inside obj: rotated for facing / pitch / roll */
  pivot = new THREE.Group();
  facing = 1;
  yaw = 0; pitch = 0; roll = 0;
  /** extra pitch / roll offsets set by behaviours */
  pitchBias = 0; rollBias = 0;
  baseScale: number;
  squash = 0; squashV = 0;
  /** seconds of stun (no steering) after a hit */
  stun = 0;
  dying = -1;
  t = 0;
  speedMax: number;
  opts: CreatureOpts;
  hitCd = 0;
  /** keep this far below the surface */
  surfaceMargin = 0.4;
  /** treat the seabed as solid (false for burrowers that hide in rock) */
  avoidTerrain = true;
  constructor(kind: string, species: string, x: number, y: number, o: CreatureOpts = {}) {
    this.kind = kind; this.team = o.team ?? 'enemy';
    this.x = x; this.y = y;
    this.opts = o;
    this.hp = this.maxHp = o.hp ?? 2;
    this.baseScale = o.scale ?? 1;
    this.speedMax = o.speed ?? 3;
    this.model = buildFish(species, o.seed ?? SEED++);
    this.r = o.r ?? this.model.length * this.baseScale * 0.32;
    this.model.group.scale.setScalar(this.baseScale);
    this.pivot.add(this.model.group);
    this.obj.add(this.pivot);
    this.pivot.rotation.order = 'YZX';
    this.obj.position.set(x, y, 0);
    this.facing = Math.random() < 0.5 ? -1 : 1;
    this.yaw = this.facing > 0 ? 0 : -Math.PI;
  }

  get L() { return this.model.length * this.baseScale; }
  /** world position of the mouth (approx, from the model anchor) */
  mouthX() { return this.x + this.facingDir() * this.model.mouth.x * this.baseScale; }
  mouthY() { return this.y + this.model.mouth.y * this.baseScale + Math.sin(this.pitch) * this.model.mouth.x * this.baseScale; }
  facingDir() { return Math.cos(this.yaw) >= 0 ? 1 : -1; }

  // ------------------------------------------------------------------------------------- movement helpers
  /** accelerate toward a desired velocity */
  steer(dvx: number, dvy: number, accel: number, dt: number) {
    const k = 1 - Math.exp(-accel * dt);
    this.vx += (dvx - this.vx) * k; this.vy += (dvy - this.vy) * k;
  }
  seek(tx: number, ty: number, speed: number, accel: number, dt: number, arrive = 0.5) {
    const dx = tx - this.x, dy = ty - this.y, d = Math.hypot(dx, dy) || 1e-6;
    const s = speed * Math.min(1, d / arrive);
    this.steer((dx / d) * s, (dy / d) * s, accel, dt);
  }
  /** push away from terrain + surface; look-ahead so fish curve away instead of bonking */
  avoid(w: World, dt: number) {
    if (this.avoidTerrain) {
      const r = this.r;
      const look = 0.35;
      const ax = this.x + this.vx * look, ay = this.y + this.vy * look;
      const sa = w.terrain.sdf(ax, ay);
      if (sa < r + 0.6) {
        const n = w.terrain.normal(ax, ay);
        const k = (r + 0.6 - sa) * 9;
        this.vx += n.x * k * dt; this.vy += n.y * k * dt;
      }
      const s = w.terrain.sdf(this.x, this.y);
      if (s < r) {
        const n = w.terrain.normal(this.x, this.y);
        this.x += n.x * (r - s); this.y += n.y * (r - s);
        const vn = this.vx * n.x + this.vy * n.y;
        if (vn < 0) { this.vx -= vn * n.x * 1.3; this.vy -= vn * n.y * 1.3; }
      }
    }
    const top = w.water.heightAt(this.x) - this.surfaceMargin - this.r * 0.5;
    if (this.y > top - 0.6) this.vy -= (this.y - (top - 0.6)) * 6 * dt;
    if (this.y > top) { this.y = top; if (this.vy > 0) this.vy *= -0.3; }
  }
  integrate(dt: number, drag = 0.6) {
    const k = Math.exp(-drag * dt);
    this.vx *= k; this.vy *= k;
    this.x += this.vx * dt; this.y += this.vy * dt;
  }
  /** turn to face a direction (fish rotate through the camera-facing pose) */
  faceToward(dx: number, dt: number, rate = 5) {
    if (Math.abs(dx) > 0.05) this.facing = dx > 0 ? 1 : -1;
    const target = this.facing > 0 ? 0 : -Math.PI;
    this.yaw = damp(this.yaw, target, rate, dt);
  }
  // ------------------------------------------------------------------------------------- per-frame pose
  /** apply transforms + advance the model animation; call at the end of update */
  pose(dt: number, swimSpeed = Math.hypot(this.vx, this.vy), pitchFromVel = true) {
    if (pitchFromVel) {
      const sp = Math.hypot(this.vx, this.vy);
      const want = sp > 0.3 ? clamp(Math.atan2(this.vy, Math.abs(this.vx) + 0.4), -0.7, 0.7) : 0;
      this.pitch = damp(this.pitch, want + this.pitchBias, 4, dt);
    } else this.pitch = damp(this.pitch, this.pitchBias, 6, dt);
    this.roll = damp(this.roll, this.rollBias, 6, dt);
    // squash spring
    this.squashV += (-this.squash * 160 - this.squashV * 12) * dt;
    this.squash += this.squashV * dt;
    const sq = clamp(this.squash, -0.4, 0.4);
    const yawTarget = this.facing > 0 ? 0 : -Math.PI;
    const turn = clamp((yawTarget - this.yaw) * 0.9, -1, 1) * (this.facing > 0 ? 1 : -1);
    this.obj.position.set(this.x, this.y, 0);
    this.pivot.rotation.set(this.roll, this.yaw, this.pitch);
    this.obj.scale.set(1 + sq, 1 - sq * 0.8, 1 + sq * 0.5);
    this.model.update(dt, swimSpeed, turn);
  }

  // ------------------------------------------------------------------------------------- combat
  /** damage the player on overlap (with a per-creature cooldown) */
  touchPlayer(w: World, dmg: number, kind: DamageKind, cx = this.x, cy = this.y, r = this.r, cd = 0.8): boolean {
    if (this.hitCd > 0 || this.dying >= 0) return false;
    const p = w.player;
    if (Math.hypot(p.x - cx, p.y - cy) < r + p.r) {
      w.hurtPlayer(dmg, cx, cy, kind);
      this.hitCd = cd;
      return true;
    }
    return false;
  }
  hit(dmg: number, dirX: number, dirY: number, w: World, _src: Entity | null, kind?: DamageKind): boolean {
    if (!this.alive || this.dying >= 0) return false;
    this.hp -= dmg;
    this.model.flash(1, kind === 'zap' ? '#c8f0ff' : '#ffffff');
    const kb = (kind === 'explosion' ? 9 : 5) / Math.max(0.6, Math.sqrt(this.baseScale * this.model.length * 2));
    this.vx += dirX * kb; this.vy += dirY * kb;
    this.squashV += 9; this.stun = Math.max(this.stun, 0.25);
    w.fx.burst('spark', this.x - dirX * this.r * 0.5, this.y - dirY * this.r * 0.5, 5, 3, { color: '#fff6d0' });
    w.fx.burst('bubble', this.x, this.y, 4, 1.4);
    if (this.opts.gore) w.fx.burst('goo', this.x, this.y, 3, 1.6, { color: this.opts.gore, grav: -1.5, size: 0.12 });
    sfx(w, ['hit_squish1', 'hit1', 'squish1'], this.x, 0.8, 1.1 + Math.random() * 0.2);
    this.onHit(w, dmg, kind);
    if (this.hp <= 0) this.die(w);
    return true;
  }
  /** behaviour hook on every landed hit */
  onHit(_w: World, _dmg: number, _kind?: DamageKind) {}
  die(w: World) {
    if (this.dying >= 0) return;
    this.dying = 0;
    this.team = 'neutral';
    w.run.kills++;
    w.emit('kill', { kind: this.kind, x: this.x, y: this.y });
    sfx(w, ['pop1', 'pop_b', 'squish2'], this.x, 0.9, 0.9);
    const [c0, c1] = this.opts.coins ?? [1, 2];
    const n = c0 + Math.floor(Math.random() * (c1 - c0 + 1));
    if (n > 0) w.drop(this.x, this.y, { coins: n });
    for (const l of this.opts.loot ?? []) if (Math.random() < l.chance) w.drop(this.x, this.y + 0.2, { item: l.item });
    this.onDeath(w);
  }
  onDeath(_w: World) {}
  /** dying animation; returns true while it is playing */
  updateDying(dt: number, w: World): boolean {
    if (this.dying < 0) return false;
    this.dying += dt;
    this.rollBias = Math.PI * Math.min(1, this.dying * 3);
    this.vy += 0.6 * dt; this.integrate(dt, 2);
    this.model.flash(Math.max(0, 1 - this.dying * 2.5) * 0.6);
    this.pose(dt, 0.3);
    const s = Math.max(0.01, 1 - Math.max(0, this.dying - 0.45) * 4);
    this.obj.scale.multiplyScalar(s);
    if (this.dying > 0.7) {
      w.fx.burst('bubbleBig', this.x, this.y, 3, 1.5);
      w.fx.burst('bubble', this.x, this.y, 10, 2.5);
      w.fx.burst('star', this.x, this.y, 5, 3, { color: '#fff4c0' });
      if (this.opts.gore) w.fx.debrisBurst(this.x, this.y, 6, this.opts.gore, 2.5, 0.05);
      this.alive = false;
    }
    return true;
  }
  update(dt: number, w: World) {
    this.t += dt;
    this.hitCd = Math.max(0, this.hitCd - dt);
    this.stun = Math.max(0, this.stun - dt);
    if (this.updateDying(dt, w)) return;
    this.think(dt, w);
  }
  abstract think(dt: number, w: World): void;
  dispose(_w: World) { this.model.dispose(); }

  // ------------------------------------------------------------------------------------- utilities
  distToPlayer(w: World) { return Math.hypot(w.player.x - this.x, w.player.y - this.y); }
  /** eyes follow a world point */
  lookAtWorld(px: number, py: number) {
    const dx = (px - this.x) * this.facingDir(), dy = py - this.y;
    this.model.lookAt(dx, dy);
  }
}

/** ids of a few things every behaviour uses */
export const SND = {
  bite: ['chomp1', 'bite1', 'bite2'],
  zap: ['zap1', 'zap2'],
  swish: ['swish_a', 'swish_b', 'sw_swish1'],
  alert: ['charge1', 'k_err1'],
  snip: ['crab_snip1', 'snap1'],
  click: ['crab_click1', 'click1'],
  inflate: ['inflate1', 'boing1'],
  deflate: ['deflate1', 'boing2'],
  growl: ['boss_growl1', 'boss_growl2', 'roar1'],
  roar: ['roar1', 'roar2', 'roar3'],
  heal: ['magic1', 'shimmer1', 'cute1'],
  bubbles: ['bubbles_a', 'bubbles_b', 'bubble1'],
  thud: ['uw_thud1', 'thud_heavy1'],
  boom: ['boom_uw1', 'boom'],
};
