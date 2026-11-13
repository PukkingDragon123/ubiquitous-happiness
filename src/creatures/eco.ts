// Ecosystem creatures for the v2 areas. They live their own lives and leave the blobfish alone unless provoked:
//   Hunter    - a lone predator (barracuda, pike, grouper, anglerfish...) that cruises, stalks a member of a
//               small-fish school, strikes, eats it (leaving remains) and rests. Hit it and it turns on you
//               for a while, then calms down.
//   Scavenger - a crab or sea cucumber that walks the seabed to the nearest remains and picks them clean;
//               pinches when bothered.
// The area's ecosystem (src/area/eco.ts) implements EcoLink and keeps the populations topped up.
import type { World, DamageKind, Entity } from '../game/types';
import { Creature, sfx, SND } from './base';
import { damp, clamp } from '../core/math';
import { materialId } from '../area/materials';

export interface Prey { x: number; y: number; alive: boolean }
export interface EcoLink {
  /** a school member near (x, y) within r, or null */
  findPrey(x: number, y: number, r: number): Prey | null;
  /** eat a prey (spawns remains) */
  eat(p: Prey, byX: number, byY: number): void;
  /** the nearest uneaten remains within r */
  findRemains(x: number, y: number, r: number): { x: number; y: number; left: number } | null;
  /** take a bite of remains; returns what is left */
  nibble(r: { x: number; y: number; left: number }, k: number): number;
  bounds(): { x0: number; x1: number };
}

const R = (a: number, b: number) => a + Math.random() * (b - a);

const HUNTER_TUNE: Record<string, { scale: number; hp: number; speed: number; loot: string; gore: string }> = {
  barracuda: { scale: 1, hp: 5, speed: 3.2, loot: 'sharkTooth', gore: '#c0c8c8' },
  pike: { scale: 1, hp: 5, speed: 2.8, loot: 'sharkTooth', gore: '#b0b890' },
  peacock_bass: { scale: 1.1, hp: 4, speed: 2.6, loot: 'sharkTooth', gore: '#d0c080' },
  grouper: { scale: 0.9, hp: 8, speed: 2.2, loot: 'sharkTooth', gore: '#a08a70' },
  anglerfish: { scale: 1.2, hp: 6, speed: 1.8, loot: 'glassLens', gore: '#40506a' },
};

export class Hunter extends Creature {
  state: 'cruise' | 'stalk' | 'strike' | 'rest' | 'angry' = 'cruise';
  st = 0; hunger = R(0.2, 0.8); anger = 0;
  prey: Prey | null = null;
  homeX: number; homeY: number; wob = R(0, 10);
  constructor(species: string, x: number, y: number, public eco: EcoLink) {
    const T = HUNTER_TUNE[species] ?? HUNTER_TUNE.barracuda;
    super('hunter:' + species, species, x, y, { team: 'neutral', hp: T.hp, scale: T.scale, speed: T.speed, coins: [1, 3], gore: T.gore, loot: [{ item: T.loot, chance: 0.35 }] });
    this.homeX = x; this.homeY = y;
  }
  think(dt: number, w: World) {
    const p = w.player;
    this.st += dt;
    this.hunger += dt * 0.035;
    if (this.anger > 0) {
      this.anger -= dt;
      this.state = 'angry';
      if (this.anger <= 0) { this.team = 'neutral'; this.state = 'cruise'; }
    }
    switch (this.state) {
      case 'angry': {
        const d = this.distToPlayer(w);
        this.seek(p.x, p.y, this.speedMax * (d < 3 ? 1.6 : 1.1), 3, dt, 0.4);
        if (this.touchPlayer(w, 1, 'bite', this.mouthX(), this.mouthY(), this.r * 0.8, 1.1)) { this.model.setJaw(1); sfx(w, SND.bite, this.x, 0.8); }
        else this.model.setJaw(d < 2.5 ? 0.6 : 0.1);
        break;
      }
      case 'cruise': {
        const tx = this.homeX + Math.sin(this.t * 0.11 + this.wob) * 14, ty = this.homeY + Math.sin(this.t * 0.23 + this.wob) * 2;
        this.seek(tx, ty, this.speedMax * 0.35, 1.2, dt, 2);
        this.model.setJaw(0.05);
        if (this.hunger > 1 && this.st > 2) {
          this.prey = this.eco.findPrey(this.x, this.y, 16);
          if (this.prey) { this.state = 'stalk'; this.st = 0; }
        }
        break;
      }
      case 'stalk': {
        const q = this.prey;
        if (!q || !q.alive || this.st > 14) { this.state = 'cruise'; this.st = 0; this.prey = null; break; }
        // creep in behind the school, then strike
        this.seek(q.x, q.y, this.speedMax * 0.55, 2, dt, 0.5);
        if (Math.hypot(q.x - this.x, q.y - this.y) < 2.6) { this.state = 'strike'; this.st = 0; sfx(w, SND.swish, this.x, 0.5, 1.1); }
        break;
      }
      case 'strike': {
        const q = this.prey;
        if (!q || !q.alive || this.st > 1.2) { this.state = 'cruise'; this.st = 0; break; }
        const dx = q.x - this.x, dy = q.y - this.y, d = Math.hypot(dx, dy) || 1;
        this.steer((dx / d) * this.speedMax * 2.6, (dy / d) * this.speedMax * 2.6, 9, dt);
        this.model.setJaw(1);
        if (d < this.r + 0.35) {
          this.eco.eat(q, this.mouthX(), this.mouthY());
          sfx(w, SND.bite, this.x, 0.6, 1.1);
          w.fx.burst('goo', q.x, q.y, 3, 1, { color: '#a02a2a', grav: -0.5, size: 0.1 });
          this.hunger = 0; this.state = 'rest'; this.st = 0; this.prey = null;
        }
        break;
      }
      case 'rest':
        this.steer(0, 0, 1, dt);
        this.model.setJaw(0.15 + Math.sin(this.t * 3) * 0.1);
        if (this.st > 6) { this.state = 'cruise'; this.st = 0; }
        break;
    }
    // stay in the area
    const b = this.eco.bounds();
    if (this.x < b.x0) this.vx += 3 * dt; if (this.x > b.x1) this.vx -= 3 * dt;
    this.faceToward(this.vx, dt, this.state === 'strike' ? 8 : 3);
    if (this.state === 'angry') this.lookAtWorld(p.x, p.y); else if (this.prey) this.lookAtWorld(this.prey.x, this.prey.y);
    this.avoid(w, dt);
    this.integrate(dt, this.state === 'strike' ? 0.5 : 1);
    this.pose(dt);
  }
  onHit(w: World) {
    // provoked: it remembers for a while
    this.anger = 14; this.team = 'enemy';
    if (this.state !== 'angry') { w.text.pop('!', this.x, this.y + 0.6, 'danger', { size: 0.35, life: 0.7 }); sfx(w, SND.growl, this.x, 0.5, 1.5); }
  }
}

export class Scavenger extends Creature {
  state: 'wander' | 'feed' | 'angry' = 'wander';
  st = 0; dir = Math.random() < 0.5 ? -1 : 1; pause = 0; anger = 0;
  meal: { x: number; y: number; left: number } | null = null;
  legH: number; walker: boolean;
  constructor(species: string, x: number, y: number, public eco: EcoLink) {
    const crab = species === 'crab' || species === 'hermit';
    super('scavenger:' + species, species, x, y, { team: 'neutral', hp: crab ? 3 : 2, scale: crab ? 1.5 : 1.3, coins: [0, 2], gore: crab ? '#d8502a' : '#e0c090', speed: crab ? 1.3 : 0.15, r: 0.3, loot: [{ item: crab ? 'crab_claw' : materialId('seashell'), chance: 0.25 }] });
    this.walker = crab;
    this.legH = crab ? 0.16 * this.baseScale : 0.03;
    this.avoidTerrain = false;
    this.yaw = 0; this.facing = 1;
  }
  think(dt: number, w: World) {
    const p = w.player, dx = p.x - this.x, dy = p.y - this.y, d = Math.hypot(dx, dy);
    this.st += dt;
    const anim = this.model.anim;
    let want = 0;
    if (this.anger > 0) { this.anger -= dt; this.state = 'angry'; if (this.anger <= 0) { this.state = 'wander'; this.team = 'neutral'; } }
    switch (this.state) {
      case 'wander':
        this.pause -= dt;
        if (this.pause <= 0) { want = this.dir * this.speedMax * 0.4; if (Math.random() < dt * 0.25) { this.pause = R(0.5, 2.5); this.dir = -this.dir; } }
        anim.raise = damp(anim.raise ?? 0, 0, 4, dt);
        if (this.st > 1.5) { this.st = 0; this.meal = this.eco.findRemains(this.x, this.y, 18); if (this.meal) this.state = 'feed'; }
        break;
      case 'feed': {
        const m = this.meal;
        if (!m || m.left <= 0) { this.state = 'wander'; this.meal = null; break; }
        const ddx = m.x - this.x;
        want = Math.abs(ddx) > 0.35 ? Math.sign(ddx) * this.speedMax : 0;
        if (!want) {
          anim.pinch = Math.sin(this.t * 10) > 0 ? 1 : 0;
          if (this.eco.nibble(m, dt * 0.12) <= 0) { this.state = 'wander'; this.meal = null; sfx(w, SND.click, this.x, 0.4); }
          if (Math.random() < dt * 2) w.fx.emit('dust', m.x, m.y + 0.1, { n: 2, vy: 0.4, color: '#c8b8a0', life: 1 });
        }
        break;
      }
      case 'angry':
        want = Math.sign(dx) * this.speedMax * (Math.abs(dx) > 0.7 ? 1.2 : 0);
        anim.raise = damp(anim.raise ?? 0, 1, 8, dt);
        anim.pinch = Math.sin(this.t * 8) > 0.6 ? 1 : 0;
        if (d < 0.9 + p.r && this.hitCd <= 0) { w.hurtPlayer(1, this.x, this.y, 'crush'); this.hitCd = 1; sfx(w, SND.snip, this.x, 0.9); }
        break;
    }
    const b = this.eco.bounds();
    if (this.x < b.x0) want = Math.abs(want) || this.speedMax * 0.4; if (this.x > b.x1) want = -(Math.abs(want) || this.speedMax * 0.4);
    const floor = w.terrain.floorAt(this.x) + this.legH;
    this.vx = damp(this.vx, want, 6, dt);
    if (this.y > floor + 0.02) this.vy -= 7 * dt;
    this.x += this.vx * dt; this.y += this.vy * dt;
    if (this.y <= floor) { this.y = floor; this.vy = 0; }
    if (w.terrain.sdf(this.x + Math.sign(this.vx) * 0.35, this.y + 0.05) < 0.02) { this.dir = -this.dir; this.vx = 0; }
    anim.walk = this.vx;
    const slope = w.terrain.floorAt(this.x + 0.3) - w.terrain.floorAt(this.x - 0.3);
    this.obj.position.set(this.x, this.y, 0);
    if (this.walker) {
      this.squashV += (-this.squash * 160 - this.squashV * 12) * dt; this.squash += this.squashV * dt;
      const sq = clamp(this.squash, -0.3, 0.3);
      this.obj.scale.set(1 + sq, 1 - sq, 1 + sq * 0.5);
      this.pivot.rotation.set(0, clamp(dx * 0.1, -0.3, 0.3), Math.atan2(slope, 0.6) + (this.dying >= 0 ? this.rollBias : 0), 'YZX');
      this.model.update(dt, 0, 0);
    } else {
      if (Math.abs(this.vx) > 0.01) this.faceToward(this.vx, dt, 1);
      this.pitchBias = Math.atan2(slope, 0.6) * this.facingDir();
      this.pose(dt, 0.3, false);
    }
  }
  hit(dmg: number, dirX: number, dirY: number, w: World, src: Entity | null, kind?: DamageKind) {
    const ok = super.hit(dmg, dirX, dirY, w, src, kind);
    if (ok) { this.vy = Math.max(this.vy, 1.2 + dirY * 2); this.anger = 8; this.team = 'enemy'; }
    return ok;
  }
}
