// Animated life in the hideout: SHELDON, the pet hermit crab (a red crab in a whelk shell) who potters about the
// floor, stops to pick at things, scuttles away from the blobfish and hides in his shell if it comes too close
// (pet him with E and he pops out with a happy click), plus a few tiny fish nosing round the hatch kelp.
//
//   const life = new Life(standAt); scene.add(life.group); life.update(dt, t, heroPos)
//   life.crabPos -> where he is (the screen offers PET when you're beside him); life.pet()
import * as THREE from 'three';
import { Kit } from './kit';
import { MAT } from './tex';
import { retro } from '../gfx/retro';
import { damp, dampAngle, hash2 } from '../core/math';
import { audio } from '../audio/audio';
import { DOOR, HALF_W } from './room';

export class Life {
  group = new THREE.Group();
  crab = new THREE.Group();
  private body = new THREE.Group();
  private shell = new THREE.Group();
  private legs: THREE.Object3D[] = [];
  private claws: THREE.Object3D[] = [];
  private target = new THREE.Vector3(1, 0, 1);
  private wait = 2;
  private hide = 0;
  private happy = 0;
  private fish: { m: THREE.Mesh; ph: number; r: number }[] = [];
  private t = 0;

  constructor(private standAt: (x: number, z: number, r?: number) => number | null) {
    // ---- the crab: a whelk shell (stacked lathed whorls), a red body peeking out, legs, two claws, eye stalks
    const sk = new Kit();
    const shellM = MAT.plain('#e8d8b8/0.7'), band = MAT.plain('#b86a3a/0.7');
    sk.lathe(shellM, [[0.001, 0], [0.13, 0.02], [0.15, 0.08], [0.12, 0.14], [0.001, 0.15]], 0, 0, 0, { seg: 8 });
    sk.lathe(band, [[0.001, 0.12], [0.1, 0.13], [0.09, 0.2], [0.001, 0.22]], 0.02, 0, 0, { seg: 7 });
    sk.lathe(shellM, [[0.001, 0.19], [0.06, 0.2], [0.04, 0.27], [0.001, 0.29]], 0.04, 0, 0, { seg: 6 });
    this.shell.add(sk.build());
    this.shell.rotation.z = 0.5; this.shell.position.set(-0.05, 0.06, 0);
    const red = MAT.plain('#c8402a/0.5'), dark = MAT.plain('#2a0a08/0.6');
    const bk = new Kit();
    bk.sphere(red, 0.07, 0, 0.05, 0, { w: 6, h: 4, sx: 1.2, sy: 0.8 });
    for (const s of [-1, 1]) { bk.box(red, 0.01, 0.06, 0.01, 0.06, 0.1, s * 0.025, { chamfer: 0 }); bk.sphere(dark, 0.014, 0.06, 0.135, s * 0.025, { w: 4, h: 3 }); }
    this.body.add(bk.build());
    for (const s of [-1, 1]) {
      const c = new THREE.Group(); c.position.set(0.08, 0.04, s * 0.05);
      const ck = new Kit(); ck.sphere(red, 0.035, 0.03, 0, 0, { w: 5, h: 4, sx: 1.4 }); ck.box(red, 0.04, 0.012, 0.02, 0.07, 0.012, 0, { chamfer: 0 }); ck.box(red, 0.04, 0.012, 0.02, 0.07, -0.012, 0, { chamfer: 0 });
      c.add(ck.build()); this.body.add(c); this.claws.push(c);
      for (let i = 0; i < 3; i++) {
        const l = new THREE.Group(); l.position.set(0.02 - i * 0.035, 0.04, s * 0.05);
        const lk = new Kit(); lk.box(red, 0.014, 0.014, 0.09, 0, -0.01, s * 0.04, { rx: s * 0.6, chamfer: 0 }); l.add(lk.build());
        this.body.add(l); this.legs.push(l);
      }
    }
    this.crab.add(this.shell, this.body);
    this.crab.position.set(1.2, 0, 1.6);
    this.crab.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
    this.group.add(this.crab);
    // ---- tiny silver fish round the hatch kelp
    const fg = new THREE.ConeGeometry(0.025, 0.09, 4); fg.rotateZ(-Math.PI / 2);
    const fm = retro(new THREE.MeshStandardMaterial({ color: '#c8e0f0', roughness: 0.3, metalness: 0.4, flatShading: true }));
    for (let i = 0; i < 5; i++) { const m = new THREE.Mesh(fg, fm); this.group.add(m); this.fish.push({ m, ph: i * 1.3, r: 0.25 + hash2(i, 1, 3) * 0.3 }); }
  }

  get crabPos() { return this.crab.position; }
  /** a pat on the shell: he pops out happy */
  pet() { this.hide = 0; this.happy = 1.4; this.wait = 2; audio.play('crab_click1', { vol: 0.45 }); audio.play('cute1', { vol: 0.3, rate: 1.4 }); }

  private pick() {
    for (let k = 0; k < 20; k++) {
      const x = (Math.random() - 0.5) * 9, z = (Math.random() - 0.5) * 7;
      if (this.standAt(x, z, 0.15) !== null) { this.target.set(x, 0, z); return; }
    }
  }

  update(dt: number, t: number, hero: THREE.Vector3) {
    this.t = t;
    const c = this.crab.position;
    const dh = Math.hypot(hero.x - c.x, hero.z - c.z);
    this.happy = Math.max(0, this.happy - dt);
    // too close: hide in the shell (unless just petted), then peek out once the coast is clear
    if (dh < 0.75 && this.happy <= 0) { if (this.hide < 0.5) audio.play('crab_snip1', { vol: 0.15, rate: 1.5 }); this.hide = Math.min(1, this.hide + dt * 6); }
    else this.hide = Math.max(0, this.hide - dt * (dh > 1.6 ? 1.2 : 0.3));
    let moving = false;
    if (this.hide < 0.2) {
      this.wait -= dt;
      if (this.wait <= 0) {
        const dx = this.target.x - c.x, dz = this.target.z - c.z, d = Math.hypot(dx, dz);
        if (d < 0.05) { this.wait = 1.5 + Math.random() * 4; this.pick(); }
        else {
          const sp = (dh < 1.6 ? 0.9 : 0.45) * dt;
          const nx = c.x + (dx / d) * Math.min(sp, d), nz = c.z + (dz / d) * Math.min(sp, d);
          if (this.standAt(nx, nz, 0.12) !== null) { c.x = nx; c.z = nz; moving = true; } else { this.pick(); }
          // crabs walk sideways: the body faces 90 degrees off its travel
          this.crab.rotation.y = dampAngle(this.crab.rotation.y, Math.atan2(-dz, dx) + Math.PI / 2, 6, dt);
          if (moving && Math.random() < dt * 3) audio.play('scuttle', { vol: 0.05, rate: 1.6 });
        }
      }
    }
    const fy = this.standAt(c.x, c.z, 0.05) ?? 0;
    c.y = damp(c.y, fy, 10, dt);
    // pose: body sinks into the shell when hiding; legs tick when walking; claws wave when happy
    this.body.scale.setScalar(1 - this.hide * 0.85);
    this.body.position.x = -this.hide * 0.05;
    this.legs.forEach((l, i) => { l.rotation.y = moving ? Math.sin(t * 22 + i * 1.7) * 0.4 : 0; });
    this.claws.forEach((cl, i) => { cl.rotation.z = this.happy > 0 ? Math.sin(t * 14 + i * 3) * 0.5 + 0.4 : Math.sin(t * 1.3 + i) * 0.08; });
    this.shell.rotation.x = Math.sin(t * 22) * (moving ? 0.04 : 0);
    // fish nosing round the kelp by the hatch
    this.fish.forEach((f, i) => {
      const a = t * (0.6 + i * 0.1) + f.ph;
      f.m.position.set(-HALF_W + 0.5 + Math.cos(a) * f.r * 0.6, 0.6 + i * 0.25 + Math.sin(t * 1.3 + i) * 0.08, DOOR.z + (i % 2 ? -1.2 : 1.2) + Math.sin(a) * f.r);
      f.m.rotation.y = -a - Math.PI / 2;
    });
  }
}
