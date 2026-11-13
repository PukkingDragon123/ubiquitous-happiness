// Summoner / Toymaker pets: a pet crab that scuttles along the seabed and snips divers' ankles, a jar of
// piranhas that strip anything they find, and an octopus pal that grabs a diver and inks the crowd.
// Summons are team 'friend' entities with hp: enemies may attack them (they poof when killed).
import * as THREE from 'three';
import type { Entity, World, Team, DamageKind } from '../game/types';
import type { SkillCaster } from './types';
import { strike, foes, nearestFoe } from './combat';
import { applyStatus } from './status';
import { FX, emit, cloud } from './fx';
import { crabMesh, piranhaMesh, octopusMesh } from './models';
import { damp, dampAngle } from '../core/math';

abstract class Summon implements Entity {
  abstract kind: string;
  team: Team = 'friend';
  vx = 0; vy = 0; alive = true; t = 0;
  hp: number; maxHp: number;
  obj = new THREE.Group();
  constructor(public x: number, public y: number, public r: number, public p: SkillCaster, public life: number, hp: number, public power: number) { this.hp = this.maxHp = hp; }
  abstract update(dt: number, w: World): void;
  hit(dmg: number, dx: number, dy: number, w: World, _src: Entity | null, _kind?: DamageKind): boolean {
    if (!this.alive) return false;
    this.hp -= dmg; this.vx += dx * 3; this.vy += dy * 3;
    FX.sparks(w, this.x, this.y, 5, undefined, 3);
    if (this.hp <= 0) this.poof(w);
    return true;
  }
  poof(w: World) {
    if (!this.alive) return;
    this.alive = false;
    w.fx.emit('bubble', this.x, this.y, { n: 14, spread: this.r, speed: 1.5 });
    FX.magic(w, this.x, this.y, '#ffd0f0', 8);
    w.sfx('pop', this.x, 0.5);
  }
  protected aging(dt: number, w: World) { this.t += dt; if (this.t > this.life) this.poof(w); }
}

// ------------------------------------------------------------------ pet crab
export class PetCrab extends Summon {
  kind = 'petCrab';
  private m = crabMesh();
  private target: Entity | null = null;
  private snipT = 0; private snip = 0; private face = 1; private onFloor = false; private walk = 0;
  constructor(x: number, y: number, p: SkillCaster, power: number) {
    super(x, y, 0.3, p, 20 * power, 6 * power, power);
    this.obj.add(this.m.root);
    this.m.root.scale.setScalar(1.1);
  }
  update(dt: number, w: World) {
    this.aging(dt, w);
    const floor = w.terrain.floorAt(this.x);
    // pick a target: nearest enemy within 10 m, else follow the owner
    if (!this.target || !this.target.alive || Math.random() < dt) this.target = nearestFoe(w, this.x, this.y, 10);
    const tx = this.target ? this.target.x : this.p.x - this.p.facing * 1.2;
    const dx = tx - this.x;
    if (this.onFloor) {
      const want = Math.abs(dx) > 0.5 ? Math.sign(dx) * 3.2 : 0;
      this.vx = damp(this.vx, want, 8, dt);
      if (Math.abs(this.vx) > 0.3) this.face = Math.sign(this.vx);
      // targets swimming above: hop up to snip them
      if (this.target && Math.abs(dx) < 1.4 && this.target.y - this.y > 0.8 && this.target.y - this.y < 4) { this.vy = Math.min(9, 3 + (this.target.y - this.y) * 2.2); this.vx = dx * 2; this.onFloor = false; w.sfx('jump1', this.x, 0.3, 1.4); }
    }
    this.vy -= 9 * dt;
    this.vx *= Math.exp(-dt * (this.onFloor ? 0 : 0.6));
    this.x += this.vx * dt; this.y += this.vy * dt;
    if (this.y < floor) { if (!this.onFloor && this.vy < -2) FX.silt(w, this.x, floor, 4, 0.3); this.y = floor; this.vy = 0; this.onFloor = true; }
    // snip
    this.snipT -= dt;
    if (this.target && this.snipT <= 0 && Math.hypot(this.target.x - this.x, this.target.y - this.y - 0.2) < this.target.r + 0.55) {
      this.snipT = 0.45; this.snip = 1;
      if (strike(w, this.p, this.target, 1.1 * this.power, this.face, 0.4, 'bite', { gore: 0.25 })) w.sfx('crab_snip1', this.x, 0.6, 0.9 + Math.random() * 0.3);
    }
    this.snip = Math.max(0, this.snip - dt * 5);
    // anim: legs scuttle, claws snap, eyes bob
    this.walk += Math.abs(this.vx) * dt * 9;
    this.m.legs.forEach((l, i) => { l.rotation.x = Math.sin(this.walk + i * 1.7) * 0.4; l.position.y = 0.2 + Math.max(0, Math.sin(this.walk + i * 1.7)) * 0.03; });
    this.m.claws.forEach((c, i) => { c.pin.rotation.z = -0.5 * Math.max(0, Math.sin(this.t * 3 + i)) * 0.4 - this.snip * 0.6; c.arm.rotation.z = 0.3 + this.snip * 0.5 + Math.sin(this.t * 2 + i) * 0.08; });
    this.m.eyes.forEach((e, i) => { e.rotation.z = Math.sin(this.t * 4 + i) * 0.15; });
    this.obj.position.set(this.x, this.y, 0.2);
    this.obj.rotation.y = dampAngle(this.obj.rotation.y, this.face > 0 ? -0.5 : Math.PI + 0.5, 10, dt);
    this.obj.scale.setScalar(Math.min(1, this.t * 4));
  }
}

// ------------------------------------------------------------------ piranha
export class Piranha extends Summon {
  kind = 'piranha';
  private m = piranhaMesh();
  private target: Entity | null = null;
  private bite = 0; private biteT = 0; private seed = Math.random() * 10;
  constructor(x: number, y: number, p: SkillCaster, power: number) {
    super(x, y, 0.16, p, 7 * power, 2, power);
    this.obj.add(this.m.root);
    this.m.root.scale.setScalar(1.6);
    const a = Math.random() * Math.PI * 2;
    this.vx = Math.cos(a) * 5; this.vy = Math.sin(a) * 5;
  }
  update(dt: number, w: World) {
    this.aging(dt, w);
    if (!this.target || !this.target.alive || Math.random() < dt * 0.5) {
      const list = foes(w, this.x, this.y, 11);
      this.target = list.length ? list[Math.floor(Math.random() * list.length)] : null;
    }
    const tx = this.target ? this.target.x + Math.sin(this.t * 7 + this.seed) * 0.3 : this.p.x + Math.cos(this.t * 2 + this.seed) * 1.5;
    const ty = this.target ? this.target.y + Math.cos(this.t * 6 + this.seed) * 0.3 : this.p.y + Math.sin(this.t * 2.6 + this.seed) * 1.0;
    const dx = tx - this.x, dy = ty - this.y, l = Math.hypot(dx, dy) || 1;
    const sp = this.target ? 8 : 5;
    this.vx += ((dx / l) * sp - this.vx) * Math.min(1, dt * 5);
    this.vy += ((dy / l) * sp - this.vy) * Math.min(1, dt * 5);
    this.x += this.vx * dt; this.y += this.vy * dt;
    if (w.terrain.sdf(this.x, this.y) < 0.1) { const n = w.terrain.normal(this.x, this.y); this.x += n.x * 0.1; this.y += n.y * 0.1; }
    this.biteT -= dt;
    if (this.target && this.biteT <= 0 && Math.hypot(this.target.x - this.x, this.target.y - this.y) < this.target.r + 0.25) {
      this.biteT = 0.32; this.bite = 1;
      if (strike(w, this.p, this.target, 0.55 * this.power, this.vx, this.vy, 'bite', { gore: 0.35, quiet: true })) {
        w.sfx(Math.random() < 0.5 ? 'bite' : 'chomp1', this.x, 0.35, 1.2 + Math.random() * 0.4);
        this.vx *= -0.6; this.vy *= -0.6;
      }
    }
    this.bite = Math.max(0, this.bite - dt * 6);
    this.m.jaw.rotation.z = -this.bite * 0.7;
    this.m.tail.rotation.y = Math.sin(this.t * 22) * 0.5;
    const ang = Math.atan2(this.vy, this.vx);
    this.obj.position.set(this.x, this.y, 0.3);
    this.obj.rotation.set(0, 0, ang);
    this.obj.scale.set(1, Math.cos(ang) < 0 ? -1 : 1, 1);
    if (Math.random() < dt * 3) w.fx.emit('bubble', this.x, this.y, { size: 0.06, life: 1 });
  }
}

// ------------------------------------------------------------------ octopus ink pal
export class InkPal extends Summon {
  kind = 'inkPal';
  private m = octopusMesh();
  private target: Entity | null = null;
  private state: 'seek' | 'grab' | 'leave' = 'seek';
  private st = 0; private squeeze = 0;
  constructor(x: number, y: number, p: SkillCaster, power: number) {
    super(x, y, 0.35, p, 9, 8 * power, power);
    this.obj.add(this.m.root);
    this.m.root.scale.setScalar(1.25);
  }
  update(dt: number, w: World) {
    this.aging(dt, w);
    this.st += dt;
    if (this.state === 'seek') {
      if (!this.target || !this.target.alive) this.target = nearestFoe(w, this.x, this.y, 12);
      const tx = this.target ? this.target.x : this.p.x + this.p.facing * 2, ty = this.target ? this.target.y + 0.2 : this.p.y + 0.8;
      const dx = tx - this.x, dy = ty - this.y, l = Math.hypot(dx, dy) || 1;
      // jet propulsion: pulses of speed
      const pulse = Math.max(0, Math.sin(this.t * 5));
      this.vx = damp(this.vx, (dx / l) * 6 * pulse, 6, dt); this.vy = damp(this.vy, (dy / l) * 6 * pulse, 6, dt);
      if (this.target && l < this.target.r + 0.45) { this.state = 'grab'; this.st = 0; w.sfx('squish', this.x, 0.7, 0.8); w.text.pop('GOTCHA!', this.x, this.y + 0.8, 'shout', { size: 0.28 }); }
    } else if (this.state === 'grab') {
      const e = this.target;
      if (!e || !e.alive) { this.state = 'leave'; this.st = 0; }
      else {
        this.x = damp(this.x, e.x - 0.1, 12, dt); this.y = damp(this.y, e.y + e.r * 0.4, 12, dt); this.vx = 0; this.vy = 0;
        applyStatus(w, e, 'snare', 0.3, { src: this.p });
        this.squeeze -= dt;
        if (this.squeeze <= 0) { this.squeeze = 0.5; strike(w, this.p, e, 0.6 * this.power, 0, -1, 'crush', { quiet: true }); }
        if (this.st > 1.6) {
          // squirt: an ink cloud that blinds everyone near
          cloud(w, this.x, this.y, '#8a6aff', { n: 10, spread: 1, size: 1.3, life: 3, bright: 1.5, speed: 2 });
          for (const f of foes(w, this.x, this.y, 3.4)) { applyStatus(w, f, 'blind', 4 * this.power, { src: this.p }); strike(w, this.p, f, 1 * this.power, f.x - this.x, f.y - this.y, 'spike', { quiet: true }); }
          w.emit('ink', { x: this.x, y: this.y, r: 3.4 });
          w.sfx('gloop', this.x, 0.8, 0.7);
          applyStatus(w, e, 'stun', 1.2 * this.power, { src: this.p });
          this.state = 'leave'; this.st = 0;
        }
      }
    } else {
      this.vx = damp(this.vx, -this.p.facing * 2, 3, dt); this.vy = damp(this.vy, 4, 3, dt);
      if (this.st > 1.2) this.poof(w);
    }
    this.x += this.vx * dt; this.y += this.vy * dt;
    // arms: a slow curl while swimming, wrapping tight while grabbing
    const grab = this.state === 'grab' ? 1 : 0;
    this.m.arms.forEach((segs, k) => segs.forEach((s, j) => {
      if (j === 0) return;
      s.rotation.x = Math.sin(this.t * 4 + k * 0.8 - j * 0.6) * 0.25 * (1 - grab) + grab * 0.4;
      s.rotation.z = Math.cos(this.t * 3 + k - j * 0.5) * 0.2 + grab * 0.35 * (k % 2 ? 1 : -1);
    }));
    this.m.mantle.scale.set(1 + Math.sin(this.t * 5) * 0.05, 1 - Math.sin(this.t * 5) * 0.06, 1);
    this.obj.position.set(this.x, this.y, 0.35);
    this.obj.rotation.set(0, -0.5, Math.atan2(this.vy, Math.abs(this.vx) + 1) * 0.3);
    this.obj.scale.setScalar(Math.min(1, this.t * 3));
    if (Math.random() < dt * 2) emit(w, 'bubble', this.x, this.y + 0.3, { size: 0.08 });
  }
}
