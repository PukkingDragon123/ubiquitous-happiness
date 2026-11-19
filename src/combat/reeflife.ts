// v4 sea life for the fish-first early water (on the souls kit, see sealife.ts Foe):
//   lionfish   hovers with its fans spread; a spine RAM (white, parryable) and a VENOM VOLLEY (red: a fan of
//              venom spines, dodge it); venom stings on for a couple of ticks
//   stonefish  lies buried in the seabed looking like a rock (a faint lump, a little silt); come close and it
//              ERUPTS in a snapping lunge (white glint + a silt puff first); it then sits exposed (takes extra
//              damage) before it shuffles off and buries itself again
//   mantis     a jewel-bright mantis shrimp hopping on the seabed: a lightning PUNCH (white, very fast, huge
//              knockback, a cavitation pop) and a RED long punch whose shockwave reaches far
import * as THREE from 'three';
import type { World, Entity, Team, DamageKind } from '../game/types';
import type { MoveDef } from './core';
import { Foe, type FoeOpts } from './sealife';
import { sfx, SND } from '../creatures/base';
import { attackPlayer } from './resolve';
import { callout } from './feel';
void callout;
import { kitMat } from '../humans/diveGear';
import { band, nz } from '../humans/fabric';
import { clamp, damp, segDist } from '../core/math';

const R = (a: number, b: number) => a + Math.random() * (b - a);

/** venom: a couple of extra stings after a spine lands */
class Venom implements Entity {
  kind = 'venom'; team: Team = 'neutral'; x = 0; y = 0; vx = 0; vy = 0; r = 0; alive = true;
  private t = 0; private n = 0;
  constructor(private ticks: number) {}
  update(dt: number, w: World) {
    this.t += dt;
    const p = w.player;
    if (!p.alive) { this.alive = false; return; }
    if (Math.random() < dt * 8) w.fx.emit('poison', p.x + R(-0.3, 0.3), p.y + R(-0.2, 0.3), { n: 1 });
    if (this.t > 1.05 * (this.n + 1)) {
      this.n++;
      p.invuln = 0;
      w.hurtPlayer(0.5, p.x, p.y + 0.4, 'spike');
      w.text.pop('VENOM', p.x, p.y + 0.9, 'magic', { size: 0.26, life: 0.7 });
      if (this.n >= this.ticks) this.alive = false;
    }
  }
}
export function venom(w: World, ticks = 2) { w.add(new Venom(ticks)); }

// =========================================================================================== lionfish
const L_RAM: MoveDef = { id: 'ram', windup: 0.6, active: 0.24, recover: 0.6, dmg: 1, kind: 'spike', knock: 4 };
const L_VOLLEY: MoveDef = { id: 'volley', windup: 0.85, active: 0.1, recover: 0.8, dmg: 1, unblockable: true, kind: 'spike', tellAt: 0.4 };
let spineGeo: THREE.BufferGeometry | null = null;
/** a venom spine fired by the lionfish volley (red: unblockable) */
class Spine implements Entity {
  kind = 'spine'; team: Team = 'neutral';
  x: number; y: number; vx: number; vy: number; r = 0.08; alive = true;
  obj: THREE.Mesh;
  private t = 0; private px: number; private py: number;
  constructor(x: number, y: number, ang: number, private src: Entity) {
    this.x = this.px = x; this.y = this.py = y; this.vx = Math.cos(ang) * 9; this.vy = Math.sin(ang) * 9;
    spineGeo ??= (() => { const g = new THREE.ConeGeometry(0.035, 0.42, 4); g.rotateZ(-Math.PI / 2); return g; })();
    this.obj = new THREE.Mesh(spineGeo, kitMat('lionSpine', 8, 16, (_x, y) => band(y < 8 ? [200, 40, 30] : [240, 228, 210], 1, _x, y), { rough: 0.5 }));
    this.obj.position.set(x, y, 0.2);
  }
  update(dt: number, w: World) {
    this.t += dt;
    this.px = this.x; this.py = this.y;
    this.vx *= Math.exp(-0.8 * dt); this.vy *= Math.exp(-0.8 * dt);
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.obj.position.set(this.x, this.y, 0.2);
    this.obj.rotation.z = Math.atan2(this.vy, this.vx);
    if (Math.random() < dt * 12) w.fx.emit('poison', this.x, this.y, { n: 1, life: 0.4 });
    const p = w.player;
    if (p.alive && segDist(p.x, p.y, this.px, this.py, this.x, this.y).d < p.r + this.r) {
      const res = attackPlayer(w, { src: this.src, dmg: 1, x: this.px, y: this.py, kind: 'spike', unblockable: true, knock: 2, name: 'venom spine', projectile: this });
      if (res === 'hit') { venom(w, 2); this.alive = false; return; }
    }
    if (w.terrain.sdf(this.x, this.y) < 0 || this.t > 1.6 || Math.hypot(this.vx, this.vy) < 2) this.alive = false;
  }
}
export class CombatLionfish extends Foe {
  private dir = { x: 1, y: 0 };
  private fan = 0;
  constructor(x: number, y: number, o: FoeOpts = {}) {
    super('lionfish', 'lionfish', x, y, { ...o, hp: 5, poise: 12, scale: 2.6, speed: 1.6, r: 0.42, gore: '#f0c0a0' });
    this.sight = 6;
  }
  choose(w: World, d: number): MoveDef | null {
    void w;
    if (d > 6.5) return null;
    this.cd = R(1.1, 1.8) / this.core.speed;
    if (d < 2.4) return L_RAM;
    return Math.random() < (this.elite ? 0.6 : 0.45) ? L_VOLLEY : null;
  }
  onStart(w: World, m: MoveDef) { sfx(w, m.unblockable ? ['inflate1'] : SND.swish, this.x, 0.6, m.unblockable ? 1.4 : 1.2); }
  act(dt: number, w: World) {
    const c = this.core, p = w.player;
    const dx = p.x - this.x, dy = p.y - this.y, d = Math.hypot(dx, dy) || 1;
    this.fan = damp(this.fan, c.phase === 'windup' ? 1 : 0.4, 6, dt);
    if (c.phase === 'windup') {
      this.steer(-dx / d * 0.6, -dy / d * 0.4, 3, dt);
      if (c.k < 0.75) { this.dir.x = dx / d; this.dir.y = dy / d; }
      if (Math.floor(c.t * 10) % 2 === 0) this.model.flash(0.35, c.move?.unblockable ? '#ff3020' : '#ffffff');
      this.squash = -0.12 * c.k;
    } else if (c.phase === 'active') {
      if (c.is('ram')) {
        if (c.justEntered('active')) { this.vx = this.dir.x * 9; this.vy = this.dir.y * 9; }
        const r = this.bite(w, this.mouthX(), this.mouthY(), 0.55, { kind: 'spike' });
        if (r === 'hit') venom(w, 2);
      } else if (c.justEntered('active')) {
        // a fan of five venom spines toward the player
        const a0 = Math.atan2(this.dir.y, this.dir.x);
        for (let i = -2; i <= 2; i++) w.add(new Spine(this.x + this.dir.x * 0.4, this.y + 0.25, a0 + i * 0.2, this));
        sfx(w, ['swish_c', 'swish_a'], this.x, 0.8, 1.6);
        w.fx.emit('poison', this.x, this.y, { n: 8, spread: 0.3, speed: 1.5 });
      }
    } else if (c.phase === 'recover' || c.phase === 'stagger') { this.steer(0, 0, 1.6, dt); }
    else {
      // hover at a middle distance, a little above, fins spread
      this.seek(p.x - Math.sign(dx || 1) * 3, p.y + 0.8, this.speedMax, 1.2, dt, 1);
    }
    if (c.phase !== 'active') this.faceToward(dx, dt, 3);
    this.lookAtWorld(p.x, p.y);
    this.integrate(dt, c.phase === 'active' ? 1.5 : 1.2);
    this.inArena();
    this.pose(dt, Math.hypot(this.vx, this.vy) * 0.6 + 0.3 + this.fan * 0.6);
  }
  onHit(w: World) { if (Math.random() < 0.3) w.fx.emit('poison', this.x, this.y, { n: 4, spread: 0.2 }); }
}

// =========================================================================================== stonefish
const S_AMBUSH: MoveDef = { id: 'ambush', windup: 0.45, active: 0.24, recover: 1.5, dmg: 2, kind: 'bite', knock: 7, tellAt: 0.3 };
const S_SNAP: MoveDef = { id: 'snap', windup: 0.5, active: 0.18, recover: 0.9, dmg: 1.5, kind: 'bite', knock: 5 };
export class CombatStonefish extends Foe {
  /** 0 buried .. 1 out */
  private out = 0; private outT = 0;
  private exposed = 0;
  private settled = false;
  constructor(x: number, y: number, o: FoeOpts = {}) {
    super('stonefish', 'stonefish', x, y, { ...o, hp: 9, poise: 26, scale: 2.4, speed: 1.2, r: 0.5, gore: '#a08060' });
    this.sight = 3;
  }
  choose(w: World, d: number): MoveDef | null {
    const p = w.player;
    if (this.out < 0.3) return d < 2.8 && Math.abs(p.y - this.y) < 2.4 ? S_AMBUSH : null;
    this.cd = R(0.9, 1.4);
    return d < 2.2 ? S_SNAP : null;
  }
  onStart(w: World, m: MoveDef) {
    if (m.id === 'ambush') { w.fx.silt(this.x, this.floorY(w) + 0.1, 14); sfx(w, ['gravel1', 'uw_thud1'], this.x, 0.8, 0.8); }
    else sfx(w, ['gulp', 'gulp2'], this.x, 0.6, 1.1);
  }
  idle(dt: number, w: World) { this.act(dt, w); }
  act(dt: number, w: World) {
    const c = this.core, p = w.player;
    const fl = this.floorY(w);
    const dx = p.x - this.x, dy = p.y - this.y, d = Math.hypot(dx, dy) || 1;
    if (!this.settled) { this.vy -= 6 * dt; this.y += this.vy * dt; if (this.y <= fl + 0.22) { this.y = fl + 0.22; this.vy = 0; this.settled = true; } }
    this.exposed -= dt;
    if (c.phase === 'windup') { this.outT = c.is('ambush') ? 0.25 : 1; this.model.setJaw(0.3 + c.k * 0.8); if (Math.floor(c.t * 12) % 2) this.model.flash(0.3, '#ffffff'); this.faceToward(dx, dt, 12); }
    else if (c.phase === 'active') {
      this.outT = 1;
      if (c.justEntered('active')) { this.vx = clamp(dx, -2.5, 2.5) * 2.2; this.vy = clamp(dy + 0.6, -1, 2.5) * 2.2; sfx(w, ['chomp1', 'crunch1'], this.x, 1, 0.7); w.fx.silt(this.x, fl + 0.1, 10); w.game.addShake(0.12); }
      this.model.setJaw(c.k < 0.6 ? 1.2 : 0.1);
      this.bite(w, this.mouthX(), this.mouthY(), 0.6);
    } else if (c.phase === 'recover' || c.phase === 'stagger') {
      this.outT = 1; this.model.setJaw(0.2);
      if (c.justEntered('recover') && c.move?.id === 'ambush') { this.exposed = 2.2; callout(w, 'EXPOSED', this.x, this.y + 0.9, 'gold', 0.32); }
    } else {
      // idle: exposed for a while, then shuffle and bury again
      if (this.exposed > 0) { this.outT = 1; this.faceToward(dx, dt, 2); }
      else {
        this.outT = 0;
        if (this.out > 0.6 && Math.random() < dt * 3) w.fx.silt(this.x, fl + 0.1, 3);
      }
      if (this.out < 0.2 && Math.random() < dt * 0.4) w.fx.emit('dust', this.x + R(-0.4, 0.4), fl + 0.15, { n: 1, size: 0.3, life: 1.2, color: '#8a7656', alpha: 0.5 });
    }
    void d;
    this.out = damp(this.out, this.outT, c.phase === 'active' ? 14 : 3, dt);
    // gravity back to the floor; buried it sinks into the sand
    if (this.settled) {
      this.vy -= 7 * dt;
      this.vx *= Math.exp(-3 * dt);
      this.x += this.vx * dt; this.y += this.vy * dt;
      const rest = fl + 0.05 + this.out * 0.22;
      if (this.y < rest) { this.y = rest; this.vy = 0; }
    }
    this.inArena(0.4);
    // buried: dark, flat, still (a rock); out: full colour
    this.model.material.color.setScalar(0.55 + this.out * 0.45);
    this.pitchBias = 0;
    this.pose(dt, 0.15 + this.out * 0.3, false);
    this.obj.position.y = this.y - (1 - this.out) * 0.12;
    this.obj.scale.y *= 0.8 + this.out * 0.2;
  }
  hit(dmg: number, dirX: number, dirY: number, w: World, src: Entity | null, kind?: DamageKind): boolean {
    // found while buried: it bursts out at you
    if (this.out < 0.3 && this.core.phase === 'idle') { this.notice(w, 'hit'); this.cd = 0; }
    return super.hit(dmg * (this.exposed > 0 ? 1.3 : 1), dirX, dirY, w, src, kind);
  }
  get armoured() { return this.out < 0.3; }
}

// =========================================================================================== mantis shrimp
const M_PUNCH: MoveDef = { id: 'punch', windup: 0.5, active: 0.08, recover: 0.55, dmg: 1.5, kind: 'crush', knock: 10, guardDmg: 35 };
const M_PUNCH2: MoveDef = { id: 'punch2', windup: 0.28, active: 0.08, recover: 0.7, dmg: 1.5, kind: 'crush', knock: 10, guardDmg: 35 };
const M_CAVITY: MoveDef = { id: 'cavity', windup: 0.75, active: 0.12, recover: 0.9, dmg: 2, unblockable: true, kind: 'explosion', knock: 8, tellAt: 0.38 };

const shellPaint = () => kitMat('mantisShell', 32, 32, (x, y) => {
  const seg = (x >> 3) & 1;
  let c: [number, number, number] = y < 10 ? [40, 170, 120] : y < 22 ? [70, 200, 90] : [230, 120, 40];
  if (seg && y < 22) c = [30, 140, 150];
  if (x % 8 === 0) c = [20, 60, 50];
  if (y > 26) c = [240, 70, 60];
  return band(c, 0.9 + (nz(x, y, 6, 4) - 0.5) * 0.15 + (y < 3 ? 0.2 : 0), x, y, 0.06);
}, { rough: 0.35 });
const clubPaint = () => kitMat('mantisClub', 16, 16, (x, y) => band(x > 10 ? [250, 110, 160] : [240, 150, 40], 0.9 + (y < 4 ? 0.2 : 0), x, y, 0.08), { rough: 0.3 });
const eyePaint = () => kitMat('mantisEye', 16, 16, (x, y) => (y === 7 || y === 8 ? [20, 20, 24] : y < 7 ? [80, 200, 255] : [255, 210, 90]), { rough: 0.15, emissive: 0.3 });

/** the mantis shrimp mesh (nose +x): a jewel-bright segmented body, eye stalks, antennae and two folded clubs */
export function buildMantis(): { body: THREE.Group; clubs: THREE.Group[]; mats: THREE.MeshStandardMaterial[] } {
  const body = new THREE.Group(), clubs: THREE.Group[] = [], mats: THREE.MeshStandardMaterial[] = [];
  const self = { body, clubs, mats };
  // per-instance clones of the painted materials so the hit / tell flash is this shrimp's alone
  const S = (shellPaint() as THREE.MeshStandardMaterial).clone(), C = (clubPaint() as THREE.MeshStandardMaterial).clone(), E = eyePaint();
  S.emissive = new THREE.Color(0, 0, 0); C.emissive = new THREE.Color(0, 0, 0);
  mats.push(S, C);
  const mk = (g: THREE.BufferGeometry, m: THREE.Material, p: [number, number, number], s: [number, number, number], r: [number, number, number] = [0, 0, 0]) => { const me = new THREE.Mesh(g, m); me.position.set(...p); me.scale.set(...s); me.rotation.set(...r); me.castShadow = true; return me; };
  const seg = new THREE.OctahedronGeometry(1, 1);
  // six tapering segments, nose at +x, slightly arched; a tail fan
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    body.add(mk(seg, S, [0.42 - t * 0.85, 0.06 - Math.pow(t - 0.4, 2) * 0.25, 0], [0.12, 0.13 - t * 0.03, 0.15 - t * 0.04], [0, 0, -0.15 + t * 0.3]));
  }
  for (const s of [1, -1]) body.add(mk(new THREE.ConeGeometry(0.13, 0.28, 4), C, [-0.5, -0.05, s * 0.06], [1, 1, 0.3], [0, 0, Math.PI / 2 + s * 0.25]));
  // eyes on stalks
  for (const z of [0.05, -0.05]) {
    body.add(mk(new THREE.CylinderGeometry(0.015, 0.02, 0.14, 4), S, [0.52, 0.17, z], [1, 1, 1], [0, 0, -0.4]));
    body.add(mk(new THREE.IcosahedronGeometry(0.05, 1), E, [0.56, 0.25, z], [1, 1.3, 1]));
  }
  // antennae
  for (const z of [0.04, -0.04]) body.add(mk(new THREE.CylinderGeometry(0.006, 0.01, 0.5, 3), C, [0.72, 0.22, z], [1, 1, 1], [0, 0, -1.0]));
  // the raptorial clubs, folded under the head (animated)
  for (const z of [0.09, -0.09]) {
    const g = new THREE.Group(); g.position.set(0.42, -0.08, z);
    g.add(mk(new THREE.BoxGeometry(0.22, 0.05, 0.05), S, [0.1, 0, 0], [1, 1, 1]));
    const fore = new THREE.Group(); fore.position.set(0.2, 0, 0);
    fore.add(mk(new THREE.IcosahedronGeometry(0.06, 0), C, [0.1, 0, 0], [1.6, 1, 1]));
    g.add(fore);
    body.add(g); clubs.push(g);
  }
  // little walking legs
  for (let i = 0; i < 3; i++) for (const z of [0.07, -0.07]) body.add(mk(new THREE.CylinderGeometry(0.01, 0.012, 0.16, 3), C, [0.05 - i * 0.12, -0.15, z], [1, 1, 1], [z > 0 ? 0.3 : -0.3, 0, 0.2]));
  body.scale.setScalar(1.45);
  return self;
}

export class CombatMantis extends Foe {
  private body!: THREE.Group;
  private clubs: THREE.Group[] = [];
  private hop = 0; private onGround = true;
  private arm = 0; private armT = 0;
  private combo = 0;
  constructor(x: number, y: number, o: FoeOpts = {}) {
    super('mantis', 'triggerfish', x, y, { ...o, hp: 6, poise: 16, scale: 1, speed: 2.4, r: 0.4, gore: '#60d090' });
    this.model.group.visible = false;   // the fish rig is unused: the shrimp is its own mesh
    this.sight = 5;
    this.build();
    this.pivot.add(this.body);
  }
  private mats: THREE.MeshStandardMaterial[] = [];
  private build() {
    const m = buildMantis();
    this.body = m.body; this.clubs = m.clubs; this.mats = m.mats;
  }
  facingDir() { return this.facing >= 0 ? 1 : -1; }
  mouthX() { return this.x + this.facing * 0.85; }
  mouthY() { return this.y; }
  choose(w: World, d: number): MoveDef | null {
    const p = w.player;
    if (Math.abs(p.y - this.y) > 2.2) return null;
    this.cd = R(0.7, 1.3) / this.core.speed;
    if (d < 1.9) { this.combo = this.elite ? 1 : 0; return M_PUNCH; }
    if (d < 3.4 && Math.random() < 0.4) return M_CAVITY;
    return null;
  }
  onStart(w: World, m: MoveDef) { sfx(w, ['click1', 'crab_click1'], this.x, 0.9, m.unblockable ? 0.8 : 1.6); }
  idle(dt: number, w: World) {
    this.patrolPh += dt * 0.4;
    this.walk(dt, w, this.returning ? this.home.x : this.home.x + Math.sin(this.patrolPh) * 2.5, 0.6);
    if (this.returning && Math.abs(this.home.x - this.x) < 0.5) this.returning = false;
    this.armT = 0; this.place(dt);
  }
  private walk(dt: number, w: World, tx: number, k: number) {
    const fl = this.floorY(w);
    const dx = tx - this.x;
    if (this.onGround && Math.abs(dx) > 0.5 && this.hop <= 0 && this.stun <= 0) {
      // scuttle-hops along the seabed
      this.vx = Math.sign(dx) * this.speedMax * k * (1.2 + Math.random() * 0.4); this.vy = 1.6 + Math.random();
      this.onGround = false; this.hop = R(0.35, 0.6);
    }
    this.hop -= dt;
    this.vy -= 7 * dt;
    this.vx *= Math.exp(-(this.onGround ? 6 : 0.8) * dt);
    this.x += this.vx * dt; this.y += this.vy * dt;
    if (this.y <= fl + 0.22) { if (!this.onGround) w.fx.silt(this.x, fl + 0.05, 2); this.y = fl + 0.22; this.vy = 0; this.onGround = true; }
    if (Math.abs(dx) > 0.2) this.facing = dx > 0 ? 1 : -1;
    this.inArena(0.4);
  }
  act(dt: number, w: World) {
    const c = this.core, p = w.player;
    const dx = p.x - this.x;
    if (c.phase === 'idle') { this.walk(dt, w, p.x - Math.sign(dx || 1) * 1.4, 1); this.armT = 0; }
    else {
      this.facing = c.phase === 'windup' && c.k < 0.7 ? (dx >= 0 ? 1 : -1) : this.facing;
      this.vy -= 7 * dt; this.y += this.vy * dt; this.x += this.vx * dt; this.vx *= Math.exp(-4 * dt);
      const fl = this.floorY(w); if (this.y < fl + 0.22) { this.y = fl + 0.22; this.vy = 0; this.onGround = true; }
      this.inArena(0.4);
    }
    if (c.phase === 'windup') { this.armT = -0.6 * Math.min(1, c.k * 2); if (Math.floor(c.t * 12) % 2 === 0) this.flashT = 0.4; }
    else if (c.phase === 'active') {
      this.armT = 1; this.arm = 1;
      const reach = c.is('cavity') ? 2.8 : 1.5;
      const tx = this.x + this.facing * reach;
      if (c.justEntered('active')) {
        sfx(w, ['snap2', 'snap1'], this.x, 1, 0.8); w.game.addShake(0.12);
        // the cavitation pop: a flash + a ring of bubbles at the tip
        w.fx.emit('ring', tx, this.y + 0.05, { size: 0.2, size1: c.is('cavity') ? 1.8 : 0.9, life: 0.22, color: c.is('cavity') ? '#ffb0a0' : '#e0faff', add: true, spread: 0 });
        w.fx.emit('bubble', tx, this.y, { n: 10, spread: 0.2, speed: 2 });
        w.fx.light(tx, this.y, '#e0f8ff', 4, 0.08);
      }
      if (!c.landed && Math.abs(p.y - this.y) < 1.1 && (p.x - this.x) * this.facing > -0.2 && (p.x - this.x) * this.facing < reach + p.r) c.strike(w, { x: this.x + this.facing * 0.6, y: this.y });
    } else if (c.phase === 'recover') {
      this.armT = 0.2;
      if (c.is('punch') && this.combo > 0 && c.k > 0.2) { this.combo--; c.start(M_PUNCH2); }
    } else if (c.phase === 'stagger') this.armT = -0.2;
    this.place(dt);
  }
  private flashT = 0;
  private place(dt: number) {
    this.arm = damp(this.arm, this.armT, this.core.phase === 'active' ? 60 : 10, dt);
    for (const [i, g] of this.clubs.entries()) {
      const a = this.arm;
      g.rotation.set(0, 0, a > 0 ? -0.2 + a * 0.2 - i * 0.05 : -1.9 - a * 0.8);
      (g.children[1] as THREE.Object3D).rotation.set(0, 0, a > 0 ? 0 : 2.6);
    }
    this.flashT = Math.max(0, this.flashT - dt * 4);
    this.squashV += (-this.squash * 160 - this.squashV * 12) * dt; this.squash += this.squashV * dt;
    const sq = clamp(this.squash, -0.3, 0.3);
    this.obj.position.set(this.x, this.y, 0);
    this.obj.scale.set(1 + sq, 1 - sq, 1);
    this.yaw = damp(this.yaw, this.facing > 0 ? 0 : -Math.PI, 10, dt);
    this.pivot.rotation.set(0, this.yaw - 0.4 * (this.facing > 0 ? 1 : -1), this.onGround ? 0 : clamp(this.vy * 0.08, -0.3, 0.3));
    this.body.position.y = Math.sin(this.t * 9) * 0.01;
    // the hit / tell flash on the shell
    const f = Math.max(this.flashT, this.core.hitFlash * 0.8);
    const red = this.core.phase === 'windup' && !!this.core.move?.unblockable;
    for (const m of this.mats) m.emissive.setRGB(f, red ? f * 0.15 : f, red ? f * 0.1 : f);
  }
  hit(dmg: number, dirX: number, dirY: number, w: World, src: Entity | null, kind?: DamageKind): boolean {
    const ok = super.hit(dmg, dirX, dirY, w, src, kind);
    if (ok) { this.vy = Math.max(this.vy, 1.4); this.onGround = false; this.flashT = 1; }
    return ok;
  }
}
