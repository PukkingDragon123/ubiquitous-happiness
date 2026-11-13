// Hostile creatures. Every attack is telegraphed (a pause, a red pulse, an open jaw, a sound) so the blobfish
// can read and dodge it; only a couple of piranhas commit to a dash at once.
import * as THREE from 'three';
import type { World, DamageKind } from '../game/types';
import { Creature, sfx, SND } from './base';
import { damp, clamp } from '../core/math';

const R = (a: number, b: number) => a + Math.random() * (b - a);

/** attack tokens per world: limits simultaneous dashing attackers */
const tokens = new WeakMap<World, { n: number }>();
function takeToken(w: World, max: number) { let t = tokens.get(w); if (!t) tokens.set(w, (t = { n: 0 })); if (t.n >= max) return false; t.n++; return true; }
function giveToken(w: World) { const t = tokens.get(w); if (t) t.n = Math.max(0, t.n - 1); }

function alertPop(w: World, x: number, y: number) { w.text.pop('!', x, y, 'danger', { size: 0.4, life: 0.6 }); }

// ============================================================================================ piranha
// Swarm biter: loose school that circles the blobfish, then one at a time winds up (jaw open, red pulse) and
// darts in for a nip, retreating after.
export class Piranha extends Creature {
  state: 'roam' | 'circle' | 'windup' | 'dash' | 'retreat' = 'roam';
  st = 0; orbit = R(0, Math.PI * 2); orbitR = R(1.8, 2.8); cd = R(1, 3); hasToken = false;
  dashX = 0; dashY = 0; nbT = 0; nbN = 0; nbX = 0; nbY = 0;
  homeX: number; homeY: number;
  constructor(x: number, y: number) {
    super('piranha', 'piranha', x, y, { hp: 2, scale: 1.3, coins: [1, 2], gore: '#c83a2a', speed: 4.2, loot: [{ item: 'piranha_tooth', chance: 0.08 }] });
    this.homeX = x; this.homeY = y;
  }
  think(dt: number, w: World) {
    const p = w.player, dx = p.x - this.x, dy = p.y - this.y, d = Math.hypot(dx, dy);
    this.st += dt; this.cd -= dt;
    const sp = this.speedMax;
    if (this.stun > 0) { if (this.hasToken) { giveToken(w); this.hasToken = false; } this.state = 'retreat'; this.st = 0; }
    switch (this.state) {
      case 'roam': {
        // school with nearby piranhas, drift around home
        this.nbT -= dt;
        if (this.nbT <= 0) {
          this.nbT = 0.3; let cx = 0, cy = 0, n = 0;
          for (const e of w.near(this.x, this.y, 3, 'enemy')) if (e !== this && e.kind === 'piranha') { cx += e.x; cy += e.y; n++; }
          this.nbN = n; this.nbX = n ? cx / n : 0; this.nbY = n ? cy / n : 0;
        }
        const n = this.nbN, cx = this.nbX * n, cy = this.nbY * n;
        const tx = n ? cx / n : this.homeX + Math.sin(this.t * 0.4 + this.orbit) * 3, ty = n ? cy / n : this.homeY + Math.cos(this.t * 0.3) * 1.2;
        this.seek(tx + Math.sin(this.t * 1.3 + this.orbit) * 1.2, ty + Math.cos(this.t * 0.9) * 0.6, sp * 0.4, 2, dt, 1);
        this.faceToward(this.vx, dt);
        if (d < 7 && !p.hooked) { this.state = 'circle'; this.st = 0; }
        break;
      }
      case 'circle': {
        this.orbit += dt * (0.9 + (this.orbitR < 2.2 ? 0.4 : 0)) * (this.facing > 0 ? 1 : -1) * 0.8;
        const tx = p.x + Math.cos(this.orbit) * this.orbitR, ty = p.y + Math.sin(this.orbit) * this.orbitR * 0.6;
        this.seek(tx, ty, sp * 0.75, 3, dt, 0.6);
        this.faceToward(dx * 0.3 + this.vx, dt, 7);
        this.lookAtWorld(p.x, p.y);
        if (d > 10) { this.state = 'roam'; break; }
        if (this.cd <= 0 && d < 3.6 && takeToken(w, 2)) { this.hasToken = true; this.state = 'windup'; this.st = 0; sfx(w, ['fish_squeak1', 'squeak1'], this.x, 0.5, 1.4); }
        break;
      }
      case 'windup': {
        // back off a touch, quiver, open the jaws, flash red
        this.steer(-dx / (d || 1) * 1.2, -dy / (d || 1) * 1.2, 6, dt);
        this.faceToward(dx, dt, 12);
        this.model.setJaw(1);
        this.lookAtWorld(p.x, p.y);
        if (Math.floor(this.st * 12) % 2 === 0) this.model.flash(0.45, '#ff3020');
        this.pivot.position.y = Math.sin(this.st * 70) * 0.012;
        if (this.st > 0.38) {
          const lead = 0.18;
          const tx = p.x + p.vx * lead - this.x, ty = p.y + p.vy * lead - this.y, l = Math.hypot(tx, ty) || 1;
          this.dashX = tx / l; this.dashY = ty / l;
          this.state = 'dash'; this.st = 0; this.pivot.position.y = 0;
          sfx(w, SND.swish, this.x, 0.6, 1.4);
        }
        break;
      }
      case 'dash': {
        this.vx = this.dashX * 10; this.vy = this.dashY * 10;
        this.faceToward(this.dashX, dt, 20);
        this.model.setJaw(this.st < 0.2 ? 1 : 0);
        if (this.touchPlayer(w, 1, 'bite', this.mouthX(), this.mouthY(), 0.22, 0.6)) {
          sfx(w, SND.bite, this.x, 1, 1.2);
          w.fx.burst('spark', p.x, p.y, 6, 3, { color: '#ffe0d0' });
          this.st = 1;
        }
        if (this.st > 0.32) { this.state = 'retreat'; this.st = 0; this.model.setJaw(0); }
        break;
      }
      case 'retreat': {
        if (this.hasToken) { giveToken(w); this.hasToken = false; }
        this.steer(-dx / (d || 1) * sp, -dy / (d || 1) * sp * 0.6 + 0.4, 4, dt);
        this.faceToward(this.vx, dt);
        this.model.setJaw(0);
        if (this.st > 0.8) { this.state = 'circle'; this.cd = R(1.8, 3.5); this.orbitR = R(1.8, 2.9); }
        break;
      }
    }
    this.avoid(w, dt);
    this.integrate(dt, this.state === 'dash' ? 0.2 : 1.2);
    this.pose(dt);
  }
  onDeath(w: World) { if (this.hasToken) { giveToken(w); this.hasToken = false; } }
  dispose(w: World) { if (this.hasToken) giveToken(w); super.dispose(w); }
}

// ============================================================================================ pufferfish
// Bumbles about; when threatened it gulps water and becomes a spiky ball that hurts to touch, then deflates.
export class Pufferfish extends Creature {
  puffed = 0; puffT = 0; homeX: number; homeY: number; wob = R(0, 6);
  constructor(x: number, y: number) {
    super('pufferfish', 'pufferfish', x, y, { hp: 3, scale: 1.35, coins: [1, 3], gore: '#e0c070', speed: 1.4, loot: [{ item: 'puffer_spine', chance: 0.15 }] });
    this.homeX = x; this.homeY = y;
  }
  inflate(w: World) {
    if (this.puffed) { this.puffT = 3; return; }
    this.puffed = 1; this.puffT = 3;
    this.model.setMorph(1);
    this.squashV += 14;
    sfx(w, SND.inflate, this.x, 0.9);
    w.fx.burst('bubble', this.x, this.y, 10, 2);
    this.r = this.L * 0.5;
  }
  think(dt: number, w: World) {
    const p = w.player, dx = p.x - this.x, dy = p.y - this.y, d = Math.hypot(dx, dy);
    if (!this.puffed) {
      // pootle around home, keep a wary distance
      const tx = this.homeX + Math.sin(this.t * 0.35 + this.wob) * 2.5, ty = this.homeY + Math.sin(this.t * 0.6 + this.wob) * 0.6;
      this.seek(tx, ty, this.speedMax * 0.6, 1.2, dt, 1);
      if (d < 2.6) { this.vx -= (dx / d) * dt * 1.5; this.vy -= (dy / d) * dt; }
      if (d < 1.9) this.inflate(w);
      this.faceToward(Math.abs(this.vx) > 0.1 ? this.vx : dx, dt, 3);
    } else {
      this.puffT -= dt;
      this.steer(0, 0.15 + Math.sin(this.t * 2) * 0.1, 1.5, dt);
      this.faceToward(dx, dt, 2);
      if (this.touchPlayer(w, 1, 'spike', this.x, this.y, this.r * 0.95, 0.9)) {
        p.push((dx / (d || 1)) * 7, (dy / (d || 1)) * 7);
        this.squashV -= 10;
        sfx(w, ['boing1', 'boing2', 'boing3'], this.x, 0.8);
      }
      if (this.puffT <= 0) { this.puffed = 0; this.model.setMorph(0); this.r = this.L * 0.32; sfx(w, SND.deflate, this.x, 0.8); w.fx.burst('bubble', this.x + this.facingDir() * 0.3, this.y, 14, 2.5); }
    }
    this.lookAtWorld(p.x, p.y);
    this.avoid(w, dt);
    this.integrate(dt, this.puffed ? 2 : 1.5);
    this.pose(dt, this.puffed ? 0.2 : Math.hypot(this.vx, this.vy) + 0.3, !this.puffed);
  }
  onHit(w: World) { this.inflate(w); }
}

// ============================================================================================ moray eel
// Lives in a hole in the rock with only its head out, gaping. Pulls back when you come near, then lunges out
// along its den axis with jaws wide.
export class Moray extends Creature {
  denX: number; denY: number; dirX = 1; dirY = 0;
  ext = 0.35; extT = 0.35; state: 'lurk' | 'windup' | 'lunge' | 'retract' = 'lurk'; st = 0; cd = 0;
  reach = 2.4;
  constructor(x: number, y: number, w?: World) {
    super('moray', 'moray', x, y, { hp: 4, scale: 0.95, coins: [2, 4], gore: '#a08040', r: 0.28, loot: [{ item: 'eel_skin', chance: 0.2 }] });
    this.denX = x; this.denY = y;
    this.avoidTerrain = false;
    if (w) this.settle(w);
  }
  /** find the den axis: out of the nearest rock surface */
  settle(w: World) {
    const n = w.terrain.normal(this.denX, this.denY);
    const s = w.terrain.sdf(this.denX, this.denY);
    // move the den onto the surface
    this.denX -= n.x * s; this.denY -= n.y * s;
    // prefer sideways dens: blend the normal toward horizontal
    let ax = n.x, ay = n.y * 0.6;
    if (Math.abs(ax) < 0.2) ax = Math.random() < 0.5 ? -0.6 : 0.6;
    const l = Math.hypot(ax, ay) || 1; this.dirX = ax / l; this.dirY = ay / l;
    this.facing = this.dirX >= 0 ? 1 : -1; this.yaw = this.facing > 0 ? 0 : -Math.PI;
  }
  think(dt: number, w: World) {
    const p = w.player;
    const hx = this.denX + this.dirX * this.reach * this.ext, hy = this.denY + this.dirY * this.reach * this.ext;
    const dx = p.x - hx, dy = p.y - hy, d = Math.hypot(dx, dy);
    const ahead = (dx * this.dirX + dy * this.dirY) / (d || 1);
    this.st += dt; this.cd -= dt;
    switch (this.state) {
      case 'lurk':
        this.extT = 0.38 + Math.sin(this.t * 0.8) * 0.05;
        this.model.setJaw(0.25 + 0.25 * Math.max(0, Math.sin(this.t * 1.7)));
        if (this.cd <= 0 && d < this.reach * 1.25 && ahead > 0.2) { this.state = 'windup'; this.st = 0; alertPop(w, hx, hy + 0.5); sfx(w, ['steam1', 'air1'], hx, 0.7, 1.4); }
        break;
      case 'windup':
        this.extT = 0.12; this.model.setJaw(0.8);
        if (Math.floor(this.st * 10) % 2 === 0) this.model.flash(0.35, '#ff3020');
        if (this.st > 0.5) { this.state = 'lunge'; this.st = 0; sfx(w, SND.swish, hx, 0.9, 0.8); }
        break;
      case 'lunge':
        this.extT = 1; this.model.setJaw(this.st < 0.18 ? 1.1 : 0);
        if (this.st > 0.12 && this.touchPlayer(w, 1, 'bite', hx + this.dirX * 0.25, hy + this.dirY * 0.25, 0.4, 1)) sfx(w, SND.bite, hx, 1, 0.9);
        if (this.st > 0.18 && this.st - dt <= 0.18) sfx(w, ['chomp1', 'snap1'], hx, 0.9, 0.8);
        if (this.st > 0.45) { this.state = 'retract'; this.st = 0; }
        break;
      case 'retract':
        this.extT = 0.3; this.model.setJaw(0.2);
        if (this.st > 0.6) { this.state = 'lurk'; this.cd = 1.2; }
        break;
    }
    const rate = this.state === 'lunge' ? 22 : this.state === 'windup' ? 6 : 3;
    this.ext = damp(this.ext, this.extT, rate, dt);
    // head position; the rest of the body trails back into the rock
    this.x = this.denX + this.dirX * this.reach * this.ext;
    this.y = this.denY + this.dirY * this.reach * this.ext;
    const nose = this.L / 2;
    this.yaw = this.dirX >= 0 ? 0 : -Math.PI;
    this.pitch = Math.atan2(this.dirY, Math.abs(this.dirX));
    this.lookAtWorld(p.x, p.y);
    this.squashV += (-this.squash * 160 - this.squashV * 12) * dt; this.squash += this.squashV * dt;
    this.obj.position.set(this.x - this.dirX * nose, this.y - this.dirY * nose, 0);
    this.pivot.rotation.set(0, this.yaw, this.pitch);
    const sq = clamp(this.squash, -0.3, 0.3);
    this.obj.scale.set(1 + sq, 1 - sq, 1);
    this.model.update(dt, this.state === 'lunge' ? 3 : 0.5 + Math.abs(this.ext - this.extT) * 4, 0);
  }
  onHit(w: World) { if (this.state === 'lunge' || this.state === 'windup') { this.state = 'retract'; this.st = 0; this.cd = 1.6; } }
  updateDying(dt: number, w: World) {
    if (this.dying < 0) return false;
    this.extT = 0; this.ext = damp(this.ext, 0, 4, dt);
    return super.updateDying(dt, w);
  }
}

// ============================================================================================ barracuda
// Patrols; when it spots you it lines up, quivers with a red flash and an "!", then torpedoes in a straight line.
export class Barracuda extends Creature {
  state: 'patrol' | 'stalk' | 'tell' | 'dash' | 'recover' = 'patrol'; st = 0; cd = 1;
  homeX: number; homeY: number; dirX = 1; dirY = 0; patrolDir = 1;
  constructor(x: number, y: number) {
    super('barracuda', 'barracuda', x, y, { hp: 3, scale: 1.0, coins: [2, 4], gore: '#b0c0d0', speed: 2.4, r: 0.32, loot: [{ item: 'barracuda_fang', chance: 0.12 }] });
    this.homeX = x; this.homeY = y;
  }
  think(dt: number, w: World) {
    const p = w.player, dx = p.x - this.x, dy = p.y - this.y, d = Math.hypot(dx, dy);
    this.st += dt; this.cd -= dt;
    switch (this.state) {
      case 'patrol':
        if (Math.abs(this.x - this.homeX) > 6) this.patrolDir = this.x > this.homeX ? -1 : 1;
        this.steer(this.patrolDir * this.speedMax * 0.6, (this.homeY - this.y) * 0.5, 1.5, dt);
        this.faceToward(this.vx, dt, 3);
        if (d < 9 && this.cd <= 0) { this.state = 'stalk'; this.st = 0; }
        break;
      case 'stalk': {
        // keep 4-6 m away roughly level with the target, then commit
        const want = 5;
        const tx = p.x - Math.sign(dx || 1) * want, ty = p.y;
        this.seek(tx, ty, this.speedMax, 2, dt, 1.5);
        this.faceToward(dx, dt, 4);
        this.lookAtWorld(p.x, p.y);
        if (d > 13) { this.state = 'patrol'; break; }
        if (this.st > 1.2 && d < 7.5 && Math.abs(dy) < 3) { this.state = 'tell'; this.st = 0; alertPop(w, this.x, this.y + 0.6); sfx(w, SND.alert, this.x, 0.8); }
        break;
      }
      case 'tell': {
        this.steer(0, 0, 6, dt);
        this.faceToward(dx, dt, 10);
        this.lookAtWorld(p.x, p.y);
        this.model.setJaw(0.5);
        const pulse = Math.floor(this.st * 8) % 2 === 0;
        if (pulse) this.model.flash(0.5, '#ff2a1a');
        this.pivot.position.set(Math.sin(this.st * 80) * 0.02 - this.facing * this.st * 0.15, 0, 0);
        this.pitchBias = clamp(Math.atan2(dy, Math.abs(dx)), -0.5, 0.5);
        if (this.st > 0.75) {
          const l = d || 1; this.dirX = dx / l; this.dirY = dy / l;
          this.state = 'dash'; this.st = 0; this.pivot.position.set(0, 0, 0);
          sfx(w, ['magic_whoosh1', 'swish_c', 'swish_a'], this.x, 1, 1.1);
          w.fx.burst('bubble', this.x - this.facing * 0.5, this.y, 12, 2.5);
        }
        break;
      }
      case 'dash':
        this.vx = this.dirX * 15; this.vy = this.dirY * 15;
        this.model.setJaw(1);
        if (this.st % 0.05 < dt) w.fx.emit('bubble', this.x - this.facing * this.L * 0.4, this.y, { n: 1, spread: 0.1 });
        if (this.touchPlayer(w, 2, 'bite', this.mouthX(), this.mouthY(), 0.35, 1)) { sfx(w, SND.bite, this.x, 1, 0.9); this.st = 1; }
        if (this.st > 0.6 || w.terrain.sdf(this.x + this.vx * 0.05, this.y + this.vy * 0.05) < this.r) { this.state = 'recover'; this.st = 0; this.model.setJaw(0); }
        break;
      case 'recover':
        this.steer(0, 0, 1.2, dt);
        this.pitchBias = damp(this.pitchBias, 0, 3, dt);
        this.faceToward(dx, dt, 1.5);
        if (this.st > 1.3) { this.state = 'stalk'; this.st = 0; this.cd = 1.5; }
        break;
    }
    if (this.state !== 'tell' && this.state !== 'dash') this.pitchBias = damp(this.pitchBias, 0, 3, dt);
    this.avoid(w, dt);
    this.integrate(dt, this.state === 'dash' ? 0.05 : 0.8);
    this.pose(dt, this.state === 'tell' ? 3 : Math.hypot(this.vx, this.vy), this.state !== 'tell');
  }
  onHit() { if (this.state === 'tell') { this.state = 'recover'; this.st = 0; } }
}

// ============================================================================================ jellyfish
// Drifts with lazy pulses; bell and trailing tentacles sting on touch.
export class Jellyfish extends Creature {
  drift = R(-0.3, 0.3); pulseT = 0; homeY: number;
  constructor(x: number, y: number) {
    super('jellyfish', 'jellyfish', x, y, { hp: 2, scale: R(0.9, 1.25), coins: [0, 1], gore: '#f0a0d8', r: 0.3 });
    this.homeY = y;
    this.r = 0.26 * this.baseScale;
  }
  think(dt: number, w: World) {
    const ph = this.model.phase;
    // each bell contraction gives a little upward jet
    const pulse = Math.pow(Math.max(0, Math.sin(ph)), 2);
    this.vy += pulse * 1.2 * dt - 0.18 * dt + (this.homeY - this.y) * 0.04 * dt;
    this.vx += (this.drift - this.vx) * 0.4 * dt;
    if (this.stun > 0) this.vx *= 0.98;
    this.avoid(w, dt);
    this.integrate(dt, 0.9);
    // sting: bell + a capsule down the tentacles
    const p = w.player, s = this.baseScale;
    const tx = clamp(p.x, this.x - 0.25 * s, this.x + 0.25 * s), ty = clamp(p.y, this.y - 1.0 * s, this.y);
    if (this.hitCd <= 0 && Math.hypot(p.x - tx, p.y - ty) < p.r + 0.12 * s) {
      w.hurtPlayer(1, this.x, this.y, 'zap'); this.hitCd = 1.1;
      sfx(w, SND.zap, this.x, 1);
      w.fx.burst('zap', p.x, p.y, 6, 2.5, { color: '#ffb0f0' });
      this.model.flash(0.8, '#ffd0ff');
    }
    if (Math.random() < dt * 0.6) w.fx.emit('glow', this.x + R(-0.2, 0.2) * s, this.y - R(0.2, 0.9) * s, { n: 1, size: 0.18, color: '#ff80d0', life: 0.8, alpha: 0.6 });
    this.obj.position.set(this.x, this.y, 0);
    this.squashV += (-this.squash * 160 - this.squashV * 12) * dt; this.squash += this.squashV * dt;
    const sq = clamp(this.squash, -0.3, 0.3);
    this.obj.scale.set(1 + sq, 1 - sq, 1 + sq);
    this.pivot.rotation.set(0, this.t * 0.2, clamp(-this.vx * 0.3, -0.3, 0.3));
    this.model.update(dt, 0.4 + pulse, clamp(-this.vx * 0.8, -1, 1));
  }
  onHit(w: World) { sfx(w, ['gloop1', 'squish1'], this.x, 0.8, 1.2); }
  updateDying(dt: number, w: World) {
    if (this.dying < 0) return false;
    this.dying += dt;
    this.model.flash(1 - this.dying * 2, '#ffe0ff');
    this.obj.scale.setScalar(Math.max(0.01, 1 - this.dying * 1.6));
    if (this.dying > 0.5) { w.fx.burst('glow', this.x, this.y, 10, 2, { color: '#ff90e0' }); w.fx.burst('goo', this.x, this.y, 8, 2, { color: '#f0a0d8', grav: -0.5 }); this.alive = false; }
    return true;
  }
}

// ============================================================================================ anglerfish
// Hangs in the dark with its lure glowing; drifts closer while you look at the light, then the jaws snap.
export class Anglerfish extends Creature {
  state: 'lurk' | 'stalk' | 'snap' | 'recover' = 'lurk'; st = 0; light: THREE.PointLight | null = null; lureK = 1;
  homeX: number; homeY: number;
  constructor(x: number, y: number, o: { light?: boolean } = {}) {
    super('anglerfish', 'anglerfish', x, y, { hp: 5, scale: 1.35, coins: [3, 5], gore: '#4a3438', speed: 1.6, r: 0.42, loot: [{ item: 'glow_bulb', chance: 0.3 }] });
    this.homeX = x; this.homeY = y;
    // a real point light is optional: adding / removing lights recompiles every lit material in three.js,
    // so by default the lure glows through emissive + bloom + glow particles only
    if (o.light) {
      this.light = new THREE.PointLight('#7ff0ff', 1.6, 4.5, 1.6);
      const a = this.model.asset.anchors.lure;
      if (a) this.light.position.copy(a);
      this.model.group.add(this.light);
    }
  }
  think(dt: number, w: World) {
    const p = w.player, dx = p.x - this.x, dy = p.y - this.y, d = Math.hypot(dx, dy);
    this.st += dt;
    const ahead = dx * this.facing > 0;
    switch (this.state) {
      case 'lurk':
        this.seek(this.homeX + Math.sin(this.t * 0.2) * 1.5, this.homeY + Math.sin(this.t * 0.37) * 0.4, 0.5, 1, dt, 1);
        this.faceToward(dx, dt, 1.5);
        this.lureK = 0.8 + Math.sin(this.t * 2.3) * 0.2;
        if (d < 6) { this.state = 'stalk'; this.st = 0; }
        break;
      case 'stalk':
        this.seek(p.x - this.facing * 1.2, p.y + 0.2, this.speedMax, 1.2, dt, 1);
        this.faceToward(dx, dt, 2);
        this.lureK = 1 + Math.sin(this.t * 6) * 0.25;
        this.model.setJaw(0.15);
        if (d > 9) this.state = 'lurk';
        if (d < 2.1 && ahead && this.st > 0.8) { this.state = 'snap'; this.st = 0; sfx(w, ['gulp', 'gulp2'], this.x, 0.8, 0.8); }
        break;
      case 'snap':
        this.model.setJaw(this.st < 0.22 ? 1.15 : 0);
        this.lureK = 0.3;
        if (this.st < 0.25) this.steer(dx * 3, dy * 3, 8, dt);
        if (this.st > 0.22 && this.st - dt <= 0.22) {
          sfx(w, ['chomp1', 'crunch1'], this.x, 1, 0.7);
          w.game.addShake(0.12);
          if (Math.hypot(p.x - this.mouthX(), p.y - this.mouthY()) < 0.7 + p.r) w.hurtPlayer(2, this.x, this.y, 'bite');
        }
        if (this.st > 0.6) { this.state = 'recover'; this.st = 0; }
        break;
      case 'recover':
        this.steer(-dx * 0.5, -dy * 0.5, 1.5, dt);
        this.lureK = damp(this.lureK, 1, 2, dt);
        if (this.st > 1.4) { this.state = 'stalk'; this.st = 0; }
        break;
    }
    if (this.light) this.light.intensity = 1.6 * this.lureK * (0.85 + 0.15 * Math.sin(this.t * 17));
    this.model.material.emissiveIntensity = 1.2 + this.lureK * 1.6;
    if (Math.random() < 0.15) { const a = this.model.asset.anchors.lure; if (a) w.fx.emit('glow', this.x + a.x * this.baseScale * this.facingDir(), this.y + a.y * this.baseScale, { n: 1, size: 0.35, color: '#7ff0ff', life: 0.4, alpha: 0.5 * this.lureK }); }
    this.lookAtWorld(p.x, p.y);
    this.avoid(w, dt);
    this.integrate(dt, 1);
    this.pose(dt, Math.hypot(this.vx, this.vy) + 0.2);
  }
  dispose(w: World) { this.light?.dispose(); super.dispose(w); }
}

// ============================================================================================ crab
// Scuttles sideways along the seabed; raises its claws as a warning, then pinches.
export class Crab extends Creature {
  state: 'wander' | 'aggro' | 'raise' | 'pinch' | 'cool' = 'wander'; st = 0; dir = Math.random() < 0.5 ? -1 : 1; pause = 0;
  onGround = true; legH: number;
  constructor(x: number, y: number) {
    super('crab', 'crab', x, y, { hp: 3, scale: 1.6, coins: [1, 3], gore: '#d8502a', speed: 1.6, r: 0.3, loot: [{ item: 'crab_claw', chance: 0.15 }] });
    this.legH = 0.16 * this.baseScale;
    this.yaw = 0; this.facing = 1;
  }
  think(dt: number, w: World) {
    const p = w.player, dx = p.x - this.x, dy = p.y - this.y, d = Math.hypot(dx, dy);
    this.st += dt;
    const floor = w.terrain.floorAt(this.x) + this.legH;
    const anim = this.model.anim;
    let want = 0;
    switch (this.state) {
      case 'wander':
        this.pause -= dt;
        if (this.pause <= 0) { want = this.dir * this.speedMax * 0.4; if (Math.random() < dt * 0.3) { this.pause = R(0.6, 2); this.dir = -this.dir; } }
        anim.raise = damp(anim.raise ?? 0, 0, 4, dt);
        if (d < 3.5 && dy < 2.5) { this.state = 'aggro'; this.st = 0; sfx(w, SND.click, this.x, 0.7); }
        break;
      case 'aggro':
        want = Math.sign(dx) * this.speedMax * (Math.abs(dx) > 0.8 ? 1 : 0);
        anim.raise = damp(anim.raise ?? 0, 0.5, 4, dt);
        if (d > 5) this.state = 'wander';
        if (d < 1.25 && this.st > 0.4) { this.state = 'raise'; this.st = 0; sfx(w, SND.click, this.x, 1, 1.3); }
        break;
      case 'raise':
        anim.raise = damp(anim.raise ?? 0, 1, 10, dt); anim.pinch = 0;
        if (Math.floor(this.st * 10) % 2 === 0) this.model.flash(0.3, '#ff3020');
        if (this.st > 0.4) { this.state = 'pinch'; this.st = 0; }
        break;
      case 'pinch':
        anim.pinch = 1; anim.raise = damp(anim.raise ?? 0, 0.6, 12, dt);
        if (this.st < dt * 1.5) {
          sfx(w, SND.snip, this.x, 1);
          if (d < 1.0 + p.r) w.hurtPlayer(1, this.x, this.y, 'crush');
        }
        if (this.st > 0.35) { this.state = 'cool'; this.st = 0; }
        break;
      case 'cool':
        anim.pinch = damp(anim.pinch ?? 0, 0, 6, dt); anim.raise = damp(anim.raise ?? 0, 0.3, 3, dt);
        if (this.st > 0.9) this.state = d < 3.5 ? 'aggro' : 'wander';
        break;
    }
    // ground walking with gravity when knocked off the floor
    this.vx = damp(this.vx, want, this.onGround ? 8 : 1, dt);
    if (this.y > floor + 0.02) { this.vy -= 7 * dt; this.onGround = false; }
    this.x += this.vx * dt; this.y += this.vy * dt;
    if (this.y <= floor) { if (!this.onGround && this.vy < -2) sfx(w, ['gravel1', 'uw_thud1'], this.x, 0.5); this.y = floor; this.vy = 0; this.onGround = true; }
    const s = w.terrain.sdf(this.x + Math.sign(this.vx) * 0.4, this.y);
    if (s < 0.05 && this.onGround) { this.dir = -this.dir; this.vx = 0; }
    anim.walk = this.onGround ? this.vx : 0;
    // tilt with the slope of the floor, turn slightly toward the player
    const slope = w.terrain.floorAt(this.x + 0.3) - w.terrain.floorAt(this.x - 0.3);
    this.obj.position.set(this.x, this.y, 0);
    this.squashV += (-this.squash * 160 - this.squashV * 12) * dt; this.squash += this.squashV * dt;
    const sq = clamp(this.squash, -0.3, 0.3);
    this.obj.scale.set(1 + sq, 1 - sq, 1 + sq * 0.5);
    this.pivot.rotation.set(0, clamp(dx * 0.15, -0.35, 0.35), Math.atan2(slope, 0.6) + (this.dying >= 0 ? this.rollBias : 0), 'YZX');
    this.lookAtWorld(p.x, p.y);
    this.model.update(dt, 0, 0);
  }
  hit(dmg: number, dirX: number, dirY: number, w: World, src: import('../game/types').Entity | null, kind?: DamageKind) {
    const ok = super.hit(dmg, dirX, dirY, w, src, kind);
    if (ok) { this.vy = Math.max(this.vy, 1.5 + dirY * 2); this.onGround = false; sfx(w, ['clank1', 'clank2'], this.x, 0.6, 1.4); }
    return ok;
  }
}
