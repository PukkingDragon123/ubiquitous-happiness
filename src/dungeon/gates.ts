// Arena gates and secret lids.
//
//   ArenaGate   bars of the area's kind that burst up out of the sand to seal one side of an encounter (and the
//               boss gate's jawed skull arch, which stays standing). raise() / drop(); `up` 0 (in the sand) .. 1 (shut)
//               drives the solid body in the terrain. Rising is fast and violent (sand spray, rumble); dropping
//               back is a grinding sink with silt puffs.
//   CrackedLid  the cracked rock slab over a secret pit: a puffer-bomb blast shatters it.
import * as THREE from 'three';
import type { World } from '../game/types';
import { arenaGateModel, crackedPlug, disposeModel, type GateKind, type GateModel } from './models';
import type { LevelTerrain, Body } from './terrain';
import { additiveMaterial } from '../world/mats';

const easeOut = (t: number) => 1 - (1 - t) * (1 - t);
const easeIn = (t: number) => t * t;

export class ArenaGate {
  up = 0;
  target = 0;
  group = new THREE.Group();
  model: GateModel;
  body: Body;
  private t = 0;
  private rumble = 0;
  constructor(public w: World, terrain: LevelTerrain, public x: number, public floorY: number, public topY: number, public area: string, public kind: GateKind, public sandColor: string) {
    const h = topY - floorY + 1.2;
    this.model = arenaGateModel(area, kind, h);
    this.model.root.position.set(x, floorY - 0.4, 0);
    this.group.add(this.model.root);
    this.body = terrain.addBody({ x0: x - 0.7, x1: x + 0.7, y0: floorY - 3, y1: topY + 3, r: 0.3, on: () => this.up > 0.45, tag: 'gate' });
    // a warning glow behind the bars while it's shut: the lock reads at a glance, even in a kelp forest
    const gh = topY - floorY;
    const geo = new THREE.PlaneGeometry(2.6, gh, 1, 4);
    const col = new Float32Array(geo.attributes.position.count * 3);
    for (let i = 0; i < geo.attributes.position.count; i++) { const v = 0.5 - (geo.attributes.position as THREE.BufferAttribute).getY(i) / gh; const k = Math.max(0, Math.min(1, v)) ** 1.5; col[i * 3] = k; col[i * 3 + 1] = k; col[i * 3 + 2] = k; }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.glow = new THREE.Mesh(geo, additiveMaterial(kind === 'boss' ? '#ff2a18' : kind === 'challenge' ? '#ff6a20' : '#ff9a50', { opacity: 0 }));
    this.glow.position.set(x, floorY + gh / 2, -0.2);
    this.glow.renderOrder = 11;
    this.group.add(this.glow);
    this.pose();
  }
  private glow: THREE.Mesh;
  get shut() { return this.up > 0.98; }
  raise(instant = false) {
    if (this.target === 1) return;
    this.target = 1;
    if (instant) { this.up = 1; this.pose(); return; }
    this.rumble = 0.5;
    this.w.sfx('rock_crumble1', this.x, 0.7, 0.8); this.w.sfx('uw_rumble1', this.x, 0.7); this.w.sfx('thud_heavy1', this.x, 0.6, 0.7);
    this.w.fx.debrisBurst(this.x, this.floorY + 0.2, 16, this.sandColor, 4.5, 0.07);
    this.w.fx.emit('silt', this.x, this.floorY + 0.3, { n: 14, spread: 0.9, speed: 1.2, life: 2, size: 0.5, size1: 1.4, color: new THREE.Color(this.sandColor), alpha: 0.55, drag: 2 });
    this.w.game.addShake(0.25);
  }
  drop(instant = false) {
    if (this.target === 0) return;
    this.target = 0;
    if (instant) { this.up = 0; this.pose(); return; }
    this.rumble = 0.8;
    this.w.sfx('chain1', this.x, 0.5, 0.8); this.w.sfx('uw_rumble1', this.x, 0.5); this.w.sfx('creak2', this.x, 0.35, 1.2);
  }
  update(dt: number) {
    this.t += dt;
    if (this.up !== this.target) {
      const k = this.target > this.up ? 2.6 : 0.9;
      this.up = this.target > this.up ? Math.min(1, this.up + dt * k) : Math.max(0, this.up - dt * k);
      if (Math.random() < dt * 18) this.w.fx.emit('dust', this.x + (Math.random() - 0.5) * 1.6, this.floorY + 0.2, { n: 1, spread: 0.3, speed: 0.8, life: 1.2, size: 0.07, color: this.sandColor, grav: -1.2 });
      if (this.target === 0 && Math.random() < dt * 8) this.w.fx.emit('bubble', this.x + (Math.random() - 0.5), this.floorY + Math.random() * 4, { n: 2, spread: 0.4, vy: 1 });
      if (this.target === 1 && this.up >= 1) { this.w.game.addShake(0.15); this.w.sfx('rock_hit1', this.x, 0.5, 0.6); }
    }
    if (this.rumble > 0) { this.rumble -= dt; this.w.game.addShake(0.025); }
    this.pose();
  }
  private pose() {
    const m = this.model, H = m.h + 0.6;
    m.cols.forEach((c, i) => {
      // columns come up one after another (and sink in reverse), with a shiver while moving
      const d = i * 0.1;
      const u = Math.min(1, Math.max(0, this.up * (1 + d * 2) - d));
      const e = this.target === 1 ? easeOut(u) : easeIn(u);
      c.position.y = -H * (1 - e);
      c.position.x = (u > 0.01 && u < 0.99 ? Math.sin(this.t * 50 + i * 2) * 0.03 : 0);
      c.visible = u > 0.002;
    });
    for (const g of m.glow) { const k = 0.7 + Math.sin(this.t * 3) * 0.3; (g.material as THREE.MeshBasicMaterial).color.setRGB(2.2 * k, 0.25 * k, 0.15 * k); }
    if (this.glow) { const gm = this.glow.material as THREE.MeshBasicMaterial; gm.opacity = Math.max(0, this.up - 0.3) * (0.75 + Math.sin(this.t * 4) * 0.2); this.glow.visible = gm.opacity > 0.01; }
  }
  dispose() { this.group.removeFromParent(); disposeModel(this.group); }
}

export class CrackedLid {
  group = new THREE.Group();
  open = false;
  body: Body;
  constructor(public w: World, terrain: LevelTerrain, public x0: number, public x1: number, public y0: number, public y1: number, public area: string, public silt: string, opened: boolean) {
    const plug = crackedPlug(area, x1 - x0, y1 - y0, 3.6);
    plug.position.set((x0 + x1) / 2, y0, 0);
    this.group.add(plug);
    this.body = terrain.addBody({ x0, x1, y0, y1, r: 0.15, on: () => !this.open, tag: 'lid' });
    if (opened) this.shatter(true);
  }
  /** a bomb at (x, y) within reach shatters it; true when it opened */
  blast(x: number, y: number, r: number): boolean {
    if (this.open) return false;
    const cx = Math.max(this.x0, Math.min(this.x1, x)), cy = Math.max(this.y0, Math.min(this.y1, y));
    if (Math.hypot(x - cx, y - cy) > r + 0.6) return false;
    this.shatter(false);
    return true;
  }
  private shatter(instant: boolean) {
    this.open = true;
    this.group.visible = false;
    if (instant) return;
    const cx = (this.x0 + this.x1) / 2, cy = (this.y0 + this.y1) / 2;
    const col = { reef: '#a89878', kelp: '#6a6658', graveyard: '#5a5a4e', arctic: '#8a9aaa', abyss: '#343a48' }[this.area] ?? '#7a7a70';
    for (let k = 0; k < 4; k++) this.w.fx.debrisBurst(this.x0 + (k + 0.5) * (this.x1 - this.x0) / 4, cy, 9, col, 4.5, 0.13);
    this.w.fx.emit('silt', cx, cy, { n: 18, spread: 2, speed: 1.2, life: 2.6, size: 0.7, size1: 1.8, color: new THREE.Color(this.silt), alpha: 0.6, drag: 2 });
    this.w.sfx('rock_crumble2', cx, 0.9); this.w.sfx('rock_crumble1', cx, 0.7, 0.8);
    this.w.game.addShake(0.35);
  }
  dispose() { this.group.removeFromParent(); disposeModel(this.group); }
}
