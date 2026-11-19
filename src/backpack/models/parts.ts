// Shared compound parts for the loot models: hooks, shells, coins, cut gems, rope coils, bottles, pages for outlines.
import * as THREE from 'three';
import { B, mat, tube, surf, hull, cyl, lathe, warp, ext, TAU, type V2, type V3 } from './kit';
import { tx, PAL, tc, type Pal, type Pt, type UR } from './paint';
const hexOf = (p: Pal, t: number) => tc(p, t);

/** map model-space outline points to page pixels exactly the way boxUV fits the front (pz) face */
export function pageMap(outline: V2[], W: number, H: number) {
  const xs = outline.map((p) => p[0]), ys = outline.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const f = (p: V2): V2 => [((p[0] - x0) / (x1 - x0)) * W, ((y1 - p[1]) / (y1 - y0)) * H];
  return Object.assign(f, { poly: (pts: V2[]) => pts.map(f) });
}

/** a fishing J-hook in the xy plane: eye at the top, shank, bend, point (with an exaggerated barb). Returns the tip. */
export function jHook(b: B, m: THREE.Material, mPoint: THREE.Material, o: { s?: number; pos?: V3; rot?: V3; r?: number; eye?: boolean } = {}) {
  const s = o.s ?? 1, r = o.r ?? 0.034;
  const k = b.sub(o.pos ?? [0, 0, 0], o.rot ?? [0, 0, 0], s);
  const path: V3[] = [[0.06, 0.36, 0], [0.06, 0.1, 0], [0.055, -0.13, 0], [0.0, -0.27, 0], [-0.12, -0.32, 0], [-0.23, -0.25, 0], [-0.27, -0.12, 0], [-0.27, 0.03, 0]];
  k.add(tube(path, (t) => (t < 0.8 ? r : r * Math.max(0.15, 1 - (t - 0.8) / 0.2)), { radial: 5, segs: 20 }), m);
  // the barb: a wedge cut back from the point toward the shank, bright where it was honed
  k.add(hull([[-0.26, 0.01, 0.026], [-0.26, 0.01, -0.026], [-0.26, -0.1, 0.026], [-0.26, -0.1, -0.026], [-0.14, -0.16, 0]]), mPoint);
  k.add(hull([[-0.29, 0.01, 0.012], [-0.29, 0.01, -0.012], [-0.25, 0.01, 0.012], [-0.25, 0.01, -0.012], [-0.27, 0.075, 0]]), mPoint);
  if (o.eye !== false) k.add(new THREE.TorusGeometry(0.06, r * 0.85, 4, 9), m, [0.06, 0.42, 0]);
  return k;
}

/** a treble hook hanging from a split ring (lures) */
export function treble(b: B, m: THREE.Material, pos: V3, s = 1) {
  const k = b.sub(pos, [0, 0.4, 0], s);
  k.add(new THREE.TorusGeometry(0.05, 0.012, 3, 8), m, [0, 0.05, 0]);
  k.add(cyl(0.012, 0.16, 4), m, [0, -0.06, 0]);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU;
    const pts: V3[] = [[0, -0.13, 0], [0, -0.17, 0], [0.04, -0.19, 0], [0.075, -0.15, 0], [0.075, -0.09, 0]];
    k.sub([0, 0, 0], [0, a, 0]).add(tube(pts, (t) => 0.012 * (t > 0.8 ? Math.max(0.2, 1 - (t - 0.8) * 4) : 1), { radial: 3, segs: 8 }), m);
  }
}

/**
 * a radially ribbed fan shell (cockle / scallop / clam valve) facing +z, hinge at the bottom (0, 0): `ribs` ridges,
 * scalloped rim, domed. Outer surface takes `outer` (u = across the fan, v = hinge to rim), the inside takes `inner`.
 */
export function fanShell(b: B, outer: THREE.Material, inner: THREE.Material, o: { R?: number; spread?: number; ribs?: number; dome?: number; rib?: number; scallop?: number; pos?: V3; rot?: V3; s?: V3 | number; nv?: number; uvO?: UR; uvI?: UR; open?: number; thick?: number } = {}) {
  const R = o.R ?? 0.62, sp = o.spread ?? 1.2, N = o.ribs ?? 9, dome = o.dome ?? 0.22, rib = o.rib ?? 0.03, sc = o.scallop ?? 0.05, nv = o.nv ?? 4;
  const nu = N * 2, th = o.thick ?? 0.03;
  const P = (u: number, v: number, inside: boolean): V3 => {
    const a = (u * 2 - 1) * sp, ridge = Math.cos(u * nu * Math.PI);
    const rr = R * (1 + sc * ridge) * (0.25 + 0.75 * v) * (1 - 0.12 * Math.pow(Math.abs(u * 2 - 1), 3));
    const zz = dome * (1 - Math.pow(v, 1.7)) * Math.cos(a * 0.75) + rib * ridge * v;
    return [Math.sin(a) * rr, Math.cos(a) * rr * 0.92, inside ? zz * 0.55 - th : zz];
  };
  const k = b.sub(o.pos ?? [0, 0, 0], o.rot ?? [0, 0, 0], o.s ?? 1);
  k.add(surf(nu, nv, (u, v) => P(u, v, false), { uv: o.uvO }), outer);
  k.add(surf(nu, nv, (u, v) => P(u, v, true), { uv: o.uvI, back: true }), inner);
  // the rim band joining the two
  k.add(surf(nu, 1, (u, v) => { const a = P(u, 1, false), c = P(u, 1, true); return [a[0] + (c[0] - a[0]) * v, a[1] + (c[1] - a[1]) * v, a[2] + (c[2] - a[2]) * v]; }, { uv: o.uvO }), outer);
  // hinge ears
  k.add(hull([[-0.2 * R, 0.05 * R, 0.08], [0.2 * R, 0.05 * R, 0.08], [-0.26 * R, 0.18 * R, 0.04], [0.26 * R, 0.18 * R, 0.04], [-0.14 * R, 0.2 * R, -0.02], [0.14 * R, 0.2 * R, -0.02], [0, 0.06 * R, -0.03]]), outer);
  return k;
}

/** a coin: an irregular hand-struck disc facing +z, face page on both sides, reeded rim */
export function coin(b: B, m: THREE.Material, face: UR, rim: UR, o: { r?: number; h?: number; pos?: V3; rot?: V3; n?: number; seed?: number } = {}) {
  const r = o.r ?? 0.36, h = o.h ?? 0.08, n = o.n ?? 14, sd = o.seed ?? 1;
  const g = warp(cyl(r, h, n, { ch: h * 0.22, side: rim, cap: face }), (p) => { const a = Math.atan2(p.z, p.x), k = 1 + 0.035 * Math.sin(a * 5 + sd) + 0.025 * Math.sin(a * 3 - sd); p.x *= k; p.z *= k; });
  b.add(g, m, o.pos ?? [0, 0, 0], [Math.PI / 2 + (o.rot?.[0] ?? 0), o.rot?.[1] ?? 0, o.rot?.[2] ?? 0]);
}

/** a brilliant-cut gem facing +z: table, crown, girdle, pavilion point (hull) */
export function brilliant(r: number, n = 8, o: { table?: number; crown?: number; pav?: number } = {}): THREE.BufferGeometry {
  const pts: V3[] = [];
  const tb = o.table ?? 0.55, cr = o.crown ?? 0.32, pv = o.pav ?? 0.9;
  for (let i = 0; i < n; i++) { const a = (i / n) * TAU + Math.PI / n; pts.push([Math.cos(a) * r * tb, Math.sin(a) * r * tb, r * cr]); }
  for (let i = 0; i < n * 2; i++) { const a = (i / (n * 2)) * TAU; for (const z of [0.03 * r, -0.03 * r]) pts.push([Math.cos(a) * r, Math.sin(a) * r, z]); }
  pts.push([0, 0, -r * pv]);
  return hull(pts);
}

/** an octagonal step-cut gem (emerald cut) facing +z */
export function stepCut(w: number, h: number, c: number, depth = 0.4): THREE.BufferGeometry {
  const pts: V3[] = [];
  const oct = (s: number, z: number) => { const W = w * s, H = h * s, C = c * s; pts.push([W - C, H, z], [W, H - C, z], [W, -H + C, z], [W - C, -H, z], [-W + C, -H, z], [-W, -H + C, z], [-W, H - C, z], [-W + C, H, z]); };
  oct(0.62, depth * 0.42); oct(0.84, depth * 0.3); oct(1, depth * 0.08); oct(1, -depth * 0.05); oct(0.72, -depth * 0.4);
  pts.push([w * 0.5, 0, -depth * 0.62], [-w * 0.5, 0, -depth * 0.62]);
  return hull(pts);
}

/** a coil of rope / line as stacked rings (wound spools, coiled rope) */
export function coil(b: B, m: THREE.Material, o: { R: number; r: number; turns: number; pitch: number; pos?: V3; rot?: V3; uv?: UR }) {
  const pts: V3[] = [];
  const n = Math.round(o.turns * 8);
  for (let i = 0; i <= n; i++) { const a = (i / 8) * TAU; pts.push([Math.cos(a) * o.R, (i / 8) * o.pitch, Math.sin(a) * o.R]); }
  b.add(tube(pts, o.r, { radial: 4, segs: n, uv: o.uv }), m, o.pos ?? [0, 0, 0], o.rot ?? [0, 0, 0]);
}

/** a glass bottle body (lathe), neck up: returns the neck top y */
export function bottleGeo(r: number, h: number, neck: number, n = 10): THREE.BufferGeometry {
  return lathe([[0, -h / 2], [r * 0.85, -h / 2], [r, -h / 2 + r * 0.2], [r, h / 2 - r * 1.1], [r * 0.45, h / 2 - r * 0.25], [neck, h / 2], [neck * 1.25, h / 2 + 0.02], [neck * 1.25, h / 2 + 0.07], [neck, h / 2 + 0.08], [0, h / 2 + 0.08]], n);
}

/** a cork stopper page + material (shared by every bottle / vial) */
export function corkMat() {
  const T = tx('corkStop', 16, 16, (p: Pt) => {
    p.all(PAL.sand, 3);
    for (let y = 1; y < 16; y += 3) for (let x = (y % 2) * 2; x < 16; x += 5) { p.t(x, y, PAL.sand, 1); p.t(x + 1, y, PAL.sand, 1.5); p.t(x, y + 1, PAL.sand, 4); }
    p.R(0, 0, 16, 1, PAL.sand, 4.5); p.R(0, 15, 16, 1, PAL.sand, 1.5);
  });
  return mat('corkStop', T, { rough: 0.95 });
}

/** a simple metal page (bevelled plate + polish + optional rivets / rust): the default for small metal parts */
export function metalPage(key: string, p0: Pal, o: { rust?: number; rivets?: boolean; w?: number; h?: number; b?: number } = {}) {
  const W = o.w ?? 32, H = o.h ?? 32;
  return tx('mp:' + key, W, H, (p) => {
    p.metal(0, 0, W, H, p0, { b: o.b ?? 3 });
    p.panel(0, 0, W, H, p0, o.b ?? 3, { noFill: true });
    for (let i = 0; i < (o.rust ?? 0); i++) p.rust(5 + ((i * 13) % (W - 8)), 6 + ((i * 11) % (H - 10)), 2.5 + (i % 3), i + 1);
    if (o.rivets) for (const [x, y] of [[2, 2], [W - 6, 2], [2, H - 6], [W - 6, H - 6]]) p.rivet(x, y, p0);
  });
}

/** the serrated shark tooth (white enamel crown, grey band, porous root), facing +z: geometry + material */
export const toothPart = (() => {
  let cache: { g: THREE.BufferGeometry; m: THREE.Material } | null = null;
  return () => {
    if (cache) return cache;

    const out: V2[] = [];
    const edge = (x0: number, y0: number, x1: number, y1: number, n: number, side: number) => {
      for (let i = 0; i < n; i++) { const t = i / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t; out.push([x, y]); const t2 = (i + 0.5) / n; out.push([x0 + (x1 - x0) * t2 + side * 0.026, y0 + (y1 - y0) * t2 + 0.014]); }
    };
    edge(-0.37, -0.08, 0.0, 0.44, 8, -1);
    out.push([0.03, 0.47]);
    edge(0.06, 0.44, 0.37, -0.08, 8, 1);
    const crownN = out.length;
    out.push([0.41, -0.17], [0.34, -0.37], [0.15, -0.3], [0.02, -0.23], [-0.12, -0.3], [-0.32, -0.38], [-0.41, -0.17]);
    const W = 40, H = 48, f = pageMap(out, W, H);
    const T = tx('tooth', W, H + 8, (p) => {
      p.all(PAL.sand, 2.5);
      p.poly(f.poly(out.slice(0, crownN)), hexOf(PAL.white, 4));
      p.poly(f.poly([[-0.37, -0.08], [0.0, 0.44], [0.03, 0.47], [0.03, -0.08]]), hexOf(PAL.white, 4.5));
      const [ax, ay] = f([0.03, 0.47]);
      p.ln(ax, ay + 3, ax - 1, ay + 26, PAL.white, 5); p.ln(ax + 1, ay + 5, ax, ay + 26, PAL.white, 3);
      for (let i = 0; i < crownN; i += 2) { const [x, y] = f(out[i]); p.t(x, y, PAL.white, 2.5); }
      const [, by] = f([0, -0.08]);
      for (let x = 0; x < W; x++) { const yy = by + Math.round(Math.abs(x - W / 2) * -0.25) + 1; p.R(x, yy, 1, 3, PAL.stone, 2); p.t(x, yy, PAL.stone, 3.5); }
      for (let y = by + 6; y < H; y += 3) for (let x = 6 + (y % 2) * 2; x < W - 6; x += 5) { p.t(x, y, PAL.sand, 1.5); p.t(x, y + 1, PAL.sand, 4); }
      p.glint(Math.round(ax - 7), Math.round(ay + 13), 1);
      p.R(0, H, W, 8, PAL.white, 3);
    });
        const g = warp(ext(out, 0.11, 0.03, { rects: { pz: T.r(0, 0, W, H), nz: T.r(0, 0, W, H), side: T.r(0, H, W, 8) } }), (v) => { v.z *= 1 - 0.5 * Math.abs(v.x) / 0.41; if (v.y > -0.08) v.z -= 0.12 * (v.y + 0.08) * (v.y + 0.08); });
    cache = { g, m: mat('tooth', T, { rough: 0.3 }) };
    return cache;
  };
})();
