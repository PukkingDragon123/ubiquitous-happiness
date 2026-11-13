// Mesh kit: a Loft + texture Page + per-vertex tag ops, shared by every creature builder. Parts added through
// the kit carry the swim attributes (aSwim, aEye) and an AO tint in the colour attribute, so they all run on
// the same swim material.
import * as THREE from 'three';
import { Loft, V3, add, sub, scale, norm, cross, usFor } from '../gfx/loft';
import { Page, Rect } from './page';

export interface Attrs { swim: Float32Array; eye: Float32Array; ao: Float32Array; root: Float32Array; morphOff?: (V3 | undefined)[] }
const TAU = Math.PI * 2;

export class Kit {
  lo = new Loft(false);
  pg: Page;
  ops: { from: number; to: number; fn: (i: number, A: Attrs) => void }[] = [];
  anchors: Record<string, V3> = {};
  g = 20; // smoothing group counter
  constructor(pg: Page) { this.pg = pg; }

  tag(from: number, fn: (i: number, A: Attrs) => void) { this.ops.push({ from, to: this.lo.count, fn }); }
  newG() { return this.g++; }

  /** a cone (spike, papilla, horn) from base p along dir; uv into rect (v = 0 tip) */
  cone(p: V3, dir: V3, len: number, rad: number, rect: Rect, sides = 5, o: { jaw?: number; ao?: number; root?: V3; flutter?: number; phase?: number } = {}) {
    const reg = this.pg.reg(rect);
    const d = norm(dir);
    const up: V3 = Math.abs(d[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    const a = norm(cross(d, up)), b = norm(cross(d, a));
    const from = this.lo.count, g = this.newG();
    const ids: number[] = [];
    for (let k = 0; k < sides; k++) {
      const ang = (TAU * k) / sides;
      const q = add(p, add(scale(a, Math.cos(ang) * rad), scale(b, Math.sin(ang) * rad)));
      ids.push(this.lo.vert(q, reg.x + (k / sides) * reg.w, reg.y + reg.h, undefined, g, 1));
    }
    const tip = this.lo.vert(add(p, scale(d, len)), reg.x + reg.w / 2, reg.y, undefined, g, 1);
    const ctr = add(p, scale(d, len * 0.3));
    for (let k = 0; k < sides; k++) this.lo.triOut(ids[k], ids[(k + 1) % sides], tip, ctr);
    const root = o.root ?? p;
    this.tag(from, (i, A) => {
      A.ao[i] = o.ao ?? 1; A.swim[i * 4 + 3] = o.jaw ?? 0;
      A.swim[i * 4] = i === tip ? o.flutter ?? 0 : 0; A.swim[i * 4 + 1] = o.phase ?? 0;
      A.root[i * 3] = root[0]; A.root[i * 3 + 1] = root[1]; A.root[i * 3 + 2] = root[2];
    });
    return { from, to: this.lo.count, tip };
  }
  /** swept tube (barbels, lure stalks, tentacles, whiskers) */
  tube(path: V3[], rad: (t: number) => number, sides: number, rect: Rect, o: { flutter?: number; phase?: number; ao?: number; capEnd?: boolean; tentacle?: boolean } = {}) {
    const from = this.lo.count;
    this.lo.tube(path, rad, sides, this.pg.reg(rect), this.newG(), { capEnd: o.capEnd ?? true, capStart: false });
    const p0 = path[0];
    let tot = 0; const cum = [0];
    for (let k = 1; k < path.length; k++) { tot += Math.hypot(...sub(path[k], path[k - 1])); cum.push(tot); }
    this.tag(from, (i, A) => {
      const p = this.lo.pos(i);
      let best = 0, bd = 1e9;
      for (let k = 0; k < path.length; k++) { const dd = Math.hypot(...sub(p, path[k])); if (dd < bd) { bd = dd; best = k; } }
      const f = cum[best] / (tot || 1);
      A.ao[i] = o.ao ?? 1;
      if (o.tentacle) { A.swim[i * 4 + 2] = f; A.swim[i * 4 + 1] = o.phase ?? 0; }
      else { A.swim[i * 4] = (o.flutter ?? 0) * f; A.swim[i * 4 + 1] = o.phase ?? 0; }
      A.root[i * 3] = p0[0]; A.root[i * 3 + 1] = p0[1]; A.root[i * 3 + 2] = p0[2];
    });
  }
  /** lat-long sphere / ellipsoid blob (lure bulbs, warts, pearls) */
  blob(c: V3, r: V3, rect: Rect, o: { ao?: number; flutter?: number; phase?: number; seg?: number } = {}) {
    const from = this.lo.count, NS = o.seg ?? 10, NR = Math.max(4, Math.round(NS / 2));
    const rings: { pts: V3[]; v: number }[] = [];
    for (let k = 1; k < NR; k++) {
      const phi = (Math.PI * k) / NR, pts: V3[] = [];
      for (let j = 0; j <= NS; j++) { const b = (TAU * j) / NS; pts.push([c[0] + Math.sin(phi) * Math.cos(b) * r[0], c[1] + Math.cos(phi) * r[1], c[2] + Math.sin(phi) * Math.sin(b) * r[2]]); }
      rings.push({ pts, v: k / NR });
    }
    this.lo.loft(rings, usFor(NS), this.pg.reg(rect), this.newG(), { start: [c[0], c[1] + r[1], c[2]], end: [c[0], c[1] - r[1], c[2]] });
    this.tag(from, (i, A) => { A.ao[i] = o.ao ?? 1; A.swim[i * 4] = o.flutter ?? 0; A.swim[i * 4 + 1] = o.phase ?? 0; A.root[i * 3] = c[0]; A.root[i * 3 + 1] = c[1]; A.root[i * 3 + 2] = c[2]; });
    return { from, to: this.lo.count };
  }

  /** loft rings into a rect (rings' v runs 0..1 down the rect), tagging every vertex */
  loftPart(rings: { pts: V3[]; v: number }[], rect: Rect, o: { start?: V3 | null; end?: V3 | null; flip?: boolean } = {}, fn?: (i: number, A: Attrs, p: V3) => void) {
    const from = this.lo.count;
    this.lo.loft(rings, usFor(rings[0].pts.length - 1), this.pg.reg(rect), this.newG(), { start: o.start ?? null, end: o.end ?? null, flip: o.flip, alt: true });
    if (fn) this.tag(from, (i, A) => fn(i, A, this.lo.pos(i)));
    return { from, to: this.lo.count };
  }
  /** a double-sided sheet; fn tags (row v 0..1, col u 0..1) */
  sheetPart(grid: V3[][], rect: Rect, thick = 0, fn?: (i: number, A: Attrs, u: number, v: number) => void) {
    const from = this.lo.count;
    this.lo.sheet(grid, this.pg.reg(rect), this.newG(), undefined, thick);
    const R = grid.length, Cn = grid[0].length;
    if (fn) this.tag(from, (i, A) => { const k = (i - from) % (R * Cn); fn(i, A, (k % Cn) / (Cn - 1), Math.floor(k / Cn) / (R - 1)); });
    return { from, to: this.lo.count };
  }
  /** superellipse ring around an axis frame */
  static ring(c: V3, ax: V3, ay: V3, rx: number, ry: number, n: number, sq = 2, ryBot = ry): V3[] {
    const pts: V3[] = [], e = 2 / sq;
    for (let i = 0; i <= n; i++) {
      const th = (TAU * i) / n, s = Math.sin(th), co = Math.cos(th);
      const ex = Math.sign(s) * Math.pow(Math.abs(s), e), ey = Math.sign(co) * Math.pow(Math.abs(co), e);
      pts.push(add(c, add(scale(ax, ex * rx), scale(ay, ey * (co >= 0 ? ry : ryBot)))));
    }
    return pts;
  }

  /** build the geometry + swim attributes */
  geometry(): { geo: THREE.BufferGeometry; A: Attrs } {
    const geo = this.lo.build();
    const n = this.lo.count;
    const A: Attrs = { swim: new Float32Array(n * 4), eye: new Float32Array(n * 4), ao: new Float32Array(n).fill(1), root: new Float32Array(n * 3) };
    for (let i = 0; i < n; i++) { const p = this.lo.pos(i); A.root[i * 3] = p[0]; A.root[i * 3 + 1] = p[1]; A.root[i * 3 + 2] = p[2]; }
    for (const op of this.ops) for (let i = op.from; i < op.to; i++) op.fn(i, A);
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(this.lo.UV, 2));
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = A.ao[i];
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aSwim', new THREE.BufferAttribute(A.swim, 4));
    geo.setAttribute('aEye', new THREE.BufferAttribute(A.eye, 4));
    return { geo, A };
  }
}
export { add, sub, scale, norm, cross };
