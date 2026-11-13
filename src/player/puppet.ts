// BlobPuppet: the blobfish v2 without a game world, for cinematics, menus and the hideout. It owns a BlobModel
// and its own soft body (no terrain), so it still jiggles, squishes on landings and drags its cloth.
//
//   const p = new BlobPuppet({ weapon: 'sword', hat: 'helmet' });
//   scene.add(p.root);                      p.root is a plain group: place / rotate it anywhere in 3D
//   p.play('gearUp');  p.setGear(BUILD_GEAR.warrior);
//   p.walkTo(new THREE.Vector3(4, 0, -2));  waddles there (turning to face it), then idles
//   p.update(dt);                           every frame
//
// The puppet stands on its root's y = 0 (the floor); +x in root space is "forward". It also satisfies the hideout's
// HideoutHero interface (src/hideout/hero.ts) structurally: height, extras, update(dt, { t, move }), play('walk' |
// 'hop' | 'gear' | 'sit' | 'look' | ...), attach(slot, obj), clearGear(), expression(), lookAt(). `onEvent` reports
// 'step' | 'land' | 'pop' (a gear piece popped on during gearUp) | 'twirl' | 'jump' for sounds / particles.
import * as THREE from 'three';
import { BlobModel, type BlobAnim, type BlobEvent } from './blobModel';
import { SoftBody } from './softbody';
import { outlineAt, SB_N, bodyPoint } from './blobShape';
import type { BlobGear } from './gear';
import { dampAngle } from '../core/math';

const ALIAS: Record<string, BlobAnim> = { walk: 'waddle', hop: 'cheer', gear: 'gearUp', sit: 'idle', look: 'idle', run: 'waddle' };
const SLOT_POS: Record<string, [number, number, number]> = { head: [0.8, 0.5, 0.03], back: [0.36, 0.5, 0.03], side: [0.5, 0.75, 0.03], belly: [0.55, 0.0, 0.03] };

export class BlobPuppet {
  root = new THREE.Group();
  model: BlobModel;
  sb = new SoftBody(outlineAt, SB_N);
  time = 0;
  /** rough height in metres (camera framing) */
  height = 0.95;
  /** world-space extras to add beside root: none, cloth and the weapon live under root */
  extras: THREE.Object3D[] = [];
  /** yaw of the puppet's forward (+x) around world y (applied while walkTo is running) */
  heading = 0;
  /** in water the puppet hovers (swim); on land it sits on the floor */
  onLand = true;
  private walk: { to: THREE.Vector3; speed: number; done?: () => void } | null = null;
  private vel = new THREE.Vector2();
  private attached: THREE.Object3D[] = [];
  private lookP: THREE.Vector3 | null = null;
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
  /** BlobAnim names, or the hideout's HeroAnim names (walk, hop, gear, sit, look) */
  play(a: BlobAnim | string, restart = false) { this.model.play(ALIAS[a] ?? (a as BlobAnim), restart); if (a === 'sit') this.model.setExpression('happy'); }
  setExpression(e: string) { this.model.setExpression(e); }
  expression(e: string) { this.model.setExpression(e); }
  /** look at a world point (null = straight ahead) */
  lookAt(p: THREE.Vector3 | null) { this.lookP = p ? p.clone() : null; }
  /** pin an extra object onto the body (hideout gear-up props): head | back | side | belly | hand */
  attach(slot: string, obj: THREE.Object3D) {
    if (slot === 'hand') this.model.weaponPivot.add(obj);
    else { const p = SLOT_POS[slot] ?? SLOT_POS.side; obj.position.set(...bodyPoint(p[0], p[1], p[2])); this.model.body.add(obj); }
    this.attached.push(obj);
  }
  clearGear() { for (const o of this.attached) o.removeFromParent(); this.attached = []; }
  /** waddle (on land) or swim (in water) to a point in the root's parent space */
  walkTo(to: THREE.Vector3, speed = 0.9, done?: () => void) { this.walk = { to: to.clone(), speed, done }; this.heading = this.root.rotation.y; this.play(this.onLand ? 'waddle' : 'swim'); }
  stop() { this.walk = null; this.play('idle'); }

  /** per frame; s.move (0..1) from an owner that moves root itself switches between idle and waddle */
  update(dt: number, s?: { t?: number; move?: number }) {
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
        this.root.rotation.y = this.heading;
        p.addScaledVector(d.normalize(), Math.min(dist, this.walk.speed * dt));
        this.vel.set(this.walk.speed, 0);
      }
    } else if (s?.move !== undefined) {
      if (s.move > 0.08 && (m.anim === 'idle' || m.anim === 'swim')) this.play(this.onLand ? 'waddle' : 'swim');
      else if (s.move <= 0.08 && m.anim === 'waddle') this.play('idle');
      this.vel.set(s.move, 0);
    } else this.vel.multiplyScalar(Math.exp(-dt * 4));
    if (this.lookP) {
      const lp = m.body.worldToLocal(this.lookP.clone());
      m.look.set(Math.max(-1, Math.min(1, lp.x * 0.6)), Math.max(-1, Math.min(1, lp.y * 0.6)));
    }
    // the soft body: keep it centred, let pokes ring out
    this.sb.accel(-this.sb.cx * 40 - this.sb.vx * 4, -this.sb.cy * 40 - this.sb.vy * 4, dt);
    this.sb.step(dt, null, null);
    m.root.position.set(0, this.onLand ? 0.45 : 0, 0);
    m.facingSign = 1;
    m.update(dt, { sb: this.sb, swim: this.walk || (s?.move ?? 0) > 0.08 ? 0.6 : 0.1, time: s?.t ?? this.time, vel: this.vel });
  }
}
