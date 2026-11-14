// The puffer-bomb: a grumpy pufferfish with a fuse. Dropped with [G]; it puffs up, flashes faster and faster and
// goes off after FUSE seconds: hurts everything near it (the blobfish too), digs the sand, and cracks secret walls
// (world.emit('explosion', { x, y, r, k, bomb: true }) — the run screen hands that to the doors).
import * as THREE from 'three';
import type { Entity, World, Team } from '../game/types';
import { bombModel, disposeModel } from './models';

export const FUSE = 1.7;
export const BLAST_R = 2.6;

export class PufferBomb implements Entity {
  kind = 'bomb'; team: Team = 'neutral';
  x: number; y: number; vx: number; vy: number; r = 0.3; alive = true;
  obj = new THREE.Group();
  private model = bombModel();
  private t = 0;
  private spark: THREE.Object3D | undefined;
  constructor(x: number, y: number, vx = 0, vy = 0) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.model.scale.setScalar(1.3);
    this.obj.add(this.model);
    this.spark = this.model.getObjectByName('spark');
  }
  update(dt: number, w: World) {
    this.t += dt;
    this.vy -= 2.2 * dt;
    this.vx *= Math.exp(-2 * dt); this.vy *= Math.exp(-1.2 * dt);
    this.x += this.vx * dt; this.y += this.vy * dt;
    const fl = w.terrain.floorAt(this.x) + 0.32;
    if (this.y < fl) { this.y = fl; this.vy = Math.abs(this.vy) * 0.2; this.vx *= 0.6; }
    const s = w.terrain.sdf(this.x, this.y);
    if (s < this.r) { const n = w.terrain.normal(this.x, this.y); this.x += n.x * (this.r - s); this.y += n.y * (this.r - s); }
    // puff up and flash red, faster and faster
    const k = this.t / FUSE;
    const blink = Math.sin(this.t * (8 + k * 40)) > 0.3;
    this.model.scale.setScalar(1.3 * (1 + k * k * 0.55) * (blink ? 1.04 : 1));
    if (this.spark) { this.spark.visible = Math.random() < 0.8; this.spark.scale.setScalar(0.8 + Math.random() * 0.8); }
    if (Math.random() < dt * 20) w.fx.emit('spark', this.x + 0.1, this.y + 0.45 * this.model.scale.y, { n: 1, spread: 0.05, speed: 1.2, life: 0.25, size: 0.06, color: '#ffcc55' });
    if (blink && Math.random() < dt * 6) w.fx.emit('glow', this.x, this.y, { n: 1, size: 0.9, life: 0.12, color: '#ff3a2a' });
    this.obj.position.set(this.x, this.y, 0.1);
    this.obj.rotation.z = Math.sin(this.t * 9) * 0.1 * k;
    if (this.t >= FUSE) this.boom(w);
  }
  private boom(w: World) {
    this.alive = false;
    const x = this.x, y = this.y;
    w.fx.emit('glow', x, y, { n: 3, size: 4.5, life: 0.35, color: '#ffd08a' });
    w.fx.emit('ring', x, y, { n: 1, size: 0.3, size1: BLAST_R * 2.2, life: 0.4, alpha: 0.9, add: true });
    w.fx.burst('spark', x, y, 30, 7, { color: '#ffb040', life: 0.5 });
    w.fx.burst('bubbleBig', x, y, 18, 4);
    w.fx.debrisBurst(x, y, 12, '#c8a070', 5, 0.08);
    w.sfx('boom_uw1', x, 1); w.sfx('boom', x, 0.5, 0.8);
    w.game.addShake(0.6); w.game.freeze(0.06); w.game.flash('#fff0d0', 0.25);
    for (const e of w.entities) {
      if (!e.alive || e === (this as Entity) || !e.hit) continue;
      if (e.team === 'neutral' && e.kind !== 'bomb') continue;
      const d = Math.hypot(e.x - x, e.y - y);
      if (d > BLAST_R + e.r) continue;
      const l = d || 1;
      e.hit(6 * (1 - Math.min(0.6, d / (BLAST_R + e.r))), (e.x - x) / l, (e.y - y) / l + 0.3, w, null, 'explosion');
    }
    const p = w.player, dp = Math.hypot(p.x - x, p.y - y);
    if (dp < BLAST_R * 0.8 && p.alive) { w.hurtPlayer(2, x, y, 'explosion'); p.push((p.x - x) / (dp || 1) * 8, (p.y - y) / (dp || 1) * 8 + 3); }
    w.emit('explosion', { x, y, r: BLAST_R, k: 1.2, bomb: true });
  }
  dispose() { disposeModel(this.model); }
}
