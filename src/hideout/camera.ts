// Camera rig for the hideout: a narrow-FOV (near-isometric) orbit camera with smoothed target / yaw / pitch /
// distance / fov, user orbit (right-drag, Q/E), pan (left-drag on empty floor, WASD, middle-drag), zoom (wheel),
// and scripted shots (dolly into the TV, cinematic follow) that blend from wherever the user left it.
import * as THREE from 'three';
import { damp, dampAngle, clamp } from '../core/math';
import type { Input } from '../core/input';

export interface Shot { target: THREE.Vector3; yaw: number; pitch: number; dist: number; fov: number; roll?: number }

export class CamRig {
  cam: THREE.PerspectiveCamera;
  /** the smoothed, current state */
  cur: Shot;
  /** where the user has the orbit camera */
  user: Shot;
  /** a scripted shot overriding the user camera (null = user) */
  shot: Shot | null = null;
  /** blend speed toward the goal */
  k = 4.5;
  bounds = { x: 4, z: 3.2 };
  private drag: { kind: 'orbit' | 'pan'; x: number; y: number; yaw: number; pitch: number; tx: number; tz: number; moved: number } | null = null;
  enabled = true;
  /** was the last left click part of a pan-drag (so it shouldn't count as a click) */
  dragged = false;

  constructor(cam: THREE.PerspectiveCamera) {
    this.cam = cam;
    this.user = { target: new THREE.Vector3(0, 0.7, 0.2), yaw: Math.PI / 4, pitch: 0.62, dist: 26, fov: 20 };
    this.cur = { ...this.user, target: this.user.target.clone() };
  }

  snap() { const g = this.shot ?? this.user; this.cur = { ...g, target: g.target.clone() }; this.apply(); }

  /** handle user orbit / pan / zoom input (call only when the UI doesn't own the mouse) */
  controls(input: Input, dt: number, o: { allowPan: boolean; overUI: boolean }) {
    if (!this.enabled || this.shot) { this.drag = null; return; }
    const m = input.mouse;
    const u = this.user;
    if (!o.overUI) {
      if (input.pressed.has('Mouse2') || input.pressed.has('Mouse1')) this.drag = { kind: input.pressed.has('Mouse2') ? 'orbit' : 'pan', x: m.x, y: m.y, yaw: u.yaw, pitch: u.pitch, tx: u.target.x, tz: u.target.z, moved: 0 };
      else if (o.allowPan && input.pressed.has('Mouse0')) this.drag = { kind: 'pan', x: m.x, y: m.y, yaw: u.yaw, pitch: u.pitch, tx: u.target.x, tz: u.target.z, moved: 0 };
      if (m.wheel) u.dist = clamp(u.dist * (1 + m.wheel * 0.12), 12, 40);
    }
    if (input.pressed.has('Mouse0')) this.dragged = false;
    if (this.drag) {
      const d = this.drag;
      const dx = m.x - d.x, dy = m.y - d.y;
      d.moved = Math.max(d.moved, Math.hypot(dx, dy));
      const held = d.kind === 'orbit' ? input.down.has('Mouse2') : input.down.has('Mouse0') || input.down.has('Mouse1');
      if (!held) { if (d.moved > 6) this.dragged = true; this.drag = null; }
      else if (d.kind === 'orbit') { u.yaw = d.yaw - dx * 0.008; u.pitch = clamp(d.pitch + dy * 0.004, 0.32, 1.05); }
      else if (d.moved > 6) {
        // pan in the ground plane, scaled to the view
        const k = (u.dist * Math.tan((u.fov * Math.PI) / 360) * 2) / Math.max(1, innerHeight);
        const sx = Math.cos(u.yaw), sz = -Math.sin(u.yaw);
        const fx = -Math.sin(u.yaw), fz = -Math.cos(u.yaw);
        u.target.x = d.tx - dx * k * sx + dy * k * fx / Math.sin(u.pitch + 0.3);
        u.target.z = d.tz - dx * k * sz + dy * k * fz / Math.sin(u.pitch + 0.3);
        this.dragged = true;
      }
    }
    // keys
    const kx = (input.key('KeyD') || input.key('ArrowRight') ? 1 : 0) - (input.key('KeyA') || input.key('ArrowLeft') ? 1 : 0);
    const kz = (input.key('KeyS') || input.key('ArrowDown') ? 1 : 0) - (input.key('KeyW') || input.key('ArrowUp') ? 1 : 0);
    if (kx || kz) {
      const sp = 7 * dt;
      u.target.x += (Math.cos(u.yaw) * kx + Math.sin(u.yaw) * kz) * sp;
      u.target.z += (-Math.sin(u.yaw) * kx + Math.cos(u.yaw) * kz) * sp;
    }
    if (input.keyHit('KeyQ')) u.yaw += Math.PI / 4;
    if (input.keyHit('KeyE')) u.yaw -= Math.PI / 4;
    if (input.key('Equal') || input.key('NumpadAdd')) u.dist = clamp(u.dist - 20 * dt, 16, 48);
    if (input.key('Minus') || input.key('NumpadSubtract')) u.dist = clamp(u.dist + 20 * dt, 16, 48);
    u.target.x = clamp(u.target.x, -this.bounds.x, this.bounds.x);
    u.target.z = clamp(u.target.z, -this.bounds.z, this.bounds.z);
  }

  update(dt: number) {
    const g = this.shot ?? this.user;
    const k = this.k;
    const c = this.cur;
    c.target.x = damp(c.target.x, g.target.x, k, dt); c.target.y = damp(c.target.y, g.target.y, k, dt); c.target.z = damp(c.target.z, g.target.z, k, dt);
    c.yaw = dampAngle(c.yaw, g.yaw, k, dt);
    c.pitch = damp(c.pitch, g.pitch, k, dt);
    c.dist = damp(c.dist, g.dist, k, dt);
    c.fov = damp(c.fov, g.fov, k, dt);
    c.roll = damp(c.roll ?? 0, g.roll ?? 0, k, dt);
    this.apply();
  }

  apply() {
    const c = this.cur, cam = this.cam;
    const cp = Math.cos(c.pitch);
    cam.position.set(c.target.x + Math.sin(c.yaw) * cp * c.dist, c.target.y + Math.sin(c.pitch) * c.dist, c.target.z + Math.cos(c.yaw) * cp * c.dist);
    cam.up.set(0, 1, 0);
    cam.lookAt(c.target);
    if (c.roll) cam.rotateZ(c.roll);
    if (Math.abs(cam.fov - c.fov) > 1e-3) { cam.fov = c.fov; cam.updateProjectionMatrix(); }
    cam.near = Math.max(0.05, c.dist * 0.05); cam.far = c.dist + 260;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }

  /** a shot that frames a world-space rectangle of height h (m) facing direction yaw, filling `fill` of the view */
  static frame(target: THREE.Vector3, yaw: number, h: number, fov: number, fill = 0.9, pitch = 0.02): Shot {
    const dist = (h / 2) / Math.tan((fov * Math.PI) / 360) / fill;
    return { target: target.clone(), yaw, pitch, dist, fov };
  }
}
