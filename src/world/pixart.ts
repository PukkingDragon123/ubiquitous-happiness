// Hand-made pixel art, painted in code. Sprites are drawn into an indexed buffer: every pixel holds a material
// (a 3-5 tone hue-shifted ramp: shadows cooler, highlights warmer) and a tone index, so shading stays in
// clean, deliberate bands. Primitives understand light (from the upper left, the sun side): a blade gets a
// lit half, a shadow half, a midrib, corrugation lines and translucent warm edges; a bladder gets a sphere
// shade with a specular pixel. A final pass draws a 1 px outline in a darker, cooler tone of the neighbour's
// own ramp (selective outline), and the result is written into an atlas region.
//
//   const S = new Pix(48, 200);
//   const kelp = S.mat(hueRamp('#9a7a2a', 5));
//   S.blade([[24, 199], [22, 120], [26, 10]], (t) => 2, kelp, { rib: false });
//   S.outline(); S.toRegion(atlasRegion);
import type { RGB } from '../gfx/px';
import { hex } from '../gfx/px';
import type { Region } from './atlas';

export type P2 = [number, number];

// ------------------------------------------------------------------ colour
function rgb2hsl([r, g, b]: RGB): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return [h, s, l];
}
function hsl2rgb(h: number, s: number, l: number): RGB {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}
const toward = (h: number, target: number, k: number) => { let d = target - h; while (d > 180) d -= 360; while (d < -180) d += 360; return h + d * k; };

/**
 * A pixel-art ramp around a base colour: n tones from deep shadow to highlight. Shadows drift toward blue and
 * get a touch more saturated, highlights drift toward warm yellow and desaturate slightly.
 */
export function hueRamp(base: string, n = 5, o: { spread?: number; shift?: number; lo?: number; hi?: number } = {}): RGB[] {
  const [h, s, l] = rgb2hsl(hex(base));
  const out: RGB[] = [];
  const lo = o.lo ?? Math.max(0.06, l * 0.38), hi = o.hi ?? Math.min(0.93, l + (1 - l) * 0.55 * (o.spread ?? 1));
  const shift = o.shift ?? 0.22;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const L = lo + (hi - lo) * Math.pow(t, 0.9);
    let H = h;
    if (t < 0.5) H = toward(h, 235, (0.5 - t) * 2 * shift); else H = toward(h, 48, (t - 0.5) * 2 * shift);
    const S = Math.min(1, s * (1.15 - 0.35 * t));
    out.push(hsl2rgb(H, S, L));
  }
  return out;
}

// ------------------------------------------------------------------ the indexed canvas
export interface BladeOpts {
  /** midrib: 'dark' line, 'light' vein, or none */
  rib?: 'dark' | 'light' | null;
  /** corrugation period in px along the blade (kelp wrinkles), 0 = smooth */
  wrinkle?: number;
  /** serrated edge: tooth period in px */
  serrate?: number;
  /** tone offset for the whole blade (-1 darker, +1 lighter) */
  bias?: number;
  /** translucent warm rim on both edges */
  rim?: boolean;
  /** start index along the path for corrugation phase */
  phase?: number;
}

export class Pix {
  w: number; h: number;
  m: Uint8Array; t: Uint8Array;
  ramps: RGB[][] = [[[0, 0, 0]]];
  /** light direction in sprite space (x right, y down): the sun is up and to the left */
  L: P2 = [-0.55, -0.83];
  constructor(w: number, h: number) { this.w = w; this.h = h; this.m = new Uint8Array(w * h); this.t = new Uint8Array(w * h); }

  /** register a ramp, returns its material id */
  mat(r: RGB[]) { this.ramps.push(r); return this.ramps.length - 1; }
  top(m: number) { return this.ramps[m].length - 1; }
  in(x: number, y: number) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  set(x: number, y: number, m: number, t: number) {
    x = Math.floor(x); y = Math.floor(y);
    if (!this.in(x, y)) return;
    const i = y * this.w + x;
    this.m[i] = m; this.t[i] = Math.max(0, Math.min(this.top(m), Math.round(t)));
  }
  get(x: number, y: number) { return this.in(x, y) ? this.m[Math.floor(y) * this.w + Math.floor(x)] : 0; }
  tone(x: number, y: number) { return this.t[Math.floor(y) * this.w + Math.floor(x)]; }
  /** shift the tone of an existing pixel */
  bump(x: number, y: number, d: number) { if (this.get(x, y)) { const i = Math.floor(y) * this.w + Math.floor(x); this.t[i] = Math.max(0, Math.min(this.top(this.m[i]), this.t[i] + d)); } }

  /**
   * A lit blade along a polyline path (pixel coords) with a width profile in px. Each covered pixel is shaded
   * from where it sits across the blade (lit half / shadow half / rim / rib) and along it (corrugation).
   */
  blade(path: P2[], width: (t: number) => number, m: number, o: BladeOpts = {}) {
    // resample the path by arc length (1 px steps)
    const pts: P2[] = [path[0]];
    for (let i = 1; i < path.length; i++) {
      const [ax, ay] = path[i - 1], [bx, by] = path[i];
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay)));
      for (let k = 1; k <= n; k++) pts.push([ax + (bx - ax) * k / n, ay + (by - ay) * k / n]);
    }
    const N = pts.length, top = this.top(m), mid = Math.round(top * 0.5) + (o.bias ?? 0);
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9, wmax = 0;
    for (let i = 0; i < N; i++) { const wv = width(i / (N - 1)); wmax = Math.max(wmax, wv); minX = Math.min(minX, pts[i][0]); maxX = Math.max(maxX, pts[i][0]); minY = Math.min(minY, pts[i][1]); maxY = Math.max(maxY, pts[i][1]); }
    const R = wmax / 2 + 2;
    for (let y = Math.floor(minY - R); y <= Math.ceil(maxY + R); y++) for (let x = Math.floor(minX - R); x <= Math.ceil(maxX + R); x++) {
      if (!this.in(x, y)) continue;
      const px = x + 0.5, py = y + 0.5;
      // nearest sample along the path
      let bi = 0, bd = 1e9;
      for (let i = 0; i < N; i += 1) { const dx = px - pts[i][0], dy = py - pts[i][1], d = dx * dx + dy * dy; if (d < bd) { bd = d; bi = i; } }
      const t = bi / (N - 1);
      let hw = width(t) / 2;
      if (o.serrate && hw > 1.2) hw -= ((bi + (o.phase ?? 0)) % o.serrate) < o.serrate / 2 ? 0 : 0.8;
      const a = pts[Math.max(0, bi - 2)], b = pts[Math.min(N - 1, bi + 2)];
      let tx = b[0] - a[0], ty = b[1] - a[1]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      const nx = -ty, ny = tx;
      const s = ((px - pts[bi][0]) * nx + (py - pts[bi][1]) * ny) / Math.max(0.5, hw);
      const along = ((px - pts[bi][0]) * tx + (py - pts[bi][1]) * ty);
      if (Math.abs(s) > 1 || Math.abs(along) > 0.75) continue;
      // which side of the blade faces the sun
      const lit = s * (nx * -this.L[0] + ny * -this.L[1]);
      let tone = mid;
      if (lit > 0.25) tone = mid + 1;
      if (lit < -0.3) tone = mid - 1;
      if (o.rim !== false && Math.abs(s) > 0.72 && hw > 1.6) tone = lit > 0 ? top : mid;               // translucent edge
      if (o.rib === 'dark' && Math.abs(s) < 0.18 && hw > 1.4) tone = mid - 1;
      if (o.rib === 'light' && Math.abs(s) < 0.18 && hw > 1.4) tone = mid + 1;
      if (o.wrinkle && hw > 1.8) {
        const k = (bi + (o.phase ?? 0) + Math.round(Math.abs(s) * 1.5)) % o.wrinkle;
        if (k === 0) tone -= 1; else if (k === 1 && lit > 0) tone += 1;
      }
      this.set(x, y, m, tone);
    }
  }

  /** a thin stroke (stems, stipes, whips): 1-3 px, lit on the sun side */
  stem(path: P2[], width: (t: number) => number, m: number, bias = 0) { this.blade(path, width, m, { rim: false, bias }); }

  /** a sphere-shaded disc (gas bladders, bulbs, berries, polyps) with a specular pixel */
  ball(cx: number, cy: number, r: number, m: number, o: { spec?: boolean; bias?: number; ry?: number } = {}) {
    const top = this.top(m), ry = o.ry ?? r;
    for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r); x++) {
      const dx = (x + 0.5 - cx) / r, dy = (y + 0.5 - cy) / ry, d = dx * dx + dy * dy;
      if (d > 1) continue;
      const nz = Math.sqrt(1 - d), l = dx * this.L[0] + dy * this.L[1] + nz * 0.55;
      let tone = l > 0.75 ? top - 1 : l > 0.35 ? Math.round(top * 0.55) : l > 0.0 ? Math.round(top * 0.3) : 0;
      tone += o.bias ?? 0;
      this.set(x, y, m, tone);
    }
    if (o.spec !== false && r >= 1.5) this.set(cx - r * 0.4, cy - ry * 0.45, m, top);
  }

  /** filled polygon at a flat tone */
  poly(pts: P2[], m: number, tone: number) {
    let minY = 1e9, maxY = -1e9;
    for (const p of pts) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      const xs: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length], yy = y + 0.5;
        if ((y0 <= yy && y1 > yy) || (y1 <= yy && y0 > yy)) xs.push(x0 + ((yy - y0) / (y1 - y0)) * (x1 - x0));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.round(xs[k]); x < Math.round(xs[k + 1]); x++) this.set(x, y, m, tone);
    }
  }
  /** pixel-perfect line (Bresenham) at a tone */
  line(x0: number, y0: number, x1: number, y1: number, m: number, tone: number) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) { this.set(x0, y0, m, tone); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } }
  }

  /** 1 px selective outline: transparent pixels next to the sprite take the neighbour's darkest, cooled tone */
  outline(o: { skip?: (x: number, y: number) => boolean; diagonal?: boolean } = {}) {
    const add: [number, number, number][] = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.get(x, y)) continue;
      if (o.skip?.(x, y)) continue;
      let nm = this.get(x, y + 1) || this.get(x + 1, y) || this.get(x - 1, y) || this.get(x, y - 1);
      if (!nm && o.diagonal) nm = this.get(x + 1, y + 1) || this.get(x - 1, y + 1);
      if (nm) add.push([x, y, nm]);
    }
    for (const [x, y, m] of add) { const i = y * this.w + x; this.m[i] = m; this.t[i] = 255; }
  }
  /** inner shading: pixels whose lower-right neighbour is empty get one tone darker (a cast-shadow lip) */
  innerShadow() {
    const dark: number[] = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const i = y * this.w + x;
      if (!this.m[i] || this.t[i] === 255) continue;
      const below = this.get(x, y + 1), right = this.get(x + 1, y);
      if ((!below || this.t[(y + 1) * this.w + x] === 255) && (!right || this.t[y * this.w + x + 1] === 255)) dark.push(i);
    }
    for (const i of dark) this.t[i] = Math.max(0, this.t[i] - 1);
  }

  colour(i: number): RGB | null {
    const m = this.m[i];
    if (!m) return null;
    const r = this.ramps[m];
    if (this.t[i] === 255) { const c = r[0]; return [Math.round(c[0] * 0.55), Math.round(c[1] * 0.55 + 2), Math.round(c[2] * 0.62 + 8)]; }
    return r[this.t[i]];
  }
  /** write into an atlas region (flipX mirrors) */
  toRegion(reg: Region, flipX = false) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const c = this.colour(y * this.w + x);
      if (c) reg.set(flipX ? this.w - 1 - x : x, y, c);
    }
  }
}

// ------------------------------------------------------------------ helpers
/** a smooth curve through control points (Catmull-Rom), n samples */
export function curve(ctrl: P2[], n = 24): P2[] {
  const out: P2[] = [];
  const P = (i: number) => ctrl[Math.max(0, Math.min(ctrl.length - 1, i))];
  for (let s = 0; s <= n; s++) {
    const f = (s / n) * (ctrl.length - 1), i = Math.min(ctrl.length - 2, Math.floor(f)), t = f - i;
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const q = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
    out.push([q(p0[0], p1[0], p2[0], p3[0]), q(p0[1], p1[1], p2[1], p3[1])]);
  }
  return out;
}
/** point + tangent at fraction t along a polyline */
export function along(path: P2[], t: number): { p: P2; d: P2 } {
  const f = Math.max(0, Math.min(1, t)) * (path.length - 1), i = Math.min(path.length - 2, Math.floor(f)), k = f - i;
  const a = path[i], b = path[i + 1];
  const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
  return { p: [a[0] + dx * k, a[1] + dy * k], d: [dx / l, dy / l] };
}
