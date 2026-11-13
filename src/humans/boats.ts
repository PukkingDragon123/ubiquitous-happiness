// Vessels the humans fish from: rowboat, outboard dinghy, bass skiff, kayak and the trawler (Captain Gaff's).
// Every hull is a loft of U-shaped sections with real thickness (outer skin, inner skin, gunwale caps; clinker
// strakes on the wooden boats), painted per seed: topside paint chipped to bare wood, a boot stripe on the
// waterline, antifouling below with algae, barnacles and rust, and the boat's name in pixel font on the bow.
// Hulls go through uw() so the submerged part is lit like the water; above-water fittings are plain.
// Boats float on the real surface sim via float() and bob / pitch with the waves; fishermen ride the seats.
import * as THREE from 'three';
import type { V3, Reg } from '../gfx/loft';
import { Loft, usFor } from '../gfx/loft';
import type { RGB } from '../gfx/px';
import { float } from '../gfx/water/sim';
import type { Floater } from '../gfx/water/sim';
import type { WaterFX } from '../gfx/water/water';
import { Rng } from '../core/rng';
import { hex, Px as PxN } from '../gfx/px';
import { Atlas, planks, growth, ropeCol, rubber, torus, cyl, bucket, textSampler, HULL_TEXT, HULL_TEXT_GOLD, glassMat, lampMat, spotMat, band, nz, hh, wood, metal, mix, shade } from './props';
import type { PxRect } from './props';
import { ellRing, DETAIL } from './rig';
import { pvc } from './fabric';

export type BoatKind = 'rowboat' | 'dinghy' | 'skiff' | 'trawler' | 'kayak';
export interface Collider { x: number; y: number; r: number }

export interface Vessel {
  kind: string;
  group: THREE.Group;
  /** where fishermen stand / sit: add a fisherman's group as a child; userData.seating = 'stand' | 'sit' | 'kayak', userData.facing = -1 | 1 */
  seats: THREE.Object3D[];
  x: number; vx: number;
  length: number;
  update(dt: number, water: WaterFX): void;
  /** circles approximating the submerged hull / pilings on the z = 0 plane (world units) */
  underwaterColliders(): Collider[];
  setX(x: number): void;
  /** horizontal drift speed (m/s) */
  drift(vx: number): void;
}

// ------------------------------------------------------------------ hull
interface HullDef {
  L: number; hb: (t: number) => number; keel: (t: number) => number; sheer: (t: number) => number;
  p: number; q: number; thick: number; strakes: number; ns: number; nt: number;
  /** stem rake: how far the bow's top reaches forward of its foot (m) */
  rake?: number;
}
interface Sec { s: number; side: number; inner: boolean }
/** the section loop: outer +z gunwale -> keel -> outer -z gunwale -> inner -z -> inner keel -> inner +z */
const loops = new Map<number, Sec[]>();
function loopOf(ns: number): Sec[] {
  const hit = loops.get(ns);
  if (hit) return hit;
  const out: Sec[] = [];
  for (let i = 0; i <= ns; i++) out.push({ s: 1 - i / ns, side: 1, inner: false });
  for (let i = 1; i <= ns; i++) out.push({ s: i / ns, side: -1, inner: false });
  for (let i = 0; i <= ns; i++) out.push({ s: 1 - i / ns, side: -1, inner: true });
  for (let i = 1; i <= ns; i++) out.push({ s: i / ns, side: 1, inner: true });
  out.push(out[0]);
  loops.set(ns, out);
  return out;
}
function hullPt(H: HullDef, t: number, sec: Sec): V3 {
  const phi = (sec.s * Math.PI) / 2;
  const hb = H.hb(t);
  let z = hb * Math.pow(Math.sin(phi), H.p);
  let y = H.keel(t) + (H.sheer(t) - H.keel(t)) * Math.pow(1 - Math.cos(phi), H.q);
  if (H.strakes && !sec.inner && hb > 0.02) {
    // clinker: each plank's lower edge laps proud of the one below
    const k = sec.s * H.strakes, f = k - Math.floor(k);
    z += (1 - f) * 0.007 * Math.min(1, hb / 0.2);
  }
  if (sec.inner) {
    const th = Math.min(H.thick, hb * 0.5);
    z = Math.max(0, z - th * Math.sin(phi));
    y += th * Math.cos(phi);
  }
  // a raked stem: toward the bow the upper hull reaches forward over the cutwater
  const k = H.keel(t), sh = H.sheer(t);
  const rk = H.rake ? H.rake * Math.pow(Math.max(0, (t - 0.72) / 0.28), 1.6) * Math.max(0, Math.min(1, (y - k) / (sh - k || 1))) : 0;
  return [-H.L / 2 + t * H.L + rk, y, sec.side * z];
}
function buildHull(B: Loft, H: HullDef, reg: Reg, g: number) {
  // PS2 chunky hull: half the sections / stations
  const ns = DETAIL.low ? Math.max(4, Math.round(H.ns / 2)) : H.ns, nt = DETAIL.low ? Math.max(8, Math.round(H.nt / 2.5)) : H.nt;
  const loop = loopOf(ns);
  const us = loop.map((_, i) => i / (loop.length - 1));
  const rings = Array.from({ length: nt + 1 }, (_, i) => {
    const t = i / nt;
    return { pts: loop.map((sec) => hullPt(H, t, sec)), v: t };
  });
  B.loft(rings, us, reg, g, { start: [-H.L / 2, (H.keel(0) + H.sheer(0)) / 2 + 0.02, 0], alt: true });
}
/** reverse the loop uv: u -> section */
function secOfU(H: HullDef, u: number): Sec {
  const loop = loopOf(H.ns);
  const f = u * (loop.length - 1), i = Math.min(loop.length - 2, Math.floor(f)), k = f - i;
  const a = loop[i], b = loop[i + 1];
  return { s: a.s + (b.s - a.s) * k, side: k < 0.5 ? a.side : b.side, inner: k < 0.5 ? a.inner : b.inner };
}

interface HullPaint {
  top: RGB; stripe: RGB; anti: RGB; inside: RGB; wood: RGB; rail: RGB;
  kind: 'wood' | 'glass' | 'metal' | 'plastic' | 'steel';
  name: string; gold?: boolean; wear: number; rust: number; flake?: boolean;
}
function paintHull(A: Atlas, r: PxRect, H: HullDef, hp: HullPaint, seed: number) {
  const name = textSampler(hp.name, hp.gold ? HULL_TEXT_GOLD : HULL_TEXT);
  // the name sits near the bow on the visible (+z) side: a rect in (x, y) metres
  const nameH = Math.min(0.2, (H.sheer(0.75) - 0.05) * 0.55) * (hp.kind === 'steel' ? 1.6 : 1);
  const nameW = (nameH * name.w) / name.h;
  const nx1 = H.L / 2 - H.L * 0.1, nx0 = nx1 - nameW;
  const ny1 = H.sheer((nx1 + H.L / 2) / H.L) - nameH * 0.45 - (hp.kind === 'steel' ? 0.25 : 0.02), ny0 = ny1 - nameH;
  A.paint(r, (u, v, x, y) => {
    const t = v, sec = secOfU(H, u);
    const p = hullPt(H, t, sec);
    const wy = p[1];
    if (sec.inner) {
      if (hp.kind === 'wood') {
        // ribs every 0.32 m over planked insides
        let c = planks(hp.inside, t * 3, sec.s, x, y, H.strakes || 6, null, 0);
        if (Math.abs(((p[0] + 10) / 0.32) % 1 - 0.5) < 0.05) c = shade(wood(hp.wood, x, y * 3, 1, 4), 0.85);
        return c;
      }
      if (hp.kind === 'plastic') return band(shade(hp.top, 0.9), 0.95 + (nz(x, y, 8, 3) - 0.5) * 0.1 + (sec.s < 0.3 && (x % 6 < 3) ? -0.08 : 0), x, y);
      return band(hp.inside, 0.92 + (nz(x, y, 10, seed) - 0.5) * 0.15 + (hh(x >> 2, y >> 2, 7) > 0.92 ? -0.15 : 0), x, y);
    }
    // the rail along the gunwale
    if (sec.s > 0.965) return hp.kind === 'wood' ? wood(hp.rail, x, y * 2, 1.05, 11) : band(hp.rail, 0.95 + ((x + y) % 3 === 0 ? -0.08 : 0), x, y);
    let c: RGB;
    if (wy > 0.06) {
      // topsides: planks under worn paint, or smooth gelcoat / steel
      if (hp.kind === 'wood') c = planks(hp.wood, t * 2.4, sec.s, x, y, H.strakes, hp.top, hp.wear);
      else if (hp.kind === 'steel') {
        c = band(hp.top, 0.92 + (nz(x, y, 14, seed) - 0.5) * 0.12, x, y);
        const pl = Math.abs(((p[0] + 20) / 1.6) % 1 - 0.5) < 0.012 || Math.abs(((wy + 4) / 0.8) % 1 - 0.5) < 0.015;
        if (pl) c = shade(c, 0.8);
        if (((x % 9) === 0) && Math.abs(((wy + 4) / 0.8) % 1 - 0.5) < 0.04) c = metal([110, 104, 96], x, y);
      } else if (hp.flake) {
        // bass-boat metal flake: sparkles over a deep candy colour
        c = band(hp.top, 0.88 + (nz(x, y, 12, seed) - 0.5) * 0.25 + (hh(x, y, 3) > 0.9 ? 0.35 : 0), x, y, 0.06);
      } else c = band(hp.top, 0.95 + (nz(x, y, 16, seed) - 0.5) * 0.1, x, y, 0.05);
      // a coloured sheer stripe under the rail
      const fromRail = H.sheer(t) - wy;
      if (hp.kind !== 'wood' && fromRail < (hp.kind === 'steel' ? 0.16 : 0.07) && fromRail > (hp.kind === 'steel' ? 0.07 : 0.0)) c = band(hp.stripe, 0.95, x, y);
      // rust streaks running down from fittings
      if (hp.rust > 0) {
        const col = Math.floor(p[0] * 7 + 50), streak = hh(col, 1, seed) > 0.8 ? clamp01(1 - (H.sheer(t) - wy) / (0.6 + hh(col, 2, seed) * 1.2)) : 0;
        const rs = streak * (0.5 + nz(x, y * 0.2, 3, seed) * 0.6) * hp.rust;
        if (rs > 0.25) c = mix(c, band([130, 66, 30], 0.8 + nz(x, y, 4, seed) * 0.4, x, y), Math.min(0.85, rs));
      }
      // grime near the waterline
      if (wy < 0.2) c = mix(c, [60, 70, 50], (0.2 - wy) * 0.9 * (0.5 + nz(x, y, 8, seed + 2)));
      // the name
      if (sec.side > 0 && p[0] > nx0 && p[0] < nx1 && wy > ny0 && wy < ny1) {
        const tc = name.at(((p[0] - nx0) / (nx1 - nx0)) * name.w, ((ny1 - wy) / (ny1 - ny0)) * name.h);
        if (tc) c = band(tc, 0.97 + (hh(x, y, 9) > 0.93 ? -0.25 : 0), x, y);
      }
      // trawler draft marks near the stern
      if (hp.kind === 'steel' && sec.side > 0 && Math.abs(p[0] - (-H.L / 2 + 0.8)) < 0.08 && wy < 1.0 && Math.abs(((wy + 4) / 0.2) % 1 - 0.1) < 0.12) c = [236, 236, 230];
      return c;
    }
    if (wy > -0.02) return band(hp.stripe, 0.95 + (nz(x, y, 6, 9) - 0.5) * 0.1, x, y);
    // below the waterline: antifouling with growth (and rust on steel)
    c = band(hp.anti, 0.9 + (nz(x, y, 12, seed + 4) - 0.5) * 0.25, x, y);
    if (hp.kind === 'steel' && nz(x, y, 9, seed + 5) > 0.62) c = mix(c, band([120, 62, 30], 0.9, x, y), 0.6);
    return growth(c, -wy, x, y, seed);
  });
}
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

// ------------------------------------------------------------------ generic vessel shell
class Boat implements Vessel {
  kind: string; group = new THREE.Group(); seats: THREE.Object3D[] = [];
  x = 0; vx = 0; length: number;
  body = new THREE.Group();
  fl: Floater;
  colliders: { x: number; y: number; r: number }[] = [];
  spin: THREE.Object3D[] = [];
  private out: Collider[] = [];
  private t = 0;
  constructor(kind: string, L: number, draft: number, mass: number) {
    this.kind = kind; this.length = L;
    this.group.add(this.body);
    this.group.name = 'boat:' + kind;
    this.fl = { x: 0, y: -draft, vy: 0, roll: 0, rollV: 0, half: L * 0.36, mass, draft, drag: 3 };
  }
  setX(x: number) { this.x = x; this.fl.x = x; this.group.position.x = x; }
  drift(vx: number) { this.vx = vx; }
  update(dt: number, water: WaterFX) {
    dt = Math.min(dt, 0.05);
    this.t += dt;
    this.x += this.vx * dt;
    this.fl.x = this.x;
    float(this.fl, dt, water.sim);
    this.group.position.set(this.x, this.fl.y + this.fl.draft, 0);
    this.group.rotation.z = this.fl.roll;
    if ((this.fl.splash ?? 0) > 0) water.disturb(this.x, Math.min(2, (this.fl.splash ?? 0) * 0.5), this.length * 0.3);
    if (this.vx !== 0 && Math.random() < dt * 4) water.disturb(this.x - Math.sign(this.vx) * this.length * 0.5, 0.25, 0.4);
    for (const s of this.spin) s.rotation.x += dt * 14;
  }
  underwaterColliders(): Collider[] {
    const c = Math.cos(this.group.rotation.z), s = Math.sin(this.group.rotation.z);
    const gx = this.group.position.x, gy = this.group.position.y;
    this.out.length = 0;
    for (const k of this.colliders) {
      const x = gx + k.x * c - k.y * s, y = gy + k.x * s + k.y * c;
      if (y - k.r < 0.05) this.out.push({ x, y, r: k.r });
    }
    return this.out;
  }
  seat(x: number, y: number, z: number, seating: 'stand' | 'sit' | 'kayak', facing: number) {
    const o = new THREE.Object3D();
    o.position.set(x, y, z);
    o.userData = { seating, facing };
    this.body.add(o); this.seats.push(o);
    return o;
  }
  /** collider circles under the hull bottom */
  hullColliders(H: HullDef, step = 0.45) {
    for (let x = -H.L / 2 + 0.2; x <= H.L / 2 - 0.15; x += step) {
      const t = (x + H.L / 2) / H.L;
      const k = H.keel(t);
      if (k > -0.02) continue;
      const r = Math.max(0.12, Math.min(-k * 0.6 + 0.08, H.hb(t) * 0.8));
      this.colliders.push({ x, y: k + r * 0.8, r });
    }
  }
  mesh(B: Loft, m: THREE.Material, shadow = true) {
    const mesh = new THREE.Mesh(B.build(), m);
    mesh.castShadow = shadow; mesh.receiveShadow = true;
    this.body.add(mesh);
    return mesh;
  }
}

const NAMES = {
  rowboat: ['SALTY PEG', 'OLD BESSIE', 'KNOT TODAY', 'DRIFTWOOD', 'LUCKY LOU', 'BARNACLE BILL'],
  dinghy: ['REEL DEAL', 'NAUTI BUOY', 'SEAS THE DAY', 'DAD BOD', 'WEEKENDER', 'SHORE THING'],
  skiff: ['MAKO MY DAY', 'BASS ACKWARDS', 'HOOKED', 'LURE THEM', 'TOURNAMENT', 'FIN-ATIC'],
  trawler: ['GAFF\'S REVENGE', 'IRON MAW', 'HOOK & CROOK', 'BLACK TIDE'],
  kayak: ['', '', '', ''],
};

// ------------------------------------------------------------------ kinds
export function makeBoat(kind: BoatKind, seed: number): Vessel {
  const r = new Rng((seed * 9301 + kind.length * 49297) >>> 0);
  switch (kind) {
    case 'rowboat': return rowboat(r);
    case 'dinghy': return dinghy(r);
    case 'skiff': return skiff(r);
    case 'trawler': return trawler(r);
    case 'kayak': return kayak(r);
  }
}

const C = (h: string): RGB => hex(h);

function rowboat(r: Rng): Vessel {
  const L = 3.7;
  const H: HullDef = {
    L, p: 0.85, q: 1.25, thick: 0.035, strakes: 7, ns: 10, nt: 30, rake: 0.3,
    hb: (t) => 0.7 * Math.pow(Math.sin(Math.min(1, t * 0.95 + 0.12) * Math.PI) , 0.55) * (t < 0.08 ? 0.82 + t * 2 : 1) * (t > 0.92 ? Math.max(0, (1 - t) / 0.08) ** 0.6 : 1),
    keel: (t) => -0.24 + 0.1 * Math.pow(Math.abs(t - 0.45) * 2, 3) + (t > 0.9 ? (t - 0.9) * 2.5 : 0),
    sheer: (t) => 0.4 + 0.22 * Math.pow(Math.max(0, t - 0.55) / 0.45, 2.2) + 0.08 * Math.pow(Math.max(0, 0.15 - t) / 0.15, 2),
  };
  const b = new Boat('rowboat', L, 0.2, 2.2);
  const A = new Atlas(512, 768);
  const hullR = A.alloc(512, 512);
  const top = C(r.pick(['#2f6f8f', '#c84a32', '#e8e2cc', '#3a7a4a', '#d8a83a', '#2a3a5a']));
  paintHull(A, hullR, H, { top, stripe: C(r.pick(['#f2efe4', '#1c1c1c', '#c83a2a'])), anti: C(r.pick(['#8a2a22', '#2a2a30', '#2a3a6a'])), inside: C('#9a7650'), wood: C('#a07a50'), rail: C('#6a4a30'), kind: 'wood', name: r.pick(NAMES.rowboat), wear: 0.35 + r.next() * 0.3, rust: 0 }, r.int(1, 999));
  const parts = A.alloc(256, 128), woodR = A.alloc(128, 128), ropeR = A.alloc(64, 32), metR = A.alloc(64, 32), bucketR = A.alloc(64, 64);
  A.paint(parts, (u, v, x, y) => planks(C('#a6804f'), u, v, x, y, 4, null, 0));
  A.paint(woodR, (u, v, x, y) => wood(C('#b08a5a'), x, y * 3, 1, 21));
  A.paint(ropeR, (u, v, x, y) => ropeCol(x, y));
  A.paint(metR, (u, v, x, y) => metal([170, 160, 140], x, y, 0.8 + v * 0.4));
  A.paint(bucketR, (u, v, x, y) => (v > 0.85 ? metal([180, 180, 186], x, y) : band(C('#d8d0c0'), 0.9 + (hh(x, y, 3) - 0.5) * 0.1, x, y)));
  const tex = A.texture();
  const mat = spotMat(tex);
  const B = new Loft(false);
  buildHull(B, H, A.reg(hullR), 1);
  // thwarts (benches), stern seat, floorboards
  for (const [x, w] of [[0.1, 0.24], [-1.15, 0.3], [1.05, 0.22]] as [number, number][]) {
    const t = (x + L / 2) / L, hb = H.hb(t) - 0.06;
    B.box([x, 0.22, 0], [w, 0.035, hb * 2], A.reg(parts), undefined);
  }
  B.box([0, -0.12, 0], [2.6, 0.02, 0.5], A.reg(parts, 0, 0, 1, 0.5));
  // oarlocks + oars resting on the gunwales, blades trailing in the water
  for (const side of [1, -1]) {
    const t = (0.1 + L / 2) / L, hb = H.hb(t);
    cyl(B, [0.1, H.sheer(t) - 0.02, side * hb], [0.1, H.sheer(t) + 0.08, side * hb], 0.012, 0.012, A.reg(metR), 5);
    const p0: V3 = [0.9, H.sheer(t) + 0.12, side * (hb - 0.25)], p1: V3 = [-1.5, -0.05, side * (hb + 0.75)];
    B.tube([p0, [0.1, H.sheer(t) + 0.06, side * hb], p1], (k) => 0.022 - k * 0.004, 7, A.reg(woodR), 6, { capStart: true, capEnd: true });
    // the blade
    const dx = p1[0] - 0.1, dz = p1[2] - side * hb, l = Math.hypot(dx, dz);
    const bl = new THREE.Matrix4().makeRotationY(-Math.atan2(dz, dx)).multiply(new THREE.Matrix4().makeRotationZ(-0.12));
    B.box([p1[0] + (dx / l) * 0.2, -0.08, p1[2] + (dz / l) * 0.2], [0.5, 0.012, 0.13], A.reg(woodR), undefined, bl);
  }
  // a coil of rope in the bow and a bucket
  const coil: V3[] = [];
  for (let i = 0; i <= 70; i++) { const a = (i / 70) * Math.PI * 7, rr = 0.11 + (i / 70) * 0.05; coil.push([1.3 + Math.cos(a) * rr, -0.08 + i * 0.0008, Math.sin(a) * rr]); }
  B.tube(coil, () => 0.012, 5, A.reg(ropeR), 7);
  bucket(B, [-0.6, -0.11, 0.25], 0.12, 0.24, A.reg(bucketR, 0, 0, 1, 0.85), A.reg(bucketR, 0, 0.85, 1, 1), 8);
  // bow painter rope trailing to the water
  B.tube([[L / 2 - 0.05, H.sheer(1) - 0.05, 0], [L / 2 + 0.25, 0.2, 0.1], [L / 2 + 0.5, -0.05, 0.15]], () => 0.01, 5, A.reg(ropeR), 9);
  b.mesh(B, mat);
  b.hullColliders(H);
  b.seat(0.1, 0.24, -0.05, 'sit', -1);
  b.seat(-1.15, 0.24, 0, 'sit', 1);
  b.seat(1.05, 0.24, 0, 'sit', -1);
  return b;
}

/** an outboard motor: cowling, shaft into the water, lower unit and a spinning propeller */
function outboard(b: Boat, B: Loft, A: Atlas, x: number, top: number, size: number, col: RGB, mat: THREE.Material) {
  const cowl = A.alloc(128, 64), sh = A.alloc(32, 64), prop = A.alloc(32, 32);
  A.paint(cowl, (u, v, x2, y2) => {
    let c = band(col, 0.9 + v * 0.2 + (nz(x2, y2, 8, 2) - 0.5) * 0.08, x2, y2, 0.06);
    if (Math.abs(v - 0.45) < 0.06) c = band([30, 30, 32], 1, x2, y2);
    if (v < 0.12) c = band([40, 40, 44], 0.9, x2, y2);
    if (u > 0.25 && u < 0.6 && v > 0.62 && v < 0.82) c = band([240, 240, 236], (x2 + y2) % 5 === 0 ? 0.7 : 1, x2, y2);
    return c;
  });
  A.paint(sh, (u, v, x2, y2) => band(shade(col, 0.5), 0.8 + Math.sin(u * Math.PI) * 0.3, x2, y2));
  A.paint(prop, (u, v, x2, y2) => metal([190, 180, 150], x2, y2));
  const s = size;
  // cowling: a rounded box loft, the clamp bracket, the shaft
  const cy = top + 0.22 * s;
  const rings = [-0.16, -0.08, 0.08, 0.17].map((dy, i) => ({ pts: ellRing(cy + dy * s, x - 0.08 * s, 0, [0.08, 0.13, 0.14, 0.09][i] * s, [0.1, 0.13, 0.13, 0.08][i] * s, [0.1, 0.13, 0.13, 0.08][i] * s, 12, 2.6, 1).map((p) => [p[0], p[1], p[2] * 0.7] as V3), v: i / 3 }));
  B.loft(rings, usFor(12), A.reg(cowl), 30, { start: [x - 0.08 * s, cy - 0.17 * s, 0], end: [x - 0.08 * s, cy + 0.2 * s, 0] });
  B.box([x + 0.02, top - 0.02, 0], [0.06 * s, 0.14 * s, 0.14 * s], A.reg(sh));
  cyl(B, [x - 0.06 * s, cy - 0.15 * s, 0], [x - 0.06 * s, -0.5 * s, 0], 0.035 * s, 0.03 * s, A.reg(sh), 31, 8);
  // lower unit: torpedo gearcase + skeg + cavitation plate
  cyl(B, [x + 0.02 * s, -0.55 * s, 0], [x - 0.22 * s, -0.55 * s, 0], 0.035 * s, 0.025 * s, A.reg(sh), 32, 8);
  B.box([x - 0.06 * s, -0.42 * s, 0], [0.24 * s, 0.012 * s, 0.14 * s], A.reg(sh));
  B.box([x - 0.08 * s, -0.66 * s, 0], [0.12 * s, 0.12 * s, 0.01 * s], A.reg(sh));
  // tiller arm
  cyl(B, [x - 0.04 * s, cy - 0.04 * s, 0.05 * s], [x + 0.45 * s, cy - 0.02 * s, 0.12 * s], 0.018 * s, 0.022 * s, A.reg(sh), 33, 8);
  // propeller: its own spinning mesh
  const PB = new Loft(false);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const m = new THREE.Matrix4().makeRotationX(a).multiply(new THREE.Matrix4().makeRotationY(0.5));
    PB.box([0, Math.cos(a) * 0.06 * s, Math.sin(a) * 0.06 * s], [0.025 * s, 0.1 * s, 0.05 * s], A.reg(prop), undefined, m);
  }
  cyl(PB, [-0.03 * s, 0, 0], [0.03 * s, 0, 0], 0.018 * s, 0.012 * s, A.reg(prop), 2, 8);
  const pm = new THREE.Mesh(PB.build(), mat);
  pm.position.set(x - 0.25 * s, -0.55 * s, 0);
  pm.castShadow = true;
  b.body.add(pm);
  b.spin.push(pm);
  b.colliders.push({ x: x - 0.12 * s, y: -0.5 * s, r: 0.14 * s });
}

function dinghy(r: Rng): Vessel {
  const L = 3.2;
  const H: HullDef = {
    L, p: 0.7, q: 1.4, thick: 0.03, strakes: 0, ns: 10, nt: 26, rake: 0.25,
    hb: (t) => 0.72 * Math.pow(Math.sin(Math.min(1, t * 0.88 + 0.2) * Math.PI), 0.45) * (t > 0.9 ? Math.max(0, (1 - t) / 0.1) ** 0.5 : 1),
    keel: (t) => -0.2 + 0.05 * Math.abs(t - 0.4) + (t > 0.78 ? ((t - 0.78) / 0.22) ** 2 * 0.42 : 0),
    sheer: (t) => 0.36 + 0.14 * Math.pow(Math.max(0, t - 0.6) / 0.4, 2),
  };
  const b = new Boat('dinghy', L, 0.16, 1.8);
  const A = new Atlas(512, 768);
  const hullR = A.alloc(512, 512);
  const stripe = C(r.pick(['#2a5ab0', '#c83a2a', '#2a8a6a', '#e8a020']));
  const top = C(r.pick(['#f2f0e8', '#dfe6ea', '#e8e0cc']));
  paintHull(A, hullR, H, { top, stripe, anti: C(r.pick(['#2a3a6a', '#8a2a22'])), inside: C('#d8d6cc'), wood: C('#a07a50'), rail: C('#4a4a4e'), kind: 'glass', name: r.pick(NAMES.dinghy), wear: 0, rust: 0 }, r.int(1, 999));
  const seatR = A.alloc(128, 64), coolR = A.alloc(128, 64), tankR = A.alloc(64, 64);
  A.paint(seatR, (u, v, x, y) => planks(C('#b08a5a'), u, v, x, y, 3, null, 0));
  const cool = C(r.pick(['#e8e8e8', '#3a6ad8', '#d83a3a']));
  A.paint(coolR, (u, v, x, y) => (v > 0.78 ? band([240, 240, 240], 0.95, x, y) : band(cool, 0.92 + (hh(x, y, 2) - 0.5) * 0.06 + (Math.abs(v - 0.5) < 0.05 ? -0.2 : 0), x, y)));
  A.paint(tankR, (u, v, x, y) => band([200, 40, 30], 0.85 + Math.sin(u * Math.PI) * 0.25, x, y));
  const cowl: RGB = C(r.pick(['#2a2a2e', '#e8e8e8', '#3a5aa0']));
  const B = new Loft(false);
  buildHull(B, H, A.reg(hullR), 1);
  // bench seats
  for (const x of [0.25, -0.95]) { const t = (x + L / 2) / L; B.box([x, 0.18, 0], [0.3, 0.04, (H.hb(t) - 0.04) * 2], A.reg(seatR)); }
  // a cooler (with a can on it) and the fuel tank
  B.box([0.95, -0.03, 0.05], [0.42, 0.26, 0.3], A.reg(coolR));
  B.box([-1.2, -0.06, -0.25], [0.28, 0.2, 0.2], A.reg(tankR));
  const mat = spotMat(A.texture(), 0.55);
  outboard(b, B, A, -L / 2 - 0.08, H.sheer(0), 0.9, cowl, mat);
  // re-upload: the outboard painted into the atlas after the texture was made
  (mat.map as THREE.Texture).dispose();
  mat.map = A.texture();
  b.mesh(B, mat);
  b.hullColliders(H);
  b.seat(0.25, 0.2, 0, 'sit', 1);
  b.seat(-0.95, 0.2, 0, 'sit', -1);
  b.seat(0.95, 0.11, 0.05, 'sit', 1);
  return b;
}

function skiff(r: Rng): Vessel {
  const L = 4.8;
  const H: HullDef = {
    L, p: 0.45, q: 1.7, thick: 0.035, strakes: 0, ns: 10, nt: 30, rake: 0.35,
    hb: (t) => 0.92 * Math.pow(Math.sin(Math.min(1, t * 0.82 + 0.3) * Math.PI), 0.4) * (t > 0.9 ? Math.max(0, (1 - t) / 0.1) ** 0.5 : 1),
    keel: (t) => -0.22 + (t > 0.7 ? ((t - 0.7) / 0.3) ** 2 * 0.55 : 0),
    sheer: (t) => 0.42 + 0.08 * Math.pow(Math.max(0, t - 0.6) / 0.4, 2),
  };
  const b = new Boat('skiff', L, 0.18, 2.6);
  const A = new Atlas(512, 768);
  const hullR = A.alloc(512, 512);
  const top = C(r.pick(['#b8262a', '#1e4ab0', '#5a2a9a', '#0f7a6a', '#d86a10']));
  paintHull(A, hullR, H, { top, stripe: C('#f2f2f2'), anti: C('#1c1c22'), inside: C('#8a8a90'), wood: C('#a07a50'), rail: C('#1c1c1e'), kind: 'glass', flake: true, name: r.pick(NAMES.skiff), wear: 0, rust: 0 }, r.int(1, 999));
  const carpet = A.alloc(256, 96), seatR = A.alloc(64, 64), consoleR = A.alloc(128, 96), metR = A.alloc(64, 32);
  A.paint(carpet, (u, v, x, y) => band(C('#4a4c52'), 0.9 + (hh(x, y, 4) - 0.5) * 0.2, x, y));
  A.paint(seatR, (u, v, x, y) => pvc(C('#e8e4dc'), x, y, 0.95 + (Math.abs(v - 0.5) < 0.05 ? -0.2 : 0), 3));
  A.paint(consoleR, (u, v, x, y) => (v > 0.6 && v < 0.9 && u > 0.15 && u < 0.85 ? band([30, 40, 50], 0.9 + (u > 0.6 ? 0.2 : 0), x, y) : band(top, 0.95 + (hh(x, y, 5) > 0.9 ? 0.2 : 0), x, y)));
  A.paint(metR, (u, v, x, y) => metal([196, 200, 206], x, y, 0.8 + v * 0.4));
  const B = new Loft(false);
  buildHull(B, H, A.reg(hullR), 1);
  // raised carpeted casting decks fore and aft, a pedestal seat, a side console, trolling motor on the bow
  B.box([1.35, 0.3, 0], [1.6, 0.06, 1.5], A.reg(carpet));
  B.box([-1.65, 0.3, 0], [1.1, 0.06, 1.6], A.reg(carpet));
  cyl(B, [1.4, 0.33, 0], [1.4, 0.62, 0], 0.03, 0.03, A.reg(metR), 4);
  B.box([1.4, 0.66, 0], [0.4, 0.08, 0.4], A.reg(seatR));
  B.box([1.3, 0.86, -0.18], [0.08, 0.36, 0.38], A.reg(seatR));
  B.box([-0.1, 0.45, 0.42], [0.5, 0.5, 0.42], A.reg(consoleR));
  cyl(B, [2.25, 0.5, 0.35], [2.6, -0.4, 0.42], 0.016, 0.016, A.reg(metR), 5);
  B.box([2.6, -0.45, 0.42], [0.22, 0.08, 0.08], A.reg(metR));
  const mat = spotMat(A.texture(), 0.32);
  outboard(b, B, A, -L / 2 - 0.1, H.sheer(0), 1.35, C('#1c1c20'), mat);
  (mat.map as THREE.Texture).dispose();
  mat.map = A.texture();
  b.mesh(B, mat);
  b.hullColliders(H);
  b.seat(1.6, 0.33, 0, 'stand', 1);
  b.seat(-1.7, 0.33, 0, 'stand', -1);
  return b;
}

function kayak(r: Rng): Vessel {
  const L = 3.6;
  const H: HullDef = {
    L, p: 0.8, q: 1.2, thick: 0.02, strakes: 0, ns: 8, nt: 26,
    hb: (t) => 0.4 * Math.pow(Math.sin(t * Math.PI), 0.6),
    keel: (t) => -0.13 + 0.1 * Math.pow(Math.abs(t - 0.5) * 2, 2.5),
    sheer: (t) => 0.16 + 0.05 * Math.pow(Math.abs(t - 0.5) * 2, 2),
  };
  const b = new Boat('kayak', L, 0.1, 1.1);
  const A = new Atlas(512, 768);
  const hullR = A.alloc(512, 512);
  const col = C(r.pick(['#f2c81e', '#e8501e', '#2aa8d8', '#3ac84a', '#e83a7a']));
  paintHull(A, hullR, H, { top: col, stripe: shade(col, 0.7), anti: shade(col, 0.75), inside: shade(col, 0.85), wood: col, rail: shade(col, 0.8), kind: 'plastic', name: '', wear: 0, rust: 0 }, r.int(1, 999));
  const deckR = A.alloc(256, 128), seatR = A.alloc(64, 64), padR = A.alloc(64, 32), bungee = A.alloc(32, 32);
  A.paint(deckR, (u, v, x, y) => band(col, 0.95 + (nz(x, y, 12, 3) - 0.5) * 0.08 + ((x % 12 < 2) && v < 0.3 ? -0.1 : 0), x, y));
  A.paint(seatR, (u, v, x, y) => band([40, 44, 50], ((x + y) % 4 < 2 ? 1 : 0.8), x, y));
  A.paint(padR, (u, v, x, y) => band([30, 30, 32], 0.9 + Math.sin(u * Math.PI) * 0.2, x, y));
  A.paint(bungee, (u, v, x, y) => band([20, 20, 20], (x + y) % 3 ? 1 : 0.7, x, y));
  const B = new Loft(false);
  buildHull(B, H, A.reg(hullR), 1);
  // sit-on-top deck: a lofted cover fore and aft of the cockpit (bow / stern hatches, bungees)
  for (const [t0, t1] of [[0.02, 0.33], [0.62, 0.98]] as [number, number][]) {
    const rings = Array.from({ length: 9 }, (_, i) => {
      const t = t0 + ((t1 - t0) * i) / 8, x = -L / 2 + t * L, hb = H.hb(t), sh = H.sheer(t);
      const pts: V3[] = [];
      for (let j = 0; j <= 10; j++) { const a = (j / 10) * Math.PI; pts.push([x, sh + Math.sin(a) * hb * 0.18, Math.cos(a) * hb]); }
      return { pts, v: i / 8 };
    });
    B.loft(rings, usFor(10), A.reg(deckR), 2, {});
    for (let i = 0; i < 3; i++) { const t = t0 + (t1 - t0) * (0.3 + i * 0.2), x = -L / 2 + t * L, hb = H.hb(t); B.tube([[x, H.sheer(t) + hb * 0.17, -hb * 0.8], [x, H.sheer(t) + hb * 0.2, 0], [x, H.sheer(t) + hb * 0.17, hb * 0.8]], () => 0.005, 4, A.reg(bungee), 3); }
  }
  // seat with a backrest, a paddle across the deck
  B.box([-0.05, 0.02, 0], [0.4, 0.06, 0.4], A.reg(seatR));
  B.box([-0.28, 0.2, 0], [0.04, 0.34, 0.38], A.reg(seatR), undefined, new THREE.Matrix4().makeRotationZ(0.3));
  B.tube([[0.5, 0.2, -1.05], [0.5, 0.2, 1.05]], () => 0.016, 6, A.reg(padR), 4, { capStart: true, capEnd: true });
  for (const z of [-1.15, 1.15]) B.box([0.5, 0.2, z], [0.18, 0.012, 0.3], A.reg(padR), undefined, new THREE.Matrix4().makeRotationX(z > 0 ? 0.4 : -0.4));
  b.mesh(B, spotMat(A.texture(), 0.4));
  b.hullColliders(H, 0.4);
  b.seat(-0.05, 0.05, 0, 'kayak', -1);
  return b;
}

function trawler(r: Rng): Vessel {
  const L = 11;
  const H: HullDef = {
    L, p: 0.75, q: 1.35, thick: 0.08, strakes: 0, ns: 12, nt: 40, rake: 1.3,
    hb: (t) => 1.9 * Math.pow(Math.sin(Math.min(1, t * 0.85 + 0.22) * Math.PI), 0.42) * (t > 0.7 ? Math.max(0, (1 - t) / 0.3) ** 0.75 : 1),
    keel: (t) => -1.9 + (t > 0.72 ? ((t - 0.72) / 0.28) ** 2 * 1.8 : 0) + (t < 0.1 ? (0.1 - t) * 4 : 0),
    sheer: (t) => 1.25 + 0.75 * Math.pow(Math.max(0, t - 0.55) / 0.45, 2) + 0.2 * Math.pow(Math.max(0, 0.12 - t) / 0.12, 2),
  };
  const b = new Boat('trawler', L, 1.5, 9);
  const A = new Atlas(1024, 1536);
  const hullR = A.alloc(1024, 1024);
  const gaff = r.next() < 0.6;
  const top = C(gaff ? '#1c2026' : r.pick(['#8a2a22', '#1e3a6a', '#2a5a3a', '#2a2a2e']));
  paintHull(A, hullR, H, { top, stripe: C(gaff ? '#c8a040' : '#f2f2ea'), anti: C('#6a2a20'), inside: C('#5a5e62'), wood: C('#8a6a4a'), rail: C(gaff ? '#c8a040' : '#e8e8e2'), kind: 'steel', name: gaff ? 'GAFF\'S REVENGE' : r.pick(NAMES.trawler), gold: gaff, wear: 0, rust: 0.9 }, r.int(1, 999));
  const deckR = A.alloc(512, 256), cabR = A.alloc(256, 256), roofR = A.alloc(128, 128), tyreR = A.alloc(64, 64), ropeR = A.alloc(64, 32), metR = A.alloc(64, 64), netR = A.alloc(128, 128), ringR = A.alloc(64, 32), rustR = A.alloc(64, 64);
  A.paint(deckR, (u, v, x, y) => planks(C('#8a7458'), u, v, x, y, 14, null, 0));
  const cab = C(gaff ? '#2a2a30' : '#ece8dc');
  A.paint(cabR, (u, v, x, y) => {
    let c = band(cab, 0.92 + (nz(x, y, 10, 4) - 0.5) * 0.12, x, y);
    // rust weeping from the window corners and rivet seams
    if (nz(x, y * 0.25, 4, 7) > 0.7 && v < 0.7) c = mix(c, [130, 70, 36], 0.5);
    if ((y % 32) === 0 || (x % 64) === 0) c = shade(c, 0.85);
    return c;
  });
  A.paint(roofR, (u, v, x, y) => band(gaff ? C('#3a3a40') : C('#d0ccc0'), 0.9 + (hh(x, y, 3) - 0.5) * 0.1, x, y));
  A.paint(tyreR, (u, v, x, y) => rubber(x, y, 0.9 + Math.sin(v * Math.PI) * 0.2));
  A.paint(ropeR, (u, v, x, y) => ropeCol(x, y));
  A.paint(metR, (u, v, x, y) => metal([150, 150, 150], x, y, 0.8 + v * 0.3 + (nz(x, y, 4, 2) > 0.7 ? -0.3 : 0)));
  A.paint(netR, (u, v, x, y) => (((x + y) % 6 === 0 || (x - y + 600) % 6 === 0) ? band([60, 120, 90], 1, x, y) : band([30, 60, 50], 0.7, x, y)));
  A.paint(ringR, (u, v, x, y) => band(Math.floor(u * 8) % 2 ? [240, 240, 236] : [230, 70, 40], 0.9 + Math.sin(v * Math.PI) * 0.2, x, y));
  A.paint(rustR, (u, v, x, y) => band([120, 64, 36], 0.8 + nz(x, y, 4, 3) * 0.5, x, y));
  const B = new Loft(false);
  buildHull(B, H, A.reg(hullR), 1);
  // deck
  B.box([0, H.sheer(0.5) - 0.35, 0], [L * 0.86, 0.08, 3.2], A.reg(deckR));
  // the wheelhouse: walls, windows, roof, a mast with lights, the net boom
  const cx = 1.6, cy = H.sheer(0.6) - 0.3;
  B.box([cx, cy + 1.05, 0], [2.6, 2.1, 2.4], A.reg(cabR));
  B.box([cx, cy + 2.16, 0], [2.9, 0.12, 2.7], A.reg(roofR));
  const glass = new Loft(false);
  for (let i = 0; i < 3; i++) glass.box([cx - 0.75 + i * 0.75, cy + 1.45, 1.21], [0.58, 0.55, 0.02], { x: 0, y: 0, w: 1, h: 1 });
  glass.box([cx + 1.31, cy + 1.45, 0], [0.02, 0.55, 1.8], { x: 0, y: 0, w: 1, h: 1 });
  B.box([cx - 1.31, cy + 0.85, 0.4], [0.02, 1.4, 0.7], A.reg(rustR)); // the door
  const mx = cx + 0.4;
  cyl(B, [mx, cy + 2.2, 0], [mx, cy + 5.2, 0], 0.07, 0.05, A.reg(metR), 4, 8);
  B.box([mx, cy + 4.4, 0], [0.06, 0.06, 1.4], A.reg(metR));
  // net boom: a derrick from the mast foot out over the stern with a hanging net and block
  cyl(B, [mx - 0.2, cy + 2.4, 0], [-4.6, cy + 3.6, 0.1], 0.06, 0.04, A.reg(metR), 5, 8);
  B.tube([[mx, cy + 5.1, 0], [-1.5, cy + 4.3, 0.05], [-4.6, cy + 3.6, 0.1]], () => 0.012, 4, A.reg(ropeR), 6);
  B.tube([[-4.6, cy + 3.6, 0.1], [-4.75, cy + 2.6, 0.1]], () => 0.014, 4, A.reg(ropeR), 7);
  // the net: a bag of see-through mesh hanging from the block (its own alpha-tested material), cork floats on it
  const NB = new Loft(false);
  {
    const rings = Array.from({ length: 8 }, (_, i) => { const t = i / 7, rr = 0.06 + Math.sin(t * Math.PI * 0.9) * 0.3; return { pts: ellRing(cy + 2.6 - t * 1.5, -4.75 + Math.sin(t * 2) * 0.06, 0.1, rr, rr * 0.85, rr * 0.85, 14, 2, 1, (th) => Math.sin(th * 5 + i) * 0.14 * t), v: t }; });
    NB.loft(rings, usFor(14), { x: 0, y: 0, w: 1, h: 1 }, 1, { end: [-4.7, cy + 1.05, 0.1] });
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2, t = 0.35 + (i % 2) * 0.2, rr = 0.06 + Math.sin(t * Math.PI * 0.9) * 0.3; B.box([-4.75 + Math.cos(a) * rr, cy + 2.6 - t * 1.5, 0.1 + Math.sin(a) * rr * 0.85], [0.07, 0.05, 0.07], A.reg(ringR, 0, 0, 0.12, 1)); }
  }
  // stern gantry (an A-frame) and bow rail
  for (const z of [-1.4, 1.4]) cyl(B, [-5.0, H.sheer(0.05) - 0.3, z], [-4.8, H.sheer(0.05) + 2.3, z * 0.4], 0.07, 0.06, A.reg(metR), 9, 8);
  cyl(B, [-4.8, H.sheer(0.05) + 2.3, -0.56], [-4.8, H.sheer(0.05) + 2.3, 0.56], 0.07, 0.07, A.reg(metR), 10, 8);
  for (let i = 0; i < 6; i++) { const t = 0.72 + i * 0.045, x = -L / 2 + t * L; cyl(B, [x, H.sheer(t), H.hb(t) - 0.08], [x, H.sheer(t) + 0.7, H.hb(t) - 0.12], 0.025, 0.025, A.reg(metR), 11, 6); }
  const rail: V3[] = Array.from({ length: 8 }, (_, i) => { const t = 0.72 + i * 0.035; return [-L / 2 + t * L, H.sheer(t) + 0.7, H.hb(t) - 0.12]; });
  B.tube(rail, () => 0.03, 6, A.reg(metR), 12);
  // tyres hanging on ropes as fenders along the visible side
  for (let i = 0; i < 4; i++) {
    const t = 0.2 + i * 0.16, x = -L / 2 + t * L, sh = H.sheer(t);
    const z = H.hb(t) + 0.16;
    torus(B, [x, sh - 0.75, z], 'z', 0.24, 0.1, A.reg(tyreR), 13 + i, 16, 8, 1.15);
    B.tube([[x, sh + 0.02, H.hb(t) - 0.05], [x, sh - 0.05, z - 0.02], [x, sh - 0.52, z]], () => 0.014, 4, A.reg(ropeR), 20 + i);
  }
  // a life ring on the wheelhouse front
  torus(B, [cx + 1.34, cy + 0.75, 0.6], 'x', 0.26, 0.06, A.reg(ringR), 30, 16, 8);
  // anchor at the bow
  B.box([L / 2 - 1.0, H.sheer(0.92) - 0.55, H.hb(0.9) + 0.03], [0.1, 0.55, 0.04], A.reg(metR));
  B.box([L / 2 - 1.0, H.sheer(0.92) - 0.85, H.hb(0.9) + 0.03], [0.45, 0.08, 0.04], A.reg(metR), undefined, new THREE.Matrix4().makeRotationZ(0.2));
  const tex = A.texture();
  const mat = spotMat(tex, 0.62);
  b.mesh(B, mat);
  const gm = new THREE.Mesh(glass.build(), glassMat()); b.body.add(gm);
  {
    const P = new PxN(64, 64);
    P.fill((x, y) => ((x + y) % 8 === 0 || (x - y + 64) % 8 === 0 ? [120, 140, 96, 255] : (x + y) % 8 === 1 || (x - y + 64) % 8 === 1 ? [70, 84, 56, 255] : null));
    const t = P.texture(); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4, 3);
    const nm = new THREE.Mesh(NB.build(), new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.95, emissive: 0x1a2014 }));
    nm.castShadow = true; b.body.add(nm);
  }
  // running lights: masthead, port / starboard, a deck flood
  const L1 = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), lampMat(0xfff1c8)); L1.position.set(mx, cy + 5.25, 0); b.body.add(L1);
  const L2 = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), lampMat(0x40ff70)); L2.position.set(cx + 1.0, cy + 2.25, 1.3); b.body.add(L2);
  const L3 = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), lampMat(0xff4030)); L3.position.set(cx + 1.0, cy + 2.25, -1.3); b.body.add(L3);
  const fl = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.14, 0.12), lampMat(0xffe6b0)); fl.position.set(cx - 1.35, cy + 2.0, 0.6); b.body.add(fl);
  // a propeller under the stern
  {
    const PB = new Loft(false);
    for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; PB.box([0, Math.cos(a) * 0.32, Math.sin(a) * 0.32], [0.08, 0.5, 0.22], A.reg(metR), undefined, new THREE.Matrix4().makeRotationX(a).multiply(new THREE.Matrix4().makeRotationY(0.6))); }
    const pm = new THREE.Mesh(PB.build(), mat); pm.position.set(-L / 2 + 0.1, -1.35, 0); b.body.add(pm); b.spin.push(pm);
    const RB = new Loft(false); RB.box([-L / 2 - 0.35, -1.25, 0], [0.5, 0.9, 0.06], A.reg(rustR)); b.mesh(RB, mat);
  }
  b.hullColliders(H, 0.6);
  b.seat(-2.5, H.sheer(0.5) - 0.31, 0.5, 'stand', -1);
  b.seat(4.0, H.sheer(0.85) - 0.31, 0.2, 'stand', 1);
  b.seat(-1.2, H.sheer(0.5) - 0.31, 0.6, 'stand', -1);
  return b;
}
