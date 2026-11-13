// Submersibles. The mini-sub: a yellow two-man research sub turned hunter — a faceted hull, a bubble canopy
// with the pilot inside, thrusters, a headlight; it keeps its distance and fires homing torpedoes. The boss:
// Captain Gaff's black attack sub — twice the size, a torpedo salvo, a forward harpoon cannon, an airlock that
// spits divers out, and when it's hurt it rams. The captain himself sits behind the cockpit glass.
import * as THREE from 'three';
import type { Entity, World, Team, DamageKind } from '../game/types';
import { makeFisherman } from '../humans';
import type { Fisherman } from '../humans';
import type { Attacker } from './board';
import { Torpedo, Harpoon, hurtPlayer } from './projectiles';
import { explosion, bubbles, sparks, gore, flash } from './fx';
import { bark } from './barks';
import { Loft, usFor, FULL } from '../gfx/loft';
import { ellRing } from '../humans/rig';
import { kitMat, steelMat } from '../humans/diveGear';
import { band, hh, nz } from '../humans/fabric';
import { mix } from '../gfx/px';
import type { RGB } from '../gfx/px';
import { clamp, damp } from '../core/math';

const _v = new THREE.Vector3();
const ddxFar = (a: number, b: number) => a - b;

function hullMat(c: RGB, boss: boolean) {
  return kitMat('subhull' + c.join(',') + boss, 64, 32, (x, y) => {
    let k = 0.82 + (y / 32) * 0.3;
    if (y % 8 === 0 || x % 16 === 0) k -= 0.18;                     // plate seams
    if ((x % 16 === 3 || x % 16 === 12) && y % 8 === 4) k += 0.35;  // rivets
    if (nz(x * 0.5, y * 0.5, 16, 61) > 0.7) k -= 0.15;              // grime streaks
    const rust = nz(x * 0.5, y * 0.5, 12, 62) > (boss ? 0.68 : 0.78);
    let col = rust ? mix(c, [110, 60, 30], 0.6) : c;
    // a stripe down each flank and a row of lit portholes
    if ((x >= 13 && x <= 15) || (x >= 49 && x <= 51)) col = boss ? [170, 30, 26] : [30, 30, 34];
    if ((x === 18 || x === 19 || x === 45 || x === 46) && y % 8 >= 3 && y % 8 <= 4 && y > 8 && y < 26) return [255, 220, 120];
    return band(col, k, x, y, 0.1);
  }, { rough: 0.55, metal: 0.45, emissive: 0.22 });
}
const glass = () => kitMat('subglass', 8, 8, (x, y) => (x + y === 5 ? [230, 250, 255] : [90, 150, 160]), { rough: 0.05, metal: 0.3, emissive: 0.5, transparent: 0.3 });

function buildSub(boss: boolean): { group: THREE.Group; prop: THREE.Object3D; seat: THREE.Object3D; lamp: THREE.Mesh; muzzle: THREE.Object3D } {
  const s = boss ? 2.1 : 1;
  const g = new THREE.Group();
  const B = new Loft(false);
  // hull: a faceted capsule along +x, flattened belly
  const xs = [-1.5, -1.3, -0.8, 0, 0.7, 1.2, 1.45];
  const rr = [0.15, 0.45, 0.62, 0.66, 0.6, 0.42, 0.12];
  const rings = xs.map((x, i) => ({ pts: ellRing(0, 0, 0, rr[i] * s, rr[i] * s, rr[i] * s * 0.8, 8, 2.2, 1).map(([a, , c]) => [x * s, a, c] as [number, number, number]), v: i / (xs.length - 1) }));
  // ellRing builds rings round y; remap so the hull runs along x: (x', y', z') = (x, ringX, ringZ)
  B.loft(rings, usFor(8), FULL, 1, { start: [-1.6 * s, 0, 0], end: [1.55 * s, 0, 0] });
  const col: RGB = boss ? [74, 78, 86] : [222, 176, 36];
  const hull = new THREE.Mesh(B.build(), hullMat(col, boss));
  hull.castShadow = true;
  g.add(hull);
  // conning tower / fin, tail planes, skids
  const T = new Loft(false);
  T.box([-0.1 * s, 0.7 * s, 0], [0.8 * s, 0.35 * s, 0.4 * s], FULL);
  T.box([-1.45 * s, 0, 0], [0.3 * s, 0.9 * s, 0.05 * s], FULL);
  T.box([-1.45 * s, 0, 0], [0.3 * s, 0.05 * s, 0.9 * s], FULL);
  T.box([0, -0.68 * s, 0.3 * s], [1.6 * s, 0.06 * s, 0.08 * s], FULL);
  T.box([0, -0.68 * s, -0.3 * s], [1.6 * s, 0.06 * s, 0.08 * s], FULL);
  if (boss) { T.box([1.2 * s, -0.25 * s, 0], [0.6 * s, 0.14 * s, 0.14 * s], FULL); T.box([0.3 * s, 0.95 * s, 0], [0.08 * s, 0.4 * s, 0.08 * s], FULL); }
  const fins = new THREE.Mesh(T.build(), hullMat(boss ? [26, 26, 30] : [60, 64, 70], boss));
  fins.castShadow = true;
  g.add(fins);
  // canopy bubble at the nose with the pilot seat inside
  const canopy = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42 * s, 1), glass());
  canopy.position.set(0.95 * s, 0.22 * s, 0);
  canopy.scale.set(1, 0.85, 1.05);
  canopy.renderOrder = 3;
  g.add(canopy);
  const seat = new THREE.Object3D();
  seat.position.set(0.85 * s, -0.25 * s, 0);
  g.add(seat);
  // propeller
  const P = new Loft(false);
  for (let i = 0; i < 3; i++) P.box([0, 0, 0], [0.04 * s, 0.5 * s, 0.1 * s], FULL, undefined, new THREE.Matrix4().makeRotationX((i / 3) * Math.PI * 2).multiply(new THREE.Matrix4().makeTranslation(0, 0.22 * s, 0)));
  const prop = new THREE.Mesh(P.build(), steelMat([150, 140, 110]));
  prop.position.set(-1.68 * s, 0, 0);
  g.add(prop);
  // headlight
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.1 * s, 0.12 * s, 0.1 * s, 8), new THREE.MeshBasicMaterial({ color: 0xfff2c0 }));
  lamp.rotation.z = Math.PI / 2;
  lamp.position.set(1.42 * s, -0.25 * s, 0.25 * s);
  g.add(lamp);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(1.6 * s, -0.25 * s, 0);
  g.add(muzzle);
  return { group: g, prop, seat, lamp, muzzle };
}

export class MiniSub implements Entity, Attacker {
  kind = 'sub'; team: Team = 'enemy';
  x: number; y: number; vx = 0; vy = 0; r: number; alive = true;
  hp: number; maxHp: number;
  obj = new THREE.Group();
  callsign: string;
  nemesisId?: string;
  isBoss: boolean; bossName?: string;
  pilot: Fisherman | null = null;
  onDeath?: (s: MiniSub, w: World) => void;
  /** boss: an airlock spits a diver out at (x, y) */
  onDeploy?: (x: number, y: number) => void;
  private parts: ReturnType<typeof buildSub>;
  private facing = 1;
  private cool = 3;
  private deployCd = 8;
  private ramT = 0;
  private t = 0;
  private dying = 0;
  private hullTilt = 0;

  constructor(x: number, y: number, public iq = 0.5, boss = false, hpMul = 1) {
    this.x = x; this.y = y;
    this.isBoss = boss;
    this.parts = buildSub(boss);
    this.obj.add(this.parts.group);
    this.r = boss ? 2.4 : 1.15;
    this.maxHp = this.hp = Math.round((boss ? 140 : 30) * hpMul);
    this.callsign = boss ? 'Captain Gaff' : 'the sub pilot';
    if (boss) this.bossName = "Captain Gaff's Sub";
    const f = makeFisherman(boss ? 'captainGaff' : 'proAngler', boss ? 1 : 5);
    f.setSeating('sit');
    f.group.scale.setScalar(boss ? 1.1 : 0.9);
    f.group.rotation.y = Math.PI / 2;
    this.parts.seat.add(f.group);
    this.pilot = f;
  }

  update(dt: number, w: World) {
    this.t += dt;
    const p = w.player;
    if (this.dying > 0) { this.sink(dt, w); return; }
    // ---- hold station at a stand-off range on the blobfish's level, ram when hurt (boss)
    const want = this.isBoss ? 8 : 6.5;
    const dx = p.x - this.x, dy = p.y - this.y;
    if (Math.abs(dx) > 1) this.facing = Math.sign(dx);
    let tx = p.x - this.facing * want, ty = clamp(p.y + 0.5, w.terrain.floorAt(this.x) + this.r + 0.4, w.water.heightAt(this.x) - this.r - 0.6);
    this.ramT -= dt;
    if (this.isBoss && this.hp < this.maxHp * 0.5 && this.ramT < -6) { this.ramT = 2.2; bark(w, ['RAMMING SPEED!', 'Hold on to something, fish!'], this.x, this.y + 1.5, { force: true, style: 'danger' }); }
    if (this.ramT > 0) { tx = p.x + this.facing * 2; ty = p.y; }
    // cruise in fast from far away, then hold station slowly
    const far = Math.abs(ddxFar(this.x, p.x)) > 14 ? 2.2 : 1;
    const sp = (this.ramT > 0 ? 7 : this.isBoss ? 1.8 : 2.2) * (this.ramT > 0 ? 1 : far);
    const ddx = tx - this.x, ddy = ty - this.y, dd = Math.hypot(ddx, ddy) || 1;
    this.vx = damp(this.vx, (ddx / dd) * sp * Math.min(1, dd / 2), 1.2, dt);
    this.vy = damp(this.vy, (ddy / dd) * sp * Math.min(1, dd / 2), 1.2, dt);
    this.x += this.vx * dt; this.y += this.vy * dt;
    const sdf = w.terrain.sdf(this.x, this.y);
    if (sdf < this.r) { const n = w.terrain.normal(this.x, this.y); this.x += n.x * (this.r - sdf); this.y += n.y * (this.r - sdf); }
    // ram hits
    if (this.ramT > 0 && Math.hypot(dx, dy) < this.r + p.r) { if (hurtPlayer(w, 2, this.x, this.y, 'crush', this, 'rammed')) { p.push(this.facing * 12, 3); w.game.addShake(0.4); } }
    // ---- weapons
    this.cool -= dt;
    const inFront = Math.sign(dx) === this.facing && Math.abs(dy) < 4 && Math.abs(dx) < 14;
    if (this.cool <= 0 && inFront && p.alive) {
      this.parts.muzzle.getWorldPosition(_v);
      if (this.isBoss && Math.random() < 0.45) {
        // forward harpoon cannon
        const ang = Math.atan2(p.y - _v.y, p.x - _v.x);
        w.add(new Harpoon(_v.x, _v.y, Math.cos(ang) * 15, Math.sin(ang) * 15, 2, this, null, true));
        w.sfx('thud_heavy', _v.x, 0.8, 0.6);
        this.cool = 1.4;
      } else {
        const n = this.isBoss ? 3 : 1;
        for (let i = 0; i < n; i++) w.add(new Torpedo(_v.x, _v.y + (i - (n - 1) / 2) * 0.5, this.facing > 0 ? (i - (n - 1) / 2) * 0.15 : Math.PI - (i - (n - 1) / 2) * 0.15, this, this.isBoss ? 6.5 : 6, 0.6 + this.iq * 0.6));
        w.sfx('swish_c', _v.x, 0.7, 0.6);
        bubbles(w, _v.x, _v.y, 10, 0.8);
        this.cool = (this.isBoss ? 3.2 : 4.5) - this.iq;
      }
    }
    if (this.isBoss) {
      this.deployCd -= dt;
      if (this.deployCd <= 0) { this.deployCd = 14; this.onDeploy?.(this.x, this.y - this.r * 0.6); bark(w, ['Boarding party, out!', 'Get it, boys!', 'Airlock open!'], this.x, this.y + 1.6, { force: true, style: 'danger' }); }
    }
    // ---- visuals
    this.hullTilt = damp(this.hullTilt, clamp(this.vy * 0.12, -0.3, 0.3), 3, dt);
    const g = this.parts.group;
    g.rotation.set(0, this.facing > 0 ? 0 : Math.PI, this.hullTilt * this.facing);
    this.parts.prop.rotation.x += dt * (8 + Math.hypot(this.vx, this.vy) * 6);
    this.obj.position.set(this.x, this.y + Math.sin(this.t * 0.9) * 0.05, 0);
    if (Math.random() < dt * 8) { _v.set(-1.7 * (this.isBoss ? 2.1 : 1), 0, 0).applyMatrix4(g.matrixWorld); bubbles(w, _v.x, _v.y, 1, 0.4); }
    if (this.pilot) { this.pilot.lookAt(p.x, p.y); this.pilot.expression(this.hp < this.maxHp * 0.4 ? 'furious' : 'angry'); this.pilot.update(dt); }
    this.parts.lamp.visible = Math.sin(this.t * 13) > -0.95;
  }

  hit(dmg: number, dx: number, dy: number, w: World, _src: Entity | null, kind?: DamageKind): boolean {
    if (this.dying > 0) return false;
    this.hp -= dmg * (kind === 'explosion' ? 1.5 : 1);
    sparks(w, this.x - dx * this.r * 0.5, this.y - dy * this.r * 0.5, 8);
    w.sfx('sw_clang', this.x, 0.7); w.sfx('rock_hit', this.x, 0.4, 0.7);
    this.vx += dx * (this.isBoss ? 0.4 : 1.5);
    if (this.hp < this.maxHp * 0.5 && Math.random() < 0.3) bubbles(w, this.x, this.y, 6, 1.4);
    if (this.hp <= 0) this.die(w);
    return true;
  }
  private die(w: World) {
    this.dying = 0.001;
    this.team = 'neutral';
    explosion(w, this.x, this.y, this.isBoss ? 2.2 : 1.3);
    flash(w, this.x, this.y, '#ffc080', 14, 0.25);
    w.sfx('boom_uw', this.x, 1); w.game.addShake(this.isBoss ? 0.7 : 0.35);
    gore(w, this.x + 0.8 * this.facing, this.y, 1.2);
    w.emit('kill', { kind: this.isBoss ? 'boss:captain' : 'sub', x: this.x, y: this.y });
    w.emit('explosion', { x: this.x, y: this.y, r: this.r * 2 });
    w.drop(this.x, this.y, { coins: this.isBoss ? 80 : 12, item: this.isBoss ? 'harpoonTip' : 'scrap' });
    if (this.isBoss) w.drop(this.x + 0.5, this.y, { item: 'doubloon' });
    if (this.pilot) this.pilot.play('snapFall');
    this.onDeath?.(this, w);
  }
  private sink(dt: number, w: World) {
    this.dying += dt;
    this.vy -= dt * 1.5; this.vx *= Math.exp(-dt);
    this.x += this.vx * dt; this.y += this.vy * dt;
    const fl = w.terrain.floorAt(this.x) + this.r * 0.5;
    if (this.y < fl) { this.y = fl; this.vy = 0; }
    this.parts.group.rotation.z += dt * 0.3;
    this.obj.position.set(this.x, this.y, 0);
    if (Math.random() < dt * 20) bubbles(w, this.x + (Math.random() - 0.5) * this.r, this.y + 0.3, 2, 1.2);
    if (this.dying > 2 && this.dying < 2.1) explosion(w, this.x, this.y, 0.6);
    if (this.dying > 30) this.alive = false;
  }
  dispose() { this.pilot?.dispose(); }
}
