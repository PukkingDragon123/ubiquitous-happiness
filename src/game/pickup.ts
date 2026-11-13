// Pickups: spinning gold doubloons, items (their 3D voxel model from the items module), and hearts.
// They bob, sparkle, get pulled in by the magnet stat, and pop with floating text when collected.
import * as THREE from 'three';
import type { Entity, World, Team } from './types';
import { Px, ramp } from '../gfx/px';
import { uw } from '../gfx/shaders/underwater';
import { damp } from '../core/math';

let coinGeo: THREE.CylinderGeometry | null = null;
let coinMat: THREE.MeshStandardMaterial | null = null;
function coinMesh() {
  if (!coinGeo) {
    coinGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.03, 18);
    coinGeo.rotateX(Math.PI / 2);
    const p = new Px(32, 32);
    const r = ramp(['#6a3e06', '#b07a10', '#f0c030', '#fff0a0'], 6);
    p.fill((x, y) => { const d = Math.hypot(x - 15.5, y - 15.5) / 16; return r(d > 0.85 ? 0.35 : d > 0.75 ? 0.85 : 0.6 + (x - y) / 64 + ((x > 12 && x < 19 && y > 9 && y < 23) ? 0.25 : 0), x, y); });
    coinMat = uw(new THREE.MeshStandardMaterial({ map: p.texture(), metalness: 0.9, roughness: 0.25, emissive: '#3a2400', emissiveIntensity: 0.5 }), { rim: 0.5, rimCol: [1, 0.85, 0.4] });
  }
  return new THREE.Mesh(coinGeo, coinMat!);
}

export const PICKUP = {
  itemVisual: null as ((id: string) => THREE.Object3D) | null,
  itemName: null as ((id: string) => string) | null,
};

export class Pickup implements Entity {
  kind = 'pickup'; team: Team = 'neutral';
  x: number; y: number; vx: number; vy: number; r = 0.3; alive = true;
  obj = new THREE.Group();
  what: { coins?: number; item?: string; heal?: number };
  t = 0;
  private spin = Math.random() * 6;
  private settled = false;

  constructor(x: number, y: number, what: { coins?: number; item?: string; heal?: number }) {
    this.x = x; this.y = y; this.what = what;
    this.vx = (Math.random() - 0.5) * 3; this.vy = 1.5 + Math.random() * 2;
    if (what.coins) this.obj.add(coinMesh());
    else if (what.item) {
      const v = PICKUP.itemVisual?.(what.item);
      if (v) { v.scale.multiplyScalar(0.9); this.obj.add(v); }
      else { const m = coinMesh(); m.scale.setScalar(2); this.obj.add(m); }
      const glow = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), new THREE.MeshBasicMaterial({ color: '#bff6ff', transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false }));
      this.obj.add(glow);
      this.r = 0.45;
    } else if (what.heal) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), uw(new THREE.MeshPhysicalMaterial({ color: '#ff5a7a', roughness: 0.2, clearcoat: 1, emissive: '#600010' })));
      this.obj.add(s);
    }
  }

  update(dt: number, w: World) {
    this.t += dt;
    const p = w.player;
    const st = w.run.stats();
    const dx = p.x - this.x, dy = p.y - this.y, d = Math.hypot(dx, dy);
    const mag = st.magnet + (this.what.item ? 0.5 : 0);
    if (this.t > 0.5 && d < mag * 1.6) {
      const k = (1 - d / (mag * 1.6)) * 24;
      this.vx += (dx / d) * k * dt; this.vy += (dy / d) * k * dt;
      this.settled = false;
    } else {
      const under = this.y < w.water.heightAt(this.x);
      this.vy += (under ? (this.what.coins ? -1.2 : -0.5) : -9.8) * dt;
    }
    this.vx *= Math.exp(-2 * dt); this.vy *= Math.exp(-2 * dt);
    this.x += this.vx * dt; this.y += this.vy * dt;
    const fl = w.terrain.floorAt(this.x) + 0.15;
    if (this.y < fl) { this.y = fl; this.vy = Math.abs(this.vy) * 0.3; if (!this.settled) { this.settled = true; w.fx.emit('dust', this.x, this.y, { n: 3, speed: 0.5 }); } }
    this.spin += dt * (3 + (d < 2 ? 6 : 0));
    const bob = Math.sin(this.t * 3) * 0.05;
    this.obj.position.set(this.x, this.y + bob, 0.1);
    this.obj.rotation.y = this.spin;
    this.obj.scale.setScalar(Math.min(1, this.t * 6));
    if (Math.random() < dt * (this.what.item ? 6 : 1.5)) w.fx.emit('spark', this.x + (Math.random() - 0.5) * 0.3, this.y + (Math.random() - 0.5) * 0.3, { n: 1, size: 0.12, life: 0.4, color: this.what.item ? '#bff6ff' : '#fff0a0' });
    if (this.t > 0.35 && d < 0.6 + this.r) this.collect(w);
    if (this.t > 60) this.alive = false;
  }

  private collect(w: World) {
    this.alive = false;
    const run = w.run;
    if (this.what.coins) {
      run.coins += this.what.coins;
      w.sfx('coin', this.x, 0.5, 1 + Math.random() * 0.2);
      w.text.pop(`+${this.what.coins}`, this.x, this.y + 0.3, 'gold', { size: 0.3, life: 0.8 });
    }
    if (this.what.item) {
      run.addItem(this.what.item);
      const name = PICKUP.itemName?.(this.what.item) ?? this.what.item;
      w.text.pop(name, this.x, this.y + 0.6, 'item', { size: 0.42, life: 2.2, vy: 0.5 });
      w.sfx('pickup_sparkle1', this.x, 0.8); w.sfx('jin_catch', this.x, 0.5);
      w.fx.burst('star', this.x, this.y, 8, 3);
      if (!(w.run as unknown as { tipBag?: boolean }).tipBag) { (w.run as unknown as { tipBag?: boolean }).tipBag = true; setTimeout(() => w.text.pop('TAB to stash it in your backpack', w.player.x, w.player.y + 1.4, 'hint', { size: 0.28, life: 3 }), 900); }
      w.emit('itemPicked', { id: this.what.item });
    }
    if (this.what.heal) {
      (w.player as unknown as { heal(n: number, w: World): void }).heal(this.what.heal, w);
    }
  }
}

/** hook kill drops: enemies that die drop coins via world.drop; nothing else needed here yet */
export function pickupHooks(w: World) { void w; void damp; }
