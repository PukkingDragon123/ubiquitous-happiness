// What the humans shoot, throw and drop:
//   Harpoon      a speargun shaft (or the heavy diver's cannon bolt): fast, slowed by the water, sticks in rock
//                and the wreck; the blobfish's blade knocks it aside
//   ThrownNet    a weighted throw net that opens in flight; hits the blobfish -> NetSnare
//   NetSnare     the net wrapped round the blobfish: the thrower hauls on the line; escape by mashing dash /
//                attack or cutting the mesh with the sword; if he holds you long enough he bags you
//   DepthCharge  a hazard-striped barrel rolled off a boat: sinks, arms, blows at its set depth or on contact
//   Torpedo      the mini-sub's: runs straight, turns a little toward the blobfish, blows on contact
//   Flare        a red signal flare that rises to the surface and calls reinforcements
import * as THREE from 'three';
import type { Entity, World, Team, DamageKind } from '../game/types';
import type { Attacker } from './board';
import { board, creditHurt } from './board';
import { damageTarget } from './types';
import type { Target } from './types';
import { explosion, sparks, silt, bubbles, gore, flash } from './fx';
import { segDist } from '../core/math';
import { Loft, FULL } from '../gfx/loft';
import { kitMat, steelMat, rubberMat } from '../humans/diveGear';
import { band, hh, nz } from '../humans/fabric';

const _v = new THREE.Vector3();

/** hurt the player with kill credit */
export function hurtPlayer(w: World, dmg: number, x: number, y: number, kind: DamageKind, by: Attacker | null, how: string) {
  const p = w.player, before = p.hp ?? 0;
  w.hurtPlayer(dmg, x, y, kind);
  if ((p.hp ?? 0) < before) { creditHurt(w, by, how); return true; }
  return false;
}
/** push the player (soft force if the player has one, else an impulse) */
export function pullPlayer(w: World, fx: number, fy: number, dt: number) {
  const p = w.player as unknown as { applyForce?(x: number, y: number): void; extForce?: { x: number; y: number }; push(x: number, y: number): void };
  if (typeof p.applyForce === 'function') p.applyForce(fx, fy);
  else if (p.extForce) { p.extForce.x += fx; p.extForce.y += fy; }
  else p.push(fx * dt, fy * dt);
}

// ------------------------------------------------------------------ harpoon
let shaftGeo: THREE.BufferGeometry | null = null, boltGeo: THREE.BufferGeometry | null = null;
function shaft(big: boolean): THREE.Mesh {
  if (!(big ? boltGeo : shaftGeo)) {
    const B = new Loft(false);
    const L = big ? 1.3 : 1.0, r = big ? 0.018 : 0.008;
    B.tube([[0, 0, -L], [0, 0, 0]], () => r, 4, FULL, 1, { capStart: true });
    B.tube([[0, 0, 0], [0, 0, big ? 0.16 : 0.08]], (t) => r * 2.4 * (1 - t), 4, FULL, 2);
    B.box([0, r * 2, -0.06], [0.004, r * 2, 0.08], FULL, undefined, new THREE.Matrix4().makeRotationX(0.3));
    if (big) { boltGeo = B.build(); } else shaftGeo = B.build();
  }
  const m = new THREE.Mesh(big ? boltGeo! : shaftGeo!, steelMat([200, 204, 210], 0.3));
  m.castShadow = true;
  return m;
}

export class Harpoon implements Entity {
  kind = 'harpoon'; team: Team = 'neutral';
  x: number; y: number; vx: number; vy: number; r = 0.06; alive = true;
  obj: THREE.Mesh;
  private stuck = 0;
  private life = 0;
  private px: number; private py: number;
  constructor(x: number, y: number, vx: number, vy: number, public dmg: number, public owner: Attacker | null, public target: Target | null, public big = false) {
    this.x = this.px = x; this.y = this.py = y; this.vx = vx; this.vy = vy;
    this.obj = shaft(big);
    this.obj.position.set(x, y, 0.15);
  }
  update(dt: number, w: World) {
    this.life += dt;
    if (this.stuck > 0) {
      this.stuck += dt;
      if (this.stuck > 6) this.alive = false;
      return;
    }
    this.px = this.x; this.py = this.y;
    const sp = Math.hypot(this.vx, this.vy);
    const drag = Math.exp(-(this.big ? 0.35 : 0.6) * dt);
    this.vx *= drag; this.vy = this.vy * drag - (this.big ? 1.5 : 0.9) * dt;
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.obj.position.set(this.x, this.y, 0.15);
    this.obj.lookAt(_v.set(this.x + this.vx, this.y + this.vy, 0.15));
    if (Math.random() < dt * 20) bubbles(w, this.x - this.vx * 0.05, this.y - this.vy * 0.05, 1, 0.2);
    // hits: the blobfish along the swept segment, then the objective, then rock
    const p = w.player;
    if (p.alive && segDist(p.x, p.y, this.px, this.py, this.x, this.y).d < p.r + this.r) {
      if (hurtPlayer(w, this.dmg, this.px, this.py, 'spike', this.owner, this.big ? 'cannon' : 'harpoon')) {
        gore(w, p.x, p.y, 0.4, this.vx / sp, this.vy / sp);
        w.sfx('hit_squish1', p.x, 0.7);
        p.push(this.vx * 0.25, this.vy * 0.25);
        this.alive = false;
        return;
      }
    }
    const t = this.target;
    if (t && t !== (p as Entity) && t.alive && segDist(t.x, t.y, this.px, this.py, this.x, this.y).d < t.r) {
      damageTarget(t, this.dmg * 2, this.x, this.y, w, this.owner, 'spike');
      sparks(w, this.x, this.y, 6);
      w.sfx('rock_hit', this.x, 0.5, 1.4);
      this.stuck = 0.001;
      return;
    }
    if (w.terrain.sdf(this.x, this.y) < 0 || this.y < w.terrain.floorAt(this.x)) {
      silt(w, this.x, this.y, 5);
      w.sfx('rock_hit', this.x, 0.45, 1.6);
      this.stuck = 0.001;
      return;
    }
    if (this.life > 4 || sp < 1.2) this.alive = false;
  }
  /** the blade knocks the shaft aside */
  slash(ax: number, ay: number, bx: number, by: number, _dmg: number, w: World): boolean {
    if (this.stuck > 0) return false;
    if (segDist(this.x, this.y, ax, ay, bx, by).d > 0.3) return false;
    sparks(w, this.x, this.y, 10);
    w.sfx('sw_clang', this.x, 0.7);
    w.sfx('rock_hit', this.x, 0.4, 2);
    this.vx = -this.vx * 0.3 + (Math.random() - 0.5) * 3; this.vy = Math.abs(this.vy) * 0.3 + 2;
    this.dmg = 0; this.owner = null;
    w.emit('deflect', { x: this.x, y: this.y });
    return true;
  }
}

// ------------------------------------------------------------------ nets
let netTex: THREE.Material | null = null;
function netMat() {
  return (netTex ??= (() => {
    const m = kitMat('netDisc', 64, 64, (x, y) => {
      const d = Math.hypot(x - 31.5, y - 31.5) / 32;
      if (d > 1) return null;
      const a = (x + y) % 7, b = (x - y + 70) % 7;
      if (d > 0.9) return band([60, 56, 50], 0.9 + hh(x, y, 1) * 0.2, x, y); // the lead-line rim
      return a === 0 || b === 0 ? band([196, 186, 150], 0.85 + nz(x, y, 6, 2) * 0.3, x, y) : null;
    }, { rough: 0.9 }) as THREE.MeshStandardMaterial;
    m.alphaTest = 0.5; m.side = THREE.DoubleSide; m.transparent = false;
    return m;
  })());
}
let netGeo: THREE.BufferGeometry | null = null;
function netMesh(): THREE.Mesh {
  netGeo ??= new THREE.CircleGeometry(1, 10);
  const m = new THREE.Mesh(netGeo, netMat());
  return m;
}

export class ThrownNet implements Entity {
  kind = 'net'; team: Team = 'neutral';
  x: number; y: number; vx: number; vy: number; r = 0.3; alive = true;
  obj: THREE.Mesh;
  private open = 0;
  private life = 0;
  constructor(x: number, y: number, vx: number, vy: number, public owner: (Attacker & { haulPoint(out: THREE.Vector3): THREE.Vector3; alive: boolean; dead?: boolean }) | null, public strength: number) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.obj = netMesh();
    this.obj.position.set(x, y, 0.2);
  }
  update(dt: number, w: World) {
    this.life += dt;
    this.open = Math.min(1, this.open + dt * 2.2);
    const dr = Math.exp(-1.2 * dt);
    this.vx *= dr; this.vy = this.vy * dr - 1.2 * dt;
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.r = 0.25 + this.open * 0.75;
    this.obj.position.set(this.x, this.y, 0.2);
    this.obj.scale.setScalar(this.r);
    this.obj.rotation.set(0.3 + Math.sin(this.life * 5) * 0.3, Math.sin(this.life * 3) * 0.4, this.life * 2);
    const p = w.player;
    const bb = board(w);
    if (p.alive && !bb.netOn && Math.hypot(p.x - this.x, p.y - this.y) < this.r + p.r * 0.6 && p.invuln <= 0) {
      const snare = new NetSnare(this.owner, this.strength);
      w.add(snare);
      bb.netOn = snare;
      w.text.pop('NETTED!', p.x, p.y + 1.1, 'danger', { size: 0.5, life: 1.2 });
      w.sfx('net', p.x, 0.8);
      w.sfx('squeak', p.x, 0.6, 0.8);
      w.game.addShake(0.15);
      w.emit('netted', { by: this.owner?.callsign ?? '' });
      this.alive = false;
      return;
    }
    if (this.y < w.terrain.floorAt(this.x) + 0.1 || this.life > 3.2) { silt(w, this.x, this.y, 3); this.alive = false; }
  }
  slash(ax: number, ay: number, bx: number, by: number, _d: number, w: World): boolean {
    if (segDist(this.x, this.y, ax, ay, bx, by).d > this.r) return false;
    w.text.pop('SHRED', this.x, this.y + 0.4, 'hint', { size: 0.3 });
    w.fx.debrisBurst(this.x, this.y, 8, '#c4ba96', 3, 0.04);
    this.alive = false;
    return true;
  }
}

export class NetSnare implements Entity {
  kind = 'netSnare'; team: Team = 'neutral';
  x = 0; y = 0; vx = 0; vy = 0; r = 0.6; alive = true;
  obj = new THREE.Group();
  hp: number;
  private mesh: THREE.Mesh;
  private line: THREE.Line;
  private held = 0;
  private struggle = 0;
  private tick = 0;
  private wasHooked = false;
  private slack = 0;
  constructor(public owner: (Attacker & { haulPoint(out: THREE.Vector3): THREE.Vector3; alive: boolean; dead?: boolean }) | null, strength: number) {
    this.hp = 4 + strength * 2;
    this.mesh = netMesh();
    this.mesh.scale.setScalar(0.7);
    const lg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    this.line = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0xc8bc98 }));
    this.line.frustumCulled = false;
    this.obj.add(this.mesh, this.line);
  }
  get struggleNeed() { return 7 + this.hp; }
  update(dt: number, w: World) {
    const p = w.player as Entity & { hooked: boolean; push(x: number, y: number): void; struggleTap?: boolean; invuln: number };
    const bb = board(w);
    if (!p.alive) { this.release(w, false); return; }
    if (this.held === 0) { this.wasHooked = p.hooked; p.hooked = true; }
    this.held += dt;
    this.x = p.x; this.y = p.y;
    this.mesh.position.set(p.x, p.y, 0.35);
    this.mesh.rotation.set(Math.sin(this.held * 7) * 0.3, Math.cos(this.held * 5) * 0.3, this.held * 0.5);
    // the net drags: kill most of the player's speed
    pullPlayer(w, -p.vx * 6, -p.vy * 6, dt);
    // the thrower hauls on the line (if he's alive and still holding it)
    const o = this.owner;
    const holding = o && o.alive && !o.dead;
    if (holding) {
      const hp = o.haulPoint(_v);
      const dx = hp.x - p.x, dy = hp.y - p.y, l = Math.hypot(dx, dy) || 1;
      if (l > 1.2) pullPlayer(w, (dx / l) * 9, (dy / l) * 9, dt);
      (this.line.geometry.attributes.position as THREE.BufferAttribute).setXYZ(0, p.x, p.y, 0.3);
      (this.line.geometry.attributes.position as THREE.BufferAttribute).setXYZ(1, hp.x, hp.y, 0.3);
      this.line.geometry.attributes.position.needsUpdate = true;
      this.line.visible = true;
    } else { this.line.visible = false; this.slack += dt; }
    // struggling: mash dash / attack (works with the real blobfish or any player exposing input via game)
    const inp = w.game.input;
    if (inp.hit('dash') || inp.hit('attack')) {
      this.struggle += 1;
      p.push((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2);
      w.fx.debrisBurst(p.x, p.y, 2, '#c4ba96', 2, 0.03);
      if (this.struggle % 3 === 0) w.text.pop(['RIP', 'TEAR', 'WRIGGLE'][this.struggle % 3], p.x + (Math.random() - 0.5), p.y + 0.8, 'hint', { size: 0.26, life: 0.5 });
    }
    // squeezed: a little damage every few seconds; held too long = bagged (big hit + released)
    this.tick += dt;
    if (holding && this.tick > 3) { this.tick = 0; hurtPlayer(w, 1, p.x, p.y + 0.5, 'crush', o, 'net'); }
    if (holding && this.held > 9) {
      w.text.pop('BAGGED!', p.x, p.y + 1.2, 'danger', { size: 0.55 });
      p.invuln = 0;
      hurtPlayer(w, 2, p.x, p.y + 0.5, 'crush', o, 'bagged');
      w.emit('bagged', { by: o.callsign });
      this.release(w, false);
      return;
    }
    if (this.struggle >= this.struggleNeed || this.hp <= 0 || this.slack > 1.6) this.release(w, true);
    void bb;
  }
  /** the sword cuts the mesh */
  slash(ax: number, ay: number, bx: number, by: number, dmg: number, w: World): boolean {
    if (segDist(this.x, this.y, ax, ay, bx, by).d > this.r) return false;
    this.hp -= Math.max(1, dmg);
    w.fx.debrisBurst(this.x, this.y, 4, '#c4ba96', 3, 0.03);
    w.sfx('sw_slash', this.x, 0.4, 1.4);
    return true;
  }
  release(w: World, escaped: boolean) {
    if (!this.alive) return;
    this.alive = false;
    const p = w.player as Entity & { hooked: boolean };
    p.hooked = this.wasHooked && false;
    board(w).netOn = null;
    if (escaped) {
      w.text.pop('FREE!', p.x, p.y + 1, 'gold', { size: 0.42 });
      w.fx.debrisBurst(p.x, p.y, 14, '#c4ba96', 4, 0.04);
      w.sfx('pop', p.x, 0.6, 0.8);
      w.emit('netEscape', {});
    }
  }
  dispose(w: World) { if (board(w).netOn === this) board(w).netOn = null; }
}

// ------------------------------------------------------------------ depth charge
let barrelGeo: THREE.BufferGeometry | null = null;
function barrel(): THREE.Mesh {
  if (!barrelGeo) {
    const B = new Loft(false);
    B.tube([[0, -0.28, 0], [0, 0.28, 0]], (t) => 0.2 * (t < 0.1 || t > 0.9 ? 0.92 : 1), 8, FULL, 1, { capStart: true, capEnd: true });
    barrelGeo = B.build();
  }
  const m = new THREE.Mesh(barrelGeo, kitMat('dcharge', 32, 32, (x, y) => {
    if (y < 3 || y > 28) return band([60, 60, 64], 0.9 + (x & 1) * 0.1, x, y);
    const stripe = ((x + y) >> 2) & 1;
    let k = 0.9 + (nz(x, y, 5, 81) - 0.5) * 0.3;
    if (hh(x, y, 82) > 0.93) k -= 0.4;
    return band(y > 10 && y < 21 ? (stripe ? [230, 190, 30] : [24, 24, 26]) : [70, 76, 66], k, x, y);
  }, { rough: 0.6, metal: 0.4 }));
  m.castShadow = true;
  return m;
}

export class DepthCharge implements Entity {
  kind = 'depthCharge'; team: Team = 'neutral';
  x: number; y: number; vx = 0; vy = 0; r = 0.28; alive = true;
  obj: THREE.Mesh;
  hp = 3;
  private t = 0;
  private blink = 0;
  constructor(x: number, y: number, public fuseDepth: number, public owner: Attacker | null, public power = 1) {
    this.x = x; this.y = y;
    this.obj = barrel();
    this.obj.position.set(x, y, 0.1);
  }
  update(dt: number, w: World) {
    this.t += dt;
    const surf = w.water.heightAt(this.x);
    if (this.y > surf) this.vy -= 9.8 * dt;
    else { if (this.vy < -3) { this.vy = -2.4; w.fx.splash(this.x, 1.2); w.sfx('splash_b', this.x, 0.7); } this.vy += (-2.6 - this.vy) * (1 - Math.exp(-dt * 2)); }
    this.vx *= Math.exp(-dt);
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.obj.position.set(this.x, this.y, 0.1);
    this.obj.rotation.set(Math.sin(this.t * 2) * 0.3, this.t * 0.6, Math.sin(this.t * 1.3) * 0.5);
    if (this.y < surf && Math.random() < dt * 6) bubbles(w, this.x, this.y + 0.2, 1, 0.5);
    this.blink += dt;
    if (this.y < surf - 0.5 && this.blink > (this.y - this.fuseDepth < 1.5 ? 0.15 : 0.5)) { this.blink = 0; w.fx.emit('glow', this.x, this.y + 0.3, { n: 1, size: 0.25, life: 0.1, color: '#ff3020' }); w.sfx('k_pluck', this.x, 0.25, 2.2); }
    const p = w.player;
    const near = p.alive && Math.hypot(p.x - this.x, p.y - this.y) < 0.75;
    if (this.y <= this.fuseDepth || near || this.y < w.terrain.floorAt(this.x) + 0.3 || w.terrain.sdf(this.x, this.y) < 0.2) this.boom(w);
  }
  boom(w: World) {
    if (!this.alive) return;
    this.alive = false;
    const R = 2.6 * this.power;
    explosion(w, this.x, this.y, 1.1 * this.power);
    flash(w, this.x, this.y, '#ffd080', 10, 0.18);
    w.sfx('boom_uw', this.x, 0.9); w.sfx('rock_hit', this.x, 0.6, 0.5);
    w.game.addShake(0.35);
    w.water.disturb?.(this.x, 2.5 * this.power, 1.2);
    w.emit('explosion', { x: this.x, y: this.y, r: R });
    const p = w.player;
    const d = Math.hypot(p.x - this.x, p.y - this.y);
    if (p.alive && d < R) {
      hurtPlayer(w, d < R * 0.5 ? 2 : 1, this.x, this.y, 'explosion', this.owner, 'depth charge');
      const k = (1 - d / R) * 14;
      p.push(((p.x - this.x) / (d || 1)) * k, ((p.y - this.y) / (d || 1)) * k);
    }
    // everything else in the blast: divers too (friendly fire), the wreck, fish
    for (const e of w.near(this.x, this.y, R)) {
      if (e === (this as Entity) || e === (p as Entity) || !e.hit) continue;
      const dd = Math.hypot(e.x - this.x, e.y - this.y);
      e.hit(Math.round(4 * this.power * (1 - dd / (R + e.r)) + 1), (e.x - this.x) / (dd || 1), (e.y - this.y) / (dd || 1), w, this.owner, 'explosion');
    }
  }
  hit(_d: number, dx: number, dy: number, w: World): boolean {
    this.vx += dx * 4; this.vy += dy * 2;
    this.hp -= 1;
    sparks(w, this.x, this.y, 6);
    w.sfx('sw_clang', this.x, 0.5);
    if (this.hp <= 0) this.boom(w);
    return true;
  }
}

// ------------------------------------------------------------------ torpedo
let torpGeo: THREE.BufferGeometry | null = null;
export class Torpedo implements Entity {
  kind = 'torpedo'; team: Team = 'neutral';
  x: number; y: number; vx: number; vy: number; r = 0.2; alive = true;
  obj: THREE.Mesh;
  hp = 2;
  private t = 0;
  constructor(x: number, y: number, public ang: number, public owner: Attacker | null, public speed = 7, public turn = 0.9) {
    this.x = x; this.y = y; this.vx = Math.cos(ang) * speed; this.vy = Math.sin(ang) * speed;
    if (!torpGeo) {
      const B = new Loft(false);
      B.tube([[0, 0, -0.6], [0, 0, 0.4], [0, 0, 0.55]], (t) => (t > 0.85 ? 0.11 * (1 - (t - 0.85) / 0.15 * 0.8) : 0.11), 6, FULL, 1, { capStart: true, capEnd: true });
      for (const a of [0, Math.PI / 2]) B.box([0, 0, -0.55], [0.36, 0.02, 0.12], FULL, undefined, new THREE.Matrix4().makeRotationZ(a));
      torpGeo = B.build();
    }
    this.obj = new THREE.Mesh(torpGeo, kitMat('torp', 32, 16, (x, y) => band(x > 26 ? [200, 60, 30] : [70, 78, 70], 0.85 + y / 50 + (hh(x, y, 83) > 0.95 ? -0.3 : 0), x, y), { rough: 0.5, metal: 0.5 }));
    this.obj.castShadow = true;
  }
  update(dt: number, w: World) {
    this.t += dt;
    const p = w.player;
    if (p.alive && this.t > 0.4) {
      const want = Math.atan2(p.y - this.y, p.x - this.x);
      let d = want - this.ang; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      this.ang += Math.max(-this.turn * dt, Math.min(this.turn * dt, d));
    }
    this.vx = Math.cos(this.ang) * this.speed; this.vy = Math.sin(this.ang) * this.speed;
    this.x += this.vx * dt; this.y = Math.min(this.y + this.vy * dt, w.water.heightAt(this.x) - 0.3);
    this.obj.position.set(this.x, this.y, 0.1);
    this.obj.rotation.set(0, 0, 0);
    this.obj.lookAt(_v.set(this.x + this.vx, this.y + this.vy, 0.1));
    if (Math.random() < dt * 30) bubbles(w, this.x - Math.cos(this.ang) * 0.6, this.y - Math.sin(this.ang) * 0.6, 1, 0.2);
    const hitP = p.alive && Math.hypot(p.x - this.x, p.y - this.y) < p.r + this.r;
    if (hitP || w.terrain.sdf(this.x, this.y) < 0.1 || this.t > 7) this.boom(w);
  }
  boom(w: World) {
    if (!this.alive) return;
    this.alive = false;
    explosion(w, this.x, this.y, 0.9);
    w.sfx('boom_uw', this.x, 0.8);
    w.game.addShake(0.25);
    w.emit('explosion', { x: this.x, y: this.y, r: 2 });
    const p = w.player, d = Math.hypot(p.x - this.x, p.y - this.y);
    if (p.alive && d < 2) { hurtPlayer(w, 2, this.x, this.y, 'explosion', this.owner, 'torpedo'); p.push(((p.x - this.x) / (d || 1)) * 10, ((p.y - this.y) / (d || 1)) * 10); }
    for (const e of w.near(this.x, this.y, 2)) if (e !== (this as Entity) && e !== (p as Entity) && e.hit) e.hit(3, Math.sign(e.x - this.x), 0.3, w, this.owner, 'explosion');
  }
  hit(_d: number, dx: number, _dy: number, w: World): boolean {
    this.hp -= 1; this.ang += dx * 0.8;
    sparks(w, this.x, this.y, 6);
    if (this.hp <= 0) this.boom(w);
    return true;
  }
}

// ------------------------------------------------------------------ flare
export class Flare implements Entity {
  kind = 'flare'; team: Team = 'neutral';
  x: number; y: number; vx: number; vy: number; r = 0.1; alive = true;
  obj = new THREE.Group();
  private t = 0;
  constructor(x: number, y: number, public squad: number, public onSurface?: (x: number) => void) {
    this.x = x; this.y = y; this.vx = (Math.random() - 0.5) * 0.6; this.vy = 6;
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.07, 0), new THREE.MeshBasicMaterial({ color: 0xff4020 }));
    this.obj.add(m);
  }
  update(dt: number, w: World) {
    this.t += dt;
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.vy = Math.max(3.2, this.vy - dt * 2);
    this.obj.position.set(this.x, this.y, 0.2);
    w.fx.emit('glow', this.x, this.y, { n: 1, size: 0.9, life: 0.15, color: '#ff5030' });
    if (Math.random() < dt * 30) w.fx.emit('ember', this.x, this.y, { n: 1, speed: 0.6, life: 0.6, color: '#ff8040' });
    if (Math.random() < dt * 20) bubbles(w, this.x, this.y, 1, 0.8);
    if (this.y > w.water.heightAt(this.x)) {
      this.alive = false;
      w.fx.splash(this.x, 0.6);
      for (let i = 0; i < 4; i++) w.fx.emit('glow', this.x, this.y + 1 + i * 0.8, { n: 1, size: 1.4, life: 1.2, color: '#ff4020', vy: 1.5 });
      w.sfx('thunder', this.x, 0.7);
      board(w).flares.push({ x: this.x, t: board(w).time, squad: this.squad });
      w.emit('flare', { x: this.x });
      this.onSurface?.(this.x);
    }
  }
}
export { rubberMat };
