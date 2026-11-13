// Dress a blobfish in a cosmetic look. The hat and sword go through gear.ts's look hooks (a forced setGear
// rebuild); the skin swaps the model's skin materials; the scarf is cloth built here (a skin-tight neck wrap or
// shoulder mantle that bends with the soft body, plus verlet ribbons in the model's attach space); the trail is a
// particle emitter the owner calls while the blobfish moves.
//
//   const rig = new CosmeticRig(model, space);  rig.apply();          the equipped look (or rig.preview = {...})
//   rig.update(vel, facing, time)                                     after model.update(): cloth + lure glow
//   rig.trail(fx, x, y, z, speed, dt)                                 spawn trail particles
//   new CosmeticPuppet()                                              a BlobPuppet that does all of this itself
import * as THREE from 'three';
import type { BlobModel } from '../player/blobModel';
import { BlobPuppet } from '../player/puppet';
import { patchBlob } from '../player/blobShape';
import { bodyPoint } from '../player/blobShape';
import { shellGeo, type BlobGear } from '../player/gear';
import { Ribbon, type RibbonOpts } from '../player/ribbon';
import { psxMat, mesh, facet, xf } from '../player/psx';
import { ctex, T, tone, rect, cloth, stitches } from '../skills/texkit';
import { hash2 } from '../core/math';
import type { Particles } from '../gfx/particles';
import { equippedLook, withLook, lookVersion, type Look } from './index';
import { applySkin } from './skins';

const SCARF_RED = ['#5a0a14', '#8e1420', '#c4222a', '#e83e34', '#ff7a5a'];
const SCARF = () => ctex('roninScarf', 32, 32, (p) => {
  cloth(p, 0, 0, 32, 32, SCARF_RED, 8, { ts: ['#2a0408', '#4a0810', '#7a1018', '#9a1c22', '#c02e2e'], bottom: 3 });
  // a woven stripe pair near the hem
  rect(p, 0, 24, 32, 1, tone(SCARF_RED, 4)); rect(p, 0, 26, 32, 1, tone(SCARF_RED, 1));
  for (let x = 1; x < 32; x += 3) p.set(x, 30, '#f0d0a0');
});
const CLOAK = () => ctex('tatteredCloak', 32, 32, (p) => {
  const C = ['#100e0c', '#1e1a16', '#2e2822', '#40382e', '#564c3e'];
  cloth(p, 0, 0, 32, 32, C, 7);
  // a stitched patch, holes and a ragged hem (alpha cut)
  rect(p, 18, 8, 8, 7, tone(T.olive, 1)); stitches(p, 18, 8, 25, 8, '#8a7a5a', '#0a0806'); stitches(p, 18, 14, 25, 14, '#8a7a5a', '#0a0806');
  for (const [x, y, r] of [[6, 14, 1.6], [12, 22, 1.2], [26, 20, 1.4]] as [number, number, number][]) p.ellipse(x, y, r, r * 1.3, '#000000', 0);
  for (let x = 0; x < 32; x++) { const L = 2 + Math.floor(hash2(x >> 1, 4, 3) * 6); for (let y = 32 - L; y < 32; y++) p.set(x, y, '#000000', 0); p.set(x, 31 - L, tone(C, 0)); }
});
const ROPE = () => ctex('cloakRope', 16, 16, (p) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const k = (x + y) % 6; p.set(x, y, tone(T.rope, k === 0 ? 0 : k < 3 ? 3 : 2)); } });

interface Rib { r: Ribbon; anchor: THREE.Object3D; k: number; axis: boolean }

export class CosmeticRig {
  /** try-on overrides (wardrobe previews), merged over the equipped look */
  preview: Partial<Look> = {};
  look: Look = equippedLook();
  private ver = -1;
  private scarf: THREE.Object3D[] = [];
  private ribs: Rib[] = [];
  private acc = 0;
  private tmp = new THREE.Vector3();
  constructor(public model: BlobModel, public space: THREE.Object3D) {}

  /** (re)dress the model in the equipped look + preview */
  apply() {
    this.ver = lookVersion;
    const look = this.look = { ...equippedLook(), ...this.preview } as Look;
    withLook(look, () => this.model.setGear(this.model.gear, true));
    applySkin(this.model, look.skin);
    this.buildScarf(look.scarf);
  }
  /** re-dress if the equipped look changed since the last apply */
  sync() { if (this.ver !== lookVersion) this.apply(); }
  setGear(g: BlobGear) { withLook(this.look, () => this.model.setGear(g)); }

  private clearScarf() {
    for (const o of this.scarf) o.removeFromParent();
    for (const r of this.ribs) r.r.mesh.removeFromParent();
    this.scarf = []; this.ribs = [];
  }
  private buildScarf(id: string) {
    this.clearScarf();
    const m = this.model;
    const patch = (mat: THREE.Material, bend: boolean) => patchBlob(mat, m.U, { bend, key: bend ? 'gearB' : 'gear' });
    const addBody = (o: THREE.Object3D) => { m.body.add(o); this.scarf.push(o); return o; };
    const rib = (mat: THREE.Material, o: RibbonOpts, anchor: THREE.Object3D, k: number, axis = false) => {
      const r = new Ribbon(patch(mat, false), o);
      this.space.add(r.mesh);
      this.ribs.push({ r, anchor, k, axis });
    };
    if (id === 'redScarf') {
      const mat = psxMat(SCARF(), { rough: 0.9, side: THREE.DoubleSide });
      // a thick wrap round the neck crease, bunched a little at the back
      addBody(mesh(shellGeo(0.55, 0.67, 0, 1, (t, u) => 0.04 + Math.sin(((t - 0.55) / 0.12) * Math.PI) * 0.025 + Math.max(0, Math.cos((u - 0.5) * Math.PI * 2)) * 0.012, undefined, { closed: true, uvScale: [5, 1] }), patch(mat, true)));
      const knot = addBody(mesh(facet(xf(new THREE.IcosahedronGeometry(0.06, 0), [0, 0, 0], [0, 0, 0], [1.1, 0.9, 1.3])), patch(psxMat(SCARF(), { rough: 0.9 }), false)));
      knot.position.set(...bodyPoint(0.58, 0.58, 0.06));
      for (const k of [0, 1]) rib(psxMat(SCARF(), { rough: 0.9, side: THREE.DoubleSide }), { n: 10, seg: 0.075, w0: 0.075, w1: 0.06, gravity: 0.0009, flutter: 0.0026, uv: [0, 0, 1, 1], thick: 0.01 }, knot, k);
    } else if (id === 'cloak') {
      const mat = psxMat(CLOAK(), { rough: 0.95, side: THREE.DoubleSide, alphaTest: 0.5 });
      // a hooded mantle over the shoulders, a rope clasp, and a long ragged cape streaming behind
      addBody(mesh(shellGeo(0.42, 0.66, 0.16, 0.84, (t, u) => 0.032 + Math.sin(((u - 0.16) / 0.68) * Math.PI) * 0.02 + (t < 0.5 ? (0.5 - t) * 0.25 : 0), undefined, { uvScale: [2, 1] }), patch(mat, true)));
      addBody(mesh(shellGeo(0.6, 0.665, 0, 1, () => 0.05, undefined, { closed: true, uvScale: [6, 1] }), patch(psxMat(ROPE(), { rough: 0.95 }), true)));
      const clasp = addBody(mesh(facet(xf(new THREE.IcosahedronGeometry(0.045, 0))), patch(psxMat(ROPE(), { rough: 0.95 }), false)));
      clasp.position.set(...bodyPoint(0.6, 0.5, 0.05));
      rib(psxMat(CLOAK(), { rough: 0.95, side: THREE.DoubleSide, alphaTest: 0.5 }), { n: 8, seg: 0.08, w0: 0.26, w1: 0.36, mode: 'axis', gravity: 0.0012, flutter: 0.0028, uv: [0, 0, 1, 1], thick: 0.006 }, clasp, 0, true);
    }
    for (const o of this.scarf) o.traverse((c) => { if ((c as THREE.Mesh).isMesh) c.castShadow = true; });
  }

  /** after model.update(): stream the cloth, pulse a glowing lure */
  update(vel: THREE.Vector2, facing: number, time: number) {
    const m = this.model;
    for (const rb of this.ribs) {
      rb.r.mesh.visible = m.root.visible;
      const a = rb.anchor.getWorldPosition(this.tmp);
      let back: THREE.Vector3 | undefined;
      if (rb.axis) {
        rb.r.axis.set(0, 0, 1).transformDirection(m.body.matrixWorld);
        back = new THREE.Vector3(-1, -0.25, 0).transformDirection(m.body.matrixWorld);
      }
      rb.r.update(a.clone().add(new THREE.Vector3(0, 0, rb.axis ? 0 : (rb.k - 0.5) * 0.05)), vel, facing, time, rb.k, back);
    }
    const lure = m.parts.hat?.root.getObjectByName('lureGlow') as THREE.Mesh | undefined;
    if (lure) (lure.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.8 + Math.sin(time * 3.1) * 0.5 + Math.sin(time * 11) * 0.15;
  }

  /** trail particles behind a moving blobfish (bubbles are the run's own wake unless `always`) */
  trail(fx: Particles, x: number, y: number, z: number, speed: number, dt: number, always = false, size = 1) {
    const kind = this.look.trail;
    if (speed < 1.0 || (kind === 'bubbles' && !always)) { this.acc = 0; return; }
    this.acc += dt * Math.min(18, 6 + speed * 2.5);
    while (this.acc >= 1) {
      this.acc -= 1;
      const jx = (Math.random() - 0.5) * 0.25, jy = (Math.random() - 0.5) * 0.25;
      if (kind === 'sparkles') fx.emit('sparkle', x + jx, y + jy, { z, life: 0.7, size: (0.16 + Math.random() * 0.1) * size, color: Math.random() < 0.5 ? '#fff6c0' : '#bff4ff', add: true, vy: 0.2 });
      else if (kind === 'ink') fx.emit('ink', x + jx, y + jy, { z, life: 1.6, size: 0.35 * size, size1: 0.9 * size, color: '#1e1428', alpha: 0.7, drag: 2, speed: 0.2 });
      else if (kind === 'hearts') fx.emit('heartP', x + jx, y + jy, { z, life: 1, size: 0.22 * size, vy: 0.6, drag: 0.8 });
      else if (kind === 'embers') fx.emit('ember', x + jx, y + jy, { z, life: 0.8, size: 0.09 * size, color: Math.random() < 0.5 ? '#ffb050' : '#ff6a2a', add: true, vy: 0.5, bright: 1.5 });
      else fx.emit('bubble', x + jx, y + jy, { z, life: 1.4, size: (0.08 + Math.random() * 0.06) * size, vy: 0.6 });
    }
  }
}

/**
 * A BlobPuppet that wears the equipped cosmetics (hideout hero, title screen, wardrobe). `current` is the water
 * flow its cloth streams in while it stands still.
 */
export class CosmeticPuppet extends BlobPuppet {
  rig: CosmeticRig;
  current = new THREE.Vector2(0, 0);
  constructor(gear: BlobGear = {}) {
    super(gear);
    this.rig = new CosmeticRig(this.model, this.root);
    this.rig.apply();
  }
  setGear(g: BlobGear) { this.rig.setGear(g); }
  update(dt: number, s?: { t?: number; move?: number }) {
    this.rig.sync();
    const v = (this as unknown as { vel: THREE.Vector2 }).vel;
    if (this.current.lengthSq() > 0 && (s?.move ?? 0) < 0.08) v.copy(this.current);
    super.update(dt, s);
    this.rig.update(v, 1, s?.t ?? this.time);
  }
}
