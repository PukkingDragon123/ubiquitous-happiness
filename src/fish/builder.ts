// Generic fish builder: a species spec (profile curves, fins, eye, mouth, paint function) -> one merged
// geometry (body + fins + eyes + lids + teeth + extras) on one painted texture page. Everything shares a
// single swim material per instance, so a fish is one draw call.
//
// Body: superellipse rings lofted along x (nose at +x). Each ring can carry a duplicated "mouth seam" point on
// both sides: the vertices below the seam in front of the jaw corner get jaw weight 1 and rotate around the
// hinge in the shader, the zero-area strip between the seam twins opens into the mouth interior (painted
// in the 1-2 texel band between them). The body texture is laid out side-view: page x = along the body
// (nose right), page y = around the ring (top, near flank, belly, far flank, top).
import * as THREE from 'three';
import { V3, Reg, add, sub, scale, norm, cross, dot, usFor } from '../gfx/loft';
import { Kit, Attrs } from './kit';
import { Page, Rect, FinPaint, EyePaint, paintFin, paintEye, paintSwatch, paintLid, C } from './page';
import { RGB, mix, shade, bayer } from '../gfx/px';
export type { Attrs };
import { Curve, asCurve, smoothstep } from './curve';
import { hash2, vnoise } from '../core/math';
import type { UwOpts } from '../gfx/shaders/underwater';

type CurveIn = Curve | number | [number, number][];

/**
 * v2 PS1 look: every species is rebuilt at a fraction of its authored resolution (faceted, flat-shaded),
 * keeping the silhouette, fins and painted texture that make it recognisable.
 */
export const LOWPOLY = { seg: 0.34, rings: 0.32, fin: 0.42, finRows: 0.5, eyeSides: 8, eyeRings: 3 };
const lpSeg = (n: number) => Math.max(8, 2 * Math.round((n * LOWPOLY.seg) / 2));
const lpRings = (n: number) => Math.max(10, Math.round(n * LOWPOLY.rings));
const lpCols = (n: number) => Math.max(3, Math.round(n * LOWPOLY.fin));
const lpRows = (n: number) => Math.max(2, Math.round(n * LOWPOLY.finRows));

export interface PaintCtx {
  t: number; a: number; h: number; side: number; X: number; Y: number; Z: number;
  /** -1 belly .. 0 centreline .. 1 back, relative to the local profile */
  yn: number;
  /** model-space height relative to the centreline as a fraction of length */
  yl: number;
  L: number; px: number; py: number;
  /** scale cell under this texel: id hash, normalised distance from the scale centre (0..1+) */
  sid: number; sd: number;
  /** distance to the eye centre in metres */
  eyeD: number;
}
export type BodyPaint = (c: PaintCtx) => RGB;

export interface TeethSpec { upper: number; lower: number; size: number; style?: 'fang' | 'tri' | 'needle' | 'peg' | 'beak'; t0?: number; t1?: number; col?: string[]; inset?: number; rake?: number; lowerSize?: number }
export interface MouthSpec {
  t: number;                    // jaw corner along the body (0 nose .. 1 tail)
  th: CurveIn;                  // seam angle as a fraction of PI (0.5 = flank midline, 1 = belly)
  open: number;                 // max jaw angle (rad)
  teeth?: TeethSpec;
  lip?: number;                 // lip bulge
  lipCol?: string;
  interior?: string;
  crease?: string;              // painted mouth line colour
  idle?: number;                // resting jaw opening 0..1
}
export interface EyeSpec {
  t: number; y: number; r: number;       // y: fraction of the local half-height above (+) / below (-) the centreline; r: fraction of L
  paint: EyePaint;
  lid?: 'angry' | 'sad' | 'sleepy' | 'none' | 'hood';
  lidCol?: string; lidLine?: string; lidTilt?: number; lidLevel?: number;
  bulge?: number; fwd?: number; up?: number;
  socket?: number;              // darkening ring strength
}
export interface FinSpec extends FinPaint {
  type: 'dorsal' | 'anal' | 'caudal' | 'pectoral' | 'pelvic' | 'fluke' | 'flipper';
  t0?: number; t1?: number; h?: CurveIn; sweep?: number; cols?: number; rows?: number; lean?: CurveIn;
  shape?: 'fork' | 'lunate' | 'round' | 'truncate' | 'pointed' | 'emarginate' | 'lyre' | 'heterocercal';
  len?: number; span?: number;
  t?: number; y?: number; angle?: number; out?: number; base?: string; baseLen?: number;
  flutter?: number; ripple?: number; px?: [number, number]; thick?: number;
  ext?: (u: number) => number;
  /** paired fins mirrored on both sides (default true for pectoral/pelvic) */
  pair?: boolean;
}
export interface ScaleSpec { w: number; h: number; k?: number; rim?: number; hi?: number; tMin?: number; tMax?: number; bump?: number }

export interface FishSpec {
  name: string;
  L: number; body: number;
  top: CurveIn; bot: CurveIn; wid: CurveIn; cy?: CurveIn; sq?: CurveIn;
  bump?: (t: number, a: number) => number;
  rings?: number; seg?: number;
  mouth?: MouthSpec; eye: EyeSpec; fins: FinSpec[];
  paint: BodyPaint;
  /** optional emissive paint (photophores, glowing markings) */
  glow?: (c: PaintCtx) => RGB | null;
  scales?: ScaleSpec;
  gill?: { t: number; col?: string; k?: number; hi?: string; curve?: number; top?: number; bot?: number };
  lateral?: { y: number; col: string; t0?: number; t1?: number; dash?: number; arch?: number };
  sheen?: number; rough?: number;
  swim?: { k?: number; a0?: number; pow?: number; vertical?: boolean; amp?: number; freq?: number; freqK?: number; flutter?: [number, number]; ripple?: number };
  page?: [number, number]; bodyH?: number;
  extras?: (b: FishBuilder) => void;
  morph?: { centre: V3; R: number; k?: number };
  uwo?: UwOpts; emissive?: number; normal?: number; outline?: boolean;
  noseRound?: number; tailCap?: number;
  clearcoat?: number; clearcoatRough?: number;
}

/** what the builder produces, cached per species */
export interface BuiltFish {
  geo: THREE.BufferGeometry;
  tex: ReturnType<Page['textures']>;
  L: number; noseX: number; bodyLen: number;
  mouth: V3; eye: V3; eyeR: number; hinge: [number, number]; jawOpen: number; jawIdle: number;
  morph: boolean;
  anchors: Record<string, V3>;
}

const TAU = Math.PI * 2;

export class FishBuilder extends Kit {
  s: FishSpec;
  L: number; bodyLen: number; noseX: number;
  top: Curve; bot: Curve; wid: Curve; cy: Curve; sq: Curve; th: Curve;
  bodyR!: Rect;
  eyeC: V3 = [0, 0, 0]; eyeR = 0;
  hinge: [number, number] = [0, 0];
  constructor(spec: FishSpec) {
    const [W, H] = spec.page ?? [256, 256];
    super(new Page(W, H));
    this.s = spec;
    this.L = spec.L; this.bodyLen = spec.body * spec.L; this.noseX = spec.L / 2;
    this.top = asCurve(spec.top); this.bot = asCurve(spec.bot); this.wid = asCurve(spec.wid);
    this.cy = asCurve(spec.cy, 0); this.sq = asCurve(spec.sq, 2);
    this.th = asCurve(spec.mouth?.th, 0.5);
  }

  // ----------------------------------------------------------------------------------------- geometry helpers
  xAt(t: number) { return this.noseX - t * this.bodyLen; }
  tAt(x: number) { return (this.noseX - x) / this.bodyLen; }
  /** surface point of the body at (t, angle) */
  surf(t: number, a: number): V3 {
    const L = this.L;
    const tp = this.top(t) * L, bt = this.bot(t) * L, wd = this.wid(t) * L, c0 = this.cy(t) * L, sq = this.sq(t);
    const s = Math.sin(a), co = Math.cos(a), e = 2 / sq;
    let ex = Math.sign(s) * Math.pow(Math.abs(s), e), ey = Math.sign(co) * Math.pow(Math.abs(co), e);
    const k = 1 + (this.s.bump ? this.s.bump(t, a) : 0) + this.lipBump(t, a);
    ex *= k; ey *= k;
    return [this.xAt(t), c0 + ey * (co >= 0 ? tp : bt), ex * wd];
  }
  lipBump(t: number, a: number) {
    const m = this.s.mouth;
    if (!m || !m.lip) return 0;
    const am = Math.min(a, TAU - a), thm = this.th(t) * Math.PI;
    return m.lip * Math.exp(-(((am - thm) / 0.32) ** 2)) * (1 - smoothstep(m.t * 0.6, m.t * 1.05, t));
  }
  /** angle on the +z side where the body surface reaches height y at t (bisection) */
  angleAtY(t: number, y: number) {
    let lo = 0, hi = Math.PI;
    for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (this.surf(t, m)[1] > y) lo = m; else hi = m; }
    return (lo + hi) / 2;
  }
  yAt(t: number, frac: number) { const c = this.cy(t) * this.L; return c + frac * (frac >= 0 ? this.top(t) : this.bot(t)) * this.L; }

  /** morph target (pufferfish): push a point toward the inflated sphere */
  inflate(p: V3): V3 {
    const mo = this.s.morph;
    if (!mo) return p;
    const c = mo.centre, R = mo.R * this.L, k = mo.k ?? 0.85;
    const d = sub(p, c), l = Math.hypot(...d) || 1e-6;
    const nl = l + (R - l) * k;
    return add(c, scale(d, nl / l));
  }


  // ----------------------------------------------------------------------------------------- body
  buildBody() {
    const s = this.s, N = lpSeg(s.seg ?? 28), R = lpRings(s.rings ?? 46);
    const bodyH = s.bodyH ?? Math.round(this.pg.H / 2);
    this.bodyR = this.pg.band(bodyH);
    const m = s.mouth;
    const eps = (1.5 / (bodyH - 1));
    const ts: number[] = [];
    for (let i = 0; i < R; i++) { const u = i / (R - 1); ts.push(Math.max(0.0035, 0.45 * u + 0.55 * (1 - Math.cos(Math.PI * u)) / 2)); }
    const thRef = m ? this.th(m.t * 0.5) : 0.5;
    const ku = Math.max(2, Math.round(thRef * N / 2)), kl = Math.max(2, N / 2 - ku);
    const rings = ts.map((t) => {
      const list: { a: number; f: number; u: number }[] = [];
      if (m) {
        const thm = this.th(t) * Math.PI;
        for (let k = 0; k <= ku; k++) { const a = thm * k / ku; list.push({ a, f: 0, u: k === ku ? (a / TAU - eps / 2) : a / TAU }); }
        for (let k = 0; k <= kl; k++) { const a = thm + (Math.PI - thm) * k / kl; list.push({ a, f: 1, u: k === 0 ? (a / TAU + eps / 2) : a / TAU }); }
      } else {
        for (let k = 0; k <= N / 2; k++) { const a = Math.PI * k / (N / 2); list.push({ a, f: 0, u: a / TAU }); }
      }
      const full = list.slice();
      for (let k = list.length - 2; k >= 0; k--) full.push({ a: TAU - list[k].a, f: list[k].f, u: 1 - list[k].u });
      const pts = full.map((q) => this.surf(t, q.a));
      const code = full.map((q) => q.u + 2 * q.f);
      return { pts, v: t, c: (_p: V3, j: number) => code[j] };
    });
    const n = rings[0].pts.length;
    const from = this.lo.count;
    const nose: V3 = [this.noseX + (s.noseRound ?? 0) * this.L, this.cy(0) * this.L, 0];
    const tailT = 1, tailCap = (s.tailCap ?? 0.35) * Math.min(this.top(1), this.bot(1)) * this.L;
    const tail: V3 = [this.xAt(tailT) - tailCap, this.cy(1) * this.L, 0];
    this.lo.loft(rings, usFor(n - 1), { x: 0, y: 0, w: 1, h: 1 }, 1, { start: nose, end: tail, alt: true });
    const br = this.pg.reg(this.bodyR);
    const tc = m ? m.t : 0;
    this.tag(from, (i, A) => {
      const code = this.lo.C[i * 3];
      const f = code >= 1.5 ? 1 : 0, around = code - 2 * f;
      const t = this.lo.UV[i * 2 + 1];
      this.lo.UV[i * 2] = br.x + (1 - Math.min(1, t)) * br.w;
      this.lo.UV[i * 2 + 1] = 1 - (br.y + around * br.h);
      A.ao[i] = 1;
      if (m && f) A.swim[i * 4 + 3] = 1 - smoothstep(tc - 0.03, tc + 0.025, t);
    });
    if (m) {
      const thc = this.th(tc) * Math.PI;
      const hp = this.surf(tc, thc);
      this.hinge = [hp[0] - 0.01 * this.L, hp[1]];
      this.anchors.mouth = this.surf(0.004, thc);
      this.anchors.mouth[2] = 0;
    } else this.anchors.mouth = [...nose];
  }

  // ----------------------------------------------------------------------------------------- eyes
  buildEyes() {
    const e = this.s.eye, L = this.L;
    const r = e.r * L, t = e.t;
    const y = this.yAt(t, e.y);
    const a = this.angleAtY(t, y);
    const sp = this.surf(t, a);
    const bul = e.bulge ?? 0.62;
    const cz = sp[2] - r * (1 - bul);
    this.eyeC = [sp[0], y, cz]; this.eyeR = r;
    this.anchors.eye = [sp[0], y, cz];
    const eyeRect = this.pg.alloc(48, 48);
    paintEye(this.pg, eyeRect, e.paint);
    const er = this.pg.reg(eyeRect);
    let lidRect: Rect | null = null;
    if (e.lid && e.lid !== 'none') { lidRect = this.pg.alloc(12, 12); paintLid(this.pg, lidRect, e.lidCol ?? '#606060', e.lidLine ?? '#151018'); }
    for (const side of [1, -1]) {
      const c: V3 = [sp[0], y, cz * side];
      const d = norm([e.fwd ?? 0.15, e.up ?? 0.1, side]);
      let ex = norm(sub([1, 0, 0], scale(d, d[0])));
      let ey = norm(cross(d, ex)); if (ey[1] < 0) ey = scale(ey, -1);
      ex = norm(cross(ey, d)); if (ex[0] < 0) ex = scale(ex, -1);
      const rings: { pts: V3[]; v: number }[] = [];
      const NS = LOWPOLY.eyeSides, NR = LOWPOLY.eyeRings, phiMax = Math.PI * 0.62;
      for (let k = 1; k <= NR; k++) {
        const phi = (phiMax * k) / NR;
        const cc = add(c, scale(d, r * Math.cos(phi))), rr = r * Math.sin(phi);
        const pts: V3[] = [];
        for (let j = 0; j <= NS; j++) { const b = (TAU * j) / NS; pts.push(add(cc, add(scale(ex, Math.cos(b) * rr), scale(ey, Math.sin(b) * rr)))); }
        rings.push({ pts, v: k / NR });
      }
      const from = this.lo.count;
      this.lo.loft(rings, usFor(NS), { x: 0, y: 0, w: 1, h: 1 }, this.newG(), { start: add(c, scale(d, r)) });
      this.tag(from, (i, A) => {
        const p = this.lo.pos(i), q = sub(p, c);
        const u = 0.5 + 0.5 * dot(q, ex) / r, v = 0.5 - 0.5 * dot(q, ey) / r;
        this.lo.UV[i * 2] = er.x + Math.max(0, Math.min(1, u)) * er.w;
        this.lo.UV[i * 2 + 1] = 1 - (er.y + Math.max(0, Math.min(1, v)) * er.h);
        A.eye[i * 4] = c[0]; A.eye[i * 4 + 1] = c[1]; A.eye[i * 4 + 2] = c[2]; A.eye[i * 4 + 3] = 1;
        A.root[i * 3] = c[0]; A.root[i * 3 + 1] = c[1]; A.root[i * 3 + 2] = c[2];
        A.ao[i] = 1;
      });
      if (lidRect) this.buildLid(c, r, d, ex, ey, lidRect, e);
    }
  }
  buildLid(c: V3, r: number, d: V3, ex: V3, ey: V3, rect: Rect, e: EyeSpec) {
    const R = r * 1.13;
    const tilt = e.lidTilt ?? (e.lid === 'angry' ? 0.55 : e.lid === 'sad' ? -0.45 : 0);
    const level = e.lidLevel ?? (e.lid === 'sleepy' ? 0.0 : e.lid === 'hood' ? 0.5 : 0.3);
    const rows = 3, cols = 5, grid: V3[][] = [];
    for (let i = 0; i < rows; i++) {
      const row: V3[] = [];
      for (let j = 0; j < cols; j++) {
        const xx = (j / (cols - 1) * 2 - 1) * 0.98;
        const yCut = level - tilt * xx;
        const yTop = Math.sqrt(Math.max(0, 1 - xx * xx));
        const y0 = Math.min(yCut, yTop - 0.02);
        const yy = yTop + (y0 - yTop) * (i / (rows - 1));
        const zz = Math.sqrt(Math.max(0, 1 - xx * xx - yy * yy));
        row.push(add(c, add(add(scale(ex, xx * R), scale(ey, yy * R)), scale(d, zz * R))));
      }
      grid.push(row);
    }
    const from = this.lo.count;
    this.lo.sheet(grid, this.pg.reg(rect), this.newG());
    this.tag(from, (i, A) => { A.ao[i] = 0.9; A.root[i * 3] = c[0]; A.root[i * 3 + 1] = c[1]; A.root[i * 3 + 2] = c[2]; });
  }

  // ----------------------------------------------------------------------------------------- fins
  finRect(f: FinSpec, w: number, h: number) {
    const [pw, ph] = f.px ?? [w, h];
    const r = this.pg.alloc(pw, ph);
    paintFin(this.pg, r, f);
    return r;
  }
  addSheet(grid: V3[][], rect: Rect, f: FinSpec, flutterPhase: number, root: (i: number) => V3) {
    const from = this.lo.count;
    this.lo.sheet(grid, this.pg.reg(rect), this.newG(), undefined, f.thick ?? 0.0015 * this.L);
    const R = grid.length, Cn = grid[0].length;
    const fl = f.flutter ?? 0, rp = f.ripple ?? 0;
    // sheet() emits rows of Cn verts, R rows, for each of 2 sides
    this.tag(from, (i, A) => {
      const k = (i - from) % (R * Cn), row = Math.floor(k / Cn);
      const v = row / (R - 1);
      A.ao[i] = 0.78 + 0.22 * v;
      A.swim[i * 4] = fl * v; A.swim[i * 4 + 1] = flutterPhase + v * 0.6; A.swim[i * 4 + 2] = rp * v;
      A.root[i * 3] = root(k % Cn)[0]; A.root[i * 3 + 1] = root(k % Cn)[1]; A.root[i * 3 + 2] = root(k % Cn)[2];
    });
  }
  buildMedian(f: FinSpec) {
    const L = this.L, top = f.type === 'dorsal';
    const t0 = f.t0 ?? 0.4, t1 = f.t1 ?? 0.7, hC = asCurve(f.h, 0.1), lean = asCurve(f.lean, 0);
    const cols = lpCols(f.cols ?? 14), rows = lpRows(f.rows ?? 5);
    const rect = this.finRect(f, Math.max(24, Math.round((t1 - t0) * this.pg.W * 0.9)), 32);
    const base: V3[] = [];
    const grid: V3[][] = [];
    for (let j = 0; j < cols; j++) {
      const u = j / (cols - 1), t = t0 + (t1 - t0) * u;
      const a = top ? 0.0 : Math.PI;
      const sp = this.surf(t, a);
      const inset = (top ? -1 : 1) * 0.04 * (top ? this.top(t) : this.bot(t)) * L;
      base.push([sp[0], sp[1] + inset, 0]);
    }
    for (let i = 0; i < rows; i++) {
      const v = i / (rows - 1), row: V3[] = [];
      for (let j = 0; j < cols; j++) {
        const u = j / (cols - 1), b = base[j];
        const hh = hC(u) * L, sw = ((f.sweep ?? 0.3) + lean(u)) * hh;
        const vv = v;
        row.push([b[0] - sw * vv, b[1] + (top ? 1 : -1) * hh * vv, 0]);
      }
      grid.push(row);
    }
    this.addSheet(grid, rect, f, top ? 0 : 1.3, (j) => base[j]);
  }
  buildCaudal(f: FinSpec) {
    const L = this.L;
    const tb = f.t0 ?? 0.965;
    const x0 = this.xAt(tb), c0 = this.cy(tb) * L;
    const hTop = this.top(tb) * L * 0.85, hBot = this.bot(tb) * L * 0.85;
    const len = (f.len ?? 0.2) * L, span = (f.span ?? 0.18) * L;
    const shape = f.shape ?? 'fork';
    const ext = f.ext ?? ((u: number) => {
      const w = Math.abs(2 * u - 1);
      switch (shape) {
        case 'fork': return 0.5 + 0.5 * Math.pow(w, 1.3);
        case 'lunate': return 0.3 + 0.7 * Math.pow(w, 0.75);
        case 'emarginate': return 0.85 + 0.15 * w;
        case 'truncate': return 0.97 - 0.05 * w * w;
        case 'round': return 0.55 + 0.45 * Math.sqrt(Math.max(0, 1 - w * w));
        case 'pointed': return Math.max(0.05, 1 - w);
        case 'lyre': return 0.45 + 0.55 * Math.pow(w, 2.2);
        case 'heterocercal': return u < 0.5 ? 0.6 + 0.4 * Math.pow(w, 0.9) : 0.35 + 0.35 * w;
      }
    });
    const cols = lpCols(f.cols ?? 13), rows = lpRows(f.rows ?? 6);
    const rect = this.finRect(f, 64, 56);
    const base: V3[] = [], grid: V3[][] = [];
    for (let j = 0; j < cols; j++) { const u = j / (cols - 1); base.push([x0 + 0.01 * L, c0 + hTop - (hTop + hBot) * u, 0]); }
    for (let i = 0; i < rows; i++) {
      const v = i / (rows - 1), row: V3[] = [];
      for (let j = 0; j < cols; j++) {
        const u = j / (cols - 1), b = base[j];
        const ty = c0 + (0.5 - u) * 2 * span * (shape === 'heterocercal' && u < 0.5 ? 1.15 : 1);
        const tx = x0 - len * ext(u);
        // rays curve slightly: ease in the vertical spread
        const vy = 1 - Math.pow(1 - v, 1.6);
        row.push([b[0] + (tx - b[0]) * v, b[1] + (ty - b[1]) * vy, 0]);
      }
      grid.push(row);
    }
    this.addSheet(grid, rect, f, 0, (j) => base[j]);
    this.anchors.tail = [x0 - len, c0, 0];
  }
  buildPaired(f: FinSpec) {
    const L = this.L, t = f.t ?? 0.3, isPel = f.type === 'pelvic';
    const yf = f.y ?? (isPel ? -0.92 : -0.4);
    const y = this.yAt(t, yf);
    const a = isPel ? Math.PI * 0.86 : this.angleAtY(t, y);
    const sp = this.surf(t, a);
    const len = (f.len ?? 0.15) * L, bl = (f.baseLen ?? 0.04) * L, spread = (f.span ?? 0.5) * len;
    const ang = ((f.angle ?? (isPel ? 55 : 20)) * Math.PI) / 180;
    const out = (f.out ?? 0.55) * len;
    const ext = f.ext ?? ((u: number) => 0.62 + 0.38 * Math.sqrt(Math.max(0, 1 - (2 * u - 1) ** 2)) - (f.shape === 'pointed' ? 0.3 * u : 0));
    const cols = lpCols(f.cols ?? 8), rows = lpRows(f.rows ?? 5);
    const rect = this.finRect(f, isPel ? 32 : 44, isPel ? 24 : 30);
    const ca = Math.cos(ang), sa = Math.sin(ang);
    for (const side of f.pair === false ? [1] : [1, -1]) {
      const A: V3 = [sp[0], sp[1], (sp[2] + 0.004 * L) * side];
      const base: V3[] = [], grid: V3[][] = [];
      for (let j = 0; j < cols; j++) { const u = j / (cols - 1); base.push([A[0] + (0.5 - u) * bl * 0.4, A[1] + (0.5 - u) * bl, A[2]]); }
      for (let i = 0; i < rows; i++) {
        const v = i / (rows - 1), row: V3[] = [];
        for (let j = 0; j < cols; j++) {
          const u = j / (cols - 1), b = base[j];
          // local fan: back (-x) by ext*len, spread in y, rotated down by ang, splayed out in z
          const lx = -len * ext(u), ly = (0.5 - u) * spread;
          const rx = lx * ca - ly * sa, ry = lx * sa + ly * ca;
          const tip: V3 = [A[0] + rx, A[1] + ry, A[2] + side * out * (0.6 + 0.4 * u)];
          const vv = v;
          row.push([b[0] + (tip[0] - b[0]) * vv, b[1] + (tip[1] - b[1]) * vv, b[2] + (tip[2] - b[2]) * Math.pow(vv, 0.8)]);
        }
        grid.push(row);
      }
      this.addSheet(grid, rect, f, side > 0 ? 0 : Math.PI * 0.85, (j) => base[j]);
    }
  }
  buildFluke(f: FinSpec) {
    // horizontal tail flukes (whales, dolphins): sheet in the xz plane
    const L = this.L, tb = f.t0 ?? 0.97, x0 = this.xAt(tb), y0 = this.cy(tb) * L;
    const len = (f.len ?? 0.12) * L, span = (f.span ?? 0.2) * L;
    const cols = lpCols(f.cols ?? 13), rows = lpRows(f.rows ?? 5);
    const rect = this.finRect(f, 64, 32);
    const ext = f.ext ?? ((u: number) => { const w = Math.abs(2 * u - 1); return 0.35 + 0.65 * Math.pow(w, 0.7); });
    const base: V3[] = [], grid: V3[][] = [];
    const bw = this.wid(tb) * L * 0.8;
    for (let j = 0; j < cols; j++) { const u = j / (cols - 1); base.push([x0 + 0.01 * L, y0, (0.5 - u) * 2 * bw]); }
    for (let i = 0; i < rows; i++) {
      const v = i / (rows - 1), row: V3[] = [];
      for (let j = 0; j < cols; j++) {
        const u = j / (cols - 1), b = base[j], w = Math.abs(2 * u - 1);
        const tx = x0 - len * ext(u) - len * 0.25 * w, tz = (0.5 - u) * 2 * span;
        row.push([b[0] + (tx - b[0]) * v, y0 - 0.02 * L * w * v, b[2] + (tz - b[2]) * (1 - Math.pow(1 - v, 1.5))]);
      }
      grid.push(row);
    }
    this.addSheet(grid, rect, f, 0, (j) => base[j]);
    this.anchors.tail = [x0 - len, y0, 0];
  }
  buildFins() {
    for (const f of this.s.fins) {
      if (f.type === 'dorsal' || f.type === 'anal') this.buildMedian(f);
      else if (f.type === 'caudal') this.buildCaudal(f);
      else if (f.type === 'fluke') this.buildFluke(f);
      else this.buildPaired(f);
    }
  }

  // ----------------------------------------------------------------------------------------- teeth
  buildTeeth() {
    const m = this.s.mouth;
    if (!m || !m.teeth) return;
    const T = m.teeth, L = this.L;
    const rect = this.pg.alloc(8, 12);
    paintSwatch(this.pg, rect, T.col ?? ['#fffef6', '#f2ecd8', '#d8c8a8', '#a07868'], 0.25);
    const reg = this.pg.reg(rect);
    const t0 = T.t0 ?? 0.02, t1 = T.t1 ?? m.t * 0.92;
    const style = T.style ?? 'fang';
    const g = this.newG();
    const tooth = (p: V3, dir: V3, size: number, inward: V3, jaw: number) => {
      const from = this.lo.count;
      const w = size * (style === 'tri' ? 0.9 : style === 'needle' ? 0.25 : style === 'peg' ? 0.55 : style === 'beak' ? 1.4 : 0.4);
      const fwd: V3 = [1, 0, 0];
      const side = norm(cross(dir, inward));
      const b0 = add(p, scale(fwd, w * 0.5)), b1 = add(p, scale(fwd, -w * 0.5)), b2 = add(p, scale(inward, w * 0.5));
      const rake = T.rake ?? (style === 'fang' ? 0.25 : 0);
      const tip = add(add(p, scale(dir, size)), add(scale(fwd, -rake * size), scale(inward, size * 0.12)));
      void side;
      const i0 = this.lo.vert(b0, reg.x, reg.y + reg.h, undefined, g, 1), i1 = this.lo.vert(b1, reg.x + reg.w, reg.y + reg.h, undefined, g, 1);
      const i2 = this.lo.vert(b2, reg.x + reg.w / 2, reg.y + reg.h, undefined, g, 1), it = this.lo.vert(tip, reg.x + reg.w / 2, reg.y, undefined, g, 1);
      const ctr = scale(add(add(b0, b1), add(b2, tip)), 0.25);
      this.lo.triOut(i0, i1, it, ctr); this.lo.triOut(i1, i2, it, ctr); this.lo.triOut(i2, i0, it, ctr);
      this.tag(from, (i, A) => { A.swim[i * 4 + 3] = jaw; A.ao[i] = 1; });
    };
    const inset = T.inset ?? 0.82;
    for (const side of [1, -1]) {
      for (const [n, up] of [[T.upper, 1], [T.lower, 0]] as [number, number][]) {
        for (let k = 0; k < n; k++) {
          const u = n === 1 ? 0.5 : k / (n - 1);
          const t = t0 + (t1 - t0) * u;
          const a = this.th(t) * Math.PI;
          const sp = this.surf(t, a);
          const p: V3 = [sp[0], sp[1], sp[2] * side * inset];
          const sz = (up ? T.size : T.lowerSize ?? T.size) * L * (style === 'fang' ? (0.55 + 0.45 * Math.sin(u * Math.PI * 1.1 + 0.3) * (k % 2 ? 0.7 : 1)) : (0.85 + 0.15 * Math.sin(u * 9)));
          const dir: V3 = up ? [0, -1, 0] : [0, 1, 0];
          const jaw = up ? 0 : 1 - smoothstep(m.t - 0.03, m.t + 0.025, t);
          tooth(p, dir, sz, [0, 0, -side], jaw);
        }
      }
    }
  }

  // ----------------------------------------------------------------------------------------- painting
  paintBody() {
    const s = this.s, pg = this.pg, r = this.bodyR, L = this.L;
    const sc = s.scales;
    const m = s.mouth;
    const eps = 1.5 / (r.h - 1) * TAU;
    const lat = s.lateral, gill = s.gill;
    const eyeC = this.eyeC, eyeR = this.eyeR;
    const ctx: PaintCtx = { t: 0, a: 0, h: 0, side: 0, X: 0, Y: 0, Z: 0, yn: 0, yl: 0, L, px: 0, py: 0, sid: 0, sd: 1, eyeD: 1 };
    const lipC = m?.lipCol ? C(m.lipCol) : null, intC = C(m?.interior ?? '#3a0c14'), creaseC = C(m?.crease ?? '#1a0c10');
    const latC = lat ? C(lat.col) : null, gillC = C(gill?.col ?? '#1a1420'), gillHi = gill?.hi ? C(gill.hi) : null;
    // scale lattice (texel space; anterior scales overlap posterior ones): id + normalised distance per texel
    const SID = new Float32Array(r.w * r.h), SD = new Float32Array(r.w * r.h).fill(1), SX = new Float32Array(r.w * r.h);
    if (sc) for (let j = 0; j < r.h; j++) for (let i = 0; i < r.w; i++) {
      const sw = sc.w, sh = sc.h, row = Math.floor(j / sh);
      let bestX = -1e9, sid = 0, sd = 1;
      for (let rr = row - 1; rr <= row + 1; rr++) {
        const off = (rr & 1) * sw * 0.5;
        const col = Math.floor((i + off) / sw);
        for (let cc = col - 1; cc <= col + 1; cc++) {
          const cx = (cc + 0.5) * sw - off, cyy = (rr + 0.5) * sh;
          const dx = (i + 0.5 - cx) / (sw * 0.66), dy = (j + 0.5 - cyy) / (sh * 0.78);
          const d = Math.hypot(dx, dy);
          if (d < 1 && cx > bestX) { bestX = cx; sd = d; sid = hash2(cc, rr, 77); }
        }
      }
      SID[j * r.w + i] = sid; SD[j * r.w + i] = sd; SX[j * r.w + i] = bestX;
    }
    for (let j = 0; j < r.h; j++) for (let i = 0; i < r.w; i++) {
      const t = 1 - i / (r.w - 1), around = j / (r.h - 1), a = around * TAU;
      const p = this.surf(t, a);
      const c0 = this.cy(t) * L;
      ctx.t = t; ctx.a = a; ctx.h = Math.cos(a); ctx.side = Math.sin(a);
      ctx.X = p[0]; ctx.Y = p[1]; ctx.Z = p[2];
      ctx.yl = (p[1] - c0) / L;
      ctx.yn = p[1] >= c0 ? (p[1] - c0) / Math.max(1e-6, this.top(t) * L) : (p[1] - c0) / Math.max(1e-6, this.bot(t) * L);
      ctx.px = i; ctx.py = j;
      ctx.eyeD = Math.hypot(p[0] - eyeC[0], p[1] - eyeC[1], Math.abs(p[2]) - Math.abs(eyeC[2]));
      const sid = SID[j * r.w + i], sd = SD[j * r.w + i];
      ctx.sid = sid; ctx.sd = sd;
      let c = s.paint(ctx);
      let hgt = 0, rough = s.rough ?? 0.42;
      if (sc && t >= (sc.tMin ?? 0.17) && t <= (sc.tMax ?? 1)) {
        // imbricated scales: a 1 px shadow crescent just behind each scale's free edge (where the texel in
        // front belongs to a different, overlapping scale) and a softly lit centre
        const k = sc.k ?? 1;
        const fade = smoothstep(sc.tMin ?? 0.17, (sc.tMin ?? 0.17) + 0.05, t) * (0.35 + 0.65 * Math.min(1, Math.abs(ctx.side) * 1.6));
        const idx = j * r.w + i;
        const front = i + 1 < r.w ? SX[idx + 1] : SX[idx];
        let f = 1 + (0.5 - sd) * 0.07 * k * fade;
        if (front > SX[idx] + 0.1) f -= (sc.rim ?? 0.14) * k * fade;
        else if (sd < 0.3 && ((i + j) & 1) === 0) f += (sc.hi ?? 0.05) * k * fade;
        c = shade(c, f);
        hgt = (1 - sd * sd) * (sc.bump ?? 0.5) * fade;
      }
      // lateral line: dashed pale pores
      if (latC && lat && Math.abs(ctx.side) > 0.35 && t > (lat.t0 ?? 0.2) && t < (lat.t1 ?? 0.95)) {
        const ly = this.yAt(t, lat.y) + (lat.arch ?? 0) * Math.sin(Math.PI * t) * L;
        if (Math.abs(p[1] - ly) < L * 0.0045 && (i % (lat.dash ?? 3)) !== 0) { c = mix(c, latC, 0.55); hgt += 0.2; }
      }
      // operculum (gill cover): a curved edge that fades out toward the top/bottom, lit lip behind it
      if (gill && Math.abs(ctx.side) > 0.3) {
        const yr = ctx.yn;
        const top = gill.top ?? 0.72, bot = gill.bot ?? 0.8;
        if (yr < top && yr > -bot) {
          const span = yr >= 0 ? yr / top : -yr / bot;
          const xg = this.xAt(gill.t) - (gill.curve ?? 0.035) * L * (1 - span * span) - 0.01 * L * span;
          const dxp = (p[0] - xg) / (this.bodyLen / (r.w - 1));
          const fadeG = 1 - smoothstep(0.65, 1, span);
          if (dxp > -0.5 && dxp < 0.7) c = mix(c, gillC, (gill.k ?? 0.65) * fadeG);
          else if (dxp >= 0.7 && dxp < 1.8) c = gillHi ? mix(c, gillHi, 0.4 * fadeG) : shade(c, 1 + 0.1 * fadeG);
          else if (dxp > -4 && dxp <= -0.5) { c = shade(c, 1 - 0.05 * fadeG); hgt += 0.15 * fadeG * (1 + dxp / 4); }
        }
      }
      // eye socket: soft dark ring + lit rim above
      if (ctx.eyeD < eyeR * 1.5) {
        const q = ctx.eyeD / eyeR;
        if (q > 0.9 && q < 1.18) c = shade(c, 0.66);
        else if (q >= 1.18 && q < 1.5) c = shade(c, 0.93 - (s.eye.socket ?? 0) * 0.15 + (p[1] > eyeC[1] ? 0.1 : 0));
      }
      // mouth: interior band between the seam twins, crease and lips around it
      if (m) {
        const am = Math.min(a, TAU - a), thm = this.th(t) * Math.PI;
        const da = Math.abs(am - thm);
        const front = t < m.t + 0.01;
        if (front && da < eps * 0.75) { c = intC; rough = 0.3; }
        else if (front && da < eps * 1.9) { c = mix(c, creaseC, 0.85); }
        else if (front && lipC && da < 0.28) { c = mix(c, lipC, 0.85 * (1 - da / 0.28) + 0.2); }
      }
      // painted sheen band (upper flank), dithered
      if (s.sheen) {
        const hb = Math.exp(-(((ctx.yn - 0.35) / 0.22) ** 2)) * Math.abs(ctx.side);
        if (hb * s.sheen > bayer(i, j) * 0.9 + 0.05) c = shade(c, 1.12);
      }
      pg.set(r.x + i, r.y + j, c, 255, rough, hgt);
      if (s.glow) { const g = s.glow(ctx); if (g) pg.setGlow(r.x + i, r.y + j, g); }
    }
  }

  build(): BuiltFish {
    const s = this.s;
    this.buildBody();
    this.buildEyes();
    this.buildFins();
    this.buildTeeth();
    s.extras?.(this);
    this.paintBody();
    const { geo, A } = this.geometry();
    const n = this.lo.count;
    let morph = false;
    if (s.morph) {
      morph = true;
      const M = new Float32Array(n * 3), MN = new Float32Array(n * 3);
      const c = s.morph.centre;
      const nrm = geo.getAttribute('normal') as THREE.BufferAttribute;
      for (let i = 0; i < n; i++) {
        const p = this.lo.pos(i), root: V3 = [A.root[i * 3], A.root[i * 3 + 1], A.root[i * 3 + 2]];
        const off = A.morphOff?.[i];
        let q: V3;
        if (off) q = add(p, off);
        else { const rq = this.inflate(root); q = add(p, sub(rq, root)); }
        M[i * 3] = q[0] - p[0]; M[i * 3 + 1] = q[1] - p[1]; M[i * 3 + 2] = q[2] - p[2];
        const isBodyish = Math.hypot(p[0] - root[0], p[1] - root[1], p[2] - root[2]) < 1e-6 && !off;
        if (isBodyish) {
          const nn = norm(sub(q, c));
          MN[i * 3] = nn[0] - nrm.getX(i); MN[i * 3 + 1] = nn[1] - nrm.getY(i); MN[i * 3 + 2] = nn[2] - nrm.getZ(i);
        }
      }
      geo.setAttribute('aMorph', new THREE.BufferAttribute(M, 3));
      geo.setAttribute('aMorphN', new THREE.BufferAttribute(MN, 3));
    }
    geo.computeBoundingSphere();
    if (geo.boundingSphere) geo.boundingSphere.radius *= 1.25;
    const tex = this.pg.textures(s.normal ?? 2);
    const m = s.mouth;
    return {
      geo, tex, L: this.L, noseX: this.noseX, bodyLen: this.bodyLen,
      mouth: this.anchors.mouth, eye: this.anchors.eye, eyeR: this.eyeR,
      hinge: this.hinge, jawOpen: m?.open ?? 0, jawIdle: m?.idle ?? 0, morph, anchors: this.anchors,
    };
  }
}


// ------------------------------------------------------------------------------------------- paint helpers
/** countershading: back colour ramp -> flank -> belly by yn (-1..1) with dithered bands */
export function counter(cols: string[], steps = 7, mid = 0.5, k = 1) {
  const cs = cols.map((s) => C(s));
  return (yn: number, x: number, y: number): RGB => {
    let t = 1 - (yn * k * 0.5 + mid);
    t = Math.max(0, Math.min(1, t));
    let q = t * steps + (bayer(x, y) - 0.5) * 0.85;
    q = Math.round(Math.max(0, Math.min(steps, q))) / steps;
    const f = q * (cs.length - 1), i0 = Math.min(cs.length - 2, Math.floor(f));
    return mix(cs[i0], cs[i0 + 1], f - i0);
  };
}
export const noise2 = (x: number, y: number, s = 0) => vnoise(x, y, s);
export { hash2, smoothstep, mix, shade, C };
export type { RGB, Reg };
