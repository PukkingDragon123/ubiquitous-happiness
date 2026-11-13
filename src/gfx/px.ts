// Hi-res pixel-art texture painter. Every texture in the game (fish skins, rocks, people, items, UI art)
// is painted here in code, one pixel at a time, then uploaded with nearest-neighbour magnification so the
// pixels stay crisp on the 3D models.
//
//   const p = new Px(128, 64);
//   const skin = ramp(['#1b2a4a', '#3b6fa8', '#8fd3ff', '#eaffff'], 6);   // banded palette ramp
//   p.fill((x, y) => skin(fbm(x / 20, y / 20) , x, y));                     // dithered banding at x, y
//   p.outline('#0a0f1a');                                                  // 1 px dark outline around alpha
//   const tex = p.texture();                                               // THREE.CanvasTexture (sRGB, nearest)
//   const nrm = p.normalMap(heightFn, 2)                                   // optional normal map from a height field
import * as THREE from 'three';
import { clamp01, fbm, hash2 } from '../core/math';

export type RGB = [number, number, number];
export type RGBA = [number, number, number, number];

export function hex(c: string | number): RGB {
  if (typeof c === 'number') return [(c >> 16) & 255, (c >> 8) & 255, c & 255];
  const s = c.replace('#', '');
  const v = parseInt(s.length === 3 ? s.split('').map((ch) => ch + ch).join('') : s, 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
export const toHex = (c: RGB) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
export const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const mul = (a: RGB, k: number): RGB => [a[0] * k, a[1] * k, a[2] * k];
export const add = (a: RGB, b: RGB, k = 1): RGB => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
export const lum = (c: RGB) => (c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114) / 255;
/** hue-shifted shading: darker tones drift toward cool blue-violet, lights toward warm (classic pixel-art ramps) */
export function shade(c: RGB, k: number): RGB {
  if (k < 1) { const t = 1 - k; return mix(mul(c, k), [c[0] * 0.55 * k + 10 * t, c[1] * 0.6 * k + 14 * t, c[2] * 0.9 * k + 40 * t], 0.35 * t); }
  const t = Math.min(1, k - 1); return mix(c, [Math.min(255, c[0] + 70), Math.min(255, c[1] + 60), Math.min(255, c[2] + 30)], t);
}

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
export const bayer = (x: number, y: number) => BAYER4[(y & 3) * 4 + (x & 3)];

/**
 * A banded palette ramp. ramp(colors, steps)(t, x, y) -> RGB. With x, y given, the band edges are
 * ordered-dithered so gradients read like hand-placed pixel shading rather than smooth airbrush.
 */
export function ramp(colors: (string | RGB)[], steps = 0, dither = 0.6) {
  const cs = colors.map((c) => (typeof c === 'string' ? hex(c) : c));
  const at = (t: number): RGB => {
    t = clamp01(t) * (cs.length - 1);
    const i = Math.min(cs.length - 2, Math.floor(t));
    return mix(cs[i], cs[i + 1], t - i);
  };
  return (t: number, x?: number, y?: number): RGB => {
    if (!steps) return at(t);
    let q = clamp01(t) * steps;
    if (x !== undefined && y !== undefined) q += (bayer(x, y) - 0.5) * dither;
    return at(Math.round(Math.max(0, Math.min(steps, q))) / steps);
  };
}

export class Px {
  w: number; h: number; d: Uint8ClampedArray;
  constructor(w: number, h: number) { this.w = w; this.h = h; this.d = new Uint8ClampedArray(w * h * 4); }

  idx(x: number, y: number) { return ((y | 0) * this.w + (x | 0)) * 4; }
  inside(x: number, y: number) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  get(x: number, y: number): RGBA { const i = this.idx(x, y); return [this.d[i], this.d[i + 1], this.d[i + 2], this.d[i + 3]]; }
  alpha(x: number, y: number) { return this.inside(x, y) ? this.d[this.idx(x, y) + 3] : 0; }
  set(x: number, y: number, c: RGB | string, a = 255) {
    x |= 0; y |= 0;
    if (!this.inside(x, y)) return;
    const col = typeof c === 'string' ? hex(c) : c;
    const i = this.idx(x, y);
    this.d[i] = col[0]; this.d[i + 1] = col[1]; this.d[i + 2] = col[2]; this.d[i + 3] = a;
  }
  /** alpha-blend a colour over the pixel (keeps existing alpha if higher) */
  blend(x: number, y: number, c: RGB | string, t: number) {
    x |= 0; y |= 0;
    if (!this.inside(x, y) || t <= 0) return;
    const col = typeof c === 'string' ? hex(c) : c;
    const i = this.idx(x, y), k = clamp01(t);
    const a0 = this.d[i + 3] / 255;
    if (a0 === 0) { this.d[i] = col[0]; this.d[i + 1] = col[1]; this.d[i + 2] = col[2]; this.d[i + 3] = k * 255; return; }
    this.d[i] += (col[0] - this.d[i]) * k; this.d[i + 1] += (col[1] - this.d[i + 1]) * k; this.d[i + 2] += (col[2] - this.d[i + 2]) * k;
    this.d[i + 3] = Math.max(this.d[i + 3], k * 255);
  }
  /** multiply the pixel's colour by k (shading), alpha untouched */
  shadePx(x: number, y: number, k: number) {
    if (!this.inside(x, y)) return;
    const i = this.idx(x, y);
    const c = shade([this.d[i], this.d[i + 1], this.d[i + 2]], k);
    this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2];
  }
  fill(fn: (x: number, y: number) => RGB | RGBA | null) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const c = fn(x, y);
      if (!c) continue;
      this.set(x, y, [c[0], c[1], c[2]], c.length > 3 ? (c as RGBA)[3] : 255);
    }
    return this;
  }
  /** run fn on every opaque pixel, replacing its colour */
  map(fn: (c: RGBA, x: number, y: number) => RGB | RGBA | null) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const i = this.idx(x, y);
      if (this.d[i + 3] === 0) continue;
      const c = fn([this.d[i], this.d[i + 1], this.d[i + 2], this.d[i + 3]], x, y);
      if (!c) continue;
      this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2]; if (c.length > 3) this.d[i + 3] = (c as RGBA)[3];
    }
    return this;
  }
  rect(x0: number, y0: number, w: number, h: number, c: RGB | string, a = 255) {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.set(x, y, c, a);
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, c: RGB | string | ((nx: number, ny: number, x: number, y: number) => RGB | null), a = 255) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
      if (nx * nx + ny * ny > 1) continue;
      const col = typeof c === 'function' ? c(nx, ny, x, y) : c;
      if (col) this.set(x, y, col, a);
    }
  }
  circle(cx: number, cy: number, r: number, c: RGB | string, a = 255) { this.ellipse(cx, cy, r, r, c, a); }
  line(x0: number, y0: number, x1: number, y1: number, c: RGB | string, a = 255) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, c, a);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  /** filled polygon (even-odd) */
  poly(pts: [number, number][], c: RGB | string | ((x: number, y: number) => RGB | null), a = 255) {
    let minY = Infinity, maxY = -Infinity;
    for (const p of pts) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      const xs: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length];
        const yy = y + 0.5;
        if ((y0 <= yy && y1 > yy) || (y1 <= yy && y0 > yy)) xs.push(x0 + ((yy - y0) / (y1 - y0)) * (x1 - x0));
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.round(xs[k]); x < Math.round(xs[k + 1]); x++) {
        const col = typeof c === 'function' ? c(x, y) : c;
        if (col) this.set(x, y, col, a);
      }
    }
  }
  /** 1 px outline around opaque pixels (outer), optionally only where the neighbour is transparent */
  outline(c: RGB | string, a = 255, diag = false) {
    const add: [number, number][] = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.alpha(x, y) > 0) continue;
      const n = this.alpha(x - 1, y) || this.alpha(x + 1, y) || this.alpha(x, y - 1) || this.alpha(x, y + 1) ||
        (diag && (this.alpha(x - 1, y - 1) || this.alpha(x + 1, y + 1) || this.alpha(x + 1, y - 1) || this.alpha(x - 1, y + 1)));
      if (n) add.push([x, y]);
    }
    for (const [x, y] of add) this.set(x, y, c, a);
    return this;
  }
  /** darken opaque pixels that touch transparency (inner rim) */
  innerRim(k = 0.7) {
    const rim: [number, number][] = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (!this.alpha(x, y)) continue;
      if (!this.alpha(x - 1, y) || !this.alpha(x + 1, y) || !this.alpha(x, y - 1) || !this.alpha(x, y + 1)) rim.push([x, y]);
    }
    for (const [x, y] of rim) this.shadePx(x, y, k);
    return this;
  }
  /** light the image from a height field: lambert on the derived normal, light dir (lx, ly) in texture space */
  lightFromHeight(hf: (x: number, y: number) => number, lx = -0.6, ly = -0.7, strength = 0.5, bumpScale = 2) {
    const lz = 0.5, ll = Math.hypot(lx, ly, lz);
    this.map((c, x, y) => {
      const dx = (hf(x + 1, y) - hf(x - 1, y)) * bumpScale, dy = (hf(x, y + 1) - hf(x, y - 1)) * bumpScale;
      const nl = Math.hypot(dx, dy, 1);
      const ndl = (-dx * lx - dy * ly + lz) / (nl * ll);
      const k = 1 + (ndl - lz / ll) * strength;
      return shade([c[0], c[1], c[2]], Math.max(0.2, k));
    });
    return this;
  }
  /** sprinkle per-pixel value noise into the colour (breaks up flat areas, like hand dithering) */
  grain(amount = 0.06, seed = 1) {
    this.map((c, x, y) => { const k = 1 + (hash2(x, y, seed) - 0.5) * amount * 2; return [c[0] * k, c[1] * k, c[2] * k]; });
    return this;
  }
  /** stamp another Px onto this one at (ox, oy) */
  draw(src: Px, ox: number, oy: number, flipX = false) {
    for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
      const i = src.idx(flipX ? src.w - 1 - x : x, y);
      const a = src.d[i + 3];
      if (!a) continue;
      this.blend(ox + x, oy + y, [src.d[i], src.d[i + 1], src.d[i + 2]], a / 255);
    }
  }
  canvas(): HTMLCanvasElement {
    const cv = document.createElement('canvas');
    cv.width = this.w; cv.height = this.h;
    const ctx = cv.getContext('2d')!;
    const img = ctx.createImageData(this.w, this.h);
    img.data.set(this.d);
    ctx.putImageData(img, 0, 0);
    return cv;
  }
  /** a colour texture: nearest magnification (crisp pixels), trilinear minification (no shimmer at distance) */
  texture(o: { repeat?: boolean; mip?: boolean; srgb?: boolean } = {}): THREE.CanvasTexture {
    const t = new THREE.CanvasTexture(this.canvas());
    t.magFilter = THREE.NearestFilter;
    t.minFilter = o.mip === false ? THREE.NearestFilter : THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = o.mip !== false;
    t.colorSpace = o.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
    t.anisotropy = 4;
    if (o.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
    t.needsUpdate = true;
    return t;
  }
  /** tangent-space normal map from a height function sampled per pixel (pixel-stepped, so bumps follow the pixels) */
  static normalMap(w: number, h: number, hf: (x: number, y: number) => number, strength = 2, repeat = false): THREE.DataTexture {
    const d = new Uint8Array(w * h * 4);
    const H = (x: number, y: number) => hf(repeat ? (x + w) % w : Math.max(0, Math.min(w - 1, x)), repeat ? (y + h) % h : Math.max(0, Math.min(h - 1, y)));
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength, dy = (H(x, y + 1) - H(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1);
      // texture y runs down while uv v runs up: flip dy so +v is "up" in tangent space
      const i = ((h - 1 - y) * w + x) * 4;
      d[i] = (-dx / l * 0.5 + 0.5) * 255; d[i + 1] = (dy / l * 0.5 + 0.5) * 255; d[i + 2] = (1 / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
    const t = new THREE.DataTexture(d, w, h, THREE.RGBAFormat);
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.needsUpdate = true;
    return t;
  }
}

/** fbm wrapper in pixel units, seamless when tile > 0 (blends 4 offsets) */
export function pxNoise(x: number, y: number, scale: number, oct = 4, seed = 0, tile = 0): number {
  if (!tile) return fbm(x / scale, y / scale, oct, seed);
  const u = x / tile, v = y / tile;
  const a = fbm(x / scale, y / scale, oct, seed), b = fbm((x - tile) / scale, y / scale, oct, seed);
  const c = fbm(x / scale, (y - tile) / scale, oct, seed), d = fbm((x - tile) / scale, (y - tile) / scale, oct, seed);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

/** cellular (worley) distance in pixel units: returns [f1, f2, cellHash] */
export function worley(x: number, y: number, cell: number, seed = 0, tile = 0): [number, number, number] {
  const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
  let f1 = 1e9, f2 = 1e9, hid = 0;
  const nt = tile ? Math.round(tile / cell) : 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    let gx = cx + i, gy = cy + j;
    if (nt) { gx = ((gx % nt) + nt) % nt; gy = ((gy % nt) + nt) % nt; }
    const px = (cx + i + hash2(gx, gy, seed)) * cell, py = (cy + j + hash2(gx, gy, seed + 7)) * cell;
    const d = Math.hypot(x - px, y - py);
    if (d < f1) { f2 = f1; f1 = d; hid = hash2(gx, gy, seed + 13); } else if (d < f2) f2 = d;
  }
  return [f1, f2, hid];
}
