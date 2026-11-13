// A limpet mine slapped onto the shipwreck by a frogman: a magnetic puck with a blinking timer. Slash it off
// (or bite it) before it blows a hole in the hull.
import * as THREE from 'three';
import type { Entity, World, Team } from '../game/types';
import type { Attacker } from './board';
import type { Target } from './types';
import { damageTarget } from './types';
import { explosion, sparks } from './fx';
import { segDist } from '../core/math';
import { kitMat } from '../humans/diveGear';
import { band, hh } from '../humans/fabric';
import { hurtPlayer } from './projectiles';

let geo: THREE.BufferGeometry | null = null;
export class LimpetMine implements Entity {
  kind = 'limpet'; team: Team = 'enemy';
  x: number; y: number; vx = 0; vy = 0; r = 0.3; alive = true;
  hp = 2;
  obj = new THREE.Group();
  private t = 0;
  private led: THREE.Mesh;
  private ox: number; private oy: number;
  constructor(x: number, y: number, public target: Target, public owner: Attacker | null, public dmg: number, public fuse = 7) {
    // stick to the hull surface nearest the drop point
    const dx = x - target.x, dy = y - target.y, l = Math.hypot(dx, dy) || 1;
    this.x = target.x + (dx / l) * Math.max(0.5, Math.min(l, target.r * 0.85));
    this.y = target.y + (dy / l) * Math.max(0.5, Math.min(l, target.r * 0.85));
    this.ox = this.x - target.x; this.oy = this.y - target.y;
    geo ??= new THREE.CylinderGeometry(0.22, 0.26, 0.12, 8);
    const m = new THREE.Mesh(geo, kitMat('limpet', 16, 16, (x, y) => band(y < 3 ? [200, 160, 30] : [40, 46, 40], 0.9, x, y), { rough: 0.5, metal: 0.5 }));
    m.rotation.x = Math.PI / 2; m.castShadow = true;
    this.led = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), new THREE.MeshBasicMaterial({ color: 0xff2010 }));
    this.led.position.z = 0.09;
    this.obj.add(m, this.led);
    this.obj.position.set(this.x, this.y, 0.3);
  }
  update(dt: number, w: World) {
    this.t += dt;
    this.x = this.target.x + this.ox; this.y = this.target.y + this.oy;
    this.obj.position.set(this.x, this.y, 0.3);
    const rate = this.t > this.fuse - 2 ? 0.12 : 0.5;
    const on = (this.t % rate) < rate * 0.5;
    this.led.visible = on;
    if (on && (this.t % rate) < 0.02) w.sfx('k_tick', this.x, 0.35, 1.5);
    if (this.t >= this.fuse) this.boom(w, true);
  }
  boom(w: World, onHull: boolean) {
    if (!this.alive) return;
    this.alive = false;
    explosion(w, this.x, this.y, 0.8);
    w.sfx('boom_uw', this.x, 0.8);
    w.game.addShake(0.2);
    w.emit('explosion', { x: this.x, y: this.y, r: 1.6 });
    if (onHull && this.target.alive) damageTarget(this.target, this.dmg, this.x, this.y, w, this.owner, 'explosion');
    const p = w.player, d = Math.hypot(p.x - this.x, p.y - this.y);
    if (p.alive && d < 1.6) hurtPlayer(w, 1, this.x, this.y, 'explosion', this.owner, 'limpet mine');
  }
  hit(_d: number, dx: number, dy: number, w: World): boolean { this.pry(w, dx, dy); return true; }
  slash(ax: number, ay: number, bx: number, by: number, _d: number, w: World): boolean {
    if (segDist(this.x, this.y, ax, ay, bx, by).d > this.r + 0.15) return false;
    this.pry(w, bx - ax, by - ay);
    return true;
  }
  private pry(w: World, dx: number, dy: number) {
    this.hp--;
    sparks(w, this.x, this.y, 8);
    w.sfx('sw_clang', this.x, 0.6);
    if (this.hp <= 0) {
      // knocked off the hull: it blows harmlessly a moment later out in the water
      w.text.pop('DEFUSED', this.x, this.y + 0.5, 'gold', { size: 0.32 });
      this.alive = false;
      w.fx.debrisBurst(this.x, this.y, 6, '#3a3e38', 3, 0.06);
      void dx; void dy;
    }
  }
}
