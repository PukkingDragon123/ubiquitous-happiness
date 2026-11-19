// Loot-model PAINT KIT (v4.1): small hand-painted pixel pages for the item models, built from hue-shifted ramps.
//
//   const T = tx('hook', 32, 32, (p) => { p.metal(0, 0, 32, 32, IRON); p.rust(10, 12, 6); p.glint(20, 6); });
//   T.tex                   the crisp CanvasTexture (nearest, repeat)
//   T.r(x, y, w, h)         a pixel rect of the page as a uv rect for the geometry kit (kit.ts)
//
// Every page is painted by rule, never by noise: light comes from the top left (lit top / left edges, shaded bottom /
// right), wear is placed where hands and water would put it, and every material has its own motif (grain + knots,
// rust blooms + scratches + rivets, weave + stitches, creases, growth rings + nacre, facets + a glint, ink).
import * as THREE from 'three';
import { Px, hex, worley, type RGB } from '../../gfx/px';
import { ramp } from '../../ui/obj/pixtex';
import { hash2 } from '../../core/math';

/** a palette: tones dark (0, the ink) to light (last, the highlight) */
export type Pal = readonly string[];
/** a normalised uv rect [u0, v0, u1, v1] (v up, like three's uvs) */
export type UR = readonly [number, number, number, number];
export const FULL: UR = [0, 0, 1, 1];

const ci = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const mixRGB = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** six hue-shifted tones from one colour (cool violet shadows, warm yellow lights) */
export const pal = (c: string): Pal => ramp(c);
/** a palette tone; half steps (2.5) mix the neighbours evenly, everything else snaps to a tone */
export function tc(p: Pal, t: number): RGB {
  const n = p.length - 1;
  const q = ci(Math.round(t * 2) / 2, 0, n);
  const a = Math.floor(q);
  if (q === a) return hex(p[a]);
  return mixRGB(hex(p[a]), hex(p[a + 1]), 0.5);
}

// ------------------------------------------------------------------ shared palettes (one family across all loot)
export const PAL = {
  ink: ['#0e0a14', '#1c1626', '#2e263a', '#463c52', '#62566e', '#8a7e94'] as Pal,
  iron: ['#16141e', '#2c2c3a', '#464a5c', '#666e82', '#949eb0', '#d0d8e2'] as Pal,
  steel: ['#141a26', '#2a3446', '#48566e', '#72849c', '#a8b8cc', '#e6eef6'] as Pal,
  rust: ['#2a0e06', '#5a220c', '#8e3c14', '#bc5e22', '#e08a3c', '#f6c07a'] as Pal,
  brass: ['#2e1606', '#5e340c', '#946014', '#c8902a', '#ecc25a', '#fff0b0'] as Pal,
  gold: ['#3a1a02', '#7a4006', '#bc7a10', '#eab42a', '#ffe060', '#fffbd0'] as Pal,
  copper: ['#2a0c08', '#5e2212', '#98421e', '#c8682e', '#eaa060', '#ffd6a0'] as Pal,
  patina: ['#06221e', '#0e4a3c', '#1e7a5e', '#3cac82', '#7ad6a8', '#c4f6d8'] as Pal,
  silver: ['#1a1c2a', '#3a4058', '#6a7490', '#a2acc2', '#d4dae6', '#ffffff'] as Pal,
  lead: ['#12141c', '#262a38', '#3e4456', '#5c6478', '#868ea2', '#b8c0cc'] as Pal,
  oak: ['#1e0e08', '#3e2010', '#64381a', '#8e5a2a', '#b88442', '#e0b670'] as Pal,
  dark: ['#120806', '#26140c', '#3e2414', '#5a361e', '#7a502c', '#a07240'] as Pal,
  drift: ['#2a2428', '#4c4446', '#746a66', '#a09482', '#c8bca4', '#ece2cc'] as Pal,
  leather: ['#1e0c06', '#3c1a0c', '#623016', '#8a4a22', '#b46e36', '#dca060'] as Pal,
  cloth: ['#1e0e10', '#3e1e1a', '#664030', '#8e6848', '#b8946a', '#e2c896'] as Pal,
  paper: ['#3a2a1c', '#6a5034', '#a08460', '#cab08a', '#e8d8b0', '#fff6dc'] as Pal,
  bone: ['#2e2418', '#5a4c38', '#8e7e62', '#bcae8e', '#e2d8bc', '#fffaea'] as Pal,
  stone: ['#16141c', '#2c2a34', '#46444e', '#66636c', '#8e8a90', '#bcb8b8'] as Pal,
  sand: ['#2e2010', '#5a4228', '#8a6c46', '#b8986a', '#dcc496', '#f8ecc8'] as Pal,
  red: ['#2a0610', '#5a0c1c', '#961a28', '#cc3232', '#f0644a', '#ffb08a'] as Pal,
  coral: ['#2e0a10', '#681a1c', '#a8342a', '#e05a3a', '#fa8e5a', '#ffd0a0'] as Pal,
  orange: ['#2e1004', '#6a2808', '#b04a10', '#e87a1c', '#ffaa3c', '#ffe08a'] as Pal,
  yellow: ['#3a2004', '#7a4c06', '#c08410', '#f0bc20', '#ffe050', '#fffac0'] as Pal,
  green: ['#061a10', '#0e3a1e', '#1e6230', '#3a9040', '#6cbc4e', '#bce882'] as Pal,
  kelp: ['#0e1406', '#24300c', '#3e5014', '#5e7420', '#8a9a30', '#c4c866'] as Pal,
  teal: ['#04201e', '#0a4440', '#14706a', '#26a296', '#5ad2be', '#b4f6e4'] as Pal,
  blue: ['#060c2a', '#0e1e58', '#1a3a90', '#2c62c4', '#5a96ea', '#b0dcff'] as Pal,
  navy: ['#06081a', '#10162e', '#1c2648', '#2c3a66', '#46588a', '#7088b4'] as Pal,
  purple: ['#12061e', '#2a0e44', '#481c78', '#6c34aa', '#9a62d6', '#d4a8f6'] as Pal,
  pink: ['#2e0c1a', '#5e1c34', '#963456', '#cc5a7a', '#f08ea2', '#ffd0d6'] as Pal,
  shell: ['#3a1e1e', '#6e3c36', '#a8685a', '#d89a80', '#f4c6a8', '#fff0e0'] as Pal,
  pearl: ['#3c3448', '#6e6680', '#a49eb4', '#d0cad8', '#eeeaf0', '#ffffff'] as Pal,
  nacre: ['#2c2e4a', '#4e5c86', '#7e9ab8', '#b4d0d8', '#e6eef0', '#ffffff'] as Pal,
  flesh: ['#2e0e16', '#5e1e2a', '#964048', '#c86a6a', '#ec9c8e', '#ffd4bc'] as Pal,
  rubber: ['#100c0c', '#201818', '#342828', '#4a3a38', '#64524c', '#86726a'] as Pal,
  white: ['#2a2a3a', '#5a5a72', '#9496aa', '#c8cad6', '#ecedf2', '#ffffff'] as Pal,
  black: ['#06060a', '#0e0e16', '#1a1a24', '#282834', '#3c3c4a', '#5a5a6a'] as Pal,
  ruby: ['#22020c', '#56061c', '#980e2c', '#d8203c', '#ff5a5a', '#ffc4b4'] as Pal,
  emerald: ['#021a10', '#063e22', '#0e6e36', '#20a24c', '#5ad874', '#c4ffc0'] as Pal,
  amethyst: ['#14061e', '#30104e', '#561e88', '#8236c0', '#b46ae8', '#ecc8ff'] as Pal,
  aqua: ['#03222a', '#08485a', '#127a8a', '#28b2b8', '#6ae2d8', '#d0fff4'] as Pal,
  mana: ['#0a0838', '#1a1880', '#3236c8', '#5a6cf4', '#96b6ff', '#e4f2ff'] as Pal,
  abyss: ['#04021a', '#120a46', '#26188a', '#3a3ad2', '#40a8f4', '#b4fcff'] as Pal,
  lava: ['#2a0602', '#701404', '#c03406', '#f26a10', '#ffb030', '#fff4b0'] as Pal,
  venom: ['#061a04', '#10400a', '#207814', '#40b020', '#88e440', '#dcffa0'] as Pal,
  ice: ['#0a2236', '#1a4a70', '#3482b0', '#64bce0', '#a8e6fa', '#f0ffff'] as Pal,
  glass: ['#0c2a26', '#1c5048', '#36806e', '#62b49a', '#a2e0c8', '#e8fff4'] as Pal,
};

// ------------------------------------------------------------------ 3x5 pixel font for labels, stamps and inks
/** rows of three, top to bottom */
const GLYPH: Record<string, string> = {
  A: '.#. #.# ### #.# #.#', B: '##. #.# ##. #.# ##.', C: '.## #.. #.. #.. .##', D: '##. #.# #.# #.# ##.', E: '### #.. ##. #.. ###', F: '### #.. ##. #.. #..',
  G: '.## #.. #.# #.# .##', H: '#.# #.# ### #.# #.#', I: '### .#. .#. .#. ###', J: '..# ..# ..# #.# .#.', K: '#.# #.# ##. #.# #.#', L: '#.. #.. #.. #.. ###',
  M: '#.# ### ### #.# #.#', N: '##. #.# #.# #.# #.#', O: '.#. #.# #.# #.# .#.', P: '##. #.# ##. #.. #..', Q: '.#. #.# #.# ##. .##', R: '##. #.# ##. #.# #.#',
  S: '.## #.. .#. ..# ##.', T: '### .#. .#. .#. .#.', U: '#.# #.# #.# #.# ###', V: '#.# #.# #.# #.# .#.', W: '#.# #.# ### ### #.#', X: '#.# #.# .#. #.# #.#',
  Y: '#.# #.# .#. .#. .#.', Z: '### ..# .#. #.. ###', '0': '### #.# #.# #.# ###', '1': '.#. ##. .#. .#. ###', '2': '##. ..# .#. #.. ###', '3': '##. ..# .#. ..# ##.',
  '4': '#.# #.# ### ..# ..#', '5': '### #.. ##. ..# ##.', '6': '.## #.. ### #.# ###', '7': '### ..# .#. .#. .#.', '8': '### #.# ### #.# ###', '9': '### #.# ### ..# ##.',
  '!': '.#. .#. .#. ... .#.', '.': '... ... ... ... .#.', '-': '... ... ### ... ...', '+': '... .#. ### .#. ...', '?': '##. ..# .#. ... .#.', ' ': '... ... ... ... ...',
  "'": '.#. .#. ... ... ...', '/': '..# ..# .#. #.. #..',
};
for (const k of Object.keys(GLYPH)) GLYPH[k] = GLYPH[k].replace(/ /g, '');

/** a painter: Px plus palette-aware strokes. Coordinates are pixels from the top left. */
export class Pt extends Px {
  /** palette tone t (half steps mix) */
  t(x: number, y: number, p: Pal, t: number) { this.set(Math.round(x), Math.round(y), tc(p, t)); }
  /** a filled rect in a palette tone (or a plain colour) */
  R(x: number, y: number, w: number, h: number, p: Pal | string, t = 0) {
    const c = typeof p === 'string' ? hex(p) : tc(p, t);
    this.rect(Math.round(x), Math.round(y), Math.round(w), Math.round(h), c);
  }
  /** the whole page in one tone */
  all(p: Pal, t: number) { this.R(0, 0, this.w, this.h, p, t); return this; }
  /** a bevelled panel: base tone b, lit top / left edges, shaded bottom / right edges, optional 1 px ink rim */
  panel(x: number, y: number, w: number, h: number, p: Pal, b = 3, o: { e?: number; ink?: boolean; noFill?: boolean } = {}) {
    const e = o.e ?? 1;
    if (!o.noFill) this.R(x, y, w, h, p, b);
    this.R(x, y, w, e, p, b + 1.5); this.R(x, y + e, e, h - e, p, b + 1);
    this.R(x, y + h - e, w, e, p, b - 1.5); this.R(x + w - e, y + e, e, h - 2 * e, p, b - 1);
    this.t(x, y, p, b + 2);
    if (o.ink) { this.R(x, y, w, 1, p, 0); this.R(x, y + h - 1, w, 1, p, 0); this.R(x, y, 1, h, p, 0); this.R(x + w - 1, y, 1, h, p, 0); }
  }
  /** darken (k < 1) or lighten (k > 1) a rect: baked AO, soot, sun-bleach */
  dim(x: number, y: number, w: number, h: number, k: number) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.shadePx(x + i, y + j, k); }
  /** baked AO along the inside of a rect's edges (where parts meet) */
  ao(x: number, y: number, w: number, h: number, k = 0.72, sides = 'tblr') {
    if (sides.includes('t')) this.dim(x, y, w, 1, k);
    if (sides.includes('b')) this.dim(x, y + h - 1, w, 1, k);
    if (sides.includes('l')) this.dim(x, y, 1, h, k);
    if (sides.includes('r')) this.dim(x + w - 1, y, 1, h, k);
  }
  /** horizontal / vertical rule in a tone */
  hl(x: number, y: number, l: number, p: Pal | string, t = 0) { this.R(x, y, l, 1, p, t); }
  vl(x: number, y: number, l: number, p: Pal | string, t = 0) { this.R(x, y, 1, l, p, t); }
  /** a straight pixel line in a tone */
  ln(x0: number, y0: number, x1: number, y1: number, p: Pal | string, t = 0) { this.line(x0, y0, x1, y1, typeof p === 'string' ? p : tc(p, t)); }
  /** a filled ellipse with a lit top-left and a shaded bottom-right (a painted dome / boss / bump) */
  dome(cx: number, cy: number, rx: number, ry: number, p: Pal, b = 3) {
    this.ellipse(cx, cy, rx, ry, (nx, ny) => { const d = Math.hypot(nx, ny), l = -nx * 0.6 - ny * 0.8; return tc(p, d > 0.82 ? (l > 0 ? b - 0.5 : b - 1.5) : l > 0.45 ? b + 1.5 : l > 0 ? b + 0.5 : b); });
  }
  /** a hard white four-point glint (the key light catching a polished spot) */
  glint(x: number, y: number, s = 1, c = '#ffffff', c2 = '#fff2c4') {
    this.set(x, y, c);
    for (let i = 1; i <= s; i++) { const cc = i === s ? c2 : c; this.set(x - i, y, cc); this.set(x + i, y, cc); this.set(x, y - i, cc); this.set(x, y + i, cc); }
  }
  /** a domed rivet / bolt head (3 x 3) with its drop shadow */
  rivet(x: number, y: number, p: Pal, b = 3) {
    this.t(x + 1, y + 3, p, 0); this.t(x + 2, y + 3, p, 0); this.t(x + 3, y + 1, p, 0); this.t(x + 3, y + 2, p, 0);
    this.t(x, y, p, b + 1); this.t(x + 1, y, p, b + 1); this.t(x, y + 1, p, b + 1); this.t(x + 1, y + 1, p, b + 2.5);
    this.t(x + 2, y, p, b); this.t(x, y + 2, p, b); this.t(x + 2, y + 1, p, b - 0.5); this.t(x + 1, y + 2, p, b - 0.5); this.t(x + 2, y + 2, p, b - 1.5);
  }
  /** a scratch: a bright 1 px stroke with its dark groove underneath */
  scratch(x: number, y: number, l: number, p: Pal, slope = 0.35, b = 3) {
    for (let i = 0; i < l; i++) { const yy = Math.round(y + i * slope); this.t(x + i, yy, p, b + 2); this.t(x + i, yy + 1, p, b - 1.5); }
  }
  /** a rust bloom: an irregular (shaped, not noisy) patch with a dark rim, an orange body and a lit crust on top */
  rust(cx: number, cy: number, r: number, seed = 1, p: Pal = PAL.rust) {
    const ph = seed * 1.7;
    for (let y = Math.floor(cy - r * 1.4); y <= cy + r * 1.4; y++) for (let x = Math.floor(cx - r * 1.4); x <= cx + r * 1.4; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, a = Math.atan2(dy, dx);
      const rr = r * (1 + 0.24 * Math.sin(a * 3 + ph) + 0.12 * Math.sin(a * 5 - ph * 2));
      const d = Math.hypot(dx, dy * 1.1) / rr;
      if (d > 1) continue;
      const t = d > 0.78 ? 1 : dy < -rr * 0.25 && d < 0.6 ? 4 : d < 0.35 ? 2 : 3;
      this.t(x, y, p, t);
    }
    // pits: three dark pocks placed around the bloom's middle
    for (let k = 0; k < 3; k++) { const a = ph + k * 2.1, x = Math.round(cx + Math.cos(a) * r * 0.45), y = Math.round(cy + Math.sin(a) * r * 0.4); this.t(x, y, p, 0); this.t(x, y - 1, p, 4); }
  }
  /** a rust run dripping down from a point */
  drip(x: number, y: number, l: number, p: Pal = PAL.rust) {
    for (let i = 0; i < l; i++) this.t(x, y + i, p, i < l * 0.5 ? 2 : 1);
    this.t(x + 1, y, p, 3); this.t(x, y + l, p, 0);
  }
  /** wood: long wavy grain (dark lines with a lit lip), growth bands and ringed knots; grain runs along x (or y) */
  wood(x0: number, y0: number, w: number, h: number, p: Pal, o: { seed?: number; knots?: number; vertical?: boolean; b?: number; lines?: number } = {}) {
    const seed = o.seed ?? 1, V = !!o.vertical, b = o.b ?? 3;
    const L = V ? h : w, W = V ? w : h;
    const knots: [number, number, number][] = [];
    for (let k = 0; k < (o.knots ?? 1); k++) knots.push([2 + hash2(k, 3, seed) * (L - 4), 1 + hash2(k, 5, seed) * (W - 2), 1.6 + hash2(k, 7, seed) * 1.6]);
    const freq = (o.lines ?? 5) / Math.max(4, W);
    for (let a = 0; a < W; a++) for (let s = 0; s < L; s++) {
      let warp = Math.sin(s * 0.11 + seed) * 1.4 + Math.sin(s * 0.037 + seed * 2) * 2;
      for (const [ks, ka, kr] of knots) { const d = Math.hypot((s - ks) / 2.4, a - ka); if (d < kr * 3) warp += (a > ka ? 1 : -1) * (kr * 3 - d) * 0.5; }
      const g = Math.sin((a + warp) * freq * Math.PI * 2);
      const band = Math.sin((a + warp) * freq * Math.PI * 0.7 + 1);
      let t = b + (band > 0.55 ? 0.5 : band < -0.6 ? -0.5 : 0);
      if (g > 0.86) t = b - 1; else if (g > 0.7) t = b - 0.5; else if (g < -0.93) t = b + 1;
      const x = V ? x0 + a : x0 + s, y = V ? y0 + s : y0 + a;
      this.t(x, y, p, t);
    }
    for (const [ks, ka, kr] of knots) {
      const cx = V ? x0 + ka : x0 + ks, cy = V ? y0 + ks : y0 + ka;
      this.ellipse(cx, cy, V ? kr : kr * 1.8, V ? kr * 1.8 : kr, (nx, ny) => { const d = Math.hypot(nx, ny); return tc(p, d > 0.8 ? b - 1.5 : d > 0.45 ? b - 0.5 : b - 2); });
      this.t(cx - (V ? 0 : 1), cy - (V ? 1 : 0), p, b + 1);
    }
  }
  /** worm holes: dark pocks with a lit lower rim */
  holes(pts: [number, number][], p: Pal) { for (const [x, y] of pts) { this.t(x, y, p, 0); this.t(x + 1, y, p, 0); this.t(x, y + 1, p, b4(p)); this.t(x + 1, y + 1, p, b4(p) - 1); this.t(x, y - 1, p, 1); } }
  /** faceted stone: worley cobbles, each with a lit top-left lip and a shaded bottom-right seam; a few clean cracks */
  stone(x0: number, y0: number, w: number, h: number, p: Pal, o: { cell?: number; seed?: number; b?: number; cracks?: number } = {}) {
    const cell = o.cell ?? 9, seed = o.seed ?? 1, b = o.b ?? 3;
    const id = (x: number, y: number) => worley(x, y, cell, seed)[2];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const k = id(x, y);
      let t = b - 0.5 + Math.floor(k * 3) * 0.5;
      if (k !== id(x + 1, y) || k !== id(x, y + 1)) t = b - 2; else if (k !== id(x - 1, y) || k !== id(x, y - 1)) t = b + 1.5; else if (k !== id(x + 2, y + 2)) t -= 0.5;
      this.t(x0 + x, y0 + y, p, t);
    }
    for (let c = 0; c < (o.cracks ?? 2); c++) {
      let x = x0 + 2 + hash2(c, 1, seed) * (w - 8), y = y0 + 2 + hash2(c, 2, seed) * (h - 6);
      const l = 5 + hash2(c, 3, seed) * 8;
      for (let i = 0; i < l; i++) { this.t(x, y, p, 0); this.t(x, y + 1, p, b + 1); x += 1; y += hash2(c, i, seed) > 0.6 ? 1 : hash2(c, i, seed) < 0.2 ? -1 : 0; }
    }
  }
  /** twisted rope / cord: diagonal strands with a lit crown and a dark groove (runs along x) */
  rope(x0: number, y0: number, w: number, h: number, p: Pal, o: { pitch?: number; b?: number } = {}) {
    const pitch = o.pitch ?? 4, b = o.b ?? 3;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const k = (((x + y) % pitch) + pitch) % pitch / pitch;
      this.t(x0 + x, y0 + y, p, k < 0.25 ? b - 1.5 : k < 0.5 ? b + 1 : k < 0.75 ? b : b - 0.5);
    }
  }
  /** brushed metal: soft horizontal bands, an engraved line set and a diagonal polished stripe */
  metal(x0: number, y0: number, w: number, h: number, p: Pal, o: { b?: number; polish?: boolean; bands?: boolean } = {}) {
    const b = o.b ?? 3;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) this.t(x0 + x, y0 + y, p, b + (o.bands !== false && y % 4 === 3 ? -0.5 : 0));
    if (o.polish !== false) for (let i = -h; i < w; i++) for (let k = 0; k < 3; k++) { const x = i + k, y = h - 1 - Math.round((i + h) * 0.7); if (x >= 0 && x < w && y >= 0 && y < h) this.t(x0 + x, y0 + y, p, k === 1 ? b + 2 : b + 1); }
  }
  /** a cloth weave (2 px threads) with a darker fold every `fold` px */
  weave(x0: number, y0: number, w: number, h: number, p: Pal, o: { b?: number; fold?: number; vertical?: boolean } = {}) {
    const b = o.b ?? 3, f = o.fold ?? 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let t = b + ((((x >> 1) + (y >> 1)) & 1) ? 0 : -0.5);
      if (f) { const k = ((o.vertical ? y : x) % f) / f; t += k < 0.18 ? 0.5 : k > 0.8 ? -1 : 0; }
      this.t(x0 + x, y0 + y, p, t);
    }
  }
  /** a stitched seam: thread dashes on a dark groove */
  stitch(x0: number, y0: number, x1: number, y1: number, thread: string | Pal = '#e8d4a0', groove = '#1e1008', t = 4) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= n; i++) {
      const x = Math.round(x0 + ((x1 - x0) * i) / (n || 1)), y = Math.round(y0 + ((y1 - y0) * i) / (n || 1));
      if (i % 3 === 2) this.set(x, y, groove); else this.set(x, y, typeof thread === 'string' ? hex(thread) : tc(thread, t));
    }
  }
  /** leather / skin creases: short curved dark strokes with a lit ridge above */
  creases(x0: number, y0: number, w: number, h: number, p: Pal, n = 6, seed = 1, b = 3) {
    for (let k = 0; k < n; k++) {
      const cx = x0 + 3 + hash2(k, 1, seed) * (w - 6), cy = y0 + 3 + hash2(k, 2, seed) * (h - 6), l = 3 + Math.floor(hash2(k, 3, seed) * 5);
      for (let i = 0; i < l; i++) { const x = Math.round(cx + i - l / 2), y = Math.round(cy + Math.sin(i / l * Math.PI) * -1.2); this.t(x, y, p, b - 1.5); this.t(x, y - 1, p, b + 1); }
    }
  }
  /** concentric growth rings around (cx, cy) for shells, scales and tree rings */
  rings(cx: number, cy: number, r: number, p: Pal, step = 3, b = 3, sx = 1, sy = 1) {
    for (let y = Math.floor(cy - r * sy); y <= cy + r * sy; y++) for (let x = Math.floor(cx - r * sx); x <= cx + r * sx; x++) {
      const d = Math.hypot((x + 0.5 - cx) / sx, (y + 0.5 - cy) / sy);
      if (d > r) continue;
      const k = d % step;
      if (k < 0.9) this.t(x, y, p, b - 1); else if (k < 1.8) this.t(x, y, p, b + 0.5);
    }
  }
  /** nacre: soft iridescent bands (pink, blue, mint) laid along a direction, for pearls and shell linings */
  nacre(x0: number, y0: number, w: number, h: number, b = 3, ang = 0.5) {
    const tints: Pal[] = [PAL.pearl, PAL.nacre, PAL.pink, PAL.pearl, PAL.teal];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const s = x * Math.cos(ang) + y * Math.sin(ang) + Math.sin(y * 0.3) * 2;
      const i = Math.floor(s / 5) % tints.length, p = tints[(i + tints.length) % tints.length];
      this.t(x0 + x, y0 + y, p, p === PAL.pink || p === PAL.teal ? b + 1.5 : b + 0.5);
    }
  }
  /** a cut gem's face: triangle facets in 4 tones around a centre, a bright table and a two-pixel glint */
  facets(x0: number, y0: number, w: number, h: number, p: Pal, n = 8, b = 3) {
    const cx = x0 + w / 2, cy = y0 + h / 2;
    const tones = [b + 1.5, b + 0.5, b, b - 0.5, b - 1, b - 1.5, b - 0.5, b + 1];
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
      const dx = (x + 0.5 - cx) / (w / 2), dy = (y + 0.5 - cy) / (h / 2), a = Math.atan2(dy, dx), r = Math.max(Math.abs(dx), Math.abs(dy));
      const sec = Math.floor(((a + Math.PI + Math.PI / n) / (Math.PI * 2)) * n) % n;
      this.t(x, y, p, r < 0.4 ? b + 0.5 : tones[(sec + 5) % tones.length]);
    }
    this.glint(Math.floor(cx - w * 0.18), Math.floor(cy - h * 0.2), 1);
  }
  /** label text in the 3 x 5 font (upper case, digits, a few marks), 1 px apart */
  text(s: string, x: number, y: number, c: string | RGB, shadow?: string | RGB) {
    let cx = x;
    for (const ch of s.toUpperCase()) {
      const g = GLYPH[ch] ?? GLYPH['?'];
      for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) if (g[j * 3 + i] === '#') { if (shadow) this.set(cx + i + 1, y + j + 1, shadow); this.set(cx + i, y + j, c); }
      cx += 4;
    }
  }
  /** width in px of a text run */
  static textW(s: string) { return s.length * 4 - 1; }
  /** a five-point star (pixel polygon) */
  star(cx: number, cy: number, r: number, c: string | RGB, inner = 0.45) {
    const pts: [number, number][] = [];
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * inner : r; pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); }
    this.poly(pts, c);
  }
  /** a lightning bolt (pixel polygon) about w x h */
  bolt(x: number, y: number, w: number, h: number, c: string | RGB) {
    this.poly([[x + w * 0.55, y], [x + w * 0.1, y + h * 0.56], [x + w * 0.45, y + h * 0.56], [x + w * 0.3, y + h], [x + w * 0.92, y + h * 0.4], [x + w * 0.55, y + h * 0.4], [x + w * 0.8, y]], c);
  }
  /** a tiny skull (7 x 7) */
  skull(x: number, y: number, c: string, dark: string) {
    this.R(x + 1, y, 5, 1, c); this.R(x, y + 1, 7, 3, c); this.R(x + 1, y + 4, 5, 1, c); this.R(x + 2, y + 5, 3, 2, c);
    this.R(x + 1, y + 2, 2, 2, dark); this.R(x + 4, y + 2, 2, 2, dark); this.set(x + 3, y + 4, dark); this.set(x + 3, y + 6, dark);
  }
}
const b4 = (p: Pal) => Math.min(p.length - 1, 4);

// ------------------------------------------------------------------ cached pages
export interface Tx { tex: THREE.CanvasTexture; w: number; h: number; r: (x: number, y: number, w: number, h: number) => UR }
const pages = new Map<string, Tx>();
/** a cached painted page (crisp: nearest texels, nearest-mip minification, repeat wrapping) */
export function tx(key: string, w: number, h: number, fn: (p: Pt) => void): Tx {
  let t = pages.get(key);
  if (t) return t;
  const p = new Pt(w, h);
  fn(p);
  const tex = p.texture({ repeat: true });
  tex.minFilter = THREE.NearestMipmapNearestFilter;
  const W = w, H = h;
  t = { tex, w, h, r: (x, y, rw, rh) => [x / W, 1 - (y + rh) / H, (x + rw) / W, 1 - y / H] as const };
  pages.set(key, t);
  return t;
}
