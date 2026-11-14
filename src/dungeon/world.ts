// The World for a dungeon run (one per run; rooms swap their terrain and scenery in and out of it): entities, the
// event bus, damage routing, and drops. Enemies call world.drop() for their own loot; the dungeon decides what
// that becomes (drops are J's job): coins turn into the odd pearl, items into pack pickups at a reduced rate (the
// pack fills up fast enough), heals into hearts. Room-clear rewards are rolled by the run screen (rewards.ts).
import * as THREE from 'three';
import type { Game } from '../game/game';
import type { World, Entity, Team, DamageKind, Terrain } from '../game/types';
import type { Run } from '../game/run';
import type { WaterFX } from '../gfx/water/water';
import type { Particles } from '../gfx/particles';
import type { FloatText } from '../ui/text';
import type { Rng } from '../core/rng';
import type { Blobfish } from '../player/blobfish';
import { audio } from '../audio/audio';
import { ITEMS } from '../game/items';
import { resolveDrop } from '../game/population';
import { Pickup, type PickKind, type PickOpts } from './pickups';

const FLAT: Terrain = { sdf: (_x, y) => y + 12, normal: () => ({ x: 0, y: 1 }), floorAt: () => -12, snags: () => [] };

export class DungeonWorld implements World {
  entities: Entity[] = [];
  time = 0;
  terrain: Terrain = FLAT;
  magnet = 1.2;
  god = false;
  /** a pickup touched the player: the run decides (true = taken) */
  collect?: (p: Pickup) => boolean;
  /** fraction of enemy item drops that make it (the rest dissolve) */
  itemDropRate = 0.45;
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
  /** spawn a pickup (counters and items) */
  spawnPickup(kind: PickKind, x: number, y: number, o: PickOpts = {}): Pickup { return this.add(new Pickup(kind, x, y, o)); }
  drop(x: number, y: number, what: { coins?: number; item?: string; heal?: number }) {
    if (what.item) {
      const id = resolveDrop(what.item, this.rng.next());
      if (id && ITEMS[id] && this.rng.chance(this.itemDropRate)) this.spawnPickup('item', x, y, { id });
    }
    if (what.heal) this.spawnPickup('heart', x, y, { value: Math.max(1, Math.min(2, Math.round(what.heal))) });
    if (what.coins) {
      const c = what.coins;
      if (c >= 20) { const n = Math.min(6, Math.floor(c / 15)); for (let i = 0; i < n; i++) this.spawnPickup('pearl', x + (Math.random() - 0.5), y, { value: i === 0 && c >= 40 ? 5 : 1 }); }
      else if (this.rng.chance(Math.min(0.45, 0.1 + c * 0.04))) this.spawnPickup('pearl', x, y, { value: 1 });
    }
  }
  on(ev: string, fn: (d: Record<string, unknown>) => void) { const l = this.listeners.get(ev) || []; l.push(fn); this.listeners.set(ev, l); }
  off(ev: string, fn: (d: Record<string, unknown>) => void) { const l = this.listeners.get(ev); if (l) this.listeners.set(ev, l.filter((f) => f !== fn)); }
  emit(ev: string, data: Record<string, unknown> = {}) {
    this.run.fire(ev, data);
    for (const fn of this.listeners.get(ev) || []) fn(data);
    if (ev === 'heal') this.player.heal((data.amount as number) ?? 1, this);
  }
  /** remove every entity except the player-owned ones the caller keeps (room change) */
  clearRoom(keep: (e: Entity) => boolean = () => false) {
    const out: Entity[] = [];
    for (const e of this.entities) {
      if (keep(e)) { out.push(e); continue; }
      e.alive = false; try { e.dispose?.(this); } catch { /* already gone */ } e.obj?.removeFromParent();
    }
    this.entities = out;
  }
  clear() { this.clearRoom(); this.listeners.clear(); }
}
