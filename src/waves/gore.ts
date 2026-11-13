// PS1-style gore for the humans: severed limbs that tumble and sink trailing blood, low-poly meat chunks with
// a flesh texture, bite chunks torn out by fish (and the blobfish). Everything sinks to the seabed, settles,
// and is eventually buried by the silt. Limbs and chunks are biteable: scavengers (and the player) can eat them.
//
//   spawnLimb(w, rig.sever('farmR'), vx, vy)      // a skinned limb gib from DiverRig.sever()
//   chunks(w, x, y, n, speed)                     // meat chunks
import * as THREE from 'three';
import type { Entity, World, Team } from '../game/types';
import { gore, bleed, silt } from './fx';
import { kitMat } from '../humans/diveGear';
import { band, hh, nz } from '../humans/fabric';
import { mix } from '../gfx/px';

const _v = new THREE.Vector3();

/** a severed limb (a skinned gib from DiverRig.sever) tumbling down through the water */
export class LimbGib implements Entity {
  kind = 'gib'; team: Team = 'neutral';
  x: number; y: number; vx: number; vy: number; r: number; alive = true;
  obj: THREE.Object3D;
  biteable = true;
  private spin: THREE.Vector3;
  private life = 0;
  private bleedT = 4;
  private rest = 0;
  private sinkK: number;
  constructor(holder: THREE.Object3D, vx: number, vy: number, heavy = false, flesh = true) {
    this.obj = holder;
    this.x = holder.position.x; this.y = holder.position.y;
    this.vx = vx; this.vy = vy;
    this.r = (holder.userData.radius as number) ?? 0.2;
    this.spin = new THREE.Vector3((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 9);
    this.sinkK = heavy ? 3.5 : 1.2;
    if (!flesh) { this.bleedT = 0; this.biteable = false; this.kind = 'prop'; this.sinkK = 2.4; }
  }
  update(dt: number, w: World) {
    this.life += dt;
    const surf = w.water.heightAt(this.x);
    const under = this.y < surf;
    this.vy += (under ? -this.sinkK : -9.8) * dt;
    const dr = Math.exp(-(under ? 1.6 : 0.1) * dt);
    this.vx *= dr; this.vy *= dr;
    this.x += this.vx * dt; this.y += this.vy * dt;
    const fl = w.terrain.floorAt(this.x) + this.r * 0.4;
    if (this.y < fl) {
      this.y = fl;
      if (this.vy < -0.6) silt(w, this.x, this.y, 4);
      this.vy = 0; this.vx *= 0.5; this.spin.multiplyScalar(0.3); this.rest += dt;
    }
    const s = this.sd(dt);
    this.obj.rotation.x += this.spin.x * dt * s; this.obj.rotation.y += this.spin.y * dt * s; this.obj.rotation.z += this.spin.z * dt * s;
    this.spin.multiplyScalar(Math.exp(-dt * 0.6));
    // trailing blood from the cut while it's fresh
    if (this.bleedT > 0) { this.bleedT -= dt; if (Math.random() < dt * 14) bleed(w, this.x, this.y, 0.35 * (this.bleedT / 4) + 0.1); }
    // buried by the silt after a while
    if (this.life > 30) this.obj.position.y -= dt * 0.05;
    this.obj.position.set(this.x, this.y - Math.max(0, this.life - 30) * 0.05, this.obj.position.z);
    if (this.life > 40) this.alive = false;
  }
  private sd(dt: number) { void dt; return this.rest > 0 ? 0.2 : 1; }
  onBite(w: World) {
    gore(w, this.x, this.y, 0.7);
    w.drop(this.x, this.y, { heal: 1 });
    w.sfx('chomp', this.x, 0.6);
    this.alive = false;
  }
  hit(dmg: number, dx: number, dy: number, w: World): boolean {
    this.vx += dx * 3; this.vy += dy * 3 + 1;
    this.spin.z += (Math.random() - 0.5) * 10;
    gore(w, this.x, this.y, 0.4);
    void dmg;
    return true;
  }
}

// ------------------------------------------------------------------ meat chunks (no entity per chunk: one field)
let chunkGeo: THREE.BufferGeometry | null = null;
let chunkMat: THREE.Material | null = null;
function fleshMat() {
  return (chunkMat ??= kitMat('flesh', 32, 32, (x, y) => {
    const n = nz(x, y, 6, 71);
    if (n > 0.72) return band([230, 206, 150], 0.9 + hh(x, y, 72) * 0.2, x, y);     // fat
    if (n < 0.22) return band([220, 210, 190], 1, x, y);                               // bone / gristle
    return band(mix([150, 26, 24], [92, 12, 14], nz(x, y, 3, 73)), 0.9 + ((x + y * 2) % 5 === 0 ? 0.25 : 0), x, y);
  }, { rough: 0.35, emissive: 0.08 }));
}
interface Chunk { m: THREE.Mesh; x: number; y: number; z: number; vx: number; vy: number; spin: number; life: number; s: number }

/** all loose meat chunks in a world (one entity) */
export class ChunkField implements Entity {
  kind = 'goreField'; team: Team = 'neutral';
  x = 0; y = 0; vx = 0; vy = 0; r = 0; alive = true;
  obj = new THREE.Group();
  private list: Chunk[] = [];
  add(x: number, y: number, vx: number, vy: number, s: number) {
    if (this.list.length > 60) { const old = this.list.shift()!; old.m.removeFromParent(); }
    chunkGeo ??= new THREE.IcosahedronGeometry(1, 0);
    const m = new THREE.Mesh(chunkGeo, fleshMat());
    m.scale.set(s * (0.8 + Math.random() * 0.5), s * (0.6 + Math.random() * 0.5), s * (0.7 + Math.random() * 0.5));
    m.castShadow = true;
    this.obj.add(m);
    this.list.push({ m, x, y, z: (Math.random() - 0.5) * 0.4, vx, vy, spin: (Math.random() - 0.5) * 12, life: 0, s });
  }
  update(dt: number, w: World) {
    for (const c of this.list) {
      c.life += dt;
      const under = c.y < w.water.heightAt(c.x);
      c.vy += (under ? -1.8 : -9.8) * dt;
      const dr = Math.exp(-(under ? 2 : 0.1) * dt);
      c.vx *= dr; c.vy *= dr;
      c.x += c.vx * dt; c.y += c.vy * dt;
      const fl = w.terrain.floorAt(c.x) + c.s * 0.5;
      if (c.y < fl) { c.y = fl; c.vy = 0; c.vx *= 0.4; c.spin *= 0.5; }
      if (c.life < 2.5 && Math.random() < dt * 5) bleed(w, c.x, c.y, 0.15);
      c.m.rotation.x += c.spin * dt; c.m.rotation.z += c.spin * 0.7 * dt;
      c.m.position.set(c.x, c.y - Math.max(0, c.life - 20) * 0.02, c.z);
    }
    for (let i = this.list.length - 1; i >= 0; i--) if (this.list[i].life > 26) { this.list[i].m.removeFromParent(); this.list.splice(i, 1); }
  }
  /** nearest chunk within r of (x, y) (scavengers / the blobfish eat them) */
  eatNear(x: number, y: number, r: number): boolean {
    for (let i = 0; i < this.list.length; i++) {
      const c = this.list[i];
      if (Math.hypot(c.x - x, c.y - y) < r) { c.m.removeFromParent(); this.list.splice(i, 1); return true; }
    }
    return false;
  }
}

const fields = new WeakMap<World, ChunkField>();
export function chunkField(w: World): ChunkField {
  let f = fields.get(w);
  if (!f || !f.alive || !w.entities.includes(f)) { f = new ChunkField(); fields.set(w, f); w.add(f); }
  return f;
}

/** a burst of meat chunks */
export function chunks(w: World, x: number, y: number, n: number, speed = 3, size = 0.06) {
  const f = chunkField(w);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random() * 0.7);
    f.add(x + (Math.random() - 0.5) * 0.2, y + (Math.random() - 0.5) * 0.2, Math.cos(a) * s, Math.sin(a) * s + 0.8, size * (0.6 + Math.random() * 0.8));
  }
}

/** a dropped weapon / tool sinking to the seabed */
export function spawnProp(w: World, holder: THREE.Object3D, vx: number, vy: number) {
  const g = new LimbGib(holder, vx, vy, false, false);
  w.add(g);
  return g;
}

/** spawn a severed limb (DiverRig.sever result) as a gib entity */
export function spawnLimb(w: World, holder: THREE.Object3D | null, vx: number, vy: number, heavy = false): LimbGib | null {
  if (!holder) return null;
  const g = new LimbGib(holder, vx, vy, heavy);
  w.add(g);
  gore(w, g.x, g.y, 1.6, vx * 0.2, vy * 0.2);
  chunks(w, g.x, g.y, 3, 2.5);
  return g;
}
export { _v };
