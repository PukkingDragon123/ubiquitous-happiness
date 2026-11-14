// Pickups in a room. Counters (pearls, hearts, keys, puffer-bombs) and items (gear + materials, which go into the
// pack). They pop out with a little arc, drift down through the water, settle on the sand and bob; the magnet stat
// pulls them in. Collecting asks the run (DungeonWorld.collect): an item that doesn't fit stays put and floats a
// "PACK FULL" tag; a heart at full health stays too.
//
//   world.add(new Pickup('pearl', x, y, { value: 5 }))
//   world.add(new Pickup('item', x, y, { id: 'copperOre' }))
import * as THREE from 'three';
import type { Entity, World, Team } from '../game/types';
import { itemMesh, getItem, RARITY_COLOR } from '../game/items';
import { keyModel, bombModel, pearlModel, heartModel, disposeModel } from './models';

export type PickKind = 'pearl' | 'heart' | 'key' | 'bomb' | 'item';

export interface PickOpts {
  /** pearls: 1 / 5 / 10; hearts: half-hearts (1 or 2) */
  value?: number;
  id?: string; level?: number; n?: number;
  /** seconds before it can be collected (dropped from the pack: until the player has swum off) */
  hold?: number;
  /** dropped on purpose: no magnet and no auto-collect until the player has left it once */
  dropped?: boolean;
  /** launch velocity (default: a small random pop) */
  vx?: number; vy?: number;
}

export interface PickupHost extends World {
  /** true = collected (the pickup goes away) */
  collect?(p: Pickup): boolean;
  magnet?: number;
}

export class Pickup implements Entity {
  kind = 'pickup'; team: Team = 'neutral';
  x: number; y: number; vx: number; vy: number; r = 0.3; alive = true;
  obj = new THREE.Group();
  t = 0;
  value: number;
  id?: string; level: number; n: number;
  /** the run refused it (pack full / health full): it waits, no magnet */
  refused = 0;
  /** dropped: waits for the player to swim away before it can be picked again */
  dropped: boolean;
  private hold: number;
  private spin = Math.random() * 6;
  private settled = false;
  private model: THREE.Object3D;
  constructor(public pk: PickKind, x: number, y: number, o: PickOpts = {}) {
    this.x = x; this.y = y;
    this.vx = o.vx ?? (Math.random() - 0.5) * 3; this.vy = o.vy ?? 1.6 + Math.random() * 1.8;
    this.value = o.value ?? (pk === 'heart' ? 2 : 1);
    this.id = o.id; this.level = o.level ?? 1; this.n = o.n ?? 1;
    this.hold = o.hold ?? 0.35;
    this.dropped = !!o.dropped;
    switch (pk) {
      case 'item': { const m = itemMesh(o.id!, this.level); m.scale.multiplyScalar(0.85); this.model = m; this.r = 0.45; break; }
      case 'key': this.model = keyModel(); this.model.scale.setScalar(1.25); this.r = 0.35; break;
      case 'bomb': this.model = bombModel(); this.model.scale.setScalar(1.15); this.r = 0.35; break;
      case 'heart': this.model = heartModel(this.value < 2); this.model.scale.setScalar(1.25); this.r = 0.35; break;
      default: this.model = pearlModel(this.value); this.r = 0.28; break;
    }
    this.obj.add(this.model);
  }
  get label(): string {
    switch (this.pk) {
      case 'item': { const d = getItem(this.id!); return this.n > 1 ? `${d.name} x${this.n}` : d.name; }
      case 'pearl': return this.value > 1 ? `${this.value} PEARLS` : 'PEARL';
      case 'heart': return this.value > 1 ? 'HEART' : 'HALF HEART';
      case 'key': return 'KEY';
      default: return 'PUFFER-BOMB';
    }
  }
  update(dt: number, w: World) {
    this.t += dt;
    this.hold -= dt;
    this.refused = Math.max(0, this.refused - dt);
    const p = w.player;
    const dx = p.x - this.x, dy = p.y - this.y, d = Math.hypot(dx, dy) || 1e-3;
    if (this.dropped && d > 2.2 && this.hold <= 0) this.dropped = false;
    const mag = ((w as PickupHost).magnet ?? 1.2) + (this.pk === 'item' ? 0.3 : 0.6);
    const pull = this.t > 0.5 && p.alive && !this.dropped && this.refused <= 0 && d < mag * 1.6;
    if (pull) {
      const k = (1 - d / (mag * 1.6)) * 26;
      this.vx += (dx / d) * k * dt; this.vy += (dy / d) * k * dt;
      this.settled = false;
    } else this.vy -= 0.9 * dt; // sinks slowly through the water
    this.vx *= Math.exp(-2.2 * dt); this.vy *= Math.exp(-2 * dt);
    this.x += this.vx * dt; this.y += this.vy * dt;
    // stay in the water box (walls + ceiling)
    const s = w.terrain.sdf(this.x, this.y);
    if (s < this.r * 0.6) { const n = w.terrain.normal(this.x, this.y); this.x += n.x * (this.r * 0.6 - s); this.y += n.y * (this.r * 0.6 - s); const vn = this.vx * n.x + this.vy * n.y; if (vn < 0) { this.vx -= vn * n.x * 1.4; this.vy -= vn * n.y * 1.4; } }
    const fl = w.terrain.floorAt(this.x) + 0.25;
    if (this.y < fl) { this.y = fl; this.vy = Math.abs(this.vy) * 0.25; if (!this.settled) { this.settled = true; w.fx.touch(this.x, fl - 0.2, 0.4); } }
    this.spin += dt * (1.6 + (d < 2 ? 5 : 0));
    const bob = Math.sin(this.t * 2.6 + this.spin * 0.1) * 0.06;
    this.obj.position.set(this.x, this.y + bob + 0.05, 0.15);
    this.obj.rotation.y = this.pk === 'heart' || this.pk === 'key' ? Math.sin(this.t * 1.7) * 0.7 : this.spin;
    if (this.pk === 'bomb') { this.obj.rotation.y = Math.sin(this.t * 1.3) * 0.6; this.model.rotation.z = Math.sin(this.t * 2.1) * 0.15; }
    const pop = Math.min(1, this.t * 6);
    this.obj.scale.setScalar(pop * (this.refused > 0 ? 1 + Math.sin(this.t * 10) * 0.04 : 1));
    if ((this.pk === 'item' || this.pk === 'key') && Math.random() < dt * 3) w.fx.glint(this.x + (Math.random() - 0.5) * 0.3, this.y + (Math.random() - 0.5) * 0.3);
    if (this.hold <= 0 && !this.dropped && this.refused <= 0 && p.alive && d < 0.6 + this.r) this.tryCollect(w);
  }
  private tryCollect(w: World) {
    const host = w as PickupHost;
    if (host.collect && !host.collect(this)) { this.refused = 0.6; return; }
    this.alive = false;
    const col = this.pk === 'item' ? RARITY_COLOR[getItem(this.id!).rarity] : this.pk === 'heart' ? '#ff5a7a' : this.pk === 'key' ? '#ffd860' : this.pk === 'bomb' ? '#ffb040' : '#f4ece0';
    w.fx.pickup(this.x, this.y, col);
  }
  // item meshes are cached by the voxel builder: only the counter models own their geometry
  dispose() { if (this.pk !== 'item') disposeModel(this.model); }
}
