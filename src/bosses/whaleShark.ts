// THE GENTLE GIANT (v8): a whale shark with a fisherman's hook through its lip and a ghost net in its gills, in pain and
// starving, swallowing everything in reach -- you included.
//
//   PHASE 1  outside. It cruises the arena, huge and slow. Hit it on the FLANKS (the head is all gristle).
//            VORTEX (red tell + danger ring at the mouth): the mouth gapes and the water pours in; swim / dash out of the
//              pull or it swallows you. TAIL SLAM (red): it rolls its tall tail up over you and brings it down, a
//              shockwave runs along the seabed. REMORAS: the riders peel off and come for you (parryable lunges).
//              PLANKTON: it coughs up a glowing plankton cloud; inside it you can't see (and it feeds: a vortex follows).
//   THE SWALLOW  at half health (or the moment a vortex catches you) it gulps you down: the mouth snaps shut, the
//            camera follows the lump down its throat into the dark...
//   PHASE 2  INSIDE THE STOMACH (src/bosses/whaleStomach.ts): SURVIVE the timer (or tear the glowing pyloric VALVE open
//            first): acid rises and burns, contractions squeeze and shove the whole stomach sideways, swallowed fish
//            drop in after you, the valve spits acid. A young turtle is tangled in netting: cut it free for a reward.
//            Win and it coughs you back out (BLAARGH), reeling and open to a punish.
//   PHASE 3  outside again, angrier: + RAM (white: parry it) and faster tells. A vortex now just chomps and spits.
//   THE END  not a kill: the hook tears free of its lip, the pain goes out of it and the giant swims off up into the
//            light. You keep the hook (the unique item, src/game/items.ts 'giantsHook') and a trophy ('whaleTrophy').
//
// Dev: ?preview=dungeon&floor=abyss&at=boss&boss=whale (straight into the fight; &god=1 to watch it); in normal runs it
// is the boss of a late floor (stage 3+) reached by a DEEPER crossroads branch (src/dungeon/routes.ts sign: A GIANT
// SHADOW). The dungeon reads cam() / look() / loot (src/game/dungeonScreen.ts) for the cinematic camera, the stomach's
// light and the drops.
import * as THREE from 'three';
import type { World, Entity, Team, DamageKind } from '../game/types';
import type { Arena } from '../combat/types';
import { EnemyCore, type MoveDef } from '../combat/core';
import { BossBase, type BossState } from './base';
import { buildFish, type FishModel } from '../fish';
import { dangerZone, glint } from '../combat/telegraph';
import { callout } from '../combat/feel';
import { attackPlayer } from '../combat/resolve';
import { buildEnemy } from '../combat/roster';
import { setArena } from '../combat/arena';
import { clamp, damp } from '../core/math';
import { POST } from '../gfx/post';
import { rigOf, type Look, type LampHandle } from '../gfx/lighting';
import { onScreenUI } from '../ui/seaText';
import { C as KC } from '../ui/pixel/skins';
import { audio, type LoopHandle } from '../audio/audio';
import { itemModel } from '../backpack/models';
import { Stomach, buildBottle } from './whaleStomach';
import { Px } from '../gfx/px';

const R = (a: number, b: number) => a + Math.random() * (b - a);
type Pl = World['player'] & { applyForce(x: number, y: number): void; push(x: number, y: number): void; sb: { place(x: number, y: number): void }; obj: THREE.Object3D; facing: number; hooked: boolean; grabbedBy: Entity | null; maxHp: number; heal?(n: number, w: World): void };
const pl = (w: World) => w.player as unknown as Pl;

/** the dungeon's camera hint (src/game/dungeonScreen.ts camTarget): look at (x, y) from dist; k = follow speed; cut = jump */
export interface BossCam { x: number; y: number; dist: number; k?: number; cut?: number }

// ------------------------------------------------------------------ moves
const WS: Record<string, MoveDef> = {
  vortex: { id: 'vortex', windup: 1.5, active: 3.0, recover: 1.0, dmg: 0, tell: 'red', tellAt: 0.55 },
  tail: { id: 'tail', windup: 1.1, active: 0.42, recover: 1.2, dmg: 2, unblockable: true, kind: 'crush', knock: 10, tellAt: 0.42, hyper: true },
  remoras: { id: 'remoras', windup: 0.9, active: 0.3, recover: 0.7, dmg: 0, tell: 'none' },
  plankton: { id: 'plankton', windup: 1.2, active: 0.6, recover: 0.6, dmg: 0, tell: 'none' },
  ram: { id: 'ram', windup: 0.95, active: 1.1, recover: 1.3, dmg: 1.5, kind: 'bite', knock: 9, tellAt: 0.32 },
  chomp: { id: 'chomp', windup: 0.15, active: 0.3, recover: 1.0, dmg: 2.5, unblockable: true, kind: 'bite', tell: 'none' },
};

// ------------------------------------------------------------------ helpers: hit boxes along the body
class FlankBox implements Entity {
  kind = 'hurtbox'; team: Team = 'enemy';
  x = -1e4; y = -1e4; vx = 0; vy = 0; alive = true;
  constructor(public host: WhaleShark, public r: number, public mult: number, public head = false) {}
  update() { if (!this.host.alive) this.alive = false; }
  hit(dmg: number, dx: number, dy: number, w: World, src: Entity | null, kind?: DamageKind): boolean {
    if (!this.alive || !this.host.outside) return false;
    if (this.head) { w.fx.sparks(this.x, this.y, 5, Math.atan2(-dy, -dx), 3, '#d8e0e8'); if (Math.random() < 0.4) callout(w, 'HIT THE FLANKS', this.x, this.y + 1.2, 'hint', 0.3); }
    return this.host.hit(dmg * this.mult, dx, dy, w, src, kind);
  }
}

/** a remora that peeled off the whale shark: darts in with a parryable lunge */
const BITE: MoveDef = { id: 'lunge', windup: 0.6, active: 0.28, recover: 0.7, dmg: 0.6, kind: 'bite', knock: 4, tellAt: 0.3 };
class RemoraMinion implements Entity {
  kind = 'remora'; team: Team = 'enemy';
  x: number; y: number; vx: number; vy: number; r = 0.45; alive = true; hp = 3.2; maxHp = 3.2;
  obj = new THREE.Group(); m: FishModel; core: EnemyCore;
  private t = 0; private cd = R(0.6, 1.4); private aim = { x: 1, y: 0 }; private dead = -1; private orbit = R(0, 6);
  constructor(x: number, y: number, vx: number, vy: number, public box: () => Arena) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.m = buildFish('remora', (Math.random() * 99) | 0);
    this.m.group.scale.setScalar(1.9);
    this.obj.add(this.m.group);
    this.core = new EnemyCore(this, { poise: 6, head: () => ({ x: this.x, y: this.y + 0.35 }) });
  }
  update(dt: number, w: World) {
    this.t += dt;
    if (this.dead >= 0) {
      this.dead += dt; this.vy -= dt * 1.5; this.x += this.vx * dt; this.y += this.vy * dt; this.vx *= 0.97;
      this.obj.rotation.x = Math.min(Math.PI, this.dead * 3);
      if (this.dead > 1.4) { this.obj.scale.multiplyScalar(0.9); if (this.dead > 2) this.alive = false; }
      this.obj.position.set(this.x, this.y, 0.1); this.m.update(dt, 0.2, 0); return;
    }
    const p = w.player, c = this.core;
    c.update(dt, w, () => ({ x: this.x + this.aim.x * 0.4, y: this.y + 0.1 }));
    const dx = p.x - this.x, dy = p.y - this.y, d = Math.hypot(dx, dy) || 1;
    if (!c.busy) {
      // circle the blobfish at a lunge's length, then go in
      this.orbit += dt * 1.2;
      const tx = p.x + Math.cos(this.orbit) * 3, ty = p.y + Math.sin(this.orbit * 1.3) * 1.6;
      this.vx = damp(this.vx, clamp((tx - this.x) * 2.2, -7.5, 7.5), 3, dt); this.vy = damp(this.vy, clamp((ty - this.y) * 2.2, -5, 5), 3, dt);
      this.cd -= dt;
      if (this.cd <= 0 && d < 5 && p.alive) { c.start(BITE); this.cd = R(1.6, 2.6); }
    } else if (c.phase === 'windup') {
      this.aim.x = dx / d; this.aim.y = dy / d;
      this.vx = damp(this.vx, -this.aim.x * 1.5, 6, dt); this.vy = damp(this.vy, -this.aim.y * 1.5, 6, dt);
      this.m.setJaw(0.9);
    } else if (c.phase === 'active') {
      if (c.justEntered('active')) w.sfx('swish_b', this.x, 0.5, 1.5);
      this.vx = this.aim.x * 12; this.vy = this.aim.y * 12;
      if (!c.landed && d < 0.55 + p.r) { const r = c.strike(w, { x: this.x, y: this.y, knock: BITE.knock }); if (r === 'parried') { this.vx *= -0.4; this.vy *= -0.4; } }
      this.m.setJaw(0.2);
    } else { this.vx = damp(this.vx, 0, 3, dt); this.vy = damp(this.vy, 0, 3, dt); this.m.setJaw(0.1); }
    this.x += this.vx * dt; this.y += this.vy * dt;
    const a = this.box();
    this.x = clamp(this.x, a.x0 + 0.5, a.x1 - 0.5); this.y = clamp(this.y, a.floor + 0.6, a.top - 0.5);
    const face = Math.abs(this.vx) > 0.3 ? Math.sign(this.vx) : Math.sign(dx) || 1;
    this.obj.position.set(this.x, this.y, 0.1);
    this.obj.rotation.set(0, face > 0 ? -0.3 : Math.PI + 0.3, clamp(Math.atan2(this.vy, Math.abs(this.vx) + 0.5) * (face > 0 ? 1 : -1), -0.7, 0.7) * (face > 0 ? 1 : -1) * 0);
    this.m.group.rotation.z = clamp(Math.atan2(this.vy, Math.abs(this.vx) + 0.5), -0.7, 0.7);
    this.m.update(dt, Math.hypot(this.vx, this.vy) + 0.5, 0);
    this.m.lookAt(Math.abs(dx), dy);
  }
  hit(dmg: number, dx: number, dy: number, w: World, _src: Entity | null, kind?: DamageKind): boolean {
    if (this.dead >= 0) return false;
    const d = this.core.receive(w, dmg, dx, dy, kind);
    if (d < 0) return false;
    this.hp -= d; this.m.flash(1);
    this.vx += dx * 5; this.vy += dy * 5;
    w.fx.hit(this.x, this.y, 'hit', Math.atan2(dy, dx));
    if (this.hp <= 0) {
      this.dead = 0; this.team = 'neutral'; this.core.cancel();
      w.fx.gore(this.x, this.y, 0.5, { x: dx, y: dy }); w.sfx('hit_squish', this.x, 0.6, 1.3);
      w.emit('kill', { kind: 'remora', x: this.x, y: this.y, size: 'small', family: 'fish' });
    }
    return true;
  }
  onParried(w: World) { this.core.parried(w); }
  dispose() { this.m.dispose(); }
}

/** the plankton cloud: a drifting glow that blinds whoever swims in it */
class PlanktonCloud implements Entity {
  kind = 'plankton'; team: Team = 'neutral'; vx = 0; vy = 0; r = 0; alive = true; t = 0;
  private told = false;
  constructor(public x: number, public y: number, public R = 4.6, public dur = 6) {}
  update(dt: number, w: World) {
    this.t += dt;
    if (this.t > this.dur) { this.alive = false; return; }
    const grow = Math.min(1, this.t / 0.8), fade = 1 - Math.max(0, (this.t - (this.dur - 1.2)) / 1.2);
    const rr = this.R * grow;
    this.x += Math.sin(this.t * 0.7) * dt * 0.4; this.y += dt * 0.15;
    for (let k = 0; k < 3; k++) if (Math.random() < dt * 30 * fade) {
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * rr;
      w.fx.emit(Math.random() < 0.7 ? 'mote' : 'glow', this.x + Math.cos(a) * d, this.y + Math.sin(a) * d * 0.8, { n: 1, size: R(0.08, 0.22), color: Math.random() < 0.5 ? '#9affc0' : '#d8ff7a', life: R(0.8, 1.6), vx: R(-0.3, 0.3), vy: R(-0.2, 0.3), alpha: 0.85, z: R(-1, 1.2) });
    }
    if (Math.random() < dt * 6 * fade) w.fx.emit('silt', this.x + R(-rr, rr) * 0.7, this.y + R(-rr, rr) * 0.5, { n: 1, size: 1.4, size1: 3, color: '#2a6a48', alpha: 0.35, life: 2, drag: 2 });
    const p = w.player, d = Math.hypot(p.x - this.x, p.y - this.y);
    if (d < rr && p.alive) {
      const k = clamp(1.25 - d / rr, 0, 1) * fade;
      POST.uFlash.value.set(0.1, 0.32, 0.2, Math.max(POST.uFlash.value.w, k * 0.86));
      if (!this.told) { this.told = true; callout(w, 'BLINDED BY PLANKTON', p.x, p.y + 1.1, 'danger', 0.4); w.emit('blinded', {}); }
    }
  }
}

/** a glob of stomach acid the valve spits (dodge it; blocks don't help, it splashes) */
const globGeo = new THREE.IcosahedronGeometry(0.22, 1);
let globMat: THREE.Material | null = null;
class AcidGlob implements Entity {
  kind = 'acidGlob'; team: Team = 'neutral'; r = 0.22; alive = true; t = 0;
  obj: THREE.Mesh;
  constructor(public x: number, public y: number, public vx: number, public vy: number) {
    if (!globMat) { const p = new Px(8, 8); p.fill((x, y) => ((x + y) % 3 ? [200, 240, 80] : [240, 255, 160])); globMat = new THREE.MeshBasicMaterial({ map: p.texture({ mip: false }), color: new THREE.Color(1.5, 1.6, 1.2) }); }
    this.obj = new THREE.Mesh(globGeo, globMat);
  }
  update(dt: number, w: World) {
    this.t += dt;
    this.vy -= dt * 3.2;
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.obj.position.set(this.x, this.y, 0.15);
    this.obj.scale.set(1 + Math.sin(this.t * 20) * 0.12, 1 - Math.sin(this.t * 20) * 0.12, 1);
    if (Math.random() < dt * 25) w.fx.emit('poison', this.x, this.y, { n: 1, spread: 0.1, vy: 0.3 });
    const p = w.player;
    if (p.alive && Math.hypot(p.x - this.x, p.y - this.y) < this.r + p.r) {
      attackPlayer(w, { src: null, dmg: 0.8, x: this.x, y: this.y, kind: 'spike', parryable: false, knock: 4, name: 'stomach acid' });
      this.splat(w); return;
    }
    if (this.t > 3.5 || w.terrain.sdf(this.x, this.y) < 0) this.splat(w);
  }
  private splat(w: World) { this.alive = false; w.fx.poison(this.x, this.y, 8); w.sfx('squish', this.x, 0.5, 1.4); }
}

/** the pyloric valve: the soft spot inside (hits go to the whale shark, harder) */
class ValveSpot implements Entity {
  kind = 'weakpoint'; team: Team = 'enemy'; vx = 0; vy = 0; r = 1.35; alive = true;
  x = -1e4; y = -1e4;
  constructor(public host: WhaleShark) {}
  update() { if (!this.host.alive) this.alive = false; }
  hit(dmg: number, dx: number, dy: number, w: World, src: Entity | null, kind?: DamageKind): boolean { return this.host.valveHit(dmg, dx, dy, w, src, kind); }
}
/** the net round the trapped turtle */
class NetKnot implements Entity {
  kind = 'weakpoint'; team: Team = 'enemy'; vx = 0; vy = 0; r = 0.9; alive = true; hits = 0;
  x = -1e4; y = -1e4;
  constructor(public host: WhaleShark) {}
  update() { if (!this.host.alive) this.alive = false; }
  hit(_d: number, _dx: number, _dy: number, w: World): boolean { return this.host.netHit(this, w); }
}
/** junk flying out of the whale shark's mouth when it coughs (a moment, then it sinks out of the shot) */
class Flotsam implements Entity {
  kind = 'flotsam'; team: Team = 'neutral'; r = 0; alive = true; t = 0; spin: THREE.Vector3;
  constructor(public obj: THREE.Object3D, public x: number, public y: number, public vx: number, public vy: number) { this.spin = new THREE.Vector3(R(-4, 4), R(-4, 4), R(-6, 6)); }
  update(dt: number) {
    this.t += dt; this.vx *= Math.exp(-dt * 0.8); this.vy -= dt * 2.2;
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.obj.position.set(this.x, this.y, 0.6);
    this.obj.rotation.x += this.spin.x * dt; this.obj.rotation.y += this.spin.y * dt; this.obj.rotation.z += this.spin.z * dt;
    if (this.t > 3.2) { this.obj.scale.multiplyScalar(Math.exp(-dt * 6)); if (this.t > 3.8) this.alive = false; }
  }
}

// ------------------------------------------------------------------ the hook in its lip (and the line + net scrap trailing)
function rustTex() {
  const p = new Px(16, 16);
  p.fill((x, y) => ((x * 7 + y * 3) % 11 < 3 ? [120, 60, 30] : y < 5 ? [170, 160, 150] : [110, 96, 86]));
  return p.texture({ mip: false });
}
function buildHook(): THREE.Group {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ map: rustTex(), roughness: 0.6, metalness: 0.4, flatShading: true });
  // a big J: the shank, the bend, the point and barb, the eye at the top with a twist of steel leader
  const curve = new THREE.CatmullRomCurve3([[0, 0.9, 0], [0, 0.3, 0], [0.02, -0.1, 0], [0.18, -0.32, 0], [0.4, -0.3, 0], [0.5, -0.12, 0], [0.48, 0.12, 0]].map((q) => new THREE.Vector3(...q as [number, number, number])));
  g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 14, 0.045, 5, false), m));
  const barb = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 4), m); barb.position.set(0.48, 0.2, 0); barb.rotation.z = 0.2; g.add(barb);
  const barb2 = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.14, 4), m); barb2.position.set(0.42, 0.08, 0); barb2.rotation.z = 2.6; g.add(barb2);
  const eye = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.025, 4, 8), m); eye.position.set(0, 0.98, 0); g.add(eye);
  const lineM = new THREE.MeshStandardMaterial({ color: '#c8d0c8', roughness: 0.8, flatShading: true });
  const lc = new THREE.CatmullRomCurve3([[0, 1.05, 0], [-0.3, 1.4, 0.1], [-0.9, 1.5, 0.2], [-1.6, 1.2, 0.3], [-2.4, 1.3, 0.2]].map((q) => new THREE.Vector3(...q as [number, number, number])));
  g.add(new THREE.Mesh(new THREE.TubeGeometry(lc, 12, 0.012, 3, false), lineM));
  g.traverse((o) => { (o as THREE.Mesh).castShadow = true; });
  return g;
}

// ================================================================================================ the boss
type Mode = 'out' | 'gulp' | 'in' | 'cough' | 'out3';
export class WhaleShark extends BossBase {
  cycles = [['vortex', 'tail', 'remoras', 'tail', 'plankton', 'vortex', 'tail'], ['vortex'], ['tail', 'ram', 'vortex', 'remoras', 'plankton', 'ram', 'tail']];
  moves = WS;
  /** the dungeon reads these: the pedestal's item, then extra drops */
  loot = ['giantsHook', 'whaleTrophy'];
  mode: Mode = 'out';
  m: FishModel;
  private pivot = new THREE.Group();
  private S = 1.3;
  private dir = -1; private yaw = Math.PI + 0.3; private pitch = 0; private pitchT = 0; private turn = 0;
  private swim = 1;
  private boxes: FlankBox[] = [];
  private riders: FishModel[] = [];
  private ridersOn = true; private ridersT = 0;
  private hook: THREE.Group;
  private dash = { x: 1, y: 0 };
  private appT = 0;
  private vortexSnd: LoopHandle | null = null;
  private swallowed = false;
  // ---- the swallow / stomach / cough
  private gT = 0; private gForced = false; private gCaught = false;
  private stomach: Stomach | null = null;
  private hidden: [THREE.Object3D, boolean][] = [];
  private savedAmb: unknown = null;
  private lamps: LampHandle[] = [];
  private mutedLamps: [THREE.PointLight, number][] = [];
  private inT = 0; private inDur = 32;
  private contr = { t: 6, stage: 'idle' as 'idle' | 'tell' | 'squeeze' | 'release', st: 0, dir: 1 };
  private spitT = 3.5; private fishT = 0.6; private wave = 0;
  private acidTick = 0; private acidTold = false;
  private valve: ValveSpot; private net: NetKnot;
  private valveHits = 0; private valveNeed = 8;
  private inside: Entity[] = [];
  private turtleFree = -1;
  private boil: LoopHandle | null = null;
  private beat = 0;
  private cT = 0; private coughWhy: 'time' | 'tore' = 'time';
  private camCut = 0;
  private hookOut = false;
  private w: World | null = null;
  private seq: { t: number; fn: () => void }[] = [];
  /** run fn after sec of game time */
  private later(sec: number, fn: () => void) { this.seq.push({ t: sec, fn }); }
  private wasGod = false;

  constructor(arena: Arena, _w: World) {
    super('whaleShark', arena, { name: 'THE GENTLE GIANT', title: 'Whale Shark, Hooked and Starving', hp: 150, poise: 160, r: 1.0, x: arena.x1 - 7, y: arena.floor + (arena.top - arena.floor) * 0.55 });
    this.phaseAt = [0.5, 0.3];
    this.m = buildFish('whaleShark', 11);
    this.m.group.scale.setScalar(this.S);
    this.pivot.add(this.m.group);
    this.pivot.rotation.order = 'YZX';
    this.obj.add(this.pivot);
    // the remoras riding along: under the belly, on the flank behind the pectoral, one on the back
    const anc = this.m.asset.anchors;
    // (sized to read at the fight's camera distance: a real remora is tiny next to a whale shark, but here they must
    // be seen to be the minions that peel off; five of them, flipped belly-up where they cling under the body)
    const spots: [THREE.Vector3 | undefined, number, number, number, boolean][] = [
      [anc.belly, 0, -0.17, 0.42, true], [anc.flank, -0.9, -0.42, 0.58, true], [anc.back, -1.6, 0.2, 0.3, false],
      [anc.flank, 1.5, -0.7, 0.62, true], [anc.belly, -2.6, -0.12, 0.3, true],
    ];
    spots.forEach(([a, dx, dy, dz, flip], i) => {
      if (!a) return;
      const r = buildFish('remora', 20 + i);
      r.group.position.set(a.x + dx, a.y + dy, a.z + dz);
      r.group.rotation.z = flip ? Math.PI : 0;
      if (flip) r.group.rotation.x = Math.PI;
      r.group.scale.setScalar(2.5 + (i % 2) * 0.25);
      this.m.group.add(r.group);
      this.riders.push(r);
    });
    // the hook through its lip
    this.hook = buildHook();
    const mo = this.m.mouth;
    this.hook.position.set(mo.x - 0.35, mo.y - 0.1, this.m.length * 0.055);
    this.hook.rotation.set(0.3, -0.5, 0.6);
    this.hook.scale.setScalar(1.5);
    this.m.group.add(this.hook);
    this.valve = new ValveSpot(this);
    this.net = new NetKnot(this);
  }

  get outside() { return this.mode === 'out' || this.mode === 'out3'; }
  private get L() { return this.m.length * this.S; }
  onSpawn(w: World) {
    this.w = w;
    // hit boxes down the body: head (gristle), shoulders, mid flank, the tail stock
    for (const [r, mult, head] of [[1.25, 0.35, true], [1.35, 1, false], [1.25, 1, false], [0.95, 0.85, false]] as [number, number, boolean][]) { const b = new FlankBox(this, r, mult, head); this.boxes.push(b); w.add(b); }
    w.add(this.valve); w.add(this.net);
  }

  // ---------------------------------------------------------------- body geometry in the world
  private v = new THREE.Vector3();
  /** a model-space point (authored, unscaled) in the world */
  private world(p: THREE.Vector3 | [number, number, number]) {
    this.obj.updateMatrixWorld(true);
    if (Array.isArray(p)) this.v.set(p[0], p[1], p[2]); else this.v.copy(p);
    this.m.group.localToWorld(this.v);
    return { x: this.v.x, y: this.v.y };
  }
  mouthW() { return this.world(this.m.mouth); }
  tailW() { return this.world(this.m.asset.anchors.tail ?? new THREE.Vector3(-this.m.length / 2, 0, 0)); }
  head() { const m = this.mouthW(); return { x: m.x, y: m.y + 1.2 }; }
  protected tellPoint() { return this.core.is('tail') ? this.tailW() : this.mouthW(); }

  // ---------------------------------------------------------------- per frame
  update(dt: number, w: World) {
    this.w = w;
    if (this.seq.length) { for (const q of this.seq) q.t -= dt; const due = this.seq.filter((q) => q.t <= 0); this.seq = this.seq.filter((q) => q.t > 0); for (const q of due) q.fn(); }
    if (this.mode === 'gulp' || this.mode === 'in' || this.mode === 'cough') {
      this.st += dt;
      this.flash = Math.max(0, this.flash - dt * 5);
      if (this.mode === 'gulp') this.updGulp(dt, w);
      else if (this.mode === 'in') this.updInside(dt, w);
      else this.updCough(dt, w);
      this.place(dt, w);
      return;
    }
    super.update(dt, w);
    // the riders come back a while after they swarmed off
    if (!this.ridersOn) { this.ridersT -= dt; if (this.ridersT <= 0) this.showRiders(true); }
    if (this.vortexSnd && !this.core.is('vortex')) { this.vortexSnd.stop(0.4); this.vortexSnd = null; }
  }

  protected setState(s: BossState, w: World) {
    // the phase thresholds are the swallow (50%) and tearing out of the stomach (30%)
    if (s === 'transition' && this.phase === 2 && this.mode === 'out') { this.beginGulp(w, true); return; }
    if (s === 'transition' && this.phase === 3 && this.mode === 'in') { this.beginCough(w, 'tore'); return; }
    if (s === 'transition' && this.phase === 3) { this.phase = 3; return; }
    super.setState(s, w);
    if (s === 'intro') {
      // its story, floated over the giant itself once the name card has gone
      const over = () => { const m = this.mouthW(); return { x: (m.x + this.x) / 2, y: this.y + 3.2 }; };
      this.later(3.2, () => { if (this.alive && this.state === 'fight') { const o = over(); w.text.pop('A HOOK THROUGH ITS LIP. A NET IN ITS GILLS.', o.x, o.y, 'hint', { size: 0.36, life: 3.0, vy: 0.05, follow: over }); } });
      this.later(4.6, () => { if (this.alive && this.state === 'fight') { const o = over(); w.text.pop('IT IS IN PAIN, AND STARVING.', o.x, o.y - 0.7, 'hint', { size: 0.36, life: 2.6, vy: 0.05, follow: () => { const q = over(); return { x: q.x, y: q.y - 0.7 }; } }); } });
      w.sfx('whale', this.x, 0.9, 0.6); w.sfx('whale', this.x, 0.6, 0.45);
    }
  }

  // ---------------------------------------------------------------- outside: movement + moves
  private steer(dt: number, tx: number, ty: number, spd: number, k = 1.2) {
    const a = this.arena;
    tx = clamp(tx, a.x0 + 4, a.x1 - 4); ty = clamp(ty, a.floor + 2.2, a.top - 2);
    this.vx = damp(this.vx, clamp((tx - this.x) * k, -spd, spd), 1.6, dt);
    this.vy = damp(this.vy, clamp((ty - this.y) * k, -spd * 0.6, spd * 0.6), 1.6, dt);
    this.x += this.vx * dt; this.y += this.vy * dt;
    // it turns only when the way it's going is really behind it (a slow, wide U-turn)
    if (Math.abs(this.vx) > 0.9 && Math.sign(this.vx) !== this.dir) this.dir = Math.sign(this.vx);
  }
  private faceTo(x: number) { const d = Math.sign(x - this.x) || this.dir; this.dir = d; }
  protected want(id: string, w: World) {
    const p = w.player, mo = this.mouthW(), dm = Math.hypot(p.x - mo.x, p.y - mo.y);
    const facing = Math.sign(p.x - this.x) === this.dir;
    this.appT += 1 / 60;
    const late = this.appT > 3.2;
    let ok = true;
    if (id === 'vortex') ok = (facing && dm < 11 && Math.abs(this.yaw - this.yawFor(this.dir)) < 0.4) || (late && facing);
    else if (id === 'tail') { const t = this.tailW(); ok = (Math.abs(t.x - p.x) < 3.2 && t.y > p.y - 0.5) || late; }
    else if (id === 'ram') ok = (facing && Math.abs(p.y - this.y) < 2.5 && Math.abs(p.x - this.x) > 7) || late;
    if (ok) this.appT = 0;
    return ok;
  }
  protected approach(dt: number, w: World, next: string) {
    const p = w.player, L = this.L;
    if (next === 'vortex' || next === 'chomp') { const side = Math.sign(this.x - p.x) || 1; this.steer(dt, p.x + side * (L * 0.5 + 5), p.y + 0.4, 3.2); if (Math.abs(this.x - p.x) > L * 0.45) this.faceTo(p.x); }
    else if (next === 'tail') { this.steer(dt, p.x + this.dir * L * 0.42, p.y + 2.6, 3.6); }
    else if (next === 'ram') { const a = this.arena, side = p.x < (a.x0 + a.x1) / 2 ? 1 : -1; this.steer(dt, p.x + side * 10, p.y, 4); if (Math.abs(this.x - p.x) > 6) this.faceTo(p.x); }
    else this.steer(dt, p.x + Math.sin(this.st * 0.3) * 6, p.y + 2, 2.5);
    this.swim = 1 + Math.hypot(this.vx, this.vy);
    this.m.setJaw(0.08 + Math.max(0, Math.sin(this.st * 0.7)) * 0.1);
  }
  protected started(w: World, m: MoveDef) {
    const p = w.player;
    if (m.id === 'vortex') {
      this.faceTo(p.x);
      const mo = this.mouthW();
      dangerZone(w, mo.x + this.dir * 1.2, mo.y, 2.6, m.windup, true, () => { const q = this.mouthW(); return { x: q.x + this.dir * 1.2, y: q.y }; });
      callout(w, 'IT OPENS WIDE', mo.x, mo.y + 2.2, 'danger', 0.5);
      w.sfx('whale', this.x, 0.8, 0.5); w.sfx('flood_rush', this.x, 0.5, 0.6);
    }
    if (m.id === 'tail') { w.sfx('swish_c', this.x, 0.6, 0.45); w.sfx('uw_rumble', this.x, 0.6, 0.8); }
    if (m.id === 'remoras') { callout(w, 'REMORAS!', this.x, this.y + 2.4, 'danger', 0.45); w.sfx('fish_squeak', this.x, 0.7, 1.2); }
    if (m.id === 'plankton') { w.sfx('lp_bubbler', this.x, 0.7, 0.6); w.sfx('whale', this.x, 0.6, 0.8); }
    if (m.id === 'ram') { this.faceTo(p.x); w.sfx('boss_growl', this.x, 0.7, 0.7); }
  }
  protected run(dt: number, w: World) {
    if (!this.core.move) return;   // staggered
    const c = this.core, m = c.move!, p = pl(w), ph = c.phase, k = c.k;
    switch (m.id) {
      case 'vortex': {
        const mo = this.mouthW();
        this.vx = damp(this.vx, 0, 2, dt); this.vy = damp(this.vy, clamp((p.y - this.y) * 0.8, -1, 1), 2, dt);
        this.x += this.vx * dt; this.y += this.vy * dt;
        if (ph === 'windup') {
          this.m.setJaw(0.3 + k * 0.9); this.pitchT = -0.06;
          if (Math.random() < dt * 30) { const a = Math.random() * Math.PI * 2, rr = R(2, 6); w.fx.emit('bubbleS', mo.x + this.dir * rr * Math.abs(Math.cos(a)), mo.y + Math.sin(a) * rr * 0.7, { n: 1, vx: -this.dir * rr * 0.6 * Math.abs(Math.cos(a)), vy: -Math.sin(a) * rr * 0.4, life: 0.8, drag: 0 }); }
        } else if (ph === 'active') {
          if (c.justEntered('active')) { this.vortexSnd = audio.loop('lp_flow', 0.6); w.sfx('flood_rush', this.x, 0.9, 0.5); w.game.addShake(0.2); }
          this.m.setJaw(1.2);
          this.gillPump(2.5);
          // the pull: strong near the mouth, a current you can fight further out (dash out of it)
          const mx = mo.x - p.x, my = mo.y - p.y, md = Math.hypot(mx, my) || 1;
          const pull = clamp(16 - md, 2.5, 13) * 2.9 * (this.phase === 3 ? 1.15 : 1);
          p.applyForce((mx / md) * pull + (-my / md) * 3 * this.dir, (my / md) * pull);
          // a spiral of bubbles, silt and motes pouring into the gape
          for (let i = 0; i < 3; i++) if (Math.random() < dt * 40) {
            const a = Math.random() * Math.PI * 2, rr = R(1.5, 9);
            const px = mo.x + this.dir * Math.abs(Math.cos(a)) * rr, py = mo.y + Math.sin(a) * rr * 0.75;
            const tx = mo.x - px, ty = mo.y - py, tl = Math.hypot(tx, ty) || 1, sp = 3 + 18 / (tl + 1);
            w.fx.emit(i === 0 ? 'bubbleS' : i === 1 ? 'mote' : 'bubble', px, py, { n: 1, vx: (tx / tl) * sp - (ty / tl) * 2.5, vy: (ty / tl) * sp + (tx / tl) * 2.5, life: tl / sp, drag: 0, size: R(0.05, 0.12), color: '#bfefff', z: R(-1, 1) });
          }
          if (md < 1.7 + p.r && p.alive) {
            if (!this.swallowed && this.phase < 3) { this.phase = 2; this.beginGulp(w, false); return; }
            // after the stomach: it just chomps and spits you out
            c.start(WS.chomp);
            const r = attackPlayer(w, { src: this, dmg: 2.2, x: mo.x, y: mo.y, kind: 'bite', unblockable: true, knock: 14, name: 'gulp' });
            if (r === 'hit') { callout(w, 'CHOMP! PTOO!', p.x, p.y + 1.2, 'danger', 0.5); w.sfx('chomp', this.x, 1, 0.6); w.game.addShake(0.35); p.push(this.dir * 10, 4); }
          }
        } else { this.m.setJaw(0.3 * (1 - k)); }
        break;
      }
      case 'chomp': { this.m.setJaw(c.phase === 'windup' ? 1.2 : 0.1); break; }
      case 'tail': {
        // the tail lifts high (nose dips), then slams down through the blobfish
        if (ph === 'windup') {
          this.pitchT = -0.42 * Math.min(1, k * 1.3); this.vx = damp(this.vx, 0, 3, dt); this.vy = damp(this.vy, 0.4, 3, dt);
          this.x += this.vx * dt; this.y += this.vy * dt;
          if (k > 0.5 && Math.floor(c.t * 10) % 2) this.m.flash(0.25, '#ff3020');
        } else if (ph === 'active') {
          this.pitchT = 0.38; this.pitch = damp(this.pitch, this.pitchT, 16, dt);
          const t = this.tailW();
          this.hitCircle(w, t.x, t.y, 2.3, { kind: 'crush', knock: m.knock });
          if (k > 0.75 && !this.slammed) {
            this.slammed = true;
            const fy = Math.max(this.arena.floor, w.terrain.floorAt(t.x));
            w.fx.shockwave(t.x, fy + 0.2, 2.6, '#d0f0ff'); w.fx.silt(t.x, fy + 0.3, 24, 2.4);
            w.sfx('boom_uw', t.x, 0.9, 0.6); w.sfx('uw_thud', t.x, 1, 0.7); w.game.addShake(0.45);
            this.wave = 0.01; this.waveX = t.x; this.waveY = fy;
          }
        } else { this.pitchT = 0; this.slammed = false; }
        break;
      }
      case 'remoras': {
        this.vx = damp(this.vx, 0, 2, dt); this.x += this.vx * dt;
        if (ph === 'windup') this.turn = Math.sin(c.t * 18) * 0.6;           // a shudder shakes them loose
        if (c.justEntered('active')) {
          const box = () => this.arena;
          this.riders.forEach((r, i) => {
            if ((!r.group.visible && this.ridersOn) || i >= 3) return;   // the extra two riders just swim off (same minion count)
            r.group.updateMatrixWorld(true);
            const v = r.group.getWorldPosition(new THREE.Vector3());
            const e = new RemoraMinion(v.x, v.y, R(-3, 3), R(-1, 2), box);
            w.add(e);
            w.fx.emit('bubbleBig', v.x, v.y, { n: 6, spread: 0.3, speed: 1.4 });
          });
          if (this.phase === 3) { const e = new RemoraMinion(this.x, this.y - 1, R(-3, 3), -2, box); w.add(e); }
          this.showRiders(false); this.ridersT = 14;
        }
        break;
      }
      case 'plankton': {
        this.vx = damp(this.vx, 0, 2, dt); this.x += this.vx * dt;
        const gl = this.world(this.m.asset.anchors.gill ?? new THREE.Vector3());
        if (ph === 'windup') {
          this.gillPump(4); this.m.setJaw(0.25 + Math.sin(c.t * 14) * 0.1);
          if (Math.random() < dt * 30) w.fx.emit('glow', gl.x + R(-0.6, 0.6), gl.y + R(-0.8, 0.8), { n: 1, size: 0.3, color: '#a0ffb0', life: 0.4 });
          if (c.t < dt * 1.5) dangerZone(w, p.x, p.y, 3.4, m.windup, true);
        }
        if (c.justEntered('active')) {
          // a great cough of glowing plankton through the gills, right where the blobfish is
          w.add(new PlanktonCloud(p.x + R(-0.6, 0.6), p.y + R(-0.3, 0.6), this.phase === 3 ? 5.4 : 4.6, 6));
          w.fx.burst('glow', gl.x, gl.y, 18, 4, { color: '#b0ffa0', size: 0.3, life: 0.8 });
          w.sfx('steam', gl.x, 0.8, 0.6); w.sfx('bubbles_b', gl.x, 0.8, 0.7);
          // it feeds on the cloud: the next move is a vortex
          this.queued = 'vortex'; this.cd = 0.3;
        }
        break;
      }
      case 'ram': {
        if (ph === 'windup') { this.vx = damp(this.vx, -this.dir * 2, 4, dt); this.x += this.vx * dt; if (k < 0.8) { const dy = clamp(p.y - this.y, -3, 3); this.dash.x = this.dir; this.dash.y = dy / 8; } this.m.setJaw(0.5); }
        else if (ph === 'active') {
          if (c.justEntered('active')) { w.sfx('swish_c', this.x, 1, 0.4); w.game.addShake(0.2); }
          this.vx = this.dash.x * 13; this.vy = this.dash.y * 6;
          this.x += this.vx * dt; this.y += this.vy * dt;
          const mo = this.mouthW();
          const r = this.hitCircle(w, mo.x, mo.y, 1.8, { knock: m.knock });
          if (r === 'parried') { this.vx *= -0.2; }
          const a = this.arena;
          if (this.x < a.x0 + 4 || this.x > a.x1 - 4) { this.x = clamp(this.x, a.x0 + 4, a.x1 - 4); }
          this.m.setJaw(0.2);
          if (Math.random() < dt * 30) w.fx.emit('bubble', this.x - this.dir * this.L * 0.4, this.y, { n: 1, spread: 0.6 });
        } else { this.vx = damp(this.vx, 0, 2, dt); this.x += this.vx * dt; }
        break;
      }
    }
    this.swim = 1 + Math.hypot(this.vx, this.vy) * (m.id === 'ram' ? 0.6 : 1);
  }
  private slammed = false; private waveX = 0; private waveY = 0;
  private gillPump(k: number) { this.m.asset.uni.uShape2.value.z = 0.0075 * k; }
  private yawFor(d: number) { return d > 0 ? -0.3 : Math.PI + 0.3; }
  private showRiders(on: boolean) { this.ridersOn = on; for (const r of this.riders) r.group.visible = on; if (on && this.w && this.outside) this.w.fx.emit('bubble', this.x, this.y, { n: 6, spread: 2 }); }

  protected staggerPose(dt: number) { this.vx = damp(this.vx, 0, 2, dt); this.vy = damp(this.vy, -0.4, 2, dt); this.y += this.vy * dt; this.m.setJaw(0.5); this.pitchT = -0.08; this.turn = Math.sin(this.st * 9) * 0.3; }
  protected idlePose(dt: number) {
    // a slow patrol back and forth across its arena until you come in
    const a = this.arena;
    if ((this.dir < 0 && this.x < a.x0 + 9) || (this.dir > 0 && this.x > a.x1 - 9)) this.dir = -this.dir as 1 | -1;
    this.x += this.dir * dt * 0.8; this.swim = 1.2;
  }
  protected introPose(dt: number, w: World, k: number) {
    // it glides in toward the middle, lifting its head as it notices you, and the mouth slowly opens
    const a = this.arena, p = w.player;
    this.steer(dt, (a.x0 + a.x1) / 2 + (p.x < (a.x0 + a.x1) / 2 ? 4 : -4), p.y + 1.5, 2.2, 0.6);
    this.faceTo(p.x);
    this.m.setJaw(k > 0.4 && k < 0.85 ? 1.0 : 0.15);
    this.pitchT = k > 0.4 && k < 0.85 ? 0.15 : 0;
    this.swim = 2;
    if (k > 0.5 && k < 0.55) { w.sfx('roar', this.x, 0.6, 0.45); w.game.addShake(0.25); }
  }
  protected transitionPose(dt: number, w: World, k: number) { this.introPose(dt, w, k); }
  protected onPhase(_w: World, n: number) { if (n === 3) { this.core.speed = 1.2; this.core.dmgMul = 1.15; } }

  // ---------------------------------------------------------------- damage + feedback
  hit(dmg: number, dx: number, dy: number, w: World, src: Entity | null, kind?: DamageKind) {
    if (this.mode === 'gulp' || this.mode === 'cough') return false;
    const ok = super.hit(dmg, dx, dy, w, src, kind);
    if (ok) { this.m.flash(1, '#ffffff'); if (this.outside && Math.random() < 0.5) w.fx.emit('bubble', this.x, this.y, { n: 3, spread: 1 }); }
    return ok;
  }
  valveHit(dmg: number, dx: number, dy: number, w: World, src: Entity | null, kind?: DamageKind): boolean {
    if (this.mode !== 'in' || !this.stomach) return false;
    const s = this.stomach;
    s.valve.flash = 1;
    this.valveHits++;
    const v = this.valve;
    w.fx.hit(v.x, v.y, 'crit', Math.atan2(dy, dx), '#9affe0');
    w.fx.emit('glow', v.x, v.y, { n: 3, size: 1.2, color: '#7affd8', life: 0.3 });
    w.fx.gore(v.x - 0.4, v.y, 0.4, { x: -1, y: 0 });
    w.sfx('squish', v.x, 0.9, 0.7); w.sfx('whale', v.x, 0.4, 1.4);
    w.game.addShake(0.12);
    const left = this.valveNeed - this.valveHits;
    if (left > 0) callout(w, left === 1 ? 'ONE MORE!' : `${left} MORE`, v.x - 1.5, v.y + 1.8, 'gold', 0.4);
    const ok = super.hit(dmg * 1.6, dx, dy, w, src, kind);
    if (this.mode === 'in' && this.valveHits >= this.valveNeed) this.beginCough(w, 'tore');
    return ok;
  }
  netHit(n: NetKnot, w: World): boolean {
    if (this.mode !== 'in' || !this.stomach || this.turtleFree >= 0) return false;
    n.hits++;
    w.fx.emit('chip', n.x, n.y, { n: 6, spread: 0.4, speed: 2, color: '#5a8a5a' }); w.sfx('net', n.x, 0.6, 1.3); w.sfx('crab_snip', n.x, 0.7);
    if (n.hits >= 3) {
      this.turtleFree = 0;
      if (this.stomach.turtleNet) this.stomach.turtleNet.visible = false;
      n.x = n.y = -1e4;
      w.text.pop('THE TURTLE IS FREE!', n.x === -1e4 ? this.stomach.turtlePos().x : n.x, this.stomach.turtlePos().y + 1.4, 'gold', { size: 0.5, life: 2.2 });
      w.sfx('jin_good', n.x, 0.6); w.sfx('cute', n.x, 0.7);
    } else callout(w, 'CUT THE NET', n.x, n.y + 1.1, 'hint', 0.3);
    return true;
  }

  // ---------------------------------------------------------------- THE SWALLOW
  private beginGulp(w: World, forced: boolean) {
    if (this.swallowed) return;
    this.swallowed = true;
    this.mode = 'gulp'; this.st = 0; this.gT = 0; this.gForced = forced; this.gCaught = !forced;
    this.core.cancel(); this.queued = null;
    this.vortexSnd?.stop(0.3); this.vortexSnd = null;
    const p = pl(w);
    this.wasGod = !!(w as unknown as { god?: boolean }).god;
    (w as unknown as { god?: boolean }).god = true;
    p.hooked = true; p.grabbedBy = this;
    this.faceTo(p.x);
    // remoras and the rest leave the stage
    for (const e of w.entities) if (e instanceof RemoraMinion || e instanceof PlanktonCloud) e.alive = false;
    if (forced) { callout(w, 'IT\'S GOING TO SWALLOW YOU!', p.x, p.y + 1.4, 'danger', 0.55); w.sfx('roar', this.x, 0.9, 0.5); w.sfx('flood_rush', this.x, 1, 0.45); w.game.addShake(0.4); }
    this.vortexSnd = audio.loop('lp_flow', 0.7);
  }
  private gulpFrom = { x: 0, y: 0 };
  private updGulp(dt: number, w: World) {
    const p = pl(w);
    this.gT += dt;
    const mo = this.mouthW();
    POST.uLetterbox.value = Math.min(1, POST.uLetterbox.value + dt * 2);
    this.vx = damp(this.vx, 0, 3, dt); this.vy = damp(this.vy, clamp((p.y - this.y) * 0.6, -1, 1), 2, dt);
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.swim = 1.5; this.pitchT = -0.05;
    if (!this.gCaught) {
      // the irresistible pull: dragged across the water into the gape
      this.m.setJaw(1.2); this.gillPump(3);
      const k = Math.min(1, this.gT / 1.7);
      const tx = mo.x + this.dir * 0.4, ty = mo.y;
      const nx = p.x + (tx - p.x) * Math.min(1, dt * (1 + k * 5)), ny = p.y + (ty - p.y) * Math.min(1, dt * (1 + k * 5));
      p.sb.place(nx, ny); p.x = nx; p.y = ny;
      for (let i = 0; i < 3; i++) if (Math.random() < dt * 40) { const a = Math.random() * Math.PI * 2, rr = R(2, 8); w.fx.emit('bubbleS', mo.x + this.dir * Math.abs(Math.cos(a)) * rr, mo.y + Math.sin(a) * rr * 0.7, { n: 1, vx: -this.dir * Math.abs(Math.cos(a)) * rr * 2, vy: -Math.sin(a) * rr * 1.4, life: 0.5, drag: 0 }); }
      if (this.gT > 1.8 || Math.hypot(p.x - tx, p.y - ty) < 0.6) { this.gCaught = true; this.gT = 0; }
      return;
    }
    const t = this.gT;
    if (t < 0.6) {
      this.m.setJaw(1.2);
      const tx = mo.x - this.dir * 0.3, ty = mo.y;
      p.sb.place(p.x + (tx - p.x) * Math.min(1, dt * 10), p.y + (ty - p.y) * Math.min(1, dt * 10));
      this.gulpFrom.x = mo.x; this.gulpFrom.y = mo.y;
    } else {
      if (p.obj.visible) {
        // SNAP
        p.obj.visible = false;
        this.m.setJaw(0); this.m.jaw = 0.4;
        w.sfx('chomp', this.x, 1, 0.45); w.sfx('gulp', this.x, 1, 0.6); w.sfx('thud_heavy', this.x, 0.8, 0.6);
        w.game.addShake(0.55); w.game.freeze(0.08);
        w.text.pop('GULP!', mo.x, mo.y + 1.6, 'shout', { size: 1.0, life: 1.4, vy: 0.4 });
        this.vortexSnd?.stop(0.2); this.vortexSnd = null;
        w.fx.emit('bubbleBig', mo.x, mo.y, { n: 18, spread: 1, speed: 2 });
      }
      this.m.setJaw(0);
      // the blobfish is a lump sliding down its throat; keep it with the camera's track for the fade
      const k = clamp((t - 0.6) / 1.3, 0, 1);
      const g = this.world(this.m.asset.anchors.belly ?? new THREE.Vector3());
      p.sb.place(mo.x + (g.x - mo.x) * k, mo.y + (g.y - mo.y) * k);
      if (t > 1.15) { POST.uFadeCol.value.set('#1a0206'); POST.uFade.value = clamp((t - 1.15) / 0.6, 0, 1); }
      if (t > 1.2 && t - dt <= 1.2) { w.sfx('heartbeat', this.x, 0.9, 0.7); w.sfx('gloop', this.x, 0.8, 0.5); }
      if (t >= 1.85) this.enterStomach(w);
    }
  }

  // ---------------------------------------------------------------- INSIDE
  private hideWorld(w: World) {
    const keep = new Set<THREE.Object3D>([this.obj, w.player.obj!, (w.fx as unknown as { object: THREE.Object3D }).object]);
    if (this.stomach) keep.add(this.stomach.group);
    // (the lighting rig stays; anything else that carries a light is the level's and goes dark with it)
    const hasLight = (o: THREE.Object3D) => !!o.userData.rig;
    this.hidden = [];
    for (const c of w.scene.children) {
      if (keep.has(c) || c.name === 'text3d' || hasLight(c)) continue;
      this.hidden.push([c, c.visible]); c.visible = false;
    }
    // the level's glow lamps would tint the flesh: dim them while we're inside (the blobfish lantern stays)
    const rig = rigOf(w.scene) as unknown as { slots?: { light: THREE.PointLight; kind: string }[] } | null;
    this.mutedLamps = [];
    for (const s of rig?.slots ?? []) if (s.kind === 'lamp' && s.light.distance !== 0 && Math.abs(s.light.position.y - w.player.y) > -1) {
      if (this.lamps.some((l) => l.light === s.light)) continue;
      if (s.light.position.distanceTo(new THREE.Vector3(w.player.x, w.player.y, 1.4)) < 3) continue; // the lantern
      this.mutedLamps.push([s.light, s.light.intensity]); s.light.intensity = 0;
    }
  }
  /**
   * (the dungeon calls this after the level has set its glow lamps) inside the stomach the rig's point lights are ours:
   * every pooled lamp but the blobfish's lantern becomes a stomach light: the valve's teal glow, a warm throb up in the
   * folds, the acid's sickly green
   */
  afterLevel() {
    const w = this.w, s = this.stomach;
    if (!w || !s) return;
    const rig = rigOf(w.scene) as unknown as { slots?: { light: THREE.PointLight; kind: string }[] } | null;
    const p = w.player, t = this.inT;
    const mine: [number, number, number, string, number, number][] = [
      [this.valve.x - 1.6, this.valve.y, 2.2, '#5affd0', 9 * (0.8 + s.valve.open * 0.5 + s.valve.flash), 14],
      [s.cx - 4 + s.slide, s.box.top - 1.2, 3, '#ff6a5a', 3.5 * (0.85 + 0.15 * Math.sin(t * 5.4)) * (1 + s.squeeze), 16],
      [clamp(p.x, s.box.x0 + 3, s.box.x1 - 3), s.acidY + 0.4, 2.4, '#b8ff40', 5, 11],
    ];
    let k = 0;
    for (const sl of rig?.slots ?? []) {
      if (sl.kind !== 'lamp' || k >= mine.length) continue;
      if (Math.hypot(sl.light.position.x - p.x, sl.light.position.y - p.y) < 2.5) continue;     // the lantern
      const [x, y, z, c, i, d] = mine[k++];
      sl.light.position.set(x, y, z); sl.light.color.set(c); sl.light.intensity = i; sl.light.distance = d; sl.light.decay = 1.2;
    }
  }
  private showWorld() {
    for (const [o, v] of this.hidden) o.visible = v;
    this.hidden = [];
    for (const [l, i] of this.mutedLamps) l.intensity = i;
    this.mutedLamps = [];
  }
  private enterStomach(w: World) {
    const a = this.arena, p = pl(w);
    const cx = (a.x0 + a.x1) / 2;
    const box: Arena = { x0: cx - 11.5, x1: cx + 11.5, floor: a.floor + 0.2, top: Math.min(a.top - 0.5, a.floor + 10.8) };
    const s = this.stomach = new Stomach(box);
    w.scene.add(s.group);
    this.hideWorld(w);
    this.obj.visible = false;
    const fx = w.fx as unknown as { amb: unknown; ambPrimed: boolean };
    this.savedAmb = fx.amb; fx.amb = null;
    setArena(w, s.box);
    (w.fx as unknown as { clear(): void }).clear();
    // the blobfish drops in through the gullet
    p.obj.visible = true;
    p.sb.place(s.gullet.x, box.top - 0.6); p.x = s.gullet.x; p.y = box.top - 0.6;
    p.push(2.5, -8);
    p.hooked = false; p.grabbedBy = null;
    this.mode = 'in'; this.st = 0; this.inT = 0;
    this.camCut++;
    this.contr = { t: 6, stage: 'idle', st: 0, dir: 1 };
    this.spitT = 4; this.fishT = 1.2; this.valveHits = 0;
    this.valve.x = s.valve.x - 0.6; this.valve.y = s.valve.y;
    const tp = s.turtlePos(); this.net.x = tp.x; this.net.y = tp.y;
    this.boil = audio.loop('lp_boil', 0.35);
    w.sfx('splash_b', p.x, 0.8, 0.6); w.sfx('gloop', p.x, 0.9, 0.6);
    const cy = (box.floor + box.top) / 2;
    this.later(0.5, () => { if (this.mode === 'in') { const c = this.cam(); w.text.pop('INSIDE THE GIANT', c?.x ?? cx, cy + 2.4, 'title', { size: 0.95, life: 2.6, vy: 0.05 }); w.sfx('jin_epic', cx, 0.4, 0.8); } });
    this.later(1.5, () => { if (this.mode === 'in') w.text.pop('SURVIVE, OR TEAR OPEN THE GLOWING VALVE', this.cam()?.x ?? cx, cy + 1.3, 'hint', { size: 0.42, life: 3, vy: 0.05 }); });
    (w as unknown as { god?: boolean }).god = this.wasGod;
  }
  private spawnSwallowed(w: World, n: number) {
    const s = this.stomach!, kinds = ['puffer', 'barracuda', 'lionfish', 'jelly'] as const;
    for (let i = 0; i < n; i++) {
      if (this.inside.filter((e) => e.alive && (e.hp ?? 1) > 0).length >= 3) break;
      const k = kinds[Math.floor(Math.random() * kinds.length)];
      const x = s.gullet.x + R(-0.8, 0.8), y = s.box.top - 0.8;
      const e = buildEnemy(w, k, x, y, { arena: s.box });
      if (e.hp !== undefined) { e.hp *= 0.8; if (e.maxHp) e.maxHp *= 0.8; }
      w.add(e); this.inside.push(e);
      w.fx.emit('bubbleBig', x, y, { n: 10, spread: 0.6, speed: 2 });
      w.sfx('gloop', x, 0.7, 0.8);
    }
  }
  private updInside(dt: number, w: World) {
    const s = this.stomach!, p = pl(w), b = s.box;
    this.inT += dt;
    POST.uLetterbox.value = Math.max(0, POST.uLetterbox.value - dt * 1.5);
    POST.uFade.value = Math.max(0, 1 - this.inT / 0.8);
    this.core.update(dt, w);
    const left = this.inDur - this.inT;
    // ---- contractions: a tell (the walls tremble and glow), a squeeze that shoves everything one way, a release
    const c = this.contr;
    c.st += dt;
    if (c.stage === 'idle') { c.t -= dt; if (c.t <= 0) { c.stage = 'tell'; c.st = 0; c.dir = p.x < (s.base.x0 + s.base.x1) / 2 ? 1 : -1; callout(w, 'CONTRACTION!', p.x, p.y + 1.4, 'danger', 0.5); w.sfx('uw_rumble', p.x, 1, 0.6); w.sfx('whale', p.x, 0.6, 0.35); } }
    else if (c.stage === 'tell') { s.tremble = 1; if (c.st > 1.1) { c.stage = 'squeeze'; c.st = 0; w.sfx('flood_rush', p.x, 0.8, 0.5); w.game.addShake(0.35); } }
    else if (c.stage === 'squeeze') {
      s.tremble = 0.4; s.squeeze = Math.min(1, s.squeeze + dt * 2.5);
      s.slide = damp(s.slide, c.dir * 3.2, 2.5, dt);
      p.applyForce(c.dir * 26, 0);
      for (const e of this.inside) if (e.alive) e.x += c.dir * dt * 3;
      if (c.st > 1.8) { c.stage = 'release'; c.st = 0; }
    } else { s.tremble = 0; s.squeeze = Math.max(0, s.squeeze - dt * 1.2); s.slide = damp(s.slide, 0, 1.2, dt); if (c.st > 1.4) { c.stage = 'idle'; c.t = R(5.5, 7.5); } }
    if (c.stage === 'idle') { s.squeeze = Math.max(0, s.squeeze - dt); s.slide = damp(s.slide, 0, 1.2, dt); }
    // ---- the acid rises and burns
    s.acidY = b.floor + 0.55 + 4.0 * clamp(this.inT / this.inDur, 0, 1) + (c.stage === 'squeeze' ? Math.sin(this.inT * 6) * 0.15 : 0);
    this.acidTick -= dt;
    if (p.alive && p.y - p.r * 0.5 < s.acidY) {
      if (this.acidTick <= 0) {
        this.acidTick = 0.65;
        w.hurtPlayer(0.5, p.x, p.y - 1, 'spike');
        w.fx.poison(p.x, p.y - 0.2, 6); w.sfx('steam', p.x, 0.5, 1.3);
        if (!this.acidTold) { this.acidTold = true; callout(w, 'ACID! STAY ABOVE IT', p.x, p.y + 1.3, 'danger', 0.45); }
      }
      if (Math.random() < dt * 20) w.fx.emit('bubbleS', p.x + R(-0.4, 0.4), p.y, { n: 1, vy: 1.2, color: '#d8ff80', life: 0.5 });
    }
    if (Math.random() < dt * 14) w.fx.emit('bubble', R(b.x0, b.x1), s.acidY - R(0.1, 1.5), { n: 1, vy: 0.8, size: R(0.06, 0.14), color: '#e8ff90', life: 0.8, z: R(-2, 1) });
    // ---- soft walls: the stomach pushes back (the box moves with the squeeze)
    const wall = (d: number, k: number) => (d < 0 ? 0 : d * k);
    p.applyForce(wall(b.x0 + 0.8 - p.x, 70) - wall(p.x - (b.x1 - 0.8), 70), -wall(p.y - (b.top - 0.6), 60));
    // ---- the valve spits acid, then gapes (the opening to strike)
    this.spitT -= dt;
    s.valve.open = damp(s.valve.open, this.spitT < 1 ? 1 : 0.45, 4, dt);
    if (this.spitT < 1 && this.spitT + dt >= 1) { glint(w, this.valve.x - 0.8, this.valve.y, { red: true, size: 1.2 }); w.sfx('lp_drip', this.valve.x, 0.8, 0.7); }
    if (this.spitT <= 0) {
      this.spitT = R(4.5, 6);
      const ox = this.valve.x - 1.2, oy = this.valve.y;
      const dx = p.x - ox, dy = p.y - oy, base = Math.atan2(dy, dx);
      for (const da of [-0.22, 0, 0.22]) w.add(new AcidGlob(ox, oy, Math.cos(base + da) * 8, Math.sin(base + da) * 8 + 2));
      w.sfx('squish', ox, 0.9, 0.6); w.sfx('gloop', ox, 0.7, 1.2);
    }
    this.valve.x = s.valve.x + s.slide - s.squeeze * 1.2 - 0.6; this.valve.y = s.valve.y;
    // ---- swallowed fish keep arriving down the gullet
    this.fishT -= dt;
    if (this.fishT <= 0) { this.fishT = R(8, 11); this.spawnSwallowed(w, this.inT < 2 ? 2 : 1); if (this.inT > 2) callout(w, 'MORE FISH SWALLOWED!', s.gullet.x + 2, b.top - 1.2, 'danger', 0.4); }
    // ---- the trapped turtle
    if (this.turtleFree < 0) { const tp = s.turtlePos(); this.net.x = tp.x; this.net.y = tp.y; }
    else {
      this.turtleFree += dt;
      const j = s.turtleProp!;
      j.bob = 0; j.slide = 0;
      const tx = p.x - p.facing * 1.6, ty = p.y + 1.1;
      j.x = damp(j.x, tx, 1.5, dt); j.y = damp(j.y, ty, 1.5, dt);
      j.obj.rotation.y = p.x > j.x ? 0.4 : Math.PI - 0.4;
      if (this.turtleFree > 0.8 && this.turtleFree - dt <= 0.8) { const ph = pl(w); ph.heal?.(2, w); w.fx.heal(p.x, p.y + 0.5, 5); w.text.pop('IT NUZZLES YOU  +20 HP', p.x, p.y + 1.6, 'heal', { size: 0.42, life: 1.8 }); }
    }
    // ---- heartbeat of the giant, the walls throb with it
    this.beat -= dt;
    if (this.beat <= 0) { this.beat = 1.15; w.sfx('heartbeat', p.x, 0.55, 0.55); POST.uPulse.value = Math.max(POST.uPulse.value, 0.35); }
    s.update(dt);
    // ---- the SURVIVE timer and the valve count: a small flat HUD panel, top centre (the kit's look)
    const secs = Math.max(0, Math.ceil(left));
    onScreenUI((ui) => {
      const pulse = left < 5 && Math.floor(left * 4) % 2 === 0;
      const w = 188, h = 60, x = Math.round(ui.w / 2 - w / 2), y = 10;
      ui.fill(x + 3, y + 5, w, h, '#000000', 0.14); ui.fill(x + 1, y + 2, w, h, '#000000', 0.22);
      ui.frame('wood', x, y, w, h);
      if (pulse) ui.rect(x + 1, y + 1, w - 2, h - 2, KC.red);
      ui.text('SURVIVE', x + 12, y + 11, { font: 'small', color: pulse ? KC.red2 : KC.gold, shadow: null });
      ui.text(`${secs}`, x + w - 12, y + 8, { font: 'big', color: pulse ? KC.red2 : KC.bone2, shadow: KC.ink, align: 'right' });
      ui.fill(x + 12, y + 35, w - 24, 1, '#06090e', 0.7); ui.fill(x + 12, y + 36, w - 24, 1, '#3e4b62', 0.8);
      ui.text('OR TEAR THE VALVE', x + 12, y + 41, { font: 'small', color: KC.dim, shadow: null });
      const n = this.valveNeed, ps = 6;
      for (let i = 0; i < n; i++) { const px = x + w - 12 - (n - i) * (ps + 3) + 3; ui.frame(i < this.valveHits ? 'brass' : 'slot', px, y + 41, ps, ps); }
    });
    this.title = `SURVIVE ${secs}`;
    if (left <= 0) this.beginCough(w, 'time');
  }

  // ---------------------------------------------------------------- THE COUGH
  private beginCough(w: World, why: 'time' | 'tore') {
    if (this.mode !== 'in') return;
    this.mode = 'cough'; this.cT = 0; this.coughWhy = why;
    const p = pl(w);
    this.wasGod = !!(w as unknown as { god?: boolean }).god;
    (w as unknown as { god?: boolean }).god = true;
    callout(w, why === 'tore' ? 'THE VALVE TEARS!' : 'YOU SURVIVED!', p.x, p.y + 1.5, 'gold', 0.6);
    w.sfx('whale', p.x, 1, 0.4); w.sfx('roar', p.x, 0.8, 0.6); w.sfx('flood_rush', p.x, 1, 0.7);
    w.game.addShake(0.6);
  }
  private exitStomach(w: World) {
    const s = this.stomach;
    for (const e of this.inside) if (e.alive) { e.alive = false; w.fx.emit('bubbleBig', e.x, e.y, { n: 6, spread: 0.4 }); }
    this.inside = [];
    for (const e of w.entities) if (e instanceof AcidGlob) e.alive = false;
    this.showWorld();
    for (const l of this.lamps) l.release();
    this.lamps = [];
    for (const sl of (rigOf(w.scene) as unknown as { slots?: { light: THREE.PointLight }[] } | null)?.slots ?? []) sl.light.decay = 2;
    const fx = w.fx as unknown as { amb: unknown; ambPrimed: boolean };
    fx.amb = this.savedAmb; fx.ambPrimed = false;
    this.boil?.stop(0.5); this.boil = null;
    // the freed turtle comes out with you, and leaves you a gift
    const freed = this.turtleFree >= 0;
    (w.fx as unknown as { clear(): void }).clear();
    s?.dispose(); this.stomach = null;
    setArena(w, this.arena);
    this.valve.x = this.valve.y = -1e4; this.net.x = this.net.y = -1e4;
    this.obj.visible = true;
    this.title = 'Whale Shark, Hooked and Starving';
    return freed;
  }
  private updCough(dt: number, w: World) {
    const p = pl(w);
    this.cT += dt;
    const t = this.cT;
    if (this.stomach) {
      // the great heave: everything squeezes to nothing, a pale flash
      const s = this.stomach;
      s.squeeze = Math.min(1, s.squeeze + dt * 3); s.tremble = 1;
      p.applyForce(40, 10);
      s.update(dt);
      POST.uFadeCol.value.set('#fff0e8'); POST.uFade.value = clamp(t / 0.5, 0, 1);
      if (t >= 0.5) {
        const freed = this.exitStomach(w);
        // out in the arena again: the whale shark mid-water, the blobfish shot out of its mouth
        const a = this.arena, cx = (a.x0 + a.x1) / 2;
        this.dir = p.x < cx ? -1 : 1;
        this.x = clamp(cx - this.dir * 3, a.x0 + 7, a.x1 - 7); this.y = a.floor + (a.top - a.floor) * 0.5;
        this.yaw = this.yawFor(this.dir); this.pitch = 0;
        this.obj.updateMatrixWorld(true);
        this.place(0, w);
        const mo = this.mouthW();
        p.sb.place(mo.x + this.dir * 1.2, mo.y); p.x = mo.x + this.dir * 1.2; p.y = mo.y;
        p.push(this.dir * 15, 4);
        w.text.pop('BLAAARGH!', mo.x, mo.y + 2, 'shout', { size: 1.0, life: 1.6, vy: 0.4 });
        w.sfx('splash_b', mo.x, 1, 0.5); w.sfx('gulp', mo.x, 1, 0.4); w.sfx('bubbles_a', mo.x, 1, 0.7);
        w.fx.emit('bubbleBig', mo.x, mo.y, { n: 30, spread: 1.2, speed: 4 });
        w.fx.emit('silt', mo.x + this.dir * 2, mo.y, { n: 10, size: 1.5, size1: 3, color: '#7a3a2a', alpha: 0.4, life: 2, drag: 2 });
        // the junk it couldn't stomach comes out too
        const flot: THREE.Object3D[] = [];
        try { flot.push(itemModel('oldBoot', { cell: 0.9 }), itemModel('rubberDuck', { cell: 0.6 })); } catch { /* */ }
        flot.push(buildBottle('#3aa858', 'g'), buildBottle('#a8602a', 'b'));
        flot.forEach((o, i) => { const e = new Flotsam(o, mo.x, mo.y + R(-0.3, 0.3), this.dir * R(7, 12), R(1, 5) + i * 0.5); w.add(e); });
        if (freed) {
          const tu = buildFish('sea_turtle', 7); tu.group.scale.setScalar(1.7);
          const g = new THREE.Group(); g.add(tu.group);
          const e = new FreedTurtle(g, tu, mo.x + this.dir * 2, mo.y + 1, this.dir);
          w.add(e);
          this.later(1.6, () => {
            if (!e.alive) return;
            w.text.pop('THANK YOU, LITTLE BLOB!', e.x, e.y + 1.2, 'heal', { size: 0.45, life: 2.4 });
            const ws = w as unknown as { spawnPickup?: (k: string, x: number, y: number, o: Record<string, unknown>) => unknown };
            if (ws.spawnPickup) ws.spawnPickup('item', e.x, e.y, { id: 'turtleShell', vx: 0, vy: 1.5 });
            else w.drop(e.x, e.y, { item: 'turtleShell', coins: 20 });
            ws.spawnPickup?.('pearl', e.x, e.y, { value: 5, vx: 1, vy: 2 });
          });
        }
        // it reels: the punish window
        const hp = this.maxHp * 0.3;
        if (this.hp > hp) this.hp = hp;
        this.phase = 3; this.onPhase(w, 3);
        w.emit('bossPhase', { id: this.bossId, phase: 3 });
        this.camCut++;
        this.m.flash(0.6, '#ffd0c0');
      }
      return;
    }
    POST.uFade.value = Math.max(0, POST.uFade.value - dt * 1.6);
    POST.uLetterbox.value = Math.max(0, POST.uLetterbox.value - dt * 0.8);
    this.m.setJaw(Math.sin(t * 9) > 0 ? 1.1 : 0.3);
    this.turn = Math.sin(t * 7) * 0.5;
    this.vx = damp(this.vx, -this.dir * 3, 3, dt); this.x += this.vx * dt;
    this.swim = 3;
    if (t > 1.6) {
      this.mode = 'out3'; this.st = 0;
      (w as unknown as { god?: boolean }).god = this.wasGod;
      this.queued = null; this.cycleI = 0; this.cd = 1;
      this.core.stagger(w, 2.6, 'broken');
      callout(w, 'IT\'S REELING! STRIKE!', this.x, this.y + 2.4, 'gold', 0.55);
      w.sfx('jin_good', this.x, 0.4);
    }
  }

  // ---------------------------------------------------------------- the end: the hook tears free, the giant swims off
  protected dying(dt: number, w: World) {
    w.game.timeScale = Math.min(1, 0.45 + this.st * 0.3);
    if (!this.hookOut && this.st > 0.3) {
      this.hookOut = true;
      this.hook.updateMatrixWorld(true);
      const hp = this.hook.getWorldPosition(new THREE.Vector3());
      this.m.group.remove(this.hook);
      const hk = buildHook(); hk.scale.setScalar(this.S * 0.85);
      w.add(new Flotsam(hk, hp.x, hp.y, this.dir * 3, 4));
      w.text.pop('THE HOOK TEARS FREE!', hp.x, Math.min(hp.y + 1.5, this.arena.top - 3), 'gold', { size: 0.7, life: 2.6, vy: 0.2 });
      w.sfx('hook_clink', hp.x, 1, 0.7); w.sfx('rope_snap', hp.x, 0.8); w.game.flash('#ffffff', 0.4); w.game.addShake(0.3);
      w.fx.sparks(hp.x, hp.y, 14, undefined, 4, '#fff0c0');
    }
    // the pain goes out of it: slow, calm, its mouth relaxes
    this.m.setJaw(0.25); this.pitchT = 0.1; this.swim = 1.2; this.turn = 0;
    this.vx = damp(this.vx, this.dir * 0.8, 1, dt); this.vy = damp(this.vy, this.y > this.arena.top - 4 ? 0 : 0.15, 1, dt);
    this.x += this.vx * dt; this.y += this.vy * dt;
    // (done inside the dungeon's 2.5 s grace after hp hits 0, so its VICTORY comes after the giant is free)
    if (this.st >= 2.2) {
      w.game.timeScale = 1;
      const cx = (this.arena.x0 + this.arena.x1) / 2;
      w.text.pop('THE GENTLE GIANT IS FREE', cx, this.arena.floor + (this.arena.top - this.arena.floor) * 0.66, 'gold', { size: 0.95, life: 4, vy: 0.05 });
      w.sfx('whale', this.x, 1, 0.55); w.sfx('jin_epic', this.x, 0.7);
      w.game.flash('#ffffff', 0.3);
      w.run.kills++;
      w.emit('kill', { kind: this.bossId, x: this.x, y: this.y, boss: true, elite: true, size: 'boss', family: this.family });
      w.emit('bossDefeated', { id: this.bossId, name: this.bossName });
      this.state = 'dead'; this.st = 0;
      this.onDefeated?.();
    }
  }
  protected deadPose(dt: number, _w: World) {
    // up and away into the light, slowly
    this.vx = damp(this.vx, this.dir * 3.2, 0.6, dt); this.vy = damp(this.vy, 0.7, 0.6, dt);
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.pitchT = 0.22; this.swim = 2.5;
    for (const b of this.boxes) b.alive = false;
    if (this.st > 6) { this.obj.scale.multiplyScalar(Math.exp(-dt * 1.5)); if (this.st > 8) this.alive = false; }
  }

  // ---------------------------------------------------------------- the dungeon's hooks: camera + light
  cam(): BossCam | null {
    const w = this.w; if (!w) return null;
    const p = w.player, a = this.arena;
    if (this.mode === 'gulp') {
      const mo = this.mouthW();
      if (!this.gCaught) return { x: (mo.x + p.x) / 2, y: (mo.y + p.y) / 2 + 0.5, dist: 15, k: 2.5 };
      const t = this.gT;
      if (t < 0.6) return { x: mo.x - this.dir * 1.5, y: mo.y + 0.4, dist: 12 - t * 3, k: 4 };
      return { x: p.x, y: p.y + 0.3, dist: Math.max(6.5, 10.2 - (t - 0.6) * 3.5), k: 3 };
    }
    if (this.mode === 'in' || (this.mode === 'cough' && this.stomach)) {
      const s = this.stomach!;
      return { x: clamp(p.x, s.cx - 3.5, s.cx + 3.5) + s.slide * 0.5, y: s.cy + 0.6, dist: 17.5, k: 3, cut: this.camCut };
    }
    if (this.mode === 'cough') { const mo = this.mouthW(); return { x: (mo.x + p.x) / 2, y: this.y + 0.5, dist: 19, k: 3, cut: this.camCut }; }
    if (this.state === 'dying' || this.state === 'dead') return { x: clamp(this.x, a.x0 + 10, a.x1 - 10), y: clamp(this.y, a.floor + 5, a.top - 4), dist: 22, k: 1.2 };
    if (this.state === 'dormant') return null;
    // the fight: pulled back so the giant reads whole, leaning toward it
    const tx = clamp(p.x + (this.x - p.x) * 0.3, a.x0 + 11, a.x1 - 11), ty = clamp(p.y + (this.y - p.y) * 0.25, a.floor + 5, a.top - 4.5);
    return { x: tx, y: ty, dist: 22.5, k: 2.2 };
  }
  /** the stomach's light: dark red flesh, bioluminescent teal, no sun, no caustics */
  look(L: Look): Look {
    if (!(this.mode === 'in' || (this.mode === 'cough' && this.stomach))) return L;
    return {
      ...L,
      scatterTop: '#3a0a12', scatterDeep: '#14030a', shallow: '#3a0a12', deep: '#14030a',
      sun: '#ffb0a0', sunI: 0.45, hemiSky: '#ff8a80', hemiGround: '#2a0610', hemi: 0.6,
      rays: 0, caustic: 0, depthMin: [0.95, 0.8, 0.8], depthExt: [0.001, 0.002, 0.002],
      fogNear: 8, fogK: 0.03, fogDeep: 30,
      rim: ['#ff9a8a', 0.3], fill: ['#ff7a7a', 0.35], split: ['#3a0a1a', '#ffd0a0', 0.12],
      bloom: 0.6, vignette: 0.5, saturation: 1.12, contrast: 1.1, exposure: Math.max(0.95, L.exposure),
    };
  }

  // ---------------------------------------------------------------- pose
  protected place(dt: number, w: World) {
    const p = w.player;
    this.yaw = damp(this.yaw, this.yawFor(this.dir), 1.6, dt);
    const turning = Math.abs(this.yaw - this.yawFor(this.dir));
    this.pitch = damp(this.pitch, this.pitchT + (this.outside && !this.core.attacking ? clamp(this.vy * 0.08, -0.15, 0.15) : 0), 3, dt);
    this.obj.position.set(this.x, this.y, -0.8);
    this.pivot.rotation.set(0, this.yaw, this.pitch);   // pitch = nose up (local, after the yaw)
    this.m.update(dt, this.swim, clamp(this.turn + (turning > 0.3 ? -this.dir * 0.8 : 0), -1, 1));
    this.turn = damp(this.turn, 0, 3, dt);
    if (!this.core.is('vortex') && !this.core.is('plankton')) this.gillPump(1 + Math.max(0, Math.sin(this.st * 1.7)) * 0.6);
    this.m.lookAt((p.x - this.x) * this.dir, p.y - this.y);
    this.m.flash(this.flash * 0.8);
    for (const r of this.riders) r.update(dt, this.swim * 0.3, 0);
    // the flank boxes follow the body (parked off-stage while we're inside it)
    const on = this.outside && (this.state === 'fight' || this.state === 'transition') && this.obj.visible;
    const half = this.m.length / 2;
    const xs = [half * 0.7, half * 0.25, -half * 0.2, -half * 0.6];
    this.boxes.forEach((b, i) => {
      if (!on) { b.x = b.y = -1e4; return; }
      const q = this.world([xs[i], 0, 0]); b.x = q.x; b.y = q.y;
    });
    this.r = on ? 1.0 : 0.01;
    // the tail-slam ground wave rolls out both ways along the seabed
    if (this.wave > 0) {
      this.wave += dt;
      const d = this.wave * 9;
      for (const sx of [-1, 1]) { const x = this.waveX + sx * d; if (Math.random() < dt * 30) w.fx.silt(x, this.waveY + 0.2, 3, 0.4); }
      const pp = pl(w);
      if (Math.abs(Math.abs(pp.x - this.waveX) - d) < 0.7 && pp.y < this.waveY + 1.3 && !this.waveHit) { this.waveHit = true; attackPlayer(w, { src: this, dmg: 1, x: this.waveX, y: this.waveY, kind: 'crush', unblockable: true, knock: 7, name: 'shockwave' }); }
      if (this.wave > 1.4) { this.wave = 0; this.waveHit = false; }
    }
  }
  private waveHit = false;

  dispose(w?: World) {
    super.dispose(w);
    if (this.stomach) { if (w) this.exitStomach(w); else this.stomach.dispose(); }
    this.showWorld();
    for (const l of this.lamps) l.release();
    this.vortexSnd?.stop(0.2); this.boil?.stop(0.2);
    if (w) { const p = pl(w); p.obj.visible = true; if (p.grabbedBy === this) { p.hooked = false; p.grabbedBy = null; } (w as unknown as { god?: boolean }).god = this.wasGod || (w as unknown as { god?: boolean }).god; }
    POST.uLetterbox.value = 0; POST.uFade.value = 0; POST.uFadeCol.value.set('#000000');
    this.gillPump(1);
    this.m.dispose(); for (const r of this.riders) r.dispose();
  }
}

/** the turtle you cut free: swims out with you, says thanks, heads off */
class FreedTurtle implements Entity {
  kind = 'freedTurtle'; team: Team = 'neutral'; vx = 0; vy = 0; r = 0; alive = true; t = 0;
  constructor(public obj: THREE.Object3D, public m: FishModel, public x: number, public y: number, public dir: number) {}
  update(dt: number) {
    this.t += dt;
    if (this.t > 2.4) { this.vx = damp(this.vx, this.dir * 3, 1, dt); this.vy = damp(this.vy, 1.5, 1, dt); }
    else { this.vx = damp(this.vx, this.dir * 0.5, 2, dt); this.vy = damp(this.vy, Math.sin(this.t * 2) * 0.4, 2, dt); }
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.obj.position.set(this.x, this.y, 0.3);
    this.obj.rotation.y = this.dir > 0 ? -0.4 : Math.PI + 0.4;
    this.m.update(dt, 1 + Math.abs(this.vx), 0);
    if (this.t > 6) { this.obj.scale.multiplyScalar(Math.exp(-dt * 3)); if (this.t > 7) this.alive = false; }
  }
  dispose() { this.m.dispose(); }
}
