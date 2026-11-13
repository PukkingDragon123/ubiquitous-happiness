// Non-fishing map nodes, played inside the dive:
//   shop     – a hermit crab merchant with wares on open clam-shell pedestals (swim over, E to buy)
//   rest     – a cleaner-shrimp spa: a warm glowing spring that heals you while you float in it
//   treasure – a barnacled shipwreck chest; whack it open with your sword
//   mystery  – a message in a bottle, a treasure, or an ambush
// Each calls done() when the node is resolved so the crossroads current can open.
import * as THREE from 'three';
import type { Entity, World, Team } from './types';
import { Voxels } from '../gfx/voxel';
import { voxelMaterial } from '../gfx/voxel';
import { uw } from '../gfx/shaders/underwater';
import { Px, ramp } from '../gfx/px';
import { textSprite, STYLES } from '../ui/text';
import { PICKUP } from './pickup';
import { Loft, V3, usFor } from '../gfx/loft';
import { TAU, damp, hash2 } from '../core/math';
import type { DiveNode } from './dive';

/** item pools by rarity, filled in by the items module integration */
export const EVENT_POOLS = {
  roll: null as ((w: World, rarity: 'common' | 'rare' | 'any') => string) | null,
  price: null as ((id: string) => number) | null,
};
const rollItem = (w: World, r: 'common' | 'rare' | 'any' = 'any') => EVENT_POOLS.roll?.(w, r) ?? 'whetstone';
const priceOf = (id: string) => EVENT_POOLS.price?.(id) ?? 15;

function shellGeo() {
  // an opened giant clam: two fluted halves
  const L = new Loft();
  const N = 24, R = 8;
  for (const lid of [0, 1]) {
    const rings: { pts: V3[]; v: number }[] = [];
    for (let r = 1; r <= R; r++) {
      const k = r / R, pts: V3[] = [];
      for (let i = 0; i <= N; i++) {
        const a = Math.PI * (i / N);
        const flute = 1 + Math.abs(Math.sin((i / N) * Math.PI * 7)) * 0.12 * k;
        const x = Math.cos(a) * k * flute * 0.7, z = Math.sin(a) * k * flute * 0.6;
        const y = (lid ? 1 : -1) * (1 - k * k) * 0.18 + (lid ? k * 0.55 : 0);
        pts.push([x, y + (lid ? 0.02 : 0), lid ? -z * 0.2 - k * 0.2 : z - 0.3]);
      }
      rings.push({ pts, v: k });
    }
    L.loft(rings, usFor(N), { x: 0, y: 0, w: 1, h: 1 }, lid, { start: [0, lid ? 0.2 : -0.18, lid ? 0 : -0.3] });
  }
  return L.build();
}

let clamMat: THREE.Material | null = null;
function clamMaterial() {
  if (clamMat) return clamMat;
  const p = new Px(64, 64);
  const r = ramp(['#3a2a4a', '#6a5a8a', '#a89ac8', '#e6dcf6', '#fff8ff'], 7);
  p.fill((x, y) => r(0.4 + Math.abs(Math.sin(x / 64 * Math.PI * 7)) * 0.35 + y / 128 + (hash2(x, y, 2) - 0.5) * 0.1, x, y));
  clamMat = uw(new THREE.MeshPhysicalMaterial({ map: p.texture(), roughness: 0.35, iridescence: 0.8, side: THREE.DoubleSide }), { rim: 0.4 });
  return clamMat;
}

class ShopStall implements Entity {
  kind = 'shop'; team: Team = 'neutral';
  x: number; y: number; vx = 0; vy = 0; r = 0.8; alive = true;
  obj = new THREE.Group();
  item: string; price: number; sold = false;
  private display: THREE.Object3D | null;
  private tag: THREE.Sprite;
  private t = Math.random() * 6;
  private hint = 0;
  constructor(x: number, y: number, item: string, price: number) {
    this.x = x; this.y = y; this.item = item; this.price = price;
    const clam = new THREE.Mesh(shellGeo(), clamMaterial());
    clam.scale.setScalar(1.3);
    clam.castShadow = true;
    this.obj.add(clam);
    this.display = PICKUP.itemVisual?.(item) ?? null;
    if (this.display) { this.display.position.set(0, 0.55, 0); this.obj.add(this.display); }
    this.tag = textSprite(`${price}`, STYLES.gold, 0.32);
    this.tag.position.set(0, 1.25, 0.3);
    this.obj.add(this.tag);
    this.obj.position.set(x, y, 0.3);
  }
  update(dt: number, w: World) {
    this.t += dt;
    if (this.display) { this.display.rotation.y = this.t * 0.8; this.display.position.y = 0.6 + Math.sin(this.t * 2) * 0.06; }
    if (this.sold) return;
    const p = w.player;
    const near = Math.hypot(p.x - this.x, p.y - (this.y + 0.6)) < 1.3;
    this.tag.scale.setScalar(1);
    this.hint -= dt;
    if (near && this.hint <= 0) { this.hint = 2.5; const nm = PICKUP.itemName?.(this.item) ?? this.item; w.text.pop(`${nm} — E to buy`, this.x, this.y + 1.8, 'hint', { size: 0.26, life: 2.2, vy: 0.05 }); }
    if (near && w.game.input.hit('interact')) {
      if (w.run.coins >= this.price) {
        w.run.coins -= this.price; this.sold = true;
        w.run.addItem(this.item);
        w.sfx('buy1', this.x, 0.8); w.sfx('coins_pile', this.x, 0.6);
        w.text.pop(PICKUP.itemName?.(this.item) ?? this.item, this.x, this.y + 1.4, 'item', { size: 0.4 });
        if (this.display) this.display.visible = false;
        this.tag.visible = false;
        w.fx.burst('star', this.x, this.y + 0.6, 8, 3);
        w.emit('bought', { id: this.item });
      } else { w.text.pop('NOT ENOUGH SHINIES', this.x, this.y + 1.6, 'danger', { size: 0.3 }); w.sfx('k_err', this.x, 0.5); }
    }
  }
}

class HealSpring implements Entity {
  kind = 'spring'; team: Team = 'neutral';
  x: number; y: number; vx = 0; vy = 0; r = 1.6; alive = true;
  obj = new THREE.Group();
  budget: number; private acc = 0; private t = 0;
  done: () => void;
  constructor(x: number, y: number, budget: number, done: () => void) {
    this.x = x; this.y = y; this.budget = budget; this.done = done;
    const glow = new THREE.Mesh(new THREE.SphereGeometry(1.6, 24, 16), new THREE.MeshBasicMaterial({ color: '#7fffd0', transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.obj.add(glow);
    // a ring of glowing voxel vents
    const V = new Voxels(24, 4, 24);
    for (let a = 0; a < TAU; a += 0.12) { const xx = 12 + Math.cos(a) * 9, zz = 12 + Math.sin(a) * 9; V.set(xx, 0, zz, 0x6a8a7a); V.set(xx, 1, zz, 0x8affd0, 200); }
    const vents = new THREE.Mesh(V.mesh(0.12), uw(voxelMaterial()));
    vents.position.y = -1.5;
    this.obj.add(vents);
    this.obj.position.set(x, y, 0);
  }
  update(dt: number, w: World) {
    this.t += dt;
    if (Math.random() < dt * 14) w.fx.emit('bubble', this.x + (Math.random() - 0.5) * 2.4, this.y - 1.4, { n: 1, vy: 1, color: '#c8ffe8', size: 0.1 });
    const p = w.player as unknown as { x: number; y: number; hp: number; maxHp: number; heal(n: number, w: World): void };
    const inside = Math.hypot(p.x - this.x, p.y - this.y) < this.r;
    if (inside && this.budget > 0 && p.hp < p.maxHp) {
      this.acc += dt;
      if (this.acc > 0.7) { this.acc = 0; p.heal(1, w); this.budget--; w.fx.emit('heart', p.x, p.y + 0.5, { n: 1, vy: 1, size: 0.25 }); }
    }
    if ((this.budget <= 0 || (inside && p.hp >= p.maxHp)) && this.done) { const d = this.done; this.done = null as unknown as () => void; w.text.pop('Refreshed!', this.x, this.y + 2, 'heal', { size: 0.4 }); d(); }
  }
}

class Chest implements Entity {
  kind = 'chest'; team: Team = 'enemy';
  x: number; y: number; vx = 0; vy = 0; r = 0.7; alive = true;
  hp = 3; maxHp = 3;
  obj = new THREE.Group();
  private lid: THREE.Object3D;
  private shake = 0;
  private opened = false;
  done: () => void;
  constructor(x: number, y: number, done: () => void) {
    this.x = x; this.y = y; this.done = done;
    const wood = 0x6a4224, dark = 0x3a2010, brass = 0xd8a840, rust = 0x8a5a2a;
    const body = new Voxels(16, 10, 11);
    for (let yy = 0; yy < 10; yy++) for (let z = 0; z < 11; z++) for (let xx = 0; xx < 16; xx++) {
      const edge = xx === 0 || xx === 15 || z === 0 || z === 10;
      const band = xx === 3 || xx === 12;
      body.set(xx, yy, z, band ? brass : edge && yy % 3 === 0 ? dark : yy % 3 === 0 ? dark : (hash2(xx, z + yy * 3, 1) > 0.9 ? rust : wood));
    }
    const lidV = new Voxels(16, 5, 11);
    for (let yy = 0; yy < 5; yy++) for (let z = 0; z < 11; z++) for (let xx = 0; xx < 16; xx++) {
      const r = Math.hypot(yy + 1, z - 5) < 5.6;
      if (!r) continue;
      lidV.set(xx, yy, z, xx === 3 || xx === 12 ? brass : yy === 4 ? dark : wood);
    }
    lidV.set(7, 1, 10, brass); lidV.set(8, 1, 10, brass); lidV.set(7, 0, 10, 0x1a1a1a);
    const mat = uw(voxelMaterial({ roughness: 0.7 }));
    const b = new THREE.Mesh(body.mesh(0.09), mat); b.castShadow = true;
    const lid = new THREE.Mesh(lidV.mesh(0.09), mat); lid.castShadow = true;
    const pivot = new THREE.Group(); pivot.position.set(0, 0.9, -0.45); lid.position.set(0, 0, 0.45); pivot.add(lid);
    this.lid = pivot;
    this.obj.add(b, pivot);
    this.obj.position.set(x, y - 0.1, 0);
    this.obj.rotation.y = -0.3;
  }
  hit(dmg: number, _dx: number, _dy: number, w: World): boolean {
    if (this.opened) return false;
    this.hp -= dmg; this.shake = 1;
    w.sfx('wood_knock1', this.x, 0.8); w.sfx('clank', this.x, 0.5);
    w.fx.debrisBurst(this.x, this.y + 0.4, 5, '#6a4224', 2.5, 0.06);
    if (this.hp <= 0) {
      this.opened = true; this.team = 'neutral';
      w.sfx('treasure1', this.x, 1); w.sfx('chest_creak', this.x, 0.6);
      w.text.pop('TREASURE!', this.x, this.y + 1.6, 'title', { size: 0.55 });
      w.drop(this.x, this.y + 1, { coins: 18 + Math.floor(w.rng.next() * 12), item: rollItem(w, 'rare') });
      w.fx.burst('star', this.x, this.y + 0.8, 14, 4);
      setTimeout(() => this.done(), 1200);
    }
    return true;
  }
  update(dt: number) {
    this.shake = Math.max(0, this.shake - dt * 4);
    this.obj.rotation.z = Math.sin(performance.now() * 0.05) * this.shake * 0.08;
    this.lid.rotation.x = damp(this.lid.rotation.x, this.opened ? -1.7 : 0, 6, dt);
  }
}

class Bottle implements Entity {
  kind = 'bottle'; team: Team = 'neutral';
  x: number; y: number; vx = 0; vy = 0; r = 0.5; alive = true; biteable = true;
  obj = new THREE.Group();
  done: () => void;
  private t = 0;
  constructor(x: number, y: number, done: () => void) {
    this.x = x; this.y = y; this.done = done;
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i <= 20; i++) { const yy = i / 20 * 0.8; const r = yy < 0.5 ? 0.16 : yy < 0.62 ? 0.16 - (yy - 0.5) * 1.0 : 0.05; pts.push(new THREE.Vector2(r, yy)); }
    const glass = new THREE.Mesh(new THREE.LatheGeometry(pts, 20), uw(new THREE.MeshPhysicalMaterial({ color: '#8ad8c8', roughness: 0.05, clearcoat: 1, transparent: true, opacity: 0.55 }), { rim: 0.8 }));
    const scroll = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.4, 10), uw(new THREE.MeshStandardMaterial({ color: '#f0e0b0', roughness: 0.9 })));
    scroll.position.y = 0.25;
    const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.08, 8), uw(new THREE.MeshStandardMaterial({ color: '#a07a4a' })));
    cork.position.y = 0.82;
    this.obj.add(glass, scroll, cork);
    this.obj.rotation.z = 1.2;
    this.obj.position.set(x, y, 0);
  }
  update(dt: number) { this.t += dt; this.obj.position.y = this.y + Math.sin(this.t * 1.5) * 0.08; this.obj.rotation.z = 1.2 + Math.sin(this.t) * 0.1; }
  onBite(w: World) {
    this.alive = false;
    w.sfx('pop_b', this.x, 0.8); w.sfx('page1', this.x, 0.7);
    const notes = ['"Whoever finds this: the old salt keeps his good tackle in the blue box."', '"Day 41. The blobfish took my bait AGAIN."', '"Treasure lies where the current bends twice."'];
    w.text.pop(notes[Math.floor(w.rng.next() * notes.length)], this.x, this.y + 1.2, 'body', { size: 0.24, life: 4, vy: 0.08 });
    w.drop(this.x, this.y, { item: rollItem(w, 'any') });
    setTimeout(() => this.done(), 1500);
  }
}

export function eventLayout(w: World, node: DiveNode, done: () => void, ambush: (x: number, y: number, n: number) => void) {
  const fl = (x: number) => w.terrain.floorAt(x);
  if (node.type === 'shop') {
    w.text.pop('"Shinies for shinies!"', 2, fl(2) + 3.2, 'hint', { size: 0.3, life: 4 });
    for (let i = 0; i < 4; i++) {
      const x = -4 + i * 3.2;
      const id = rollItem(w, i === 3 ? 'rare' : 'any');
      w.add(new ShopStall(x, fl(x) + 0.35, id, priceOf(id)));
    }
    done();
  } else if (node.type === 'rest') {
    w.add(new HealSpring(2, fl(2) + 2, 6, done));
    w.text.pop('A warm spring bubbles here...', 2, fl(2) + 4.2, 'hint', { size: 0.3, life: 4 });
  } else if (node.type === 'treasure') {
    w.add(new Chest(3, fl(3) + 0.05, done));
    w.text.pop('A sunken chest! Smack it open.', 3, fl(3) + 2.4, 'hint', { size: 0.3, life: 4 });
  } else if (node.type === 'mystery') {
    const r = w.rng.next();
    if (r < 0.35) w.add(new Bottle(2, fl(2) + 2.2, done));
    else if (r < 0.65) { w.add(new Chest(3, fl(3) + 0.05, done)); }
    else { w.text.pop('AMBUSH!', 0, -2, 'danger', { size: 0.6 }); ambush(4, fl(4) + 3, 3 + Math.floor(node.difficulty * 2)); }
  }
}
