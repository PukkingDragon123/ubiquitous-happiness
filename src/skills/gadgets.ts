// Tinkerer gadgets (great for wave defense: drop them by the shipwreck): a junk turret that spits rusty nails,
// a harpoon ballista with piercing bolts, proximity sea mines on a chain, and a net trap on the seabed.
// Gadgets sink to the floor under the drop point, then work on their own until their timer runs out.
import * as THREE from 'three';
import type { Entity, World, Team, DamageKind } from '../game/types';
import type { SkillCaster } from './types';
import { foes, nearestFoe, blast, strike } from './combat';
import { applyStatus } from './status';
import { FX, emit } from './fx';
import { Projectile } from './projectiles';
import { turretMesh, ballistaMesh, mineMesh, nailMesh, harpoonMesh, netTrapMesh } from './models';
import { dampAngle } from '../core/math';
import { psxMat } from '../player/psx';

abstract class Gadget implements Entity {
  abstract kind: string;
  team: Team = 'friend';
  vx = 0; vy = 0; alive = true; t = 0; hp: number; maxHp: number;
  obj = new THREE.Group();
  protected landed = false;
  constructor(public x: number, public y: number, public r: number, public p: SkillCaster, public life: number, public power: number, hp = 8, public sink = true) { this.hp = this.maxHp = hp; }
  abstract work(dt: number, w: World): void;
  update(dt: number, w: World) {
    this.t += dt;
    if (this.t > this.life) return this.expire(w);
    if (this.sink && !this.landed) {
      const floor = w.terrain.floorAt(this.x);
      this.vy = Math.max(-5, this.vy - 9 * dt);
      this.y += this.vy * dt;
      if (Math.random() < dt * 20) w.fx.emit('bubble', this.x, this.y + 0.3, { size: 0.08, spread: 0.2 });
      if (this.y <= floor) { this.y = floor; this.landed = true; FX.silt(w, this.x, floor + 0.05, 10, 0.7); w.sfx('thud_heavy', this.x, 0.5, 1.2); w.game.addShake(0.05); }
    } else this.landed = true;
    if (this.landed) this.work(dt, w);
    this.obj.position.set(this.x, this.y, 0.1);
    const pop = Math.min(1, this.t * 5);
    this.obj.scale.setScalar(pop < 1 ? pop * (1 + Math.sin(pop * Math.PI) * 0.3) : 1);
  }
  hit(dmg: number, _dx: number, _dy: number, w: World, _src: Entity | null, _kind?: DamageKind): boolean {
    this.hp -= dmg; FX.sparks(w, this.x, this.y + 0.4, 6, undefined, 4, '#ffd080'); w.sfx('clank', this.x, 0.4);
    if (this.hp <= 0) this.expire(w);
    return true;
  }
  protected expire(w: World) {
    if (!this.alive) return;
    this.alive = false;
    w.fx.debrisBurst(this.x, this.y + 0.3, 10, '#7a6a58', 3, 0.08);
    FX.smoke(w, this.x, this.y + 0.3, 3);
    w.sfx('clank', this.x, 0.5, 0.7);
  }
}

// ------------------------------------------------------------------ junk turret
export class JunkTurret extends Gadget {
  kind = 'junkTurret';
  private m = turretMesh();
  private cd = 0.6; private aim = 0; private kick = 0;
  constructor(x: number, y: number, p: SkillCaster, power: number) { super(x, y, 0.4, p, 15 * power, power, 10); this.obj.add(this.m.root); }
  work(dt: number, w: World) {
    const top = this.y + 0.68;
    const e = nearestFoe(w, this.x, top, 9.5);
    const want = e ? Math.atan2(e.y - top, e.x - this.x) : Math.sin(this.t) * 0.6 + (this.p.facing > 0 ? 0 : Math.PI);
    this.aim = dampAngle(this.aim, want, 8, dt);
    this.m.head.rotation.set(0, 0, this.aim);
    this.m.head.scale.y = Math.cos(this.aim) < 0 ? -1 : 1;
    this.kick = Math.max(0, this.kick - dt * 8);
    this.m.head.position.x = -Math.cos(this.aim) * this.kick * 0.08;
    this.cd -= dt;
    if (e && this.cd <= 0) {
      this.cd = 0.5 / Math.min(2, Math.sqrt(this.power));
      this.kick = 1;
      const mp = this.m.muzzle.getWorldPosition(new THREE.Vector3());
      const sp = 15, a = this.aim + (Math.random() - 0.5) * 0.08;
      w.add(new Projectile({ x: mp.x, y: mp.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 0.07, dmg: 0.8 * this.power, kind: 'spike', life: 0.9, src: this.p, mesh: nailMesh(), cutLines: true, knock: 1.5, onEnd: (ww, pr, why) => { if (why !== 'time') FX.sparks(ww, pr.x, pr.y, 4, undefined, 3, '#ffc080'); } }));
      FX.muzzle(w, mp.x, mp.y, a, 0.7);
      w.sfx('clk', this.x, 0.45, 0.8 + Math.random() * 0.3);
    }
  }
}

// ------------------------------------------------------------------ harpoon ballista
export class Ballista extends Gadget {
  kind = 'ballista';
  private m = ballistaMesh();
  private cd = 0.8; private aim = 0;
  constructor(x: number, y: number, p: SkillCaster, power: number) { super(x, y, 0.5, p, 18 * power, power, 14); this.obj.add(this.m.root); }
  work(dt: number, w: World) {
    const top = this.y + 0.75;
    const e = nearestFoe(w, this.x, top, 15);
    const want = e ? Math.atan2(e.y - top, e.x - this.x) : (this.p.facing > 0 ? 0.2 : Math.PI - 0.2);
    this.aim = dampAngle(this.aim, want, 4, dt);
    this.m.head.rotation.set(0, 0, this.aim);
    this.m.head.scale.y = Math.cos(this.aim) < 0 ? -1 : 1;
    this.cd -= dt;
    this.m.bolt.visible = this.cd < 1.0;
    if (e && this.cd <= 0) {
      this.cd = 1.8;
      const mp = this.m.muzzle.getWorldPosition(new THREE.Vector3());
      const sp = 17;
      w.add(new Projectile({ x: mp.x, y: mp.y, vx: Math.cos(this.aim) * sp, vy: Math.sin(this.aim) * sp, r: 0.12, dmg: 3.2 * this.power, kind: 'spike', life: 1.2, pierce: 3, src: this.p, mesh: harpoonMesh(1.1), cutLines: true, knock: 4, gore: 0.7, hitSfx: 'hit', onEnd: (ww, pr, why) => { if (why === 'terrain') { FX.silt(ww, pr.x, pr.y, 6, 0.4); ww.sfx('wood_knock1', pr.x, 0.5); } } }));
      w.sfx('rope_twang', this.x, 0.8, 0.8); w.sfx('swish_b', this.x, 0.5, 0.7);
      w.game.addShake(0.06);
      FX.muzzle(w, mp.x, mp.y, this.aim, 0.5);
    }
  }
}

// ------------------------------------------------------------------ sea mine
let chainMat: THREE.Material | null = null;
export class SeaMine extends Gadget {
  kind = 'seaMine';
  private m = mineMesh();
  private armed = -1; private chain: THREE.Mesh;
  private ax: number; private ay: number;
  constructor(x: number, y: number, p: SkillCaster, power: number) {
    super(x, y, 0.35, p, 40, power, 3, false);
    this.ax = x; this.ay = y;
    this.obj.add(this.m.root);
    chainMat ??= psxMat(null, { color: '#4a4038', rough: 0.8 });
    this.chain = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1, 4), chainMat);
    this.chain.frustumCulled = false;
  }
  work(dt: number, w: World) {
    // bob on its chain
    this.x = this.ax + Math.sin(this.t * 0.9) * 0.08;
    this.y = this.ay + Math.sin(this.t * 1.3) * 0.1;
    this.m.root.rotation.set(Math.sin(this.t * 0.7) * 0.2, this.t * 0.3, Math.sin(this.t * 0.8) * 0.15);
    const floor = w.terrain.floorAt(this.x);
    if (!this.chain.parent) w.scene.add(this.chain);
    const len = Math.max(0.01, this.y - 0.3 - floor);
    this.chain.position.set(this.x, floor + len / 2, 0.1);
    this.chain.scale.set(1, len, 1);
    const near = foes(w, this.x, this.y, 1.4).length > 0;
    if (near && this.armed < 0) { this.armed = 0.35; w.sfx('k_tick1', this.x, 0.8, 1.6); }
    const blinkRate = this.armed >= 0 ? 18 : 2;
    (this.m.light.material as THREE.MeshBasicMaterial).color.set(Math.sin(this.t * blinkRate) > 0 ? '#ff3020' : '#3a0804');
    if (this.armed >= 0) { this.armed -= dt; if (this.armed <= 0) this.boom(w); }
  }
  hit(dmg: number, dx: number, dy: number, w: World, src: Entity | null, kind?: DamageKind) { void dmg; void dx; void dy; void src; void kind; this.boom(w); return true; }
  private boom(w: World) {
    if (!this.alive) return;
    this.alive = false;
    this.chain.removeFromParent();
    FX.boom(w, this.x, this.y, 1.2);
    blast(w, this.p, this.x, this.y, 2.7, 4.5 * this.power, 'explosion', { gore: 1.2 });
    w.sfx('boom_uw1', this.x, 1); w.sfx('boom', this.x, 0.5);
    w.game.addShake(0.35); w.game.flash('#fff0d0', 0.2);
  }
  protected expire(w: World) { this.boom(w); }
  dispose() { this.chain.removeFromParent(); }
}

// ------------------------------------------------------------------ net trap
export class NetTrap extends Gadget {
  kind = 'netTrap';
  private m = netTrapMesh();
  private sprung = -1;
  constructor(x: number, y: number, p: SkillCaster, power: number) { super(x, y, 0.6, p, 25, power, 4); this.obj.add(this.m); }
  work(dt: number, w: World) {
    if (this.sprung >= 0) {
      this.sprung += dt;
      this.m.position.y = Math.sin(Math.min(1, this.sprung * 4) * Math.PI) * 0.8;
      this.m.rotation.x = this.sprung * 6;
      this.m.scale.setScalar(Math.max(0.01, 1 - this.sprung * 2));
      if (this.sprung > 0.5) { this.alive = false; }
      return;
    }
    const hit = foes(w, this.x, this.y + 0.5, 1.5);
    if (hit.length) {
      this.sprung = 0;
      for (const e of hit) { applyStatus(w, e, 'snare', 4 * this.power, { src: this.p }); strike(w, this.p, e, 0.5 * this.power, 0, 1, 'spike', { quiet: true }); }
      w.sfx('net1', this.x, 0.8); w.sfx('rope_twang', this.x, 0.5, 1.2);
      w.text.pop('SNARED!', this.x, this.y + 1.2, 'gold', { size: 0.3 });
      emit(w, 'dust', this.x, this.y + 0.2, { n: 8, spread: 0.5, speed: 1.5 });
    }
  }
}
