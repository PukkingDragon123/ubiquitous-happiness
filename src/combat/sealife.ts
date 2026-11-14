// Hostile sea life for the dungeon arenas, rebuilt on the souls-like kit (EnemyCore): every attack has a
// wind-up pose + glint + sound; red glints can't be blocked; poise breaks stagger them; a perfect parry
// staggers them for a riposte. They live inside an Arena (no wave director, no shipwreck).
//   moray      hides in a wall den, head out; lunging bite (white), a red death-roll grab; relocates when hurt
//   crab       claws up as a shield (front guard: blows clang off; a heavy or a parry opens it), pinch combo,
//              a red claw slam with a floor shockwave
//   puffer     drifts in, gulps (red glint + danger ring) and blows up; a heavy bats it away like a bomb
//   jelly      drifts toward you; touching it stings; a tentacle lash (white), elites a red shock pulse
//   angler     the lure flares (red: look away or dodge) and blinds; then a lunging snap (white)
//   barracuda  stalks at range, quivers, and torpedo-dashes through you (every third dash red)
import * as THREE from 'three';
import type { World, Entity, DamageKind } from '../game/types';
import type { Arena } from './types';
import { Creature, sfx, SND } from '../creatures/base';
import { EnemyCore, type MoveDef } from './core';
import { attackPlayer } from './resolve';
import { dangerZone, glint } from './telegraph';
import { callout } from './feel';
import { clamp, damp } from '../core/math';
import { POST } from '../gfx/post';

const R = (a: number, b: number) => a + Math.random() * (b - a);

export interface FoeOpts { elite?: boolean; difficulty?: number; arena?: Arena | null }

/**
 * A sea creature on the souls kit. Two modes:
 *  - locked in an Arena (J's arena-lock encounters, boss rooms): always aware, clamped to the box;
 *  - roaming the open level (arena null): patrols round its home, notices the player (sight + line of
 *    sight, or being hit, or a nearby ally noticing), chases within a leash, and swims home when the
 *    player gets away (healing up on the way).
 */
export abstract class Foe extends Creature {
  core: EnemyCore;
  elite: boolean;
  diff: number;
  arena: Arena | null;
  home: { x: number; y: number };
  /** how far from home it will chase (m) */
  leash = 10;
  /** notice radius (m) */
  sight = 7;
  aware = false;
  returning = false;
  private lostT = 0;
  /** this frame's bounds (the arena, or the roaming box) */
  protected box: Arena;
  private roamBox: Arena;
  cd = R(0.8, 1.6);
  /** seconds since spawn (enemies hold off briefly when a fight starts) */
  age = 0;
  protected patrolPh = R(0, 6);
  constructor(kind: string, species: string, x: number, y: number, o: FoeOpts & { hp: number; poise: number; scale?: number; r?: number; speed?: number; gore?: string }) {
    super(kind, species, x, y, { hp: o.hp, scale: o.scale, r: o.r, speed: o.speed, gore: o.gore, coins: [0, 0] });
    this.elite = !!o.elite;
    this.diff = o.difficulty ?? 0;
    this.arena = o.arena ?? null;
    this.aware = !!this.arena;
    this.home = { x, y };
    this.roamBox = { x0: x - this.leash, x1: x + this.leash, floor: y - 6, top: y + 6 };
    this.box = this.arena ?? this.roamBox;
    const hpK = (1 + this.diff * 0.6) * (this.elite ? 1.7 : 1);
    this.hp = this.maxHp = Math.round(o.hp * hpK);
    this.core = new EnemyCore(this, { poise: o.poise * (this.elite ? 1.5 : 1), head: () => ({ x: this.x, y: this.y + this.r + 0.25 }) });
    this.core.speed = (this.elite ? 1.15 : 1) * (1 + this.diff * 0.12);
    this.core.dmgMul = 1 + this.diff * 0.3;
    this.core.onStagger = (_w, k) => { this.stun = Math.max(this.stun, k === 'flinch' ? 0.3 : 1.2); this.squashV += 10; this.model.setJaw(0.6); };
    if (this.elite) this.model.flash(0.6, '#ffd060');
  }
  /** lock into an arena (J's encounter lock) or release back to roaming (null) */
  bindArena(a: Arena | null) { this.arena = a; if (a) { this.aware = true; this.returning = false; } else { this.home = { x: this.x, y: this.y }; } }
  /** the box it lives in this frame: the arena, or home +- leash between the seabed and the surface */
  bounds(w: World): Arena {
    if (this.arena) return (this.box = this.arena);
    const b = (this.box = this.roamBox);
    b.x0 = this.home.x - this.leash; b.x1 = this.home.x + this.leash;
    b.floor = w.terrain.floorAt(this.x); b.top = w.water.heightAt(this.x) - 0.7;
    return b;
  }
  /** the seabed under x (arena floor or terrain, whichever is higher) */
  floorY(w: World, x = this.x) { return Math.max(this.arena ? this.arena.floor : -1e9, w.terrain.floorAt(x)); }
  inArena(margin = this.r) {
    const a = this.box;
    if (this.x < a.x0 + margin) { this.x = a.x0 + margin; this.vx = Math.abs(this.vx) * 0.4; }
    if (this.x > a.x1 - margin) { this.x = a.x1 - margin; this.vx = -Math.abs(this.vx) * 0.4; }
    if (this.y < a.floor + margin) { this.y = a.floor + margin; this.vy = Math.abs(this.vy) * 0.4; }
    if (this.y > a.top - margin) { this.y = a.top - margin; this.vy = -Math.abs(this.vy) * 0.4; }
  }
  /** become aware of the player (and wake nearby allies) */
  notice(w: World, why: 'sight' | 'hit' | 'ally' = 'sight') {
    if (this.aware) return;
    this.aware = true; this.returning = false; this.lostT = 0;
    if (why !== 'ally') {
      w.text.pop('!', this.x, this.y + this.r + 0.5, 'danger', { size: 0.45, life: 0.7 });
      sfx(w, SND.alert, this.x, 0.5, 1.2);
      for (const e of w.near(this.x, this.y, 6, 'enemy')) (e as unknown as { notice?: (w: World, why: string) => void }).notice?.(w, 'ally');
    }
    this.cd = Math.max(this.cd, 0.6);
  }
  private senses(dt: number, w: World, d: number) {
    if (this.arena) { this.aware = true; return; }
    const p = w.player;
    const seen = p.alive && d < this.sight && losClear(w, this.x, this.y, p.x, p.y);
    if (!this.aware) { if (seen && this.age > 0.4) this.notice(w); return; }
    // lost: out of the leash or out of sight for a while -> go home
    const out = Math.abs(p.x - this.home.x) > this.leash + 3 || !p.alive;
    this.lostT = seen ? 0 : this.lostT + dt;
    if ((out || this.lostT > 4) && !this.core.attacking) { this.aware = false; this.returning = true; }
  }
  /** pick and start an attack when free; return null to wait */
  abstract choose(w: World, d: number): MoveDef | null;
  /** behaviour per frame while aware (movement, poses, hitboxes); core.update already ran */
  abstract act(dt: number, w: World): void;
  /** behaviour per frame while unaware: patrol round home / swim home (default: free swimmers) */
  idle(dt: number, w: World) {
    if (this.returning) {
      this.seek(this.home.x, this.home.y, this.speedMax, 1.6, dt, 1);
      this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.15 * dt);
      if (Math.hypot(this.home.x - this.x, this.home.y - this.y) < 0.8) this.returning = false;
    } else {
      this.patrolPh += dt * 0.35;
      this.seek(this.home.x + Math.sin(this.patrolPh) * 3, this.home.y + Math.sin(this.patrolPh * 1.7) * 0.5, this.speedMax * 0.45, 1.2, dt, 1);
    }
    this.faceToward(this.vx, dt, 3);
    this.integrate(dt, 1.2);
    this.inArena();
    this.pose(dt, Math.hypot(this.vx, this.vy) + 0.2);
  }
  think(dt: number, w: World) {
    this.age += dt;
    const p = w.player;
    const d = Math.hypot(p.x - this.x, p.y - this.y);
    this.bounds(w);
    this.senses(dt, w, d);
    this.core.facing = this.facingDir();
    this.core.update(dt, w, () => ({ x: this.mouthX(), y: this.mouthY() }));
    if (this.aware && !this.core.busy && p.alive && this.age > 0.8) {
      this.cd -= dt;
      if (this.cd <= 0) { const m = this.choose(w, d); if (m) { this.core.start(m); this.onStart(w, m); } }
    }
    if (this.aware || this.core.busy) this.act(dt, w); else this.idle(dt, w);
    // elites shimmer gold now and then
    if (this.elite && Math.random() < dt * 2) w.fx.emit('sparkle', this.x + R(-0.3, 0.3), this.y + R(-0.2, 0.3), { n: 1, color: '#ffd060', life: 0.5 });
  }
  onStart(_w: World, _m: MoveDef) {}
  /** the souls-kit hit: guard / poise / numbers, then the creature's own reaction */
  hit(dmg: number, dirX: number, dirY: number, w: World, src: Entity | null, kind?: DamageKind): boolean {
    if (!this.alive || this.dying >= 0) return false;
    if (!this.aware) this.notice(w, 'hit');
    const d = this.core.receive(w, dmg, dirX, dirY, kind);
    if (d < 0) { this.squashV += 4; this.vx += dirX * 1.2; return false; }
    return super.hit(d, dirX, dirY, w, src, kind);
  }
  onParried(w: World) { this.core.parried(w); this.vx -= this.facingDir() * 3; this.model.flash(0.9, '#ffffff'); }
  /** kill: J drops the loot; we only report it */
  die(w: World) {
    if (this.dying >= 0) return;
    this.dying = 0;
    this.team = 'neutral';
    w.run.kills++;
    w.emit('kill', { kind: this.kind, x: this.x, y: this.y, elite: this.elite });
    sfx(w, ['pop1', 'pop_b', 'squish2'], this.x, 0.9, 0.9);
    w.fx.gore(this.x, this.y, 0.8, { x: 0, y: 1 });
    this.onDeath(w);
  }
  /** strike the player with the current move if (cx, cy, r) touches them */
  bite(w: World, cx: number, cy: number, r: number, o: { kind?: DamageKind } = {}) {
    if (this.core.phase !== 'active' || this.core.landed) return null;
    const p = w.player;
    if (Math.hypot(p.x - cx, p.y - cy) > r + p.r) return null;
    return this.core.strike(w, { x: cx, y: cy, kind: o.kind });
  }
}

/** line of sight through the terrain */
export function losClear(w: World, ax: number, ay: number, bx: number, by: number) {
  const d = Math.hypot(bx - ax, by - ay), n = Math.ceil(d / 0.5);
  for (let i = 1; i < n; i++) { const t = i / n; if (w.terrain.sdf(ax + (bx - ax) * t, ay + (by - ay) * t) < 0.05) return false; }
  return true;
}

// ============================================================================================ moray
const M_BITE: MoveDef = { id: 'bite', windup: 0.6, active: 0.2, recover: 0.75, dmg: 1, kind: 'bite' };
const M_GRAB: MoveDef = { id: 'deathRoll', windup: 0.85, active: 0.22, recover: 0.9, dmg: 2, unblockable: true, kind: 'bite', tellAt: 0.4 };
/** a moray in a wall den: only its head + neck are out; lunges along the den axis */
export class CombatMoray extends Foe {
  denX = 0; denY = 0; dirX = 1; dirY = 0;
  ext = 0.3; extT = 0.3; reach = 2.8;
  private hide = 0; private moveT = R(7, 11); private hurtN = 0;
  private body: THREE.Group;
  constructor(x: number, y: number, o: FoeOpts = {}) {
    super('moray', 'moray', x, y, { ...o, hp: 7, poise: 16, scale: 1.05, r: 0.32, gore: '#a08040' });
    this.avoidTerrain = false;
    this.body = this.obj;
    this.sight = 4.5;
    this.denX = x; this.denY = y;
  }
  onSpawn(w: World) { this.placeDen(w, this.x, this.y); }
  /** move the den to the nearest wall / floor point to (x, y): the arena's walls, or the level's rock */
  placeDen(w: World, x: number, y: number) {
    const a = this.arena;
    if (!a) {
      // walk down the terrain gradient onto the nearest rock surface; lunge out along its normal
      let px = x, py = y;
      for (let i = 0; i < 24; i++) { const d = w.terrain.sdf(px, py); if (Math.abs(d) < 0.05) break; const n = w.terrain.normal(px, py); px -= n.x * d; py -= n.y * d; }
      const n = w.terrain.normal(px, py);
      let ax = n.x, ay = n.y * 0.7;
      if (Math.abs(ax) < 0.2) ax = (Math.random() < 0.5 ? -0.6 : 0.6);
      const l = Math.hypot(ax, ay) || 1;
      this.denX = px - n.x * 0.1; this.denY = py - n.y * 0.1; this.dirX = ax / l; this.dirY = ay / l;
      this.facing = this.dirX >= 0 ? 1 : -1; this.yaw = this.facing > 0 ? 0 : -Math.PI;
      this.ext = 0; this.extT = 0.35;
      this.home = { x: this.denX, y: this.denY };
      return;
    }
    const dl = x - a.x0, dr = a.x1 - x, df = y - a.floor;
    if (df < Math.min(dl, dr) && df < 1.2) { this.denX = clamp(x, a.x0 + 1, a.x1 - 1); this.denY = a.floor - 0.1; this.dirX = Math.random() < 0.5 ? 0.45 : -0.45; this.dirY = 0.9; }
    else if (dl < dr) { this.denX = a.x0 - 0.1; this.denY = clamp(y, a.floor + 0.8, a.top - 1); this.dirX = 1; this.dirY = R(-0.15, 0.25); }
    else { this.denX = a.x1 + 0.1; this.denY = clamp(y, a.floor + 0.8, a.top - 1); this.dirX = -1; this.dirY = R(-0.15, 0.25); }
    const l = Math.hypot(this.dirX, this.dirY); this.dirX /= l; this.dirY /= l;
    this.facing = this.dirX >= 0 ? 1 : -1; this.yaw = this.facing > 0 ? 0 : -Math.PI;
    this.ext = 0; this.extT = 0.35;
  }
  /** morays never leave the den: unaware they just lurk */
  idle(dt: number, w: World) { this.act(dt, w); }
  choose(w: World, d: number): MoveDef | null {
    if (this.hide > 0) return null;
    const p = w.player;
    const hx = this.denX + this.dirX * this.reach * 0.35, hy = this.denY + this.dirY * this.reach * 0.35;
    const dx = p.x - hx, dy = p.y - hy, dd = Math.hypot(dx, dy) || 1;
    const ahead = (dx * this.dirX + dy * this.dirY) / dd;
    if (dd > this.reach + 0.8 || ahead < 0.3) return null;
    void d;
    this.cd = R(0.9, 1.6) / this.core.speed;
    // aim the lunge at the player (within a cone round the den axis)
    const ax = dx / dd, ay = dy / dd;
    const bx = this.dirX * 0.5 + ax * 0.5, by = this.dirY * 0.5 + ay * 0.5, bl = Math.hypot(bx, by) || 1;
    this.lungeX = bx / bl; this.lungeY = by / bl;
    return Math.random() < (this.elite ? 0.4 : 0.25) ? M_GRAB : M_BITE;
  }
  private lungeX = 1; private lungeY = 0;
  onStart(w: World, m: MoveDef) { sfx(w, m.unblockable ? ['boss_growl1', 'steam1'] : ['steam1', 'air1'], this.x, 0.6, m.unblockable ? 1.6 : 1.4); }
  act(dt: number, w: World) {
    const c = this.core, p = w.player;
    this.hide -= dt; this.moveT -= dt;
    // relocate: pull in, bubbles at the new den, pop out
    if (this.arena && (this.moveT <= 0 || this.hurtN >= 3) && !c.attacking && this.hide <= 0) {
      this.moveT = R(8, 12); this.hurtN = 0; this.hide = 1.3;
      const a = this.arena;
      const side = Math.random();
      const nx = side < 0.4 ? a.x0 + 0.5 : side < 0.8 ? a.x1 - 0.5 : R(a.x0 + 2, a.x1 - 2);
      const ny = side < 0.8 ? R(a.floor + 1, Math.min(a.top - 1, a.floor + 5)) : a.floor;
      this.pending = { x: nx, y: ny };
      sfx(w, ['bubbles_a', 'gloop1'], this.x, 0.5);
    }
    if (this.hide > 0) {
      this.extT = 0;
      if (this.hide < 0.6 && this.pending) { this.placeDen(w, this.pending.x, this.pending.y); w.fx.emit('bubble', this.denX + this.dirX * 0.3, this.denY + this.dirY * 0.3, { n: 14, spread: 0.3, speed: 1.4 }); this.pending = null; }
    } else if (c.phase === 'windup') {
      this.extT = 0.12; this.model.setJaw(0.9);
      if (Math.floor(c.t * 10) % 2 === 0) this.model.flash(0.3, c.move?.unblockable ? '#ff3020' : '#ffffff');
    } else if (c.phase === 'active') {
      this.extT = 1; this.model.setJaw(c.k < 0.6 ? 1.15 : 0.1);
      const hx = this.denX + this.lungeX * this.reach * this.ext, hy = this.denY + this.lungeY * this.reach * this.ext;
      const res = this.bite(w, hx + this.lungeX * 0.25, hy + this.lungeY * 0.25, 0.42);
      if (res === 'hit' && c.move?.unblockable) { (p as unknown as { push(x: number, y: number): void }).push(-this.lungeX * 6, -this.lungeY * 6); callout(w, 'DEATH ROLL', p.x, p.y + 1, 'danger', 0.4); }
      if (c.justEntered('active')) sfx(w, SND.swish, this.x, 0.9, 0.8);
    } else if (c.phase === 'recover') { this.extT = 0.85 - c.k * 0.5; this.model.setJaw(0.2); }
    else if (c.phase === 'stagger') { this.extT = 0.8; this.model.setJaw(0.5); }
    else { this.extT = 0.38 + Math.sin(this.t * 0.8) * 0.05; this.model.setJaw(0.25 + 0.25 * Math.max(0, Math.sin(this.t * 1.7))); }
    const lunging = c.phase === 'active' || c.phase === 'recover' || c.phase === 'stagger';
    const ax = lunging ? this.lungeX : this.dirX, ay = lunging ? this.lungeY : this.dirY;
    this.ext = damp(this.ext, this.extT, c.phase === 'active' ? 24 : 6, dt);
    this.x = this.denX + ax * this.reach * this.ext;
    this.y = this.denY + ay * this.reach * this.ext;
    // only the head is a target, and only when it's out
    this.r = this.ext > 0.15 ? 0.32 : 0.001;
    const nose = this.L / 2;
    this.yaw = ax >= 0 ? 0 : -Math.PI;
    this.pitch = Math.atan2(ay, Math.abs(ax));
    this.lookAtWorld(p.x, p.y);
    this.squashV += (-this.squash * 160 - this.squashV * 12) * dt; this.squash += this.squashV * dt;
    this.body.position.set(this.x - ax * nose, this.y - ay * nose, -0.05);
    this.pivot.rotation.set(0, this.yaw, this.pitch);
    const sq = clamp(this.squash, -0.3, 0.3);
    this.body.scale.set(1 + sq, 1 - sq, 1);
    this.body.visible = this.ext > 0.03;
    this.model.update(dt, c.phase === 'active' ? 3 : 0.5 + Math.abs(this.ext - this.extT) * 4, 0);
  }
  private pending: { x: number; y: number } | null = null;
  think(dt: number, w: World) { super.think(dt, w); }
  pose() { /* positioned in act() */ }
  onHit(w: World) { this.hurtN++; if (this.core.phase === 'windup' && !this.core.move?.unblockable) { /* flinch back into the den */ } void w; }
  updateDying(dt: number, w: World) {
    if (this.dying < 0) return false;
    this.extT = 0; this.ext = damp(this.ext, 0, 3, dt);
    return super.updateDying(dt, w);
  }
}

// ============================================================================================ crab
const C_PINCH: MoveDef = { id: 'pinch', windup: 0.45, active: 0.12, recover: 0.25, dmg: 1, kind: 'crush' };
const C_PINCH2: MoveDef = { id: 'pinch2', windup: 0.3, active: 0.12, recover: 0.55, dmg: 1, kind: 'crush' };
const C_SLAM: MoveDef = { id: 'slam', windup: 0.8, active: 0.16, recover: 0.8, dmg: 2, unblockable: true, kind: 'crush', tellAt: 0.38, hyper: true };
export class CombatCrab extends Foe {
  onGround = true; legH: number;
  private combo = 0; private open = 0;
  constructor(x: number, y: number, o: FoeOpts = {}) {
    super('crab', 'crab', x, y, { ...o, hp: 8, poise: 30, scale: 1.9, r: 0.42, speed: 1.9, gore: '#d8502a' });
    this.legH = 0.16 * this.baseScale;
    this.yaw = 0; this.facing = 1;
    this.core.guard = 'front';
    this.sight = 5;
    this.core.onStagger = (_w, k) => { if (k !== 'flinch') this.open = 2; this.stun = Math.max(this.stun, 0.6); };
  }
  facingDir() { return this.facing >= 0 ? 1 : -1; }
  idle(dt: number, w: World) {
    this.patrolPh += dt * 0.3;
    if (this.returning) { this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.15 * dt); if (Math.abs(this.home.x - this.x) < 0.5) this.returning = false; }
    this.act(dt, w);
  }
  choose(w: World, d: number): MoveDef | null {
    const p = w.player;
    if (Math.abs(p.x - this.x) > 1.9 || p.y - this.y > 2.2) return null;
    void d;
    this.cd = R(0.5, 1.1) / this.core.speed;
    if (Math.random() < (this.elite ? 0.35 : 0.22)) return C_SLAM;
    this.combo = 0;
    return C_PINCH;
  }
  onStart(w: World, m: MoveDef) { sfx(w, SND.click, this.x, 1, m.unblockable ? 0.8 : 1.3); }
  act(dt: number, w: World) {
    const c = this.core, p = w.player;
    const dx = p.x - this.x;
    const anim = this.model.anim;
    const fl = this.floorY(w);
    this.open -= dt;
    // the guard is up unless the crab is mid-swing, stunned, or recently cracked open
    c.guard = c.phase === 'idle' && this.open <= 0 ? 'front' : 'none';
    let want = 0;
    if (c.phase === 'idle' && !this.aware) {
      // patrol the seabed round home (or scuttle back)
      const tx = this.returning ? this.home.x : this.home.x + Math.sin(this.patrolPh) * 3;
      if (Math.abs(tx - this.x) > 0.3) want = Math.sign(tx - this.x) * this.speedMax * (this.returning ? 1 : 0.4);
      this.facing = want === 0 ? this.facing : want > 0 ? 1 : -1;
      anim.raise = damp(anim.raise ?? 0, 0.3, 4, dt);
    } else if (c.phase === 'idle') {
      if (Math.abs(dx) > 1.25) want = Math.sign(dx) * this.speedMax;
      else if (Math.abs(dx) < 0.8) want = -Math.sign(dx) * this.speedMax * 0.5;
      this.facing = dx >= 0 ? 1 : -1;
      anim.raise = damp(anim.raise ?? 0, this.open > 0 ? 0.1 : 0.75, 6, dt); anim.pinch = damp(anim.pinch ?? 0, 0, 6, dt);
    } else if (c.phase === 'windup') {
      anim.raise = damp(anim.raise ?? 0, 1, 10, dt); anim.pinch = 0;
      if (Math.floor(c.t * 10) % 2 === 0) this.model.flash(0.35, c.move?.unblockable ? '#ff3020' : '#ffffff');
      if (c.move?.id === 'slam') { this.pivot.position.y = c.k * 0.25; }
    } else if (c.phase === 'active') {
      anim.pinch = 1; anim.raise = damp(anim.raise ?? 0, c.move?.id === 'slam' ? 0 : 0.6, 20, dt);
      this.pivot.position.y = 0;
      if (c.justEntered('active')) {
        sfx(w, c.move?.id === 'slam' ? ['thud_heavy1', 'rock_hit1'] : SND.snip, this.x, 1);
        if (c.move?.id === 'slam') { w.game.addShake(0.2); w.fx.silt(this.x + this.facing * 0.6, fl + 0.1, 14); w.fx.shockwave(this.x + this.facing * 0.6, fl + 0.2, 1.2, '#ffd0a0'); }
      }
      if (c.move?.id === 'slam') {
        // claws + a shockwave along the floor
        if (!c.landed && Math.abs(p.x - (this.x + this.facing * 0.7)) < 1.8 && p.y - fl < 1.3) c.strike(w, { x: this.x + this.facing * 0.7, y: fl });
      } else this.bite(w, this.x + this.facing * 0.75, this.y + 0.3, 0.55, { kind: 'crush' });
      want = this.facing * 2;
    } else if (c.phase === 'recover') {
      anim.pinch = damp(anim.pinch ?? 0, 0, 6, dt); anim.raise = damp(anim.raise ?? 0, 0.3, 4, dt);
      // the pinch chains into a second snap
      if (c.move?.id === 'pinch' && this.combo === 0 && c.k > 0.4 && Math.abs(dx) < 2) { this.combo = 1; c.start(C_PINCH2); }
    } else if (c.phase === 'stagger') {
      anim.raise = damp(anim.raise ?? 0, 0, 8, dt); anim.pinch = 0.3;
      this.pivot.position.y = 0;
    }
    if (this.open > 0 && Math.random() < dt * 4) w.fx.emit('sparkle', this.x, this.y + 0.4, { n: 1, color: '#fff0a0', life: 0.4 });
    // walk the floor with gravity
    if (this.stun > 0) want = 0;
    this.vx = damp(this.vx, want, this.onGround ? 8 : 1, dt);
    const floor = fl + this.legH;
    if (this.y > floor + 0.02) { this.vy -= 9 * dt; this.onGround = false; }
    this.x += this.vx * dt; this.y += this.vy * dt;
    if (this.y <= floor) { if (!this.onGround && this.vy < -2) sfx(w, ['gravel1', 'uw_thud1'], this.x, 0.5); this.y = floor; this.vy = 0; this.onGround = true; }
    this.inArena(0.5); if (this.y < floor) this.y = floor;
    anim.walk = this.onGround ? this.vx : 0;
    this.obj.position.set(this.x, this.y, 0);
    this.squashV += (-this.squash * 160 - this.squashV * 12) * dt; this.squash += this.squashV * dt;
    const sq = clamp(this.squash, -0.3, 0.3);
    this.obj.scale.set(1 + sq, 1 - sq, 1 + sq * 0.5);
    this.pivot.rotation.set(0, clamp(dx * 0.15, -0.35, 0.35) + (this.facing < 0 ? Math.PI : 0) * 0, (this.dying >= 0 ? this.rollBias : 0), 'YZX');
    this.lookAtWorld(p.x, p.y);
    this.model.update(dt, 0, 0);
  }
  hit(dmg: number, dirX: number, dirY: number, w: World, src: Entity | null, kind?: DamageKind): boolean {
    const ok = super.hit(dmg, dirX, dirY, w, src, kind);
    if (ok) { this.vy = Math.max(this.vy, 1 + dirY * 2); this.onGround = false; }
    return ok;
  }
  get armoured() { return this.core.guard !== 'none'; }
}

// ============================================================================================ puffer
const P_BLOW: MoveDef = { id: 'blowup', windup: 1.1, active: 0.1, recover: 0.1, dmg: 2, unblockable: true, kind: 'explosion', tell: 'none' };
export class CombatPuffer extends Foe {
  private home: { x: number; y: number };
  private launched = 0;
  private puffK = 0;
  private wob = R(0, 6);
  constructor(x: number, y: number, o: FoeOpts = {}) {
    super('puffer', 'pufferfish', x, y, { ...o, hp: 4, poise: 10, scale: 1.45, speed: 1.6, gore: '#e0c070' });
    this.home = { x, y };
  }
  choose(w: World, d: number): MoveDef | null {
    if (d > 2.4) return null;
    void w;
    return P_BLOW;
  }
  onStart(w: World) {
    glint(w, this.x, this.y + 0.3, { red: true, size: 1 });
    dangerZone(w, this.x, this.y, 2.2, P_BLOW.windup / this.core.speed + 0.15, true, () => ({ x: this.x, y: this.y }));
    sfx(w, SND.inflate, this.x, 1, 0.8);
    callout(w, '!', this.x, this.y + 0.9, 'danger', 0.5);
  }
  act(dt: number, w: World) {
    const c = this.core, p = w.player;
    const dx = p.x - this.x, dy = p.y - this.y, d = Math.hypot(dx, dy) || 1;
    if (c.phase === 'windup') {
      this.puffK = damp(this.puffK, 1, 5, dt);
      this.model.setMorph(this.puffK);
      this.r = this.L * (0.32 + this.puffK * 0.2);
      if (Math.floor(c.t * (6 + c.k * 14)) % 2 === 0) this.model.flash(0.6, '#ff3020');
      this.steer(dx / d * 0.8, dy / d * 0.8, 1.5, dt);
      if (c.k > 0.5 && Math.random() < dt * 20) w.fx.emit('bubbleS', this.x, this.y, { n: 1, spread: 0.3 });
    } else if (c.phase === 'active' && c.justEntered('active')) { this.explode(w); return; }
    else if (c.phase === 'stagger') { this.puffK = damp(this.puffK, 0.5, 4, dt); this.model.setMorph(this.puffK); }
    else {
      this.puffK = damp(this.puffK, 0, 3, dt); this.model.setMorph(this.puffK); this.r = this.L * 0.32;
      // bumble toward the player, bobbing
      const tx = p.x - Math.sign(dx) * 1.2, ty = p.y + Math.sin(this.t * 1.3 + this.wob) * 0.6;
      if (this.age > 0.5) this.seek(tx, ty, this.speedMax, 1.2, dt, 1); else this.seek(this.home.x, this.home.y, 1, 1, dt);
    }
    if (this.launched > 0) {
      this.launched -= dt;
      // batted away: it blows on whatever it hits
      for (const e of w.near(this.x, this.y, this.r + 0.3, 'enemy')) if (e !== (this as Entity)) { this.explode(w); return; }
      if (this.x <= this.box.x0 + this.r + 0.05 || this.x >= this.box.x1 - this.r - 0.05 || w.terrain.sdf(this.x, this.y) < this.r) { this.explode(w); return; }
    }
    this.faceToward(Math.abs(this.vx) > 0.2 ? this.vx : dx, dt, 3);
    this.lookAtWorld(p.x, p.y);
    this.integrate(dt, this.launched > 0 ? 0.3 : 1.5);
    this.inArena();
    this.pose(dt, c.phase === 'windup' ? 0.2 : Math.hypot(this.vx, this.vy) + 0.3, c.phase !== 'windup');
  }
  /** a heavy (or a riposte) bats it across the room; anything else just knocks it */
  hit(dmg: number, dirX: number, dirY: number, w: World, src: Entity | null, kind?: DamageKind): boolean {
    const heavy = !!(src && src === (w.player as Entity) && (src as unknown as { combat?: { move: string | null } }).combat?.move === 'heavy');
    if (heavy && this.core.phase === 'windup') {
      this.vx = dirX * 13; this.vy = dirY * 6 + 2; this.launched = 1.2;
      callout(w, 'BATTED!', this.x, this.y + 0.8, 'gold', 0.4);
      w.sfx('boing', this.x, 0.9, 0.8);
      return true;
    }
    return super.hit(dmg, dirX, dirY, w, src, kind);
  }
  private explode(w: World) {
    if (this.dying >= 0) return;
    const R2 = 2.2;
    w.fx.explosion(this.x, this.y, 1.0);
    w.fx.emit('frost', this.x, this.y, { n: 16, speed: 5, color: '#f0e0a0' });
    w.sfx('boom_uw', this.x, 0.9); w.sfx('pop', this.x, 0.8, 0.6);
    w.game.addShake(0.3);
    const p = w.player;
    if (Math.hypot(p.x - this.x, p.y - this.y) < R2 + p.r) attackPlayer(w, { src: this, dmg: 2 * this.core.dmgMul, x: this.x, y: this.y, kind: 'explosion', unblockable: true, knock: 9, name: 'blowup' });
    for (const e of w.near(this.x, this.y, R2, 'enemy')) if (e !== (this as Entity) && e.hit) e.hit(3, Math.sign(e.x - this.x) || 1, 0.4, w, this, 'explosion');
    this.hp = 0;
    this.die(w);
    this.dying = 0.69;
  }
}

// ============================================================================================ jellyfish
const J_LASH: MoveDef = { id: 'lash', windup: 0.6, active: 0.2, recover: 0.6, dmg: 1, kind: 'zap' };
const J_PULSE: MoveDef = { id: 'pulse', windup: 0.9, active: 0.2, recover: 0.8, dmg: 1, unblockable: true, kind: 'zap', tellAt: 0.4 };
export class CombatJelly extends Foe {
  private drift = R(-0.3, 0.3);
  constructor(x: number, y: number, o: FoeOpts = {}) {
    super('jelly', 'jellyfish', x, y, { ...o, hp: 4, poise: 8, scale: R(1.15, 1.35), r: 0.34, gore: '#f0a0d8' });
    this.r = 0.3 * this.baseScale;
  }
  idle(dt: number, w: World) { this.act(dt, w); }
  choose(w: World, d: number): MoveDef | null {
    if (d > 2) return null;
    void w;
    this.cd = R(1.2, 2) / this.core.speed;
    return this.elite && Math.random() < 0.4 ? J_PULSE : J_LASH;
  }
  onStart(w: World, m: MoveDef) { sfx(w, SND.zap, this.x, 0.5, 1.6); if (m.unblockable) dangerZone(w, this.x, this.y - 0.3, 1.9, m.windup / this.core.speed + 0.2, true, () => ({ x: this.x, y: this.y - 0.3 })); }
  act(dt: number, w: World) {
    const c = this.core, p = w.player, s = this.baseScale;
    const ph = this.model.phase;
    const pulse = Math.pow(Math.max(0, Math.sin(ph)), 2);
    // drift toward the player (slowly) with bell pulses
    // aware: drift at the player; else bob round home
    const gx = this.aware ? p.x : this.home.x + Math.sin(this.t * 0.2) * 1.5, gy = this.aware ? p.y + 0.6 : this.home.y;
    const dx = gx - this.x, dy = gy - this.y, d = Math.hypot(dx, dy) || 1;
    if (c.phase === 'idle' && this.stun <= 0) { this.vx += (dx / d * 0.7 + this.drift - this.vx) * 0.6 * dt; this.vy += pulse * 1.1 * dt - 0.15 * dt + (dy / d) * 0.5 * dt; }
    if (c.phase === 'windup') { this.vx *= 0.95; this.vy *= 0.95; if (Math.floor(c.t * 12) % 2 === 0) this.model.flash(0.5, c.move?.unblockable ? '#ff3060' : '#ffd0ff'); }
    if (c.phase === 'active') {
      if (c.justEntered('active')) { w.fx.zaps(this.x, this.y - 0.4, c.move?.unblockable ? 6 : 3); w.sfx('zap', this.x, 0.8); }
      const r = c.move?.unblockable ? 1.9 : 1.3;
      this.bite(w, this.x, this.y - 0.5 * s, r, { kind: 'zap' });
    }
    this.integrate(dt, 0.9);
    this.inArena();
    // passive sting: touching the bell / tentacles
    const tx = clamp(p.x, this.x - 0.25 * s, this.x + 0.25 * s), ty = clamp(p.y, this.y - 1.0 * s, this.y);
    if (this.hitCd <= 0 && this.dying < 0 && Math.hypot(p.x - tx, p.y - ty) < p.r + 0.1 * s) {
      this.hitCd = 1.2;
      const r = attackPlayer(w, { src: null, dmg: 1, x: this.x, y: this.y, kind: 'zap', parryable: false, name: 'sting', guardDmg: 12 });
      if (r === 'hit') { w.fx.burst('zap', p.x, p.y, 6, 2.5, { color: '#ffb0f0' }); sfx(w, SND.zap, this.x, 1); }
    }
    if (Math.random() < dt * 0.8) w.fx.emit('glow', this.x + R(-0.2, 0.2) * s, this.y - R(0.2, 0.9) * s, { n: 1, size: 0.18, color: '#ff80d0', life: 0.8, alpha: 0.6 });
    this.obj.position.set(this.x, this.y, 0);
    this.squashV += (-this.squash * 160 - this.squashV * 12) * dt; this.squash += this.squashV * dt;
    const sq = clamp(this.squash + (c.phase === 'windup' ? c.k * 0.2 : 0), -0.3, 0.35);
    this.obj.scale.set(1 + sq, 1 - sq, 1 + sq);
    this.pivot.rotation.set(0, this.t * 0.2, clamp(-this.vx * 0.3, -0.3, 0.3));
    this.model.update(dt, 0.4 + pulse + (c.phase === 'active' ? 2 : 0), clamp(-this.vx * 0.8, -1, 1));
  }
  updateDying(dt: number, w: World) {
    if (this.dying < 0) return false;
    this.dying += dt;
    this.model.flash(1 - this.dying * 2, '#ffe0ff');
    this.obj.scale.setScalar(Math.max(0.01, 1 - this.dying * 1.6));
    if (this.dying > 0.5) { w.fx.burst('glow', this.x, this.y, 10, 2, { color: '#ff90e0' }); this.alive = false; }
    return true;
  }
}

// ============================================================================================ anglerfish
const A_FLASH: MoveDef = { id: 'lureFlash', windup: 0.9, active: 0.1, recover: 0.5, dmg: 0, unblockable: true, tellAt: 0.45 };
const A_SNAP: MoveDef = { id: 'snap', windup: 0.55, active: 0.22, recover: 0.7, dmg: 2, kind: 'bite' };
/** a short white-out: the lure's flash blinds whoever looks at it */
class Blind implements Entity {
  kind = 'blind'; team = 'neutral' as const; x = 0; y = 0; vx = 0; vy = 0; r = 0; alive = true; t = 0;
  constructor(public dur: number) {}
  update(dt: number) {
    this.t += dt;
    const k = 1 - this.t / this.dur;
    if (k <= 0) { this.alive = false; return; }
    POST.uFlash.value.set(0.82, 0.98, 1, Math.max(POST.uFlash.value.w, Math.min(0.92, k * 1.3)));
  }
}
export class CombatAngler extends Foe {
  private lureK = 1;
  private next: 'flash' | 'snap' = 'flash';
  constructor(x: number, y: number, o: FoeOpts = {}) {
    super('angler', 'anglerfish', x, y, { ...o, hp: 9, poise: 22, scale: 1.5, speed: 1.7, r: 0.46, gore: '#4a3438' });
  }
  private lure() { const a = this.model.asset.anchors.lure; return a ? { x: this.x + a.x * this.baseScale * this.facingDir(), y: this.y + a.y * this.baseScale } : { x: this.mouthX(), y: this.y + 0.5 }; }
  choose(w: World, d: number): MoveDef | null {
    void w;
    if (d > 6) return null;
    if (this.next === 'flash' && d < 5.5) { this.next = 'snap'; this.cd = 0.25; return A_FLASH; }
    if (d < 2.6) { this.next = Math.random() < 0.5 ? 'flash' : 'snap'; this.cd = R(0.9, 1.5); return A_SNAP; }
    return null;
  }
  onStart(w: World, m: MoveDef) { if (m.id === 'snap') sfx(w, ['gulp', 'gulp2'], this.x, 0.8, 0.8); else { w.sfx('heartbeat', this.x, 0.6, 1.4); } }
  act(dt: number, w: World) {
    const c = this.core, p = w.player;
    const dx = p.x - this.x, dy = p.y - this.y, d = Math.hypot(dx, dy) || 1;
    const lure = this.lure();
    if (c.is('lureFlash')) {
      if (c.phase === 'windup') { this.lureK = 1 + c.k * 2.5; this.steer(0, 0, 3, dt); if (Math.random() < dt * 20) w.fx.emit('glow', lure.x, lure.y, { n: 1, size: 0.4 + c.k, color: '#a0f8ff', life: 0.15 }); }
      if (c.phase === 'active' && c.justEntered('active')) {
        w.fx.emit('glow', lure.x, lure.y, { n: 1, size: 6, life: 0.3, color: '#e0ffff' });
        w.fx.light(lure.x, lure.y, '#c0ffff', 12, 0.25);
        w.sfx('k_glass', this.x, 0.8, 0.5);
        // blinded unless you dodged through it or were looking away
        const pl = p as unknown as { facing: number; combat?: { iframes: number } };
        const looking = Math.sign(this.x - p.x) === Math.sign(pl.facing || 1) && d < 8;
        if (looking && !((pl.combat?.iframes ?? 0) > 0)) { w.add(new Blind(1.5)); callout(w, 'BLINDED', p.x, p.y + 1, 'danger', 0.42); w.emit('blinded', {}); }
        else callout(w, 'LOOKED AWAY', p.x, p.y + 1, 'hint', 0.3);
      }
      if (c.phase === 'recover') this.lureK = damp(this.lureK, 0.3, 6, dt);
    } else if (c.is('snap')) {
      this.model.setJaw(c.phase === 'windup' ? 0.4 + c.k * 0.7 : c.phase === 'active' ? (c.k < 0.6 ? 1.15 : 0) : 0.1);
      if (c.phase === 'windup') { this.steer(-dx / d * 1.2, -dy / d * 0.6, 3, dt); if (Math.floor(c.t * 10) % 2 === 0) this.model.flash(0.3, '#ffffff'); }
      if (c.phase === 'active') {
        if (c.justEntered('active')) { this.vx = dx / d * 9; this.vy = dy / d * 9; }
        this.bite(w, this.mouthX(), this.mouthY(), 0.6);
        if (c.k > 0.5 && c.t - dt < c.move!.active * 0.5) { sfx(w, ['chomp1', 'crunch1'], this.x, 1, 0.7); w.game.addShake(0.1); }
      }
    } else if (c.phase === 'idle') {
      this.lureK = damp(this.lureK, 1 + Math.sin(this.t * 6) * 0.25, 4, dt);
      // stalk at a middle distance, a little above
      const want = 2.2;
      this.seek(p.x - Math.sign(dx || 1) * want, p.y + 0.4, this.speedMax, 1.4, dt, 1);
    }
    this.model.material.emissiveIntensity = 1.2 + this.lureK * 1.6;
    if (Math.random() < 0.15) w.fx.emit('glow', lure.x, lure.y, { n: 1, size: 0.35, color: '#7ff0ff', life: 0.4, alpha: 0.5 * Math.min(1, this.lureK) });
    if (c.phase !== 'active') this.faceToward(dx, dt, 2.5);
    this.lookAtWorld(p.x, p.y);
    this.integrate(dt, c.phase === 'active' ? 2.5 : 1.2);
    this.inArena();
    this.pose(dt, Math.hypot(this.vx, this.vy) + 0.2);
  }
}

// ============================================================================================ barracuda
const B_DASH: MoveDef = { id: 'dash', windup: 0.65, active: 0.45, recover: 0.9, dmg: 1.5, kind: 'bite' };
const B_RED: MoveDef = { id: 'frenzy', windup: 0.8, active: 0.5, recover: 1.1, dmg: 2, unblockable: true, kind: 'bite', tellAt: 0.4 };
export class CombatBarracuda extends Foe {
  private n = 0; private dirX = 1; private dirY = 0;
  constructor(x: number, y: number, o: FoeOpts = {}) {
    super('barracuda', 'barracuda', x, y, { ...o, hp: 6, poise: 14, scale: 1.15, speed: 2.8, r: 0.34, gore: '#b0c0d0' });
  }
  choose(w: World, d: number): MoveDef | null {
    const p = w.player;
    if (d > 7.5 || d < 2 || Math.abs(p.y - this.y) > 3) return null;
    this.n++;
    this.cd = R(1.4, 2.2) / this.core.speed;
    return this.n % 3 === 0 ? B_RED : B_DASH;
  }
  onStart(w: World) { callout(w, '!', this.x, this.y + 0.6, 'danger', 0.4); sfx(w, SND.alert, this.x, 0.8); }
  act(dt: number, w: World) {
    const c = this.core, p = w.player;
    const dx = p.x - this.x, dy = p.y - this.y, d = Math.hypot(dx, dy) || 1;
    if (c.phase === 'windup') {
      this.steer(0, 0, 6, dt);
      this.faceToward(dx, dt, 10);
      this.model.setJaw(0.5);
      if (Math.floor(c.t * 8) % 2 === 0) this.model.flash(0.5, c.move?.unblockable ? '#ff2a1a' : '#ffffff');
      this.pivot.position.set(Math.sin(c.t * 80) * 0.02 - this.facing * c.k * 0.2, 0, 0);
      this.pitchBias = clamp(Math.atan2(dy, Math.abs(dx)), -0.5, 0.5);
      // the line locks a beat before the dash so a side-step works
      if (c.k < 0.75) { this.dirX = dx / d; this.dirY = dy / d; }
    } else if (c.phase === 'active') {
      if (c.justEntered('active')) { this.pivot.position.set(0, 0, 0); sfx(w, ['magic_whoosh1', 'swish_c', 'swish_a'], this.x, 1, 1.1); w.fx.burst('bubble', this.x - this.facing * 0.5, this.y, 12, 2.5); }
      const sp = c.move?.unblockable ? 18 : 15;
      this.vx = this.dirX * sp; this.vy = this.dirY * sp;
      this.model.setJaw(1);
      if (Math.random() < dt * 30) w.fx.emit('bubble', this.x - this.facing * this.L * 0.4, this.y, { n: 1, spread: 0.1 });
      const res = this.bite(w, this.mouthX(), this.mouthY(), 0.42);
      if (res === 'parried' || res === 'blocked') { this.vx = -this.vx * 0.3; this.vy = -this.vy * 0.3; }
      // a red frenzy turns round once for a second pass
      if (c.move?.unblockable && c.k > 0.5 && c.landed === false && Math.sign(dx) !== Math.sign(this.dirX)) { this.dirX = dx / d; this.dirY = dy / d; this.faceToward(dx, 1, 99); }
    } else if (c.phase === 'recover' || c.phase === 'stagger') {
      this.steer(0, 0, 1.6, dt);
      this.model.setJaw(0);
      this.pitchBias = damp(this.pitchBias, 0, 3, dt);
      this.faceToward(dx, dt, 1.5);
    } else {
      // stalk 4-6 m away, level with the player
      this.seek(p.x - Math.sign(dx || 1) * 5, p.y, this.speedMax, 2, dt, 1.5);
      this.faceToward(dx, dt, 4);
      this.pitchBias = damp(this.pitchBias, 0, 3, dt);
    }
    this.lookAtWorld(p.x, p.y);
    this.integrate(dt, c.phase === 'active' ? 0.05 : 0.8);
    const wasX = this.x;
    this.inArena();
    if (c.phase === 'active' && this.x !== wasX) { c.cancel(); this.core.stagger(w, 0.6, 'flinch'); w.game.addShake(0.1); sfx(w, ['rock_hit1', 'uw_thud1'], this.x, 0.7); }
    this.pose(dt, c.phase === 'windup' ? 3 : Math.hypot(this.vx, this.vy), c.phase !== 'windup');
  }
}
