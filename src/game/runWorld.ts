// The World implementation for a v2 run (one per area): entities, the event bus, damage routing and loot. Drops
// don't go into the backpack directly: world.drop() spawns a LootPickup and collecting it hands the id to the run
// screen (onLoot), which puts materials in the loot bag (lost on death until extracted) and gear on the
// backpack's board.
import * as THREE from 'three';
import type { Game } from './game';
import type { World, Entity, Team, DamageKind, Terrain } from './types';
import type { Run } from './run';
import type { WaterFX } from '../gfx/water/water';
import type { Particles } from '../gfx/particles';
import type { FloatText } from '../ui/text';
import type { Rng } from '../core/rng';
import type { Blobfish } from '../player/blobfish';
import { audio } from '../audio/audio';
import { ITEMS, getItem, itemMesh, RARITY_COLOR } from './items';
import { resolveDrop } from './population';

/** a terrain stand-in until buildArea() installs the real one */
const FLAT: Terrain = {
  sdf: (_x, y) => y + 12, normal: () => ({ x: 0, y: 1 }), floorAt: () => -12, snags: () => [],
};

export class RunWorld implements World {
  entities: Entity[] = [];
  time = 0;
  terrain: Terrain = FLAT;
  /** pickup attraction radius (cached from the run's stats) */
  magnet = 1.2;
  /** a pickup was collected: the run screen bags it */
  onLoot?: (what: { item?: string; heal?: number }, x: number, y: number) => void;
  /** player i-frames / god mode for testing */
  god = false;
  private listeners = new Map<string, ((d: Record<string, unknown>) => void)[]>();
  constructor(public game: Game, public run: Run, public scene: THREE.Scene, public camera: THREE.PerspectiveCamera, public water: WaterFX, public fx: Particles, public text: FloatText, public rng: Rng, public player: Blobfish) {}

  add<T extends Entity>(e: T): T { this.entities.push(e); if (e.obj && !e.obj.parent) this.scene.add(e.obj); return e; }
  hurtPlayer(dmg: number, fx: number, fy: number, kind?: DamageKind) { if (this.god) return; this.player.damage(dmg, fx, fy, this, kind); }
  sfx(id: string, x?: number, vol?: number, rate?: number) { audio.play(id, { x, vol, rate }); }
  near(x: number, y: number, r: number, team?: Team) {
    const out: Entity[] = [];
    for (const e of this.entities) if (e.alive && (!team || e.team === team) && Math.abs(e.x - x) < r + e.r + 2 && Math.hypot(e.x - x, e.y - y) < r + e.r) out.push(e);
    return out;
  }
  drop(x: number, y: number, what: { coins?: number; item?: string; heal?: number }) {
    if (what.item) {
      const id = resolveDrop(what.item, this.rng.next());
      if (id && ITEMS[id]) this.add(new LootPickup(x, y, { item: id }));
    }
    if (what.heal) this.add(new LootPickup(x, y, { heal: what.heal }));
    // v2 has no coins: a fat purse (bosses, nemeses) becomes doubloons
    if (what.coins && what.coins >= 20 && ITEMS.doubloon) for (let i = 0; i < Math.min(4, Math.floor(what.coins / 20)); i++) this.add(new LootPickup(x + (Math.random() - 0.5), y, { item: 'doubloon' }));
  }
  on(ev: string, fn: (d: Record<string, unknown>) => void) { const l = this.listeners.get(ev) || []; l.push(fn); this.listeners.set(ev, l); }
  emit(ev: string, data: Record<string, unknown> = {}) {
    this.run.fire(ev, data);
    for (const fn of this.listeners.get(ev) || []) fn(data);
    if (ev === 'heal') this.player.heal((data.amount as number) ?? 1, this);
  }
  /** remove every entity (area change / end of run) */
  clear() {
    for (const e of this.entities) { e.alive = false; try { e.dispose?.(this); } catch { /* already gone */ } e.obj?.removeFromParent(); }
    this.entities.length = 0;
    this.listeners.clear();
  }
}

/** a dropped item / heart: bobs, sparkles, gets pulled in by the magnet stat, pops when collected */
export class LootPickup implements Entity {
  kind = 'pickup'; team: Team = 'neutral';
  x: number; y: number; vx: number; vy: number; r = 0.3; alive = true;
  obj = new THREE.Group();
  t = 0;
  private spin = Math.random() * 6;
  private settled = false;
  constructor(x: number, y: number, public what: { item?: string; heal?: number }) {
    this.x = x; this.y = y;
    this.vx = (Math.random() - 0.5) * 3; this.vy = 1.5 + Math.random() * 2;
    if (what.item) {
      const v = itemMesh(what.item, 1);
      v.scale.multiplyScalar(0.8);
      this.obj.add(v);
      this.r = 0.45;
    } else {
      const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), new THREE.MeshStandardMaterial({ color: '#ff5a7a', roughness: 0.8, emissive: '#600010', flatShading: true }));
      this.obj.add(s);
    }
  }
  update(dt: number, w: World) {
    this.t += dt;
    const p = w.player;
    const dx = p.x - this.x, dy = p.y - this.y, d = Math.hypot(dx, dy) || 1e-3;
    const mag = ((w as RunWorld).magnet ?? 1.2) + (this.what.item ? 0.5 : 0);
    if (this.t > 0.5 && p.alive && d < mag * 1.6) {
      const k = (1 - d / (mag * 1.6)) * 24;
      this.vx += (dx / d) * k * dt; this.vy += (dy / d) * k * dt;
      this.settled = false;
    } else {
      const under = this.y < w.water.heightAt(this.x);
      this.vy += (under ? -0.6 : -9.8) * dt;
    }
    this.vx *= Math.exp(-2 * dt); this.vy *= Math.exp(-2 * dt);
    this.x += this.vx * dt; this.y += this.vy * dt;
    const fl = w.terrain.floorAt(this.x) + 0.2;
    if (this.y < fl) { this.y = fl; this.vy = Math.abs(this.vy) * 0.3; if (!this.settled) { this.settled = true; w.fx.touch(this.x, fl - 0.2, 0.4); } }
    this.spin += dt * (2 + (d < 2 ? 6 : 0));
    this.obj.position.set(this.x, this.y + Math.sin(this.t * 3) * 0.05, 0.1);
    this.obj.rotation.y = this.spin;
    this.obj.scale.setScalar(Math.min(1, this.t * 6));
    if (this.what.item && Math.random() < dt * 3) w.fx.glint(this.x + (Math.random() - 0.5) * 0.3, this.y + (Math.random() - 0.5) * 0.3);
    if (this.t > 0.35 && p.alive && d < 0.6 + this.r) this.collect(w);
    if (this.t > 90) this.alive = false;
  }
  private collect(w: World) {
    this.alive = false;
    if (this.what.item) {
      const d = getItem(this.what.item);
      w.text.pop(d.name, this.x, this.y + 0.6, 'item', { size: 0.34, life: 1.6, vy: 0.5 });
      w.fx.pickup(this.x, this.y, RARITY_COLOR[d.rarity]);
      w.sfx('pickup_sparkle1', this.x, 0.6); w.sfx('jin_catch', this.x, 0.35);
      w.emit('itemPicked', { id: this.what.item });
    }
    if (this.what.heal) (w.player as unknown as Blobfish).heal(this.what.heal, w);
    (w as RunWorld).onLoot?.(this.what, this.x, this.y);
  }
}
