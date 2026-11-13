// The particle sprite atlas: every 2D effect is hand-designed pixel art painted in code. Limited palettes (3-6
// tones), hard edges, 1 px dark outlines where they help (blood, gibs, smoke), animated strips of 3-8 frames.
// No soft gradients, no dither stipple, no noise: volumes (blood clouds, silt, smoke, fire) are clusters of
// ball-lit blobs that grow, then break apart.
import * as THREE from 'three';
import { Px, hex, type RGB } from './px';
import { clamp01, hash2 } from '../core/math';

export type PKind =
  // v1 kinds (kept: other modules use them)
  | 'bubble' | 'bubbleBig' | 'snow' | 'spark' | 'star' | 'droplet' | 'goo' | 'ink' | 'dust' | 'glow' | 'heart' | 'coin' | 'ember' | 'ring' | 'leaf' | 'zap'
  // gore / combat / elements
  | 'blood' | 'bloodDrop' | 'gib' | 'sparkPx' | 'silt' | 'smoke' | 'splash' | 'magic' | 'shock' | 'muzzle' | 'explosion' | 'chip' | 'fire'
  | 'hitStar' | 'slash' | 'sparkle' | 'heartP' | 'coinSpin' | 'poison' | 'rune' | 'frost' | 'bolt'
  // ambient
  | 'fleck' | 'mote' | 'glint' | 'bubbleS' | 'puff';

export type Anim = 'still' | 'life' | 'loop' | 'variant';
export type RotMode = 'none' | 'random' | 'quarter' | 'orient';
export interface SpriteDef { px: number; frames: number; anim: Anim; fps?: number; rot: RotMode; add: boolean; emit?: boolean; unlit?: boolean; life: number; size: number; vy?: number; grav?: number }

// per-kind defaults (size in metres at the gameplay plane; ~40 low-res px per metre)
export const DEFS: Record<PKind, SpriteDef> = {
  bubble: { px: 8, frames: 2, anim: 'loop', fps: 4, rot: 'none', add: false, life: 3, size: 0.16, vy: 0.4 },
  bubbleBig: { px: 16, frames: 2, anim: 'loop', fps: 3, rot: 'none', add: false, life: 3, size: 0.32, vy: 0.4 },
  snow: { px: 4, frames: 1, anim: 'still', rot: 'none', add: false, life: 8, size: 0.06 },
  spark: { px: 16, frames: 3, anim: 'life', rot: 'quarter', add: true, unlit: true, life: 0.35, size: 0.32 },
  star: { px: 16, frames: 1, anim: 'still', rot: 'none', add: true, unlit: true, life: 1.2, size: 0.22 },
  droplet: { px: 8, frames: 1, anim: 'still', rot: 'none', add: false, life: 1.2, size: 0.14, grav: -9.8 },
  goo: { px: 8, frames: 1, anim: 'still', rot: 'none', add: false, life: 1.2, size: 0.16, grav: -9.8 },
  ink: { px: 32, frames: 5, anim: 'life', rot: 'quarter', add: false, life: 2.5, size: 1.0 },
  dust: { px: 16, frames: 4, anim: 'life', rot: 'quarter', add: false, life: 1.2, size: 0.35, grav: -0.3 },
  glow: { px: 16, frames: 1, anim: 'still', rot: 'none', add: true, unlit: true, life: 0.5, size: 0.6 },
  heart: { px: 16, frames: 3, anim: 'loop', fps: 6, rot: 'none', add: false, unlit: true, life: 1.2, size: 0.3 },
  coin: { px: 8, frames: 4, anim: 'loop', fps: 10, rot: 'none', add: false, unlit: true, life: 1.2, size: 0.2, grav: -9.8 },
  ember: { px: 4, frames: 2, anim: 'loop', fps: 8, rot: 'none', add: true, unlit: true, life: 1.2, size: 0.1 },
  ring: { px: 32, frames: 4, anim: 'life', rot: 'none', add: true, unlit: true, life: 0.5, size: 1.0 },
  leaf: { px: 8, frames: 2, anim: 'loop', fps: 3, rot: 'random', add: false, life: 1.2, size: 0.2 },
  zap: { px: 16, frames: 3, anim: 'loop', fps: 18, rot: 'random', add: true, unlit: true, life: 0.3, size: 0.4 },
  blood: { px: 32, frames: 6, anim: 'life', rot: 'quarter', add: false, life: 3.6, size: 0.95 },
  bloodDrop: { px: 8, frames: 3, anim: 'variant', rot: 'orient', add: false, life: 1.4, size: 0.17, grav: -9.8 },
  gib: { px: 16, frames: 6, anim: 'variant', rot: 'quarter', add: false, life: 2.6, size: 0.38, grav: -9.8 },
  sparkPx: { px: 8, frames: 1, anim: 'still', rot: 'orient', add: true, unlit: true, life: 0.42, size: 0.24, grav: -6 },
  silt: { px: 32, frames: 6, anim: 'life', rot: 'quarter', add: false, life: 2.4, size: 0.95 },
  smoke: { px: 32, frames: 6, anim: 'life', rot: 'quarter', add: false, life: 2.6, size: 1.05 },
  splash: { px: 32, frames: 6, anim: 'life', rot: 'none', add: false, unlit: true, life: 0.55, size: 1.0 },
  magic: { px: 16, frames: 4, anim: 'loop', fps: 12, rot: 'none', add: true, unlit: true, life: 0.9, size: 0.42 },
  shock: { px: 64, frames: 6, anim: 'life', rot: 'none', add: true, unlit: true, life: 0.42, size: 2.2 },
  muzzle: { px: 32, frames: 3, anim: 'life', rot: 'orient', add: true, unlit: true, life: 0.075, size: 0.75 },
  explosion: { px: 64, frames: 8, anim: 'life', rot: 'none', add: false, emit: true, unlit: true, life: 0.95, size: 2.0 },
  chip: { px: 8, frames: 4, anim: 'variant', rot: 'quarter', add: false, life: 1.6, size: 0.16, grav: -9.8 },
  fire: { px: 16, frames: 4, anim: 'loop', fps: 14, rot: 'none', add: false, emit: true, unlit: true, life: 0.6, size: 0.45, vy: 0.6 },
  hitStar: { px: 16, frames: 4, anim: 'life', rot: 'quarter', add: true, unlit: true, life: 0.22, size: 0.6 },
  slash: { px: 32, frames: 4, anim: 'life', rot: 'orient', add: true, unlit: true, life: 0.16, size: 1.3 },
  sparkle: { px: 8, frames: 4, anim: 'loop', fps: 10, rot: 'none', add: true, unlit: true, life: 0.7, size: 0.22 },
  heartP: { px: 16, frames: 3, anim: 'loop', fps: 6, rot: 'none', add: false, unlit: true, life: 1.1, size: 0.34 },
  coinSpin: { px: 8, frames: 4, anim: 'loop', fps: 12, rot: 'none', add: false, unlit: true, life: 1.2, size: 0.22, grav: -9.8 },
  poison: { px: 8, frames: 3, anim: 'life', rot: 'none', add: false, unlit: true, life: 1.0, size: 0.2, vy: 0.5 },
  rune: { px: 16, frames: 4, anim: 'variant', rot: 'none', add: true, unlit: true, life: 0.9, size: 0.45 },
  frost: { px: 8, frames: 3, anim: 'variant', rot: 'orient', add: false, unlit: true, life: 0.8, size: 0.22, grav: -4 },
  bolt: { px: 16, frames: 3, anim: 'loop', fps: 20, rot: 'random', add: true, unlit: true, life: 0.2, size: 0.55 },
  fleck: { px: 4, frames: 3, anim: 'variant', rot: 'none', add: false, life: 7, size: 0.08 },
  mote: { px: 4, frames: 2, anim: 'loop', fps: 2, rot: 'none', add: false, unlit: true, life: 5, size: 0.08 },
  glint: { px: 8, frames: 4, anim: 'life', rot: 'none', add: true, unlit: true, life: 0.6, size: 0.2 },
  bubbleS: { px: 4, frames: 2, anim: 'loop', fps: 5, rot: 'none', add: false, life: 2.2, size: 0.07, vy: 0.6 },
  puff: { px: 16, frames: 4, anim: 'life', rot: 'quarter', add: false, life: 0.7, size: 0.45 },
};
export const KINDS = Object.keys(DEFS) as PKind[];

const AW = 512, AH = 512;
export interface Atlas { tex: THREE.Texture; rects: Record<string, Float32Array[]> }
let ATLAS: Atlas | null = null;
export function atlas(): Atlas { return (ATLAS ??= buildAtlas()); }

const P = (...c: string[]) => c.map((h) => hex(h));
/** nearest palette entry (clean bands) */
const tone = (cols: RGB[], t: number): RGB => cols[Math.max(0, Math.min(cols.length - 1, Math.round(clamp01(t) * (cols.length - 1))))];

function buildAtlas(): Atlas {
  const p = new Px(AW, AH);
  const rects: Record<string, Float32Array[]> = {};
  let sx = 0, sy = 0, shelf = 0;
  const alloc = (w: number, h: number): [number, number] => {
    if (sx + w > AW) { sx = 0; sy += shelf + 1; shelf = 0; }
    const r: [number, number] = [sx, sy];
    sx += w + 1; shelf = Math.max(shelf, h);
    return r;
  };
  const order = [...KINDS].sort((a, b) => DEFS[b].px - DEFS[a].px);
  const origin: Record<string, [number, number][]> = {};
  for (const k of order) {
    const d = DEFS[k];
    origin[k] = []; rects[k] = [];
    for (let f = 0; f < d.frames; f++) {
      const [x, y] = alloc(d.px, d.px);
      origin[k].push([x, y]);
      rects[k].push(new Float32Array([x / AW, y / AH, d.px / AW, d.px / AH]));
    }
  }
  const at = (k: PKind, f = 0) => origin[k][f];
  paint(p, at);
  return { tex: p.texture({ mip: false }), rects };
}

// ------------------------------------------------------------------------------------------------ drawing kit
type Blob = [number, number, number, RGB[]?]; // x, y, r, palette override
/**
 * Paint a cluster of ball-lit blobs into a cell: each pixel takes the blob it is deepest inside, shaded from the
 * upper left into the blob's palette (dark -> light, hard bands); later blobs paint over earlier ones when they
 * overlap equally. Optional 1 px outline around the union.
 */
function blobs(p: Px, ox: number, oy: number, S: number, list: Blob[], pal: RGB[], outline?: RGB) {
  const inside = new Uint8Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let best = 0, bi = -1, lx = 0, ly = 0;
    for (let i = 0; i < list.length; i++) {
      const [bx, by, r] = list[i];
      if (r <= 0.3) continue;
      const dx = (x + 0.5 - bx) / r, dy = (y + 0.5 - by) / r;
      const v = 1 - Math.sqrt(dx * dx + dy * dy);
      if (v > 0 && v >= best) { best = v; bi = i; lx = dx; ly = dy; }
    }
    if (bi < 0) continue;
    const cols = list[bi][3] ?? pal;
    const lit = 0.5 + (-lx - ly) * 0.38 + best * 0.3;
    p.set(ox + x, oy + y, tone(cols, lit));
    inside[y * S + x] = 1;
  }
  if (!outline) return;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (inside[y * S + x]) continue;
    const n = (x > 0 && inside[y * S + x - 1]) || (x < S - 1 && inside[y * S + x + 1]) || (y > 0 && inside[(y - 1) * S + x]) || (y < S - 1 && inside[(y + 1) * S + x]);
    if (n) p.set(ox + x, oy + y, outline);
  }
}
/** a volume that blooms then breaks apart: frame t in 0..1 */
function cloud(p: Px, ox: number, oy: number, S: number, t: number, seed: number, pal: RGB[], o: { outline?: RGB; rise?: number; n?: number } = {}) {
  const c = S / 2, n = o.n ?? 7;
  const list: Blob[] = [];
  const grow = 0.45 + 0.75 * Math.min(1, t * 1.6);
  const shrink = t > 0.55 ? 1 - (t - 0.55) * 1.35 : 1;
  for (let i = 0; i < n; i++) {
    const a = hash2(i, 1, seed) * Math.PI * 2, d0 = (0.1 + hash2(i, 2, seed) * 0.28) * S;
    const r0 = (0.14 + hash2(i, 3, seed) * 0.1) * S;
    const spread = 0.35 + 1.1 * t;
    const r = Math.min(r0 * grow * shrink, c - 1.5);
    let x = c + Math.cos(a) * d0 * spread, y = c + Math.sin(a) * d0 * spread * 0.85 - (o.rise ?? 0) * t * S * 0.15;
    x = Math.max(r + 1, Math.min(S - r - 1, x)); y = Math.max(r + 1, Math.min(S - r - 1, y));
    list.push([x, y, r]);
  }
  if (t < 0.6) list.push([c, c - (o.rise ?? 0) * t * S * 0.1, Math.min(c - 2, S * 0.2 * grow)]);
  blobs(p, ox, oy, S, list, pal, o.outline);
}
const ring = (p: Px, ox: number, oy: number, cx: number, cy: number, r: number, th: number, c: RGB | string, a = 255) => {
  const S = Math.ceil(r + th + 1);
  for (let y = -S; y <= S; y++) for (let x = -S; x <= S; x++) { const d = Math.hypot(x + 0.5, y + 0.5); if (Math.abs(d - r) < th / 2) p.set(ox + cx + x, oy + cy + y, c, a); }
};
const plus = (p: Px, ox: number, oy: number, cx: number, cy: number, arm: number, c: string, tip: string) => {
  for (let i = -arm; i <= arm; i++) { const col = Math.abs(i) === arm ? tip : c; p.set(ox + cx + i, oy + cy, col); p.set(ox + cx, oy + cy + i, col); }
};

// ------------------------------------------------------------------------------------------------ the sprites
function paint(p: Px, at: (k: PKind, f?: number) => [number, number]) {
  let o: [number, number];
  // ---- bubbles: a crisp ring, a 1 px body tint, a 2 px highlight (two wobble frames)
  for (let f = 0; f < 2; f++) {
    o = at('bubble', f);
    const rx = f ? 3 : 2.6, ry = f ? 2.6 : 3;
    p.ellipse(o[0] + 4, o[1] + 4, rx, ry, (nx, ny) => (Math.hypot(nx, ny) > 0.62 ? hex('#cdf2fa') : null));
    p.set(o[0] + 3, o[1] + 2, '#ffffff'); p.set(o[0] + 2, o[1] + 3, '#ffffff');
    o = at('bubbleBig', f);
    p.ellipse(o[0] + 8, o[1] + 8, f ? 7 : 6.4, f ? 6.4 : 7, (nx, ny) => (Math.hypot(nx, ny) > 0.8 ? hex('#cdf2fa') : Math.hypot(nx, ny) > 0.68 ? hex('#7cc4dc') : null));
    p.rect(o[0] + 4, o[1] + 4, 2, 1, '#ffffff'); p.rect(o[0] + 4, o[1] + 5, 1, 2, '#ffffff'); p.set(o[0] + 11, o[1] + 11, '#bfe8f4');
    o = at('bubbleS', f);
    p.set(o[0] + 1, o[1] + 1, '#d8f6ff'); p.set(o[0] + 2, o[1] + 1, f ? '#9cd8ec' : '#d8f6ff'); p.set(o[0] + 1, o[1] + 2, '#9cd8ec'); p.set(o[0] + 2, o[1] + 2, f ? '#d8f6ff' : '#9cd8ec');
  }
  o = at('snow'); p.set(o[0] + 1, o[1] + 1, '#e4e8de'); p.set(o[0] + 2, o[1] + 1, '#b8beb4');
  // ---- spark: 4-arm cross collapsing to a dot (white, tinted per particle)
  for (let f = 0; f < 3; f++) { o = at('spark', f); const arm = [6, 4, 2][f]; plus(p, o[0], o[1], 8, 8, arm, '#ffffff', '#fff2b0'); if (f === 0) for (const [dx, dy] of [[-2, -2], [2, 2], [2, -2], [-2, 2]]) p.set(o[0] + 8 + dx, o[1] + 8 + dy, '#fff2b0'); }
  o = at('star');
  p.poly([[8, 1], [10, 6], [15, 6], [11, 9], [13, 15], [8, 11], [3, 15], [5, 9], [1, 6], [6, 6]].map(([x, y]) => [o[0] + x, o[1] + y] as [number, number]), (_x, y) => (y - o[1] < 7 ? hex('#ffe88a') : hex('#f2b23a')));
  p.outline('#6a3a08'); p.set(o[0] + 7, o[1] + 5, '#ffffff');
  // ---- droplets / goo
  o = at('droplet'); p.ellipse(o[0] + 4, o[1] + 4, 2.4, 3, (_nx, ny) => (ny < -0.2 ? hex('#d8f6ff') : hex('#6cbcd8'))); p.set(o[0] + 3, o[1] + 3, '#ffffff');
  o = at('goo'); p.ellipse(o[0] + 4, o[1] + 4, 3, 2.6, (nx, ny) => (nx < -0.2 && ny < -0.2 ? hex('#ffd8e0') : ny > 0.3 ? hex('#c06080') : hex('#f090a8')));
  // ---- ink: dark violet-black cloud clusters (no outline: ink is the darkest thing)
  for (let f = 0; f < 5; f++) { o = at('ink', f); cloud(p, o[0], o[1], 32, f / 4, 51, P('#08060e', '#120e1e', '#1e1830', '#2c2444')); }
  // ---- dust / small puff / silt / smoke / blood volumes
  const SILT = P('#4a3e2c', '#6a5a42', '#8a7a5a', '#a89874', '#c0b290');
  const SMOKE = P('#262628', '#3a3a3e', '#525256', '#6e6e72', '#8a8a8a');
  const BLOOD = P('#3a0608', '#5e0e10', '#80181a', '#a02a26', '#c04a40');
  for (let f = 0; f < 4; f++) { o = at('dust', f); cloud(p, o[0], o[1], 16, f / 3, 61, SILT, { n: 4, rise: 1 }); o = at('puff', f); cloud(p, o[0], o[1], 16, f / 3, 62, SILT, { n: 5, rise: 1.5 }); }
  for (let f = 0; f < 6; f++) {
    o = at('blood', f); cloud(p, o[0], o[1], 32, f / 5, 11, BLOOD, { outline: hex('#1a0204') });
    o = at('silt', f); cloud(p, o[0], o[1], 32, f / 5, 23, SILT, { rise: 1 });
    o = at('smoke', f); cloud(p, o[0], o[1], 32, f / 5, 37, SMOKE, { rise: 1.5, outline: hex('#141416') });
  }
  // ---- glow: a crisp stepped disc (3 hard rings), additive
  o = at('glow');
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const d = Math.hypot(x + 0.5 - 8, y + 0.5 - 8); if (d < 7.5) p.set(o[0] + x, o[1] + y, '#ffffff', d < 3 ? 255 : d < 5.5 ? 140 : 60); }
  // ---- hearts (pulse) and the v1 heart kind
  for (const k of ['heart', 'heartP'] as PKind[]) for (let f = 0; f < 3; f++) {
    o = at(k, f);
    const s = [1, 0.8, 0.9][f], cx = 8, cy = 8.5;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const u = (x + 0.5 - cx) / (6.5 * s), v = (y + 0.5 - cy) / (6.5 * s);
      const hv = (u * u + v * v - 0.3) ** 3 - u * u * (-v + 0.1) ** 3 * 1.6; // heart curve (y down)
      if (hv <= 0) p.set(o[0] + x, o[1] + y, v < -0.3 && u < 0 ? '#ff9aac' : v > 0.35 ? '#b8203c' : '#ee3a58');
    }
    p.set(o[0] + 5, o[1] + 6, '#ffffff');
  }
  for (let f = 0; f < 3; f++) { const [x0, y0] = at('heartP', f); outlineCell(p, x0, y0, 16, hex('#4a0614')); const [x1, y1] = at('heart', f); outlineCell(p, x1, y1, 16, hex('#4a0614')); }
  // ---- coins: 4-frame spin (gold ramp, dark rim)
  for (const k of ['coin', 'coinSpin'] as PKind[]) for (let f = 0; f < 4; f++) {
    o = at(k, f);
    const w = [3, 2, 0.6, 2][f];
    p.ellipse(o[0] + 4, o[1] + 4, w + 0.4, 3.4, (nx) => (Math.abs(nx) > 0.7 ? hex('#9a6418') : nx < -0.1 ? hex('#ffe68a') : hex('#e8b030')));
    if (f === 0) { p.set(o[0] + 4, o[1] + 3, '#fff6c8'); p.set(o[0] + 4, o[1] + 4, '#fff6c8'); }
  }
  // ---- embers (2-frame flicker)
  for (let f = 0; f < 2; f++) { o = at('ember', f); p.set(o[0] + 1, o[1] + 1, f ? '#ffd060' : '#fff0a0'); p.set(o[0] + 2, o[1] + 1, '#ff8a2a'); p.set(o[0] + 1, o[1] + 2, f ? '#ff8a2a' : '#ffd060'); }
  // ---- ring (expanding 1-2 px circle, 4 frames)
  for (let f = 0; f < 4; f++) { o = at('ring', f); ring(p, o[0], o[1], 16, 16, 4 + f * 3.6, f < 2 ? 2 : 1.2, '#e0faff'); }
  // ---- leaf (2-frame flutter)
  for (let f = 0; f < 2; f++) { o = at('leaf', f); p.poly((f ? [[1, 6], [3, 2], [7, 1], [5, 5]] : [[1, 5], [2, 1], [7, 2], [6, 6]]).map(([x, y]) => [o[0] + x, o[1] + y] as [number, number]), '#4e8a3a'); p.line(o[0] + 2, o[1] + 5, o[0] + 6, o[1] + 2, '#8ac46a'); }
  // ---- electric zigzags (v1 'zap' and 'bolt'), 3 frames each: white core, cyan edge
  for (const k of ['zap', 'bolt'] as PKind[]) for (let f = 0; f < 3; f++) {
    o = at(k, f);
    let x = 2, y = 3 + f * 2;
    const pts: [number, number][] = [[x, y]];
    for (let i = 0; i < 5; i++) { x += 2 + ((i + f) % 2); y += i % 2 ? -3 + f : 3 - f; pts.push([x, Math.max(1, Math.min(14, y))]); }
    for (let i = 0; i + 1 < pts.length; i++) { p.line(o[0] + pts[i][0], o[1] + pts[i][1] + 1, o[0] + pts[i + 1][0], o[1] + pts[i + 1][1] + 1, '#4ac8ff'); p.line(o[0] + pts[i][0], o[1] + pts[i][1], o[0] + pts[i + 1][0], o[1] + pts[i + 1][1], '#ffffff'); }
  }
  // ---- blood drops (pointing +x so velocity orientation makes them streak): round, teardrop, streak
  const DR = P('#2a0406', '#6a0e10', '#9a1c1a', '#d06050');
  for (let f = 0; f < 3; f++) {
    o = at('bloodDrop', f);
    const len = [0, 1.5, 3][f];
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const dx = x + 0.5 - 5, dy = y + 0.5 - 4;
      const q = dx > 0 ? dx / 1.8 : dx / (1.8 + len);
      const d = Math.sqrt(q * q + (dy / 1.7) ** 2) + (dx < 0 ? -dx * 0.12 : 0);
      if (d > 1) continue;
      p.set(o[0] + x, o[1] + y, d > 0.75 ? DR[0] : dy < -0.5 ? DR[2] : DR[1]);
    }
    p.set(o[0] + 5, o[1] + 3, DR[3]);
  }
  // ---- flesh gibs: torn meat chunks (ball-lit, fat band, bone end / skin flap), wet dark outline
  const MEAT = P('#4a0e0e', '#701a18', '#982a26', '#b84a40', '#d07468');
  const FAT = hex('#d8c09c'), BONE = P('#a89878', '#d0c4a6', '#ece2cc');
  for (let f = 0; f < 6; f++) {
    o = at('gib', f);
    const list: Blob[] = [[8, 8, 3.6 + hash2(f, 1, 3) * 1.4], [8 + (hash2(f, 2, 3) - 0.5) * 5, 8 + (hash2(f, 3, 3) - 0.5) * 4, 2.4 + hash2(f, 4, 3)]];
    blobs(p, o[0], o[1], 16, list, MEAT);
    if (f % 2 === 0) for (let x = 5; x < 11; x++) if (p.get(o[0] + x, o[1] + 9)[3]) p.set(o[0] + x, o[1] + 9, FAT);
    if (f % 3 === 0) { const bx = o[0] + 11, by = o[1] + 7; p.rect(bx, by, 3, 2, BONE[1]); p.rect(bx, by, 3, 1, BONE[2]); p.set(bx + 3, by + 1, BONE[0]); }
    else if (f % 3 === 1) for (let x = 5; x <= 10; x++) p.set(o[0] + x, o[1] + 4, hex('#b88468'));
    outlineCell(p, o[0], o[1], 16, hex('#1e0405'));
  }
  // ---- pixel spark: hot head on the right, cooling tail
  o = at('sparkPx');
  P('#ff6a1a', '#ff6a1a', '#ffb040', '#ffb040', '#ffe890', '#ffe890', '#ffffff', '#ffffff').forEach((c, x) => p.set(o[0] + x, o[1] + 4, c));
  p.set(o[0] + 7, o[1] + 3, '#fff4c0'); p.set(o[0] + 7, o[1] + 5, '#fff4c0');
  // ---- water splash crown (anchored at the cell bottom = the surface)
  {
    const W = P('#2a6a88', '#5aa8c8', '#a8e0f0', '#eaffff');
    for (let f = 0; f < 6; f++) {
      o = at('splash', f);
      const t = f / 5, rise = Math.sin(Math.min(1, t * 1.5) * Math.PI), spread = 3 + t * 8;
      for (let k = -4; k <= 4; k++) {
        const lean = k * (0.18 + t * 0.25);
        const hk = (2 + rise * 20) * (1 - Math.abs(k) / 6) * (0.75 + hash2(k, 3, 7) * 0.5);
        const bx = 16 + (k * spread) / 4;
        for (let y = 0; y < hk; y++) {
          const w = Math.max(0, 1.4 - (y / hk) * 1.3) * (1 - t * 0.4);
          if (y > hk * (0.75 - t * 0.35) && ((y + k) % 3) !== 0) continue;
          for (let dx = -Math.round(w); dx <= Math.round(w); dx++) p.set(o[0] + Math.round(bx + dx + lean * y), o[1] + 30 - y, tone(W, 0.35 + (y / hk) * 0.6 - Math.abs(dx) * 0.2));
        }
        if (t > 0.2) {
          const dt_ = t - 0.2, px_ = 16 + k * 1.6 * dt_ * 2.2, py_ = 30 - (20 * (0.6 + hash2(k, 5, 7) * 0.5) * dt_ * 1.6 - 30 * dt_ * dt_ * 2.2);
          if (py_ > 1 && py_ < 31 && px_ > 0 && px_ < 31) p.set(o[0] + Math.round(px_), o[1] + Math.round(py_), W[3]);
        }
      }
      for (let x = Math.round(16 - spread - 2); x <= 16 + spread + 2; x++) { p.set(o[0] + x, o[1] + 31, W[2]); if (x % 3) p.set(o[0] + x, o[1] + 30, W[3]); }
    }
  }
  // ---- magic twinkle (near-white, tinted per particle): dot, plus, star with diagonal sparks, plus
  for (let f = 0; f < 4; f++) { o = at('magic', f); const arm = [1, 3, 5, 3][f]; plus(p, o[0], o[1], 8, 8, arm, '#ffffff', '#c8c8ff'); if (f === 2) for (const [dx, dy] of [[-2, -2], [2, 2], [2, -2], [-2, 2]]) p.set(o[0] + 8 + dx, o[1] + 8 + dy, '#d8d8ff'); }
  // ---- sparkle (pickups): 8 px twinkle
  for (let f = 0; f < 4; f++) { o = at('sparkle', f); const arm = [1, 2, 3, 2][f]; plus(p, o[0], o[1], 4, 4, arm, '#ffffff', '#fff0a0'); if (f === 2) for (const [dx, dy] of [[-1, -1], [1, 1], [1, -1], [-1, 1]]) p.set(o[0] + 4 + dx, o[1] + 4 + dy, '#fff8d0'); }
  // ---- glint (light motes in god rays, fish-scale flashes): dot -> plus -> x -> dot
  for (let f = 0; f < 4; f++) {
    o = at('glint', f);
    if (f === 0 || f === 3) p.set(o[0] + 4, o[1] + 4, '#ffffff');
    if (f === 1) plus(p, o[0], o[1], 4, 4, 2, '#ffffff', '#d8f4ff');
    if (f === 2) { p.set(o[0] + 4, o[1] + 4, '#ffffff'); for (const [dx, dy] of [[-1, -1], [1, 1], [1, -1], [-1, 1]]) p.set(o[0] + 4 + dx, o[1] + 4 + dy, '#d8f4ff'); }
  }
  // ---- shockwave: crisp 2 px ring that thins as it grows
  for (let f = 0; f < 6; f++) { o = at('shock', f); const t = f / 5; ring(p, o[0], o[1], 32, 32, 7 + t * 23, 2.6 - t * 1.4, '#e8f8ff', (1 - t * 0.5) * 255); if (f < 4) ring(p, o[0], o[1], 32, 32, (7 + t * 23) * 0.7, 1, '#ffffff', 120); }
  // ---- muzzle flash pointing +x: hot core, flame petals
  {
    const F = P('#c03a10', '#ff7a20', '#ffc050', '#fff0b0', '#ffffff');
    for (let f = 0; f < 3; f++) {
      o = at('muzzle', f);
      const L = [13, 15, 9][f], Wd = [4.5, 3.5, 2.5][f];
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
        const dx = x + 0.5 - 12, dy = y + 0.5 - 16;
        const fwd = dx > 0 ? (dx / L) ** 2 + (dy / (Wd * (1 - dx / (L * 1.4)))) ** 2 : (dx / 4) ** 2 + (dy / Wd) ** 2;
        const pet = Math.min(((dx - 3) / 6) ** 2 + ((Math.abs(dy) - 4) / 1.6) ** 2, 9);
        const v = Math.min(fwd, pet * 1.2);
        if (v <= 1) p.set(o[0] + x, o[1] + y, tone(F, 1 - v + (f === 2 ? -0.3 : 0)));
      }
    }
  }
  // ---- explosion (64 px, 8 frames): star flash -> layered fireball -> fire breaking into sooty puffs -> smoke
  {
    const HOT = P('#ff9a30', '#ffd860', '#fffbe8'), FIRE = P('#b8381a', '#ff7a24', '#ffc040'), EMB = P('#5a1a0a', '#9a3412', '#d85a1c'), SM = P('#1e1c1c', '#34302e', '#4c4644', '#686260');
    for (let f = 0; f < 8; f++) {
      o = at('explosion', f);
      if (f === 0) {
        for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + 0.2; const L = i % 2 ? 18 : 26; for (let k = 6; k < L; k++) p.set(o[0] + 32 + Math.round(Math.cos(a) * k), o[1] + 32 + Math.round(Math.sin(a) * k), k < L * 0.6 ? '#fff4c8' : '#ffb84a'); }
        blobs(p, o[0], o[1], 64, [[32, 32, 9, HOT]], HOT);
        continue;
      }
      const t = f / 7;
      const list: Blob[] = [];
      for (let i = 0; i < 9; i++) {
        const a = hash2(i, 4, 77) * Math.PI * 2, dd = (8 + hash2(i, 5, 77) * 12) * (0.5 + t * 0.9);
        const r = (6 + hash2(i, 6, 77) * 5) * (0.7 + Math.min(t, 0.5)) * (t > 0.7 ? 1 - (t - 0.7) * 1.2 : 1);
        const T = (1 - dd / 30) * (1.3 - t * 1.5);
        const pal = T > 0.55 ? HOT : T > 0.3 ? FIRE : T > 0.1 ? EMB : SM;
        list.push([32 + Math.cos(a) * dd, 32 + Math.sin(a) * dd * 0.85 - t * 10, Math.min(r, 14), pal]);
      }
      list.sort((a, b) => (a[3] === SM ? 0 : a[3] === EMB ? 1 : a[3] === FIRE ? 2 : 3) - (b[3] === SM ? 0 : b[3] === EMB ? 1 : b[3] === FIRE ? 2 : 3));
      if (t < 0.5) list.push([32, 32 - t * 6, 11 * (1 - t), t < 0.25 ? HOT : FIRE]);
      blobs(p, o[0], o[1], 64, list, SM, hex(t > 0.6 ? '#121010' : '#3a0e04'));
      if (t > 0.5) for (let i = 0; i < 5; i++) { const x = Math.round(16 + hash2(i, f, 9) * 32), y = Math.round(16 + hash2(i, f, 10) * 32); p.set(o[0] + x, o[1] + y, '#ffb040'); }
    }
  }
  // ---- rock / shell chips
  {
    const C = P('#3a3630', '#5a544a', '#7e766a', '#a49a8a');
    for (let f = 0; f < 4; f++) {
      o = at('chip', f);
      const pts: [number, number][] = [];
      for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 + hash2(i, f, 1) * 0.8, r = 1.8 + hash2(i, f, 2) * 1.8; pts.push([o[0] + 4 + Math.cos(a) * r, o[1] + 4 + Math.sin(a) * r]); }
      p.poly(pts, (x, y) => tone(C, 0.75 - ((x - o[0] - 4) + (y - o[1] - 4)) * 0.12));
    }
  }
  // ---- small flame (loop)
  {
    const F = P('#7a1a08', '#c8400c', '#f08020', '#ffc048', '#fff2b0');
    for (let f = 0; f < 4; f++) {
      o = at('fire', f);
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const yy = (15.5 - y) / 13, sway = Math.round(Math.sin(yy * 4 + f * 1.6) * yy * 1.6);
        const w = 4.2 * Math.pow(Math.max(0, 1 - yy), 0.7) * (1 + 0.15 * Math.sin(f * 2.1 + yy * 7));
        const dx = Math.abs(x + 0.5 - 8 - sway);
        if (yy < 0 || yy > 1 || dx > w) continue;
        p.set(o[0] + x, o[1] + y, tone(F, (1 - dx / Math.max(0.5, w)) * 0.8 + (1 - yy) * 0.45 - 0.15));
      }
    }
  }
  // ---- impact star: rays -> 8-point star -> small star -> 4 dots (white, tinted)
  for (let f = 0; f < 4; f++) {
    o = at('hitStar', f);
    const c = [8, 8];
    if (f === 0) { for (let i = 1; i < 8; i++) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) p.set(o[0] + c[0] + dx * i, o[1] + c[1] + dy * i, i < 5 ? '#ffffff' : '#fff0a0'); }
    else if (f < 3) {
      const L = f === 1 ? 6 : 4;
      for (let i = 0; i <= L; i++) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) p.set(o[0] + c[0] + dx * i, o[1] + c[1] + dy * i, '#ffffff');
      for (let i = 1; i <= L - 2; i++) for (const [dx, dy] of [[1, 1], [-1, -1], [1, -1], [-1, 1]]) p.set(o[0] + c[0] + dx * i, o[1] + c[1] + dy * i, '#fff0a0');
    } else for (const [dx, dy] of [[5, 0], [-5, 0], [0, 5], [0, -5]]) p.set(o[0] + c[0] + dx, o[1] + c[1] + dy, '#ffffff');
  }
  // ---- slash arc (convex side toward +x): thick crescent sweeping open, then thinning into fragments
  for (let f = 0; f < 4; f++) {
    o = at('slash', f);
    const span = [0.9, 1.5, 1.7, 1.8][f], th = [3.5, 3, 2, 1.2][f], R = 12;
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const dx = x + 0.5 - 12, dy = y + 0.5 - 16, a = Math.atan2(dy, dx), d = Math.hypot(dx, dy);
      if (Math.abs(a) > span) continue;
      const taper = 1 - Math.abs(a) / span;
      const w = th * (0.35 + 0.65 * taper);
      if (Math.abs(d - R) > w) continue;
      if (f === 3 && (Math.floor((a + 2) * 6) % 2)) continue;
      p.set(o[0] + x, o[1] + y, d > R + w * 0.3 ? '#9adcff' : '#ffffff');
    }
  }
  // ---- poison bubble: green ring + highlight; pops on the last frame
  for (let f = 0; f < 3; f++) {
    o = at('poison', f);
    if (f < 2) { p.ellipse(o[0] + 4, o[1] + 4, 3, f ? 2.6 : 3, (nx, ny) => (Math.hypot(nx, ny) > 0.65 ? hex('#7ae04a') : hex('#3a8a2a'))); p.set(o[0] + 3, o[1] + 2, '#e8ffd0'); }
    else for (const [dx, dy] of [[-3, 0], [3, 0], [0, -3], [0, 3], [-2, -2], [2, 2]]) p.set(o[0] + 4 + dx, o[1] + 4 + dy, '#9af06a');
  }
  // ---- runes: four glyphs inside a ring (white, tinted)
  const GL: [number, number, number, number][][] = [
    [[8, 4, 8, 12], [5, 7, 11, 7], [5, 10, 8, 12], [11, 10, 8, 12]],
    [[5, 4, 11, 12], [11, 4, 5, 12], [5, 8, 11, 8]],
    [[6, 4, 6, 12], [6, 4, 10, 7], [10, 7, 6, 9], [6, 9, 11, 12]],
    [[8, 4, 5, 8], [5, 8, 8, 12], [8, 12, 11, 8], [11, 8, 8, 4], [8, 7, 8, 9]],
  ];
  for (let f = 0; f < 4; f++) { o = at('rune', f); ring(p, o[0], o[1], 8, 8, 6.5, 1, '#c8c8ff'); for (const [x0, y0, x1, y1] of GL[f]) p.line(o[0] + x0, o[1] + y0, o[0] + x1, o[1] + y1, '#ffffff'); }
  // ---- frost shards (pointing +x): diamond ice splinters
  for (let f = 0; f < 3; f++) {
    o = at('frost', f);
    const L = [3.5, 3, 2.5][f], W = [1.4, 2, 1.2][f];
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const dx = x + 0.5 - 4, dy = y + 0.5 - 4; const v = Math.abs(dx) / L + Math.abs(dy) / W; if (v <= 1) p.set(o[0] + x, o[1] + y, dy < 0 ? (v < 0.5 ? '#ffffff' : '#c8f0ff') : v < 0.6 ? '#8ad0f0' : '#4a90c0'); }
  }
  // ---- ambient: marine snow flecks (1-2 px), plankton motes (2-frame twinkle)
  o = at('fleck', 0); p.set(o[0] + 1, o[1] + 1, '#d0d4c8');
  o = at('fleck', 1); p.set(o[0] + 1, o[1] + 1, '#d8dcd0'); p.set(o[0] + 2, o[1] + 1, '#a8aca0');
  o = at('fleck', 2); p.set(o[0] + 1, o[1] + 1, '#c8ccc0'); p.set(o[0] + 1, o[1] + 2, '#9a9e92'); p.set(o[0] + 2, o[1] + 2, '#c8ccc0');
  o = at('mote', 0); p.set(o[0] + 1, o[1] + 1, '#b8e0a0');
  o = at('mote', 1); p.set(o[0] + 1, o[1] + 1, '#e0ffc8'); p.set(o[0] + 2, o[1] + 1, '#6a9a5a'); p.set(o[0] + 1, o[1] + 2, '#6a9a5a');
}

/** 1 px outline around the opaque pixels of one cell */
function outlineCell(p: Px, ox: number, oy: number, S: number, c: RGB) {
  const add: [number, number][] = [];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (p.get(ox + x, oy + y)[3]) continue;
    const a = (dx: number, dy: number) => { const X = x + dx, Y = y + dy; return X >= 0 && Y >= 0 && X < S && Y < S && p.get(ox + X, oy + Y)[3] > 0; };
    if (a(1, 0) || a(-1, 0) || a(0, 1) || a(0, -1)) add.push([x, y]);
  }
  for (const [x, y] of add) p.set(ox + x, oy + y, c);
}
