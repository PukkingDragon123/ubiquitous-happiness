// Height-field pixel painter for item icons. Shapes (domes, tubes, slabs, cut gems, crystal prisms) write a
// height, a material and a group id per pixel; a single lighting pass then shades everything from the same
// top-left light through each material's hue-shifted ramp (ordered-dithered bands), adds specular glints,
// metal/glass/iridescent looks, contact shadows between overlapping parts, and a dark coloured outline.
// The result reads like hand-shaded pixel art (outlined, banded, highlighted) while staying fully procedural.
import { Px, hex, mix, bayer, type RGB } from '../gfx/px';
import { fbm, hash2, clamp01 } from '../core/math';

export type Pal = RGB[];
export const pal = (...c: string[]): Pal => c.map((s) => hex(s));

export interface MatOpts { spec?: number; shin?: number; metal?: number; glass?: number; emit?: number; dither?: number; irid?: number; contrast?: number; flat?: number }
interface Mat extends Required<MatOpts> { pal: Pal }

type V2 = [number, number];
export interface PrimOpts { z?: number; group?: number; behind?: boolean; mask?: (x: number, y: number) => boolean }

const LX = -0.42, LY = -0.59, LZ = 0.71;          // light from the top-left, toward the viewer
const HX = -0.22, HY = -0.31, HZ = 0.92;          // half vector for specular
const EDGE = 1.6;
/** global multiplier on per-material dithering: 0 = clean, hand-painted cel bands */
const DITHER = 0;

export class Ic {
  w: number; h: number;
  H: Float32Array; M: Int16Array; G: Int16Array; L: Float32Array;
  O: Uint8ClampedArray;
  mats: Mat[] = [];
  private gid = 0;
  seed: number;

  constructor(w: number, h: number, seed = 1) {
    this.w = w; this.h = h; this.seed = seed;
    const n = w * h;
    this.H = new Float32Array(n); this.M = new Int16Array(n).fill(-1); this.G = new Int16Array(n).fill(-1); this.L = new Float32Array(n);
    this.O = new Uint8ClampedArray(n * 4);
  }

  mat(p: Pal, o: MatOpts = {}): number {
    this.mats.push({ pal: p, spec: o.spec ?? 0.25, shin: o.shin ?? 14, metal: o.metal ?? 0, glass: o.glass ?? 0, emit: o.emit ?? 0, dither: o.dither ?? 0.55, irid: o.irid ?? 0, contrast: o.contrast ?? 1.15, flat: o.flat ?? 0 });
    return this.mats.length - 1;
  }

  in(x: number, y: number) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  i(x: number, y: number) { return y * this.w + x; }
  has(x: number, y: number) { return this.in(x, y) && this.M[this.i(x, y)] >= 0; }
  newGroup() { return ++this.gid; }

  private put(x: number, y: number, hgt: number, m: number, g: number, o: PrimOpts) {
    if (!this.in(x, y)) return;
    if (o.mask && !o.mask(x, y)) return;
    const i = this.i(x, y);
    if (o.behind && this.M[i] >= 0 && this.G[i] !== g) return;
    if (this.G[i] === g && this.H[i] >= hgt) return;
    this.H[i] = hgt; this.M[i] = m; this.G[i] = g;
  }

  /** generic filled shape: fn returns local height (>= 0) or null for outside */
  shape(x0: number, y0: number, x1: number, y1: number, fn: (x: number, y: number) => number | null, m: number, o: PrimOpts = {}): number {
    const g = o.group ?? this.newGroup();
    for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(this.h - 1, Math.ceil(y1)); y++)
      for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(this.w - 1, Math.ceil(x1)); x++) {
        const v = fn(x + 0.5, y + 0.5);
        if (v === null) continue;
        this.put(x, y, (o.z ?? 0) + v, m, g, o);
      }
    return g;
  }

  /** an ellipsoid dome (optionally rotated, lumpy, flattened on top) */
  dome(cx: number, cy: number, rx: number, ry: number, m: number, o: PrimOpts & { h?: number; rot?: number; lumpy?: number; seed?: number; flat?: number; pinch?: number } = {}): number {
    const hh = o.h ?? Math.min(rx, ry) * 0.9, c = Math.cos(o.rot ?? 0), s = Math.sin(o.rot ?? 0), lum = o.lumpy ?? 0, sd = o.seed ?? this.seed;
    const R = Math.max(rx, ry) * (1 + lum) + 1;
    return this.shape(cx - R, cy - R, cx + R, cy + R, (x, y) => {
      const dx = x - cx, dy = y - cy;
      let u = (dx * c + dy * s) / rx, v = (-dx * s + dy * c) / ry;
      if (o.pinch) u *= 1 + o.pinch * v; // teardrop-ish: narrower toward -v
      let r = Math.hypot(u, v);
      if (lum) { const a = Math.atan2(v, u); r *= 1 + (fbm(Math.cos(a) * 1.3 + sd, Math.sin(a) * 1.3, 3, sd) - 0.5) * lum * 2; }
      if (r > 1) return null;
      let z = Math.sqrt(1 - r * r) * hh;
      if (o.flat) z = Math.min(z, hh * (1 - o.flat));
      if (lum) z += (fbm(x / 4 + sd, y / 4, 3, sd + 3) - 0.5) * lum * hh * 0.8;
      return Math.max(0.05, z);
    }, m, o);
  }

  /** tube along a polyline: cylinder cross-section, radius may vary along t (0..1) */
  tube(pts: V2[], r: number | ((t: number) => number), m: number, o: PrimOpts & { hk?: number; caps?: boolean } = {}): number {
    const rf = typeof r === 'number' ? () => r : r;
    const lens: number[] = [0];
    for (let k = 1; k < pts.length; k++) lens.push(lens[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
    const tot = lens[lens.length - 1] || 1;
    let rmax = 0; for (let k = 0; k <= 20; k++) rmax = Math.max(rmax, rf(k / 20));
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const p of pts) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
    const hk = o.hk ?? 1;
    const caps = o.caps !== false;
    return this.shape(x0 - rmax - 1, y0 - rmax - 1, x1 + rmax + 1, y1 + rmax + 1, (x, y) => {
      let best: number | null = null;
      for (let k = 0; k + 1 < pts.length; k++) {
        const [ax, ay] = pts[k], [bx, by] = pts[k + 1];
        const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1e-9;
        let tt = ((x - ax) * dx + (y - ay) * dy) / l2;
        if (!caps && ((k === 0 && tt < 0) || (k === pts.length - 2 && tt > 1))) continue;
        tt = Math.max(0, Math.min(1, tt));
        const d = Math.hypot(x - ax - dx * tt, y - ay - dy * tt);
        const t = (lens[k] + Math.sqrt(l2) * tt) / tot;
        const rr = rf(t);
        if (d > rr) continue;
        const z = Math.sqrt(Math.max(0, rr * rr - d * d)) * hk + 0.05;
        if (best === null || z > best) best = z;
      }
      return best;
    }, m, o);
  }

  /** a ring (torus seen from the front) */
  ring(cx: number, cy: number, rx: number, ry: number, th: number, m: number, o: PrimOpts & { a0?: number; a1?: number; n?: number } = {}): number {
    const n = o.n ?? 40, a0 = o.a0 ?? 0, a1 = o.a1 ?? Math.PI * 2;
    const pts: V2[] = [];
    for (let k = 0; k <= n; k++) { const a = a0 + (a1 - a0) * (k / n); pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); }
    return this.tube(pts, th, m, o);
  }

  /** polygon slab: height rises from the edges (bevel px per px) to a flat top, optionally rounded */
  slab(poly: V2[], m: number, o: PrimOpts & { h?: number; bevel?: number; round?: boolean; prof?: (d: number) => number } = {}): number {
    const hh = o.h ?? 3, bv = o.bevel ?? 1;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const p of poly) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
    return this.shape(x0, y0, x1, y1, (x, y) => {
      if (!inPoly(poly, x, y)) return null;
      const d = edgeDist(poly, x, y);
      if (o.prof) return o.prof(d);
      if (o.round) { const k = Math.min(1, d * bv / hh); return hh * Math.sqrt(1 - (1 - k) * (1 - k)); }
      return Math.min(hh, d * bv);
    }, m, o);
  }

  /** a cut gemstone: regular n-gon (or given poly), faceted crown rising to a flat table */
  gem(cx: number, cy: number, rx: number, ry: number, sides: number, m: number, o: PrimOpts & { rot?: number; table?: number; slope?: number; steps?: [number, number][] } = {}): number {
    const poly: V2[] = [];
    const rot = o.rot ?? Math.PI / sides;
    for (let k = 0; k < sides; k++) { const a = rot + (k / sides) * Math.PI * 2; poly.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); }
    const tableD = Math.min(rx, ry) * (1 - (o.table ?? 0.5));
    const slope = o.slope ?? 1.1;
    const steps = o.steps;
    return this.shape(cx - rx - 1, cy - ry - 1, cx + rx + 1, cy + ry + 1, (x, y) => {
      if (!inPoly(poly, x, y)) return null;
      const d = edgeDist(poly, x, y);
      if (steps) { let z = 0, prev = 0; for (const [dd, sl] of steps) { if (d <= dd) return z + (d - prev) * sl; z += (dd - prev) * sl; prev = dd; } return z; }
      return Math.min(tableD, d) * slope;
    }, m, o);
  }

  /** hexagonal crystal prism from a base point along an angle, pointed tip */
  crystal(bx: number, by: number, ang: number, len: number, w: number, m: number, o: PrimOpts & { tip?: number; hk?: number; flatTop?: number } = {}): number {
    const ux = Math.cos(ang), uy = Math.sin(ang), tip = (o.tip ?? 0.32) * len, hk = o.hk ?? 1;
    const R = len + w + 2;
    return this.shape(bx - R, by - R, bx + R, by + R, (x, y) => {
      const dx = x - bx, dy = y - by;
      const along = dx * ux + dy * uy, across = -dx * uy + dy * ux;
      if (along < -0.5 || along > len) return null;
      let ww = w;
      if (along > len - tip) ww = w * Math.max(0, (len - along) / tip);
      if (Math.abs(across) > ww) return null;
      // hexagonal cross-section: two slanted faces + a flat centre face
      const face = Math.min(ww * 0.55, (ww - Math.abs(across)) * 1.25) * hk;
      return Math.max(0.1, face + (o.flatTop ?? 0));
    }, m, o);
  }

  /** teardrop: round bottom, pointed top (sinkers, droplets, bulbs) */
  drop(cx: number, top: number, bottom: number, rx: number, m: number, o: PrimOpts & { h?: number; point?: number } = {}): number {
    const L = bottom - top, hh = o.h ?? rx * 0.9, pp = o.point ?? 0.75;
    return this.shape(cx - rx - 1, top, cx + rx + 1, bottom, (x, y) => {
      const v = (y - top) / L; if (v < 0 || v > 1) return null;
      const wv = rx * Math.pow(Math.sin(Math.min(1, v * 1.0) * Math.PI * 0.5 + (v > 0.6 ? 0 : 0)), pp) * (v > 0.62 ? Math.sqrt(Math.max(0, 1 - Math.pow((v - 0.62) / 0.38, 2))) : 1);
      const u = (x - cx) / Math.max(0.01, wv);
      if (Math.abs(u) > 1) return null;
      return Math.sqrt(1 - u * u) * hh * Math.min(1, wv / rx + 0.15);
    }, m, o);
  }

  // ---------------------------------------------------------------- details
  /** add brightness (-1..1) to existing pixels where fn returns a value */
  paint(fn: (x: number, y: number, i: number) => number | null | undefined | false, onlyGroup = -1) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const i = this.i(x, y);
      if (this.M[i] < 0 || (onlyGroup >= 0 && this.G[i] !== onlyGroup)) continue;
      const v = fn(x, y, i);
      if (typeof v === 'number') this.L[i] += v;
    }
  }
  /** switch material on existing pixels */
  recolor(fn: (x: number, y: number) => boolean, m: number, onlyGroup = -1) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const i = this.i(x, y);
      if (this.M[i] < 0 || (onlyGroup >= 0 && this.G[i] !== onlyGroup)) continue;
      if (fn(x, y)) this.M[i] = m;
    }
  }
  /** add height (bumps, embossing) or carve (negative) where fn says */
  bump(fn: (x: number, y: number) => number | null, onlyGroup = -1) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const i = this.i(x, y);
      if (this.M[i] < 0 || (onlyGroup >= 0 && this.G[i] !== onlyGroup)) continue;
      const v = fn(x + 0.5, y + 0.5);
      if (v) this.H[i] += v;
    }
  }
  /** carve a groove along a polyline (engraved seams, slits) */
  groove(pts: V2[], r: number, depth: number, dark = 0.25, onlyGroup = -1) {
    this.bump((x, y) => { const d = polyDist(pts, x, y); return d < r ? -depth * (1 - d / r) : null; }, onlyGroup);
    this.paint((x, y) => (polyDist(pts, x + 0.5, y + 0.5) < r * 0.75 ? -dark : null), onlyGroup);
  }
  /** cut pixels away (holes, chips) */
  erase(fn: (x: number, y: number) => boolean) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (fn(x + 0.5, y + 0.5)) { const i = this.i(x, y); this.M[i] = -1; this.G[i] = -1; this.O[i * 4 + 3] = 0; }
  }
  /** hard colour override on top of the shading (eyes, glints, printed marks); can add new opaque pixels */
  px(x: number, y: number, c: string | RGB) {
    x = Math.floor(x); y = Math.floor(y);
    if (!this.in(x, y)) return;
    const col = typeof c === 'string' ? hex(c) : c, i = this.i(x, y) * 4;
    this.O[i] = col[0]; this.O[i + 1] = col[1]; this.O[i + 2] = col[2]; this.O[i + 3] = 255;
  }
  line(x0: number, y0: number, x1: number, y1: number, c: string | RGB) {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
    for (let k = 0; k <= n; k++) this.px(x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n, c);
  }
  /** a tiny 4-point sparkle */
  glint(x: number, y: number, size = 1, c = '#ffffff') {
    this.px(x, y, c);
    for (let k = 1; k <= size; k++) { this.px(x - k, y, c); this.px(x + k, y, c); this.px(x, y - k, c); this.px(x, y + k, c); }
  }
  /** sparse detail clusters (pores, grit, spots): at most one per 3x3 cell, evenly spread, never per-pixel noise */
  speckle(density: number, seed: number, fn: (x: number, y: number, i: number) => void, onlyGroup = -1) {
    const cellP = Math.min(1, density * 9);
    for (let cy = 0; cy < this.h; cy += 3) for (let cx = 0; cx < this.w; cx += 3) {
      if (hash2(cx, cy, seed) >= cellP) continue;
      const x = cx + 1, y = cy + ((cx / 3) & 1);
      if (!this.in(x, y)) continue;
      const i = this.i(x, y);
      if (this.M[i] < 0 || (onlyGroup >= 0 && this.G[i] !== onlyGroup)) continue;
      fn(x, y, i);
    }
  }

  // ---------------------------------------------------------------- render
  private nh(j: number, g: number, h0: number): number {
    if (j < 0 || this.M[j] < 0) return h0 - EDGE;
    if (this.G[j] !== g) return this.H[j] > h0 + 0.01 ? h0 : h0 - EDGE;
    return this.H[j];
  }

  render(o: { outline?: string; outlineMix?: number } = {}): Px {
    const { w, h } = this;
    const p = new Px(w, h);
    const oc = hex(o.outline ?? '#120a1a'), omix = o.outlineMix ?? 0.55;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = this.i(x, y);
      const mi = this.M[i];
      if (mi < 0) continue;
      const m = this.mats[mi], g = this.G[i], h0 = this.H[i];
      const hl = this.nh(x > 0 ? i - 1 : -1, g, h0), hr = this.nh(x < w - 1 ? i + 1 : -1, g, h0);
      const hu = this.nh(y > 0 ? i - w : -1, g, h0), hd = this.nh(y < h - 1 ? i + w : -1, g, h0);
      let nx = -(hr - hl) * 0.5, ny = -(hd - hu) * 0.5, nz = 1;
      if (m.flat) { nx *= 1 - m.flat; ny *= 1 - m.flat; }
      const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
      const ndl = nx * LX + ny * LY + nz * LZ;
      let t = 0.56 + (ndl - LZ) * m.contrast;
      if (m.metal) {
        let env = 0.52 - ny * 0.75 - nx * 0.2;
        if (ny > 0.12 && ny < 0.4) env -= 0.22;      // dark horizon band reflected in curved metal
        t = t + (env - t) * m.metal;
      }
      if (m.glass) t = t * (1 - m.glass * 0.4) + m.glass * (0.22 + (1 - nz) * 0.45);
      // contact shadow where a part in front overlaps this one
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
        if (j >= 0 && this.M[j] >= 0 && this.G[j] !== g && this.H[j] > h0 + 0.7) { t -= 0.32; break; }
      }
      t += this.L[i];
      const sp = Math.pow(Math.max(0, nx * HX + ny * HY + nz * HZ), m.shin) * m.spec;
      t += sp;
      t = Math.max(t, m.emit);
      const n = m.pal.length - 1;
      // clean cel bands: no ordered dithering (DITHER = 0 keeps the old option for reference)
      let q = Math.round(clamp01(t) * n + (bayer(x, y) - 0.5) * m.dither * DITHER);
      q = Math.max(sp > 0.55 ? n : 0, Math.min(n, q));
      let col = m.pal[Math.max(0, q)];
      if (m.irid) {
        const a = Math.atan2(ny, nx) * 1.3 + (x + y) * 0.07;
        const tint: RGB = [160 + 95 * Math.cos(a), 160 + 95 * Math.cos(a + 2.1), 160 + 95 * Math.cos(a + 4.2)];
        col = mix(col, tint, m.irid * (0.35 + (1 - nz) * 0.9));
      }
      p.set(x, y, col);
    }
    // overrides
    for (let i = 0; i < w * h; i++) if (this.O[i * 4 + 3]) { p.d[i * 4] = this.O[i * 4]; p.d[i * 4 + 1] = this.O[i * 4 + 1]; p.d[i * 4 + 2] = this.O[i * 4 + 2]; p.d[i * 4 + 3] = 255; }
    // coloured dark outline
    const add: [number, number, RGB][] = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (p.alpha(x, y)) continue;
      let src = -1;
      for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) { const xx = x + dx, yy = y + dy; if (p.alpha(xx, yy)) { src = this.in(xx, yy) ? this.M[this.i(xx, yy)] : -1; break; } }
      if (src === -2) continue;
      if (p.alpha(x - 1, y) || p.alpha(x + 1, y) || p.alpha(x, y - 1) || p.alpha(x, y + 1)) {
        const base = src >= 0 ? this.mats[src].pal[0] : oc;
        add.push([x, y, mix(base, oc, omix)]);
      }
    }
    for (const [x, y, c] of add) p.set(x, y, c);
    return p;
  }
}

// ------------------------------------------------------------------ geometry helpers
export function inPoly(poly: V2[], x: number, y: number): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
export function segD(x: number, y: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1e-9;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2));
  return Math.hypot(x - ax - dx * t, y - ay - dy * t);
}
export function edgeDist(poly: V2[], x: number, y: number): number {
  let d = 1e9;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) d = Math.min(d, segD(x, y, poly[j][0], poly[j][1], poly[i][0], poly[i][1]));
  return d;
}
export function polyDist(pts: V2[], x: number, y: number): number {
  let d = 1e9;
  for (let k = 0; k + 1 < pts.length; k++) d = Math.min(d, segD(x, y, pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1]));
  return d;
}
/** points of a star / gear outline */
export function starPoly(cx: number, cy: number, r0: number, r1: number, n: number, rot = -Math.PI / 2, wob = 0, seed = 0): V2[] {
  const out: V2[] = [];
  for (let k = 0; k < n * 2; k++) {
    const a = rot + (k / (n * 2)) * Math.PI * 2;
    const r = (k % 2 ? r1 : r0) * (1 + (wob ? (hash2(k, 3, seed) - 0.5) * wob : 0));
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return out;
}
/** a sampled curve: n+1 points of f(t) for t in 0..1 */
export function curve(f: (t: number) => V2, n = 24): V2[] { return Array.from({ length: n + 1 }, (_, k) => f(k / n)); }
/** quadratic bezier helper */
export function bez(a: V2, b: V2, c: V2, n = 16): V2[] { return curve((t) => [(1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * b[0] + t * t * c[0], (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * b[1] + t * t * c[1]], n); }
/** cubic bezier helper */
export function bez3(a: V2, b: V2, c: V2, d: V2, n = 20): V2[] {
  return curve((t) => { const u = 1 - t; return [u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0], u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1]]; }, n);
}
