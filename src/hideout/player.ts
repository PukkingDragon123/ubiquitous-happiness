// The hub's player control: the blobfish waddles round the hideout with WASD / arrows (relative to the camera),
// or walks itself along a path (click a spot or a station). Collision is a circle against the walkable floor
// (nooks.ts floorAt: the room, the loft up its steps, the map room), the fixed set pieces and every built piece's
// grid cells; it slides along whatever it bumps into and follows the floor height (the loft steps).
//
//   const p = new HubPlayer(hero, () => furn.occupancy().obj); each frame: p.update(dt, input, camYaw, enabled)
//   p.goTo(path, then?)   walk a waypoint path (Furniture.path), then call `then` (cancelled by any move key)
import * as THREE from 'three';
import type { Input } from '../core/input';
import type { HideoutHero } from './hero';
import { floorAt, fixedBlock } from './nooks';
import { GRID_W, GRID_D } from './blueprints';
import { damp, dampAngle } from '../core/math';

const R = 0.3, SPEED = 2.7;

export class HubPlayer {
  vel = new THREE.Vector2();
  /** 0..1 how fast it is moving (drives the waddle) */
  move = 0;
  private auto: { path: THREE.Vector3[]; i: number; then?: () => void; stuck: number } | null = null;
  private occ: Int32Array | null = null;
  constructor(public hero: HideoutHero, private occupancy: () => Int32Array) {}

  /** can the hero stand at (x, z)? returns the floor height, or null */
  standAt(x: number, z: number, r = R): number | null {
    const y = floorAt(x, z, r);
    if (y === null || fixedBlock(x, z, r)) return null;
    const occ = this.occ ?? this.occupancy();
    // every grid cell the circle overlaps must be free of furniture
    const cx0 = Math.floor(x - r + GRID_W / 2), cx1 = Math.floor(x + r + GRID_W / 2), cz0 = Math.floor(z - r + GRID_D / 2), cz1 = Math.floor(z + r + GRID_D / 2);
    for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) {
      if (cx < 0 || cz < 0 || cx >= GRID_W || cz >= GRID_D) continue;
      if (occ[cz * GRID_W + cx]) return null;
    }
    return y;
  }

  goTo(path: THREE.Vector3[], then?: () => void) { this.auto = { path, i: 1, then, stuck: 0 }; if (path.length < 2) { this.auto = null; then?.(); } }
  stop() { this.auto = null; }
  get walking() { return !!this.auto; }

  update(dt: number, input: Input | null, camYaw: number, enabled: boolean) {
    this.occ = this.occupancy();
    const r = this.hero.root;
    let wx = 0, wz = 0;
    if (enabled && input) {
      const f = (input.key('KeyW') || input.key('ArrowUp') ? 1 : 0) - (input.key('KeyS') || input.key('ArrowDown') ? 1 : 0);
      const s = (input.key('KeyD') || input.key('ArrowRight') ? 1 : 0) - (input.key('KeyA') || input.key('ArrowLeft') ? 1 : 0);
      if (f || s) {
        this.auto = null;
        // forward = away from the camera on the floor, right = the screen's right
        wx = -Math.sin(camYaw) * f + Math.cos(camYaw) * s;
        wz = -Math.cos(camYaw) * f - Math.sin(camYaw) * s;
        const l = Math.hypot(wx, wz); wx /= l; wz /= l;
      }
    }
    // auto-walk along a path
    if (this.auto && enabled) {
      const a = this.auto, tgt = a.path[a.i];
      const dx = tgt.x - r.position.x, dz = tgt.z - r.position.z, d = Math.hypot(dx, dz);
      if (d < 0.08) {
        a.i++;
        if (a.i >= a.path.length) { const cb = a.then; this.auto = null; cb?.(); }
      } else { wx = dx / d; wz = dz / d; if (d < 0.5) { wx *= Math.max(0.35, d / 0.5); wz *= Math.max(0.35, d / 0.5); } }
    }
    const tx = wx * SPEED, tz = wz * SPEED;
    this.vel.x = damp(this.vel.x, tx, 10, dt); this.vel.y = damp(this.vel.y, tz, 10, dt);
    const sp = this.vel.length();
    this.move = Math.min(1, sp / SPEED);
    if (sp > 0.02) {
      const p = r.position;
      const nx = p.x + this.vel.x * dt, nz = p.z + this.vel.y * dt;
      const before = p.clone();
      // move with sliding: both axes, else each one
      if (this.standAt(nx, nz) !== null) { p.x = nx; p.z = nz; }
      else if (this.standAt(nx, p.z) !== null) { p.x = nx; this.vel.y *= 0.5; }
      else if (this.standAt(p.x, nz) !== null) { p.z = nz; this.vel.x *= 0.5; }
      else this.vel.multiplyScalar(0.3);
      // stuck while walking a path (something got built in the way): give up after a moment
      if (this.auto) { if (before.distanceTo(p) < sp * dt * 0.2) { this.auto.stuck += dt; if (this.auto.stuck > 0.6) { const a = this.auto; this.auto = null; if (p.distanceTo(a.path[a.path.length - 1]) < 0.9) a.then?.(); } } else this.auto.stuck = 0; }
      // face the way it moves
      if (sp > 0.25) r.rotation.y = dampAngle(r.rotation.y, Math.atan2(-this.vel.y, this.vel.x), 12, dt);
    }
    const fy = floorAt(r.position.x, r.position.z, 0.05);
    if (fy !== null) r.position.y = damp(r.position.y, fy, 14, dt);
  }

  /** turn to face a world point */
  face(p: THREE.Vector3, dt: number, k = 8) {
    const r = this.hero.root;
    r.rotation.y = dampAngle(r.rotation.y, Math.atan2(-(p.z - r.position.z), p.x - r.position.x), k, dt);
  }
}
