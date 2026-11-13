// Geometry builders for the diorama props, on top of the shared Loft builder (src/gfx/loft.ts). Everything is
// built at the origin into a Loft, then moved into place with place(); static props are all merged into one
// mesh per material. UVs point into the painted prop atlas (tex.ts A.*) or the foliage page (F.*).
import * as THREE from 'three';
import { Loft, ring, usFor, V3, Reg, sub as vsub, cross, dot, norm, add as vadd, scale as vscale } from '../gfx/loft';
import { Rng } from '../core/rng';
import { A, F } from './tex';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
/** move everything added to L since vertex `from` */
export function place(L: Loft, from: number, pos: V3, rotY = 0, s: number | V3 = 1, rotX = 0, rotZ = 0) {
  _e.set(rotX, rotY, rotZ, 'YXZ');
  _m.compose(_p.set(pos[0], pos[1], pos[2]), _q.setFromEuler(_e), typeof s === 'number' ? _s.set(s, s, s) : _s.set(s[0], s[1], s[2]));
  L.transformSince(from, _m);
}
export function placeM(L: Loft, from: number, m: THREE.Matrix4) { L.transformSince(from, m); }

let G = 1;
/** a fresh smoothing group id */
export const gid = () => ++G;

/** surface of revolution around +y: prof = [radius, y][] bottom to top */
export function lathe(L: Loft, prof: [number, number][], n: number, reg: Reg, o: { capBot?: boolean; capTop?: boolean; sq?: number; g?: number; c?: number } = {}) {
  const us = usFor(n);
  const g = o.g ?? gid();
  const rings = prof.map(([r, y], i) => ({ pts: ring([0, y, 0], [1, 0, 0], [0, 0, 1], Math.max(r, 1e-4), Math.max(r, 1e-4), Math.max(r, 1e-4), n, o.sq ?? 2), v: i / (prof.length - 1), c: o.c }));
  L.loft(rings, us, reg, g, { start: o.capBot ? [0, prof[0][1], 0] : null, end: o.capTop ? [0, prof[prof.length - 1][1], 0] : null });
}
/** a rod / post / rope between two points */
export function rod(L: Loft, a: V3, b: V3, r0: number, r1: number, sides: number, reg: Reg, caps = true) {
  L.tube([a, b], (t) => r0 + (r1 - r0) * t, sides, reg, gid(), { capStart: caps, capEnd: caps });
}
export function box(L: Loft, c: V3, size: V3, reg: Reg, rotY = 0) {
  L.box(c, size, reg, undefined, rotY ? new THREE.Matrix4().makeRotationY(rotY) : null);
}
/** a lumpy ellipsoid (heads, bushes, coconuts, shells) */
export function blob(L: Loft, c: V3, rx: number, ry: number, rz: number, reg: Reg, n = 10, lump = 0, seed = 1) {
  const from = L.count;
  const prof: [number, number][] = [];
  const NR = Math.max(4, Math.round(n * 0.6));
  for (let i = 0; i <= NR; i++) { const a = -Math.PI / 2 + (i / NR) * Math.PI; prof.push([Math.cos(a), Math.sin(a)]); }
  const us = usFor(n);
  const g = gid();
  const r = new Rng(seed);
  const bumps = Array.from({ length: 5 }, () => [r.range(0, 6.28), r.range(0, 3.14), r.range(-1, 1)]);
  const rings = prof.slice(1, -1).map(([rr, y], i) => ({
    pts: ring([0, y, 0], [1, 0, 0], [0, 0, 1], rr, rr, rr, n).map((p): V3 => {
      let k = 1;
      if (lump) for (const [a, b, s] of bumps) k += lump * s * Math.cos(Math.atan2(p[2], p[0]) * 2 + a) * Math.sin(y * 2.5 + b) * 0.5;
      return [p[0] * k, p[1], p[2] * k];
    }), v: (i + 1) / NR,
  }));
  L.loft(rings, us, reg, g, { start: [0, -1, 0], end: [0, 1, 0], startV: 0, endV: 1 });
  place(L, from, c, 0, [rx, ry, rz]);
}

/** generic surface from a point grid, wound so normals face `out(p)` */
export function surf(L: Loft, P: V3[][], uv: (i: number, j: number) => [number, number], reg: Reg, out: (p: V3) => V3, g = gid(), w?: (i: number, j: number) => number) {
  const ids = P.map((row, i) => row.map((p, j) => { const [u, v] = uv(i, j); return L.vert(p, reg.x + u * reg.w, reg.y + v * reg.h, undefined, g, w ? w(i, j) : 1); }));
  for (let i = 0; i + 1 < P.length; i++) for (let j = 0; j + 1 < P[i].length; j++) {
    const a = ids[i][j], b = ids[i + 1][j], c = ids[i + 1][j + 1], d = ids[i][j + 1];
    const pa = P[i][j], pb = P[i + 1][j], pc = P[i + 1][j + 1], pd = P[i][j + 1];
    let n = cross(vsub(pb, pa), vsub(pc, pa));
    if (Math.hypot(...n) < 1e-12) n = cross(vsub(pc, pa), vsub(pd, pa));
    const cen: V3 = [(pa[0] + pc[0]) / 2, (pa[1] + pc[1]) / 2, (pa[2] + pc[2]) / 2];
    if (dot(n, out(cen)) >= 0) { L.tri(a, b, c); L.tri(a, c, d); } else { L.tri(a, c, b); L.tri(a, d, c); }
  }
  return ids;
}
/** a double-sided membrane with per-vertex weight (fronds, sails, flags); grid[i][j]: i across, j along */
export function membrane(L: Loft, grid: V3[][], reg: Reg, w: (i: number, j: number) => number = () => 1) {
  const R = grid.length, Cn = grid[0].length;
  for (const side of [1, -1]) {
    const g = gid();
    const ids = grid.map((row, i) => row.map((p, j) => L.vert(p, reg.x + (j / (Cn - 1)) * reg.w, reg.y + (i / (R - 1)) * reg.h, undefined, g, w(i, j))));
    for (let i = 0; i + 1 < R; i++) for (let j = 0; j + 1 < Cn; j++) {
      const a = ids[i][j], b = ids[i][j + 1], c = ids[i + 1][j + 1], d = ids[i + 1][j];
      if (side > 0) { L.tri(a, b, c); L.tri(a, c, d); } else { L.tri(a, c, b); L.tri(a, d, c); }
    }
  }
}
/** a filled convex polygon fan */
export function fan(L: Loft, pts: V3[], reg: Reg, out: V3) {
  const g = gid();
  const c = pts.reduce((s, p) => vadd(s, vscale(p, 1 / pts.length)), [0, 0, 0] as V3);
  const ci = L.vert(c, reg.x + reg.w / 2, reg.y + reg.h / 2, undefined, g);
  const ids = pts.map((p, i) => L.vert(p, reg.x + (0.5 + 0.5 * Math.cos((i / pts.length) * 6.28)) * reg.w, reg.y + (0.5 + 0.5 * Math.sin((i / pts.length) * 6.28)) * reg.h, undefined, g));
  for (let i = 0; i < pts.length; i++) {
    const a = ids[i], b = ids[(i + 1) % pts.length];
    const n = cross(vsub(pts[i], c), vsub(pts[(i + 1) % pts.length], c));
    if (dot(n, out) >= 0) L.tri(ci, a, b); else L.tri(ci, b, a);
  }
}
/** Loft vertex colour channel -> custom float attribute (sway / flutter weights) */
export function weightsToAttr(geo: THREE.BufferGeometry, name = 'aW') {
  const c = geo.getAttribute('color') as THREE.BufferAttribute;
  const w = new Float32Array(c.count);
  for (let i = 0; i < c.count; i++) w[i] = c.getX(i);
  geo.setAttribute(name, new THREE.BufferAttribute(w, 1));
  geo.deleteAttribute('color');
  return geo;
}

// ------------------------------------------------------------------ boats
export interface HullOpts { len: number; beam: number; depth: number; paint: Reg; open?: boolean; th?: number; transom?: number; bowRise?: number; pointed?: boolean; deck?: Reg; inner?: Reg }
/** a lofted hull along +x (bow at +x), gunwale at y = 0; open hulls get a real interior pocket + thwarts */
export function hull(L: Loft, o: HullOpts): { sheer: (t: number) => number; half: (t: number) => number } {
  const NS = 16, M = 12;
  const th = o.th ?? Math.max(0.012, o.beam * 0.05);
  const tr = o.transom ?? 0.7;
  const half = (t: number) => {
    const bow = Math.pow(Math.max(0, 1 - Math.pow(Math.max(0, (t - 0.42) / 0.58), 1.7)), 0.72);
    const stern = o.pointed ? Math.pow(Math.max(0, 1 - Math.pow(Math.max(0, (0.5 - t) / 0.5), 1.7)), 0.72) : tr + (1 - tr) * Math.sin(Math.min(1, t / 0.4) * Math.PI / 2);
    return (o.beam / 2) * Math.min(bow, stern);
  };
  const rise = o.bowRise ?? 0.08;
  const sheer = (t: number) => rise * Math.pow(t, 3) * (o.len / 1.2) + (o.pointed ? rise * Math.pow(1 - t, 3) * (o.len / 1.2) : 0.015 * (1 - t));
  const keel = (t: number) => o.depth * (1 - 0.55 * Math.pow(t, 4)) * (o.pointed ? 1 - 0.55 * Math.pow(1 - t, 4) : 1);
  const sec = (t: number, j: number, inset: number, env = 1): V3 => {
    const a = (j / M) * Math.PI, s = Math.sin(a), c = Math.cos(a);
    const b = Math.max(0, half(t) - inset) * env, d = Math.max(0.002, (keel(t) - inset) * Math.sqrt(env));
    return [-o.len / 2 + t * o.len, sheer(t) - d * Math.pow(s, 0.55), b * Math.sign(c) * Math.pow(Math.abs(c), 0.85)];
  };
  const ts = Array.from({ length: NS + 1 }, (_, i) => i / NS);
  const axis = (p: V3): V3 => [p[0] - Math.max(-o.len / 2 + 0.05, Math.min(o.len / 2 - 0.1, p[0])), p[1] - (-o.depth * 0.45), p[2]];
  const outer = ts.map((t) => Array.from({ length: M + 1 }, (_, j) => sec(t, j, 0)));
  surf(L, outer, (i, j) => [ts[i], Math.pow(Math.sin((j / M) * Math.PI), 0.55)], o.paint, axis);
  // transom
  if (!o.pointed) fan(L, outer[0].slice(0, M + 1), o.inner ?? A.hullIn, [-1, 0, 0]);
  const deckR = o.deck ?? A.deck;
  if (o.open) {
    const env = (t: number) => Math.min(1, Math.max(0, (t - 0.04) / 0.14), Math.max(0, (0.93 - t) / 0.14));
    const inner = ts.map((t) => Array.from({ length: M + 1 }, (_, j) => sec(t, j, th, env(t))));
    surf(L, inner, (i, j) => [ts[i], j / M], o.inner ?? A.hullIn, (p) => vscale(axis(p), -1));
    // gunwale rims (and the small end decks where the pocket closes)
    for (const j of [0, M]) surf(L, [outer.map((r) => r[j]), inner.map((r) => r[j])], (i, k) => [k * 0.2, ts[i]], deckR, () => [0, 1, 0]);
    // thwarts
    for (const t of [0.3, 0.62]) {
      const x = -o.len / 2 + t * o.len, w = (half(t) - th) * 2, y = sheer(t) - keel(t) * 0.42;
      box(L, [x, y, 0], [o.len * 0.07, 0.014, w], deckR);
    }
  } else {
    surf(L, ts.map((_, i) => [outer[i][0], outer[i][M]]), (i, k) => [ts[i], k], deckR, () => [0, 1, 0]);
  }
  return { sheer, half };
}

// ------------------------------------------------------------------ people
export interface PersonOpts { skin?: number; shirt?: number; pants?: number; hat?: number; hatKind?: 'bucket' | 'cap' | 'beanie' | 'captain' | 'none'; sit?: boolean; rod?: boolean; s?: number; rodLen?: number; beard?: boolean }
/** a small angler facing +x; returns the rod tip (local) */
export function angler(L: Loft, o: PersonOpts = {}): V3 {
  const from = L.count;
  const skin = A.skin[o.skin ?? 0], shirt = A.shirt[o.shirt ?? 0], pants = A.pants[o.pants ?? 0];
  const hip = o.sit ? 0.035 : 0.2;
  if (o.sit) {
    for (const z of [-0.035, 0.035]) {
      rod(L, [0, hip, z], [0.13, hip + 0.01, z * 1.2], 0.026, 0.022, 6, pants);
      rod(L, [0.13, hip + 0.01, z * 1.2], [0.15, hip - 0.13, z * 1.3], 0.021, 0.018, 6, pants);
      box(L, [0.17, hip - 0.15, z * 1.3], [0.06, 0.03, 0.035], A.boot);
    }
  } else {
    for (const z of [-0.035, 0.035]) {
      rod(L, [0, hip, z], [0.01, 0.04, z * 1.15], 0.027, 0.021, 6, pants);
      rod(L, [0.01, 0.045, z * 1.15], [0.015, 0.0, z * 1.15], 0.024, 0.026, 6, A.boot);
      box(L, [0.03, 0.012, z * 1.15], [0.07, 0.024, 0.038], A.boot);
    }
  }
  // torso: lofted rings, slightly pear shaped
  const tg = gid();
  const ty = [hip - 0.01, hip + 0.04, hip + 0.09, hip + 0.125, hip + 0.14];
  const tr = [[0.052, 0.068], [0.056, 0.072], [0.052, 0.074], [0.045, 0.07], [0.02, 0.03]];
  L.loft(ty.map((y, i) => ({ pts: ring([0, y, 0], [1, 0, 0], [0, 0, 1], tr[i][0], tr[i][1], tr[i][1], 10), v: i / 4 })), usFor(10), shirt, tg, { start: [0, hip - 0.015, 0], end: [0, hip + 0.145, 0] });
  // arms reaching forward to the rod grip
  const sh = hip + 0.12;
  const hand: V3 = [0.11, hip + 0.06, 0];
  for (const z of [-0.075, 0.075]) {
    const el: V3 = [0.05, hip + 0.05, z * 0.9];
    rod(L, [0, sh, z], el, 0.02, 0.017, 6, shirt);
    rod(L, el, [hand[0], hand[1], z * 0.25], 0.016, 0.015, 6, shirt);
    blob(L, [hand[0] + 0.005, hand[1], z * 0.22], 0.018, 0.018, 0.018, skin, 6);
  }
  // head + nose
  const hy = hip + 0.2;
  blob(L, [0.005, hy, 0], 0.048, 0.052, 0.046, skin, 10);
  blob(L, [0.048, hy - 0.005, 0], 0.012, 0.012, 0.012, skin, 6);
  if (o.beard) blob(L, [0.025, hy - 0.035, 0], 0.035, 0.03, 0.04, A.hat[3], 8, 0.2, 3);
  const hat = A.hat[o.hat ?? 0];
  switch (o.hatKind ?? 'bucket') {
    case 'bucket': lathe(L, [[0.075, hy + 0.025], [0.07, hy + 0.035], [0.05, hy + 0.04], [0.045, hy + 0.075], [0.0, hy + 0.08]], 12, hat, { capBot: true }); break;
    case 'cap': blob(L, [0, hy + 0.025, 0], 0.05, 0.035, 0.048, hat, 10); box(L, [0.055, hy + 0.02, 0], [0.06, 0.008, 0.06], hat); break;
    case 'beanie': blob(L, [0, hy + 0.03, 0], 0.05, 0.045, 0.05, hat, 10); blob(L, [0, hy + 0.08, 0], 0.016, 0.016, 0.016, hat, 6); break;
    case 'captain': lathe(L, [[0.06, hy + 0.03], [0.06, hy + 0.06], [0.07, hy + 0.075], [0.0, hy + 0.08]], 12, A.white, { capBot: true, capTop: false }); box(L, [0.055, hy + 0.03, 0], [0.05, 0.008, 0.07], A.black); break;
    default: break;
  }
  let tip: V3 = [0, 0, 0];
  if (o.rod !== false) {
    const len = o.rodLen ?? 0.75;
    tip = [hand[0] + len * 0.78, hand[1] + len * 0.6, 0];
    rod(L, [hand[0] - 0.08, hand[1] - 0.06, 0], tip, 0.008, 0.003, 5, A.rod);
    box(L, [hand[0] + 0.01, hand[1] - 0.025, 0.012], [0.025, 0.025, 0.02], A.metal);
  }
  const s = o.s ?? 1;
  if (s !== 1) { place(L, from, [0, 0, 0], 0, s); tip = vscale(tip, s); }
  return tip;
}

// ------------------------------------------------------------------ palms (instanced; trunk + crown built separately)
export function palmGeometry(seed: number): { trunk: THREE.BufferGeometry; crown: THREE.BufferGeometry } {
  const r = new Rng(seed);
  const H = r.range(0.95, 1.35), lean = r.range(0.12, 0.38), wig = r.range(-0.08, 0.08);
  const T = new Loft();
  const path: V3[] = [];
  for (let i = 0; i <= 10; i++) { const t = i / 10; path.push([lean * Math.pow(t, 1.7) + Math.sin(t * 3.1) * wig, H * t, Math.sin(t * 2.3) * wig * 0.6]); }
  T.tube(path, (t) => 0.05 * (1 - t * 0.35) + 0.035 * Math.pow(1 - t, 6), 8, A.bark, gid(), { capEnd: true });
  const top = path[path.length - 1];
  for (let k = 0; k < 3; k++) { const a = k * 2.1 + r.next(); blob(T, [top[0] + Math.cos(a) * 0.035, top[1] - 0.03, top[2] + Math.sin(a) * 0.035], 0.028, 0.03, 0.028, A.darkWood, 6); }
  const trunk = T.build();
  const Cr = new Loft();
  const nf = r.int(8, 10);
  for (let f = 0; f < nf; f++) {
    const a = (f / nf) * Math.PI * 2 + r.range(-0.2, 0.2);
    const len = r.range(0.5, 0.72) * (f % 3 === 0 ? 0.8 : 1);
    const upK = r.range(0.06, 0.2), droop = r.range(0.32, 0.5);
    const dir: V3 = [Math.cos(a), 0, Math.sin(a)], side: V3 = [-Math.sin(a), 0, Math.cos(a)];
    const N = 9;
    const grid: V3[][] = [[], [], []];
    for (let j = 0; j < N; j++) {
      const s = j / (N - 1);
      const mid: V3 = [top[0] + dir[0] * len * s, top[1] + upK * s - droop * Math.pow(s, 2.1) * len, top[2] + dir[2] * len * s];
      const hw = 0.15 * Math.pow(Math.sin(Math.min(1, s * 1.08 + 0.04) * Math.PI), 0.7) * (len / 0.65);
      for (let i = 0; i < 3; i++) {
        const k = i - 1;
        grid[i].push([mid[0] + side[0] * hw * k, mid[1] - Math.abs(k) * hw * 0.35, mid[2] + side[2] * hw * k]);
      }
    }
    membrane(Cr, grid, F.frond, (_i, j) => j / (N - 1));
  }
  const crown = weightsToAttr(Cr.build());
  // the trunk sways too (no flutter)
  trunk.setAttribute('aW', new THREE.BufferAttribute(new Float32Array(trunk.getAttribute('position').count), 1));
  trunk.deleteAttribute('color');
  return { trunk, crown };
}

// ------------------------------------------------------------------ structures
/** a hut on stilts: platform at y = deckY (water at 0), facing +x; returns the door position */
export function stiltHut(L: Loft, seed: number, deckY = 0.24) {
  const r = new Rng(seed);
  const w = 0.78, d = 0.64;
  for (const [x, z] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2], [0, -d / 2], [0, d / 2]]) rod(L, [x, -1.4, z], [x, deckY, z], 0.022, 0.02, 6, A.post);
  box(L, [0, deckY + 0.012, 0], [w + 0.1, 0.024, d + 0.1], A.deck);
  // walls
  const wh = 0.36, ww = 0.52, wd = 0.42;
  box(L, [-0.06, deckY + 0.024 + wh / 2, 0], [ww, wh, wd], r.chance(0.5) ? A.wallWin : A.wallDoor);
  box(L, [-0.06 + ww / 2 + 0.002, deckY + 0.024 + wh / 2, 0], [0.004, wh * 0.95, wd * 0.95], A.wallDoor);
  // gable roof with overhang
  const ry = deckY + 0.024 + wh, ov = 0.08, peak = 0.22;
  const x0 = -0.06 - ww / 2 - ov, x1 = -0.06 + ww / 2 + ov, z0 = -wd / 2 - ov, z1 = wd / 2 + ov;
  for (const s of [-1, 1]) surf(L, [[[x0, ry, s > 0 ? z1 : z0], [x0, ry + peak, 0]], [[x1, ry, s > 0 ? z1 : z0], [x1, ry + peak, 0]]], (i, j) => [i, j], A.thatch, () => [0, 1, s * 0.8]);
  for (const x of [-0.06 - ww / 2, -0.06 + ww / 2]) fan(L, [[x, ry, -wd / 2], [x, ry, wd / 2], [x, ry + peak * 0.82, 0]], A.wallWin, [Math.sign(x + 0.06), 0, 0]);
  // ladder down to the water
  for (const z of [-0.06, 0.06]) rod(L, [w / 2 + 0.06, deckY, z], [w / 2 + 0.12, -0.25, z], 0.008, 0.008, 4, A.post);
  for (let k = 0; k < 4; k++) { const t = k / 4; rod(L, [w / 2 + 0.06 + t * 0.06, deckY - t * (deckY + 0.25) - 0.04, -0.06], [w / 2 + 0.06 + t * 0.06, deckY - t * (deckY + 0.25) - 0.04, 0.06], 0.006, 0.006, 4, A.post, false); }
  // lantern + crate + net
  rod(L, [w / 2 - 0.02, deckY, -d / 2 + 0.02], [w / 2 - 0.02, deckY + 0.34, -d / 2 + 0.02], 0.007, 0.007, 4, A.darkWood);
  box(L, [w / 2 - 0.02, deckY + 0.3, -d / 2 + 0.02], [0.04, 0.05, 0.04], A.lamp);
  box(L, [w / 2 - 0.1, deckY + 0.06, d / 2 - 0.08], [0.09, 0.07, 0.09], A.crate);
  return { door: [-0.06 + ww / 2 + 0.05, deckY, 0] as V3, deck: deckY };
}

/** lighthouse tower on a rock (base at y = 0), returns the lantern height */
export function lighthouse(L: Loft): number {
  lathe(L, [[0.3, -0.1], [0.3, 0.06], [0.26, 0.1]], 14, A.brick, { capTop: true });
  const H = 1.55;
  const prof: [number, number][] = [];
  for (let i = 0; i <= 8; i++) { const t = i / 8; prof.push([0.21 - 0.07 * t, 0.08 + t * H]); }
  lathe(L, prof, 16, A.lhouse);
  // gallery + railing
  lathe(L, [[0.12, H + 0.06], [0.22, H + 0.08], [0.22, H + 0.11], [0.0, H + 0.11]], 16, A.darkWood, { capBot: true });
  for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; rod(L, [Math.cos(a) * 0.2, H + 0.11, Math.sin(a) * 0.2], [Math.cos(a) * 0.2, H + 0.2, Math.sin(a) * 0.2], 0.005, 0.005, 3, A.black, false); }
  lathe(L, [[0.205, H + 0.195], [0.205, H + 0.205]], 16, A.black);
  // lantern room + dome + spire
  lathe(L, [[0.11, H + 0.11], [0.11, H + 0.27]], 12, A.glass);
  lathe(L, [[0.135, H + 0.27], [0.13, H + 0.31], [0.06, H + 0.37], [0.0, H + 0.39]], 12, A.redPaint, { capBot: true });
  rod(L, [0, H + 0.38, 0], [0, H + 0.48, 0], 0.008, 0.002, 4, A.black);
  box(L, [0.19, 0.2, 0], [0.04, 0.2, 0.11], A.darkWood);
  for (const y of [0.6, 1.05]) box(L, [0.16 - y * 0.035, y, 0], [0.03, 0.08, 0.06], A.glass);
  return H + 0.19;
}

/** a wooden pier from (0,0,0) along +x of length len, deck at y = deckY */
export function pier(L: Loft, len: number, seed: number, deckY = 0.16, width = 0.36) {
  const r = new Rng(seed);
  const n = Math.max(3, Math.round(len / 0.11));
  for (let i = 0; i < n; i++) {
    const x = (i + 0.5) * (len / n);
    box(L, [x, deckY + r.range(-0.004, 0.004), 0], [len / n - 0.012, 0.022, width * r.range(0.95, 1.05)], A.deck, r.range(-0.03, 0.03));
  }
  for (const z of [-width / 2 + 0.02, width / 2 - 0.02]) box(L, [len / 2, deckY - 0.025, z], [len, 0.03, 0.03], A.post);
  for (let x = 0.05; x < len; x += 0.42) for (const z of [-width / 2, width / 2]) rod(L, [x, -1.8, z], [x, deckY + 0.05, z], 0.022, 0.02, 6, A.post);
  // end posts + bollard + lamp
  for (const z of [-width / 2, width / 2]) rod(L, [len - 0.02, -1.8, z], [len - 0.02, deckY + 0.12, z], 0.026, 0.024, 6, A.post);
  lathe(L, [[0.022, deckY], [0.025, deckY + 0.04], [0.032, deckY + 0.05], [0.0, deckY + 0.055]], 8, A.black, { capBot: true });
  rod(L, [len - 0.08, deckY, -width / 2 + 0.03], [len - 0.08, deckY + 0.42, -width / 2 + 0.03], 0.008, 0.007, 5, A.black);
  box(L, [len - 0.08, deckY + 0.43, -width / 2 + 0.03], [0.045, 0.06, 0.045], A.lamp);
  if (r.chance(0.7)) box(L, [len * 0.4, deckY + 0.05, width * 0.25], [0.09, 0.08, 0.09], A.crate, r.range(0, 1));
  if (r.chance(0.6)) barrel(L, [len * 0.6, deckY + 0.011, -width * 0.22], 0.045, 0.1);
}

export function barrel(L: Loft, at: V3, r = 0.05, h = 0.12) {
  const from = L.count;
  lathe(L, [[r * 0.85, 0], [r, h * 0.3], [r * 1.04, h * 0.5], [r, h * 0.7], [r * 0.85, h]], 10, A.barrel, { capBot: true, capTop: true });
  place(L, from, at);
}
export function crate(L: Loft, at: V3, s = 0.09, rotY = 0) { box(L, [at[0], at[1] + s / 2, at[2]], [s, s, s], A.crate, rotY); }

/** beach umbrella + deck chair, chair facing +x */
export function beachSet(L: Loft, seed: number) {
  const r = new Rng(seed);
  rod(L, [-0.1, -0.05, 0.12], [-0.08, 0.55, 0.1], 0.007, 0.007, 4, A.white);
  const top: V3 = [-0.08, 0.55, 0.1];
  const N = 10, R0 = 0.32;
  const cone: V3[][] = [[], []];
  for (let k = 0; k <= N; k++) { const a = (k / N) * Math.PI * 2; cone[0].push([top[0], top[1] + 0.06, top[2]]); cone[1].push([top[0] + Math.cos(a) * R0, top[1] - 0.04, top[2] + Math.sin(a) * R0]); }
  surf(L, cone, (i, j) => [j / N, i], A.umbrella, (p) => [p[0] - top[0], 0.6, p[2] - top[2]]);
  surf(L, [cone[1], cone[0]], (i, j) => [j / N, i], A.white, (p) => [-(p[0] - top[0]), -0.6, -(p[2] - top[2])]);
  // deck chair
  box(L, [0.02, 0.05, -0.05], [0.18, 0.012, 0.13], A.canvas, 0);
  const from = L.count;
  box(L, [0, 0, 0], [0.13, 0.012, 0.13], A.canvas);
  place(L, from, [-0.1, 0.11, -0.05], 0, 1, 0, -1.0);
  for (const z of [-0.11, 0.01]) rod(L, [-0.07, -0.03, z], [0.1, 0.05, z], 0.005, 0.005, 3, A.darkWood);
  if (r.chance(0.5)) box(L, [0.15, -0.0, 0.1], [0.08, 0.05, 0.06], A.redPaint);
}

/** a cone tent on the ice */
export function tent(L: Loft) {
  const N = 9;
  const P: V3[][] = [[], []];
  for (let k = 0; k <= N; k++) { const a = (k / N) * Math.PI * 2; P[0].push([Math.cos(a) * 0.2, 0, Math.sin(a) * 0.2]); P[1].push([0, 0.34, 0]); }
  surf(L, P, (i, j) => [j / N, 1 - i], A.awning, (p) => [p[0], 0.4, p[2]]);
  rod(L, [0, 0.3, 0], [0.02, 0.42, 0], 0.005, 0.004, 3, A.darkWood);
}

/** hermit crab shop: a big spiral shell (opening toward +x) with a striped awning stall */
export function crabShop(L: Loft) {
  const from = L.count;
  // the shell: a cone of shrinking rings twisting upward
  const rings: { pts: V3[]; v: number }[] = [];
  const N = 22;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const rr = 0.3 * Math.pow(1 - t, 0.9) + 0.004;
    const a = t * Math.PI * 3.2;
    const c: V3 = [-0.05 + Math.cos(a) * 0.06 * (1 - t) - t * 0.12, 0.16 + t * 0.48, Math.sin(a) * 0.06 * (1 - t)];
    rings.push({ pts: ring(c, [1, 0, 0], [0, 0, 1], rr, rr * 0.9, rr * 0.9, 14), v: t });
  }
  L.loft(rings, usFor(14), A.shell, gid(), { start: [0.05, 0.08, 0], end: [-0.17, 0.66, 0] });
  // lip of the opening
  lathe(L, [[0.16, 0], [0.22, 0.03], [0.2, 0.08]], 12, A.cream);
  place(L, from, [0, 0, 0], 0, 1.1);
  // stall: awning on two posts, counter with goods
  for (const z of [-0.22, 0.22]) rod(L, [0.32, 0, z], [0.32, 0.36, z], 0.008, 0.008, 4, A.darkWood);
  surf(L, [[[0.18, 0.4, -0.27], [0.18, 0.4, 0.27]], [[0.42, 0.32, -0.27], [0.42, 0.32, 0.27]]], (i, j) => [j, i], A.awning, () => [0.3, 1, 0]);
  box(L, [0.32, 0.07, 0], [0.12, 0.14, 0.38], A.crate);
  for (let k = 0; k < 4; k++) blob(L, [0.32, 0.16, -0.13 + k * 0.085], 0.025, 0.02, 0.025, k % 2 ? A.coral : A.gold, 6);
}

/** the hermit crab merchant itself (peeking from the shell, claws up) */
export function crab(L: Loft) {
  blob(L, [0, 0.07, 0], 0.11, 0.07, 0.12, A.crab, 10, 0.1, 2);
  for (const s of [-1, 1]) {
    rod(L, [0.04, 0.1, s * 0.04], [0.07, 0.2, s * 0.05], 0.008, 0.007, 4, A.crab);
    blob(L, [0.07, 0.21, s * 0.05], 0.022, 0.022, 0.022, A.black, 6);
    blob(L, [0.078, 0.215, s * 0.055], 0.008, 0.008, 0.008, A.white, 4);
    rod(L, [0.06, 0.08, s * 0.1], [0.15, 0.16, s * 0.16], 0.02, 0.016, 6, A.crab);
    blob(L, [0.19, 0.18, s * 0.17], 0.06, 0.04, 0.035, A.crab, 8, 0.15, 5);
    for (let k = 0; k < 3; k++) rod(L, [-0.02 + k * 0.04, 0.05, s * 0.1], [-0.02 + k * 0.05, -0.02, s * 0.2], 0.008, 0.006, 4, A.crab);
  }
}

/** a sea turtle floating at the surface, facing +x (shell top ~ y 0.05) */
export function turtle(L: Loft, s = 1) {
  const from = L.count;
  blob(L, [0, 0.0, 0], 0.32, 0.12, 0.26, A.turtle, 14, 0.04, 9);
  blob(L, [0, -0.04, 0], 0.3, 0.06, 0.24, A.turtleSkin, 12);
  blob(L, [0.36, 0.01, 0], 0.09, 0.07, 0.075, A.turtleSkin, 10);
  for (const z of [-0.035, 0.035]) blob(L, [0.42, 0.04, z], 0.014, 0.014, 0.014, A.black, 5);
  for (const sz of [-1, 1]) {
    const f = L.count;
    blob(L, [0, 0, 0], 0.2, 0.025, 0.07, A.turtleSkin, 8);
    place(L, f, [0.14, -0.03, sz * 0.3], sz * 0.6);
    const b = L.count;
    blob(L, [0, 0, 0], 0.12, 0.02, 0.05, A.turtleSkin, 8);
    place(L, b, [-0.22, -0.04, sz * 0.22], sz * -0.5);
  }
  place(L, from, [0, 0, 0], 0, s);
}

/** a sunken wreck lying on the seabed (keel at y = 0), mast stub sticking up by `mast` metres */
export function wreck(L: Loft, seed: number, mast = 2.2): V3 {
  const r = new Rng(seed);
  const from = L.count;
  hull(L, { len: 2.4, beam: 0.8, depth: 0.5, paint: A.hull[5], open: true, inner: A.darkWood, deck: A.darkWood, bowRise: 0.12 });
  place(L, from, [0, 0.5, 0], 0, 1, 0, r.range(0.25, 0.4));
  // broken ribs sticking out
  for (let k = 0; k < 5; k++) { const x = -0.8 + k * 0.32; rod(L, [x, 0.25, 0.38], [x + r.range(-0.05, 0.05), 0.55 + r.range(0, 0.2), 0.5], 0.018, 0.012, 4, A.darkWood); }
  const base: V3 = [0.15, 0.5, 0.05];
  const top: V3 = [0.3, 0.5 + mast, 0.2];
  rod(L, base, top, 0.035, 0.025, 6, A.darkWood);
  rod(L, vadd(base, [0.02, mast * 0.7, 0.03]), vadd(base, [-0.25, mast * 0.66, 0.02]), 0.015, 0.012, 4, A.darkWood);
  barrel(L, [-0.9, 0, -0.5], 0.08, 0.18);
  box(L, [0.9, 0.06, -0.45], [0.18, 0.12, 0.14], A.chest, 0.6);
  return top;
}

/** a message bottle (lying along +x) */
export function bottle(L: Loft, s = 1) {
  const from = L.count;
  lathe(L, [[0.0, -0.12], [0.06, -0.115], [0.065, -0.05], [0.064, 0.04], [0.035, 0.08], [0.022, 0.1], [0.022, 0.135]], 12, A.bottle, { capBot: true });
  lathe(L, [[0.024, 0.13], [0.026, 0.17], [0.0, 0.172]], 8, A.cork, { capBot: true });
  rod(L, [0, -0.08, 0], [0, 0.04, 0], 0.03, 0.03, 8, A.parchment);
  place(L, from, [0, 0, 0], 0, s, 0, -Math.PI / 2 + 0.25);
}

/** treasure chest, lid slightly open */
export function chest(L: Loft, s = 1) {
  const from = L.count;
  box(L, [0, 0.05, 0], [0.18, 0.1, 0.12], A.chest);
  const lid = L.count;
  lathe(L, [[0.0, -0.09], [0.06, -0.09], [0.06, 0.09], [0.0, 0.09]], 10, A.chest, { capBot: false });
  place(L, lid, [0, 0, 0], 0, [1, 1, 1], 0, Math.PI / 2);
  place(L, lid, [-0.06, 0.1, 0], 0, [1, 0.6, 1], 0, -0.5);
  blob(L, [0.0, 0.11, 0], 0.07, 0.02, 0.045, A.gold, 8);
  place(L, from, [0, 0, 0], 0, s);
}

/** cleaner station: a coral bommie with tiny striped shrimp */
export function cleaner(L: Loft, seed: number) {
  const r = new Rng(seed);
  blob(L, [0, 0.0, 0], 0.4, 0.35, 0.36, A.stone, 12, 0.25, seed);
  for (let k = 0; k < 6; k++) blob(L, [r.range(-0.3, 0.3), 0.25 + r.range(0, 0.1), r.range(-0.3, 0.3)], 0.08, 0.06, 0.08, k % 2 ? A.coral : A.moss, 8, 0.3, k);
  for (let k = 0; k < 5; k++) {
    const a = r.range(0, 6.28), y = r.range(0.1, 0.35);
    const from = L.count;
    rod(L, [0, 0, 0], [0.07, 0.01, 0], 0.012, 0.004, 5, A.redPaint);
    rod(L, [0.07, 0.01, 0], [0.11, 0.05, 0.02], 0.002, 0.001, 3, A.white, false);
    place(L, from, [Math.cos(a) * 0.38, y, Math.sin(a) * 0.38], -a);
  }
}

/** a mooring / judge buoy with a gold trophy */
export function trophyBuoy(L: Loft) {
  lathe(L, [[0.0, -0.1], [0.12, -0.08], [0.14, 0.0], [0.12, 0.08], [0.0, 0.1]], 12, A.buoyYB);
  rod(L, [0, 0.09, 0], [0, 0.18, 0], 0.012, 0.012, 5, A.black);
  lathe(L, [[0.03, 0.18], [0.035, 0.2], [0.012, 0.22], [0.012, 0.25], [0.05, 0.29], [0.055, 0.33], [0.0, 0.33]], 10, A.gold, { capBot: true });
  for (const s of [-1, 1]) rod(L, [0, 0.3, s * 0.05], [0, 0.28, s * 0.075], 0.006, 0.006, 3, A.gold);
}

/** a string of tournament pennants between two points (sagging) */
export function bunting(L: Loft, a: V3, b: V3, n = 9, seed = 1) {
  const r = new Rng(seed);
  const pts: V3[] = [];
  for (let i = 0; i <= n; i++) { const t = i / n; pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - Math.sin(t * Math.PI) * 0.12, a[2] + (b[2] - a[2]) * t]); }
  L.tube(pts, () => 0.003, 3, A.rope, gid());
  const dir = norm(vsub(b, a));
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[i + 1];
    const m: V3 = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2];
    const reg = A.pennant[r.int(0, 3)];
    const w = 0.035;
    fan(L, [vadd(m, vscale(dir, -w)), vadd(m, vscale(dir, w)), vadd(m, [0, -0.08, 0])], reg, cross(dir, [0, 1, 0]));
    fan(L, [vadd(m, vscale(dir, -w)), vadd(m, vscale(dir, w)), vadd(m, [0, -0.08, 0])], reg, vscale(cross(dir, [0, 1, 0]), -1));
  }
}

// ------------------------------------------------------------------ rocks, coral, kelp (instanced pieces)
export function rockGeometry(seed: number): THREE.BufferGeometry {
  const r = new Rng(seed);
  const g = new THREE.IcosahedronGeometry(1, 3);
  const pa = g.getAttribute('position') as THREE.BufferAttribute;
  const ph = [r.range(0, 9), r.range(0, 9), r.range(0, 9)];
  const sx = r.range(0.85, 1.3), sz = r.range(0.75, 1.15), sy = r.range(0.55, 0.95);
  const v = new THREE.Vector3();
  for (let i = 0; i < pa.count; i++) {
    v.fromBufferAttribute(pa, i);
    const n = Math.sin(v.x * 3.1 + ph[0]) * Math.sin(v.y * 2.7 + ph[1]) * Math.sin(v.z * 3.3 + ph[2]);
    const facet = Math.round((n * 0.5 + 0.5) * 4) / 4;
    let k = 1 + facet * 0.22 + Math.sin(v.x * 7 + v.z * 5 + ph[0]) * 0.04;
    if (v.y < -0.3) k *= 0.9;
    v.multiplyScalar(k);
    v.set(v.x * sx, Math.max(v.y * sy, -0.5 * sy), v.z * sz);
    pa.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  // box-projected uvs
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const na = g.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i < pa.count; i++) {
    const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i);
    const ax = Math.abs(na.getX(i)), ay = Math.abs(na.getY(i)), az = Math.abs(na.getZ(i));
    if (ay > ax && ay > az) uv.setXY(i, x * 0.5, z * 0.5); else if (ax > az) uv.setXY(i, z * 0.5, y * 0.5); else uv.setXY(i, x * 0.5, y * 0.5);
  }
  return g;
}

export function kelpGeometry(seed: number): THREE.BufferGeometry {
  // unit height stalk (y 0..1) with alternating blades and a floating canopy at the top
  const r = new Rng(seed);
  const L = new Loft();
  const path: V3[] = [];
  for (let i = 0; i <= 8; i++) { const t = i / 8; path.push([Math.sin(t * 4 + seed) * 0.05, t * 0.98, Math.cos(t * 3 + seed) * 0.04]); }
  L.tube(path, () => 0.012, 4, A.moss, gid());
  for (let k = 0; k < 7; k++) {
    const t = 0.15 + k * 0.12, p = path[Math.min(8, Math.round(t * 8))];
    const a = k * 2.4 + r.next();
    const dir: V3 = [Math.cos(a), 0.9, Math.sin(a)], side: V3 = [-Math.sin(a), 0, Math.cos(a)];
    const len = r.range(0.16, 0.26), hw = 0.035;
    const grid: V3[][] = [0, 1, 2].map((i) => [0, 1, 2, 3].map((j): V3 => { const s = j / 3; return [p[0] + dir[0] * len * s + side[0] * hw * (i - 1), p[1] + dir[1] * len * s * 0.5 + side[1], p[2] + dir[2] * len * s + side[2] * hw * (i - 1)]; }));
    membrane(L, grid, F.kelp, () => 1);
  }
  // canopy fronds floating on the surface
  for (let k = 0; k < 4; k++) {
    const a = k * 1.6 + r.next(), len = r.range(0.22, 0.36);
    const dir: V3 = [Math.cos(a), 0, Math.sin(a)], side: V3 = [-Math.sin(a), 0, Math.cos(a)];
    const grid: V3[][] = [0, 1, 2].map((i) => [0, 1, 2, 3].map((j): V3 => { const s = j / 3; return [dir[0] * len * s + side[0] * 0.05 * (i - 1), 1.0 + Math.sin(s * 3) * 0.004, dir[2] * len * s + side[2] * 0.05 * (i - 1)]; }));
    membrane(L, grid, F.kelp, () => 1);
  }
  const g = L.build();
  g.deleteAttribute('color');
  return g;
}
