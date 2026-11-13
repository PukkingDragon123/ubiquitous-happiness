// Fixed fishing spots: a wooden pier on pilings driven into the seabed (~-9 m), and an ice shelf with a
// fishing hole. Above the water: weathered planks with nail heads, bollards, a lamp post with a lantern,
// crates, a tackle box, a coiled rope and tyre fenders. Below: the pilings darken in the tide zone, then grow
// algae, barnacles and mussels; cross braces and the ladder go down too, all lit through uw().
import * as THREE from 'three';
import type { V3 } from '../gfx/loft';
import { Loft, usFor } from '../gfx/loft';
import type { RGB } from '../gfx/px';
import type { WaterFX } from '../gfx/water/water';
import { Rng } from '../core/rng';
import { hex } from '../gfx/px';
import { uw } from '../gfx/shaders/underwater';
import { Atlas, planks, growth, ropeCol, rubber, torus, cyl, bucket, lampMat, spotMat, band, nz, hh, wood, metal, mix, shade } from './props';
import type { Vessel, Collider } from './boats';
import { ellRing } from './rig';
import { fur } from './fabric';

const C = (h: string): RGB => hex(h);

class Spot implements Vessel {
  kind: string; group = new THREE.Group(); seats: THREE.Object3D[] = [];
  x = 0; vx = 0; length: number;
  colliders: Collider[] = [];
  private out: Collider[] = [];
  lamps: THREE.Mesh[] = [];
  private t = 0;
  constructor(kind: string, L: number) { this.kind = kind; this.length = L; this.group.name = 'spot:' + kind; }
  setX(x: number) { this.x = x; this.group.position.x = x; }
  drift(vx: number) { this.vx = vx; }
  update(dt: number, water: WaterFX) {
    this.t += dt;
    if (this.vx) { this.x += this.vx * dt; this.group.position.x = this.x; }
    for (const l of this.lamps) (l.material as THREE.MeshStandardMaterial).emissiveIntensity = 2 + Math.sin(this.t * 7) * 0.15 + Math.sin(this.t * 23) * 0.1;
    void water;
  }
  underwaterColliders(): Collider[] {
    this.out.length = 0;
    for (const c of this.colliders) this.out.push({ x: c.x + this.group.position.x, y: c.y + this.group.position.y, r: c.r });
    return this.out;
  }
  seat(x: number, y: number, z: number, seating: 'stand' | 'sit' | 'kayak', facing: number) {
    const o = new THREE.Object3D(); o.position.set(x, y, z); o.userData = { seating, facing };
    this.group.add(o); this.seats.push(o); return o;
  }
}

/** a round timber piling from top to the seabed, its texture banded by height (v = 0 at the bottom) */
function piling(B: Loft, x: number, z: number, top: number, bot: number, r: number, reg: { x: number; y: number; w: number; h: number }, g: number, lean = 0) {
  const n = 12, rows = 16;
  const rings = Array.from({ length: rows + 1 }, (_, i) => {
    const t = i / rows, y = bot + (top - bot) * t;
    const rr = r * (1 + Math.sin(i * 1.7 + x) * 0.03) * (t < 0.03 ? 1.08 : 1);
    return { pts: ellRing(y, x + (1 - t) * lean, z, rr, rr, rr, n, 2, 1, (th) => Math.sin(th * 3 + i) * 0.02), v: t };
  });
  B.loft(rings, usFor(n), reg, g, { end: [x, top + 0.02, z] });
}

export function makeDock(seed: number): Vessel {
  const r = new Rng((seed * 7919 + 17) >>> 0);
  const L = 8, deckY = 1.15, bot = -9.4, front = 0.0, back = -1.9;
  const s = new Spot('dock', L);
  const A = new Atlas(1024, 1024);
  const pileR = A.alloc(64, 1024), deckR = A.alloc(512, 256), beamR = A.alloc(256, 64), braceR = A.alloc(256, 64), ropeR = A.alloc(64, 32), metR = A.alloc(64, 64), crateR = A.alloc(128, 128), boxR = A.alloc(128, 64), lampR = A.alloc(64, 64), tyreR = A.alloc(64, 64), bucketR = A.alloc(64, 64), signR = A.alloc(128, 64);
  const woodC = C(r.pick(['#8a6a48', '#7a6248', '#94744e']));
  const pileTop = deckY + 0.25;
  // pilings: dry grey timber, a dark wet band in the splash zone, green slime, then barnacles and mussels
  A.paint(pileR, (u, v, x, y) => {
    const wy = bot + (pileTop - bot) * v;
    let c = wood(mix(woodC, [120, 116, 108], 0.45), y * 0.15 + x * 3, x * 0.4, 1, 31, 0.6);
    if (wy < 0.5) c = shade(c, 0.6 + Math.max(0, wy) * 0.6);
    if (wy < 0.2 && wy > -0.3) c = mix(c, band([60, 92, 40], 0.9 + nz(x, y, 4, 3) * 0.3, x, y), 0.7 * clamp01(1 - Math.abs(wy + 0.05) / 0.3));
    if (wy < 0) c = growth(shade(c, 0.85), -wy, x, y * 3, 5);
    if (wy < bot + 0.8) c = mix(c, [70, 60, 46], clamp01((bot + 0.8 - wy) / 0.8) * 0.7);
    return c;
  });
  A.paint(deckR, (u, v, x, y) => planks(woodC, u, v, x, y, 12, null, 0));
  A.paint(beamR, (u, v, x, y) => wood(shade(woodC, 0.8), x, y * 2, 1, 32));
  A.paint(braceR, (u, v, x, y) => growth(wood(shade(woodC, 0.7), x, y * 2, 1, 33), 2 + v, x, y, 7));
  A.paint(ropeR, (u, v, x, y) => ropeCol(x, y));
  A.paint(metR, (u, v, x, y) => metal([70, 72, 76], x, y, 0.8 + v * 0.3 + (nz(x, y, 4, 2) > 0.65 ? -0.3 : 0)));
  A.paint(crateR, (u, v, x, y) => {
    let c = planks(C('#b0905e'), u, v, x, y, 4, null, 0);
    if (Math.abs(u - v) < 0.05 || u < 0.05 || u > 0.95) c = wood(C('#8a6a44'), x, y, 1, 4);
    return c;
  });
  const tb = C(r.pick(['#2a6a3a', '#3a5a9a', '#9a2a2a']));
  A.paint(boxR, (u, v, x, y) => (Math.abs(v - 0.6) < 0.05 ? metal([200, 200, 200], x, y) : band(tb, 0.9 + (hh(x, y, 5) - 0.5) * 0.08 + (u > 0.45 && u < 0.55 && v > 0.5 ? 0.25 : 0), x, y)));
  A.paint(lampR, (u, v, x, y) => metal([46, 50, 46], x, y, 0.8 + Math.sin(u * Math.PI) * 0.3));
  A.paint(tyreR, (u, v, x, y) => rubber(x, y, 0.9 + Math.sin(v * Math.PI) * 0.2));
  A.paint(bucketR, (u, v, x, y) => (v > 0.85 ? metal([180, 180, 186], x, y) : band(C('#e8e0d0'), 0.9 + (hh(x, y, 3) - 0.5) * 0.1, x, y)));
  A.paint(signR, (u, v, x, y) => {
    let c = planks(C('#d8ccae'), u, v, x, y, 1, null, 0);
    // a painted fish and "no" slash: NO FISHING (ignored by everyone)
    const fx = (u - 0.5) * 2.2, fy = (v - 0.5) * 2;
    if ((fx / 0.55) ** 2 + (fy / 0.3) ** 2 < 1 || (fx > 0.45 && fx < 0.8 && Math.abs(fy) < (fx - 0.45) * 1.2)) c = band([40, 60, 90], 1, x, y);
    if (Math.abs(Math.hypot(fx, fy) - 0.78) < 0.1 || (Math.abs(fx + fy) < 0.12 && Math.hypot(fx, fy) < 0.8)) c = band([200, 40, 30], 1, x, y);
    if (u < 0.04 || u > 0.96 || v < 0.06 || v > 0.94) c = shade(c, 0.7);
    return c;
  });
  const B = new Loft(false);
  // pilings in two rows: the front row stands on the gameplay plane
  const px = [-3.6, -1.2, 1.2, 3.6];
  for (const x of px) for (const z of [front, back]) {
    piling(B, x + (hh(x * 10, z * 10, 3) - 0.5) * 0.1, z, pileTop, bot, 0.15 + hh(x, z, 2) * 0.03, A.reg(pileR), 1, (hh(x, z, 5) - 0.5) * 0.12);
    if (z === front) for (let y = bot + 0.4; y < 0.1; y += 0.42) s.colliders.push({ x, y, r: 0.2 });
  }
  // stringers and joists under the deck
  for (const z of [front, back]) B.box([0, deckY - 0.16, z], [L + 0.3, 0.22, 0.14], A.reg(beamR));
  for (const x of px) B.box([x, deckY - 0.1, (front + back) / 2], [0.14, 0.16, -back + 0.4], A.reg(beamR));
  // deck planks running across the pier, little gaps between
  for (let i = 0; i < 26; i++) {
    const x = -L / 2 + 0.16 + i * ((L - 0.3) / 25);
    const w = 0.27 + (hh(i, 1, 3) - 0.5) * 0.03, h = (hh(i, 2, 3) - 0.5) * 0.012;
    B.box([x, deckY + h, (front + back) / 2 + (hh(i, 3, 3) - 0.5) * 0.04], [w, 0.05, -back + 0.55], A.reg(deckR, 0, (i % 12) / 12, 1, (i % 12 + 1) / 12), undefined, new THREE.Matrix4().makeRotationX((hh(i, 4, 3) - 0.5) * 0.02));
  }
  // underwater cross bracing between the front pilings
  for (let i = 0; i + 1 < px.length; i++) {
    const a = px[i], b = px[i + 1];
    for (const z of [front - 0.18, back + 0.18]) {
      B.tube([[a, -0.6, z], [b, -4.2, z]], () => 0.07, 6, A.reg(braceR), 2, { capStart: true, capEnd: true });
      B.tube([[b, -4.6, z], [a, -8.0, z]], () => 0.07, 6, A.reg(braceR), 3, { capStart: true, capEnd: true });
    }
  }
  // a ladder down into the water at the end
  const lx = L / 2 - 0.25, lz = front + 0.22;
  for (const dz of [-0.2, 0.2]) cyl(B, [lx, deckY + 0.9, lz + dz], [lx, -1.6, lz + dz], 0.025, 0.025, A.reg(metR), 4, 6);
  for (let y = deckY - 0.1; y > -1.5; y -= 0.3) cyl(B, [lx, y, lz - 0.2], [lx, y, lz + 0.2], 0.018, 0.018, A.reg(metR), 5, 6);
  // bollards / cleats, a lamp post with a lantern, crates, a tackle box, a bucket, a coil of rope, tyre fenders, a sign
  for (const x of [-3.0, 2.6]) { cyl(B, [x, deckY, front - 0.1], [x, deckY + 0.28, front - 0.1], 0.09, 0.08, A.reg(metR), 6, 10); cyl(B, [x - 0.14, deckY + 0.22, front - 0.1], [x + 0.14, deckY + 0.22, front - 0.1], 0.03, 0.03, A.reg(metR), 7, 8); }
  const lampX = -3.7;
  cyl(B, [lampX, deckY, back + 0.15], [lampX, deckY + 2.6, back + 0.15], 0.06, 0.05, A.reg(lampR), 8, 8);
  B.tube([[lampX, deckY + 2.55, back + 0.15], [lampX + 0.15, deckY + 2.7, back + 0.15], [lampX + 0.42, deckY + 2.62, back + 0.15]], () => 0.025, 6, A.reg(lampR), 9);
  B.box([lampX + 0.42, deckY + 2.45, back + 0.15], [0.2, 0.06, 0.2], A.reg(lampR));
  B.box([lampX + 0.42, deckY + 2.2, back + 0.15], [0.16, 0.04, 0.16], A.reg(lampR));
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, 0.12), lampMat(0xffd27a));
  lamp.position.set(lampX + 0.42, deckY + 2.32, back + 0.15);
  s.group.add(lamp); s.lamps.push(lamp);
  B.box([-1.9, deckY + 0.23, back + 0.35], [0.46, 0.42, 0.46], A.reg(crateR), undefined, new THREE.Matrix4().makeRotationY(0.15));
  B.box([-1.85, deckY + 0.63, back + 0.32], [0.38, 0.36, 0.38], A.reg(crateR), undefined, new THREE.Matrix4().makeRotationY(-0.3));
  B.box([0.9, deckY + 0.11, back + 0.4], [0.42, 0.2, 0.24], A.reg(boxR));
  bucket(B, [1.6, deckY + 0.03, back + 0.35], 0.13, 0.27, A.reg(bucketR, 0, 0, 1, 0.85), A.reg(bucketR, 0, 0.85, 1, 1), 10);
  const coil: V3[] = [];
  for (let i = 0; i <= 80; i++) { const a = (i / 80) * Math.PI * 8, rr = 0.12 + (i / 80) * 0.08; coil.push([-0.4 + Math.cos(a) * rr, deckY + 0.04 + i * 0.0009, back + 0.45 + Math.sin(a) * rr]); }
  B.tube(coil, () => 0.016, 5, A.reg(ropeR), 11);
  for (const x of [-2.4, 0.0, 2.4]) {
    torus(B, [x, deckY - 0.45, front + 0.2], 'z', 0.22, 0.09, A.reg(tyreR), 12, 16, 8, 1.1);
    B.tube([[x, deckY + 0.02, front + 0.02], [x, deckY - 0.05, front + 0.2], [x, deckY - 0.25, front + 0.2]], () => 0.013, 4, A.reg(ropeR), 13);
  }
  cyl(B, [3.4, deckY, back + 0.1], [3.4, deckY + 1.4, back + 0.1], 0.04, 0.04, A.reg(beamR), 14, 6);
  B.box([3.4, deckY + 1.3, back + 0.14], [0.62, 0.36, 0.03], A.reg(signR));
  const mat = spotMat(A.texture(), 0.85);
  const m = new THREE.Mesh(B.build(), mat); m.castShadow = true; m.receiveShadow = true; s.group.add(m);
  s.seat(2.0, deckY + 0.025, front - 0.35, 'stand', 1);
  s.seat(-2.3, deckY + 0.025, front - 0.35, 'stand', -1);
  s.seat(-0.6, deckY + 0.025, front - 0.3, 'stand', -1);
  s.seat(lx - 0.3, deckY + 0.025, front - 0.4, 'stand', 1);
  return s;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function makeIceShelf(seed: number): Vessel {
  const r = new Rng((seed * 104729 + 3) >>> 0);
  const L = 14, top = 0.14, thick = 0.62, hole = 0.36;
  const s = new Spot('ice', L);
  const A = new Atlas(1024, 512);
  const iceTopR = A.alloc(512, 256), iceSideR = A.alloc(512, 128), iceBotR = A.alloc(256, 128), snowR = A.alloc(256, 128), shR = A.alloc(128, 128), metR = A.alloc(64, 64), bucketR = A.alloc(64, 64), lampR = A.alloc(64, 32);
  // snow-dusted ice on top, a clear blue-green cross-section with bubbles and cracks, a darker rough underside
  A.paint(iceTopR, (u, v, x, y) => {
    const sn = nz(x, y, 18, 3);
    let c = band(C('#e8f2f8'), 0.94 + sn * 0.12, x, y, 0.05);
    if (sn < 0.42) c = band(C('#9ec8dc'), 0.9 + nz(x, y, 6, 4) * 0.2, x, y);
    if (Math.abs(nz(x * 0.4, y, 9, 7) - 0.5) < 0.012) c = shade(c, 0.7);
    return c;
  });
  A.paint(iceSideR, (u, v, x, y) => {
    let c = band(mix(C('#7ec0d8'), C('#2a6a8a'), 1 - v), 0.9 + nz(x, y, 10, 5) * 0.2, x, y, 0.06);
    if (v > 0.85) c = band(C('#f0f6fa'), 0.95, x, y);
    if (hh(x, y, 6) > 0.985) c = band([220, 240, 250], 1.1, x, y);
    if (Math.abs(nz(x * 0.2, y * 1.5, 10, 8) - 0.5) < 0.015) c = band([230, 246, 255], 1, x, y);
    return c;
  });
  A.paint(iceBotR, (u, v, x, y) => band(C('#3a7a94'), 0.8 + nz(x, y, 6, 9) * 0.35, x, y));
  A.paint(snowR, (u, v, x, y) => band(C('#f4f8fc'), 0.9 + nz(x, y, 8, 10) * 0.15 + (hh(x, y, 2) > 0.97 ? 0.15 : 0), x, y, 0.04));
  const tent = C(r.pick(['#d83a2a', '#2a5ab0', '#e8a020']));
  A.paint(shR, (u, v, x, y) => band(tent, 0.88 + (Math.abs(((u * 6) % 1) - 0.5) < 0.04 ? -0.2 : 0) + (nz(x, y, 10, 3) - 0.5) * 0.1, x, y));
  A.paint(metR, (u, v, x, y) => metal([170, 176, 184], x, y, 0.8 + v * 0.3));
  A.paint(bucketR, (u, v, x, y) => (v > 0.85 ? metal([180, 180, 186], x, y) : band(C('#f2f0e8'), 0.9 + (hh(x, y, 3) - 0.5) * 0.1, x, y)));
  A.paint(lampR, (u, v, x, y) => metal([60, 40, 30], x, y));
  const B = new Loft(false);
  // the sheet: two slabs either side of the hole, each a lofted block whose front face is the visible
  // cross-section; a jagged underside with hanging icicles
  const zF = 2.4, zB = -9;
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? -L / 2 : hole / 2, x1 = side < 0 ? -hole / 2 : L / 2;
    const n = 28;
    const bottom = (x: number) => top - thick - 0.08 * Math.sin(x * 1.3 + seed) - 0.05 * Math.sin(x * 3.1) - (Math.abs(x) < 0.8 ? -0.12 * (1 - Math.abs(x) / 0.8) : 0);
    const rings = Array.from({ length: n + 1 }, (_, i) => {
      const x = x0 + ((x1 - x0) * i) / n;
      const b = bottom(x);
      // a section: front-top, back-top, back-bottom, front-bottom (z extents), closed
      const pts: V3[] = [[x, top, zF], [x, top + 0.02, zB], [x, b, zB], [x, b, zF], [x, top, zF]];
      return { pts, v: i / n };
    });
    // one closed loop per section; each face gets its own texture region by skipping the others
    const faces: [number, { x: number; y: number; w: number; h: number }][] = [[0, A.reg(iceTopR)], [1, A.reg(iceBotR)], [2, A.reg(iceBotR)], [3, A.reg(iceSideR)]];
    for (const [f, reg] of faces) B.loft(rings, [0, 0.25, 0.5, 0.75, 1], reg, 1 + f, { skip: (j) => j !== f });
    // the wall of the fishing hole
    const e = side < 0 ? rings[n] : rings[0];
    const inside: V3 = [e.pts[0][0] - side * 0.3, top - thick / 2, (zF + zB) / 2];
    const rg = A.reg(iceSideR);
    const ids = [e.pts[0], e.pts[3], e.pts[2], e.pts[1]].map((p, k) => B.vert(p, rg.x + (k === 1 || k === 2 ? 0 : 1) * rg.w, rg.y + (k < 2 ? 0 : 1) * rg.h, undefined, -1));
    B.triOut(ids[0], ids[1], ids[2], inside); B.triOut(ids[0], ids[2], ids[3], inside);
    // icicles / jagged teeth under the front edge
    for (let k = 0; k < 18; k++) {
      const x = x0 + (x1 - x0) * ((k + 0.5) / 18) + (hh(k, side, 3) - 0.5) * 0.3;
      const len = 0.1 + hh(k, side, 4) * 0.35;
      const b0 = bottom(x);
      B.tube([[x, b0 + 0.02, zF - 0.15 - hh(k, 2, side) * 0.6], [x + 0.02, b0 - len, zF - 0.2 - hh(k, 2, side) * 0.6]], (t) => (1 - t) * 0.06 + 0.004, 5, A.reg(iceSideR), 10, { capEnd: true });
    }
    for (let x = x0 + 0.3; x < x1 - 0.1; x += 0.5) s.colliders.push({ x, y: bottom(x) + 0.18, r: 0.26 });
  }
  // snow drifts, slush and chips round the hole, an auger, a bucket seat, a little shanty tent, a lantern
  for (let i = 0; i < 6; i++) {
    const x = -6 + i * 2.3 + (hh(i, 1, 5) - 0.5), w = 0.8 + hh(i, 2, 5) * 1.2;
    const rings = [0, 0.5, 1].map((t, k) => ({ pts: ellRing(top + 0.001 + Math.sin(t * Math.PI) * (0.06 + hh(i, 3, 5) * 0.08), x, -1 - hh(i, 4, 5) * 3, w * (1 - t * 0.5), 0.5 * (1 - t * 0.4), 0.6 * (1 - t * 0.4), 10, 2, 1), v: k / 2 }));
    B.loft(rings, usFor(10), A.reg(snowR), 11, { end: [x, top + 0.1, -1 - hh(i, 4, 5) * 3] });
  }
  for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2, rr = hole / 2 + 0.12 + hh(k, 1, 7) * 0.1; B.box([Math.cos(a) * rr, top + 0.015, Math.sin(a) * rr * 0.8 - 0.2], [0.07, 0.03, 0.06], A.reg(iceTopR), undefined, new THREE.Matrix4().makeRotationY(a)); }
  // the auger stuck in the ice
  cyl(B, [1.2, top - 0.1, -0.6], [1.25, top + 1.0, -0.6], 0.035, 0.035, A.reg(metR), 12, 8);
  B.box([1.25, top + 1.0, -0.6], [0.6, 0.04, 0.04], A.reg(metR));
  const flight: V3[] = [];
  for (let i = 0; i <= 40; i++) { const a = (i / 40) * Math.PI * 8; flight.push([1.2 + Math.cos(a) * 0.07, top - 0.1 + (i / 40) * 0.55, -0.6 + Math.sin(a) * 0.07]); }
  B.tube(flight, () => 0.012, 4, A.reg(metR), 13);
  bucket(B, [-0.75, top, -0.35], 0.16, 0.36, A.reg(bucketR, 0, 0, 1, 0.85), A.reg(bucketR, 0, 0.85, 1, 1), 14);
  // shanty tent: a pyramid of fabric on poles, set back
  {
    const tx = -3.8, tz = -3.2, w = 1.1, h = 1.9;
    const rings = [0, 1].map((t) => ({ pts: [[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]].map(([a, b]) => [tx + a * w * (1 - t * 0.85), top + t * h, tz + b * w * (1 - t * 0.85)] as V3), v: t }));
    B.loft(rings, usFor(4), A.reg(shR), 15, { end: [tx, top + h + 0.08, tz] });
  }
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 0.1), lampMat(0xffc860));
  lamp.position.set(-1.5, top + 0.12, -0.5);
  s.group.add(lamp); s.lamps.push(lamp);
  B.box([-1.5, top + 0.22, -0.5], [0.14, 0.03, 0.14], A.reg(lampR));
  const mat = uw(new THREE.MeshStandardMaterial({ map: A.texture(), roughness: 0.28, metalness: 0.05, vertexColors: true, emissive: new THREE.Color(0x0b2a38), emissiveIntensity: 0.6 }), { caustics: 1.3 });
  const m = new THREE.Mesh(B.build(), mat); m.castShadow = true; m.receiveShadow = true; s.group.add(m);
  s.seat(-0.75, top + 0.36, -0.35, 'sit', 1);
  s.seat(0.8, top, -0.35, 'stand', -1);
  void fur; void spotMat; void rubber; void growth; void ropeCol; void planks; void torus; void wood;
  return s;
}
