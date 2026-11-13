// Clean texture kit for gear, weapons and skill props (PS2-era hand-painted look): flat tones, deliberate
// shapes and baked edge light / AO. No per-pixel noise, no dithering: every pixel cluster is placed on purpose.
//
//   const t = ctex('oak', 16, 64, (p) => { planks(p, 0, 0, 16, 64, WOOD_OAK, { vertical: true, seed: 3 }); });
import * as THREE from 'three';
import { Px, hex, type RGB } from '../gfx/px';
import { hash2 } from '../core/math';

export type Tones = string[]; // darkest -> brightest, 4-6 tones
export const T = {
  oak: ['#2a1a0e', '#4e3220', '#74502e', '#9a7242', '#c49c62'],
  drift: ['#3a3430', '#5e554c', '#857a6c', '#ab9f8c', '#d2c8b4'],
  steel: ['#1e2230', '#3c4458', '#626e86', '#94a2b8', '#d6e0ec'],
  iron: ['#1a1a20', '#33343e', '#4e505e', '#6e7282', '#9aa0b0'],
  brass: ['#3a1e08', '#6e4210', '#a86c1c', '#d8a03a', '#f8dc8a'],
  gold: ['#4a2004', '#8a520a', '#c88a18', '#f0c040', '#fff0a8'],
  leather: ['#24120a', '#43240f', '#64391a', '#8a5528', '#b07a44'],
  rope: ['#3a2812', '#6a4e26', '#977442', '#c0a06a'],
  red: ['#3a0610', '#6e0e1a', '#a81c24', '#d8382e', '#f86a4a'],
  navy: ['#080a14', '#121828', '#1e2840', '#2e3c5c', '#46587e'],
  purple: ['#160a2e', '#2a145a', '#46248a', '#663cb8', '#8e64e0'],
  blue: ['#08103a', '#12226e', '#1e38a0', '#3256c8', '#5a80ec'],
  green: ['#0c1a0e', '#1a3418', '#2c5424', '#447a32', '#6ca44a'],
  olive: ['#1e1c0a', '#3a3414', '#5e5420', '#867630', '#b09c48'],
  yellow: ['#3a2404', '#7a5208', '#c08818', '#f0c030', '#fff08a'],
  bone: ['#3a3024', '#665a48', '#968a72', '#c4b89c', '#ece4d0'],
  pink: ['#4a1a2a', '#7a3048', '#b05a74', '#e08aa0', '#ffc0cc'],
  mana: ['#1a0a4a', '#3a20a0', '#6050e0', '#a0a0ff', '#e8f0ff'],
  ice: ['#0e3050', '#2a6a9a', '#5aaad8', '#a8e4ff', '#f0ffff'],
  lava: ['#3a0804', '#8a1c06', '#d8480a', '#ff9a20', '#fff0a0'],
  venom: ['#0a2a08', '#1a5a10', '#3a9a20', '#7ad840', '#d0ff9a'],
  coral: ['#3a0a0e', '#7a1c1c', '#c0402c', '#f07a4a', '#ffc090'],
  shark: ['#141c26', '#26323e', '#3a4a5a', '#56687a', '#7a8c9c'],
  belly: ['#8a929a', '#b0b8be', '#d4dadc', '#eef2f2', '#ffffff'],
  slate: ['#14161e', '#262a36', '#3a3f4e', '#555c6e', '#7a8294'],
};

const cache = new Map<string, THREE.Texture>();
/** a cached clean texture (nearest filtering, repeat wrapping) */
export function ctex(key: string, w: number, h: number, fn: (p: Px) => void): THREE.Texture {
  let t = cache.get(key);
  if (!t) { const p = new Px(w, h); fn(p); t = p.texture({ repeat: true }); cache.set(key, t); }
  return t;
}
export const tone = (ts: Tones, i: number): RGB => hex(ts[Math.max(0, Math.min(ts.length - 1, Math.round(i)))]);

export function rect(p: Px, x: number, y: number, w: number, h: number, c: string | RGB) { p.rect(Math.round(x), Math.round(y), Math.round(w), Math.round(h), c); }

/** a bevelled panel: flat fill, a light top/left edge, a dark bottom/right edge (1 px each) */
export function bevel(p: Px, x: number, y: number, w: number, h: number, ts: Tones, base = 2, e = 1) {
  rect(p, x, y, w, h, tone(ts, base));
  rect(p, x, y, w, e, tone(ts, base + 2)); rect(p, x, y, e, h, tone(ts, base + 1));
  rect(p, x, y + h - e, w, e, tone(ts, base - 2)); rect(p, x + w - e, y, e, h, tone(ts, base - 1));
}

/** cylinder shading across a strip: discrete tone bands (light on the left, a highlight stripe, dark rim right) */
export function cylinder(p: Px, x: number, y: number, w: number, h: number, ts: Tones, vertical = true) {
  const n = vertical ? w : h;
  for (let i = 0; i < n; i++) {
    const k = i / (n - 1);
    const t = k < 0.12 ? 1 : k < 0.3 ? 3 : k < 0.42 ? 4 : k < 0.75 ? 2 : k < 0.92 ? 1 : 0;
    if (vertical) rect(p, x + i, y, 1, h, tone(ts, Math.min(ts.length - 1, t))); else rect(p, x, y + i, w, 1, tone(ts, Math.min(ts.length - 1, t)));
  }
}

/** wooden planks / a wood shaft: deliberate grain lines, plank seams, a knot or two */
export function planks(p: Px, x0: number, y0: number, w: number, h: number, ts: Tones, o: { vertical?: boolean; plank?: number; seed?: number; knots?: number } = {}) {
  const V = o.vertical ?? true, pl = o.plank ?? (V ? w : h), seed = o.seed ?? 1;
  const L = V ? h : w, W = V ? w : h;
  for (let a = 0; a < W; a++) for (let b = 0; b < L; b++) {
    const inP = a % pl, pi = Math.floor(a / pl);
    let t = 2 + (hash2(pi, 3, seed) > 0.5 ? 0 : 1) * 0;
    if (inP === 0) t = 3; else if (inP === pl - 1) t = 0; else if (inP === 1) t = 3;
    const x = V ? x0 + a : x0 + b, y = V ? y0 + b : y0 + a;
    p.set(x, y, tone(ts, t));
  }
  // grain: a few long wavy lines per plank
  for (let pi = 0; pi * pl < W; pi++) {
    const lines = Math.max(1, Math.floor(pl / 4));
    for (let k = 0; k < lines; k++) {
      const off = 2 + Math.floor(hash2(pi, k, seed) * Math.max(1, pl - 4));
      const ph = hash2(pi, k + 9, seed) * 6.28, amp = pl > 6 ? 1 : 0.6;
      for (let b = 0; b < L; b++) {
        if (hash2(pi * 7 + k, Math.floor(b / 9), seed) < 0.18) continue; // breaks in the grain
        const a = pi * pl + off + Math.round(Math.sin(b * 0.12 + ph) * amp);
        if (a % pl === 0 || a % pl === pl - 1) continue;
        const x = V ? x0 + a : x0 + b, y = V ? y0 + b : y0 + a;
        p.set(x, y, tone(ts, 1));
      }
    }
  }
  for (let k = 0; k < (o.knots ?? 1); k++) {
    const a = Math.floor(hash2(k, 21, seed) * W), b = Math.floor(hash2(k, 22, seed) * L);
    const x = V ? x0 + a : x0 + b, y = V ? y0 + b : y0 + a;
    p.ellipse(x + 0.5, y + 0.5, V ? 1.6 : 2.6, V ? 2.6 : 1.6, tone(ts, 0));
    p.set(x, y, tone(ts, 2));
  }
}

/** a dome rivet / bolt head: 2x2 with a highlight and a 1 px drop shadow */
export function rivet(p: Px, x: number, y: number, ts: Tones) {
  p.set(x + 1, y + 2, tone(ts, 0)); p.set(x + 2, y + 1, tone(ts, 0)); p.set(x + 2, y + 2, tone(ts, 0));
  p.set(x, y, tone(ts, 4)); p.set(x + 1, y, tone(ts, 3)); p.set(x, y + 1, tone(ts, 3)); p.set(x + 1, y + 1, tone(ts, 2));
}
/** a rust run dripping down from a point */
export function rust(p: Px, x: number, y: number, len: number) {
  for (let i = 0; i < len; i++) p.set(x, y + i, i < len * 0.6 ? '#7a3a14' : '#5a2a10');
  p.set(x + 1, y, '#a0521c'); p.set(x - 1, y + 1, '#5a2a10');
}
/** a stitched seam: dashes of light thread on a darker groove */
export function stitches(p: Px, x0: number, y0: number, x1: number, y1: number, thread = '#e8d0a0', groove = '#2a1608') {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= n; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / (n || 1)), y = Math.round(y0 + ((y1 - y0) * i) / (n || 1));
    p.set(x, y, i % 3 === 2 ? groove : thread);
  }
}
/** cloth with soft vertical folds (tone bands) and an optional trim band at the top / bottom */
export function cloth(p: Px, x0: number, y0: number, w: number, h: number, ts: Tones, fold = 8, trim?: { ts: Tones; top?: number; bottom?: number }) {
  for (let x = 0; x < w; x++) {
    const k = (x % fold) / fold;
    const t = k < 0.15 ? 3 : k < 0.5 ? 2 : k < 0.8 ? 1.4 : 1;
    rect(p, x0 + x, y0, 1, h, tone(ts, t));
  }
  if (trim) {
    const band = (y: number, hh: number) => { rect(p, x0, y, w, hh, tone(trim.ts, 3)); rect(p, x0, y, w, 1, tone(trim.ts, 4)); rect(p, x0, y + hh - 1, w, 1, tone(trim.ts, 1)); };
    if (trim.top) band(y0, trim.top);
    if (trim.bottom) band(y0 + h - trim.bottom, trim.bottom);
  }
}
/** a cut gem: facets as flat triangles of 4 tones around a centre, with a highlight cluster */
export function gemFacets(p: Px, x0: number, y0: number, w: number, h: number, ts: Tones) {
  const cx = x0 + w / 2, cy = y0 + h / 2;
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const a = Math.atan2(y + 0.5 - cy, x + 0.5 - cx);
    const r = Math.max(Math.abs(x + 0.5 - cx) / (w / 2), Math.abs(y + 0.5 - cy) / (h / 2));
    const sector = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 6);
    const t = r < 0.35 ? 3 : [2, 3, 4, 3, 1, 1][sector];
    p.set(x, y, tone(ts, t));
  }
  p.set(Math.floor(cx - w * 0.2), Math.floor(cy - h * 0.25), tone(ts, 4));
  p.set(Math.floor(cx - w * 0.2) + 1, Math.floor(cy - h * 0.25), '#ffffff');
}
/** darken the 1 px border of a region (baked AO where parts meet) */
export function edgeAO(p: Px, x: number, y: number, w: number, h: number, k = 0.7) {
  for (let i = 0; i < w; i++) { p.shadePx(x + i, y, k); p.shadePx(x + i, y + h - 1, k); }
  for (let j = 1; j < h - 1; j++) { p.shadePx(x, y + j, k); p.shadePx(x + w - 1, y + j, k); }
}
