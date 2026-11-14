// Human bosses on the diver rig (src/humans/diver.ts), plodding the seabed with hyper armour on the big swings.
//   GRAVEYARD  CAPTAIN GAFF, and his Anchor — the scuba captain swinging a rusted ship's anchor on a chain.
//              P1 swing (white arc) | overhead SLAM (white, slow; the anchor sticks: punish) | shove (white,
//              punishes hugging) | chain THROW (red: the anchor flies out at you and is reeled back)
//              P2 the same, faster, more throws | P3 + SPIN (red: the anchor orbits him; get out of reach or
//              dodge through — he's dizzy after)
//   ARCTIC     THE BRASS TITAN, Iron Lung of the Floe — the giant brass-helmet diver.
//              P1 cannon SWEEP (white, crushing on a block) | stomp (white) | cannon shot (aim line; parry it
//              back) | ICE SPIKES (red: a ring marks where they erupt) | P2 + three-shot volley | P3 + a
//              shoulder CHARGE across the arena (white, parryable)
import * as THREE from 'three';
import type { World, Entity, Team } from '../game/types';
import type { Arena } from '../combat/types';
import type { MoveDef } from '../combat/core';
import { BossBase } from './base';
import { makeDiver } from '../humans/diver';
import type { DiverRig } from '../humans/diver';
import { kitMat } from '../humans/diveGear';
import { band, nz, hh } from '../humans/fabric';
import { AimLine, dangerZone, glint } from '../combat/telegraph';
import { attackPlayer } from '../combat/resolve';
import { callout } from '../combat/feel';
import { Bolt } from '../combat/projectiles';
import { clamp, damp } from '../core/math';

const _v = new THREE.Vector3();

abstract class DiverBoss extends BossBase {
  rig: DiverRig;
  protected lean = 0;
  protected aimPt: { x: number; y: number } | null = null;
  protected walk = 0;
  constructor(kind: string, arena: Arena, o: { name: string; title: string; hp: number; poise: number; r: number }, arch: 'scuba' | 'titan', weapon: 'none' | 'cannon', scale: number) {
    super(kind, arena, o);
    this.rig = makeDiver(arch, arch === 'titan' ? 3 : 5, { weapon, scars: arch === 'scuba' ? ['eyepatch', 'scar'] : [] });
    this.rig.group.scale.setScalar(scale);
    this.rig.mode = 'stand';
    this.obj.add(this.rig.group);
    this.y = arena.floor + this.rig.pivotHeight * scale;
    this.scale = scale;
  }
  protected scale: number;
  head() { const h = this.rig.headWorld(_v); return { x: h.x, y: h.y + 0.5 }; }
  protected walkTo(dt: number, tx: number, speed: number) {
    const a = this.arena;
    const dx = tx - this.x;
    const want = Math.abs(dx) > 0.3 ? Math.sign(dx) * speed * Math.min(1, Math.abs(dx) / 1.2) : 0;
    this.vx = damp(this.vx, want, 3, dt);
    this.x = clamp(this.x + this.vx * dt, a.x0 + 1.2, a.x1 - 1.2);
  }
  protected place(dt: number, w: World) {
    const p = w.player;
    this.y = this.arena.floor + this.rig.pivotHeight * this.scale;
    if (!this.core.attacking || this.core.phase === 'windup' && this.core.k < 0.6) this.rig.facing = (p.x >= this.x ? 1 : -1);
    this.facing = this.rig.facing;
    this.rig.mode = Math.abs(this.vx) > 0.2 ? 'walk' : 'stand';
    this.rig.speed = clamp(Math.abs(this.vx) / 2, 0, 1);
    if (this.aimPt) this.rig.aimAt(this.aimPt.x, this.aimPt.y); else this.rig.aimAt(p.x, p.y);
    this.rig.lookAt(p.x, p.y);
    this.rig.expr = this.core.phase === 'stagger' ? 'scared' : this.core.phase === 'windup' ? 'angry' : 'focus';
    this.rig.hurt = this.state === 'dying' ? 0.8 : 0;
    this.rig.update(dt);
    this.rig.group.rotation.z = this.lean;
    this.rig.group.position.set(this.x, this.y, 0);
    if (Math.abs(this.vx) > 0.4 && Math.random() < dt * 4) w.fx.silt(this.x, this.arena.floor + 0.05, 3);
  }
  protected staggerPose(dt: number) { this.lean = damp(this.lean, 0.25 * this.facing + Math.sin(this.core.t * 16) * 0.05, 8, dt); this.vx = damp(this.vx, 0, 4, dt); this.aimPt = { x: this.x + this.facing, y: this.y - 1 }; }
  protected introPose(dt: number, w: World, k: number) { this.lean = damp(this.lean, k > 0.4 && k < 0.8 ? -0.2 * this.facing : 0, 5, dt); this.aimPt = { x: this.x + this.facing * 2, y: this.y + 3 * Math.min(1, k * 2) }; if (k > 0.35 && k < 0.4) this.rig.play('taunt', true); void w; }
  protected transitionPose(dt: number, w: World, k: number) { this.introPose(dt, w, k); }
  protected dyingPose(dt: number, _w: World, k: number) { this.lean = damp(this.lean, 0.5 * this.facing * k, 2, dt); this.aimPt = { x: this.x + this.facing, y: this.y - 2 }; }
  protected deadPose(dt: number, w: World) {
    if (!this.rig.dead) this.rig.die(0, 0, this.facing * 2, 1);
    this.rig.update(dt, { ground: () => this.arena.floor });
    if (this.st > 6) this.alive = false;
    void w;
  }
  dispose() { this.rig.dispose(); }
}

// =========================================================================================== CAPTAIN GAFF
const rust = () => kitMat('gaffAnchor', 32, 32, (x, y) => {
  let c: [number, number, number] = [92, 84, 80];
  if (nz(x, y, 8, 5) > 0.6) c = [142, 74, 38];
  if (hh(x, y, 9) > 0.96) c = [190, 120, 60];
  return band(c, 0.86 + (y < 4 ? 0.18 : 0) + (nz(x * 2, y, 6, 1) - 0.5) * 0.14, x, y, 0.07);
}, { rough: 0.8, metal: 0.3 });
function buildAnchor(): THREE.Group {
  const g = new THREE.Group();
  const m = rust();
  const add = (geo: THREE.BufferGeometry, p: [number, number, number], r: [number, number, number] = [0, 0, 0], s: [number, number, number] = [1, 1, 1]) => { const me = new THREE.Mesh(geo, m); me.position.set(...p); me.rotation.set(...r); me.scale.set(...s); me.castShadow = true; g.add(me); };
  // the anchor hangs from its ring at the origin, shank pointing down (-y)
  add(new THREE.TorusGeometry(0.14, 0.04, 4, 8), [0, 0, 0]);
  add(new THREE.BoxGeometry(0.16, 1.5, 0.16), [0, -0.85, 0]);
  add(new THREE.BoxGeometry(0.9, 0.1, 0.1), [0, -0.3, 0], [0, Math.PI / 2, 0]); // the stock (across)
  for (const s of [1, -1]) {
    add(new THREE.BoxGeometry(0.62, 0.14, 0.14), [s * 0.3, -1.52, 0], [0, 0, s * 0.55]);
    add(new THREE.ConeGeometry(0.17, 0.42, 4), [s * 0.6, -1.25, 0], [0, 0, s * -0.4], [1, 1, 0.45]); // flukes
  }
  add(new THREE.ConeGeometry(0.1, 0.25, 4), [0, -1.7, 0], [Math.PI, 0, 0]);
  return g;
}
const GA: Record<string, MoveDef> = {
  swing: { id: 'swing', windup: 0.75, active: 0.3, recover: 0.6, dmg: 1.5, kind: 'crush', knock: 7, hyper: true, guardDmg: 40 },
  overhead: { id: 'overhead', windup: 1.05, active: 0.2, recover: 1.3, dmg: 2.5, kind: 'crush', knock: 9, hyper: true, guardDmg: 70, tellAt: 0.32 },
  shove: { id: 'shove', windup: 0.45, active: 0.14, recover: 0.5, dmg: 1, kind: 'crush', knock: 8 },
  chainThrow: { id: 'chainThrow', windup: 0.85, active: 1.3, recover: 0.5, dmg: 1.5, unblockable: true, kind: 'crush', knock: 6, tellAt: 0.4 },
  spin: { id: 'spin', windup: 0.85, active: 1.9, recover: 1.4, dmg: 1.5, unblockable: true, kind: 'crush', knock: 8, tellAt: 0.4, hyper: true },
};
export class CaptainGaff extends DiverBoss {
  cycles = [['swing', 'swing', 'overhead', 'shove', 'chainThrow'], ['swing', 'chainThrow', 'overhead', 'swing', 'shove', 'chainThrow'], ['spin', 'swing', 'overhead', 'chainThrow', 'spin', 'swing']];
  moves = GA;
  private anchor = buildAnchor();
  private links: THREE.Mesh[] = [];
  private anc = { x: 0, y: 0, ang: 0 };
  private throwTo = { x: 0, y: 0 };
  private hitThisPass = false;
  constructor(arena: Arena, w: World) {
    super('captainGaff', arena, { name: 'CAPTAIN GAFF', title: 'and his Anchor', hp: 100, poise: 130, r: 1.0 }, 'scuba', 'none', 1.45);
    w.scene.add(this.anchor);
    const lg = new THREE.TorusGeometry(0.07, 0.022, 4, 6), lm = rust();
    for (let i = 0; i < 12; i++) { const l = new THREE.Mesh(lg, lm); l.castShadow = true; this.links.push(l); w.scene.add(l); }
    this.anc.x = this.x - 1; this.anc.y = this.arena.floor + 0.4;
  }
  private hand() { return this.rig.boneWorld('handR', _v).clone(); }
  protected tellPoint() { return { x: this.anc.x, y: this.anc.y - 1 }; }
  protected want(id: string, w: World) {
    const dx = Math.abs(w.player.x - this.x);
    if (id === 'chainThrow') return dx > 2.5 && dx < 10;
    if (id === 'spin') return dx < 6;
    if (id === 'shove') return dx < 1.8;
    return dx < 3.2;
  }
  protected approach(dt: number, w: World, next: string) {
    const p = w.player, side = Math.sign(this.x - p.x) || 1;
    const want = next === 'chainThrow' ? p.x + side * 5 : next === 'shove' ? p.x + side * 1.2 : p.x + side * 2.4;
    this.walkTo(dt, want, 1.6 * this.core.speed);
    this.lean = damp(this.lean, 0, 5, dt);
    this.aimPt = null;
    // the anchor drags along the seabed behind him
    const h = this.hand();
    this.anc.x = damp(this.anc.x, h.x - this.facing * 0.9, 4, dt); this.anc.y = damp(this.anc.y, this.arena.floor + 1.7, 4, dt); this.anc.ang = damp(this.anc.ang, -this.facing * 0.3, 4, dt);
  }
  protected started(w: World, m: MoveDef) {
    this.hitThisPass = false;
    if (m.id === 'chainThrow') { const p = w.player; this.throwTo = { x: p.x, y: p.y }; w.sfx('chain', this.x, 0.9, 0.8); }
    if (m.id === 'spin') { w.sfx('chain', this.x, 1, 0.6); dangerZone(w, this.x, this.y, 2.9, m.windup / this.core.speed + m.active, true, () => ({ x: this.x, y: this.y })); }
    if (m.id === 'overhead' || m.id === 'swing') w.sfx('grunt', this.x, 0.7, 0.7);
    if (Math.random() < 0.3) callout(w, ['HAUL AWAY!', 'TO THE DEPTHS!', 'YOU\'RE CHUM!'][Math.floor(Math.random() * 3)], this.x, this.y + 2.4, 'danger', 0.34);
  }
  protected run(dt: number, w: World) {
    const c = this.core, m = c.move!, ph = c.phase, k = c.k, f = this.facing;
    const h = this.hand();
    const fl = this.arena.floor;
    let tx = this.anc.x, ty = this.anc.y, rate = 10;
    this.vx = damp(this.vx, 0, 5, dt);
    switch (m.id) {
      case 'swing': {
        // arc round the hand from behind-high to front-low
        const a0 = Math.PI * 0.85, a1 = -0.35;
        const ang = ph === 'windup' ? Math.PI * 0.55 + (a0 - Math.PI * 0.55) * Math.min(1, k * 1.4) : ph === 'active' ? a0 + (a1 - a0) * k : a1;
        tx = h.x + Math.cos(ang) * 2.2 * f; ty = h.y + Math.sin(ang) * 2.2; rate = ph === 'active' ? 40 : 8;
        this.lean = ph === 'windup' ? 0.2 * f : ph === 'active' ? -0.2 * f : 0;
        if (ph === 'active') { if (c.justEntered('active')) { w.sfx('swish_c', this.x, 1, 0.5); this.vx = f * 2; } this.hitCircle(w, this.anc.x, this.anc.y - 1, 1.0); }
        this.aimPt = { x: this.x + Math.cos(ang) * 2 * f, y: this.y + Math.sin(ang) * 2 };
        break;
      }
      case 'overhead': {
        if (ph === 'windup') { tx = h.x + f * 0.3; ty = h.y + 2.5 * Math.min(1, k * 1.3); this.lean = 0.25 * f * k; this.aimPt = { x: this.x + f * 0.4, y: this.y + 3 }; }
        else if (ph === 'active') { tx = this.x + f * 2.7; ty = fl + 1.7; rate = 45; this.lean = -0.3 * f; this.aimPt = { x: this.x + f * 2.5, y: fl };
          if (k > 0.5 && c.t - dt < m.active * 0.5) { w.game.addShake(0.45); w.fx.silt(this.x + f * 2.7, fl + 0.1, 22); w.fx.shockwave(this.x + f * 2.7, fl + 0.2, 1.5, '#ffd0a0'); w.sfx('thud_heavy', this.x, 1, 0.5); w.sfx('rock_hit', this.x, 0.8, 0.5); }
          this.hitCircle(w, this.anc.x, Math.max(fl + 0.5, this.anc.y - 1.2), 1.1); }
        else { tx = this.x + f * 2.7; ty = fl + 1.6; this.lean = -0.3 * f * (1 - k); this.aimPt = { x: this.x + f * 2.5, y: fl }; }
        break;
      }
      case 'shove': {
        tx = h.x - f * 0.8; ty = fl + 1.7;
        this.aimPt = { x: this.x + f * 2, y: this.y + (ph === 'windup' ? 0.6 : 0) };
        this.lean = ph === 'windup' ? 0.15 * f : ph === 'active' ? -0.25 * f : 0;
        if (ph === 'active') { if (c.justEntered('active')) this.vx = f * 4; const pl = w.player; if (!c.landed && (pl.x - this.x) * f > 0 && (pl.x - this.x) * f < 1.8 && Math.abs(pl.y - this.y) < 1.6) c.strike(w, { x: this.x, y: this.y }); }
        break;
      }
      case 'chainThrow': {
        if (ph === 'windup') {
          // whirl overhead
          const ang = c.t * 12;
          tx = h.x + Math.cos(ang) * 1.6; ty = h.y + 1.6 + Math.sin(ang) * 0.5; rate = 30;
          this.aimPt = { x: this.x, y: this.y + 3 };
          if (Math.floor(c.t * 4) !== Math.floor((c.t - dt) * 4)) w.sfx('swish_a', this.x, 0.5, 0.7);
          if (k < 0.8) { const p = w.player; this.throwTo = { x: p.x, y: p.y }; }
        } else if (ph === 'active') {
          const out = k < 0.45 ? k / 0.45 : 1 - (k - 0.45) / 0.55;
          if (k >= 0.45 && !this.hitThisPass) { this.hitThisPass = true; c.landed = false; }
          const dx = this.throwTo.x - h.x, dy = this.throwTo.y - h.y, l = Math.hypot(dx, dy) || 1, L = Math.min(9, l + 1);
          tx = h.x + (dx / l) * L * out; ty = h.y + (dy / l) * L * out + 1; rate = 60;
          this.aimPt = { x: this.throwTo.x, y: this.throwTo.y };
          if (c.justEntered('active')) { w.sfx('chain', this.x, 1, 1.2); w.sfx('swish_c', this.x, 0.8, 0.8); }
          this.hitCircle(w, this.anc.x, this.anc.y - 1, 0.9);
          if (Math.random() < dt * 20) w.fx.emit('bubbleS', this.anc.x, this.anc.y - 1, { n: 1, spread: 0.2 });
        }
        break;
      }
      case 'spin': {
        if (ph === 'windup') { const ang = c.t * 6; tx = h.x + Math.cos(ang) * 1.2; ty = h.y + 0.8; rate = 20; this.lean = 0; }
        else if (ph === 'active') {
          const ang = c.t * 7.5 * f;
          tx = this.x + Math.cos(ang) * 2.6; ty = this.y + 0.3 + Math.sin(ang) * 2.0; rate = 60;
          this.rig.facing = Math.cos(ang) >= 0 ? 1 : -1;
          this.aimPt = { x: tx, y: ty };
          if (Math.floor(c.t * 2.4) !== Math.floor((c.t - dt) * 2.4)) { w.sfx('swish_c', this.x, 0.8, 0.6); c.landed = false; }
          this.hitCircle(w, this.anc.x, this.anc.y - 1, 1.0);
        } else {
          // dizzy: the punish window
          tx = this.x + f * 1.5; ty = this.arena.floor + 1.6; this.lean = Math.sin(c.t * 9) * 0.12;
          if (c.justEntered('recover')) callout(w, 'DIZZY', this.x, this.y + 2.4, 'gold', 0.42);
        }
        break;
      }
    }
    this.anc.x = damp(this.anc.x, tx, rate, dt); this.anc.y = damp(this.anc.y, ty, rate, dt);
    this.anc.y = Math.max(this.anc.y, fl + 1.65);
  }
  protected place(dt: number, w: World) {
    super.place(dt, w);
    // the anchor hangs from its ring, swinging toward its motion; the chain links run from the hand
    const h = this.hand();
    this.anchor.position.set(this.anc.x, this.anc.y, 0.3);
    const tilt = Math.atan2(this.anc.x - h.x, Math.max(0.3, h.y - this.anc.y + 1));
    this.anc.ang = damp(this.anc.ang, clamp(-tilt * 0.6, -1.2, 1.2), 6, dt);
    this.anchor.rotation.set(0, 0.5, this.anc.ang);
    for (let i = 0; i < this.links.length; i++) {
      const t = (i + 0.5) / this.links.length;
      const sag = Math.sin(t * Math.PI) * 0.25;
      this.links[i].position.set(h.x + (this.anc.x - h.x) * t, h.y + (this.anc.y - h.y) * t - sag, 0.3);
      this.links[i].rotation.set(i % 2 ? Math.PI / 2 : 0, 0, Math.atan2(this.anc.y - h.y, this.anc.x - h.x));
    }
    const vis = this.alive && this.state !== 'dead';
    this.anchor.visible = vis; for (const l of this.links) l.visible = vis;
  }
  protected idlePose(dt: number, w: World) { this.approach(dt, w, 'swing'); this.vx = 0; }
  dispose() { super.dispose(); this.anchor.removeFromParent(); for (const l of this.links) l.removeFromParent(); }
}

// =========================================================================================== BRASS TITAN
const BT: Record<string, MoveDef> = {
  sweep: { id: 'sweep', windup: 0.9, active: 0.28, recover: 0.8, dmg: 2, kind: 'crush', knock: 8, hyper: true, guardDmg: 60 },
  stomp: { id: 'stomp', windup: 0.7, active: 0.18, recover: 0.7, dmg: 1.5, kind: 'crush', knock: 7, hyper: true },
  cannon: { id: 'cannon', windup: 1.1, active: 0.1, recover: 0.5, dmg: 2, tellAt: 0.3 },
  cannon2: { id: 'cannon2', windup: 0.55, active: 0.1, recover: 0.3, dmg: 1.5, tellAt: 0.25 },
  cannon3: { id: 'cannon3', windup: 0.55, active: 0.1, recover: 0.9, dmg: 1.5, tellAt: 0.25 },
  iceSpikes: { id: 'iceSpikes', windup: 1.05, active: 0.3, recover: 0.6, dmg: 2, unblockable: true, kind: 'spike', tell: 'none' },
  charge: { id: 'charge', windup: 0.8, active: 1.4, recover: 1.0, dmg: 2, kind: 'crush', knock: 10, guardDmg: 60, hyper: true },
};
/** ice crystals bursting from the seabed */
class IceSpikes implements Entity {
  kind = 'iceSpikes'; team: Team = 'neutral';
  x: number; y: number; vx = 0; vy = 0; r = 0; alive = true;
  obj = new THREE.Group();
  private t = 0; private spikes: THREE.Mesh[] = [];
  constructor(x: number, floor: number, private src: Entity, private dmg: number) {
    this.x = x; this.y = floor;
    const mat = kitMat('iceSpike', 16, 16, (px, py) => band([170, 226, 255], 0.8 + py / 30 + (px % 4 === 0 ? 0.15 : 0), px, py, 0.08), { rough: 0.2, emissive: 0.25 });
    for (let i = 0; i < 6; i++) {
      const h = 1.2 + Math.random() * 1.2;
      const m = new THREE.Mesh(new THREE.ConeGeometry(0.16 + Math.random() * 0.12, h, 5), mat);
      m.position.set((i - 2.5) * 0.3 + (Math.random() - 0.5) * 0.15, -h / 2, (Math.random() - 0.5) * 0.6);
      m.rotation.set((Math.random() - 0.5) * 0.4, Math.random() * 3, (Math.random() - 0.5) * 0.5);
      m.userData.h = h; m.castShadow = true;
      this.spikes.push(m); this.obj.add(m);
    }
    this.obj.position.set(x, floor, 0);
  }
  update(dt: number, w: World) {
    this.t += dt;
    const k = Math.min(1, this.t / 0.12);
    for (const m of this.spikes) m.position.y = -m.userData.h / 2 + m.userData.h * (k * 0.95) * (this.t > 1.4 ? Math.max(0, 1 - (this.t - 1.4) * 3) : 1);
    if (this.t < 0.02) { w.fx.emit('frost', this.x, this.y + 0.5, { n: 16, speed: 5, vy: 3 }); w.sfx('ice_big', this.x, 0.9); w.game.addShake(0.25); }
    if (this.t > 0.03 && this.t < 0.25) {
      const p = w.player;
      if (Math.abs(p.x - this.x) < 1.15 + p.r && p.y < this.y + 2.3) { attackPlayer(w, { src: this.src, dmg: this.dmg, x: this.x, y: this.y, kind: 'spike', unblockable: true, knock: 5, name: 'ice spikes' }); this.t = 0.25; }
    }
    if (this.t > 1.4 && this.t - dt <= 1.4) { w.sfx('ice', this.x, 0.6); w.fx.emit('frost', this.x, this.y + 1, { n: 12, speed: 3 }); }
    if (this.t > 1.8) this.alive = false;
  }
}
export class BrassTitan extends DiverBoss {
  cycles = [['sweep', 'cannon', 'stomp', 'sweep', 'iceSpikes'], ['cannon', 'sweep', 'iceSpikes', 'stomp', 'cannon'], ['charge', 'iceSpikes', 'cannon', 'sweep', 'iceSpikes', 'stomp']];
  moves = BT;
  private aimLine: AimLine | null = null;
  private lock = { x: 0, y: 0 };
  private chargeDir = 1;
  private spikeAt: number[] = [];
  private volley = false;
  constructor(arena: Arena, w: World) {
    super('brassTitan', arena, { name: 'THE BRASS TITAN', title: 'Iron Lung of the Floe', hp: 120, poise: 160, r: 1.5 }, 'titan', 'cannon', 1.35);
    this.aimLine = new AimLine(w.scene);
  }
  protected tellPoint() { const m = this.rig.muzzleWorld(_v); return { x: m.x, y: m.y }; }
  protected want(id: string, w: World) {
    const dx = Math.abs(w.player.x - this.x);
    if (id === 'cannon') return dx > 3;
    if (id === 'iceSpikes') return true;
    if (id === 'charge') return dx > 4;
    if (id === 'stomp') return dx < 2.4;
    return dx < 3;
  }
  protected approach(dt: number, w: World, next: string) {
    const p = w.player, side = Math.sign(this.x - p.x) || 1;
    const want = next === 'cannon' || next === 'charge' ? p.x + side * 6 : p.x + side * 2;
    this.walkTo(dt, want, 1.2 * this.core.speed);
    this.lean = damp(this.lean, 0, 5, dt);
    this.aimPt = null;
  }
  protected started(w: World, m: MoveDef) {
    const p = w.player;
    this.volley = this.phase >= 2 && m.id === 'cannon';
    if (m.id === 'cannon' || m.id === 'cannon2' || m.id === 'cannon3') { this.lock = { x: p.x, y: p.y }; w.sfx('k_tick', this.x, 0.6, 0.6); }
    if (m.id === 'iceSpikes') {
      const n = this.phase >= 2 ? 3 : 1;
      this.spikeAt = [];
      for (let i = 0; i < n; i++) this.spikeAt.push(clamp(p.x + (i - (n - 1) / 2) * 2.6, this.arena.x0 + 1, this.arena.x1 - 1));
      for (const x of this.spikeAt) dangerZone(w, x, this.arena.floor + 0.6, 1.25, m.windup / this.core.speed + 0.1, true);
      w.sfx('ice', this.x, 0.7, 0.6); w.sfx('grunt', this.x, 0.8, 0.5);
      glint(w, this.x, this.y + 2, { red: true, size: 1.3 });
    }
    if (m.id === 'charge') { this.chargeDir = Math.sign(p.x - this.x) || 1; w.sfx('roar', this.x, 0.7, 0.9); }
    if (m.id === 'sweep' || m.id === 'stomp') w.sfx('grunt', this.x, 0.7, 0.55);
  }
  protected run(dt: number, w: World) {
    const c = this.core, m = c.move!, ph = c.phase, k = c.k, f = this.facing, p = w.player, fl = this.arena.floor;
    if (m.id !== 'charge') this.vx = damp(this.vx, 0, 5, dt);
    if (!m.id.startsWith('cannon')) this.aimLine?.hide();
    switch (m.id) {
      case 'sweep': {
        const hy = this.y + 0.3;
        if (ph === 'windup') { this.aimPt = { x: this.x - f * 1.5, y: hy + 2.6 * Math.min(1, k * 1.4) }; this.lean = 0.25 * f * k; }
        else if (ph === 'active') {
          this.aimPt = { x: this.x + f * 3 * k, y: hy + 2.2 - 3.4 * k }; this.lean = -0.25 * f;
          if (c.justEntered('active')) { w.sfx('swish_c', this.x, 1, 0.45); this.vx = f * 1.5; }
          if ((p.x - this.x) * f > -0.5 && (p.x - this.x) * f < 3 && Math.abs(p.y - hy) < 2) c.strike(w, { x: this.x, y: hy });
        } else { this.aimPt = { x: this.x + f * 2.5, y: fl + 0.5 }; this.lean = -0.25 * f * (1 - k); }
        break;
      }
      case 'stomp': {
        if (ph === 'windup') { this.lean = 0.12 * f * k; this.aimPt = { x: this.x + f, y: this.y + 1.5 }; }
        if (c.justEntered('active')) {
          w.game.addShake(0.4); w.sfx('thud_heavy', this.x, 1, 0.45); w.fx.silt(this.x, fl + 0.1, 20); w.fx.shockwave(this.x, fl + 0.2, 1.8, '#c8f0ff');
          w.fx.emit('frost', this.x, fl + 0.3, { n: 14, speed: 4, vy: 2 });
        }
        if (ph === 'active' && Math.abs(p.x - this.x) < 2.4 && p.y < fl + 1.8) c.strike(w, { x: this.x, y: fl + 0.3 });
        break;
      }
      case 'cannon': case 'cannon2': case 'cannon3': {
        const mz = this.rig.muzzleWorld(_v);
        if (ph === 'windup') {
          if (k < 0.78) { this.lock.x = damp(this.lock.x, p.x, 8, dt); this.lock.y = damp(this.lock.y, p.y, 8, dt); }
          this.aimPt = { x: this.lock.x, y: this.lock.y };
          const dx = this.lock.x - mz.x, dy = this.lock.y - mz.y, l = Math.hypot(dx, dy) || 1;
          this.aimLine?.show(mz.x, mz.y, mz.x + (dx / l) * Math.min(16, l + 4), mz.y + (dy / l) * Math.min(16, l + 4), k, w.time);
        } else this.aimLine?.hide();
        if (c.justEntered('active')) {
          const ang = Math.atan2(this.lock.y - mz.y, this.lock.x - mz.x);
          w.add(new Bolt(mz.x, mz.y, Math.cos(ang) * 14, Math.sin(ang) * 14 + 0.4, m.dmg * c.dmgMul, this, 'bolt'));
          this.rig.play('fire', true); this.rig.loaded = true;
          w.fx.muzzle(mz.x, mz.y, ang, 1.4); w.sfx('thud_heavy', mz.x, 0.9, 0.6); w.game.addShake(0.15);
        }
        if (ph === 'recover' && k > 0.15 && this.volley && m.id !== 'cannon3') { c.start(m.id === 'cannon' ? BT.cannon2 : BT.cannon3); this.lock = { x: p.x, y: p.y }; }
        break;
      }
      case 'iceSpikes': {
        this.aimPt = { x: this.x + f * 0.5, y: fl - 1 };
        this.lean = ph === 'windup' ? -0.15 * f * k : 0.1 * f;
        if (c.justEntered('active')) for (const x of this.spikeAt) w.add(new IceSpikes(x, fl, this, m.dmg * c.dmgMul));
        break;
      }
      case 'charge': {
        if (ph === 'windup') { this.lean = -0.3 * this.chargeDir; this.aimPt = { x: this.x + this.chargeDir * 2, y: this.y }; }
        else if (ph === 'active') {
          this.vx = this.chargeDir * 7.5; this.x += this.vx * dt; this.lean = -0.35 * this.chargeDir;
          this.rig.facing = this.chargeDir as 1 | -1;
          if (Math.random() < dt * 20) w.fx.silt(this.x - this.chargeDir, fl + 0.1, 3);
          const r = this.hitCircle(w, this.x + this.chargeDir * 0.8, this.y, 1.3, { knock: 10 });
          if (r === 'parried') { c.cancel(); this.vx = 0; }
          if (this.x < this.arena.x0 + 1.3 || this.x > this.arena.x1 - 1.3) {
            this.x = clamp(this.x, this.arena.x0 + 1.3, this.arena.x1 - 1.3); this.vx = 0;
            w.game.addShake(0.5); w.sfx('rock_hit', this.x, 1, 0.5); w.sfx('clank', this.x, 1, 0.5);
            callout(w, 'STUNNED', this.x, this.y + 2.6, 'gold', 0.5);
            c.stagger(w, 2.2, 'broken');
          }
        } else this.vx = damp(this.vx, 0, 4, dt);
        break;
      }
    }
  }
  protected onPhase(_w: World, n: number) { if (n === 3) { this.core.speed = 1.18; this.core.dmgMul = 1.2; } }
  protected idlePose(dt: number) { this.vx = damp(this.vx, 0, 4, dt); this.aimPt = { x: this.x + this.facing * 2, y: this.y }; }
  dispose() { super.dispose(); this.aimLine?.dispose(); }
}
