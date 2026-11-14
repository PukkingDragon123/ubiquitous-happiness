// Fish bosses built on the fish model library (src/fish), scaled up:
//   KELP   THE KELP STRANGLER, Mother of Morays — a huge moray in the kelp walls. She hides, rumbles at a den
//          (bubbles: where she'll come out), then strikes from it.
//          P1 lunge (white) x3 | P2 + triple snap (white x3) + constrict (RED grab) | P3 + thrash: she leaves the
//          walls and whips across the arena in an S (RED body contact: dodge through or swim clear)
//   ABYSS  THE LEVIATHAN, Lantern of the Abyss — a colossal anglerfish.
//          P1 bite (white lunge) + lure flash (RED: look away or dodge, else blinded) | P2 + vacuum (it inhales:
//          swim away) ending in a RED gulp, + it calls jellies | P3 + darkness: the lights die, it moves in the
//          dark and strikes with only the glint to warn you
import * as THREE from 'three';
import type { World, Entity, DamageKind } from '../game/types';
import type { Arena } from '../combat/types';
import type { MoveDef } from '../combat/core';
import { BossBase } from './base';
import { buildFish, type FishModel } from '../fish';
import { dangerZone, glint } from '../combat/telegraph';
import { callout } from '../combat/feel';
import { clamp, damp } from '../core/math';
import { POST } from '../gfx/post';
import { buildEnemy } from '../combat/roster';

const R = (a: number, b: number) => a + Math.random() * (b - a);

// =========================================================================================== MOTHER MORAY
const MM: Record<string, MoveDef> = {
  lunge: { id: 'lunge', windup: 0.85, active: 0.3, recover: 1.1, dmg: 1.5, kind: 'bite', knock: 6, tellAt: 0.32 },
  snap: { id: 'snap', windup: 0.7, active: 0.18, recover: 0.2, dmg: 1, kind: 'bite', knock: 3 },
  snap2: { id: 'snap2', windup: 0.32, active: 0.18, recover: 0.2, dmg: 1, kind: 'bite', knock: 3 },
  snap3: { id: 'snap3', windup: 0.32, active: 0.18, recover: 1.0, dmg: 1, kind: 'bite', knock: 4 },
  constrict: { id: 'constrict', windup: 0.95, active: 0.3, recover: 1.2, dmg: 2, unblockable: true, kind: 'crush', tellAt: 0.42 },
  thrash: { id: 'thrash', windup: 0.9, active: 2.4, recover: 0.8, dmg: 1.5, unblockable: true, kind: 'bite', tellAt: 0.42, hyper: true },
};
export class MotherMoray extends BossBase {
  cycles = [['lunge', 'lunge', 'lunge'], ['lunge', 'snap', 'constrict', 'lunge'], ['thrash', 'lunge', 'snap', 'constrict', 'thrash']];
  moves = MM;
  private m: FishModel;
  private pivot = new THREE.Group();
  private den = { x: 0, y: 0, dx: 1, dy: 0 };
  private ext = 0; private extT = 0;
  private reach = 6;
  private aim = { x: 1, y: 0 };
  private yaw = 0; private pitch = 0;
  private hold = 0;
  private thrashY = 0;
  private scale = 3.4;
  constructor(arena: Arena, _w: World) {
    super('motherMoray', arena, { name: 'THE KELP STRANGLER', title: 'Mother of Morays', hp: 85, poise: 90, r: 0.75 });
    this.m = buildFish('moray', 77);
    this.m.group.scale.setScalar(this.scale);
    this.pivot.add(this.m.group);
    this.pivot.rotation.order = 'YZX';
    this.obj.add(this.pivot);
    this.pickDen(arena.x1, arena.floor + (arena.top - arena.floor) * 0.4);
  }
  private get L() { return this.m.length * this.scale; }
  /** a wall den on the side nearest (tx, ty), at that height */
  private pickDen(tx: number, ty: number) {
    const a = this.arena;
    const left = tx < (a.x0 + a.x1) / 2;
    this.den.x = left ? a.x0 - 0.2 : a.x1 + 0.2;
    this.den.y = clamp(ty, a.floor + 1, a.top - 1.2);
    this.den.dx = left ? 1 : -1; this.den.dy = 0;
  }
  /** a den in the seabed (kelp roots) a little to one side of x: she rears up out of it */
  private floorDen(x: number) {
    const a = this.arena;
    this.den.x = clamp(x, a.x0 + 1.5, a.x1 - 1.5); this.den.y = a.floor - 0.3;
    this.den.dx = 0; this.den.dy = 1;
  }
  /** where she strikes from next: the near wall if the blobfish hugs one, else the seabed beside it */
  private chooseDen(w: World, wallOnly = false) {
    const p = w.player, a = this.arena;
    const nearWall = Math.min(p.x - a.x0, a.x1 - p.x) < 6;
    if (nearWall || wallOnly) this.pickDen(p.x, p.y + R(-0.8, 0.8));
    else this.floorDen(p.x + (Math.random() < 0.5 ? -1 : 1) * R(2.2, 3.4));
  }
  head() { return { x: this.x, y: this.y + 0.9 }; }
  protected tellPoint() { return { x: this.x + this.aim.x * 0.6, y: this.y + this.aim.y * 0.6 + 0.2 }; }
  protected want(_id: string, w: World) { return w.player.alive; }
  protected approach(dt: number, _w: World, _next: string) {
    // between strikes she sinks back into her den (the next den is picked when the strike starts)
    this.extT = 0.05;
    this.ext = damp(this.ext, this.extT, 4, dt);
    this.x = this.den.x + this.aim.x * this.reach * this.ext; this.y = this.den.y + this.aim.y * this.reach * this.ext;
  }
  protected started(w: World, m: MoveDef) {
    const p = w.player;
    if (m.id === 'thrash') { this.pickDen(Math.random() < 0.5 ? this.arena.x0 : this.arena.x1, p.y); this.thrashY = clamp(p.y, this.arena.floor + 1.5, this.arena.top - 1.5); w.sfx('roar', this.x, 0.8, 1.2); return; }
    if (!m.id.startsWith('snap') || m.id === 'snap') { this.chooseDen(w); this.aim.x = this.den.dx; this.aim.y = this.den.dy; this.ext = 0; }
    // rumble + bubbles at the den: this is where she comes out
    w.fx.emit('bubble', this.den.x + this.den.dx * 0.4, this.den.y, { n: 18, spread: 0.5, speed: 1.6 });
    w.fx.silt(this.den.x + this.den.dx * 0.3, this.den.y, 8);
    w.sfx('uw_rumble', this.den.x, 0.7, 1.2); w.sfx('steam', this.den.x, 0.6, 0.8);
    w.game.addShake(0.12);
  }
  protected run(dt: number, w: World) {
    const c = this.core, m = c.move!, p = w.player, ph = c.phase, k = c.k;
    if (m.id === 'thrash') { this.runThrash(dt, w); return; }
    // aim the strike line from the den at the player (locks late in the wind-up)
    if (ph === 'windup' && k < 0.8) {
      const hx = this.den.x + this.den.dx * 1.2, hy = this.den.y + this.den.dy * 1.2;
      const dx = p.x - hx, dy = p.y - hy, l = Math.hypot(dx, dy) || 1;
      let ax = dx / l, ay = dy / l;
      // keep the strike inside a cone out of the den
      const dot = ax * this.den.dx + ay * this.den.dy;
      if (dot < 0.4) { const px = -this.den.dy, py = this.den.dx, side = Math.sign(ax * px + ay * py) || 1; ax = this.den.dx * 0.4 + px * side * 0.92; ay = this.den.dy * 0.4 + py * side * 0.92; }
      this.aim.x = damp(this.aim.x, ax, 10, dt); this.aim.y = damp(this.aim.y, ay, 10, dt);
    }
    const reach = m.id === 'lunge' || m.id === 'constrict' ? this.reach : 4;
    if (ph === 'windup') { this.extT = 0.25 + 0.05 * Math.sin(c.t * 30); this.m.setJaw(0.5 + k * 0.6); if (m.unblockable && Math.floor(c.t * 10) % 2) this.m.flash(0.4, '#ff3020'); }
    else if (ph === 'active') {
      this.extT = 1; this.m.setJaw(k < 0.7 ? 1.15 : 0.2);
      if (c.justEntered('active')) w.sfx('swish_c', this.x, 1, 0.6);
      const r = this.hitCircle(w, this.x + this.aim.x * 0.4, this.y + this.aim.y * 0.4, 0.9, { knock: m.knock });
      if (r === 'hit' && m.id === 'constrict') { this.hold = 1.1; p.hooked = true; callout(w, 'CONSTRICTED', p.x, p.y + 1, 'danger', 0.45); }
    } else if (ph === 'recover') {
      // the head stays out a moment: the punish window
      this.extT = m.id.startsWith('snap') ? 0.55 : 0.85 - k * 0.3; this.m.setJaw(0.25);
      if (m.id === 'snap' && k > 0.1) c.start(MM.snap2);
      else if (m.id === 'snap2' && k > 0.1) c.start(MM.snap3);
    }
    if (this.hold > 0) {
      this.hold -= dt;
      const pl = p as unknown as { applyForce?(x: number, y: number): void };
      pl.applyForce?.((this.x - p.x) * 50 - p.vx * 6, (this.y - p.y) * 50 - p.vy * 6);
      if (Math.random() < dt * 4) { w.hurtPlayer(0.5, this.x, this.y, 'crush'); }
      if (this.hold <= 0 || c.phase === 'stagger') { this.hold = 0; p.hooked = false; p.push(this.aim.x * 7, 3); }
    }
    this.ext = damp(this.ext, this.extT, ph === 'active' ? 18 : 6, dt);
    this.x = this.den.x + this.aim.x * reach * this.ext;
    this.y = this.den.y + this.aim.y * reach * this.ext;
    void reach;
  }
  private runThrash(dt: number, w: World) {
    const c = this.core, a = this.arena, ph = c.phase;
    if (ph === 'windup') {
      // out of the den, rearing
      this.extT = 0.6; this.ext = damp(this.ext, this.extT, 5, dt);
      this.x = this.den.x + this.den.dx * 4 * this.ext; this.y = damp(this.y, this.thrashY, 3, dt);
      this.aim.x = this.den.dx; this.aim.y = 0;
      if (Math.floor(c.t * 10) % 2) this.m.flash(0.5, '#ff3020');
      return;
    }
    if (ph === 'active') {
      // an S-curve across the arena to the other wall
      const t = c.k;
      const x0 = this.den.x, x1 = this.den.dx > 0 ? a.x1 - 1 : a.x0 + 1;
      const nx = x0 + (x1 - x0) * t;
      const ny = this.thrashY + Math.sin(t * Math.PI * 3) * Math.min(2.5, (a.top - a.floor) * 0.3);
      const vx = (nx - this.x) / Math.max(dt, 1e-3), vy = (ny - this.y) / Math.max(dt, 1e-3);
      this.x = nx; this.y = ny;
      const l = Math.hypot(vx, vy) || 1; this.aim.x = vx / l; this.aim.y = vy / l;
      this.m.setJaw(1);
      if (Math.random() < dt * 30) w.fx.emit('bubble', this.x - this.aim.x, this.y, { n: 1, spread: 0.2 });
      const p = w.player;
      if (!c.landed && Math.hypot(p.x - this.x, p.y - this.y) < 1.1 + p.r) c.strike(w, { x: this.x, y: this.y, knock: 8 });
      return;
    }
    // recover: slide into the den on the far wall
    if (c.justEntered('recover')) this.pickDen(this.x, this.y);
    this.extT = 0; this.ext = damp(this.ext, 0, 3, dt);
    this.x = this.den.x + this.aim.x * 3 * this.ext; this.y = this.den.y;
  }
  protected staggerPose(dt: number) { this.extT = 0.7; this.ext = damp(this.ext, this.extT, 4, dt); this.m.setJaw(0.6); this.x = this.den.x + this.aim.x * this.reach * this.ext; this.y = this.den.y + this.aim.y * this.reach * this.ext; }
  protected idlePose(dt: number) { this.extT = 0.3; this.ext = damp(this.ext, this.extT, 2, dt); this.aim.x = this.den.dx; this.aim.y = 0; this.x = this.den.x + this.aim.x * 4 * this.ext; this.y = this.den.y; }
  protected introPose(dt: number, w: World, k: number) {
    if (this.st < 0.05) { const p = w.player; this.floorDen(p.x + (p.x < (this.arena.x0 + this.arena.x1) / 2 ? 4.5 : -4.5)); }
    this.aim.x = 0.25 * Math.sign(w.player.x - this.den.x); this.aim.y = 0.97;
    this.ext = damp(this.ext, k < 0.7 ? 0.9 : 0.5, 3, dt);
    this.x = this.den.x + this.aim.x * this.reach * this.ext; this.y = this.den.y + this.aim.y * 4 * this.ext;
    this.m.setJaw(k > 0.3 && k < 0.8 ? 1.1 : 0.3);
    if (k > 0.3 && Math.random() < 0.2) w.fx.emit('bubble', this.x, this.y, { n: 3, speed: 2 });
  }
  protected transitionPose(dt: number, w: World, k: number) { this.introPose(dt, w, k); }
  protected dyingPose(dt: number, _w: World, k: number) { this.ext = damp(this.ext, 0.9, 2, dt); this.m.setJaw(1 - k); this.aim.y = damp(this.aim.y, -0.6, 1, dt); this.x = this.den.x + this.aim.x * this.reach * this.ext; this.y = this.den.y + this.aim.y * 2 * this.ext; }
  protected onPhase(_w: World, n: number) { if (n === 3) { this.core.speed = 1.2; this.core.dmgMul = 1.2; } }
  hit(dmg: number, dx: number, dy: number, w: World, src: Entity | null, kind?: DamageKind) {
    if (this.ext < 0.15 && this.state === 'fight') return false; // in the den: out of reach
    const ok = super.hit(dmg, dx, dy, w, src, kind);
    if (ok) this.m.flash(1, '#ffffff');
    return ok;
  }
  protected place(dt: number, w: World) {
    // the head at (x, y); the body trails back along the aim into the den
    const nose = this.L / 2;
    this.yaw = this.aim.x >= 0 ? 0 : -Math.PI;
    this.pitch = Math.atan2(this.aim.y, Math.abs(this.aim.x));
    this.obj.position.set(this.x - this.aim.x * nose, this.y - this.aim.y * nose, -0.3);
    this.pivot.rotation.set(0, this.yaw, this.pitch);
    this.obj.visible = this.ext > 0.03 || this.state === 'intro';
    this.r = this.ext > 0.15 ? 0.75 : 0.01;
    this.m.lookAt((w.player.x - this.x) * (this.aim.x >= 0 ? 1 : -1), w.player.y - this.y);
    this.m.update(dt, this.core.phase === 'active' ? 3 : 0.6, 0);
    this.m.flash(this.flash * 0.8);
  }
  dispose() { this.m.dispose(); }
}

// =========================================================================================== LEVIATHAN
const LV: Record<string, MoveDef> = {
  bite: { id: 'bite', windup: 0.8, active: 0.35, recover: 0.9, dmg: 2, kind: 'bite', knock: 7, tellAt: 0.3 },
  lureFlash: { id: 'lureFlash', windup: 1.0, active: 0.12, recover: 0.3, dmg: 0, unblockable: true, tellAt: 0.45 },
  vacuum: { id: 'vacuum', windup: 0.6, active: 1.8, recover: 0.2, dmg: 0, tell: 'none' },
  gulp: { id: 'gulp', windup: 0.35, active: 0.25, recover: 1.1, dmg: 2.5, unblockable: true, kind: 'bite', tellAt: 0.3, hyper: true },
  summon: { id: 'summon', windup: 0.8, active: 0.2, recover: 0.6, dmg: 0, tell: 'none' },
  darkness: { id: 'darkness', windup: 0.6, active: 3.2, recover: 0.2, dmg: 0, tell: 'none' },
};
class Blindness implements Entity {
  kind = 'blind'; team = 'neutral' as const; x = 0; y = 0; vx = 0; vy = 0; r = 0; alive = true; t = 0;
  constructor(public dur: number, public col: [number, number, number], public peak: number) {}
  update(dt: number) {
    this.t += dt;
    const k = this.t < 0.3 ? this.t / 0.3 : 1 - (this.t - 0.3) / (this.dur - 0.3);
    if (this.t >= this.dur) { this.alive = false; return; }
    POST.uFlash.value.set(this.col[0], this.col[1], this.col[2], Math.max(POST.uFlash.value.w, clamp(k, 0, 1) * this.peak));
  }
}
export class Leviathan extends BossBase {
  cycles = [['bite', 'lureFlash', 'bite', 'bite'], ['vacuum', 'bite', 'lureFlash', 'summon', 'bite'], ['darkness', 'bite', 'vacuum', 'lureFlash', 'bite']];
  moves = LV;
  private m: FishModel;
  private pivot = new THREE.Group();
  private yaw = 0; private pitch = 0; private lureK = 1;
  private scale = 8.5;
  private dash = { x: 1, y: 0 };
  private dark: Blindness | null = null;
  constructor(arena: Arena, _w: World) {
    super('leviathan', arena, { name: 'THE LEVIATHAN', title: 'Lantern of the Abyss', hp: 110, poise: 110, r: 1.9, y: arena.floor + (arena.top - arena.floor) * 0.55 });
    this.m = buildFish('anglerfish', 13);
    this.m.group.scale.setScalar(this.scale);
    this.pivot.add(this.m.group);
    this.pivot.rotation.order = 'YZX';
    this.obj.add(this.pivot);
  }
  private mouth() { return { x: this.x + this.facing * this.m.mouth.x * this.scale, y: this.y + this.m.mouth.y * this.scale }; }
  private lure() { const a = this.m.asset.anchors.lure; return a ? { x: this.x + this.facing * a.x * this.scale, y: this.y + a.y * this.scale } : { x: this.x + this.facing * 1.5, y: this.y + 1.5 }; }
  protected tellPoint() { return this.core.is('lureFlash') ? this.lure() : this.mouth(); }
  protected want(id: string, w: World) {
    const p = w.player, d = Math.hypot(p.x - this.x, p.y - this.y);
    if (id === 'bite') return d < 6;
    if (id === 'vacuum') return d < 9;
    return true;
  }
  protected approach(dt: number, w: World) {
    const p = w.player, a = this.arena;
    // hover at a middle distance, level-ish with the blobfish
    const tx = clamp(p.x - Math.sign(p.x - this.x || 1) * 4.5, a.x0 + 2, a.x1 - 2), ty = clamp(p.y + 0.5, a.floor + 1.6, a.top - 1.6);
    this.vx = damp(this.vx, clamp((tx - this.x) * 1.2, -2.5, 2.5), 2, dt);
    this.vy = damp(this.vy, clamp((ty - this.y) * 1.2, -2, 2), 2, dt);
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.lureK = damp(this.lureK, 1 + Math.sin(this.st * 5) * 0.2, 3, dt);
  }
  protected started(w: World, m: MoveDef) {
    if (m.id === 'vacuum') { w.sfx('flood_rush', this.x, 0.8, 0.7); callout(w, 'IT INHALES', this.x, this.y + 2.2, 'danger', 0.45); }
    if (m.id === 'darkness') { w.sfx('heartbeat', this.x, 0.9, 0.8); }
    if (m.id === 'lureFlash') w.sfx('heartbeat', this.x, 0.7, 1.3);
    if (m.id === 'summon') w.sfx('sonar', this.x, 0.8, 0.8);
  }
  protected run(dt: number, w: World) {
    const c = this.core, m = c.move!, p = w.player, ph = c.phase, k = c.k;
    const dx = p.x - this.x, dy = p.y - this.y, d = Math.hypot(dx, dy) || 1;
    switch (m.id) {
      case 'bite': case 'gulp': {
        if (ph === 'windup') {
          this.m.setJaw(0.4 + k * 0.8);
          if (k < 0.75) { this.dash.x = dx / d; this.dash.y = dy / d; }
          this.vx = damp(this.vx, -this.dash.x * 1.5, 4, dt); this.vy = damp(this.vy, -this.dash.y * 1.5, 4, dt);
          if (m.unblockable && Math.floor(c.t * 10) % 2) this.m.flash(0.5, '#ff3020');
        } else if (ph === 'active') {
          const sp = m.id === 'gulp' ? 6 : 12;
          this.vx = this.dash.x * sp; this.vy = this.dash.y * sp;
          this.m.setJaw(k < 0.7 ? 1.2 : 0);
          const mo = this.mouth();
          const r = this.hitCircle(w, mo.x, mo.y, 1.2, { knock: m.knock });
          if (k > 0.65 && c.t - dt < m.active * 0.65) { w.sfx('chomp', this.x, 1, 0.5); w.game.addShake(0.25); }
          if (r === 'parried') { this.vx *= -0.3; this.vy *= -0.3; }
        } else { this.vx = damp(this.vx, 0, 2, dt); this.vy = damp(this.vy, 0, 2, dt); this.m.setJaw(0.2); }
        break;
      }
      case 'lureFlash': {
        const lu = this.lure();
        if (ph === 'windup') { this.lureK = 1 + k * 3; this.vx = damp(this.vx, 0, 3, dt); this.vy = damp(this.vy, 0, 3, dt); if (Math.random() < dt * 20) w.fx.emit('glow', lu.x, lu.y, { n: 1, size: 0.6 + k * 1.5, color: '#a0f8ff', life: 0.15 }); }
        if (c.justEntered('active')) {
          w.fx.emit('glow', lu.x, lu.y, { n: 1, size: 9, life: 0.35, color: '#e0ffff' });
          w.fx.light(lu.x, lu.y, '#c0ffff', 14, 0.3);
          w.sfx('k_glass', this.x, 0.9, 0.4);
          const pl = p as unknown as { facing: number; combat?: { iframes: number } };
          const looking = Math.sign(this.x - p.x) === Math.sign(pl.facing || 1);
          if (looking && !((pl.combat?.iframes ?? 0) > 0)) { w.add(new Blindness(1.8, [0.85, 1, 1], 0.94)); callout(w, 'BLINDED', p.x, p.y + 1, 'danger', 0.45); w.emit('blinded', {}); this.queued = 'bite'; this.cd = 0; }
          else callout(w, 'LOOKED AWAY', p.x, p.y + 1, 'hint', 0.32);
        }
        if (ph === 'recover') this.lureK = damp(this.lureK, 0.4, 5, dt);
        break;
      }
      case 'vacuum': {
        this.m.setJaw(ph === 'active' ? 1.1 : 0.6 * k);
        this.vx = damp(this.vx, 0, 3, dt); this.vy = damp(this.vy, 0, 3, dt);
        if (ph === 'active') {
          const mo = this.mouth();
          const mx = mo.x - p.x, my = mo.y - p.y, md = Math.hypot(mx, my) || 1;
          const pull = clamp(9 - md, 2, 8) * 2.4;
          (p as unknown as { applyForce?(x: number, y: number): void }).applyForce?.((mx / md) * pull, (my / md) * pull);
          if (Math.random() < dt * 40) { const a = Math.random() * Math.PI * 2, rr = 2 + Math.random() * 4; w.fx.emit('bubbleS', mo.x + Math.cos(a) * rr, mo.y + Math.sin(a) * rr, { n: 1, vx: -Math.cos(a) * rr * 1.5, vy: -Math.sin(a) * rr * 1.5, life: 0.6, drag: 0 }); }
          if (k >= 0.99 || md < 2) { c.start(LV.gulp); this.dash.x = -mx / md; this.dash.y = -my / md; dangerZone(w, mo.x, mo.y, 1.6, 0.4, true); }
        }
        break;
      }
      case 'summon': {
        if (c.justEntered('active')) for (let i = 0; i < 2; i++) {
          const a = this.arena;
          w.add(buildEnemy(w, 'jelly', clamp(this.x + (i ? 3 : -3), a.x0 + 1, a.x1 - 1), clamp(this.y + 1.5, a.floor + 1, a.top - 1), { arena: a }));
          glint(w, this.x + (i ? 3 : -3), this.y + 1.5, { size: 0.8, sound: false });
        }
        this.lureK = 1 + Math.sin(c.t * 20) * 0.6;
        break;
      }
      case 'darkness': {
        if (c.justEntered('active')) { this.dark = new Blindness(3.6, [0, 0, 0.02], 0.82); w.add(this.dark); this.lureK = 0.05; callout(w, 'THE LIGHTS DIE', p.x, p.y + 1.2, 'danger', 0.42); }
        if (ph === 'active') {
          // circle round behind the blobfish in the dark, then the next bite comes from there
          const a = this.arena, ang = this.st * 0.9;
          const tx = clamp(p.x + Math.cos(ang) * 5, a.x0 + 2, a.x1 - 2), ty = clamp(p.y + Math.sin(ang) * 2, a.floor + 1.6, a.top - 1.6);
          this.vx = damp(this.vx, (tx - this.x) * 1.5, 2, dt); this.vy = damp(this.vy, (ty - this.y) * 1.5, 2, dt);
          this.lureK = 0.05;
        }
        if (ph === 'recover') { this.queued = 'bite'; this.cd = 0; }
        break;
      }
    }
    if (m.id !== 'bite' && m.id !== 'gulp' && m.id !== 'darkness') { this.x += this.vx * dt; this.y += this.vy * dt; }
    else { this.x += this.vx * dt; this.y += this.vy * dt; }
    const a = this.arena;
    this.x = clamp(this.x, a.x0 + 1.5, a.x1 - 1.5); this.y = clamp(this.y, a.floor + 1.4, a.top - 1.2);
  }
  protected staggerPose(dt: number) { this.vx = damp(this.vx, 0, 3, dt); this.vy = damp(this.vy, -0.5, 3, dt); this.y += this.vy * dt; this.m.setJaw(0.7); this.lureK = 0.3; }
  protected introPose(dt: number, w: World, k: number) {
    // the lure lights first, then the face behind it
    this.lureK = Math.min(3, k * 5);
    this.m.material.emissiveIntensity = 0.2 + k * 1.6;
    this.m.setJaw(k > 0.5 ? 1 : 0.2);
    if (k > 0.5 && Math.random() < 0.1) w.sfx('roar', this.x, 0.5, 0.5);
    this.facing = w.player.x >= this.x ? 1 : -1;
    void dt;
  }
  protected transitionPose(_dt: number, _w: World, k: number) { this.m.setJaw(Math.sin(k * 12) > 0 ? 1.1 : 0.3); this.lureK = 2; }
  protected dyingPose(dt: number, _w: World, k: number) { this.lureK = 1 - k; this.y = damp(this.y, this.arena.floor + 1, 0.8, dt); this.m.setJaw(0.8); }
  protected onPhase(_w: World, n: number) { if (n === 3) { this.core.speed = 1.2; this.core.dmgMul = 1.2; } }
  protected place(dt: number, w: World) {
    const p = w.player;
    if (!this.core.attacking || this.core.phase === 'windup') this.facing = p.x >= this.x ? 1 : -1;
    this.yaw = damp(this.yaw, this.facing > 0 ? 0 : -Math.PI, 5, dt);
    const sp = Math.hypot(this.vx, this.vy);
    this.pitch = damp(this.pitch, sp > 1 ? clamp(Math.atan2(this.vy, Math.abs(this.vx) + 0.5), -0.5, 0.5) : 0, 4, dt);
    this.obj.position.set(this.x, this.y, -0.5);
    this.pivot.rotation.set(0, this.yaw, this.pitch);
    this.m.material.emissiveIntensity = 0.6 + this.lureK * 1.4;
    const lu = this.lure();
    if (this.lureK > 0.2 && Math.random() < 0.3) w.fx.emit('glow', lu.x, lu.y, { n: 1, size: 0.5 + this.lureK * 0.3, color: '#7ff0ff', life: 0.3, alpha: 0.6 });
    this.m.lookAt((p.x - this.x) * this.facing, p.y - this.y);
    this.m.update(dt, sp + 0.3, 0);
    this.m.flash(this.flash * 0.8);
  }
  dispose() { this.m.dispose(); if (this.dark) this.dark.alive = false; }
}
