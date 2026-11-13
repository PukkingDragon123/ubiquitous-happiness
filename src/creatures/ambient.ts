// Ambient / minor creatures that make a reef feel alive: shy reef fish that flee, a territorial triggerfish
// that rams you if you linger over its patch, a lone-hunting peacock bass, and gliding stingrays that only
// sting when stepped on (touched from above while resting) or provoked.
import type { World } from '../game/types';
import { Creature, sfx, SND } from './base';
import { damp, clamp } from '../core/math';

const R = (a: number, b: number) => a + Math.random() * (b - a);

/** shy schooling reef fish: wanders, darts away from the blobfish */
export class ReefFish extends Creature {
  homeX: number; homeY: number; wob = R(0, 10); flee = 0;
  constructor(species: string, x: number, y: number, o: { scale?: number; hp?: number; speed?: number } = {}) {
    super(species, species, x, y, { team: 'neutral', hp: o.hp ?? 2, scale: o.scale ?? 1.3, coins: [1, 2], gore: '#c0d0c0', speed: o.speed ?? 2.4 });
    this.homeX = x; this.homeY = y;
  }
  think(dt: number, w: World) {
    const p = w.player, dx = p.x - this.x, dy = p.y - this.y, d = Math.hypot(dx, dy);
    this.flee = Math.max(0, this.flee - dt);
    if (d < 2.2 || this.flee > 0) {
      this.steer((-dx / (d || 1)) * this.speedMax * 1.6, (-dy / (d || 1)) * this.speedMax, 4, dt);
    } else {
      const tx = this.homeX + Math.sin(this.t * 0.3 + this.wob) * 4, ty = this.homeY + Math.sin(this.t * 0.5 + this.wob * 2) * 1;
      this.seek(tx, ty, this.speedMax * 0.45, 1.5, dt, 1);
    }
    this.faceToward(this.vx, dt, 4);
    this.lookAtWorld(p.x, p.y);
    this.avoid(w, dt);
    this.integrate(dt, 1.2);
    this.pose(dt);
  }
  onHit() { this.flee = 2; }
}

/** territorial triggerfish: guards a patch of seabed, flares its trigger spine, then rams */
export class Triggerfish extends Creature {
  homeX: number; homeY: number; state: 'guard' | 'warn' | 'ram' | 'back' = 'guard'; st = 0; anger = 0; rx = 0; ry = 0;
  constructor(x: number, y: number) {
    super('triggerfish', 'triggerfish', x, y, { team: 'enemy', hp: 3, scale: 1.7, coins: [1, 3], gore: '#d8c8a8', speed: 2.2 });
    this.homeX = x; this.homeY = y;
  }
  think(dt: number, w: World) {
    const p = w.player, dx = p.x - this.x, dy = p.y - this.y, d = Math.hypot(dx, dy);
    const inZone = Math.hypot(p.x - this.homeX, p.y - this.homeY) < 3.2;
    this.st += dt;
    switch (this.state) {
      case 'guard':
        this.seek(this.homeX + Math.sin(this.t * 0.6) * 1.2, this.homeY + Math.sin(this.t * 0.9) * 0.3, 1, 2, dt, 0.5);
        this.faceToward(inZone ? dx : this.vx, dt, 3);
        this.anger = inZone ? this.anger + dt : Math.max(0, this.anger - dt * 0.5);
        if (this.anger > 1.2) { this.state = 'warn'; this.st = 0; w.text.pop('!', this.x, this.y + 0.5, 'danger', { size: 0.35, life: 0.6 }); sfx(w, ['grunt1', 'grunt2'], this.x, 0.7, 1.4); }
        break;
      case 'warn':
        this.steer(0, 0, 5, dt); this.faceToward(dx, dt, 10);
        this.pitchBias = clamp(Math.atan2(dy, Math.abs(dx)), -0.6, 0.6);
        if (Math.floor(this.st * 10) % 2 === 0) this.model.flash(0.4, '#ff3020');
        if (this.st > 0.5) { const l = d || 1; this.rx = dx / l; this.ry = dy / l; this.state = 'ram'; this.st = 0; sfx(w, SND.swish, this.x, 0.8, 1.2); }
        break;
      case 'ram':
        this.vx = this.rx * 8; this.vy = this.ry * 8;
        this.model.setJaw(1);
        if (this.touchPlayer(w, 1, 'bite', this.mouthX(), this.mouthY(), 0.25, 0.8)) { sfx(w, SND.bite, this.x, 1, 1.2); this.st = 1; }
        if (this.st > 0.35) { this.state = 'back'; this.st = 0; this.model.setJaw(0); this.anger = 0.4; }
        break;
      case 'back':
        this.seek(this.homeX, this.homeY, this.speedMax, 3, dt, 0.5);
        this.faceToward(this.vx, dt, 4);
        if (this.st > 1) this.state = 'guard';
        break;
    }
    if (this.state !== 'warn') this.pitchBias = damp(this.pitchBias, 0, 4, dt);
    this.lookAtWorld(p.x, p.y);
    this.avoid(w, dt);
    this.integrate(dt, this.state === 'ram' ? 0.1 : 1.5);
    this.pose(dt, Math.hypot(this.vx, this.vy) + 0.6, this.state !== 'warn');
  }
}

/** a lone predator that stalks and lunges (peacock bass, grouper) */
export class Predator extends Creature {
  state: 'cruise' | 'stalk' | 'lunge' | 'rest' = 'cruise'; st = 0; homeX: number; homeY: number; lx = 0; ly = 0;
  constructor(species: string, x: number, y: number, o: { scale?: number; hp?: number; dmg?: number } = {}) {
    super(species, species, x, y, { team: 'enemy', hp: o.hp ?? 4, scale: o.scale ?? 1.2, coins: [2, 4], gore: '#d0b040', speed: 2.6 });
    this.homeX = x; this.homeY = y;
  }
  think(dt: number, w: World) {
    const p = w.player, dx = p.x - this.x, dy = p.y - this.y, d = Math.hypot(dx, dy);
    this.st += dt;
    switch (this.state) {
      case 'cruise':
        this.seek(this.homeX + Math.sin(this.t * 0.25) * 5, this.homeY + Math.sin(this.t * 0.4) * 1, this.speedMax * 0.4, 1, dt, 1);
        this.faceToward(this.vx, dt, 3);
        if (d < 7) { this.state = 'stalk'; this.st = 0; }
        break;
      case 'stalk':
        this.seek(p.x - Math.sign(dx) * 2.4, p.y, this.speedMax * 0.7, 1.5, dt, 1);
        this.faceToward(dx, dt, 4);
        if (d > 11) this.state = 'cruise';
        if (this.st > 1.5 && d < 3.2) {
          this.state = 'lunge'; this.st = 0; const l = d || 1; this.lx = dx / l; this.ly = dy / l;
          this.model.flash(0.5, '#ff3020'); w.text.pop('!', this.x, this.y + 0.6, 'danger', { size: 0.35, life: 0.5 });
        }
        break;
      case 'lunge':
        if (this.st < 0.3) { this.steer(-this.lx, -this.ly, 6, dt); this.model.setJaw(0.6); }
        else { this.vx = this.lx * 9; this.vy = this.ly * 9; this.model.setJaw(1.1); }
        if (this.st > 0.3 && this.touchPlayer(w, 1, 'bite', this.mouthX(), this.mouthY(), 0.35, 0.8)) { sfx(w, ['gulp', 'chomp1'], this.x, 1, 0.9); this.st = 2; }
        if (this.st > 0.65) { this.state = 'rest'; this.st = 0; this.model.setJaw(0); }
        break;
      case 'rest':
        this.steer(0, 0, 2, dt);
        if (this.st > 1.2) { this.state = 'stalk'; this.st = 0; }
        break;
    }
    this.lookAtWorld(p.x, p.y);
    this.avoid(w, dt);
    this.integrate(dt, this.state === 'lunge' ? 0.2 : 1);
    this.pose(dt);
  }
}

/** stingray: glides low over the seabed, banked toward the camera so its back reads; stings when provoked */
export class Stingray extends Creature {
  homeX: number; dir = Math.random() < 0.5 ? -1 : 1; provoked = 0;
  constructor(species: string, x: number, y: number) {
    super(species, species, x, y, { team: 'neutral', hp: 4, scale: 1.4, coins: [2, 3], gore: '#e0d8c8', speed: 1.4, r: 0.45 });
    this.homeX = x;
  }
  think(dt: number, w: World) {
    const p = w.player;
    this.provoked = Math.max(0, this.provoked - dt);
    if (Math.abs(this.x - this.homeX) > 8) this.dir = this.x > this.homeX ? -1 : 1;
    const ty = w.terrain.floorAt(this.x) + 0.5 + Math.sin(this.t * 0.6) * 0.2;
    this.steer(this.dir * this.speedMax, (ty - this.y) * 1.5, 1, dt);
    this.faceToward(this.vx, dt, 1.2);
    this.rollBias = 1.05 * this.facingDir();
    if (this.provoked > 0) this.touchPlayer(w, 1, 'spike', this.x - this.facingDir() * this.L * 0.45, this.y, 0.45, 1);
    this.avoid(w, dt);
    this.integrate(dt, 0.8);
    this.pose(dt, Math.hypot(this.vx, this.vy) + 0.4, false);
  }
  onHit(w: World) { this.provoked = 4; this.team = 'enemy'; this.speedMax = 2.4; sfx(w, ['slap1', 'squish2'], this.x, 0.7); }
}

/** bottom dwellers (sea cucumber, starfish): inch along the seabed / sit on rock, harmless, can be knocked about */
export class Crawler extends Creature {
  dir = Math.random() < 0.5 ? -1 : 1; lift: number; upright: boolean;
  constructor(species: string, x: number, y: number) {
    super(species, species, x, y, { team: 'neutral', hp: 3, scale: 1.4, coins: [1, 2], gore: '#e0c090', speed: 0.12, r: 0.3 });
    this.upright = species === 'starfish';
    this.lift = this.upright ? 0.28 : 0.02;
    this.avoidTerrain = false;
    if (this.upright) { this.yaw = 0; this.facing = 1; }
  }
  think(dt: number, w: World) {
    const floor = w.terrain.floorAt(this.x) + this.lift;
    if (!this.upright) {
      if (Math.random() < dt * 0.05) this.dir = -this.dir;
      this.vx = damp(this.vx, this.dir * this.speedMax * (0.5 + 0.5 * Math.max(0, Math.sin(this.model.phase))), 2, dt);
      this.faceToward(this.dir, dt, 0.8);
    } else this.vx = damp(this.vx, 0, 3, dt);
    if (this.y > floor + 0.01) this.vy -= 4 * dt; else { this.y = floor; this.vy = Math.max(0, this.vy); }
    this.x += this.vx * dt; this.y += this.vy * dt;
    const slope = w.terrain.floorAt(this.x + 0.3) - w.terrain.floorAt(this.x - 0.3);
    this.pitchBias = this.upright ? 0 : Math.atan2(slope, 0.6) * this.facingDir();
    if (this.upright) this.rollBias = -0.25;
    this.pose(dt, 0.3, false);
  }
}
