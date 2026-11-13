// The hideout's hero: a tiny interface so the cinematic and the room can drive any character model, plus the
// default adapter around the current blobfish (src/player/blobModel.ts). When the blobfish v2 lands, pass a new
// factory to HideoutScreen ({ hero: () => myHero }) — anything with a root Object3D works; play()/attach()/
// expression() are optional niceties.
//
// Conventions: the hideout places hero.root (position on the floor, rotation.y = facing). Local +x is the
// hero's forward, +y up, feet (lowest point) at y = 0.
import * as THREE from 'three';
import { BlobModel, buildSword, outlineAt, SB_N, surf } from '../player/blobModel';
import { SoftBody } from '../player/softbody';
import { BlobPuppet } from '../player/puppet';
import { damp } from '../core/math';

export type HeroAnim = 'idle' | 'walk' | 'sit' | 'hop' | 'gear' | 'cheer' | 'swim' | 'look';
export type HeroSlot = 'head' | 'back' | 'hand' | 'side' | 'belly';

export interface HideoutHero {
  /** placed by the hideout: position on the floor, rotation.y = facing (local +x forward) */
  root: THREE.Object3D;
  /** world-space parts to add to the scene alongside root (e.g. cloth tails) */
  extras?: THREE.Object3D[];
  /** rough height in metres (camera framing) */
  height: number;
  /** per frame; move = 0..1 walking speed, t = time */
  update(dt: number, s: { t: number; move: number }): void;
  play?(anim: HeroAnim): void;
  /** pop a gear object onto the hero (cinematic gear-up) */
  attach?(slot: HeroSlot, obj: THREE.Object3D): void;
  /** remove all attached gear */
  clearGear?(): void;
  expression?(name: string): void;
  /** where the hero is looking: a world point (null = straight ahead) */
  lookAt?(p: THREE.Vector3 | null): void;
  /** swap the worn gear set (BlobPuppet: BlobGear / BUILD_GEAR presets) */
  setGear?(g: unknown): void;
}
export type HeroFactory = () => HideoutHero;

/** the current blobfish model, waddling on land */
export class BlobHero implements HideoutHero {
  root = new THREE.Group();
  private pivot = new THREE.Group();   // waddle tilt / bob / squash
  private blob = new BlobModel();
  private sb = new SoftBody(outlineAt, SB_N);
  private anim: HeroAnim = 'idle';
  private phase = 0;
  private lean = 0; private squash = 1; private hopT = -1;
  private sword = buildSword();
  private gear: THREE.Object3D[] = [];
  private look: THREE.Vector3 | null = null;
  private sitK = 0; private swimK = 0;
  extras: THREE.Object3D[];
  height = 0.9;

  constructor() {
    this.root.add(this.pivot);
    this.pivot.add(this.blob.root);
    // body bottom sits on the floor
    this.blob.root.position.set(0, 0.46, 0);
    this.extras = this.blob.tailMeshes;
    this.sb.place(0, 0);
    this.sword.visible = false;
    this.sword.scale.setScalar(1.6);
    this.blob.finR.add(this.sword);
    this.sword.position.set(0.1, -0.02, 0.05);
    this.sword.rotation.set(0, 0, 1.2);
    this.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
  }

  play(a: HeroAnim) {
    if (a === 'hop' || (a === 'gear' && this.anim !== 'gear')) { this.hopT = 0; this.sb.poke(0, 3, 1); }
    if (a === 'cheer') { this.hopT = 0; this.blob.setExpression('happy'); }
    if (a === 'gear') this.blob.setExpression('happy');
    if (a === 'walk' || a === 'idle') this.blob.setExpression('brave');
    if (a === 'sit') this.blob.setExpression('happy');
    if (a === 'swim') this.blob.setExpression('brave');
    this.anim = a;
  }
  expression(n: string) { this.blob.setExpression(n); }
  lookAt(p: THREE.Vector3 | null) { this.look = p ? p.clone() : null; }

  attach(slot: HeroSlot, obj: THREE.Object3D) {
    if (slot === 'hand' && obj.userData.sword) { this.sword.visible = true; return; }
    const anchor = new THREE.Group();
    const p = slotPos(slot, 0.12);
    anchor.position.copy(p);
    if (slot === 'side') anchor.rotation.x = -0.9;
    if (slot === 'belly') anchor.rotation.x = 0.9;
    if (slot === 'back') anchor.rotation.z = 0.6;
    anchor.add(obj);
    this.blob.body.add(anchor);
    this.gear.push(anchor);
  }
  clearGear() { for (const g of this.gear) g.removeFromParent(); this.gear = []; this.sword.visible = false; }
  /** world position of a gear slot (for flying gear onto the hero) */
  slotWorld(slot: HeroSlot, out = new THREE.Vector3()) {
    const p = slot === 'hand' ? new THREE.Vector3(0.1, -0.1, 0.6) : slotPos(slot, 0.14);
    this.blob.body.updateWorldMatrix(true, false);
    return out.copy(p).applyMatrix4(this.blob.body.matrixWorld);
  }

  private tmpV = new THREE.Vector2();
  update(dt: number, s: { t: number; move: number }) {
    const t = s.t;
    // keep the soft body centred; it only jiggles
    this.sb.accel(-this.sb.cx * 30 - this.sb.vx * 6, -this.sb.cy * 30 - this.sb.vy * 6, dt);
    this.sb.step(dt, null, null);
    const walking = this.anim === 'walk' || s.move > 0.05;
    this.sitK = damp(this.sitK, this.anim === 'sit' ? 1 : 0, 6, dt);
    this.swimK = damp(this.swimK, this.anim === 'swim' ? 1 : 0, 4, dt);
    let bob = 0, roll = 0;
    if (walking && this.anim !== 'swim') {
      this.phase += dt * (8 + s.move * 4);
      const h = Math.abs(Math.sin(this.phase));
      bob = h * 0.09;
      roll = Math.sin(this.phase) * 0.14;
      if (h < 0.15 && Math.random() < 0.3) this.sb.poke(0, -1.5, 0.4);
      this.squash = damp(this.squash, 1 - (1 - h) * 0.08, 20, dt);
    } else {
      this.squash = damp(this.squash, 1 + Math.sin(t * 2.2) * 0.02, 6, dt);
      roll = damp(roll, 0, 5, dt);
    }
    if (this.hopT >= 0) {
      this.hopT += dt;
      const k = this.hopT / 0.45;
      bob += Math.max(0, Math.sin(Math.min(1, k) * Math.PI)) * 0.35;
      if (this.anim === 'gear') roll += Math.sin(this.hopT * 22) * 0.2 * Math.max(0, 1 - k);
      if (k > 1) { this.hopT = -1; this.sb.poke(0, -3, 1); }
    }
    this.lean = damp(this.lean, walking ? 0.12 : 0, 6, dt);
    // sit: slump back into the cushions; swim: body level, rising and gliding
    this.pivot.position.set(0, bob - this.sitK * 0.06 + this.swimK * (0.3 + Math.sin(t * 2) * 0.08), 0);
    this.pivot.rotation.set(roll * (1 - this.swimK), 0, -this.lean + this.sitK * 0.22 + this.swimK * Math.sin(t * 1.5) * 0.08);
    this.pivot.scale.set(1 / Math.sqrt(this.squash), this.squash, 1 / Math.sqrt(this.squash));
    // eyes look toward the look target (in body space)
    if (this.look) {
      const lp = this.blob.body.worldToLocal(this.look.clone());
      this.blob.look.set(Math.max(-1, Math.min(1, lp.z * 0.8)), Math.max(-1, Math.min(1, lp.y * 0.6)));
    } else this.blob.look.set(Math.sin(t * 0.4) * 0.3, 0.1);
    this.root.updateMatrixWorld(true);
    this.blob.update(dt, { sb: this.sb, swim: walking ? 0.6 : this.swimK > 0.5 ? 1 : 0.1, time: t, worldMatrix: this.blob.root.matrixWorld, vel: this.tmpV.set(walking ? 1 : 0, 0) });
  }
}

/** gear anchor points on the blobfish body (body space): +x nose, +z toward the camera side */
function slotPos(slot: HeroSlot, out: number): THREE.Vector3 {
  switch (slot) {
    case 'head': return surf(0.6, 0, out);
    case 'back': return surf(0.28, -0.35, out);
    case 'side': return surf(0.42, Math.PI * 0.5, out);
    case 'belly': return surf(0.4, -Math.PI * 0.5, out);
    default: return surf(0.5, 0.4, out);
  }
}

/** the default hero: the lead's BlobPuppet (owns the blobfish model; satisfies HideoutHero structurally) */
export const defaultHero: HeroFactory = () => new BlobPuppet() as unknown as HideoutHero;
/** the older self-contained adapter, kept for previews / fallback */
export const legacyHero: HeroFactory = () => new BlobHero();
