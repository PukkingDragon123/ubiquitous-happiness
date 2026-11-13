// Clean PS2 textures. The painters were written for a hi-res, dithered, noisy look; v2 wants clean, deliberate
// pixel textures (32-128 px per part, 4-6 tones per material, no speckle). Every painted page / kit texture
// goes through here before upload:
//   half()      2x box downsample (512 x 768 pages -> 256 x 384: ~32-112 px per body part)
//   despeckle() replaces pixels that stand alone against their 3x3 neighbourhood (keeps 1 px lines and edges)
//   tones()     flattens shading into a few hard luminance steps per hue (no dither)
import { Px } from '../gfx/px';

const lum = (d: Uint8ClampedArray, i: number) => d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;

/** 2x box downsample (alpha thresholded) */
export function half(P: Px): Px {
  const w = P.w >> 1, h = P.h >> 1, out = new Px(w, h), s = P.d, d = out.d;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0, g = 0, b = 0, a = 0, n = 0;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const i = ((y * 2 + dy) * P.w + x * 2 + dx) * 4;
      if (s[i + 3] > 0) { r += s[i]; g += s[i + 1]; b += s[i + 2]; n++; }
      a += s[i + 3];
    }
    const o = (y * w + x) * 4;
    if (n) { d[o] = r / n; d[o + 1] = g / n; d[o + 2] = b / n; }
    d[o + 3] = a / 4 >= 128 ? 255 : 0;
  }
  return out;
}

/**
 * Remove isolated pixels: a texel whose luminance differs from at least 7 of its 8 neighbours by more than
 * `thr` takes the colour of its median-luminance neighbour. Lines (2 similar neighbours) survive.
 */
export function despeckle(P: Px, thr = 16, passes = 1) {
  const w = P.w, h = P.h;
  for (let pass = 0; pass < passes; pass++) {
    const src = new Uint8ClampedArray(P.d);
    const L = new Float32Array(9), I = new Int32Array(9);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const c = (y * w + x) * 4;
      if (src[c + 3] < 128) continue;
      const lc = lum(src, c);
      let unlike = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const i = ((y + dy) * w + x + dx) * 4;
        if (src[i + 3] < 128) continue;
        const l = lum(src, i);
        if (Math.abs(l - lc) > thr) unlike++;
        L[n] = l; I[n] = i; n++;
      }
      if (n < 6 || unlike < n - 1) continue;
      // median neighbour by luminance
      const ord = Array.from({ length: n }, (_, k) => k).sort((a, b) => L[a] - L[b]);
      const m = I[ord[n >> 1]];
      P.d[c] = src[m]; P.d[c + 1] = src[m + 1]; P.d[c + 2] = src[m + 2];
    }
  }
}

/** flatten shading into hard steps of `step` luminance (hue kept) */
export function tones(P: Px, step = 22) {
  const d = P.d;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) continue;
    const l = lum(d, i);
    if (l < 1) continue;
    const q = Math.max(step * 0.5, Math.round(l / step) * step);
    const k = q / l;
    d[i] = Math.min(255, d[i] * k); d[i + 1] = Math.min(255, d[i + 1] * k); d[i + 2] = Math.min(255, d[i + 2] * k);
  }
}

/** the full pass for a character page: half res, two despeckle passes, tone steps */
export function cleanPage(P: Px): Px {
  const H = half(P);
  despeckle(H, 14, 2);
  tones(H, 20);
  return H;
}
/** a light pass for small kit textures (no downsample) */
export function cleanKit(P: Px) {
  if (P.w >= 24 && P.h >= 24) despeckle(P, 16, 1);
  tones(P, 22);
}
