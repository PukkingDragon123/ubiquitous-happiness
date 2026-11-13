// BlobPuppet: the blobfish v2 without a game world, for cinematics, menus and the hideout. It owns a BlobModel
// and its own soft body (no terrain), so it still jiggles, squishes on landings and drags its cloth.
//
//   const p = new BlobPuppet({ weapon: 'sword', hat: 'helmet' });
//   scene.add(p.root);                      p.root is a plain group: place / rotate it anywhere in 3D
//   p.play('gearUp');  p.setGear(BUILD_GEAR.warrior);
//   p.walkTo(new THREE.Vector3(4, 0, -2));  waddles there (turning to face it), then idles
//   p.update(dt);                           every frame
//
// The puppet stands on its root's y = 0 (the floor); +x in root space is "forward" (heading 0). `onEvent`
// reports 'step' | 'land' | 'pop' (gear piece popped on during gearUp) | 'twirl' | 'jump' for sounds / particles.
import * as THREE from 'three';
import { BlobModel, type BlobAnim, type BlobEvent } from './blobModel';
import { SoftBody } from './softbody';
import { outlineAt, SB_N } from './blobShape';
import type { BlobGear } from './gear';
import { dampAngle } from '../core/math';

export class BlobPuppet {
  root = new THREE.Group();
  model: BlobModel;
  sb = new SoftBody(outlineAt, SB_N);
  time = 0;
  /** yaw of the puppet's forward (+x) around world y */
  heading = 0;
  /** in water the puppet hovers (swim); on land it sits on the floor */
  onLand = true;
  private walk: { to: THREE.Vector3; speed: number; done?: () => void } | null = null;
  private vel = new THREE.Vector2();
  onEvent?: (e: BlobEvent, slot?: string) => void;

  constructor(gear: BlobGear = {}, anim: BlobAnim = 'idle') {
    this.model = new BlobModel(gear);
    this.root.add(this.model.root);
    this.model.attach(this.root);
    this.model.weaponCtl = 'auto';
    this.model.root.position.y = 0.45;
    this.sb.place(0, 0);
    this.model.play(anim);
    this.model.onEvent = (e, slot) => {
      if (e === 'step') this.sb.poke(0, -1, 2.2);
      if (e === 'land') this.sb.poke(0, -1, 5);
      this.onEvent?.(e, slot);
    };
  }
  setGear(g: BlobGear) { this.model.setGear(g); }
  play(a: BlobAnim, restart = false) { this.model.play(a, restart); }
  setExpression(e: string) { this.model.setExpression(e); }
  /** waddle (on land) or swim (in water) to a point in the root's parent space */
  walkTo(to: THREE.Vector3, speed = 0.9, done?: () => void) { this.walk = { to: to.clone(), speed, done }; this.play(this.onLand ? 'waddle' : 'swim'); }
  stop() { this.walk = null; this.play('idle'); }

  update(dt: number) {
    this.time += dt;
    const m = this.model;
    if (this.walk) {
      const p = this.root.position, d = this.walk.to.clone().sub(p);
      d.y = this.onLand ? 0 : d.y;
      const dist = d.length();
      if (dist < 0.05) { const cb = this.walk.done; this.walk = null; this.play('idle'); cb?.(); }
      else {
        const want = Math.atan2(-d.z, d.x);
        this.heading = dampAngle(this.heading, want, 8, dt);
        const step = Math.min(dist, this.walk.speed * dt);
        p.addScaledVector(d.normalize(), step);
        this.vel.set(this.walk.speed, 0);
      }
    } else this.vel.multiplyScalar(Math.exp(-dt * 4));
    this.root.rotation.y = this.heading;
    // the soft body: keep it centred, let pokes ring out
    this.sb.accel(-this.sb.cx * 40 - this.sb.vx * 4, -this.sb.cy * 40 - this.sb.vy * 4, dt);
    this.sb.step(dt, null, null);
    m.root.position.set(0, this.onLand ? 0.45 : 0, 0);
    m.facingSign = 1;
    m.update(dt, { sb: this.sb, swim: this.walk ? 0.6 : 0.1, time: this.time, vel: this.vel });
  }
}
