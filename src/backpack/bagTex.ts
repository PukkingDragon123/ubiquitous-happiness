// Painted textures for the backpack scene: worn leather (pebble grain, creases, scuffs, saddle stitching,
// a sewn-on patch, darkened worn edges), the quilted 5x5 pocket lining, canvas, straps, brass, driftwood,
// sand and cave rock. ~1 texel per centimetre so the pixels read crisply at the backpack's viewing distance.
import * as THREE from 'three';
import { Px, ramp, pxNoise, worley, hex, mix, type RGB } from '../gfx/px';
import { hash2, clamp01, fbm } from '../core/math';
import { textCanvas, type TextStyle } from '../ui/text';

export interface TexPair { map: THREE.Texture; normal: THREE.Texture }

const LEATHER = ['#1c0d08', '#341a0f', '#4f2815', '#6b381d', '#874a27', '#a35f33', '#c27c47'];

/** a stitched seam: dashes of cream thread with dark needle holes, along a param line */
function stitch(p: Px, H: Float32Array, pts: (t: number) => [number, number], len: number, o: { dash?: number; gap?: number; col?: string; hole?: string } = {}) {
  const dash = o.dash ?? 4, gap = o.gap ?? 3, col = hex(o.col ?? '#e8d6a8'), hole = hex(o.hole ?? '#160a06');
  const n = Math.ceil(len);
  for (let k = 0; k <= n; k++) {
    const ph = k % (dash + gap);
    const [x, y] = pts(k / n);
    const xi = Math.floor(x), yi = Math.floor(y);
    if (!p.inside(xi, yi)) continue;
    if (ph < dash) {
      const c = ph === 0 ? mix(col, [90, 70, 50], 0.4) : ph === dash - 1 ? mix(col, [60, 40, 30], 0.25) : col;
      p.set(xi, yi, c); H[yi * p.w + xi] += 0.9;
    } else if (ph === dash) { p.set(xi, yi, hole); H[yi * p.w + xi] -= 0.8; }
  }
}

/** worn leather for the bag shell: u = around the body, v = back (0) to rim (1) */
export function leatherShell(w = 1024, h = 128): TexPair {
  const p = new Px(w, h), H = new Float32Array(w * h);
  const r = ramp(LEATHER, 6, 0.7);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [f1, f2] = worley(x, y * 1.15, 3.2, 5, w);
    const pebble = clamp01((f2 - f1) / 2.2);
    const mott = pxNoise(x, y, 38, 4, 3, w);
    const crease = Math.abs(pxNoise(x, y * 0.6, 22, 3, 8, w) - 0.5) < 0.018 ? 1 : 0;
    const v = 1 - y / (h - 1);
    const edge = Math.max(0, 1 - v / 0.12) * 0.6 + Math.max(0, (v - 0.86) / 0.14) * 0.75;
    let t = 0.5 + (mott - 0.5) * 0.8 + pebble * 0.08 - edge * 0.38 - crease * 0.16;
    // scuffs: lighter worn patches where the bag gets dragged
    const sc = pxNoise(x, y, 9, 3, 17, w);
    if (sc > 0.7 && v > 0.25 && v < 0.85) t += (sc - 0.7) * 1.6;
    H[y * w + x] = pebble * 1.2 + mott * 2 - crease * 1.5;
    p.set(x, y, r(t, x, y));
  }
  // scratches
  for (let k = 0; k < 70; k++) {
    const x0 = hash2(k, 1, 9) * w, y0 = (0.15 + hash2(k, 2, 9) * 0.7) * h, a = (hash2(k, 3, 9) - 0.5) * 1.2, L = 4 + hash2(k, 4, 9) * 10;
    for (let s = 0; s < L; s++) {
      const x = Math.floor(x0 + Math.cos(a) * s), y = Math.floor(y0 + Math.sin(a) * s);
      if (!p.inside(x, y)) continue;
      p.shadePx(x, y, 1.35); if (p.inside(x, y + 1)) p.shadePx(x, y + 1, 0.75);
    }
  }
  // saddle stitching rows near the rim and the back seam
  for (const vy of [Math.round(h * 0.82), Math.round(h * 0.16)]) {
    for (let x = 0; x < w; x++) { p.shadePx(x, vy - 2, 0.82); H[(vy - 2) * w + x] -= 0.6; }
    stitch(p, H, (t) => [t * (w - 1), vy], w, { dash: 5, gap: 2 });
  }
  // a sewn-on patch on the bottom wall (u ~ 0.56) and a small round repair patch on the side
  const patch = (cx: number, cy: number, pw: number, ph: number, col: string[], round: boolean) => {
    const pr = ramp(col, 5, 0.6);
    for (let y = Math.floor(cy - ph / 2); y < cy + ph / 2; y++) for (let x = Math.floor(cx - pw / 2); x < cx + pw / 2; x++) {
      const nx = (x - cx) / (pw / 2), ny = (y - cy) / (ph / 2);
      const inside = round ? nx * nx + ny * ny < 1 : Math.max(Math.abs(nx), Math.abs(ny)) < 1 && Math.pow(Math.abs(nx), 6) + Math.pow(Math.abs(ny), 6) < 1;
      if (!inside || !p.inside(x, y)) continue;
      const d = round ? 1 - Math.hypot(nx, ny) : 1 - Math.max(Math.abs(nx), Math.abs(ny));
      p.set(x, y, pr(0.55 + (pxNoise(x, y, 6, 3, 41) - 0.5) * 0.5 - (d < 0.1 ? 0.25 : 0), x, y));
      H[y * w + x] += 1.2 + Math.min(1, d * 6);
    }
    const n = Math.round((pw + ph) * 1.6);
    stitch(p, H, (t) => {
      const a = t * Math.PI * 2;
      if (round) return [cx + Math.cos(a) * (pw / 2 - 2), cy + Math.sin(a) * (ph / 2 - 2)];
      const c = Math.cos(a), s = Math.sin(a), m = Math.max(Math.abs(c), Math.abs(s));
      return [cx + (c / m) * (pw / 2 - 2.5), cy + (s / m) * (ph / 2 - 2.5)];
    }, n, { dash: 3, gap: 2 });
  };
  patch(w * 0.57, h * 0.5, 54, 40, ['#3a2410', '#5e3c1c', '#86602e', '#a8804a', '#c8a06a'], false);
  patch(w * 0.19, h * 0.3, 26, 26, ['#24301a', '#38482a', '#506a38', '#6e8c48', '#90aa60'], true);
  p.lightFromHeight((x, y) => H[((y + h) % h) * w + ((x + w) % w)], -0.5, -0.7, 0.35, 1);
  const map = p.texture({ repeat: true });
  return { map, normal: Px.normalMap(w, h, (x, y) => H[y * w + x], 1.2, true) };
}

/** generic leather sheet (flap, straps): planar mapping, stitched border inset `border` px */
export function leatherSheet(w: number, h: number, seed: number, o: { border?: number; tone?: number; dark?: boolean } = {}): TexPair {
  const p = new Px(w, h), H = new Float32Array(w * h);
  const cols = o.dark ? ['#140906', '#24120a', '#371b0f', '#4c2616', '#62321d', '#7a4227'] : LEATHER;
  const r = ramp(cols, cols.length - 1, 0.7);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [f1, f2] = worley(x, y, 3.2, seed, 0);
    const pebble = clamp01((f2 - f1) / 2.2);
    const mott = pxNoise(x, y, 30, 4, seed + 3);
    const ed = Math.min(x, y, w - 1 - x, h - 1 - y);
    const edge = Math.max(0, 1 - ed / 9);
    let t = 0.52 + (o.tone ?? 0) + (mott - 0.5) * 0.8 + pebble * 0.08 - edge * 0.35;
    const sc = pxNoise(x, y, 8, 3, seed + 9);
    if (sc > 0.72) t += (sc - 0.72) * 1.5;
    H[y * w + x] = pebble * 1.2 + mott * 2 - edge * 2;
    p.set(x, y, r(t, x, y));
  }
  if (o.border) {
    const b = o.border;
    stitch(p, H, (t) => {
      const per = 2 * (w - 2 * b) + 2 * (h - 2 * b), d = t * per;
      if (d < w - 2 * b) return [b + d, b];
      if (d < w - 2 * b + h - 2 * b) return [w - 1 - b, b + d - (w - 2 * b)];
      if (d < 2 * (w - 2 * b) + h - 2 * b) return [w - 1 - b - (d - (w - 2 * b) - (h - 2 * b)), h - 1 - b];
      return [b, h - 1 - b - (d - 2 * (w - 2 * b) - (h - 2 * b))];
    }, 2 * (w + h), { dash: 4, gap: 2 });
  }
  p.lightFromHeight((x, y) => H[Math.max(0, Math.min(h - 1, y)) * w + Math.max(0, Math.min(w - 1, x))], -0.5, -0.7, 0.35, 1);
  return { map: p.texture(), normal: Px.normalMap(w, h, (x, y) => H[y * w + x], 1.2) };
}

/** a long strap: stitched along both edges, u across, v along (repeats along v) */
export function strapTex(dark = false): TexPair {
  const w = 24, h = 128;
  const p = new Px(w, h), H = new Float32Array(w * h);
  const r = ramp(dark ? ['#140906', '#24120a', '#371b0f', '#4c2616', '#62321d', '#7a4227'] : LEATHER, 6, 0.6);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const across = Math.abs(x - (w - 1) / 2) / ((w - 1) / 2);
    const mott = pxNoise(x, y, 14, 3, 4, 0);
    const t = 0.55 + (mott - 0.5) * 0.6 - Math.pow(across, 4) * 0.45 + (hash2(x, y, 3) - 0.5) * 0.08;
    H[y * w + x] = -Math.pow(across, 4) * 2;
    p.set(x, y, r(t, x, y));
  }
  for (const x of [3, w - 4]) stitch(p, H, (t) => [x, t * (h - 1)], h, { dash: 4, gap: 2 });
  p.lightFromHeight((x, y) => H[((y + h) % h) * w + Math.max(0, Math.min(w - 1, x))], -0.5, -0.7, 0.3, 1);
  const map = p.texture({ repeat: true });
  return { map, normal: Px.normalMap(w, h, (x, y) => H[y * w + x], 1.2, true) };
}

/** waxed canvas for the side pockets */
export function canvasTex(w = 96, h = 96): TexPair {
  const p = new Px(w, h), H = new Float32Array(w * h);
  const r = ramp(['#1c1e10', '#2e3218', '#454a24', '#5e6330', '#7a7c40', '#969654'], 5, 0.5);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const weave = (x + y) & 1 ? 0.03 : -0.03;
    const mott = pxNoise(x, y, 20, 3, 21);
    const ed = Math.min(x, y, w - 1 - x, h - 1 - y);
    const t = 0.55 + weave + (mott - 0.5) * 0.5 - Math.max(0, 1 - ed / 6) * 0.3 + (hash2(x, y, 5) - 0.5) * 0.06;
    H[y * w + x] = weave * 8 + mott;
    p.set(x, y, r(t, x, y));
  }
  stitch(p, H, (t) => [4 + t * (w - 9), 4], w, { col: '#d8c890' });
  stitch(p, H, (t) => [4 + t * (w - 9), h - 5], w, { col: '#d8c890' });
  p.lightFromHeight((x, y) => H[Math.max(0, Math.min(h - 1, y)) * w + Math.max(0, Math.min(w - 1, x))], -0.5, -0.7, 0.3, 1);
  return { map: p.texture(), normal: Px.normalMap(w, h, (x, y) => H[y * w + x], 1) };
}

/** inside lining for walls / the flap: dark teal canvas, faint weave */
export function liningPlain(w = 128, h = 64, seed = 2): THREE.Texture {
  const p = new Px(w, h);
  const r = ramp(['#081419', '#0f222a', '#163039', '#1f414c', '#2b5562'], 4, 0.5);
  p.fill((x, y) => r(0.5 + (((x + y) & 1) ? 0.06 : -0.06) + (pxNoise(x, y, 16, 3, seed, w) - 0.5) * 0.5, x, y));
  return p.texture({ repeat: true });
}

export interface LiningInfo extends TexPair { pxPerM: number; w: number; h: number; height: (u: number, v: number) => number }

/**
 * The quilted 5x5 pocket floor. The texture covers floorW x floorH metres; the grid (5 cells of `cell` m)
 * is centred at (gcx, gcy) metres from the floor centre. height(u, v) gives the puffy quilt offset (0..1).
 */
export function liningGrid(floorW: number, floorH: number, cell: number, gcx: number, gcy: number): LiningInfo {
  const pxPerM = 32 / cell;
  const w = Math.round(floorW * pxPerM), h = Math.round(floorH * pxPerM);
  const p = new Px(w, h), Hf = new Float32Array(w * h);
  const gx0 = Math.round(w / 2 + gcx * pxPerM - 80), gy0 = Math.round(h / 2 - gcy * pxPerM - 80);
  const r = ramp(['#071318', '#0c1d24', '#122a33', '#193844', '#224957', '#2e5c6a', '#3f7380'], 6, 0.55);
  const puff = (x: number, y: number) => {
    const lx = x - gx0, ly = y - gy0;
    if (lx < 0 || ly < 0 || lx >= 160 || ly >= 160) {
      // padded border: one long cushion around the grid
      const d = Math.min(Math.abs(lx < 0 ? lx : lx >= 160 ? lx - 159 : 1e9), Math.abs(ly < 0 ? ly : ly >= 160 ? ly - 159 : 1e9));
      return Math.min(1, d / 8) * 0.7;
    }
    const u = (lx % 32) / 31, v = (ly % 32) / 31;
    return Math.pow(Math.sin(u * Math.PI), 0.45) * Math.pow(Math.sin(v * Math.PI), 0.45);
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) Hf[y * w + x] = puff(x, y);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const hh = Hf[y * w + x];
    const weave = (((x >> 0) + (y >> 0)) & 1) ? 0.04 : -0.04;
    const mott = pxNoise(x, y, 24, 3, 13);
    let t = 0.3 + hh * 0.32 + weave + (mott - 0.5) * 0.3;
    const lx = x - gx0, ly = y - gy0;
    const inGrid = lx >= 0 && ly >= 0 && lx < 160 && ly < 160;
    if (inGrid && (lx % 32 === 0 || ly % 32 === 0)) t -= 0.18;
    if (!inGrid) t -= 0.05;
    p.set(x, y, r(t, x, y));
  }
  // light the quilt from its puff
  p.lightFromHeight((x, y) => Hf[Math.max(0, Math.min(h - 1, y)) * w + Math.max(0, Math.min(w - 1, x))] * 3, -0.5, -0.7, 0.55, 1);
  const H2 = new Float32Array(w * h);
  // double quilting stitches either side of each seam + an outer border seam
  for (let k = 0; k <= 5; k++) {
    for (const off of k === 0 ? [3] : k === 5 ? [-3] : [-3, 3]) {
      stitch(p, H2, (t) => [gx0 + k * 32 + off, gy0 + t * 159], 160, { dash: 3, gap: 2, col: '#767a66', hole: '#04090c' });
      stitch(p, H2, (t) => [gx0 + t * 159, gy0 + k * 32 + off], 160, { dash: 3, gap: 2, col: '#767a66', hole: '#04090c' });
    }
  }
  // outer piping around the grid
  for (let k = -1; k <= 160; k++) for (const [x, y] of [[gx0 + k, gy0 - 1], [gx0 + k, gy0 + 160], [gx0 - 1, gy0 + k], [gx0 + 160, gy0 + k]] as [number, number][]) {
    if (p.inside(x, y)) p.set(x, y, mix(hex('#3a1e10'), hex('#6b3a1e'), ((x + y) & 3) === 0 ? 0.6 : 0.2));
  }
  // brass grommets where the seams cross
  for (let j = 0; j <= 5; j++) for (let i = 0; i <= 5; i++) {
    const cx = gx0 + i * 32, cy = gy0 + j * 32;
    const pts: [number, number, string][] = [[0, 0, '#3a2408'], [-1, 0, '#a8742a'], [1, 0, '#6a4214'], [0, -1, '#f0cc70'], [0, 1, '#5a3810'], [-1, -1, '#fff0b0'], [1, 1, '#3a2408'], [1, -1, '#c89a40'], [-1, 1, '#7a5418']];
    for (const [dx, dy, c] of pts) p.set(cx + dx, cy + dy, c);
  }
  // a little wear: faded spots + an old ink blot
  for (let k = 0; k < 5; k++) {
    const cx = hash2(k, 1, 77) * w, cy = hash2(k, 2, 77) * h, rr = 3 + hash2(k, 3, 77) * 6;
    for (let y = Math.floor(cy - rr); y < cy + rr; y++) for (let x = Math.floor(cx - rr); x < cx + rr; x++) {
      if (!p.inside(x, y)) continue;
      const d = Math.hypot(x - cx, y - cy) / rr;
      if (d < 1 && hash2(x, y, k) > d) p.shadePx(x, y, k === 0 ? 0.6 : 1.12);
    }
  }
  const normal = Px.normalMap(w, h, (x, y) => Hf[y * w + x] * 2.2 + H2[y * w + x] * 0.5, 1.4);
  return { map: p.texture(), normal, pxPerM, w, h, height: (u, v) => { const x = Math.floor(u * (w - 1)), y = Math.floor((1 - v) * (h - 1)); return Hf[Math.max(0, Math.min(h - 1, y)) * w + Math.max(0, Math.min(w - 1, x))]; } };
}

/** the glowing stitched outline used to highlight a pocket */
export function cellGlowTex(): THREE.Texture {
  const p = new Px(32, 32);
  for (let k = 0; k < 32; k++) for (const [x, y] of [[k, 1], [k, 30], [1, k], [30, k]] as [number, number][]) {
    if (k % 5 < 3) p.set(x, y, '#ffffff');
  }
  for (let k = 2; k < 30; k++) for (const [x, y] of [[k, 2], [k, 29], [2, k], [29, k]] as [number, number][]) p.set(x, y, '#ffffff', 70);
  for (let y = 3; y < 29; y++) for (let x = 3; x < 29; x++) p.set(x, y, '#ffffff', 26);
  return p.texture({ mip: false });
}

/** brass: warm metal with a painted sheen */
export function brassTex(): THREE.Texture {
  const p = new Px(32, 32);
  const r = ramp(['#2a1806', '#5a3810', '#8a6024', '#b88a3c', '#d8b268', '#ecd090'], 5, 0.5);
  p.fill((x, y) => r(0.35 + (1 - y / 31) * 0.45 + (pxNoise(x, y, 6, 2, 3) - 0.5) * 0.3, x, y));
  return p.texture();
}

/** bleached driftwood plank with grain, knots and nail holes */
export function driftwoodTex(w = 160, h = 112): TexPair {
  const p = new Px(w, h), H = new Float32Array(w * h);
  const r = ramp(['#3a3026', '#5a4a3a', '#7e6a54', '#a08a70', '#bea88a', '#d6c4a6', '#ece0c8'], 6, 0.6);
  const knots = [[40, 30, 6], [118, 74, 5], [84, 18, 3.5]];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let warp = 0;
    for (const [kx, ky, kr] of knots) { const d = Math.hypot(x - kx, (y - ky) * 2.2); warp += (kr * 3) / (d + 2) * Math.sign(y - ky); }
    const g = Math.sin((y + warp * 1.6 + pxNoise(x, y, 40, 3, 7) * 14) * 0.9);
    const ring = g > 0.88 ? -0.1 : g < -0.85 ? 0.05 : 0;
    const crack = Math.abs(pxNoise(x * 0.15, y * 2.4, 6, 2, 31) - 0.5) < 0.006 ? -0.3 : 0;
    let t = 0.6 + ring + crack + (pxNoise(x, y, 26, 3, 9) - 0.5) * 0.3 + (pxNoise(x, y * 6, 3, 2, 5) - 0.5) * 0.12;
    for (const [kx, ky, kr] of knots) { const d = Math.hypot(x - kx, (y - ky) * 1.6); if (d < kr) t -= 0.35 * (1 - d / kr) + (Math.sin(d * 2.5) > 0.3 ? 0.1 : 0); }
    const ed = Math.min(x, y, w - 1 - x, h - 1 - y);
    t -= Math.max(0, 1 - ed / 5) * 0.2;
    H[y * w + x] = ring * 2 + crack * 2;
    p.set(x, y, r(t, x, y));
  }
  for (const [nx, ny] of [[8, 10], [8, h - 11], [w - 9, 12], [w - 9, h - 12]]) {
    p.set(nx, ny, '#2a1408'); p.set(nx + 1, ny, '#7a3a18'); p.set(nx, ny + 1, '#5a2a10'); p.set(nx + 1, ny + 1, '#a85a28');
    for (let k = 1; k < 4; k++) p.set(nx + 1, ny + 1 + k, mix(hex('#6a3418'), hex('#927a62'), k / 4));
  }
  p.lightFromHeight((x, y) => H[Math.max(0, Math.min(h - 1, y)) * w + Math.max(0, Math.min(w - 1, x))], -0.5, -0.7, 0.3, 1);
  return { map: p.texture(), normal: Px.normalMap(w, h, (x, y) => H[y * w + x], 1) };
}

/** rippled seabed sand (tiles) */
export function sandTex(n = 128): TexPair {
  const p = new Px(n, n), H = new Float32Array(n * n);
  const r = ramp(['#3a3022', '#5a4a34', '#7a6648', '#9a845e', '#b8a078', '#d2bc92'], 5, 0.7);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const rip = Math.sin((y + pxNoise(x, y, 30, 3, 4, n) * 26) * (Math.PI * 2 / 16)) * 0.5 + 0.5;
    const grain = hash2(x, y, 3);
    H[y * n + x] = rip * 2;
    p.set(x, y, r(0.55 + (rip - 0.5) * 0.12 + (pxNoise(x, y, 20, 3, 6, n) - 0.5) * 0.35 + (grain > 0.93 ? 0.2 : grain < 0.05 ? -0.15 : 0), x, y));
  }
  p.lightFromHeight((x, y) => H[((y + n) % n) * n + ((x + n) % n)], -0.5, -0.7, 0.2, 1);
  return { map: p.texture({ repeat: true }), normal: Px.normalMap(n, n, (x, y) => H[y * n + x], 0.5, true) };
}

/** cave rock (tiles), soft blurry version for the background (linear filtered) */
export function rockTex(n = 64, blur = false, tint: string[] = ['#06141a', '#0c222a', '#14323a', '#1e444c', '#2a5658', '#3a6a66']): THREE.Texture {
  const p = new Px(n, n);
  const r = ramp(tint, 5, blur ? 0 : 0.6);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const [f1, f2] = worley(x, y, n / 5, 3, n);
    const ridge = clamp01((f2 - f1) / (n / 10));
    const t = 0.25 + ridge * 0.4 + (pxNoise(x, y, n / 4, 4, 2, n) - 0.5) * 0.6 - (y / n) * 0.0;
    p.set(x, y, r(t, x, y));
  }
  const t = p.texture({ repeat: true });
  if (blur) { t.magFilter = THREE.LinearFilter; }
  return t;
}

/** a soft round glow (lamp halo, light shafts) */
export function glowTex(n = 64, falloff = 2): THREE.Texture {
  const p = new Px(n, n);
  p.fill((x, y) => { const d = Math.hypot(x + 0.5 - n / 2, y + 0.5 - n / 2) / (n / 2); const a = Math.pow(Math.max(0, 1 - d), falloff); return [255, 255, 255, a * 255]; });
  const t = p.texture({ mip: false });
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter;
  return t;
}

/** vertical light shaft gradient */
export function shaftTex(): THREE.Texture {
  const w = 32, h = 128, p = new Px(w, h);
  p.fill((x, y) => { const u = Math.sin(((x + 0.5) / w) * Math.PI); const v = 1 - y / h; const n = fbm(x / 6, y / 30, 2, 4); return [255, 250, 230, Math.pow(u, 2) * Math.pow(v, 0.7) * (0.6 + n * 0.6) * 255]; });
  const t = p.texture({ mip: false });
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter;
  return t;
}

/** the little leather name tag with BLOB stamped on it (portrait, hole at the top) */
export function nameTagTex(text = 'BLOB'): THREE.Texture {
  const w = 32, h = 44;
  const p = new Px(w, h), H = new Float32Array(w * h);
  const r = ramp(['#3a1c0c', '#5a2e14', '#7e4422', '#a05c30', '#c07a44', '#d89a62'], 5, 0.6);
  const shape = (x: number, y: number) => !(y < 8 && (x < 8 - y || x > w - 9 + y));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!shape(x, y)) continue;
    const ed = Math.min(x, y, w - 1 - x, h - 1 - y);
    const t = 0.58 + (pxNoise(x, y, 10, 3, 5) - 0.5) * 0.4 - Math.max(0, 1 - ed / 3) * 0.3;
    p.set(x, y, r(t, x, y));
    H[y * w + x] = Math.min(1, ed / 2);
  }
  // brass eyelet
  for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) {
    const d = Math.hypot(x, y);
    if (d < 1.5) p.set(16 + x, 7 + y, '#000000', 0);
    else if (d < 3.2) p.set(16 + x, 7 + y, x + y < 0 ? '#f6d880' : x + y > 1 ? '#7a5014' : '#c8963a');
  }
  stitch(p, H, (t) => [2, 12 + t * (h - 15)], h, { dash: 2, gap: 2 });
  stitch(p, H, (t) => [w - 3, 12 + t * (h - 15)], h, { dash: 2, gap: 2 });
  stitch(p, H, (t) => [3 + t * (w - 7), h - 3], w, { dash: 2, gap: 2 });
  // stamped letters (debossed: dark fill, light lower-right lip)
  const st: TextStyle = { font: 'M5x7', px: 16, fill: '#ffffff' };
  const tc = textCanvas(text, st);
  const ctx = tc.canvas.getContext('2d')!;
  const d = ctx.getImageData(0, 0, tc.w, tc.h).data;
  let minX = tc.w, maxX = 0, minY = tc.h, maxY = 0;
  for (let y = 0; y < tc.h; y++) for (let x = 0; x < tc.w; x++) if (d[(y * tc.w + x) * 4 + 3] > 128) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  const tw = maxX - minX + 1, th = maxY - minY + 1, ox = Math.round((w - tw) / 2), oy = 14 + Math.round((h - 17 - th) / 2);
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
    if (d[(y * tc.w + x) * 4 + 3] <= 128) continue;
    const px = ox + x - minX, py = oy + y - minY;
    p.set(px, py, '#2a1006');
    if (!(d[((y + 1) * tc.w + x + 1) * 4 + 3] > 128)) p.set(px + 1, py + 1, '#e2aa70');
  }
  p.outline('#1a0804');
  return p.texture();
}

export const brassMat = () => new THREE.MeshStandardMaterial({ map: brassTex(), color: '#a89878', roughness: 0.45, metalness: 0.4, emissive: new THREE.Color('#1a0e02'), emissiveIntensity: 0.4 });

export function rgbOf(s: string): RGB { return hex(s); }
