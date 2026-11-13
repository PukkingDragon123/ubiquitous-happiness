// Surface painter for the realistic CLEAN pixel texture library. A Surf is a tileable W x H canvas with colour
// (sRGB 0..255), height (0..1: normal map), roughness and metalness channels painted together.
//
// The rules (clean PS2-era pixel textures, never noise mush):
//   - build DELIBERATE SHAPES first (stone blocks, planks, strata, scales, plates) as a region map;
//   - shade each shape with a 4-6 tone hue-shifted ramp (darks cooler, lights warmer): a base tone per shape,
//     a 1 px highlight on its top-left edge, a 1 px shadow on its bottom-right edge, dark gaps between shapes
//     (baked AO + edge highlight);
//   - add details as hand-placed clusters (cracks, knots, nails, rivets, rust streaks, pores), never per-pixel
//     random speckle and never a dither fill; large tone zones only as a few clean, hard-edged patches.
import * as THREE from 'three';
import { hash2 } from '../../core/math';
import { Px, hex, type RGB } from '../px';

export { hex };
export type { RGB };
export const H = hash2;
export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (a: number, b: number, v: number) => { const t = clamp01((v - a) / (b - a || 1e-6)); return t * t * (3 - 2 * t); };
export const mixc = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const scl = (a: RGB, k: number): RGB => [a[0] * k, a[1] * k, a[2] * k];
export const pal = (...c: string[]): RGB[] => c.map((h) => hex(h));

// ---------------------------------------------------------------- hue-shifted ramps
function rgb2hsl([r, g, b]: RGB): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}
function hsl2rgb(h: number, s: number, l: number): RGB {
  h = ((h % 1) + 1) % 1; s = clamp01(s); l = clamp01(l);
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t: number) => { t = ((t % 1) + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}
/**
 * A pixel-art ramp of n tones around a base colour, dark -> light: darks shift hue toward blue-violet and lose a
 * little saturation, lights shift toward warm yellow (the classic hand-pixelled shading ramp).
 */
export function hramp(base: string, n = 5, spread = 0.55, hue = 0.035): RGB[] {
  const [h, s, l] = rgb2hsl(hex(base));
  const out: RGB[] = [];
  const mid = (n - 1) / 2;
  for (let i = 0; i < n; i++) {
    const t = (i - mid) / Math.max(1, mid);
    const nl = clamp01(l + t * spread * (t < 0 ? l : 1 - l));
    const toward = t < 0 ? 0.64 : 0.12;
    const dh = ((toward - h + 1.5) % 1) - 0.5;
    const nh = h + Math.sign(dh) * Math.min(Math.abs(dh), Math.abs(t) * hue);
    const ns = s + (t < 0 ? -0.06 * -t : 0.04 * t);
    out.push(hsl2rgb(nh, ns, nl));
  }
  return out;
}

/** periodic value noise (used only for a few broad, hard-edged tone zones) */
function pnoise(x: number, y: number, px: number, py: number, s: number) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const x0 = ((xi % px) + px) % px, x1 = (x0 + 1) % px, y0 = ((yi % py) + py) % py, y1 = (y0 + 1) % py;
  const a = hash2(x0, y0, s), b = hash2(x1, y0, s), c = hash2(x0, y1, s), d = hash2(x1, y1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export class Surf {
  w: number; h: number; seed: number;
  col: Float32Array; hgt: Float32Array; rgh: Float32Array; met: Float32Array; alp: Float32Array;
  /** region map for shape-based shading (-1 = gap) */
  ids: Int32Array;
  usesMetal = false; usesAlpha = false;
  /** normal map strength (height units per pixel) */
  bump = 3;

  constructor(w: number, h: number, seed: number) {
    this.w = w; this.h = h; this.seed = seed;
    const n = w * h;
    this.col = new Float32Array(n * 3); this.hgt = new Float32Array(n).fill(0.5); this.rgh = new Float32Array(n).fill(0.85);
    this.met = new Float32Array(n); this.alp = new Float32Array(n).fill(1); this.ids = new Int32Array(n).fill(-1);
  }
  i(x: number, y: number) { const w = this.w, h = this.h; return ((((Math.floor(y)) % h) + h) % h) * w + ((((Math.floor(x)) % w) + w) % w); }

  // ---------------------------------------------------------------- deterministic helpers
  /** hash 0..1 for an integer key (features, regions: never per-pixel tone jitter) */
  r(a: number, b: number, s = 0) { return hash2(Math.floor(a), Math.floor(b), this.seed * 7 + s); }
  /** a broad smooth field 0..1 (cells across the tile), tileable */
  n(x: number, y: number, cells: number, oct = 2, s = 0) {
    const cx = Math.max(1, Math.round(cells)), cy = Math.max(1, Math.round(cells * this.h / this.w));
    let a = 0, amp = 0.5, tot = 0, f = 1;
    for (let o = 0; o < oct; o++) {
      a += pnoise((x / this.w) * cx * f, (y / this.h) * cy * f, cx * f, cy * f, this.seed * 131 + s + o * 17) * amp;
      tot += amp; amp *= 0.5; f *= 2;
    }
    return a / tot;
  }
  /** a hard-edged zone index 0..levels-1 from a broad field (big clean patches, no mush) */
  zone(x: number, y: number, cells: number, levels = 2, s = 0) { return Math.min(levels - 1, Math.floor(smooth(0.3, 0.7, this.n(x, y, cells, 2, s)) * levels)); }
  /** tileable worley: [f1, f2, cell id 0..1, nearest point x, y] with `cells` cells across */
  wor(x: number, y: number, cells: number, s = 0, jitter = 1, cyCells?: number): [number, number, number, number, number] {
    const cx = Math.max(1, Math.round(cells)), cy = Math.max(1, Math.round(cyCells ?? cells * this.h / this.w));
    const sw = this.w / cx, sh = this.h / cy;
    const gx = Math.floor(x / sw), gy = Math.floor(y / sh);
    let f1 = 1e9, f2 = 1e9, id = 0, nx = 0, ny = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const ix = gx + i, iy = gy + j;
      const wx = ((ix % cx) + cx) % cx, wy = ((iy % cy) + cy) % cy;
      const px = (ix + 0.5 + (hash2(wx, wy, this.seed + s) - 0.5) * jitter) * sw, py = (iy + 0.5 + (hash2(wx, wy, this.seed + s + 9) - 0.5) * jitter) * sh;
      const d = Math.hypot(x - px, y - py);
      if (d < f1) { f2 = f1; f1 = d; id = wx + wy * cx; nx = px; ny = py; } else if (d < f2) f2 = d;
    }
    return [f1, f2, id, nx, ny];
  }
  /** nearest palette entry (clean band, no dithering); x, y, amt are accepted for compatibility and ignored */
  pick(p: RGB[], t: number, _x?: number, _y?: number, _amt?: number): RGB {
    return p[Math.max(0, Math.min(p.length - 1, Math.round(clamp01(t) * (p.length - 1))))];
  }
  tone(p: RGB[], k: number): RGB { return p[Math.max(0, Math.min(p.length - 1, Math.round(k)))]; }

  // ---------------------------------------------------------------- pixel access
  set(x: number, y: number, c: RGB) { const k = this.i(x, y) * 3; this.col[k] = c[0]; this.col[k + 1] = c[1]; this.col[k + 2] = c[2]; }
  get(x: number, y: number): RGB { const k = this.i(x, y) * 3; return [this.col[k], this.col[k + 1], this.col[k + 2]]; }
  blend(x: number, y: number, c: RGB, t: number) { if (t <= 0) return; const k = this.i(x, y) * 3; t = Math.min(1, t); this.col[k] += (c[0] - this.col[k]) * t; this.col[k + 1] += (c[1] - this.col[k + 1]) * t; this.col[k + 2] += (c[2] - this.col[k + 2]) * t; }
  shade(x: number, y: number, k: number) { const i = this.i(x, y) * 3; this.col[i] *= k; this.col[i + 1] *= k; this.col[i + 2] *= k; }
  H(x: number, y: number) { return this.hgt[this.i(x, y)]; }
  setH(x: number, y: number, v: number) { this.hgt[this.i(x, y)] = v; }
  addH(x: number, y: number, v: number) { this.hgt[this.i(x, y)] += v; }
  R(x: number, y: number, v: number) { this.rgh[this.i(x, y)] = v; }
  M(x: number, y: number, v: number) { this.met[this.i(x, y)] = v; this.usesMetal = true; }
  A(x: number, y: number, v: number) { this.alp[this.i(x, y)] = v; this.usesAlpha = true; }
  id(x: number, y: number) { return this.ids[this.i(x, y)]; }
  setId(x: number, y: number, v: number) { this.ids[this.i(x, y)] = v; }
  each(fn: (x: number, y: number) => void) { for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) fn(x, y); }
  rect(x0: number, y0: number, w: number, h: number, c: RGB) { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.set(x, y, c); }

  // ---------------------------------------------------------------- shapes
  /**
   * Shade the region map: each region gets its base tone (P index); its top/left edge pixels one tone up
   * (highlight), its bottom/right edge pixels one tone down (shadow); gap pixels (id < 0) get the gap colour.
   * Height follows (raised shapes, sunken gaps) so the normal map bevels the same edges.
   */
  bevel(P: RGB[], base: (id: number) => number, o: { gap?: RGB; hi?: number; lo?: number; rough?: (id: number) => number; skip?: (id: number) => boolean } = {}) {
    const hi = o.hi ?? 1, lo = o.lo ?? 1;
    this.each((x, y) => {
      const a = this.id(x, y);
      if (a < 0) { if (o.gap) this.set(x, y, o.gap); this.setH(x, y, 0.15); return; }
      if (o.skip?.(a)) return;
      const b = base(a);
      const up = this.id(x, y - 1) !== a, left = this.id(x - 1, y) !== a, down = this.id(x, y + 1) !== a, right = this.id(x + 1, y) !== a;
      let k = b, h = 0.7;
      if (down || right) { k = b - lo; h = 0.55; } else if (up || left) { k = b + hi; h = 0.65; }
      this.set(x, y, this.tone(P, k));
      this.setH(x, y, h);
      if (o.rough) this.R(x, y, o.rough(a));
    });
  }
  /** a shaded ball / pebble / knob lit from the upper left: n tones, optional 1 px dark rim + contact shadow */
  ball(cx: number, cy: number, rx: number, ry: number, P: RGB[], o: { rim?: RGB; shadow?: number; h?: number; base?: number } = {}) {
    const n = P.length - 1;
    for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, d = Math.sqrt(dx * dx + dy * dy);
      if (d > 1) {
        if (o.shadow && d < 1.3 && dx + dy > 0.4) this.shade(x, y, o.shadow);
        continue;
      }
      const lit = (-dx - dy) * 0.45 + (1 - d) * 0.55;
      let k = Math.round((o.base ?? 0.45) * n + lit * n * 0.75);
      if (o.rim && d > 0.82 && dx + dy > -0.2) { this.set(x, y, o.rim); this.addH(x, y, (o.h ?? 0.3) * 0.3); continue; }
      k = Math.max(0, Math.min(n, k));
      this.set(x, y, P[k]);
      this.addH(x, y, (o.h ?? 0.3) * Math.sqrt(1 - d * d));
    }
  }
  /** a deliberate jagged crack: 1 px dark core, a lit lower lip, a height dip */
  crack(pts: [number, number][], dark: RGB, lip: RGB | null, depth = 0.25) {
    for (let k = 0; k + 1 < pts.length; k++) {
      const [x0, y0] = pts[k], [x1, y1] = pts[k + 1];
      const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
      for (let i = 0; i <= n; i++) {
        const x = Math.round(x0 + ((x1 - x0) * i) / n), y = Math.round(y0 + ((y1 - y0) * i) / n);
        this.set(x, y, dark); this.addH(x, y, -depth);
        if (lip) this.set(x, y + 1, lip);
      }
    }
  }
  /** a jagged polyline from (x, y) heading along angle a, n segments of ~len px */
  jag(x: number, y: number, a: number, n: number, len: number, wob: number, s: number): [number, number][] {
    const pts: [number, number][] = [[x, y]];
    for (let k = 0; k < n; k++) {
      a += (this.r(k, s, 77) - 0.5) * wob;
      x += Math.cos(a) * len; y += Math.sin(a) * len;
      pts.push([x, y]);
    }
    return pts;
  }
  /** a streak running down (+y) from (x, y): a clean 2-step fade (rust bleed, water stain) */
  streak(x: number, y: number, len: number, c: RGB, c2: RGB, w = 1) {
    for (let i = 0; i < len; i++) for (let j = 0; j < w; j++) this.set(x + j, y + i, i < len * 0.55 ? c : c2);
  }
  /** darken crevices by one hard step (height below its neighbourhood), lift ridges by a step: baked AO, clean */
  cavity(k = 0.78, rad = 1, ridge = 1.08) {
    const W = this.w, Hh = this.h, src = this.hgt, out: [number, number, number][] = [];
    for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
      let s = 0, c = 0;
      for (let j = -rad; j <= rad; j++) for (let i = -rad; i <= rad; i++) { s += src[this.i(x + i, y + j)]; c++; }
      const d = src[y * W + x] - s / c;
      if (d < -0.06) out.push([x, y, k]); else if (d > 0.08 && ridge !== 1) out.push([x, y, ridge]);
    }
    for (const [x, y, f] of out) this.shade(x, y, f);
  }

  // ---------------------------------------------------------------- output
  build(): TexSet {
    const n = this.w * this.h, W0 = this.w, H0 = this.h;
    // data rows are bottom-up (v = 0 first): flip so painter y-down = texture top, matching Px.normalMap
    const c8 = new Uint8Array(n * 4), orm = new Uint8Array(n * 4), top = new Uint8Array(n * 4);
    for (let k = 0; k < n; k++) {
      const x = k % W0, y = (k / W0) | 0, o = ((H0 - 1 - y) * W0 + x) * 4;
      const r = Math.max(0, Math.min(255, Math.round(this.col[k * 3]))), g = Math.max(0, Math.min(255, Math.round(this.col[k * 3 + 1]))), b = Math.max(0, Math.min(255, Math.round(this.col[k * 3 + 2])));
      const a = Math.round(clamp01(this.alp[k]) * 255);
      c8[o] = r; c8[o + 1] = g; c8[o + 2] = b; c8[o + 3] = a;
      top[k * 4] = r; top[k * 4 + 1] = g; top[k * 4 + 2] = b; top[k * 4 + 3] = a;
      orm[o] = 255; orm[o + 1] = Math.round(clamp01(this.rgh[k]) * 255); orm[o + 2] = Math.round(clamp01(this.met[k]) * 255); orm[o + 3] = 255;
    }
    const map = dataTex(c8, this.w, this.h, true);
    const rough = dataTex(orm, this.w, this.h, false);
    const hg = this.hgt, W = this.w;
    const normal = Px.normalMap(this.w, this.h, (x, y) => hg[y * W + x], this.bump, true);
    normal.anisotropy = 4;
    normal.minFilter = THREE.NearestMipmapLinearFilter;
    return { map, normal, rough, metal: this.usesMetal ? rough : null, alpha: this.usesAlpha, w: this.w, h: this.h, pixels: top };
  }
}

export interface TexSet {
  /** sRGB colour (alpha used by glass / ice) */
  map: THREE.DataTexture;
  /** tangent-space normal map from the painted height */
  normal: THREE.DataTexture;
  /** roughness in G (and metalness in B): assign to roughnessMap (and metalnessMap when `metal` is set) */
  rough: THREE.DataTexture;
  metal: THREE.DataTexture | null;
  alpha: boolean;
  w: number; h: number;
  /** raw RGBA8 colour pixels, top row first (for texture sheets / sprite reuse) */
  pixels: Uint8Array;
}

function dataTex(d: Uint8Array, w: number, h: number, srgb: boolean) {
  const t = new THREE.DataTexture(d, w, h, THREE.RGBAFormat);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.magFilter = THREE.NearestFilter;
  // crisp texels inside each mip level (bilinear would blur at the ~1:1 texel density of the low-res render)
  t.minFilter = THREE.NearestMipmapLinearFilter;
  t.generateMipmaps = true;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}
