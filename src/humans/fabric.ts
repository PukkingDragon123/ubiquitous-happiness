// Pixel-art fabric & material painters shared by the people and their gear: knit (stockinette, cables,
// ribbing), cotton, denim, canvas, plaid flannel, PVC slicker, quilted nylon, waxed oilskin, fur, hair strands,
// wood grain and metals. Every function returns a colour for one texel; shading is banded with ordered
// dithering (hue-shifted shadows) so it reads as hand-placed pixels rather than airbrush.
import type { RGB } from '../gfx/px';
import { shade, mix, bayer } from '../gfx/px';
import { fbm, hash2 } from '../core/math';

// ------------------------------------------------------------------ fast tileable noise (precomputed fbm)
const NT = 256;
const TABLE = (() => {
  const t = new Float32Array(NT * NT);
  const tile = NT / 32;
  for (let y = 0; y < NT; y++) for (let x = 0; x < NT; x++) {
    // seamless: blend four offsets of the fbm
    const u = x / NT, v = y / NT, X = x / 32, Y = y / 32;
    const a = fbm(X, Y, 4, 7), b = fbm(X - tile, Y, 4, 7), c = fbm(X, Y - tile, 4, 7), d = fbm(X - tile, Y - tile, 4, 7);
    t[y * NT + x] = (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  }
  // stretch to ~0..1
  let lo = 1, hi = 0; for (const v of t) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  for (let i = 0; i < t.length; i++) t[i] = (t[i] - lo) / (hi - lo || 1);
  return t;
})();
/** smooth fbm noise 0..1 at pixel coords scaled by `scale` (pixels per noise cell ~ scale) */
export function nz(x: number, y: number, scale = 8, seed = 0): number {
  const fx = (x / scale) * 8 + seed * 37.13, fy = (y / scale) * 8 + seed * 19.71;
  const ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
  const x0 = ((ix % NT) + NT) % NT, y0 = ((iy % NT) + NT) % NT, x1 = (x0 + 1) % NT, y1 = (y0 + 1) % NT;
  const a = TABLE[y0 * NT + x0], b = TABLE[y0 * NT + x1], c = TABLE[y1 * NT + x0], d = TABLE[y1 * NT + x1];
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
}
export const hh = (x: number, y: number, s = 0) => hash2(x | 0, y | 0, s);

export let DITHER = false;
export function setDither(b: boolean) { DITHER = b; }
/** banded, dithered shade: k ~ 1 is the base colour; steps quantise k like a hand-made ramp */
export function band(c: RGB, k: number, x: number, y: number, step = 0.075): RGB {
  // v2: clean hard bands, no ordered-dither speckle (DITHER = true restores the v1 look)
  const q = Math.round((k + (DITHER ? (bayer(x, y) - 0.5) * step * 0.95 : 0)) / step) * step;
  return shade(c, Math.max(0.15, q));
}

// ------------------------------------------------------------------ fabrics
/** stockinette knit: columns of V stitches (4 x 3 px), k returned for shading */
const KNIT = [3, 1, 1, 3, 2, 3, 3, 2, 1, 2, 2, 1];
export function knitK(x: number, y: number, w = 4, h = 3): number {
  const lx = ((x % w) + w) % w, ly = ((y % h) + h) % h;
  const v = KNIT[Math.min(2, Math.floor((ly * 3) / h)) * 4 + Math.min(3, Math.floor((lx * 4) / w))];
  return 0.84 + v * 0.065;
}
/** 1x1 rib (vertical) */
export const ribK = (x: number, y: number) => ((x >> 1) & 1 ? 0.88 : 1.06) + ((y & 1) ? 0.0 : 0.02);
/** a twisted cable (panel-local lx in 0..w), returns k or 0 when off the ropes */
export function cableK(lx: number, y: number, w = 10, period = 18): number {
  const ph = (y / period) * Math.PI * 2;
  const c = w / 2, a = c + (w * 0.26) * Math.sin(ph), b = c - (w * 0.26) * Math.sin(ph);
  const front = Math.cos(ph) > 0;
  const da = Math.abs(lx + 0.5 - a), db = Math.abs(lx + 0.5 - b);
  const ra = 2.1, rb = 2.1;
  let k = 0;
  if (da < ra && (front || db > rb * 0.9)) k = 1.12 - (da / ra) * 0.3 - (Math.sin(ph * 2 + lx) > 0.6 ? 0.05 : 0);
  else if (db < rb) k = 1.08 - (db / rb) * 0.3;
  return k;
}
export function cotton(c: RGB, x: number, y: number, k = 1, seed = 1): RGB {
  const g = 1 + (hh(x, y, seed) - 0.5) * 0.05 + ((x + y) % 4 === 0 ? -0.025 : 0) + (nz(x, y, 18, seed) - 0.5) * 0.08;
  return band(c, k * g, x, y, 0.06);
}
export function denim(c: RGB, x: number, y: number, k = 1, seed = 2): RGB {
  const tw = (x + y * 2) % 3 === 0 ? 0.93 : 1.03;
  const fade = (nz(x, y, 14, seed) - 0.5) * 0.14;
  const fl = hh(x, y, seed) > 0.97 ? 1.12 : 1;
  return band(mix(c, [210, 220, 230], Math.max(0, fade) * 0.4), k * tw * fl * (1 + fade * 0.4), x, y, 0.06);
}
export function canvas(c: RGB, x: number, y: number, k = 1, seed = 3): RGB {
  const w = ((x & 1) ^ (y & 1)) ? 0.96 : 1.03;
  return band(c, k * w * (1 + (nz(x, y, 10, seed) - 0.5) * 0.12) * (1 + (hh(x, y, seed) - 0.5) * 0.05), x, y, 0.065);
}
/** plaid flannel: crossing stripe bands */
export function plaid(base: RGB, dark: RGB, light: RGB, x: number, y: number, k = 1, cell = 16): RGB {
  const lx = ((x % cell) + cell) % cell, ly = ((y % cell) + cell) % cell;
  const bx = lx < 5 ? 2 : lx === 9 ? 1 : 0, by = ly < 5 ? 2 : ly === 9 ? 1 : 0;
  let c = base;
  if (bx === 2 && by === 2) c = mix(dark, [0, 0, 0], 0.25);
  else if (bx === 2 || by === 2) c = mix(base, dark, 0.62);
  else if (bx === 1 || by === 1) c = mix(base, light, 0.55);
  const tw = (x + y) % 2 === 0 ? 1.02 : 0.96;
  return band(c, k * tw * (1 + (nz(x, y, 16, 4) - 0.5) * 0.1), x, y, 0.06);
}
/** glossy PVC (slickers, rubber boots): smooth, soft streaky highlights, darker creases */
export function pvc(c: RGB, x: number, y: number, k = 1, seed = 5): RGB {
  const n = nz(x * 0.6, y * 1.6, 20, seed);
  const crease = Math.max(0, 1 - Math.abs(nz(x, y * 0.5, 12, seed + 3) - 0.5) * 9);
  const hi = Math.max(0, n - 0.72) * 2.2;
  return band(c, k * (1 + hi * 0.5 - crease * 0.18), x, y, 0.08);
}
/** waxed oilskin: dark, mottled, scuffed lighter where it folds */
export function oilskin(c: RGB, x: number, y: number, k = 1, seed = 6): RGB {
  const m = nz(x, y, 9, seed), s = nz(x * 1.4, y * 0.6, 16, seed + 2);
  const scuff = Math.max(0, s - 0.68) * 1.8;
  return band(mix(c, [120, 116, 104], scuff * 0.5), k * (0.93 + m * 0.14) * (1 + (hh(x, y, seed) - 0.5) * 0.04), x, y, 0.07);
}
/** quilted nylon: horizontal baffles shaded round, stitched seams between */
export function quilted(c: RGB, x: number, y: number, period = 14, k = 1, seed = 7): RGB {
  const ly = ((y % period) + period) % period, f = ly / period;
  if (ly === 0) return band(c, k * 0.62, x, y);
  if (ly === 1 && x % 3 === 0) return band(c, k * 0.75, x, y);
  const round = 0.82 + Math.sin(f * Math.PI) * 0.3 - (f > 0.7 ? (f - 0.7) * 0.5 : 0);
  const sheen = nz(x, y, 14, seed) > 0.7 && f < 0.5 ? 0.08 : 0;
  return band(c, k * (round + sheen), x, y, 0.07);
}
/** fur: short strands with dark roots and light tips (dir: strand direction along y) */
export function fur(c: RGB, x: number, y: number, k = 1, seed = 8): RGB {
  const s = hh(x, y >> 2, seed), t = ((y + Math.floor(s * 4)) % 4) / 4;
  const kk = 0.78 + s * 0.3 + (1 - t) * 0.15 + (nz(x, y, 6, seed) - 0.5) * 0.2;
  return band(c, k * kk, x, y, 0.08);
}
/** hair strands: u across strands (texels), v along them; ported from Limbophobia's hairPx */
export function hairK(u: number, v: number, seed = 3): { k: number; sheen: number } {
  const s = Math.floor(u);
  const ha = hh(s, 7, seed), hb = hh(s >> 1, 9, seed + 1);
  const strand = ha * 0.55 + hb * 0.45;
  const along = 0.5 + 0.5 * Math.sin(v * 0.33 + ha * 6.28) * Math.sin(v * 0.11 + hb * 4);
  let t = 0.74 + strand * 0.38 + (along - 0.5) * 0.3;
  const clump = Math.sin((u + Math.sin(v * 0.12 + s * 0.7) * 1.6) * 0.9);
  if (clump < 0) t += clump * 0.18;
  return { k: t, sheen: (0.55 + strand * 0.9) * (0.6 + along * 0.8) };
}
export function hairCol(base: RGB, grey: number, u: number, v: number, x: number, y: number, light = 1, seed = 3): RGB {
  const { k, sheen } = hairK(u, v, seed);
  const hi: RGB = grey > 0.5 ? [252, 252, 250] : base[0] < 90 ? mix(base, [150, 160, 200], 0.6) : mix(base, [255, 240, 210], 0.5);
  const c = band(base, k * light, x, y, 0.08);
  return mix(c, hi, Math.min(0.55, Math.max(0, sheen - 0.95) * 0.9));
}
/** wood grain along x: rings warped by noise, darker latewood lines, knots */
export function wood(c: RGB, x: number, y: number, k = 1, seed = 9, grainScale = 1): RGB {
  const w = nz(x * 0.25, y * 1.2, 10, seed) * 6 * grainScale;
  const ring = Math.abs(Math.sin((y / grainScale + w) * 1.3));
  let kk = 0.9 + (ring > 0.9 ? -0.16 : ring < 0.3 ? 0.06 : 0) + (nz(x * 0.1, y, 30, seed + 1) - 0.5) * 0.18;
  kk *= 1 + (hh(x >> 2, y, seed) - 0.5) * 0.05;
  return band(c, k * kk, x, y, 0.07);
}
/** brushed / polished metal ramp */
export function metal(c: RGB, x: number, y: number, k = 1, seed = 10): RGB {
  const brush = 1 + (hh(x >> 1, y, seed) - 0.5) * 0.08 + (nz(x * 0.2, y * 3, 8, seed) - 0.5) * 0.1;
  return band(c, k * brush, x, y, 0.09);
}
/** a stitched seam: true on the dashed stitch texels along a line distance */
export const stitch = (d: number, along: number) => Math.abs(d) < 0.6 && ((along | 0) % 3 !== 0);
