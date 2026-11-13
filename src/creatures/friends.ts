// Friendly creatures (team 'friend'): a sardine school that swirls around the blobfish (bite one for a snack
// heal), a cleaner wrasse that tends the blobfish once per visit, a sea turtle you can ride, and a hermit crab
// that follows along the seabed and snips fishing lines when you get hooked.
import * as THREE from 'three';
import type { Entity, World, Team, PlayerLike, DamageKind } from '../game/types';
import { FishSchool } from '../fish';
import { Creature, sfx, SND } from './base';
import { damp, clamp } from '../core/math';

const R = (a: number, b: number) => a + Math.random() * (b - a);

// ============================================================================================ sardine school
interface Sardine { x: number; y: number; z: number; vx: number; vy: number; ph: number; yaw: number; pitch: number; alive: boolean; flash: number; amp: number }

export class SardineSchool implements Entity {
  kind = 'sardines'; team: Team = 'friend';
  x: number; y: number; vx = 0; vy = 0; r = 0.2; alive = true;
  biteable = true;
  obj = new THREE.Group();
  school: FishSchool;
  fish: Sardine[] = [];
  homeX: number; homeY: number;
  orbit = R(0, 6); t = 0; scatter = 0; scale = 1.2;
  nearest = 0;
  constructor(x: number, y: number, n = 18) {
    this.x = this.homeX = x; this.y = this.homeY = y;
    this.school = new FishSchool('sardine', n);
    this.obj.add(this.school.mesh);
    for (let i = 0; i < n; i++) this.fish.push({ x: x + R(-1, 1), y: y + R(-0.6, 0.6), z: R(-0.7, 0.5), vx: R(-1, 1), vy: 0, ph: R(0, 6), yaw: 0, pitch: 0, alive: true, flash: 0, amp: 0.1 });
  }
  update(dt: number, w: World) {
    this.t += dt; this.scatter = Math.max(0, this.scatter - dt);
    const p = w.player;
    const dp = Math.hypot(p.x - this.homeX, p.y - this.homeY);
    // swirl centre: around the blobfish when it's near, otherwise the home spot
    const near = Math.hypot(p.x - this.x, p.y - this.y) < 9 || dp < 9;
    this.orbit += dt * 0.9;
    const cx = near ? p.x + Math.cos(this.orbit) * 0.5 : this.homeX + Math.sin(this.t * 0.3) * 3;
    const cy = near ? p.y + Math.sin(this.orbit) * 0.3 : this.homeY + Math.sin(this.t * 0.5) * 0.6;
    if (!near) { this.homeX += (cx - this.homeX) * 0; }
    else { this.homeX = damp(this.homeX, p.x, 0.5, dt); this.homeY = damp(this.homeY, p.y, 0.5, dt); }
    const pSpeed = Math.hypot(p.vx, p.vy);
    let best = 1e9, alive = 0, sx = 0, sy = 0;
    const F = this.fish;
    for (let i = 0; i < F.length; i++) {
      const f = F[i];
      if (!f.alive) continue;
      alive++;
      // orbit controller: tangential swim + radial correction toward a per-fish ring radius
      const R0 = 1.2 + 0.45 * Math.sin(i * 1.7), sgn = i % 5 === 0 ? -1 : 1;
      const rx = f.x - cx, ry = (f.y - cy) * 1.5, rl = Math.hypot(rx, ry) || 1;
      const dvx = (-ry / rl) * 2.6 * sgn + (rx / rl) * (R0 - rl) * 2.2;
      const dvy = (rx / rl) * 1.6 * sgn + (ry / rl) * (R0 - rl) * 1.6;
      let ax = (dvx - f.vx) * 3, ay = (dvy - f.vy) * 3;
      // separation from neighbours (alignment comes from the shared orbit)
      for (let j = 0; j < F.length; j++) {
        if (j === i || !F[j].alive) continue;
        const dx = f.x - F[j].x, dy = f.y - F[j].y, d2 = dx * dx + dy * dy;
        if (d2 < 0.06) { ax += (dx / (d2 + 0.01)) * 0.2; ay += (dy / (d2 + 0.01)) * 0.2; }
      }
      // flee a fast-moving blobfish / scatter
      const px = f.x - p.x, py = f.y - p.y, pd = Math.hypot(px, py) || 1;
      if (pd < 0.9 + (pSpeed > 6 ? 0.8 : 0) || this.scatter > 0) { ax += (px / pd) * 14; ay += (py / pd) * 10; }
      // terrain + surface
      const s = w.terrain.sdf(f.x, f.y);
      if (s < 0.8) { const n = w.terrain.normal(f.x, f.y); ax += n.x * (0.8 - s) * 20; ay += n.y * (0.8 - s) * 20; }
      const top = w.water.heightAt(f.x) - 0.5;
      if (f.y > top) ay -= (f.y - top) * 20;
      f.vx += ax * dt; f.vy += ay * dt;
      const sp = Math.hypot(f.vx, f.vy), mx = this.scatter > 0 ? 7 : 3.8;
      if (sp > mx) { f.vx *= mx / sp; f.vy *= mx / sp; }
      f.x += f.vx * dt; f.y += f.vy * dt;
      f.z = damp(f.z, Math.sin(this.t * 0.7 + i) * 0.5, 0.5, dt);
      const yawT = f.vx >= 0 ? 0 : -Math.PI;
      f.yaw = damp(f.yaw, yawT, 6, dt);
      f.pitch = damp(f.pitch, clamp(Math.atan2(f.vy, Math.abs(f.vx) + 0.3), -0.8, 0.8), 6, dt);
      const bl = sp / this.school.length;
      f.ph += dt * (2.2 + 1.4 * Math.min(bl, 6)) * Math.PI * 2;
      f.amp = damp(f.amp, 0.13 * (0.3 + 0.7 * Math.min(1, bl / 2.2)), 4, dt);
      f.flash = Math.max(0, f.flash - dt * 5);
      const turn = clamp((yawT - f.yaw) * 0.9, -1, 1) * (f.vx >= 0 ? 1 : -1);
      this.school.set(i, f.x, f.y, f.z, f.yaw, f.pitch, this.scale, f.ph, f.amp, turn, f.flash);
      sx += f.x; sy += f.y;
      const d = Math.hypot(f.x - p.x, f.y - p.y);
      if (d < best) { best = d; this.nearest = i; }
    }
    this.school.commit();
    if (!alive) { this.alive = false; return; }
    // the entity's position is the sardine closest to the blobfish (what a bite would catch)
    const nf = F[this.nearest];
    this.x = nf.x; this.y = nf.y; this.vx = nf.vx; this.vy = nf.vy;
    void sx; void sy;
  }
  onBite(w: World) {
    const f = this.fish[this.nearest];
    if (!f || !f.alive) return;
    f.alive = false; this.school.hide(this.nearest); this.school.commit();
    w.fx.burst('bubble', f.x, f.y, 6, 1.5);
    w.fx.burst('star', f.x, f.y, 4, 2, { color: '#e8f4ff' });
    w.fx.emit('heart', f.x, f.y + 0.2, { n: 1, vy: 1, life: 0.9, size: 0.25 });
    w.text.pop('+1', f.x, f.y + 0.4, 'heal', { size: 0.3 });
    sfx(w, ['gulp', 'bite1', 'nibble1'], f.x, 0.9, 1.2);
    w.emit('heal', { amount: 1, source: 'sardine' });
    this.scatter = 0.6;
  }
  hit(_dmg: number, _dx: number, _dy: number, w: World): boolean {
    // friends don't take sword damage: they scatter instead
    this.scatter = 0.8;
    for (const f of this.fish) f.flash = 0.6;
    sfx(w, ['bubbles_a', 'bubble2'], this.x, 0.5);
    return false;
  }
  dispose() { this.school.dispose(); }
}

// ============================================================================================ cleaner wrasse
// Waits at its cleaning station; when the blobfish swims by it darts over, picks it clean (hearts!) and heals
// it once per visit (leave and come back for another).
export class CleanerWrasse extends Creature {
  homeX: number; homeY: number;
  state: 'idle' | 'approach' | 'clean' | 'home' = 'idle'; st = 0;
  visited = false; cooldown = 0; side = 1;
  constructor(x: number, y: number) {
    super('cleaner_wrasse', 'cleaner_wrasse', x, y, { team: 'friend', hp: 3, scale: 1.5, speed: 3, r: 0.2, coins: [0, 0] });
    this.homeX = x; this.homeY = y;
  }
  think(dt: number, w: World) {
    const p = w.player, dx = p.x - this.x, dy = p.y - this.y, d = Math.hypot(dx, dy);
    const dHome = Math.hypot(p.x - this.homeX, p.y - this.homeY);
    this.st += dt; this.cooldown -= dt;
    if (dHome > 8) this.visited = false;
    switch (this.state) {
      case 'idle': {
        // tiny darting hover around the station
        const tx = this.homeX + Math.sin(this.t * 1.3) * 0.5, ty = this.homeY + Math.sin(this.t * 2.1) * 0.25;
        this.seek(tx, ty, 1.2, 3, dt, 0.4);
        this.faceToward(Math.sin(this.t * 0.5) || 1, dt, 3);
        if (!this.visited && this.cooldown <= 0 && dHome < 3.2) { this.state = 'approach'; this.st = 0; this.side = dx > 0 ? -1 : 1; w.text.pop('♥', this.x, this.y + 0.4, 'heal', { size: 0.3 }); sfx(w, ['chirp1', 'chirp2', 'cute1'], this.x, 0.7); }
        break;
      }
      case 'approach':
        this.seek(p.x + this.side * 0.55, p.y + 0.15, this.speedMax, 6, dt, 0.4);
        this.faceToward(dx, dt, 8);
        if (d < 0.8) { this.state = 'clean'; this.st = 0; }
        if (d > 6) this.state = 'home';
        break;
      case 'clean': {
        // hop between spots on the blobfish, nibbling
        const k = Math.floor(this.st / 0.4);
        const ang = k * 2.1 + this.side;
        this.seek(p.x + Math.cos(ang) * 0.6, p.y + Math.sin(ang) * 0.45, 2.5, 10, dt, 0.2);
        this.faceToward(dx, dt, 10);
        this.model.setJaw(Math.sin(this.st * 25) > 0 ? 1 : 0);
        if (Math.random() < dt * 6) w.fx.emit('heart', p.x + R(-0.4, 0.4), p.y + R(0, 0.4), { n: 1, vy: 0.8, life: 0.7, size: 0.18 });
        if (Math.random() < dt * 5) sfx(w, ['nibble1', 'nibble2'], this.x, 0.5, 1.3);
        if (d > 3) { this.state = 'home'; break; }
        if (this.st > 1.8) {
          w.emit('heal', { amount: 1, source: 'cleaner' });
          w.text.pop('+1  SQUEAKY CLEAN!', p.x, p.y + 0.8, 'heal', { size: 0.32 });
          w.fx.burst('star', p.x, p.y, 10, 2.5, { color: '#c8ffe0' });
          sfx(w, SND.heal, p.x, 0.9);
          this.visited = true; this.cooldown = 20; this.state = 'home'; this.st = 0; this.model.setJaw(0);
        }
        break;
      }
      case 'home':
        this.seek(this.homeX, this.homeY, this.speedMax * 0.8, 3, dt, 0.5);
        this.faceToward(this.homeX - this.x, dt, 5);
        if (Math.hypot(this.homeX - this.x, this.homeY - this.y) < 0.4) { this.state = 'idle'; this.st = 0; }
        break;
    }
    this.lookAtWorld(p.x, p.y);
    this.avoid(w, dt);
    this.integrate(dt, 2);
    this.pose(dt, Math.hypot(this.vx, this.vy) + 0.4);
  }
  hit(_d: number, dx: number, dy: number, w: World): boolean {
    this.vx += dx * 4; this.vy += dy * 4; this.model.flash(0.6); this.squashV += 6;
    this.state = 'home'; sfx(w, ['squeak2', 'squeak1'], this.x, 0.6, 1.4);
    return false;
  }
}

// ============================================================================================ sea turtle
// Glides on long slow strokes. Rideable: the player module calls carry(dt, player) every frame while riding;
// the turtle then follows the rider's steering (input axis) at a brisk cruise.
export class SeaTurtle extends Creature {
  rideable = true;
  rider: PlayerLike | null = null;
  homeX: number; homeY: number; heading = Math.random() < 0.5 ? -1 : 1;
  constructor(x: number, y: number) {
    super('sea_turtle', 'sea_turtle', x, y, { team: 'friend', hp: 10, scale: 1.1, speed: 1.6, r: 0.55, coins: [0, 0] });
    this.homeX = x; this.homeY = y;
  }
  /** world anchor for a rider (on top of the shell) */
  seatX() { return this.x - this.facingDir() * 0.05; }
  seatY() { return this.y + 0.42 * this.baseScale; }
  carry(dt: number, player: PlayerLike) {
    this.rider = player;
    player.x = damp(player.x, this.seatX(), 14, dt);
    player.y = damp(player.y, this.seatY() + player.r * 0.6, 14, dt);
    player.vx = this.vx; player.vy = this.vy;
  }
  dismount() { this.rider = null; }
  think(dt: number, w: World) {
    const p = w.player;
    if (this.rider && Math.hypot(this.rider.x - this.seatX(), this.rider.y - this.seatY()) > 1.6) this.rider = null;
    if (this.rider) {
      const ax = w.game.input.axis();
      const vx = (ax.x || this.facing * 0.6) * 4.2, vy = ax.y * 2.6;
      this.steer(vx, vy, 1.6, dt);
      this.faceToward(this.vx, dt, 1.6);
      this.rollBias = clamp(-this.vy * 0.08, -0.25, 0.25);
    } else {
      // long lazy glides back and forth across the home area
      if (Math.abs(this.x - this.homeX) > 9) this.heading = this.x > this.homeX ? -1 : 1;
      const ty = this.homeY + Math.sin(this.t * 0.25) * 1.2;
      this.steer(this.heading * this.speedMax, (ty - this.y) * 0.5, 0.6, dt);
      this.faceToward(this.vx, dt, 0.9);
      this.rollBias = 0;
      // shy of a speeding blobfish
      const d = Math.hypot(p.x - this.x, p.y - this.y);
      if (d < 1.2 && Math.hypot(p.vx, p.vy) > 6) this.vy += 1.5 * dt;
    }
    this.lookAtWorld(p.x, p.y);
    this.avoid(w, dt);
    this.integrate(dt, 0.4);
    this.pose(dt, Math.hypot(this.vx, this.vy));
  }
  hit(_d: number, dx: number, dy: number, w: World): boolean {
    this.vx += dx * 1.5; this.vy += dy * 1.5; this.model.flash(0.5); this.squashV += 3;
    sfx(w, ['grunt1', 'grunt2'], this.x, 0.5, 0.8);
    return false;
  }
}

// ============================================================================================ hermit crab
// Tags along the seabed under the blobfish. The moment the blobfish is hooked it scrambles up to it and snips
// the line (fishing code checks `cutsLines` entities touching line segments; we also emit 'crabSnip').
export class HermitCrab extends Creature {
  cutsLines = true;
  state: 'follow' | 'rescue' | 'fall' = 'follow'; st = 0; legH: number; snipCd = 0;
  constructor(x: number, y: number) {
    super('hermit', 'hermit', x, y, { team: 'friend', hp: 6, scale: 1.5, speed: 2.2, r: 0.28, coins: [0, 0] });
    this.legH = 0.14 * this.baseScale;
    this.avoidTerrain = false;
  }
  think(dt: number, w: World) {
    const p = w.player, dx = p.x - this.x;
    this.st += dt; this.snipCd -= dt;
    const floor = w.terrain.floorAt(this.x) + this.legH;
    const anim = this.model.anim;
    if (p.hooked && this.state !== 'rescue') { this.state = 'rescue'; this.st = 0; w.text.pop('HANG ON!', this.x, this.y + 0.6, 'shout', { size: 0.3 }); sfx(w, SND.click, this.x, 1, 1.2); }
    switch (this.state) {
      case 'follow': {
        const tx = p.x - Math.sign(dx || 1) * 1.2;
        const want = Math.abs(tx - this.x) > 0.6 ? Math.sign(tx - this.x) * this.speedMax : 0;
        this.vx = damp(this.vx, want, 6, dt);
        this.y = damp(this.y, floor, 12, dt); this.vy = 0;
        anim.walk = this.vx; anim.pinch = 0;
        this.faceToward(this.vx || dx, dt, 6);
        break;
      }
      case 'rescue': {
        // scramble / paddle up to the blobfish and snip around it
        const tx = p.x + this.facingDir() * -0.2, ty = p.y - 0.15;
        this.seek(tx, ty, 6, 5, dt, 0.3);
        this.faceToward(dx, dt, 8);
        anim.walk = 1.2;
        anim.pinch = Math.sin(this.st * 22) > 0 ? 1 : 0;
        const d = Math.hypot(p.x - this.x, p.y - this.y);
        if (d < 0.8 && this.snipCd <= 0) {
          this.snipCd = 0.25;
          sfx(w, SND.snip, this.x, 1, 1 + Math.random() * 0.2);
          w.fx.burst('spark', this.x + this.facingDir() * 0.2, this.y + 0.1, 4, 2, { color: '#fff4d0' });
          w.emit('crabSnip', { x: this.x, y: this.y, entity: this });
        }
        if (!p.hooked && this.st > 0.4) { this.state = 'fall'; this.st = 0; w.text.pop('SNIP!', this.x, this.y + 0.5, 'shout', { size: 0.3 }); }
        if (this.st > 6) { this.state = 'fall'; this.st = 0; }
        this.x += this.vx * dt; this.y += this.vy * dt;
        break;
      }
      case 'fall':
        this.vy -= 6 * dt; this.vx = damp(this.vx, 0, 2, dt);
        this.x += this.vx * dt; this.y += this.vy * dt;
        anim.walk = 0.4; anim.pinch = 0;
        if (this.y <= floor) { this.y = floor; this.vy = 0; this.state = 'follow'; sfx(w, ['gravel1', 'uw_thud1'], this.x, 0.5); }
        break;
    }
    if (this.state === 'follow') this.x += this.vx * dt;
    this.lookAtWorld(p.x, p.y);
    this.pose(dt, 0, false);
  }
  hit(_d: number, dx: number, _dy: number, w: World, _s: Entity | null, _k?: DamageKind): boolean {
    this.model.flash(0.6); this.squashV += 6; this.vx += dx * 2;
    sfx(w, ['clank1', 'clank2'], this.x, 0.5, 1.3);
    return false;
  }
}
