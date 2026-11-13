// Surface painter for the realistic pixel texture library. A Surf is a tileable W x H canvas with four
// channels painted together: colour (sRGB 0..255), height (0..1, for the normal map + cavity grime),
// roughness and metalness. Painters work like a pixel artist with a photo reference: limited, hue-shifted
// palettes picked with *clustered* dithering (organic clumps, never a bayer checkerboard on a world surface),
// structure at three scales (macro tone drift, meso features: cracks / planks / scales / weave, micro grain),
// then weathering (grime settling in cavities, wear on ridges, drips, stains). Everything wraps at the edges.
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

/** periodic value noise: lattice wraps every px / py cells */
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
  usesMetal = false; usesAlpha = false;
  /** normal map strength (height units per pixel) */
  bump = 3;
  private ctCache: Float32Array | null = null;

  constructor(w: number, h: number, seed: number) {
    this.w = w; this.h = h; this.seed = seed;
    const n = w * h;
    this.col = new Float32Array(n * 3); this.hgt = new Float32Array(n).fill(0.5); this.rgh = new Float32Array(n).fill(0.85);
    this.met = new Float32Array(n); this.alp = new Float32Array(n).fill(1);
  }
  i(x: number, y: number) { const w = this.w, h = this.h; return ((((y | 0) % h) + h) % h) * w + ((((x | 0) % w) + w) % w); }

  // ---------------------------------------------------------------- noise (all tileable on this canvas)
  /** fbm in 0..1 with `cells` lattice cells across the tile (x), aspect-correct on y; seed offset s */
  n(x: number, y: number, cells: number, oct = 3, s = 0) {
    const cx = Math.max(1, Math.round(cells)), cy = Math.max(1, Math.round(cells * this.h / this.w));
    let a = 0, amp = 0.5, tot = 0, f = 1;
    for (let o = 0; o < oct; o++) {
      a += pnoise((x / this.w) * cx * f, (y / this.h) * cy * f, cx * f, cy * f, this.seed * 131 + s + o * 17) * amp;
      tot += amp; amp *= 0.5; f *= 2;
    }
    return a / tot;
  }
  /** anisotropic fbm: separate cell counts for x and y (wood grain, fibres) */
  na(x: number, y: number, cx: number, cy: number, oct = 3, s = 0) {
    cx = Math.max(1, Math.round(cx)); cy = Math.max(1, Math.round(cy));
    let a = 0, amp = 0.5, tot = 0, f = 1;
    for (let o = 0; o < oct; o++) {
      a += pnoise((x / this.w) * cx * f, (y / this.h) * cy * f, cx * f, cy * f, this.seed * 131 + s + o * 17) * amp;
      tot += amp; amp *= 0.5; f *= 2;
    }
    return a / tot;
  }
  /** per-pixel hash 0..1 (wrapped) */
  r(x: number, y: number, s = 0) { const w = this.w, h = this.h; return hash2(((x % w) + w) % w, ((y % h) + h) % h, this.seed * 7 + s); }
  /** tileable worley: [f1, f2, cell id 0..1, nearest point x, y] with `cells` cells across */
  wor(x: number, y: number, cells: number, s = 0, jitter = 1): [number, number, number, number, number] {
    const cx = Math.max(1, Math.round(cells)), cy = Math.max(1, Math.round(cells * this.h / this.w));
    const sw = this.w / cx, sh = this.h / cy;
    const gx = Math.floor(x / sw), gy = Math.floor(y / sh);
    let f1 = 1e9, f2 = 1e9, id = 0, nx = 0, ny = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const ix = gx + i, iy = gy + j;
      const wx = ((ix % cx) + cx) % cx, wy = ((iy % cy) + cy) % cy;
      const px = (ix + 0.5 + (hash2(wx, wy, this.seed + s) - 0.5) * jitter) * sw, py = (iy + 0.5 + (hash2(wx, wy, this.seed + s + 9) - 0.5) * jitter) * sh;
      const d = Math.hypot(x - px, y - py);
      if (d < f1) { f2 = f1; f1 = d; id = hash2(wx, wy, this.seed + s + 3); nx = px; ny = py; } else if (d < f2) f2 = d;
    }
    return [f1, f2, id, nx, ny];
  }
  /** clustered dither threshold: smooth ~3 px noise + 2x2 block jitter (hand-pixelled clumps) */
  ct(x: number, y: number) {
    if (!this.ctCache) {
      const W = this.w, Hh = this.h, f = new Float32Array(W * Hh);
      for (let j = 0; j < Hh; j++) for (let i = 0; i < W; i++) {
        const nn = this.n(i, j, W / 3, 2, 991);
        f[j * W + i] = Math.min(0.98, Math.max(0.02, 0.5 + (nn - 0.5) * 1.8 + (this.r(i >> 1, j >> 1, 5) - 0.5) * 0.25));
      }
      this.ctCache = f;
    }
    return this.ctCache[this.i(x, y)];
  }
  /** pick from a palette at t with clustered dithering between neighbouring entries */
  pick(p: RGB[], t: number, x: number, y: number, amt = 1): RGB {
    const f = clamp01(t) * (p.length - 1);
    let k = Math.floor(f);
    if (f - k > 0.5 + (this.ct(x, y) - 0.5) * amt) k++;
    return p[Math.min(p.length - 1, Math.max(0, k))];
  }

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
  each(fn: (x: number, y: number) => void) { for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) fn(x, y); }

  // ---------------------------------------------------------------- weathering
  /** grime settles in cavities (height below its neighbourhood), wear brightens ridges */
  cavity(dark: RGB, amt = 0.5, rad = 2, wear = 0.15, wearCol?: RGB) {
    const W = this.w, Hh = this.h, src = this.hgt, avg = new Float32Array(W * Hh);
    for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
      let s = 0, c = 0;
      for (let j = -rad; j <= rad; j++) for (let i = -rad; i <= rad; i++) { s += src[this.i(x + i, y + j)]; c++; }
      avg[y * W + x] = s / c;
    }
    for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
      const d = src[y * W + x] - avg[y * W + x];
      if (d < -0.01) { const t = clamp01(-d * 6) * amt; if (t > this.ct(x, y) * 0.6) this.blend(x, y, dark, t); }
      else if (d > 0.02 && wear > 0) { const t = clamp01(d * 6) * wear; this.blend(x, y, wearCol ?? scl(this.get(x, y), 1.25), t); }
    }
  }
  /** noise-masked grime blotches (clustered, not smooth airbrush) */
  grime(c: RGB, amt: number, cells = 4, thr = 0.55, s = 0, roughTo = -1) {
    this.each((x, y) => {
      const nn = this.n(x, y, cells, 3, 500 + s) * 0.7 + this.n(x, y, cells * 3, 2, 520 + s) * 0.3;
      const t = (nn - thr) / (1 - thr);
      if (t > 0 && t * amt > this.ct(x, y) * 0.8) { this.blend(x, y, c, 0.3 + 0.45 * t); if (roughTo >= 0) this.R(x, y, roughTo); }
    });
  }
  /** vertical stains running down (+y is down the texture) */
  drips(c: RGB, count: number, maxLen: number, alpha = 0.35, s = 0, x0?: number, y0?: number) {
    for (let k = 0; k < count; k++) {
      let x = x0 ?? Math.floor(this.r(k, 1, 300 + s) * this.w);
      const y1 = y0 ?? Math.floor(this.r(k, 2, 300 + s) * this.h);
      const len = maxLen * (0.3 + this.r(k, 3, 300 + s) * 0.7);
      for (let y = 0; y < len; y++) {
        const t = 1 - y / len;
        this.blend(x, y1 + y, c, alpha * t);
        if (this.r(x, y1 + y, 310 + s) < 0.12) this.blend(x + 1, y1 + y, c, alpha * t * 0.5);
        if (this.r(k, y, 320 + s) < 0.03) x += this.r(k, y, 330) < 0.5 ? 1 : -1;
      }
    }
  }
  /** wandering crack: dark core, height dip, a lit lower lip */
  crack(x: number, y: number, n: number, dx: number, dy: number, dark: RGB, lip: RGB | null, wob = 0.5, depth = 0.25, s = 0) {
    let a = Math.atan2(dy, dx);
    for (let k = 0; k < n; k++) {
      this.set(x, y, dark); this.addH(x, y, -depth);
      if (lip) this.blend(x + 1, y + 1, lip, 0.35);
      this.blend(x - 1, y - 1, dark, 0.25);
      a += (this.r(k, Math.round(x * 7 + y), 700 + s) - 0.5) * wob;
      x += Math.cos(a); y += Math.sin(a);
      if (n > 8 && this.r(k, Math.round(y), 710 + s) < 0.012) this.crack(x, y, Math.floor(n * 0.25), Math.cos(a + 1.2), Math.sin(a + 1.2), dark, lip, wob, depth * 0.7, s + 13);
    }
  }
  /** irregular stain with a darker tide-line rim */
  stain(cx: number, cy: number, r: number, inner: RGB, rim: RGB, s = 0, a = 0.22) {
    for (let y = Math.floor(cy - r - 2); y <= cy + r + 2; y++) for (let x = Math.floor(cx - r - 2); x <= cx + r + 2; x++) {
      const ang = Math.atan2(y - cy, x - cx);
      const wob = r * (0.75 + 0.35 * hash2(Math.floor((ang + 4) * 3), s, 9) + 0.12 * Math.sin(ang * 5 + s));
      const d = Math.hypot(x - cx, y - cy);
      if (d < wob - 1) this.blend(x, y, inner, a); else if (d < wob + 0.5) this.blend(x, y, rim, a * 1.8);
    }
  }
  /** a lit bump (pebble, rivet, barnacle base): top-left bright, contact shadow bottom-right */
  bump2(x: number, y: number, rad: number, p: RGB[], hgt = 0.3) {
    const n = p.length - 1;
    for (let j = -rad - 1; j <= rad + 1; j++) for (let i = -rad - 1; i <= rad + 1; i++) {
      const d = Math.hypot(i, j) / (rad + 0.4);
      if (d <= 1) {
        this.set(x + i, y + j, p[Math.max(0, Math.min(n, Math.round(n * 0.55 + (-(i + j) / (rad + 0.5)) * n * 0.35)))]);
        this.addH(x + i, y + j, hgt * (1 - d * d));
      } else if (d < 1.35 && i + j > 0) this.shade(x + i, y + j, 0.72);
    }
  }
  /** sprinkle single pixels */
  speckle(cols: RGB[], density: number, s = 0, dh = 0) {
    const n = Math.floor(this.w * this.h * density);
    for (let k = 0; k < n; k++) {
      const x = Math.floor(this.r(k, 1, 900 + s) * this.w), y = Math.floor(this.r(k, 2, 900 + s) * this.h);
      this.set(x, y, cols[Math.floor(this.r(k, 3, 900 + s) * cols.length)]);
      if (dh) this.addH(x, y, dh);
    }
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
