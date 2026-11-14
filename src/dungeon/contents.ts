// What special rooms hold, as small props the run screen updates (not world entities, so room clears ignore them):
//   Pedestal   a carved plinth with an item floating over it (treasure, boss reward, secret room)
//   ShopStock  Mr. Crab's stall (CrabShop + MrCrab from src/story/crab.ts) with 3-4 stands and price tags
//   ChestProp  the challenge room's reward chest: the lid creaks open and the loot pops out
//   ExitHatch  the boss room's way down: a porthole hatch in the floor that swings open on a cold current
//   PostOffice the manatee (src/area/manatee.ts) waiting by a pillar box; she takes mail home
import * as THREE from 'three';
import type { World } from '../game/types';
import { itemMesh, getItem } from '../game/items';
import { Text3DLayer, T3D, type Text3D } from '../ui/text3d';
import { MrCrab, CrabShop } from '../story/crab';
import { Manatee } from '../area/manatee';
import type { Scenery } from '../area/scenery';
import type { ShopSlot } from './floor';
import { pedestalModel, chestModel, floorHatch, postBox, keyModel, bombModel, heartModel, disposeModel, type ChestModel, type FloorHatch } from './models';
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
  setItem(id: string | null) {
    if (this.item) { this.item.removeFromParent(); this.item = null; }
    this.id = id;
    if (!id) return;
    const m = itemMesh(id, 1);
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
  constructor(public w: World, public t3d: Text3DLayer, public slots: ShopSlot[], floorAt: (x: number) => number, area: string) {
    const sx = 0, fl = floorAt(sx);
    this.stall.group.position.set(sx, fl - 0.15, -2.6);
    this.stall.group.scale.setScalar(1.35);
    this.group.add(this.stall.group);
    this.stall.group.updateMatrixWorld(true);
    const c = this.stall.counter.clone().multiplyScalar(1.35).add(this.stall.group.position);
    this.crab.group.position.set(c.x, c.y - 0.6, c.z - 0.1);
    this.crab.group.scale.setScalar(1.5);
    this.group.add(this.crab.group);
    this.crab.onPuff = (p) => w.fx.emit('bubble', p.x, p.y, { n: 2, spread: 0.05, vy: 0.8, life: 2 });
    const xs = slots.length === 4 ? [-7, -4, 4, 7] : slots.length === 3 ? [-6, -3.2, 3.6] : [-5, 5];
    slots.forEach((slot, i) => {
      const x = xs[i] ?? i * 2 - 4, y = floorAt(x);
      const model = new THREE.Group();
      const stand = pedestalModel(area); stand.scale.set(0.7, 0.55, 0.7); model.add(stand);
      const goods = slot.kind === 'item' ? itemMesh(slot.id!, 1) : slot.kind === 'key' ? keyModel() : slot.kind === 'bomb' ? bombModel() : heartModel(false);
      goods.position.y = 1.0; if (slot.kind !== 'item') goods.scale.setScalar(1.5);
      goods.name = 'goods';
      model.add(goods);
      model.position.set(x, y - 0.05, 0.1);
      this.group.add(model);
      const st: ShopStand = { slot, x, y, model, tag: null };
      this.stands.push(st);
      if (!slot.sold) st.tag = t3d.add(`${slot.price}`, x, y + 1.75, 0.6, T3D.gold, { size: 0.32, life: 0, bob: 0.05 });
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
      case 'heart': return 'HEART';
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
    for (const s of this.stands) { const g = s.model.getObjectByName('goods'); if (g) { g.rotation.y = Math.sin(this.t + s.x) * 0.8; g.position.y = 1.0 + Math.sin(this.t * 2 + s.x) * 0.06; } }
  }
  head() { return this.crab.head(); }
  dispose() { this.stall.release(); for (const s of this.stands) s.tag?.hide(); this.group.removeFromParent(); }
}

// ------------------------------------------------------------------ chest
export class ChestProp {
  m: ChestModel;
  open = false;
  private t = 0;
  private lidA = 0;
  constructor(public x: number, public y: number, opened: boolean) {
    this.m = chestModel();
    this.m.root.position.set(x, y - 0.05, -0.1);
    this.m.root.scale.setScalar(1.25);
    this.open = opened;
    if (opened) this.lidA = 1.9;
  }
  get group() { return this.m.root; }
  update(dt: number) {
    this.t += dt;
    const tgt = this.open ? 1.9 : 0;
    this.lidA += (tgt - this.lidA) * (1 - Math.exp(-dt * 5));
    this.m.lid.rotation.x = -this.lidA;
    if (!this.open) this.m.root.rotation.z = Math.sin(this.t * 7) * 0.012;
  }
  dispose() { this.m.root.removeFromParent(); disposeModel(this.m.root); }
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

// ------------------------------------------------------------------ post office
export class PostOffice {
  group = new THREE.Group();
  manatee: Manatee;
  box = postBox();
  /** cells mailed from this post office so far (her bag holds CAPACITY per floor) */
  used = 0;
  static CAPACITY = 8;
  private t = 0;
  /** build before the scenery finishes (the manatee paints into its prop atlas) */
  constructor(scen: Scenery, public w: World, public x: number, public floorY: number) {
    this.manatee = new Manatee(scen);
    this.group.add(this.manatee.root);
    this.box.position.set(x - 4.2, floorY - 0.05, -0.9);
    this.box.scale.setScalar(1.3);
    this.group.add(this.box);
    this.manatee.arrive(x + 4, x);
    this.manatee.state = 'waiting';
    this.manatee.x = x + 1.6; this.manatee.y = floorY + 4.2;
  }
  /** where she floats (for the [E] prompt and the dialogue) */
  get at() { return { x: this.manatee.x, y: this.manatee.y }; }
  update(dt: number, top: number) {
    this.t += dt;
    // buoyX / buoyY steer where she hangs: just over the post box, well under the ceiling
    this.manatee.update(dt, this.w, this.x, this.floorY + 6.8);
    if (this.manatee.state !== 'waiting') { this.manatee.state = 'waiting'; }
    const m = this.manatee;
    if (m.y > top - 1.6) { m.y = top - 1.6; m.root.position.y = m.y; }
  }
  celebrate() { this.manatee.celebrate(); }
  dispose() { this.manatee.dispose(); disposeModel(this.box); this.group.removeFromParent(); }
}
