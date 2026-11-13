// Projectiles and short-lived FX entities for skills: a generic Projectile (bolts, shards, orbs, nails, harpoons,
// bombs, vials, nets) with homing, gravity, piercing, line cutting and terrain impacts; a jagged Lightning arc;
// and a generic timed Effect (whirling things, lingering clouds).
import * as THREE from 'three';
import type { Entity, World, Team, DamageKind } from '../game/types';
import type { SkillCaster } from './types';
import { strike, foes } from './combat';
import { applyStatus, type StatusKind } from './status';
import { FX, emit } from './fx';
import { boltMesh } from './models';
import { segDist } from '../core/math';

export interface ProjOpts {
  x: number; y: number; vx: number; vy: number;
  r?: number; dmg: number; kind: DamageKind; life?: number;
  /** enemies it can pass through (0 = stops at the first) */
  pierce?: number;
  /** steering toward the nearest enemy (rad/s-ish) */
  homing?: number;
  grav?: number; drag?: number;
  mesh?: THREE.Object3D; spin?: number; orient?: boolean;
  trail?: (w: World, p: Projectile, dt: number) => void;
  onHit?: (w: World, p: Projectile, e: Entity) => void;
  /** called when it dies (hit, terrain or timeout) */
  onEnd?: (w: World, p: Projectile, why: 'hit' | 'terrain' | 'time') => void;
  cutLines?: boolean;
  src: SkillCaster | null;
  status?: [StatusKind, number, number?];
  gore?: number;
  /** knockback impulse on hit */
  knock?: number;
  /** sound on hit */
  hitSfx?: string;
}

export class Projectile implements Entity {
  kind = 'projectile'; team: Team = 'player';
  x: number; y: number; vx: number; vy: number; r: number; alive = true;
  obj = new THREE.Group();
  life: number; age = 0;
  o: ProjOpts;
  private hits = new Set<Entity>();
  private px: number; private py: number;
  constructor(o: ProjOpts) {
    this.o = o;
    this.x = this.px = o.x; this.y = this.py = o.y; this.vx = o.vx; this.vy = o.vy; this.r = o.r ?? 0.12;
    this.life = o.life ?? 1.5;
    if (o.mesh) this.obj.add(o.mesh);
    this.obj.position.set(this.x, this.y, 0.25);
  }
  update(dt: number, w: World) {
    const o = this.o;
    this.age += dt;
    this.life -= dt;
    if (this.life <= 0) return this.end(w, 'time');
    if (o.homing) {
      const sp = Math.hypot(this.vx, this.vy) || 1;
      const t = foes(w, this.x, this.y, 7).filter((e) => !this.hits.has(e)).sort((a, b) => Math.hypot(a.x - this.x, a.y - this.y) - Math.hypot(b.x - this.x, b.y - this.y))[0];
      if (t) {
        const want = Math.atan2(t.y - this.y, t.x - this.x), cur = Math.atan2(this.vy, this.vx);
        let d = want - cur; d = Math.atan2(Math.sin(d), Math.cos(d));
        const na = cur + Math.max(-o.homing * dt, Math.min(o.homing * dt, d));
        this.vx = Math.cos(na) * sp; this.vy = Math.sin(na) * sp;
      }
    }
    if (o.grav) this.vy += o.grav * dt;
    if (o.drag) { const k = Math.exp(-o.drag * dt); this.vx *= k; this.vy *= k; }
    this.px = this.x; this.py = this.y;
    this.x += this.vx * dt; this.y += this.vy * dt;
    // fishing lines get cut by anything sharp flying through them
    if (o.cutLines) for (const e of w.entities) if (e.alive && e.slash) e.slash(this.px, this.py, this.x, this.y, o.dmg, w);
    // enemies along the segment
    const mx = (this.x + this.px) / 2, my = (this.y + this.py) / 2, half = Math.hypot(this.x - this.px, this.y - this.py) / 2;
    for (const e of foes(w, mx, my, half + this.r + 1.5)) {
      if (this.hits.has(e)) continue;
      if (segDist(e.x, e.y, this.px, this.py, this.x, this.y).d > e.r + this.r) continue;
      this.hits.add(e);
      const dx = this.vx, dy = this.vy;
      if (strike(w, o.src, e, o.dmg, dx, dy, o.kind, { gore: o.gore })) {
        if (o.status) applyStatus(w, e, o.status[0], o.status[1], { dps: o.status[2], src: o.src });
        if (o.knock) { const l = Math.hypot(dx, dy) || 1; e.vx += (dx / l) * o.knock; e.vy += (dy / l) * o.knock; }
        if (o.hitSfx) w.sfx(o.hitSfx, e.x, 0.6);
      }
      o.onHit?.(w, this, e);
      if ((o.pierce ?? 0) < this.hits.size) return this.end(w, 'hit');
    }
    if (w.terrain.sdf(this.x, this.y) < 0) return this.end(w, 'terrain');
    o.trail?.(w, this, dt);
    this.obj.position.set(this.x, this.y, 0.25);
    if (o.orient !== false) this.obj.rotation.z = Math.atan2(this.vy, this.vx);
    if (o.spin) { this.obj.rotation.x += o.spin * dt; this.obj.rotation.y += o.spin * dt * 0.7; }
  }
  private end(w: World, why: 'hit' | 'terrain' | 'time') {
    if (!this.alive) return;
    this.alive = false;
    this.o.onEnd?.(w, this, why);
  }
}

/** the wand / staff basic attack: a homing mana bolt */
export function manaBoltShot(w: World, p: SkillCaster, x: number, y: number, ang: number, dmg: number, color = '#9a7aff') {
  const sp = 11;
  w.add(new Projectile({
    x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, r: 0.14, dmg, kind: 'laser', life: 0.85, homing: 4.5, cutLines: true, src: p,
    mesh: boltMesh(color), hitSfx: 'zap',
    trail: (ww, pr) => { if (Math.random() < 0.7) emit(ww, 'magic', pr.x, pr.y, { color, size: 0.18, life: 0.35, vx: -pr.vx * 0.05, vy: -pr.vy * 0.05, bright: 1.5 }); },
    onEnd: (ww, pr) => { FX.magic(ww, pr.x, pr.y, color, 8); },
  }));
  FX.muzzle(w, x, y, ang, 0.5);
}

// ------------------------------------------------------------------ lightning arc
/** a jagged additive pixel-ish lightning bolt between points, flickering for `life` seconds */
export class Lightning implements Entity {
  kind = 'fx'; team: Team = 'neutral'; x = 0; y = 0; vx = 0; vy = 0; r = 0; alive = true;
  obj: THREE.Mesh;
  private geo = new THREE.BufferGeometry();
  private t = 0;
  constructor(public pts: { x: number; y: number }[], public life = 0.25, color = '#bff4ff', public width = 0.07) {
    this.obj = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.obj.frustumCulled = false;
    this.obj.renderOrder = 22;
    this.build();
  }
  private build() {
    const P: number[] = [];
    for (let i = 0; i + 1 < this.pts.length; i++) {
      const a = this.pts[i], b = this.pts[i + 1];
      const n = Math.max(2, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / 0.35));
      let prev = { x: a.x, y: a.y };
      for (let k = 1; k <= n; k++) {
        const t = k / n;
        const jit = k === n ? 0 : 0.28;
        const cur = { x: a.x + (b.x - a.x) * t + (Math.random() - 0.5) * jit, y: a.y + (b.y - a.y) * t + (Math.random() - 0.5) * jit };
        const dx = cur.x - prev.x, dy = cur.y - prev.y, l = Math.hypot(dx, dy) || 1;
        const nx = (-dy / l) * this.width, ny = (dx / l) * this.width;
        P.push(prev.x - nx, prev.y - ny, 0.3, prev.x + nx, prev.y + ny, 0.3, cur.x + nx, cur.y + ny, 0.3, prev.x - nx, prev.y - ny, 0.3, cur.x + nx, cur.y + ny, 0.3, cur.x - nx, cur.y - ny, 0.3);
        prev = cur;
      }
    }
    this.geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  }
  update(dt: number) {
    this.t += dt;
    if (this.t > this.life) { this.alive = false; return; }
    if (Math.random() < 0.5) this.build();
    (this.obj.material as THREE.MeshBasicMaterial).opacity = 1 - this.t / this.life;
  }
}

// ------------------------------------------------------------------ generic timed effect
/** an entity that runs a callback every frame for `life` seconds (auras, lingering clouds, whirls) */
export class Effect implements Entity {
  kind = 'fx'; team: Team = 'player'; vx = 0; vy = 0; r = 0; alive = true; t = 0;
  obj = new THREE.Group();
  constructor(public x: number, public y: number, public life: number, public tick: (w: World, e: Effect, dt: number) => void, public done?: (w: World, e: Effect) => void) {}
  update(dt: number, w: World) {
    this.t += dt;
    this.tick(w, this, dt);
    if (this.t >= this.life) { this.alive = false; this.done?.(w, this); }
  }
}
