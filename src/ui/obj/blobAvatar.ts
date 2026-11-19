// The health avatar (v6: health is HP, and this little blobfish IS the health readout's face). A chibi of OUR
// blobfish (a real BlobModel, shrunk and squashed rounder) looking out of the HUD's brass porthole:
//   healthy  (> 60%)   plump and round, bouncing happily at full, smiling
//   bruised  (<= 60%)  a crossed plaster on the head, purple-yellow bruises on the cheek and the brow, a worried face,
//                      the odd bead of sweat
//   critical (<= 30%)  DEFLATING: it sags (the jowls droop), wheezes in and out, a puncture leaks a stream of tiny
//                      bubbles, sweat runs off it, it trembles and its skin flashes red with each heartbeat
//   dead               flopped over, flat, eyes shut, greyed
//   on a hit           a big squish (a squash spring + a soft-body jiggle), a wince
//   on a heal          a pink glow, a plump puff-up and a cheer
import * as THREE from 'three';
import { BlobModel } from '../../player/blobModel';
import { bodyPoint } from '../../player/blobShape';
import { retro } from '../../gfx/retro';

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

/** a bruise decal: a hand-placed blotch, a purple core in a violet ring fading to a sickly yellow-green edge */
let bruiseTex: THREE.CanvasTexture | null = null;
function bruiseMat() {
  if (!bruiseTex) {
    const rows = [
      '...yyyy...',
      '..yvvvvyy.',
      '.yvppppvy.',
      'yvpkkkpvvy',
      'yvpkkppvy.',
      '.yvpppvvy.',
      '..yvvvvy..',
      '...yyy....',
    ];
    const pal: Record<string, string> = { y: '#a8a058', v: '#8a5a8a', p: '#6a3a72', k: '#4a2456' };
    const cv = document.createElement('canvas'); cv.width = 10; cv.height = 8;
    const x = cv.getContext('2d')!;
    rows.forEach((r, yy) => { for (let i = 0; i < r.length; i++) { const c = pal[r[i]]; if (c) { x.fillStyle = c; x.fillRect(i, yy, 1, 1); } } });
    bruiseTex = new THREE.CanvasTexture(cv);
    bruiseTex.magFilter = THREE.NearestFilter; bruiseTex.minFilter = THREE.NearestFilter; bruiseTex.colorSpace = THREE.SRGBColorSpace;
  }
  return new THREE.MeshBasicMaterial({ map: bruiseTex, transparent: true, alphaTest: 0.5, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, depthWrite: false, toneMapped: false });
}

export type AvatarMood = 'healthy' | 'bruised' | 'critical' | 'dead';

export class BlobAvatar {
  root = new THREE.Group();
  private bob = new THREE.Group();
  private model: BlobModel | null = null;
  private jig = new Jiggle();
  private t = 0;
  private hurtT = 0; private healT = 0;
  private sq = 0; private sqV = 0;
  private puff = 0;
  private plaster = new THREE.Group();
  private bruises: THREE.Mesh[] = [];
  private drops: { m: THREE.Mesh; t: number; vx: number; vy: number }[] = [];
  private leaks: { m: THREE.Mesh; t: number }[] = [];
  private dropMat = new THREE.MeshStandardMaterial({ color: '#9ae8ff', roughness: 0.1, emissive: '#3a8ac8', emissiveIntensity: 0.4, transparent: true, opacity: 0.9 });
  private leakMat = new THREE.MeshBasicMaterial({ color: '#dff8ff', transparent: true, opacity: 0.85, toneMapped: false });
  private dropGeo = new THREE.SphereGeometry(0.07, 6, 4);
  private leakGeo = new THREE.IcosahedronGeometry(0.035, 0);
  private vel = new THREE.Vector2();
  /** the mood the HUD reads (for its own effects) */
  mood: AvatarMood = 'healthy';

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
      // the HUD renders at full canvas resolution: no PS1 vertex snapping to the world's low-res grid here
      m.root.traverse((o) => { const me = o as THREE.Mesh; if (!me.isMesh) return; for (const mt of Array.isArray(me.material) ? me.material : [me.material]) retro(mt, { snap: 0 }); });
      // bruises on the skin (body space, so they turn with it): the near cheek and the brow
      for (const [t, u, s, r] of [[0.7, 0.3, 0.17, 0.4], [0.86, 0.43, 0.13, -0.6], [0.5, 0.27, 0.12, 1.2]] as [number, number, number, number][]) {
        const p = new THREE.Vector3(...bodyPoint(t, u, 0.012)), n = new THREE.Vector3(...bodyPoint(t, u, 0.2)).sub(p).normalize();
        const b = new THREE.Mesh(new THREE.PlaneGeometry(s * 1.25, s), bruiseMat());
        b.position.copy(p); b.lookAt(p.clone().add(n)); b.rotateZ(r);
        b.visible = false; m.body.add(b); this.bruises.push(b);
      }
    } catch (e) {
      console.warn('[hud] blob avatar failed', e);
    }
    // the plaster: two crossed tan strips with gauze pads and stitched ends on the top of the head
    const tan = new THREE.MeshStandardMaterial({ color: '#f0c8a0', roughness: 0.8, flatShading: true });
    const pad = new THREE.MeshStandardMaterial({ color: '#fff4e8', roughness: 0.9, flatShading: true });
    const dots = new THREE.MeshStandardMaterial({ color: '#c89068', roughness: 0.9, flatShading: true });
    for (const r of [0.6, -0.6]) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.11, 0.04), tan);
      s.rotation.z = r; this.plaster.add(s);
      for (const e of [-0.15, 0.15]) { const d = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.07, 0.05), dots); d.position.set(Math.cos(r) * e, Math.sin(r) * e, 0); d.rotation.z = r; this.plaster.add(d); }
    }
    const gp = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.11, 0.05), pad); gp.rotation.z = Math.PI / 4; this.plaster.add(gp);
    this.plaster.position.set(0.18, 0.52, 0.28);
    this.plaster.rotation.set(-0.5, -0.4, 0);
    this.plaster.visible = false;
    this.bob.add(this.plaster);
  }

  /** a hit: a big squish and a jiggle (k: how hard, 0..1+) */
  hurt(k = 1) { this.hurtT = 0.6; this.sqV -= 7 + 5 * Math.min(1.5, k); this.jig.amp = Math.min(1.4, 0.7 + k * 0.5); }
  /** a heal: a pink glow, a puff-up and a cheer */
  heal() { this.healT = 1.1; this.sqV += 6; this.puff = 1; this.jig.amp = Math.max(this.jig.amp, 0.5); }

  /** frac: hp / maxHp (0..1); low: critical (the HUD's own threshold) */
  update(dt: number, frac: number, low: boolean) {
    this.t += dt;
    const m = this.model;
    this.hurtT = Math.max(0, this.hurtT - dt); this.healT = Math.max(0, this.healT - dt);
    this.puff = Math.max(0, this.puff - dt * 1.2);
    // squash spring
    this.sqV += (-this.sq * 160 - this.sqV * 11) * dt;
    this.sq += this.sqV * dt;
    this.jig.t = this.t; this.jig.amp = Math.max(0, this.jig.amp - dt * 1.6); this.jig.squash = Math.max(0, -this.sq);
    const dead = frac <= 0;
    const critical = !dead && (low || frac <= 0.3);
    const bruised = !dead && !critical && frac <= 0.6;
    this.mood = dead ? 'dead' : critical ? 'critical' : bruised ? 'bruised' : 'healthy';
    const full = frac >= 0.999;
    // the body language
    let y = 0, rz = 0;
    let sx = 1, sy = 1;
    if (dead) { y = -0.2; rz = 1.25; sx = 1.12; sy = 0.78; }
    else if (critical) {
      // deflating: a slow wheeze (sag out, a weak puff in), a nervous tremble
      const wheeze = 0.5 + 0.5 * Math.sin(this.t * 1.6);
      sx = 1.06 + wheeze * 0.04; sy = 0.86 - wheeze * 0.06;
      y = -0.06 + Math.sin(this.t * 40) * 0.015; rz = Math.sin(this.t * 31) * 0.035 + 0.08;
    } else if (bruised) { y = Math.sin(this.t * 2) * 0.03; rz = Math.sin(this.t * 1.1) * 0.05; sx = 1.02; sy = 0.98; }
    else {
      // plump and happy: rounder, hops when full
      sx = 1.05; sy = 1.04;
      if (full) { const h = Math.abs(Math.sin(this.t * 3.2)); y = h * 0.28; if (h < 0.08 && this.sqV > -1) this.sqV -= 1.2; }
      else y = Math.sin(this.t * 2) * 0.04;
    }
    // a heal puffs it up for a moment
    sx *= 1 + this.puff * 0.08; sy *= 1 + this.puff * 0.1;
    this.bob.position.set(0, y, 0);
    this.bob.rotation.z = rz;
    const s = Math.max(-0.45, Math.min(0.4, this.sq));
    this.bob.scale.set(sx * (1 - s * 0.6), sy * (1 + s), sx * (1 - s * 0.4));
    if (m) {
      m.setExpression(dead ? 'dead' : this.hurtT > 0 ? 'hurt' : this.healT > 0 ? 'cheer' : critical ? (Math.sin(this.t * 0.7) > 0.4 ? 'dizzy' : 'scared') : bruised ? (frac <= 0.45 ? 'sad' : 'brave') : full ? 'happy' : 'brave');
      m.bloat = dead ? 1.2 : critical ? 0.55 + 0.25 * (0.5 + 0.5 * Math.sin(this.t * 1.6)) : bruised ? 0.12 : 0;
      m.update(dt, { sb: this.jig, swim: 0.15, time: this.t, vel: this.vel });
      // the skin's light: pink on a heal, a red heartbeat when critical, grey when gone
      const beat = critical ? Math.max(0, Math.sin(this.t * 7.5)) ** 8 : 0;
      if (this.healT > 0) { m.U.uFlash.value = Math.min(1, this.healT * 1.4) * 0.55; m.U.uFlashCol.value.set('#ff9ac8'); }
      else if (beat > 0.02 && this.hurtT <= 0) { m.U.uFlash.value = beat * 0.6; m.U.uFlashCol.value.set('#ff2a3a'); }
      else if (dead) { m.U.uFlash.value = 0.25; m.U.uFlashCol.value.set('#3a4a5a'); }
    }
    this.plaster.visible = !dead && (bruised || critical);
    this.bruises.forEach((b, i) => { b.visible = !dead && (critical || (bruised && i < (frac <= 0.45 ? 2 : 1))); });
    // sweat: the odd bead when bruised, running off when critical
    if (!dead && Math.random() < dt * (critical ? 3.2 : bruised ? 0.35 : 0)) {
      const d = new THREE.Mesh(this.dropGeo, this.dropMat);
      d.scale.set(0.8, 1.2, 0.8);
      d.position.set(0.3 + Math.random() * 0.14, 0.5 - Math.random() * 0.1, 0.3); this.bob.add(d); this.drops.push({ m: d, t: 0, vx: 0.4 + Math.random() * 0.3, vy: 0.2 });
    }
    for (const d of this.drops) { d.t += dt; d.vy += dt * 1.8; d.m.position.x += dt * d.vx; d.m.position.y -= dt * d.vy; }
    for (const d of this.drops.filter((q) => q.t > 0.85)) d.m.removeFromParent();
    this.drops = this.drops.filter((q) => q.t <= 0.85);
    // the puncture leak: a thin stream of tiny bubbles from the flank while deflating
    if (critical && Math.random() < dt * 9) {
      const b = new THREE.Mesh(this.leakGeo, this.leakMat);
      b.position.set(-0.32, 0.12, 0.3); b.scale.setScalar(0.6 + Math.random() * 0.8);
      this.bob.add(b); this.leaks.push({ m: b, t: 0 });
    }
    for (const l of this.leaks) { l.t += dt; l.m.position.x -= dt * (0.25 - l.t * 0.1); l.m.position.y += dt * (0.25 + l.t * 0.9); l.m.position.x += Math.sin(l.t * 14) * dt * 0.2; }
    for (const l of this.leaks.filter((q) => q.t > 1.1)) l.m.removeFromParent();
    this.leaks = this.leaks.filter((q) => q.t <= 1.1);
  }
}
