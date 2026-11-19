// The home's player control: click the floor (or a thing) and the blobfish walks there along an A* path; WASD /
// arrows still steer it directly (relative to the camera). Collision is a circle against the house's walk grid
// (walls, built pieces, the goal board, Mr. Crab); it slides along whatever it bumps into. A path that gets stuck
// (something moved into the way) gives up after a moment, and still calls `then` if the goal is close.
//
//   const p = new HubPlayer(hero, (x, z, r) => house.walkable(x, z, r)); each frame: p.update(dt, input, camYaw, enabled)
//   p.goTo(path, then?)   walk a waypoint path, then call `then` (any move key cancels it)
import * as THREE from 'three';
import type { Input } from '../core/input';
import type { HideoutHero } from './hero';
import { damp, dampAngle } from '../core/math';

const SPEED = 2.9;

export class HubPlayer {
  vel = new THREE.Vector2();
  /** 0..1 how fast it is moving (drives the waddle) */
  move = 0;
  private auto: { path: THREE.Vector3[]; i: number; then?: () => void; stuck: number; t: number; escape: boolean } | null = null;
  constructor(public hero: HideoutHero, private walkable: (x: number, z: number, r?: number) => boolean) {}
  /** how deep into something a point is (0 = clear): moving out of a spot that is boxed in may only go shallower */
  private blocked(x: number, z: number) { return (this.walkable(x, z) ? 0 : 1) + (this.walkable(x, z, 0.13) ? 0 : 1) + (this.walkable(x, z, 0.01) ? 0 : 1); }

  goTo(path: THREE.Vector3[] & { escape?: boolean }, then?: () => void) {
    if (path.length < 2) { this.auto = null; then?.(); return; }
    this.auto = { path, i: 1, then, stuck: 0, t: 0, escape: !!path.escape };
  }
  stop() { this.auto = null; }
  get walking() { return !!this.auto; }
  get target(): THREE.Vector3 | null { return this.auto ? this.auto.path[this.auto.path.length - 1] : null; }

  update(dt: number, input: Input | null, camYaw: number, enabled: boolean) {
    const r = this.hero.root;
    let wx = 0, wz = 0;
    if (enabled && input) {
      const f = (input.key('KeyW') || input.key('ArrowUp') ? 1 : 0) - (input.key('KeyS') || input.key('ArrowDown') ? 1 : 0);
      const s = (input.key('KeyD') || input.key('ArrowRight') ? 1 : 0) - (input.key('KeyA') || input.key('ArrowLeft') ? 1 : 0);
      if (f || s) {
        this.auto = null;
        wx = -Math.sin(camYaw) * f + Math.cos(camYaw) * s;
        wz = -Math.cos(camYaw) * f - Math.sin(camYaw) * s;
        const l = Math.hypot(wx, wz); wx /= l; wz /= l;
      }
    }
    if (this.auto && enabled) {
      const a = this.auto, tgt = a.path[a.i];
      a.t += dt;
      const dx = tgt.x - r.position.x, dz = tgt.z - r.position.z, d = Math.hypot(dx, dz);
      if (d < 0.1) {
        a.i++;
        if (a.i >= a.path.length) { const cb = a.then; this.auto = null; this.vel.multiplyScalar(0.3); cb?.(); }
      } else { wx = dx / d; wz = dz / d; if (d < 0.45 && a.i === a.path.length - 1) { wx *= Math.max(0.35, d / 0.45); wz *= Math.max(0.35, d / 0.45); } }
      // a walk that takes far too long is abandoned (never leave the player waiting)
      if (this.auto && a.t > 12) { const cb = a.then, end = a.path[a.path.length - 1]; this.auto = null; if (r.position.distanceTo(end) < 1.2) cb?.(); }
    }
    this.vel.x = damp(this.vel.x, wx * SPEED, 10, dt); this.vel.y = damp(this.vel.y, wz * SPEED, 10, dt);
    const sp = this.vel.length();
    this.move = Math.min(1, sp / SPEED);
    if (sp > 0.02) {
      const p = r.position, before = p.clone();
      const nx = p.x + this.vel.x * dt, nz = p.z + this.vel.y * dt;
      // stepping out of a boxed-in spot (an escape path's first leg, or standing where something now is): no collision
      const stuckIn = !this.walkable(p.x, p.z) && this.blocked(nx, nz) <= this.blocked(p.x, p.z);
      if ((this.auto?.escape && this.auto.i === 1) || stuckIn || this.walkable(nx, nz)) { p.x = nx; p.z = nz; }
      else if (this.walkable(nx, p.z)) { p.x = nx; this.vel.y *= 0.5; }
      else if (this.walkable(p.x, nz)) { p.z = nz; this.vel.x *= 0.5; }
      else this.vel.multiplyScalar(0.3);
      if (this.auto) {
        if (before.distanceTo(p) < sp * dt * 0.2) { this.auto.stuck += dt; if (this.auto.stuck > 0.6) { const a = this.auto; this.auto = null; if (p.distanceTo(a.path[a.path.length - 1]) < 1.2) a.then?.(); } }
        else this.auto.stuck = 0;
      }
      if (sp > 0.25) r.rotation.y = dampAngle(r.rotation.y, Math.atan2(-this.vel.y, this.vel.x), 12, dt);
    }
    r.position.y = damp(r.position.y, 0, 14, dt);
  }

  /** turn to face a world point */
  face(p: THREE.Vector3, dt: number, k = 8) {
    const r = this.hero.root;
    r.rotation.y = dampAngle(r.rotation.y, Math.atan2(-(p.z - r.position.z), p.x - r.position.x), k, dt);
  }
}
