// The health avatar: a chibi of OUR blobfish (a real BlobModel, shrunk and squashed rounder) sitting in the
// HUD corner like a little desk toy. It is the face of your health:
//   full hp      bounces happily, smiling
//   hit          squishes flat, jiggles (a soft-body wobble), winces red
//   healed       glows pink-white and cheers
//   <= 40%       wears a crossed plaster on its head, looks worried
//   1 heart      sweats (drops roll off), scared face, a nervous tremble
//   dead         flops, eyes closed
import * as THREE from 'three';
import { BlobModel } from '../../player/blobModel';

const TAU = Math.PI * 2;

/** a fake soft body: the radial jiggle the HUD drives (BlobModel bends its mesh by these displacements) */
class Jiggle {
  amp = 0; t = 0; squash = 0;
  disp(a: number, out: { x: number; y: number }) {
    const w = Math.sin(this.t * 22 + a * 3) * this.amp * 0.06 + Math.sin(this.t * 13 - a * 2) * this.amp * 0.04;
    out.x = Math.cos(a) * w + Math.cos(a) * this.squash * 0.05;
    out.y = Math.sin(a) * w - Math.abs(Math.sin(a)) * this.squash * 0.08;
    return out;
  }
}

export class BlobAvatar {
  root = new THREE.Group();
  private bob = new THREE.Group();
  private model: BlobModel | null = null;
  private jig = new Jiggle();
  private t = 0;
  private hurtT = 0; private healT = 0;
  private sq = 0; private sqV = 0;
  private plaster = new THREE.Group();
  private drops: { m: THREE.Mesh; t: number }[] = [];
  private dropMat = new THREE.MeshStandardMaterial({ color: '#9ae8ff', roughness: 0.1, emissive: '#3a8ac8', emissiveIntensity: 0.4, transparent: true, opacity: 0.9 });
  private vel = new THREE.Vector2();
  private frac = 1;

  constructor() {
    this.root.add(this.bob);
    try {
      const m = new BlobModel({ weapon: 'toothpick', armor: 'none', hat: 'kasa', back: 'none' });
      m.weaponVisible = false;
      m.play('idle');
      // chibi: rounder, bigger head, viewed 3/4 from the front
      m.root.scale.set(0.92, 1.0, 1.0);
      m.root.rotation.y = -0.62;
      this.bob.add(m.root);
      this.model = m;
    } catch (e) {
      console.warn('[hud] blob avatar failed', e);
    }
    // the plaster: two crossed tan strips on the top of the head
    const tan = new THREE.MeshStandardMaterial({ color: '#f0c8a0', roughness: 0.8, flatShading: true });
    const dots = new THREE.MeshStandardMaterial({ color: '#c89068', roughness: 0.9, flatShading: true });
    for (const r of [0.6, -0.6]) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.11, 0.04), tan);
      s.rotation.z = r; this.plaster.add(s);
      const d = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.05), dots); d.rotation.z = r; this.plaster.add(d);
    }
    this.plaster.position.set(0.18, 0.52, 0.28);
    this.plaster.rotation.set(-0.5, -0.4, 0);
    this.plaster.visible = false;
    this.bob.add(this.plaster);
  }

  hurt() { this.hurtT = 0.6; this.sqV -= 9; this.jig.amp = 1; }
  heal() { this.healT = 0.9; this.sqV += 6; this.jig.amp = Math.max(this.jig.amp, 0.5); }

  /** frac: hp / maxHp (0..1); lowHeart: at one heart or less */
  update(dt: number, frac: number, lowHeart: boolean) {
    this.t += dt; this.frac = frac;
    const m = this.model;
    this.hurtT = Math.max(0, this.hurtT - dt); this.healT = Math.max(0, this.healT - dt);
    // squash spring
    this.sqV += (-this.sq * 160 - this.sqV * 11) * dt;
    this.sq += this.sqV * dt;
    this.jig.t = this.t; this.jig.amp = Math.max(0, this.jig.amp - dt * 1.6); this.jig.squash = Math.max(0, -this.sq);
    const dead = frac <= 0;
    const full = frac >= 0.999;
    // bounce: happy hops at full, a nervous tremble at one heart, a slow breath otherwise
    let y = 0, rz = 0;
    if (dead) { y = -0.15; rz = 1.2; }
    else if (full) { const h = Math.abs(Math.sin(this.t * 3.2)); y = h * 0.28; if (h < 0.08 && this.sqV > -1) this.sqV -= 1.2; }
    else if (lowHeart) { y = Math.sin(this.t * 40) * 0.02; rz = Math.sin(this.t * 31) * 0.04; }
    else y = Math.sin(this.t * 2) * 0.04;
    this.bob.position.set(0, y, 0);
    this.bob.rotation.z = rz;
    const s = Math.max(-0.45, Math.min(0.4, this.sq));
    this.bob.scale.set(1 - s * 0.6, 1 + s, 1 - s * 0.4);
    if (m) {
      m.setExpression(dead ? 'dead' : this.hurtT > 0 ? 'hurt' : this.healT > 0 ? 'cheer' : lowHeart ? 'scared' : frac <= 0.4 ? 'sad' : full ? 'happy' : 'brave');
      m.flash = this.healT > 0 ? Math.min(1, this.healT * 1.6) * 0.6 : 0;
      m.update(dt, { sb: this.jig, swim: 0.15, time: this.t, vel: this.vel });
    }
    this.plaster.visible = !dead && frac <= 0.4;
    // sweat drops at one heart
    if (lowHeart && !dead && Math.random() < dt * 2.2) {
      const d = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), this.dropMat);
      d.scale.set(0.8, 1.2, 0.8);
      d.position.set(0.32 + Math.random() * 0.1, 0.5, 0.3); this.bob.add(d); this.drops.push({ m: d, t: 0 });
    }
    for (const d of this.drops) { d.t += dt; d.m.position.x += dt * 0.5; d.m.position.y -= dt * (0.2 + d.t * 1.6); }
    for (const d of this.drops.filter((x) => x.t > 0.8)) { d.m.removeFromParent(); d.m.geometry.dispose(); }
    this.drops = this.drops.filter((x) => x.t <= 0.8);
    void TAU;
  }
}
