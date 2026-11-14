// Pix: the v3 icon painter. Icons are designed as small programs of shapes on a 32-px-per-cell grid and
// rasterised to clean pixel art at any size (32 per cell for the pack, 16 / 24 for lists and the HUD):
//
//   - hard pixel coverage (pixel centre inside the shape), no anti-aliasing, no noise, no dither;
//   - every shape is cel-shaded from ONE light (top-left, toward the viewer) into a hue-shifted ramp: 'round'
//     (spheres / blobs, from the shape's own distance field), 'cyl' (strokes: rods, blades, stems), 'flat'
//     (plates with a 1-2 px bevel: lit top-left edges, shaded bottom-right edges), 'facet' (gems: tones given);
//   - orphan pixels inside a shape are folded into their neighbours so bands read as clean clusters;
//   - a 1 px SELECTIVE outline: the deepest tone of the adjacent shape, darker still on the shadow side
//     (bottom / right), and 1 px inner contour lines where a shape overlaps another;
//   - explicit accents on top: px() / line() / glint() for shine pixels, grain, stitches, rivets.
//
//   const p = new Pix(32, 32);                       or new Pix(64, 32, 0.5) to draw a 32-grid design at 16 px
//   p.circle(16, 16, 10, R.pearl, { shade: 'round' });
//   p.stroke([[6, 26], [24, 8]], 2.5, R.wood);       a rod, shaded across its width
//   p.glint(12, 10);
//   const cv = p.render();
//
// Ramps are 6 colours, darkest -> brightest: [0] outline, [1] core shadow, [2] shadow, [3] base, [4] light,
// [5] highlight / specular.
import { hex, type RGB } from '../gfx/px';

export type V2 = [number, number];
export type Ramp = RGB[];
export const ramp = (...c: string[]): Ramp => c.map((s) => hex(s));

export type Shade = 'round' | 'cyl' | 'flat' | 'facet' | 'none';
export interface ShapeOpts {
  shade?: Shade;
  /** shift the light intensity (-1..1): >0 brighter */
  lift?: number;
  /** allow the brightest (specular) tone */
  spec?: boolean;
  /** bevel width for 'flat' (design px) */
  bevel?: number;
  /** a fixed ramp tone for every pixel ('facet' and solid fills) */
  tone?: number;
  /** draw a 1 px contour line where this shape overlaps an earlier one (default true) */
  edge?: boolean;
  /** this shape contributes to the outer outline (default true) */
  outline?: boolean;
  /** glows (voxel meshes use an emissive material for these pixels) */
  emit?: boolean;
  /** only paint where an earlier shape already is (decals: bands, patches, labels) */
  clip?: boolean;
  /** light direction override [x, y] (screen space, y down) */
  light?: V2;
  /** for 'round': the dome radius in design px (default: the shape's own max inside distance) */
  r?: number;
  /** for 'round': a softer, flatter dome (0..1) */
  flat?: number;
}

interface ShapeRec { ramp: Ramp; o: ShapeOpts; outline: RGB; deep: RGB }

const L0 = norm3(-0.62, -0.78, 0.9);
function norm3(x: number, y: number, z: number): [number, number, number] { const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; }
const mixC = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export class Pix {
  /** canvas size in px */
  readonly w: number; readonly h: number;
  /** design px -> canvas px */
  readonly k: number;
  /** design-space offset (applied before k) */
  ox = 0; oy = 0;
  private sid: Int16Array;       // shape id per pixel (-1 empty)
  private tone: Int8Array;       // ramp tone per pixel
  private lock: Uint8Array;      // explicit colours (no cleanup / recolour)
  private col: Uint8ClampedArray; // explicit colour per pixel when locked
  private shapes: ShapeRec[] = [];
  private noOutline: Uint8Array;
  emit: Uint8Array;

  constructor(w: number, h: number, k = 1) {
    this.w = w; this.h = h; this.k = k;
    this.sid = new Int16Array(w * h).fill(-1);
    this.tone = new Int8Array(w * h);
    this.lock = new Uint8Array(w * h);
    this.col = new Uint8ClampedArray(w * h * 3);
    this.noOutline = new Uint8Array(w * h);
    this.emit = new Uint8Array(w * h);
  }

  // ------------------------------------------------------------ coordinates
  /** design -> canvas */
  X(x: number) { return (x + this.ox) * this.k; }
  Y(y: number) { return (y + this.oy) * this.k; }
  has(x: number, y: number) { return x >= 0 && y >= 0 && x < this.w && y < this.h && this.sid[y * this.w + x] >= 0; }

  // ------------------------------------------------------------ core: fill a coverage function
  /**
   * paint a shape given its coverage test in CANVAS px (pixel centre) and an optional per-pixel normal;
   * returns the shape id
   */
  private fillShape(inside: (cx: number, cy: number) => boolean, bbox: [number, number, number, number], rampC: Ramp, o: ShapeOpts,
    normal?: (cx: number, cy: number) => [number, number, number] | null): number {
    const id = this.shapes.length;
    const outline = rampC[0];
    this.shapes.push({ ramp: rampC, o, outline, deep: mixC(outline, [8, 4, 16], 0.45) });
    const x0 = Math.max(0, Math.floor(bbox[0]) - 1), y0 = Math.max(0, Math.floor(bbox[1]) - 1);
    const x1 = Math.min(this.w - 1, Math.ceil(bbox[2]) + 1), y1 = Math.min(this.h - 1, Math.ceil(bbox[3]) + 1);
    const W = x1 - x0 + 1, H = y1 - y0 + 1;
    if (W <= 0 || H <= 0) return id;
    const m = new Uint8Array(W * H);
    let any = false;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (!inside(x + 0.5, y + 0.5)) continue;
      if (o.clip && this.sid[y * this.w + x] < 0) continue;
      m[(y - y0) * W + (x - x0)] = 1; any = true;
    }
    if (!any) return id;
    const shade = o.shade ?? 'round';
    // inside distance field (for round domes and flat bevels)
    let D: Float32Array | null = null, dmax = 1;
    if (!normal && (shade === 'round' || shade === 'flat')) { D = distField(m, W, H); for (const v of D) dmax = Math.max(dmax, v); }
    const L = o.light ? norm3(o.light[0], o.light[1], 0.9) : L0;
    const bevel = (o.bevel ?? 1.5) * Math.max(0.6, this.k);
    const R = o.r !== undefined ? o.r * this.k : dmax;
    const hgt = (i: number) => {
      if (!D) return 0;
      const d = Math.min(1, D[i] / Math.max(0.5, R));
      const dome = Math.sqrt(Math.max(0, 1 - (1 - d) * (1 - d)));
      return o.flat ? dome * (1 - o.flat) + Math.min(1, D[i] / 1.5) * o.flat : dome;
    };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!m[i]) continue;
      const gx = x + x0, gy = y + y0, gi = gy * this.w + gx;
      let t: number;
      if (o.tone !== undefined || shade === 'facet' || shade === 'none') t = o.tone ?? 3;
      else {
        let n: [number, number, number] | null = normal ? normal(gx + 0.5, gy + 0.5) : null;
        if (!n && D) {
          if (shade === 'round') {
            const s = (xx: number, yy: number) => (xx < 0 || yy < 0 || xx >= W || yy >= H || !m[yy * W + xx] ? -0.25 : hgt(yy * W + xx));
            const dx = (s(x + 1, y) - s(x - 1, y)) * 0.5, dy = (s(x, y + 1) - s(x, y - 1)) * 0.5;
            const sc = Math.max(2, R * 0.55);
            n = norm3(-dx * sc, -dy * sc, 1);
          } else {
            // flat: a bevel of `bevel` px tilting outward
            if (D[i] <= bevel) {
              const s = (xx: number, yy: number) => (xx < 0 || yy < 0 || xx >= W || yy >= H || !m[yy * W + xx] ? 0 : Math.min(bevel + 0.5, D[yy * W + xx]));
              const dx = s(x + 1, y) - s(x - 1, y), dy = s(x, y + 1) - s(x, y - 1);
              n = norm3(-dx * 1.4, -dy * 1.4, 1);
            } else n = [0, 0, 1];
          }
        }
        if (!n) n = [0, 0, 1];
        const li = n[0] * L[0] + n[1] * L[1] + n[2] * L[2] + (o.lift ?? 0);
        t = li < 0.18 ? 1 : li < 0.5 ? 2 : li < 0.76 ? 3 : li < 0.94 || !o.spec ? 4 : 5;
      }
      this.sid[gi] = id; this.tone[gi] = t; this.lock[gi] = 0;
      this.noOutline[gi] = o.outline === false ? 1 : 0;
      this.emit[gi] = o.emit ? 1 : 0;
    }
    return id;
  }

  // ------------------------------------------------------------ primitives (design coordinates)
  /** ellipse (rotated by rot radians) */
  ellipse(cx: number, cy: number, rx: number, ry: number, rp: Ramp, o: ShapeOpts & { rot?: number } = {}) {
    const k = this.k, X = this.X(cx), Y = this.Y(cy), RX = rx * k, RY = ry * k, c = Math.cos(o.rot ?? 0), s = Math.sin(o.rot ?? 0);
    const loc = (px: number, py: number) => { const dx = px - X, dy = py - Y; return [(dx * c + dy * s) / RX, (-dx * s + dy * c) / RY]; };
    const r = Math.max(RX, RY);
    const sphere = (o.shade ?? 'round') === 'round' && !o.r;
    return this.fillShape((px, py) => { const [u, v] = loc(px, py); return u * u + v * v <= 1; }, [X - r, Y - r, X + r, Y + r], rp, o,
      sphere ? (px, py) => {
        const [u, v] = loc(px, py); const d = u * u + v * v; const nz = Math.sqrt(Math.max(0, 1 - d));
        // rotate the local normal back to screen space
        const nx = u * c - v * s, ny = u * s + v * c;
        const f = o.flat ?? 0;
        return norm3(nx * (1 - f), ny * (1 - f), nz + f);
      } : undefined);
  }
  circle(cx: number, cy: number, r: number, rp: Ramp, o: ShapeOpts = {}) { return this.ellipse(cx, cy, r, r, rp, o); }

  /** filled polygon */
  poly(pts: V2[], rp: Ramp, o: ShapeOpts = {}) {
    const P = pts.map(([x, y]) => [this.X(x), this.Y(y)] as V2);
    const xs = P.map((p) => p[0]), ys = P.map((p) => p[1]);
    return this.fillShape((px, py) => inPoly(P, px, py), [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], rp, { shade: 'flat', ...o });
  }

  /** axis-aligned rounded rectangle */
  rect(x: number, y: number, w: number, h: number, rp: Ramp, o: ShapeOpts & { r?: number } = {}) {
    const X0 = this.X(x), Y0 = this.Y(y), X1 = this.X(x + w), Y1 = this.Y(y + h), rr = (o.r ?? 0) * this.k;
    return this.fillShape((px, py) => {
      if (px < X0 || py < Y0 || px > X1 || py > Y1) return false;
      if (rr <= 0) return true;
      const qx = Math.max(X0 + rr - px, 0, px - (X1 - rr)), qy = Math.max(Y0 + rr - py, 0, py - (Y1 - rr));
      return qx * qx + qy * qy <= rr * rr;
    }, [X0, Y0, X1, Y1], rp, { shade: 'flat', ...o, r: undefined });
  }

  /**
   * a stroke along a polyline with radius r (number or a function of t along the path), shaded like a
   * cylinder across its width; round caps
   */
  stroke(pts: V2[], r: number | ((t: number) => number), rp: Ramp, o: ShapeOpts & { caps?: boolean } = {}) {
    const P = pts.map(([x, y]) => [this.X(x), this.Y(y)] as V2);
    const seg: number[] = [0];
    for (let i = 1; i < P.length; i++) seg.push(seg[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
    const total = seg[seg.length - 1] || 1;
    const rad = (t: number) => (typeof r === 'number' ? r : r(t)) * this.k;
    let rmax = 0; for (let i = 0; i <= 20; i++) rmax = Math.max(rmax, rad(i / 20));
    const near = (px: number, py: number) => {
      let best = Infinity, bt = 0, bs = 0, bnx = 0, bny = 0;
      for (let i = 1; i < P.length; i++) {
        const [ax, ay] = P[i - 1], [bx, by] = P[i];
        const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy || 1e-6;
        let u = ((px - ax) * vx + (py - ay) * vy) / l2;
        const capped = u < 0 || u > 1;
        if (o.caps === false && ((i === 1 && u < 0) || (i === P.length - 1 && u > 1))) continue;
        u = Math.max(0, Math.min(1, u));
        const qx = ax + vx * u, qy = ay + vy * u, d = Math.hypot(px - qx, py - qy);
        if (d < best) { best = d; bt = (seg[i - 1] + u * Math.sqrt(l2)) / total; const ll = Math.sqrt(l2); bnx = -vy / ll; bny = vx / ll; bs = ((px - qx) * bnx + (py - qy) * bny); void capped; }
      }
      return { d: best, t: bt, s: bs, nx: bnx, ny: bny };
    };
    const xs = P.map((p) => p[0]), ys = P.map((p) => p[1]);
    const cyl = (o.shade ?? 'cyl') === 'cyl';
    return this.fillShape((px, py) => { const q = near(px, py); return q.d <= rad(q.t); },
      [Math.min(...xs) - rmax, Math.min(...ys) - rmax, Math.max(...xs) + rmax, Math.max(...ys) + rmax], rp, { shade: 'cyl', ...o },
      cyl ? (px, py) => {
        const q = near(px, py); const R = Math.max(0.5, rad(q.t));
        const u = Math.max(-1, Math.min(1, q.s / R)) * (q.d > R * 0.999 ? 1 : 1);
        const nz = Math.sqrt(Math.max(0, 1 - u * u));
        return norm3(q.nx * u, q.ny * u, nz + 0.05);
      } : undefined);
  }

  /** ring (annulus), optionally an arc a0..a1 */
  ring(cx: number, cy: number, r: number, th: number, rp: Ramp, o: ShapeOpts & { a0?: number; a1?: number; ry?: number } = {}) {
    const n = 40, a0 = o.a0 ?? 0, a1 = o.a1 ?? Math.PI * 2, ry = o.ry ?? r;
    const pts: V2[] = []; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * (i / n); pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * ry]); }
    return this.stroke(pts, th / 2, rp, o);
  }

  /** a star polygon */
  star(cx: number, cy: number, r0: number, r1: number, n: number, rp: Ramp, o: ShapeOpts & { rot?: number } = {}) {
    return this.poly(starPts(cx, cy, r0, r1, n, o.rot ?? -Math.PI / 2), rp, { shade: 'round', ...o });
  }

  // ------------------------------------------------------------ accents
  /** set one pixel (design coords) to an explicit colour; skips outlines/cleanup */
  px(x: number, y: number, c: string | RGB, o: { add?: boolean } = {}) {
    const gx = Math.floor(this.X(x) + 1e-6), gy = Math.floor(this.Y(y) + 1e-6);
    if (gx < 0 || gy < 0 || gx >= this.w || gy >= this.h) return;
    const i = gy * this.w + gx;
    if (!o.add && this.sid[i] < 0) return;
    const rgb = typeof c === 'string' ? hex(c) : c;
    if (this.sid[i] < 0) { this.sid[i] = this.shapes.length; this.shapes.push({ ramp: [rgb, rgb, rgb, rgb, rgb, rgb], o: {}, outline: mixC(rgb, [0, 0, 0], 0.6), deep: mixC(rgb, [0, 0, 0], 0.7) }); }
    this.lock[i] = 1; this.col[i * 3] = rgb[0]; this.col[i * 3 + 1] = rgb[1]; this.col[i * 3 + 2] = rgb[2];
  }
  /** set the ramp tone of an existing pixel (keeps its shape) */
  setTone(x: number, y: number, t: number) {
    const gx = Math.floor(this.X(x)), gy = Math.floor(this.Y(y));
    if (gx < 0 || gy < 0 || gx >= this.w || gy >= this.h) return;
    const i = gy * this.w + gx; if (this.sid[i] >= 0) { this.tone[i] = t; this.lock[i] = 0; }
  }
  /** a 1 px line of explicit colour (or a tone shift of what's under it when c is a number: -1 darker, +1 lighter) */
  line(pts: V2[], c: string | number, o: { add?: boolean } = {}) {
    for (let s = 1; s < pts.length; s++) {
      const [ax, ay] = [Math.floor(this.X(pts[s - 1][0])), Math.floor(this.Y(pts[s - 1][1]))], [bx, by] = [Math.floor(this.X(pts[s][0])), Math.floor(this.Y(pts[s][1]))];
      const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay), 1);
      for (let i = 0; i <= n; i++) {
        const gx = Math.round(ax + ((bx - ax) * i) / n), gy = Math.round(ay + ((by - ay) * i) / n);
        if (gx < 0 || gy < 0 || gx >= this.w || gy >= this.h) continue;
        const j = gy * this.w + gx;
        if (typeof c === 'number') { if (this.sid[j] >= 0 && !this.lock[j]) this.tone[j] = Math.max(0, Math.min(5, this.tone[j] + c)); }
        else this.px(gx / this.k - this.ox + 0.01, gy / this.k - this.oy + 0.01, c, o);
      }
    }
  }
  /** shift tones inside a predicate (design coords) by d: bands, stripes, shadows cast by other parts */
  shadeWhere(test: (x: number, y: number) => boolean, d: number, onlyShape = -1) {
    for (let gy = 0; gy < this.h; gy++) for (let gx = 0; gx < this.w; gx++) {
      const i = gy * this.w + gx;
      if (this.sid[i] < 0 || this.lock[i] || (onlyShape >= 0 && this.sid[i] !== onlyShape)) continue;
      if (test((gx + 0.5) / this.k - this.ox, (gy + 0.5) / this.k - this.oy)) this.tone[i] = Math.max(1, Math.min(5, this.tone[i] + d));
    }
  }
  /** a 4-point sparkle: centre white, arms in c2 (size 1 = plus, 2 = long cross) */
  glint(x: number, y: number, size = 1, c = '#ffffff', c2?: string) {
    const arm = c2 ?? c;
    this.px(x, y, c);
    for (let r = 1; r <= size; r++) { this.px(x + r, y, arm); this.px(x - r, y, arm); this.px(x, y + r, arm); this.px(x, y - r, arm); }
  }
  /** erase pixels where test is true (design coords) */
  erase(test: (x: number, y: number) => boolean) {
    for (let gy = 0; gy < this.h; gy++) for (let gx = 0; gx < this.w; gx++) {
      if (test((gx + 0.5) / this.k - this.ox, (gy + 0.5) / this.k - this.oy)) { const i = gy * this.w + gx; this.sid[i] = -1; this.lock[i] = 0; }
    }
  }

  // ------------------------------------------------------------ finish
  private cleanup() {
    const { w, h } = this;
    const nt = new Int8Array(this.tone);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, s = this.sid[i];
      if (s < 0 || this.lock[i]) continue;
      const t = this.tone[i];
      const cnt = new Map<number, number>(); let same = 0, n = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const j = yy * w + xx; if (this.sid[j] !== s || this.lock[j]) continue;
        n++; if (this.tone[j] === t) same++; else cnt.set(this.tone[j], (cnt.get(this.tone[j]) ?? 0) + 1);
      }
      if (n >= 3 && same === 0) { let best = t, bn = 0; for (const [tt, c] of cnt) if (c > bn || (c === bn && tt < best)) { best = tt; bn = c; } nt[i] = best; }
    }
    this.tone = nt;
  }

  /** render to a canvas */
  render(o: { outline?: boolean; contour?: boolean } = {}): HTMLCanvasElement {
    this.cleanup();
    const { w, h } = this;
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d')!;
    const img = ctx.createImageData(w, h);
    const D = img.data;
    const put = (i: number, c: RGB) => { D[i * 4] = c[0]; D[i * 4 + 1] = c[1]; D[i * 4 + 2] = c[2]; D[i * 4 + 3] = 255; };
    // fills + inner contours
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, s = this.sid[i];
      if (s < 0) continue;
      if (this.lock[i]) { put(i, [this.col[i * 3], this.col[i * 3 + 1], this.col[i * 3 + 2]]); continue; }
      const S = this.shapes[s];
      let t = this.tone[i];
      if (o.contour !== false && S.o.edge !== false) {
        // a pixel of a later shape that touches an earlier (behind) shape becomes a contour pixel
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const sj = this.sid[yy * w + xx];
          if (sj >= 0 && sj < s && !this.lock[yy * w + xx] && this.shapes[sj].o.edge !== false) { t = 0; break; }
        }
      }
      put(i, t === 0 ? S.outline : S.ramp[t]);
    }
    // outer selective outline
    if (o.outline !== false) {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x; if (this.sid[i] >= 0) continue;
        let best = -1, deep = false;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const j = yy * w + xx, s = this.sid[j];
          if (s < 0 || this.noOutline[j]) continue;
          if (s > best) best = s;
          if (dx < 0 || dy < 0) deep = true; // the filled pixel is up/left of us: we're on the shadow side
        }
        if (best >= 0) { const S = this.shapes[best]; put(i, deep ? S.deep : S.outline); }
      }
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  }
}

// ------------------------------------------------------------ geometry helpers
export function inPoly(P: V2[], x: number, y: number): boolean {
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [xi, yi] = P[i], [xj, yj] = P[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-9) + xi) c = !c;
  }
  return c;
}
export function starPts(cx: number, cy: number, r0: number, r1: number, n: number, rot = -Math.PI / 2): V2[] {
  const out: V2[] = [];
  for (let i = 0; i < n * 2; i++) { const a = rot + (i * Math.PI) / n; const r = i % 2 ? r1 : r0; out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  return out;
}
export function curve(f: (t: number) => V2, n = 24): V2[] { return Array.from({ length: n + 1 }, (_, k) => f(k / n)); }
export function bez(a: V2, b: V2, c: V2, n = 16): V2[] { return curve((t) => [(1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * b[0] + t * t * c[0], (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * b[1] + t * t * c[1]], n); }
export function bez3(a: V2, b: V2, c: V2, d: V2, n = 20): V2[] {
  return curve((t) => { const u = 1 - t; return [u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0], u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1]]; }, n);
}
/** points of a regular polygon */
export function ngon(cx: number, cy: number, rx: number, ry: number, n: number, rot = -Math.PI / 2): V2[] {
  return Array.from({ length: n }, (_, i) => { const a = rot + (i * Math.PI * 2) / n; return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry] as V2; });
}

/** two-pass chamfer distance (to the nearest empty pixel) inside a mask */
function distField(m: Uint8Array, W: number, H: number): Float32Array {
  const D = new Float32Array(W * H);
  const INF = 1e6, a = 1, b = Math.SQRT2;
  for (let i = 0; i < W * H; i++) D[i] = m[i] ? INF : 0;
  const g = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : D[y * W + x]);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; if (!m[i]) continue;
    D[i] = Math.min(D[i], g(x - 1, y) + a, g(x, y - 1) + a, g(x - 1, y - 1) + b, g(x + 1, y - 1) + b);
  }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
    const i = y * W + x; if (!m[i]) continue;
    D[i] = Math.min(D[i], g(x + 1, y) + a, g(x, y + 1) + a, g(x + 1, y + 1) + b, g(x - 1, y + 1) + b);
  }
  for (let i = 0; i < W * H; i++) if (m[i]) D[i] = Math.max(0.5, D[i] - 0.5);
  return D;
}
