// What special rooms hold, as small props the run screen updates (not world entities, so room clears ignore them):
//   Pedestal   a carved plinth with an item floating over it (treasure, boss reward, secret room)
//   ShopStock  Mr. Crab's stall (CrabShop + MrCrab from src/story/crab.ts) with 3-4 stands and price tags
//   ChestProp  the challenge room's reward chest: the lid creaks open and the loot pops out
//   ExitHatch  the boss arena's way down: a porthole hatch in the seabed that swings open on a cold current
// (the post office is the area's MailBuoy + manatee, built with the level: src/dungeon/levelBuild.ts)
import * as THREE from 'three';
import type { World } from '../game/types';
import { getItem } from '../game/items';
import { itemObject } from './pickups';
import { Text3DLayer, T3D, type Text3D } from '../ui/text3d';
import { MrCrab, CrabShop } from '../story/crab';
import type { ShopSlot } from './level';
import { pedestalModel, chestModel, floorHatch, keyModel, bombModel, seaGrapeModel, disposeModel, type ChestKind, type FloorHatch } from './models';
import type { ChestPlan } from './level';
import type { Entity, Team } from '../game/types';
import type { LampHandle } from '../gfx/lighting';

type Rig = { lamp(x: number, y: number, z: number, color: string, intensity?: number, distance?: number): LampHandle | null } | null;

// ------------------------------------------------------------------ pedestal
export class Pedestal {
  group = new THREE.Group();
  item: THREE.Object3D | null = null;
  id: string | null;
  private t = Math.random() * 5;
  constructor(area: string, public x: number, public floorY: number, id: string | null) {
    this.id = id;
    this.group.add(pedestalModel(area));
    this.group.position.set(x, floorY - 0.1, -0.2);
    if (id) this.setItem(id);
  }
  /** where the item floats (world) */
  get itemY() { return this.floorY + 1.95; }
  set z(v: number) { this.group.position.z = v; }
  setItem(id: string | null) {
    if (this.item) { this.item.removeFromParent(); this.item = null; }
    this.id = id;
    if (!id) return;
    const m = itemObject(id, 1);
    const holder = new THREE.Group();
    holder.add(m);
    holder.position.set(0, 2.05, 0.2);
    this.group.add(holder);
    this.item = holder;
  }
  update(dt: number, w: World) {
    this.t += dt;
    if (this.item) {
      this.item.position.y = 2.05 + Math.sin(this.t * 2) * 0.1;
      this.item.rotation.y = Math.sin(this.t * 0.9) * 0.6;
      if (Math.random() < dt * 4) w.fx.glint(this.x + (Math.random() - 0.5) * 0.6, this.itemY + (Math.random() - 0.5) * 0.5);
      if (Math.random() < dt * 1.2) w.fx.emit('glow', this.x, this.itemY, { n: 1, size: 1.2, life: 0.8, color: '#ffe8a0' });
    }
  }
  dispose() { this.group.removeFromParent(); disposeModel(this.group.children[0]); }
}

// ------------------------------------------------------------------ the shop
export interface ShopStand { slot: ShopSlot; x: number; y: number; model: THREE.Group; tag: Text3D | null }
export class ShopStock {
  group = new THREE.Group();
  crab = new MrCrab();
  stall = new CrabShop();
  stands: ShopStand[] = [];
  private t = 0;
  constructor(public w: World, public t3d: Text3DLayer, public slots: ShopSlot[], floorAt: (x: number) => number, area: string, cx = 0) {
    const sx = cx, fl = floorAt(sx);
    this.stall.group.position.set(sx, fl - 0.15, -2.6);
    this.stall.group.scale.setScalar(1.35);
    this.group.add(this.stall.group);
    this.stall.group.updateMatrixWorld(true);
    const c = this.stall.counter.clone().multiplyScalar(1.35).add(this.stall.group.position);
    this.crab.group.position.set(c.x, c.y - 0.6, c.z - 0.1);
    this.crab.group.scale.setScalar(1.5);
    this.group.add(this.crab.group);
    this.crab.onPuff = (p) => w.fx.emit('bubble', p.x, p.y, { n: 2, spread: 0.05, vy: 0.8, life: 2 });
    const xs = (slots.length === 4 ? [-6.5, -3.8, 3.8, 6.5] : slots.length === 3 ? [-5.5, -3, 3.4] : [-4.5, 4.5]).map((v) => v + cx);
    slots.forEach((slot, i) => {
      const x = xs[i] ?? cx + i * 2 - 4, y = floorAt(x);
      const model = new THREE.Group();
      const stand = pedestalModel(area); stand.scale.set(0.8, 0.62, 0.8); model.add(stand);
      const goods = slot.kind === 'item' ? itemObject(slot.id!, 1) : slot.kind === 'key' ? keyModel() : slot.kind === 'bomb' ? bombModel() : seaGrapeModel(false);
      goods.position.y = 1.15; goods.scale.setScalar(slot.kind === 'item' ? 1.7 : 2.2);
      goods.name = 'goods';
      model.add(goods);
      model.position.set(x, y - 0.05, 0.1);
      this.group.add(model);
      const st: ShopStand = { slot, x, y, model, tag: null };
      this.stands.push(st);
      if (!slot.sold) st.tag = t3d.add(`${slot.price}`, x, y + 2.15, 0.6, T3D.gold, { size: 0.42, life: 0, bob: 0.05 });
      else model.getObjectByName('goods')!.visible = false;
    });
  }
  sell(st: ShopStand) {
    st.slot.sold = true;
    st.tag?.hide(); st.tag = null;
    const g = st.model.getObjectByName('goods'); if (g) g.visible = false;
    this.crab.snip();
  }
  label(st: ShopStand): string {
    switch (st.slot.kind) {
      case 'item': return getItem(st.slot.id!).name;
      case 'heart': return 'SEA GRAPES';
      case 'key': return 'KEY';
      default: return 'PUFFER-BOMB';
    }
  }
  setLighting(rig: Rig) { this.stall.setLighting(rig); }
  update(dt: number) {
    this.t += dt;
    this.stall.update(dt);
    this.crab.lookX = this.w.player.x;
    this.crab.update(dt);
    for (const s of this.stands) { const g = s.model.getObjectByName('goods'); if (g) { g.rotation.y = Math.sin(this.t + s.x) * 0.8; g.position.y = 1.15 + Math.sin(this.t * 2 + s.x) * 0.06; } }
  }
  head() { return this.crab.head(); }
  dispose() { this.stall.release(); for (const s of this.stands) s.tag?.hide(); this.group.removeFromParent(); }
}

// ------------------------------------------------------------------ chests
/**
 * A chest in the world (an Entity, so it lives with the pickups): route chests from the plan, the big chest that
 * drops in when an arena is cleared, a champion's dropped chest. It sits on the floor (or falls to it); the run opens
 * it when the blobfish touches it (a locked one takes a key, automatically). Big and locked chests glint while shut.
 */
export class Chest implements Entity {
  kind = 'chest'; team: Team = 'neutral';
  x: number; y: number; vx = 0; vy = 0; r = 0.8; alive = true;
  obj = new THREE.Group();
  m: ReturnType<typeof chestModel>;
  open = false;
  locked: boolean;
  /** the plan entry (route chests) */
  plan: ChestPlan | null;
  /** falling into place (dropped / dropped in) */
  falling: boolean;
  /** the run refused it for now (locked, no key): a little shake */
  refused = 0;
  private t = 0;
  private lidA = 0;
  private landed = false;
  constructor(public ck: ChestKind, x: number, y: number, o: { plan?: ChestPlan; opened?: boolean; fallFrom?: number } = {}) {
    this.m = chestModel(ck);
    this.obj.add(this.m.root);
    this.x = x; this.y = o.fallFrom ?? y;
    this.plan = o.plan ?? null;
    this.open = !!o.opened;
    this.locked = ck === 'locked' && !this.open;
    this.falling = o.fallFrom !== undefined;
    const sc = ck === 'big' ? 1.25 : ck === 'small' ? 1.05 : 1.15;
    this.m.root.scale.setScalar(sc);
    this.r = ck === 'big' ? 1.1 : 0.8;
    if (this.open) { this.lidA = 1.9; if (this.m.lock) this.m.lock.visible = false; }
    this.obj.position.set(this.x, this.y, -0.15);
  }
  /** the run opened it */
  openNow(w: World) {
    if (this.open) return;
    this.open = true; this.locked = false;
    if (this.m.lock) this.m.lock.visible = false;
    if (this.plan) this.plan.opened = true;
    w.sfx('chest_creak', this.x, 0.7); w.sfx(this.ck === 'big' ? 'jin_rare1' : 'treasure1', this.x, 0.55);
    w.fx.emit('glow', this.x, this.y + 0.8, { n: 2, size: this.ck === 'big' ? 3.2 : 2.2, life: 0.6, color: '#ffe0a0' });
    w.fx.burst('star', this.x, this.y + 0.9, this.ck === 'big' ? 22 : 12, 3, { color: '#fff2b0' });
  }
  unlockFx(w: World) {
    const lp = new THREE.Vector3(); this.m.lock?.getWorldPosition(lp);
    w.fx.burst('spark', lp.x || this.x, lp.y || this.y + 0.4, 14, 2.6, { color: '#ffe07a' });
    w.sfx('k_confirm1', this.x, 0.7); w.sfx('clank1', this.x, 0.6);
  }
  update(dt: number, w: World) {
    this.t += dt;
    this.refused = Math.max(0, this.refused - dt);
    if (this.falling) {
      this.vy -= 14 * dt;
      this.y += this.vy * dt;
      const fl = (w.terrain as { floorUnder?: (x: number, y: number) => number }).floorUnder?.(this.x, this.y + 0.5) ?? w.terrain.floorAt(this.x);
      if (this.y <= fl) {
        this.y = fl; this.falling = false; this.vy = 0;
        if (!this.landed) { this.landed = true; w.fx.touch(this.x, fl, 1.6); w.fx.debrisBurst(this.x, fl + 0.1, 10, '#c8b48e', 3, 0.06); w.sfx('thud_heavy1', this.x, 0.7, 0.9); w.game.addShake(0.12); }
      }
    }
    const tgt = this.open ? 1.9 : 0;
    this.lidA += (tgt - this.lidA) * (1 - Math.exp(-dt * (this.open ? 7 : 4)));
    this.m.lid.rotation.x = -this.lidA;
    (this.m.glow.material as THREE.MeshBasicMaterial).opacity = this.open ? Math.max(0, 0.8 - (this.t % 100) * 0) * Math.min(1, this.lidA) * 0.6 : 0;
    // shut chests that hold something good glint now and then; a refused one rattles
    if (!this.open && (this.ck === 'big' || this.ck === 'locked' || this.ck === 'sunken') && Math.random() < dt * 1.5) w.fx.glint(this.x + (Math.random() - 0.5) * 1.2, this.y + 0.3 + Math.random() * 0.6);
    const shake = this.refused > 0 ? Math.sin(this.t * 40) * 0.05 * this.refused : 0;
    this.obj.position.set(this.x + shake, this.y - 0.02, -0.15);
    this.obj.rotation.z = this.open ? 0 : Math.sin(this.t * 3) * 0.008;
    if (this.m.lock && this.m.lock.visible) this.m.lock.rotation.z = Math.sin(this.t * 2.2) * 0.12;
  }
  dispose() { disposeModel(this.m.root); }
}

// ------------------------------------------------------------------ the boss room's exit
export class ExitHatch {
  m: FloorHatch;
  active = false;
  private t = 0;
  private openA = 0;
  constructor(public w: World, public x: number, public y: number) {
    this.m = floorHatch();
    this.m.root.position.set(x, y - 0.12, 0);
    this.m.glow.visible = false;
  }
  get group() { return this.m.root; }
  activate() {
    if (this.active) return;
    this.active = true;
    this.w.sfx('creak3', this.x, 0.7); this.w.sfx('flood_rush1', this.x, 0.55); this.w.sfx('jin_arrive', this.x, 0.5);
  }
  update(dt: number) {
    this.t += dt;
    if (!this.active) return;
    this.openA = Math.min(1, this.openA + dt * 0.8);
    this.m.door.rotation.z = this.openA * 1.9;
    this.m.wheel.rotation.y += dt * 4 * (1 - this.openA);
    this.m.glow.visible = this.openA > 0.2;
    const k = 0.75 + Math.sin(this.t * 3) * 0.25;
    (this.m.glow.material as THREE.MeshBasicMaterial).color.setRGB(0.4 * k, 1.3 * k, 1.6 * k);
    // the current: bubbles and specks spiralling down into it
    if (this.openA > 0.3) for (let i = 0; i < 2; i++) if (Math.random() < dt * 30) {
      const a = Math.random() * Math.PI * 2, r = 1.6 + Math.random() * 1.2;
      this.w.fx.emit('bubble', this.x + Math.cos(a) * r, this.y + 0.6 + Math.random() * 2.5, { n: 1, vx: -Math.cos(a) * 1.5, vy: -1.6, life: 1.2, size: 0.06 });
    }
  }
  dispose() { this.m.root.removeFromParent(); disposeModel(this.m.root); }
}
