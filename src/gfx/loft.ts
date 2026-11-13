// Lofted-ring mesh builder, ported from Limbophobia's SkinBuilder (src/limbo/entities/humanModel.ts) and
// generalised: any model (fish bodies, people, rods, the blobfish, props) is built by stacking
// superellipse cross-section rings and lofting between them. UVs map straight onto a region of a
// painted pixel texture page, so painters and geometry share one coordinate system.
//
// Improvements over the original: optional skin weights (static props skip them), per-vertex colour,
// arbitrary ring orientation (rings can follow a curved spine, not just a vertical axis), tube sweeps,
// fin/membrane sheets and a smooth-group seam weld that also welds poles.
//
//   const L = new Loft();
//   const rings = spine.map((s, i) => ({ pts: ring(s.pos, s.frame, rx, ry, 16), v: i / (n - 1) }));
//   L.loft(rings, usFor(16), { x: 0, y: 0, w: 1, h: 1 }, 0, { start: nosePoint, end: tailPoint });
//   const geo = L.build();
import * as THREE from 'three';

export type V3 = [number, number, number];
export type Wt = number[]; // [bone, w, bone, w, ...]
/** a UV region of the texture page, in 0..1 units (x, y from the top-left like the painter) */
export interface Reg { x: number; y: number; w: number; h: number }
export const FULL: Reg = { x: 0, y: 0, w: 1, h: 1 };

export interface Ring { pts: V3[]; v: number; w?: Wt | ((p: V3, j: number) => Wt); c?: number | ((p: V3, j: number) => number) }

export class Loft {
  P: number[] = []; UV: number[] = []; C: number[] = []; SI: number[] = []; SW: number[] = []; I: number[] = []; G: number[] = [];
  skinned: boolean;
  constructor(skinned = false) { this.skinned = skinned; }

  vert(p: V3, u: number, v: number, w: Wt | undefined, g: number, c = 1): number {
    this.P.push(p[0], p[1], p[2]);
    this.UV.push(u, 1 - v);
    this.C.push(c, c, c);
    this.G.push(g);
    if (this.skinned) {
      const ww = w || [0, 1];
      let tot = 0;
      const si = [0, 0, 0, 0], sw = [0, 0, 0, 0];
      for (let k = 0; k < 4 && k * 2 < ww.length; k++) { si[k] = ww[k * 2]; sw[k] = Math.max(0, ww[k * 2 + 1]); tot += sw[k]; }
      for (let k = 0; k < 4; k++) sw[k] = tot > 0 ? sw[k] / tot : k === 0 ? 1 : 0;
      this.SI.push(si[0], si[1], si[2], si[3]); this.SW.push(sw[0], sw[1], sw[2], sw[3]);
    }
    return this.P.length / 3 - 1;
  }
  tri(a: number, b: number, c: number) { this.I.push(a, b, c); }
  pos(i: number): V3 { return [this.P[i * 3], this.P[i * 3 + 1], this.P[i * 3 + 2]]; }

  /** a triangle wound so it faces away from `inside` */
  triOut(a: number, b: number, c: number, inside: V3, flip = false) {
    const A = this.pos(a), B = this.pos(b), C = this.pos(c);
    const n = cross(sub(B, A), sub(C, A));
    const m = sub(scale(add(add(A, B), C), 1 / 3), inside);
    if ((dot(n, m) >= 0) !== flip) this.tri(a, b, c); else this.tri(a, c, b);
  }

  /**
   * Loft through rings of equal point count (seam point duplicated at the end of each ring). us gives the u
   * coordinate per ring point; poles close either end. `alt` alternates quad diagonals so facets read as a
   * natural triangle mesh instead of horizontal stripes.
   */
  loft(rings: Ring[], us: number[], reg: Reg, g: number, o: { start?: V3 | null; end?: V3 | null; startV?: number; endV?: number; startW?: Wt; endW?: Wt; flip?: boolean; alt?: boolean; skip?: (j: number) => boolean } = {}): number[][] {
    const n = us.length;
    const cents = rings.map((r) => centroid(r.pts.slice(0, n - 1)));
    const idx: number[][] = rings.map((r) => r.pts.map((p, j) => {
      const w = typeof r.w === 'function' ? r.w(p, j) : r.w;
      const c = typeof r.c === 'function' ? r.c(p, j) : r.c ?? 1;
      return this.vert(p, reg.x + us[j] * reg.w, reg.y + (1 - r.v) * reg.h, w, g, c);
    }));
    for (let i = 0; i + 1 < idx.length; i++) {
      const ins = mid(cents[i], cents[i + 1]);
      for (let j = 0; j + 1 < n; j++) {
        if (o.skip?.(j)) continue;
        const a = idx[i][j], b = idx[i][j + 1], c = idx[i + 1][j + 1], d = idx[i + 1][j];
        const A = this.pos(a), B = this.pos(b), C = this.pos(c), D = this.pos(d);
        let nrm = cross(sub(B, A), sub(C, A));
        if (len(nrm) < 1e-12) nrm = cross(sub(C, A), sub(D, A));
        const out = dot(nrm, sub(mid(A, C), ins)) >= 0;
        const f = !!o.flip;
        if (o.alt && (i + j) & 1) { if (out !== f) { this.tri(a, b, d); this.tri(b, c, d); } else { this.tri(a, d, b); this.tri(b, d, c); } }
        else if (out !== f) { this.tri(a, b, c); this.tri(a, c, d); } else { this.tri(a, c, b); this.tri(a, d, c); }
      }
    }
    const all = centroid(cents);
    const pole = (P: V3, ring: number[], v: number, w: Wt | undefined, r: Ring) => {
      for (let j = 0; j + 1 < n; j++) {
        if (o.skip?.(j)) continue;
        const ww = w || (typeof r.w === 'function' ? r.w(r.pts[j], j) : r.w);
        const c = typeof r.c === 'function' ? r.c(r.pts[j], j) : r.c ?? 1;
        const pi = this.vert(P, reg.x + ((us[j] + us[j + 1]) / 2) * reg.w, reg.y + (1 - v) * reg.h, ww, g, c);
        this.triOut(pi, ring[j], ring[j + 1], all, !!o.flip);
      }
    };
    if (o.start) pole(o.start, idx[0], o.startV ?? rings[0].v, o.startW, rings[0]);
    if (o.end) pole(o.end, idx[idx.length - 1], o.endV ?? rings[rings.length - 1].v, o.endW, rings[rings.length - 1]);
    return idx;
  }

  /**
   * A double-sided membrane (fins, sails, leaves): grid of points pts[row][col], uv spanning the region.
   * Each side gets its own smoothing group so lighting works from both sides.
   */
  sheet(grid: V3[][], reg: Reg, g: number, w?: Wt, thickness = 0, c = 1) {
    const R = grid.length, Cn = grid[0].length;
    for (const side of [1, -1]) {
      const ids = grid.map((row, i) => row.map((p, j) => {
        const q: V3 = thickness ? [p[0], p[1], p[2] + side * thickness * 0.5] : p;
        return this.vert(q, reg.x + (j / (Cn - 1)) * reg.w, reg.y + (i / (R - 1)) * reg.h, w, g + (side > 0 ? 0 : 7000), c);
      }));
      for (let i = 0; i + 1 < R; i++) for (let j = 0; j + 1 < Cn; j++) {
        const a = ids[i][j], b = ids[i][j + 1], cc = ids[i + 1][j + 1], d = ids[i + 1][j];
        if (side > 0) { this.tri(a, b, cc); this.tri(a, cc, d); } else { this.tri(a, cc, b); this.tri(a, d, cc); }
      }
    }
  }

  /** tube swept along a polyline with per-point radius (rods, ropes, tentacles, toothpick sword) */
  tube(path: V3[], radius: (t: number) => number, sides: number, reg: Reg, g: number, o: { capStart?: boolean; capEnd?: boolean; w?: (t: number) => Wt; c?: number } = {}) {
    const frames = frenet(path);
    const us = usFor(sides);
    const rings: Ring[] = path.map((p, i) => {
      const t = i / (path.length - 1), r = radius(t), [, nn, bb] = frames[i];
      return { pts: us.map((u) => { const a = u * Math.PI * 2; return add(p, add(scale(nn, Math.cos(a) * r), scale(bb, Math.sin(a) * r))); }), v: t, w: o.w?.(t), c: o.c };
    });
    return this.loft(rings, us, reg, g, { start: o.capStart ? path[0] : null, end: o.capEnd ? path[path.length - 1] : null });
  }

  /** a box mapped to one region (flat shaded) */
  box(c: V3, size: V3, reg: Reg, w?: Wt, rot?: THREE.Matrix4 | null, col = 1) {
    const [hx, hy, hz] = [size[0] / 2, size[1] / 2, size[2] / 2];
    const corners: V3[] = [];
    const v = new THREE.Vector3();
    for (const z of [-hz, hz]) for (const y of [-hy, hy]) for (const x of [-hx, hx]) {
      v.set(x, y, z); if (rot) v.applyMatrix4(rot);
      corners.push([c[0] + v.x, c[1] + v.y, c[2] + v.z]);
    }
    const faces = [[0, 1, 3, 2], [5, 4, 6, 7], [4, 0, 2, 6], [1, 5, 7, 3], [2, 3, 7, 6], [4, 5, 1, 0]];
    for (const f of faces) {
      const ids = f.map((k, i) => this.vert(corners[k], reg.x + (i === 0 || i === 3 ? 0 : 1) * reg.w, reg.y + (i < 2 ? 1 : 0) * reg.h, w, -1, col));
      this.triOut(ids[0], ids[1], ids[2], c); this.triOut(ids[0], ids[2], ids[3], c);
    }
  }

  /** apply a transform to every vertex added since `from` (vertex index) */
  transformSince(from: number, m: THREE.Matrix4) {
    const v = new THREE.Vector3();
    for (let i = from; i < this.P.length / 3; i++) {
      v.set(this.P[i * 3], this.P[i * 3 + 1], this.P[i * 3 + 2]).applyMatrix4(m);
      this.P[i * 3] = v.x; this.P[i * 3 + 1] = v.y; this.P[i * 3 + 2] = v.z;
    }
  }
  get count() { return this.P.length / 3; }

  build(): THREE.BufferGeometry {
    const nv = this.P.length / 3;
    const N = new Float32Array(nv * 3);
    for (let t = 0; t < this.I.length; t += 3) {
      const a = this.I[t], b = this.I[t + 1], c = this.I[t + 2];
      const n = cross(sub(this.pos(b), this.pos(a)), sub(this.pos(c), this.pos(a)));
      for (const k of [a, b, c]) { N[k * 3] += n[0]; N[k * 3 + 1] += n[1]; N[k * 3 + 2] += n[2]; }
    }
    // weld normals of coincident vertices that share a smoothing group (ring seams, poles)
    const groups = new Map<string, number[]>();
    for (let i = 0; i < nv; i++) {
      const g = this.G[i]; if (g < 0) continue;
      const key = g + ':' + Math.round(this.P[i * 3] * 4000) + ',' + Math.round(this.P[i * 3 + 1] * 4000) + ',' + Math.round(this.P[i * 3 + 2] * 4000);
      let l = groups.get(key); if (!l) groups.set(key, (l = [])); l.push(i);
    }
    for (const l of groups.values()) {
      if (l.length < 2) continue;
      let x = 0, y = 0, z = 0;
      for (const i of l) { x += N[i * 3]; y += N[i * 3 + 1]; z += N[i * 3 + 2]; }
      for (const i of l) { N[i * 3] = x; N[i * 3 + 1] = y; N[i * 3 + 2] = z; }
    }
    for (let i = 0; i < nv; i++) {
      const l = Math.hypot(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]) || 1;
      N[i * 3] /= l; N[i * 3 + 1] /= l; N[i * 3 + 2] /= l;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(this.UV, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3));
    if (this.skinned) {
      geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.SI, 4));
      geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.SW, 4));
    }
    geo.setIndex(nv > 65535 ? new THREE.Uint32BufferAttribute(this.I, 1) : new THREE.Uint16BufferAttribute(this.I, 1));
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    return geo;
  }
}

// ------------------------------------------------------------------ vector helpers
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a: V3): V3 => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const mid = (a: V3, b: V3): V3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
export function centroid(ps: V3[]): V3 { let x = 0, y = 0, z = 0; for (const p of ps) { x += p[0]; y += p[1]; z += p[2]; } const n = Math.max(1, ps.length); return [x / n, y / n, z / n]; }

/** evenly spaced u coordinates for n segments (+ the duplicated seam point) */
export const usFor = (n: number) => Array.from({ length: n + 1 }, (_, i) => i / n);

/**
 * A superellipse ring around an arbitrary frame. centre c, side axis sx (width rx), up axis sy (heights
 * ryTop above / ryBot below), n segments starting at the top and going round; sq = squareness (2 = ellipse,
 * >2 boxier, <2 pinched/diamond). bump(theta) adds a radial factor (keels, ridges, cheeks).
 */
export function ring(c: V3, sx: V3, sy: V3, rx: number, ryTop: number, ryBot: number, n: number, sq = 2, bump?: (th: number) => number): V3[] {
  const pts: V3[] = [];
  const e = 2 / sq;
  for (let i = 0; i <= n; i++) {
    const th = (Math.PI * 2 * i) / n;
    const s = Math.sin(th), co = Math.cos(th);
    const ex = Math.sign(s) * Math.pow(Math.abs(s), e), ey = Math.sign(co) * Math.pow(Math.abs(co), e);
    const k = 1 + (bump ? bump(th) : 0);
    const ry = co >= 0 ? ryTop : ryBot;
    pts.push(add(c, add(scale(sx, ex * rx * k), scale(sy, ey * ry * k))));
  }
  return pts;
}

/** rotation-minimising frames along a polyline: [tangent, normal, binormal] per point */
export function frenet(path: V3[]): [V3, V3, V3][] {
  const out: [V3, V3, V3][] = [];
  let prevN: V3 | null = null;
  for (let i = 0; i < path.length; i++) {
    const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)];
    const t = norm(sub(b, a));
    let n: V3;
    if (!prevN) { const up: V3 = Math.abs(t[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]; n = norm(cross(cross(t, up), t)); }
    else { n = norm(sub(prevN, scale(t, dot(prevN, t)))); }
    const bn = norm(cross(t, n));
    out.push([t, n, bn]);
    prevN = n;
  }
  return out;
}
