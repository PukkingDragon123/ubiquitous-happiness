// Bosses. Arena-scale creatures with a cinematic intro roar, three phases, clearly telegraphed attacks and a
// big death payoff (slow-mo, flash, roar, coin fountain, trophy drop). Long bodies are covered by BossPart
// hitbox entities that forward sword hits to the boss, so any player attack code that uses world.near / e.r
// works on them.
//
// Events emitted: 'bossIntro' {name}, 'bossPhase' {name, phase}, 'bossDefeated' {name, x, y},
// 'darkness' {k} (Mother Angler dims the world 0..1; also passed to opts.onDarkness).
import * as THREE from 'three';
import type { Entity, World, Team, DamageKind } from '../game/types';
import { Creature, sfx, SND } from './base';
import { Piranha } from './enemies';
import { damp, clamp } from '../core/math';

const R = (a: number, b: number) => a + Math.random() * (b - a);

/** a hit circle riding on a boss: forwards damage, never removed while the boss lives */
export class BossPart implements Entity {
  kind = 'bossPart'; team: Team = 'enemy';
  x = 0; y = 0; vx = 0; vy = 0; r: number; alive = true;
  boss: Boss; mult: number;
  constructor(boss: Boss, r: number, mult = 1) { this.boss = boss; this.r = r; this.mult = mult; }
  get hp() { return this.boss.hp; }
  get maxHp() { return this.boss.maxHp; }
  update() { if (!this.boss.alive || this.boss.dying >= 0) this.alive = false; this.team = this.boss.team; }
  hit(dmg: number, dx: number, dy: number, w: World, src: Entity | null, kind?: DamageKind) { return this.boss.hit(dmg * this.mult, dx, dy, w, src, kind); }
}

export abstract class Boss extends Creature {
  isBoss = true;
  bossName: string;
  phase = 1;
  intro = 0;
  introDone = false;
  arenaX: number; arenaY: number; arenaW = 13; arenaH = 5;
  parts: { part: BossPart; lx: number; ly: number }[] = [];
  partsAdded = false;
  state = 'intro'; st = 0;
  invuln = 0;
  slowmo = false;
  private bp: [number, number] = [0, 0];
  constructor(kind: string, species: string, name: string, x: number, y: number, o: ConstructorParameters<typeof Creature>[4]) {
    super(kind, species, x, y, o);
    this.bossName = name;
    this.arenaX = x; this.arenaY = y;
  }
  /** local x along the body (model units * scale) -> world point */
  bodyPoint(lx: number, ly = 0): [number, number] {
    const f = this.facingDir(), c = Math.cos(this.pitch), s = Math.sin(this.pitch);
    this.bp[0] = this.x + f * (lx * c - ly * s); this.bp[1] = this.y + lx * s + ly * c;
    return this.bp;
  }
  endSlowmo(w: World) { if (this.slowmo) { this.slowmo = false; w.game.timeScale = 1; } }
  addPart(r: number, lx: number, ly = 0, mult = 1) { this.parts.push({ part: new BossPart(this, r, mult), lx, ly }); }
  syncParts() {
    for (const { part, lx, ly } of this.parts) { const [px, py] = this.bodyPoint(lx, ly); part.x = px; part.y = py; part.vx = this.vx; part.vy = this.vy; }
  }
  /** contact damage from any part */
  touchParts(w: World, dmg: number, kind: DamageKind = 'crush') {
    if (this.hitCd > 0) return false;
    const p = w.player;
    for (const { part } of this.parts) if (Math.hypot(p.x - part.x, p.y - part.y) < part.r + p.r * 0.8) { w.hurtPlayer(dmg, part.x, part.y, kind); this.hitCd = 0.9; return true; }
    return false;
  }
  update(dt: number, w: World) {
    if (!this.partsAdded) { this.partsAdded = true; for (const { part } of this.parts) w.add(part); }
    this.invuln = Math.max(0, this.invuln - dt);
    super.update(dt, w);
    this.syncParts();
    // keep inside the arena
    if (this.dying < 0 && this.introDone) {
      if (this.x < this.arenaX - this.arenaW) this.vx += (this.arenaX - this.arenaW - this.x) * 4 * dt;
      if (this.x > this.arenaX + this.arenaW) this.vx -= (this.x - this.arenaX - this.arenaW) * 4 * dt;
    }
  }
  hit(dmg: number, dx: number, dy: number, w: World, src: Entity | null, kind?: DamageKind): boolean {
    if (!this.introDone || this.invuln > 0) { this.model.flash(0.3, '#a0a0a0'); return false; }
    const before = this.phase;
    // bosses barely budge: scale the knockback down by temporarily inflating mass
    const vx = this.vx, vy = this.vy;
    const ok = super.hit(dmg, dx, dy, w, src, kind);
    this.vx = vx + (this.vx - vx) * 0.12; this.vy = vy + (this.vy - vy) * 0.12;
    this.stun = 0;
    if (ok && this.dying < 0) {
      w.text.pop(String(dmg), this.x + R(-1, 1), this.y + 1.2, 'damage', { size: 0.35 });
      const f = this.hp / this.maxHp;
      this.phase = f > 0.66 ? 1 : f > 0.33 ? 2 : 3;
      if (this.phase !== before) {
        w.emit('bossPhase', { name: this.bossName, phase: this.phase });
        this.onPhase(w, this.phase);
      }
    }
    return ok;
  }
  onPhase(_w: World, _phase: number) {}
  /** shared cinematic intro: title cards + roar */
  introCard(w: World, sub: string) {
    w.emit('bossIntro', { name: this.bossName });
    const p = w.player;
    w.text.pop(this.bossName.toUpperCase(), p.x, p.y + 3.4, 'title', { size: 0.9, life: 2.8, vy: 0.15 });
    w.text.pop(sub, p.x, p.y + 2.5, 'item', { size: 0.42, life: 2.8, vy: 0.15 });
  }
  roar(w: World, big = true) {
    sfx(w, SND.roar, this.x, 1, big ? 0.75 : 0.95);
    sfx(w, SND.growl, this.x, 0.8, 0.8);
    w.game.addShake(big ? 0.55 : 0.3);
    this.model.setJaw(1.1);
    const [mx, my] = this.bodyPoint(this.L * 0.48);
    w.fx.burst('bubbleBig', mx, my, 12, 4);
    w.fx.burst('ring', mx, my, 3, 2, { size: 1.5, life: 0.6, color: '#d0f8ff' });
  }
  /** the big payoff */
  bossDeath(w: World, trophy: string) {
    w.game.freeze(0.25);
    w.game.flash('#ffffff', 0.9);
    w.game.addShake(0.9);
    w.game.timeScale = 0.35;
    this.slowmo = true;
    for (let i = 0; i < 24; i++) w.drop(this.x + R(-2.5, 2.5), this.y + R(-0.8, 1.6), { coins: 2 + Math.floor(Math.random() * 4) });
    w.drop(this.x, this.y + 0.5, { item: trophy });
    w.fx.burst('star', this.x, this.y, 40, 7, { color: '#fff0a0' });
    w.fx.burst('bubbleBig', this.x, this.y, 30, 6);
    w.emit('bossDefeated', { name: this.bossName, x: this.x, y: this.y });
  }
  /** slower, grander dying: belly-up roll, sink, bubbles, then gone */
  updateDying(dt: number, w: World): boolean {
    if (this.dying < 0) return false;
    this.dying += dt;
    if (this.dying > 0.4) this.endSlowmo(w);
    this.rollBias = Math.PI * Math.min(1, this.dying * 0.8);
    this.vy = damp(this.vy, -0.8, 1, dt); this.vx = damp(this.vx, 0, 1, dt);
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.model.setJaw(0.7);
    if (Math.random() < dt * 20) w.fx.emit('bubble', this.x + R(-this.L * 0.4, this.L * 0.4), this.y + R(-0.5, 0.5), { n: 1 });
    this.model.flash(Math.max(0, 0.8 - this.dying * 0.5) * (Math.sin(this.dying * 20) > 0 ? 1 : 0.4));
    this.pose(dt, 0.2, false);
    if (this.dying > 4) { w.fx.burst('bubbleBig', this.x, this.y, 20, 4); this.endSlowmo(w); this.alive = false; }
    return true;
  }
}

// ============================================================================================ Old Ichthy
// A 7 m tiger-striped ichthyosaur. Charges in straight lines (rears back + red pulse + growl first), chains bite
// combos up close, spins its tail in a ring sweep (phase 2+) and calls in piranha (phase 2+). Enraged at phase 3.
export class OldIchthy extends Boss {
  chargeDir = 0; chargeY = 0; combo = 0; summonT = 9; spin = 0; spinDir = 1; charges = 0;
  constructor(x: number, y: number) {
    super('ichthyosaur', 'ichthyosaur', 'Old Ichthy', x, y, { hp: 60, scale: 1, r: 1.0, speed: 4, coins: [0, 0], gore: '#e0ac3c' });
    this.addPart(0.75, 3.0, -0.05, 1.5);   // snout / jaws (weak spot: x1.5)
    this.addPart(0.9, 1.6);
    this.addPart(1.15, 0.2);
    this.addPart(0.8, -1.3);
    this.addPart(0.6, -2.7);
    this.facing = -1; this.yaw = -Math.PI;
    this.x = x + 11.5;
  }
  think(dt: number, w: World) {
    const p = w.player, dx = p.x - this.x, dy = p.y - this.y, d = Math.hypot(dx, dy);
    this.st += dt;
    const rage = this.phase === 3 ? 1.35 : 1;
    this.model.setJaw(0);
    switch (this.state) {
      case 'intro': {
        // glide in from the edge, stop, roar
        if (this.st < 2.2) { this.steer(-5.2, (this.arenaY - this.y) * 0.5, 2.2, dt); this.faceToward(-1, dt, 3); }
        else { this.steer(0, 0, 3, dt); this.faceToward(dx, dt, 3); }
        if (this.st > 2.2 && this.st - dt <= 2.2) { this.roar(w); this.introCard(w, 'The Tide Tyrant'); }
        if (this.st > 2.2 && this.st < 3.4) { this.model.setJaw(1.1); this.pitchBias = 0.25; }
        if (this.st > 3.6) { this.introDone = true; this.pitchBias = 0; this.go('cruise'); }
        break;
      }
      case 'cruise': {
        // circle the blobfish at a distance, eyes locked on
        const ang = this.t * 0.35;
        const tx = p.x + Math.cos(ang) * 7, ty = clamp(p.y + Math.sin(ang * 1.7) * 2, this.arenaY - this.arenaH, this.arenaY + this.arenaH * 0.6);
        this.seek(tx, ty, this.speedMax * rage, 1.1, dt, 2);
        this.faceToward(this.vx, dt, 2);
        this.summonT -= dt;
        if (this.phase >= 2 && this.summonT <= 0) { this.go('summon'); break; }
        if (d < 3.6 && this.st > 0.6) { this.go('bite'); this.combo = this.phase >= 2 ? 3 : 2; break; }
        if (this.phase >= 2 && d < 4.2 && dx * this.facingDir() < 0 && this.st > 1.2) { this.go('spinTell'); break; }
        if (this.st > (this.phase === 3 ? 1.6 : 2.6) && d > 4) { this.go('chargeTell'); this.charges = this.phase === 3 ? 2 : 1; }
        break;
      }
      case 'chargeTell': {
        // rear back, jaws open, red pulse, growl: then commit
        this.steer(-this.facingDir() * 1.2, 0, 4, dt);
        this.faceToward(dx, dt, 6);
        this.pitchBias = clamp(Math.atan2(dy, Math.abs(dx)), -0.45, 0.45) + 0.12;
        this.model.setJaw(0.9);
        if (Math.floor(this.st * 9) % 2 === 0) this.model.flash(0.45, '#ff2a1a');
        this.pivot.position.y = Math.sin(this.st * 60) * 0.04;
        if (this.st < dt * 1.5) { sfx(w, SND.growl, this.x, 1, 0.9); w.text.pop('!', this.x + this.facingDir() * 3, this.y + 1.6, 'danger', { size: 0.7, life: 0.7 }); }
        if (Math.random() < dt * 30) { const [ex, ey] = this.bodyPoint(2.25, 0.25); w.fx.emit('star', ex, ey, { n: 1, size: 0.3, color: '#ffe080', life: 0.25 }); }
        if (this.st > 0.85 / rage) {
          const l = d || 1; this.chargeDir = dx / l; this.chargeY = dy / l;
          this.pivot.position.y = 0;
          this.go('charge'); sfx(w, ['magic_whoosh1', 'swish_c'], this.x, 1, 0.6);
        }
        break;
      }
      case 'charge': {
        const sp = 14 * rage;
        this.vx = this.chargeDir * sp; this.vy = this.chargeY * sp;
        this.model.setJaw(1);
        if (Math.random() < dt * 40) w.fx.emit('bubble', this.x - this.facingDir() * 3, this.y + R(-0.4, 0.4), { n: 1 });
        if (this.touchParts(w, 2, 'bite')) { sfx(w, SND.bite, this.x, 1, 0.7); w.game.addShake(0.3); }
        const hitWall = w.terrain.sdf(this.x + this.vx * 0.15 + this.facingDir() * 3, this.y + this.vy * 0.15) < 0.5;
        const outside = Math.abs(this.x - this.arenaX) > this.arenaW + 2;
        if (this.st > 1.1 || hitWall || outside) {
          if (hitWall) { w.game.addShake(0.5); sfx(w, SND.thud, this.x, 1); w.fx.debrisBurst(this.x + this.facingDir() * 3.4, this.y, 14, '#8a7a60', 4, 0.12); }
          this.charges--;
          this.vx *= 0.3; this.vy *= 0.3;
          this.go(this.charges > 0 ? 'chargeTell' : 'recover');
        }
        break;
      }
      case 'bite': {
        // quick lunging snaps toward the blobfish
        const k = this.st % 0.5;
        this.faceToward(dx, dt, 8);
        if (k < 0.18) { this.model.setJaw(1.1); this.steer(dx * 2, dy * 2, 3, dt); }
        else { this.model.setJaw(0); this.steer(dx * 0.6, dy * 0.6, 4, dt); }
        if (k >= 0.18 && k - dt < 0.18) {
          sfx(w, ['chomp1', 'crunch1'], this.x, 1, 0.8);
          const [mx, my] = this.bodyPoint(3.2);
          if (Math.hypot(p.x - mx, p.y - my) < 1.1 + p.r) w.hurtPlayer(1, mx, my, 'bite');
          this.combo--;
        }
        if (this.combo <= 0 && k > 0.3) this.go('recover');
        break;
      }
      case 'spinTell':
        this.steer(0, 0, 4, dt);
        this.model.flash(Math.floor(this.st * 10) % 2 ? 0.5 : 0, '#ff3a1a');
        this.pitchBias = -this.st * 0.6;
        if (this.st < dt * 1.5) { sfx(w, ['uw_rumble1', 'lp_rumble'], this.x, 1); w.text.pop('!', this.x, this.y + 2, 'danger', { size: 0.7, life: 0.6 }); }
        if (this.st > 0.6) { this.go('spin'); this.spin = this.pitchBias; this.spinDir = 1; sfx(w, ['magic_whoosh1', 'swish_b'], this.x, 1, 0.5); }
        break;
      case 'spin': {
        // full somersault: the tail sweeps a ring around the body
        this.spin += dt * 9;
        this.pitchBias = this.spin;
        this.steer(0, 0, 4, dt);
        const [tx, ty] = this.bodyPoint(-3);
        if (Math.random() < dt * 50) w.fx.emit('bubble', tx, ty, { n: 2, spread: 0.3 });
        if (this.hitCd <= 0 && Math.hypot(p.x - tx, p.y - ty) < 1.3 + p.r) { w.hurtPlayer(1, this.x, this.y, 'crush'); p.push((dx / (d || 1)) * 9, (dy / (d || 1)) * 9 + 3); this.hitCd = 0.6; }
        if (this.spin > Math.PI * 2 - 0.6) {
          w.fx.burst('ring', this.x, this.y, 2, 1, { size: 6, life: 0.5, color: '#d0f8ff' });
          w.game.addShake(0.3);
          this.pitchBias = 0; this.pitch = 0; this.go('recover');
        }
        break;
      }
      case 'summon':
        this.steer(0, 0.5, 2, dt);
        this.faceToward(dx, dt, 3);
        if (this.st > 0.3 && this.st - dt <= 0.3) {
          this.roar(w, false);
          const n = this.phase === 3 ? 5 : 3;
          for (let i = 0; i < n; i++) {
            const side = i % 2 ? 1 : -1;
            w.add(new Piranha(p.x + side * R(7, 9), p.y + R(-2, 2)));
          }
          w.text.pop('PIRANHA SWARM!', p.x, p.y + 2, 'danger', { size: 0.45, life: 1.4 });
        }
        if (this.st > 1.2) { this.summonT = this.phase === 3 ? 10 : 14; this.go('cruise'); }
        break;
      case 'recover':
        this.steer(0, 0, 1.5, dt);
        this.faceToward(dx, dt, 2);
        this.pitchBias = damp(this.pitchBias, 0, 3, dt);
        if (this.st > 0.9 / rage) this.go('cruise');
        break;
    }
    if (this.state !== 'charge' && this.state !== 'intro') this.touchParts(w, 1, 'crush');
    if (this.phase === 3 && this.state !== 'chargeTell' && Math.sin(this.t * 6) > 0.9) this.model.flash(0.25, '#ff4020');
    if (this.state !== 'spin' && this.state !== 'spinTell' && this.state !== 'chargeTell') this.pitchBias = damp(this.pitchBias, 0, 2, dt);
    this.lookAtWorld(p.x, p.y);
    if (this.state !== 'spin' && this.state !== 'intro') this.avoid(w, dt);
    this.integrate(dt, this.state === 'charge' ? 0.05 : 0.7);
    this.pose(dt, Math.hypot(this.vx, this.vy) + 0.5, this.state !== 'spin' && this.state !== 'spinTell');
  }
  go(s: string) { this.state = s; this.st = 0; }
  onPhase(w: World, phase: number) {
    this.roar(w, phase === 3);
    w.text.pop(phase === 3 ? 'ENRAGED!' : 'IT GROWS ANGRY', this.x, this.y + 2, 'danger', { size: 0.55, life: 1.5 });
    this.summonT = 1.5;
    this.invuln = 0.8;
  }
  onDeath(w: World) { this.bossDeath(w, 'ichthy_fang'); }
  dispose(w: World) { this.endSlowmo(w); super.dispose(w); }
}

// ============================================================================================ Mother Angler
// A 5 m anglerfish matriarch. Pulls the darkness in phase by phase until only lures glow; sways her lure to
// draw you close, plants decoy lures that burst when touched, blinds with a lure flare and lunges with a jaw slam.
export class DecoyLure implements Entity {
  kind = 'decoyLure'; team: Team = 'enemy';
  x: number; y: number; vx = 0; vy = 0; r = 0.22; alive = true; hp = 1; maxHp = 1;
  obj = new THREE.Group(); t = 0; life: number; armed = 0.6;
  constructor(x: number, y: number, life = 7) {
    this.x = x; this.y = y; this.life = life;
    const core = new THREE.Mesh(DECOY_GEO, DECOY_MAT); this.obj.add(core);
    const halo = new THREE.Mesh(DECOY_GEO, DECOY_HALO); halo.scale.setScalar(2.4); this.obj.add(halo);
    this.obj.position.set(x, y, 0.1);
  }
  update(dt: number, w: World) {
    this.t += dt; this.life -= dt; this.armed -= dt;
    const p = w.player, dx = p.x - this.x, dy = p.y - this.y, d = Math.hypot(dx, dy) || 1;
    this.vx += (dx / d) * 0.6 * dt + Math.sin(this.t * 2) * 0.2 * dt; this.vy += (dy / d) * 0.6 * dt + Math.cos(this.t * 1.7) * 0.2 * dt;
    this.vx *= 0.98; this.vy *= 0.98;
    this.x += this.vx * dt; this.y += this.vy * dt;
    const pulse = 1 + Math.sin(this.t * 8) * 0.15;
    this.obj.position.set(this.x, this.y, 0.1); this.obj.scale.setScalar(pulse * Math.min(1, this.life));
    if (Math.random() < dt * 8) w.fx.emit('glow', this.x, this.y, { n: 1, size: 0.3, color: '#7ff0ff', life: 0.4, alpha: 0.6 });
    if (this.armed <= 0 && d < this.r + p.r) { w.hurtPlayer(1, this.x, this.y, 'zap'); this.pop(w, true); }
    if (this.life <= 0) this.alive = false;
  }
  pop(w: World, zap: boolean) {
    this.alive = false;
    w.fx.burst(zap ? 'zap' : 'glow', this.x, this.y, 10, 3, { color: '#a0f8ff' });
    sfx(w, zap ? SND.zap : ['pop1', 'pop_c'], this.x, 0.9);
  }
  hit(_d: number, _x: number, _y: number, w: World) { this.pop(w, false); return true; }
}
const DECOY_GEO = new THREE.SphereGeometry(0.12, 16, 10);
const DECOY_MAT = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 2.6, 2.8) });
const DECOY_HALO = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 0.6, 0.7), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });

export class MotherAngler extends Boss {
  light: THREE.PointLight;
  dark = 0; darkT = 0; lureK = 1; lureT = 1;
  slamDirX = 0; slamDirY = 0; decoyT = 6; onDarkness?: (k: number) => void;
  constructor(x: number, y: number, o: { onDarkness?: (k: number) => void } = {}) {
    super('mother_angler', 'anglerfish', 'Mother Angler', x, y, { hp: 70, scale: 8, r: 1.4, speed: 2.2, coins: [0, 0], gore: '#4a3438' });
    this.onDarkness = o.onDarkness;
    this.light = new THREE.PointLight('#8ff4ff', 0, 14, 1.4);
    const a = this.model.asset.anchors.lure;
    if (a) this.light.position.copy(a);
    this.model.group.add(this.light);
    this.addPart(1.5, 0.6, 0, 1);   // head / mouth
    this.addPart(1.3, -0.8, 0, 1);  // body
    this.addPart(0.6, -2.1, 0, 0.8); // tail
    this.x = x + 3; this.y = y - 6;
    this.facing = -1; this.yaw = -Math.PI;
  }
  setDark(w: World, k: number) {
    if (Math.abs(k - this.dark) < 0.01) return;
    this.dark = k;
    w.emit('darkness', { k });
    this.onDarkness?.(k);
  }
  think(dt: number, w: World) {
    const p = w.player, dx = p.x - this.x, dy = p.y - this.y, d = Math.hypot(dx, dy);
    this.st += dt;
    const phaseDark = [0, 0.35, 0.6, 0.85][this.phase];
    this.darkT = this.introDone ? phaseDark : this.darkT;
    this.setDark(w, damp(this.dark, this.darkT, 1.5, dt));
    this.model.setJaw(0.12);
    switch (this.state) {
      case 'intro':
        // darkness first; a lone light appears; then the shape behind it rises
        this.darkT = Math.min(0.5, this.st * 0.4);
        this.lureT = this.st > 1 ? 1.4 : 0;
        if (this.st > 1.8) this.seek(this.arenaX + 3, this.arenaY, 1.2, 1, dt, 1);
        this.faceToward(dx, dt, 2);
        if (this.st > 3.4 && this.st - dt <= 3.4) { this.roar(w); this.introCard(w, 'Queen of the Lightless Deep'); }
        if (this.st > 3.4 && this.st < 4.5) this.model.setJaw(1.15);
        if (this.st > 4.8) { this.introDone = true; this.go('hover'); }
        break;
      case 'hover': {
        const ang = this.t * 0.25;
        this.seek(p.x + Math.cos(ang) * 6.5, p.y + 1.2 + Math.sin(ang * 1.3) * 1.5, this.speedMax, 1, dt, 2);
        this.faceToward(dx, dt, 1.5);
        this.lureT = 1 + Math.sin(this.t * 2.5) * 0.3;
        this.decoyT -= dt;
        if (this.phase >= 2 && this.decoyT <= 0) { this.go('decoys'); break; }
        if (this.st > (this.phase === 3 ? 2 : 3.2)) this.go(this.phase === 3 && Math.random() < 0.5 ? 'flare' : 'slamTell');
        break;
      }
      case 'flare':
        // the lure blazes: blinding white, then straight into a slam
        this.steer(0, 0, 3, dt);
        this.lureT = this.st < 0.5 ? 1 + this.st * 6 : 0;
        if (this.st > 0.5 && this.st - dt <= 0.5) { w.game.flash('#e8ffff', 0.75); sfx(w, ['shimmer2', 'magic2'], this.x, 1); }
        if (this.st > 0.7) this.go('slamTell');
        break;
      case 'slamTell':
        // the light goes out... two eyes glint in the dark... growl
        this.steer(-dx * 0.2, -dy * 0.2, 2, dt);
        this.faceToward(dx, dt, 4);
        this.lureT = 0;
        if (this.st < dt * 1.5) sfx(w, SND.growl, this.x, 1, 0.7);
        if (Math.random() < dt * 25) for (const s of [0.9, 1.1]) { const [ex, ey] = this.bodyPoint(this.L * 0.3 * s, this.L * 0.12); w.fx.emit('star', ex, ey, { n: 1, size: 0.35, color: '#c8ffff', life: 0.2 }); }
        if (this.st > (this.phase === 3 ? 0.55 : 0.8)) {
          const l = d || 1; this.slamDirX = dx / l; this.slamDirY = dy / l;
          this.go('slam'); sfx(w, ['magic_whoosh1', 'swish_c'], this.x, 1, 0.55);
        }
        break;
      case 'slam': {
        this.vx = this.slamDirX * 9; this.vy = this.slamDirY * 9;
        this.model.setJaw(this.st < 0.55 ? 1.2 : 0);
        if (this.st > 0.55 && this.st - dt <= 0.55) {
          // the jaws slam shut: shockwave
          sfx(w, ['chomp1', 'crunch1'], this.x, 1, 0.5); sfx(w, SND.boom, this.x, 0.8, 0.9);
          w.game.addShake(0.6);
          const [mx, my] = this.bodyPoint(this.L * 0.4);
          w.fx.burst('ring', mx, my, 2, 1, { size: 4, life: 0.5, color: '#c0f8ff' });
          w.fx.burst('bubbleBig', mx, my, 16, 4);
          if (Math.hypot(p.x - mx, p.y - my) < 1.6 + p.r) w.hurtPlayer(2, mx, my, 'bite');
        }
        if (this.st > 0.8) { this.vx *= 0.3; this.vy *= 0.3; this.go('recover'); }
        break;
      }
      case 'decoys':
        this.steer(0, 0, 2, dt);
        this.lureT = 1.6;
        if (this.st > 0.4 && this.st - dt <= 0.4) {
          const n = this.phase === 3 ? 6 : 4;
          for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; w.add(new DecoyLure(p.x + Math.cos(a) * 3.5, p.y + Math.sin(a) * 2.5)); }
          sfx(w, ['shimmer1', 'magic1'], this.x, 0.9);
          w.text.pop('WHICH LIGHT IS REAL?', p.x, p.y + 2, 'magic', { size: 0.4, life: 1.6 });
        }
        if (this.st > 1) { this.decoyT = this.phase === 3 ? 7 : 10; this.go('hover'); }
        break;
      case 'recover':
        this.steer(0, 0, 1.2, dt);
        this.lureT = 1;
        if (this.st > 1.1) this.go('hover');
        break;
    }
    if (this.state !== 'intro' && this.state !== 'slam') this.touchParts(w, 1, 'crush');
    this.lureK = damp(this.lureK, this.lureT, 6, dt);
    this.light.intensity = 5 * this.lureK * (0.9 + 0.1 * Math.sin(this.t * 13));
    this.model.material.emissiveIntensity = 0.6 + this.lureK * 2.4;
    this.lookAtWorld(p.x, p.y);
    if (this.state !== 'intro') this.avoid(w, dt);
    this.integrate(dt, this.state === 'slam' ? 0.1 : 0.8);
    this.pose(dt, Math.hypot(this.vx, this.vy) + 0.3);
  }
  go(s: string) { this.state = s; this.st = 0; }
  onPhase(w: World, phase: number) {
    this.roar(w, phase === 3);
    w.text.pop(phase === 3 ? 'THE DARK DEEPENS' : 'THE LIGHTS GO OUT', this.x, this.y + 2, 'magic', { size: 0.5, life: 1.6 });
    this.invuln = 0.8; this.decoyT = 1;
  }
  onDeath(w: World) {
    this.setDark(w, 0); this.darkT = 0;
    this.light.intensity = 0;
    this.bossDeath(w, 'angler_lantern');
  }
  updateDying(dt: number, w: World) {
    if (this.dying >= 0) { this.setDark(w, damp(this.dark, 0, 2, dt)); this.light.intensity = Math.max(0, 8 * (1 - this.dying)); }
    return super.updateDying(dt, w);
  }
  dispose(w: World) { this.endSlowmo(w); this.setDark(w, 0); this.light.dispose(); super.dispose(w); }
}
