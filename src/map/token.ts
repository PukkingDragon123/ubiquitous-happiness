// The player's token on the map: a tiny squishy pink blobfish adventurer (droopy nose, worried frown, bead
// eyes, a red bandana and a toothpick sword), half-submerged next to the current node. It idles (bob,
// squish, blink), turns to look at the hovered node and surfs the current ribbon when travelling.
import * as THREE from 'three';
import { Loft, ring, usFor, V3 } from '../gfx/loft';
import { Px, ramp, pxNoise } from '../gfx/px';
import { clamp01, damp, dampAngle } from '../core/math';
import { blob, membrane, rod, gid, place } from './build';
import { A } from './tex';
import { dio } from './shaders';

function skinTex(): THREE.Texture {
  const p = new Px(64, 64);
  const r = ramp(['#a8506a', '#d47890', '#f0a2b4', '#ffc8d2', '#ffe4ea'], 7);
  p.fill((x, y) => {
    // u around the body (x), v along it (y): top of the body (u ~ 0 / 1) darker, belly (u ~ 0.5) lighter
    const u = x / 64, v = y / 64;
    const belly = Math.cos((u - 0.5) * Math.PI * 2) * -0.5 + 0.5;
    let t = 0.35 + (1 - belly) * 0.4 + (pxNoise(x, y, 6, 3, 4) - 0.5) * 0.18 - v * 0.08;
    const spot = pxNoise(x, y, 3, 2, 9);
    if (spot > 0.7 && belly < 0.6) t -= 0.18;
    return r(t, x, y);
  });
  return p.texture();
}

export class Token {
  root = new THREE.Group();
  body = new THREE.Group();
  private eyes: THREE.Object3D[] = [];
  private sword = new THREE.Group();
  private blinkT = 2;
  yaw = 0;
  targetYaw = 0;
  /** 0 idle, 1 surfing */
  surf = 0;
  private t = 0;

  constructor(atlasMat: THREE.MeshStandardMaterial) {
    const mat = dio(new THREE.MeshPhysicalMaterial({ map: skinTex(), roughness: 0.42, clearcoat: 0.7, clearcoatRoughness: 0.35, sheen: 0.6, sheenColor: new THREE.Color('#ffd6e2'), sheenRoughness: 0.5 }), { caustics: 0.6 });
    const reg = { x: 0, y: 0, w: 1, h: 1 };
    const L = new Loft();
    // body: a soft pear that sags toward the front
    const st: [number, number, number, number][] = [
      [-0.27, 0.025, 0.02, 0.02], [-0.2, 0.06, 0.05, 0.05], [-0.11, 0.1, 0.085, 0.095], [-0.02, 0.135, 0.11, 0.13],
      [0.06, 0.155, 0.125, 0.15], [0.13, 0.15, 0.12, 0.145], [0.19, 0.12, 0.1, 0.12], [0.23, 0.07, 0.07, 0.08],
    ];
    const rings = st.map(([x, up, dn, w], i) => ({ pts: ring([x, -0.01 * i * 0.5, 0], [0, 0, 1], [0, 1, 0], w, up, dn, 14, 2, (th) => Math.cos(th) < -0.6 ? 0.06 : 0), v: i / (st.length - 1) }));
    L.loft(rings, usFor(14), reg, gid(), { start: [-0.29, 0.0, 0], end: [0.25, -0.02, 0] });
    // the famous droopy nose + jowls
    blob(L, [0.23, -0.02, 0], 0.06, 0.075, 0.07, reg, 12, 0.12, 4);
    blob(L, [0.2, -0.09, 0], 0.05, 0.035, 0.09, reg, 10, 0.1, 7);
    const bm = new THREE.Mesh(L.build(), mat);
    bm.castShadow = true;
    this.body.add(bm);
    // frown (dark lip line under the nose)
    const lipL = new Loft();
    const lip: V3[] = [];
    for (let k = 0; k <= 8; k++) { const a = -1 + (k / 8) * 2; lip.push([0.205 - a * a * 0.03, -0.1 - (1 - a * a) * 0.012 + a * a * 0.02, a * 0.075]); }
    lipL.tube(lip, () => 0.007, 5, A.black, gid());
    const lipM = new THREE.Mesh(lipL.build(), atlasMat);
    this.body.add(lipM);
    // bead eyes with a glint (they blink by squashing)
    for (const s of [-1, 1]) {
      const e = new THREE.Group();
      const el = new Loft();
      blob(el, [0, 0, 0], 0.024, 0.026, 0.02, A.black, 8);
      blob(el, [0.014, 0.01, s * 0.006], 0.007, 0.007, 0.006, A.white, 5);
      const em = new THREE.Mesh(el.build(), new THREE.MeshStandardMaterial({ map: atlasMat.map, roughness: 0.15, metalness: 0.1 }));
      e.add(em);
      e.position.set(0.17, 0.085, s * 0.075);
      this.eyes.push(e);
      this.body.add(e);
      // brow wrinkle
      const bl = new Loft();
      rod(bl, [0.16, 0.125, s * 0.05], [0.19, 0.115, s * 0.1], 0.006, 0.005, 4, reg);
      this.body.add(new THREE.Mesh(bl.build(), mat));
    }
    // fins + tail
    const fl = new Loft();
    for (const s of [-1, 1]) membrane(fl, [0, 1].map((i) => [0, 1, 2].map((j): V3 => [0.03 - j * 0.05 - i * 0.03, -0.04 - j * 0.03, s * (0.14 + j * 0.06)])), reg);
    membrane(fl, [0, 1].map((i) => [0, 1, 2].map((j): V3 => [-0.27 - j * 0.07, (i - 0.5) * (0.04 + j * 0.05), 0])), reg);
    const fm = new THREE.Mesh(fl.build(), new THREE.MeshPhysicalMaterial({ map: (mat as THREE.MeshPhysicalMaterial).map, side: THREE.DoubleSide, roughness: 0.4, transmission: 0, color: '#ffb8c8' }));
    this.body.add(fm);
    // red bandana with knot tails
    const bd = new Loft();
    const band: V3[] = [];
    for (let k = 0; k <= 16; k++) { const a = (k / 16) * Math.PI * 2; band.push([0.07 + Math.cos(a) * 0.012, 0.035 + Math.cos(a) * 0.125 + 0.0, Math.sin(a) * 0.152]); }
    bd.tube(band, () => 0.018, 6, A.redPaint, gid());
    membrane(bd, [0, 1].map((i) => [0, 1, 2].map((j): V3 => [0.06 - j * 0.06, 0.16 - j * 0.035 - i * 0.03, -0.05 + i * 0.03 - j * 0.02])), A.redPaint);
    const bdm = new THREE.Mesh(bd.build(), dio(new THREE.MeshStandardMaterial({ map: atlasMat.map, roughness: 0.7, side: THREE.DoubleSide })));
    bdm.castShadow = true;
    this.body.add(bdm);
    // toothpick sword held at the side
    const sw = new Loft();
    rod(sw, [0, 0, 0], [0.34, 0, 0], 0.008, 0.0012, 6, A.cork, false);
    rod(sw, [0, 0, 0], [-0.03, 0, 0], 0.008, 0.008, 5, A.cork);
    rod(sw, [0.0, 0, -0.03], [0.0, 0, 0.03], 0.006, 0.006, 4, A.gold);
    const swm = new THREE.Mesh(sw.build(), dio(new THREE.MeshStandardMaterial({ map: atlasMat.map, roughness: 0.6 })));
    swm.castShadow = true;
    this.sword.add(swm);
    this.sword.position.set(0.02, -0.02, 0.19);
    this.sword.rotation.set(0.2, -0.5, 0.55);
    this.body.add(this.sword);
    this.body.scale.setScalar(1.6);
    this.root.add(this.body);
    void place; void clamp01;
  }

  update(dt: number, moving: boolean, speed = 0) {
    this.t += dt;
    const t = this.t;
    this.surf = damp(this.surf, moving ? 1 : 0, 6, dt);
    this.yaw = dampAngle(this.yaw, this.targetYaw, moving ? 9 : 4, dt);
    this.root.rotation.y = this.yaw;
    const sq = Math.sin(t * 3.1) * 0.045 * (1 - this.surf) + Math.sin(t * 14) * 0.03 * this.surf;
    this.body.scale.set(1.6 * (1 + sq * 0.6), 1.6 * (1 - sq), 1.6 * (1 + sq * 0.4));
    const hop = this.surf * Math.abs(Math.sin(t * 7.5)) * 0.07 * Math.min(1, speed);
    this.body.position.y = -0.04 + Math.sin(t * 2.2) * 0.018 * (1 - this.surf) + hop + this.surf * 0.03;
    this.body.rotation.z = -this.surf * 0.12 + Math.sin(t * 1.7) * 0.04;
    this.body.rotation.x = Math.sin(t * 1.3) * 0.05 + this.surf * Math.sin(t * 9) * 0.06;
    // the sword wiggles; held up high while surfing like a tiny cavalry charge
    this.sword.rotation.z = 0.55 + Math.sin(t * 2.4) * 0.12 * (1 - this.surf) + this.surf * 0.5;
    this.sword.rotation.y = -0.5 + this.surf * 0.25;
    // blink
    this.blinkT -= dt;
    let ey = 1;
    if (this.blinkT < 0.12) ey = Math.abs(this.blinkT - 0.06) / 0.06;
    if (this.blinkT < 0) this.blinkT = 1.8 + Math.random() * 3;
    for (const e of this.eyes) e.scale.set(1, Math.max(0.1, ey), 1);
  }
}
