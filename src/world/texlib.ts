// Realistic pixel tiles for the v2 areas: 64 px seamless stone and seabed surfaces at PS1 texel density
// (~32 px per metre), painted with natural, low-saturation palettes, pits, cracks, grains, crusts and baked
// top-left relief. Rock and ground tiles are sampled in world space (triplanar / top-down) by the materials in
// mats.ts, so every rock and dune shares one texture per area.
import * as THREE from 'three';
import { Px, ramp, hex, mix, pxNoise, worley, RGB, shade } from '../gfx/px';
import { hash2 } from '../core/math';
import { Rng } from '../core/rng';
import type { AreaDef } from '../area/defs';

export const TILE = 64;
const cache = new Map<string, unknown>();
function memo<T>(k: string, f: () => T): T { if (!cache.has(k)) cache.set(k, f()); return cache.get(k) as T; }
const clampi = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

/** bake relief lighting from a height field (light from the upper left), wrapping */
function relief(p: Px, H: Float32Array, k = 0.55, bump = 2.2) {
  const N = p.w, M = p.h;
  const h = (x: number, y: number) => H[((y + M) % M) * N + ((x + N) % N)];
  p.map((c, x, y) => {
    const dx = (h(x + 1, y) - h(x - 1, y)) * bump, dy = (h(x, y + 1) - h(x, y - 1)) * bump;
    const l = (-dx * -0.6 - dy * -0.7 + 0.5) / Math.hypot(dx, dy, 1) / Math.hypot(0.6, 0.7, 0.5);
    return shade([c[0], c[1], c[2]], Math.max(0.35, 1 + (l - 0.5 / Math.hypot(0.6, 0.7, 0.5)) * k));
  });
}

function tex(p: Px) { return p.texture({ repeat: true }); }

// ------------------------------------------------------------------ stone
export function rockTile(a: AreaDef): THREE.Texture {
  return memo('rock' + a.id, () => {
    const N = TILE, p = new Px(N, N), H = new Float32Array(N * N);
    const R = ramp(a.pal.rock, 9, 0.7);
    const s = a.id.length * 31;
    const top = hex(a.pal.rockTop);
    p.fill((x, y) => {
      const n = pxNoise(x, y, 18, 4, s, N) * 0.65 + pxNoise(x, y, 5, 2, s + 3, N) * 0.35;
      const big = pxNoise(x, y, 32, 2, s + 9, N);
      let t = 0.32 + (n - 0.5) * 0.9 + (big - 0.5) * 0.5;
      let h = n * 0.8 + big * 0.4;
      let col: RGB | null = null;
      switch (a.rock) {
        case 'limestone': {
          // porous reef limestone: solution pits, hairline fractures, coralline + sponge crusts
          const [f1, , cid] = worley(x, y, 6, s + 1, N);
          const [g1, g2] = worley(x, y, 21, s + 2, N);
          if (f1 < 1.3 && cid > 0.55) { t -= 0.32; h -= 0.5; }
          else if (f1 < 2.2 && cid > 0.55) t += 0.08;
          if (g2 - g1 < 0.9) { t -= 0.22; h -= 0.3; }
          const crust = pxNoise(x, y, 12, 3, s + 21, N);
          if (crust > 0.62) col = mix(mix(top, [255, 200, 210], (crust - 0.62) * 1.5), R(t + 0.2, x, y), 0.35);
          if (hash2(x, y, s + 5) > 0.992) col = hex(hash2(x, y, 6) > 0.5 ? '#c8642a' : '#7a4a9a');
          break;
        }
        case 'volcanic': {
          const [f1, , cid] = worley(x, y, 4, s + 1, N);
          if (f1 < 1.0 && cid > 0.7) { t -= 0.35; h -= 0.6; }
          const [g1, g2] = worley(x, y, 18, s + 2, N);
          if (g2 - g1 < 1.1) { t -= 0.25; h -= 0.4; }
          const crust = pxNoise(x, y, 14, 3, s + 21, N);
          if (crust > 0.6) col = mix(top, hex('#e8a0a8'), (crust - 0.6) * 1.2 + (hash2(x, y, 3) - 0.5) * 0.2);
          else if (crust < 0.3 && hash2(x, y, s + 8) > 0.55) col = mix(hex('#4a4a20'), hex('#7a7030'), hash2(x, y, 9));
          break;
        }
        case 'mudstone': {
          const yy = y + (pxNoise(x, y, 20, 2, s + 4, N) - 0.5) * 10;
          const band = Math.sin(yy * 0.55) * 0.5 + 0.5;
          t += (band - 0.5) * 0.25;
          if (((yy % 9) + 9) % 9 < 0.8) { t -= 0.2; h -= 0.35; }
          const rust = pxNoise(x * 0.4, y * 2.5, 10, 2, s + 30, N);
          if (rust > 0.68) col = mix(R(t, x, y), hex('#8a4a22'), (rust - 0.68) * 2.6);
          const dust = pxNoise(x, y, 8, 2, s + 40, N);
          if (dust > 0.7) col = mix(col ?? R(t, x, y), hex(a.pal.rockTop), 0.45);
          break;
        }
        case 'granite': {
          const hh = hash2(x, y, s + 2);
          if (hh < 0.08) col = mix(R(t, x, y), hex('#c8a8a0'), 0.55);
          else if (hh < 0.13) col = mix(R(t, x, y), hex('#e8eef2'), 0.6);
          else if (hh < 0.2) t -= 0.25;
          const [g1, g2] = worley(x, y, 24, s + 3, N);
          if (g2 - g1 < 0.9) { t -= 0.28; h -= 0.4; }
          const frost = pxNoise(x, y, 9, 3, s + 50, N);
          if (frost > 0.66 && hash2(x, y, 4) > 0.3) col = mix(hex('#dfeaf2'), hex('#ffffff'), hash2(x, y, 5) * 0.6);
          break;
        }
        case 'pillow': {
          // glassy pillow basalt: rounded cells with chilled rims, sulfur + bacterial crusts
          const [f1, f2] = worley(x, y, 16, s + 1, N);
          const rimd = f2 - f1;
          h = Math.min(1, f2 / 10) * 0.8 + n * 0.2;
          t = 0.2 + h * 0.5 + (n - 0.5) * 0.4;
          if (rimd < 1.2) { t = 0.05; h -= 0.5; }
          if (hash2(x, y, s + 3) > 0.985) col = hex('#d8e0e8');
          const sul = pxNoise(x, y, 11, 3, s + 61, N);
          if (sul > 0.66) col = mix(hex('#8a5a18'), hex('#e8c040'), (sul - 0.66) * 3 + (hash2(x, y, 2) - 0.5) * 0.3);
          break;
        }
      }
      H[y * N + x] = h;
      return col ?? R(t, x, y);
    });
    relief(p, H, 0.5, 2.0);
    return tex(p);
  });
}

// ------------------------------------------------------------------ seabed surfaces
export function groundTile(a: AreaDef): THREE.Texture {
  return memo('ground' + a.id, () => {
    const N = TILE, p = new Px(N, N), H = new Float32Array(N * N);
    const R = ramp(a.pal.sand, 9, 0.7);
    const s = a.id.length * 17 + 3;
    p.fill((x, y) => {
      const n = pxNoise(x, y, 14, 3, s, N);
      let t = 0.55 + (n - 0.5) * 0.4;
      let h = n * 0.3;
      let col: RGB | null = null;
      switch (a.ground) {
        case 'coralSand': case 'kelpSand': {
          // wind... current ripples, warped, with grain and shell grit
          const warp = pxNoise(x, y, 16, 2, s + 4, N) * 14;
          const rp = Math.sin(((x + warp) / N) * Math.PI * 2 * 5);
          h += rp * 0.5;
          t += rp * 0.1 + (hash2(x, y, s + 1) - 0.5) * 0.22;
          const [f1, , cid] = worley(x, y, 7, s + 2, N);
          if (a.ground === 'kelpSand' && f1 < 2.2 && cid > 0.55) { t = 0.15 + cid * 0.5; h += 0.5; if (f1 > 1.5) t -= 0.12; }
          if (a.ground === 'coralSand' && f1 < 1.1 && cid > 0.9) col = hex(cid > 0.96 ? '#f0d8d0' : '#fffaf0');
          if (hash2(x, y, s + 9) > 0.985) col = hex(a.ground === 'coralSand' ? '#6a5a4a' : '#2a2a22');
          break;
        }
        case 'silt': {
          t = 0.45 + (n - 0.5) * 0.5 + (pxNoise(x, y, 4, 2, s + 7, N) - 0.5) * 0.12;
          if (hash2(x, y, s + 1) > 0.975) col = hex('#1e1e16');
          if (hash2(x, y, s + 2) > 0.993) col = hex('#8a4a2a');
          const [f1, , cid] = worley(x, y, 9, s + 3, N);
          if (cid > 0.85 && Math.abs(f1 - 2) < 0.6) { t -= 0.12; h -= 0.3; } // worm casts / burrows
          break;
        }
        case 'gravel': {
          const [f1, f2, cid] = worley(x, y, 6, s + 2, N);
          const edge = f2 - f1;
          t = 0.2 + cid * 0.65 + (n - 0.5) * 0.2;
          h = Math.min(1, edge / 4);
          if (edge < 0.8) { t = 0.08; h = 0; }
          if (cid > 0.93) col = mix(hex('#a07a6a'), hex('#c8a090'), n);
          if (hash2(x, y, s + 6) > 0.99) col = hex('#f8fcff');
          break;
        }
        case 'ooze': {
          t = 0.38 + (n - 0.5) * 0.45;
          if (hash2(x, y, s + 3) > 0.985) col = hex('#b8c4d0');
          const bac = pxNoise(x, y, 10, 3, s + 31, N);
          if (bac > 0.7) col = mix(hex('#8a4a1a'), hex('#d8a040'), (bac - 0.7) * 3);
          break;
        }
      }
      H[y * N + x] = h;
      return col ?? R(t, x, y);
    });
    relief(p, H, 0.4, 1.6);
    return tex(p);
  });
}

/** the front cross-section wall below the sand: strata bands with pebbles, ore flecks and the odd fossil */
export function strataTile(a: AreaDef): THREE.Texture {
  return memo('strata' + a.id, () => {
    const W = 64, Hh = 128, p = new Px(W, Hh), HF = new Float32Array(W * Hh);
    const layers = a.pal.strata;
    p.fill((x, y) => {
      const wob = (pxNoise(x, y, 24, 2, 4, W) - 0.5) * 10;
      const d = Math.max(0, (y + wob) / Hh);
      const li = Math.min(layers.length - 1, Math.floor(d * layers.length));
      const L = layers[li];
      const n = pxNoise(x, y, 5, 3, 9 + li, W);
      const [f1, f2, cid] = worley(x, y, 5 + li * 2, 5 + li, W);
      let c: RGB = mix(hex(L[0]), hex(L[1]), n);
      if (li >= 1 && cid > 0.55 && f1 < 2 + li) c = mix(c, hex(L[1]), 0.6);
      if (li >= 1 && f2 - f1 < 1.1 && cid > 0.55) c = mix(c, [0, 0, 0], 0.35);
      const dd = d * layers.length;
      if (Math.abs(dd - Math.round(dd)) < 0.015 && dd > 0.5) c = mix(c, [0, 0, 0], 0.45);
      HF[y * W + x] = n * 0.4 + (f2 - f1 < 1.1 ? -0.4 : 0.2);
      return c;
    });
    const rng = new Rng(77 + a.id.length);
    const ores = ['#c87a2a', '#2e9486', '#a83a3a', '#8a6ac8', '#d8b040'];
    for (let i = 0; i < 14; i++) {
      const x = rng.int(2, W - 4), y = rng.int(30, Hh - 6), col = hex(ores[rng.int(0, ores.length - 1)]);
      p.set(x, y, mix(col, [255, 255, 255], 0.4)); p.set(x + 1, y, col); p.set(x, y + 1, mix(col, [0, 0, 0], 0.3)); p.set(x + 1, y + 1, mix(col, [0, 0, 0], 0.5));
    }
    for (let i = 0; i < 3; i++) {
      const cx = rng.int(8, W - 8), cy = rng.int(50, Hh - 10);
      for (let t = 0; t < 14; t += 0.3) { const rr = t * 0.3; p.set(cx + Math.cos(t) * rr, cy + Math.sin(t) * rr * 0.8, '#c8bca0'); }
    }
    relief(p, HF, 0.4, 1.5);
    return tex(p);
  });
}

/** the sand layer seen in cross-section (fine bedding, shell hash, darker wet base) */
export function sectionTile(a: AreaDef): THREE.Texture {
  return memo('section' + a.id, () => {
    const N = TILE, p = new Px(N, N);
    const R = ramp(a.pal.sand, 8, 0.7);
    p.fill((x, y) => {
      const yy = y + (pxNoise(x, y, 18, 2, 3, N) - 0.5) * 6;
      const bed = Math.sin(yy * 0.9) * 0.5 + 0.5;
      let t = 0.62 - (y / N) * 0.25 + (bed - 0.5) * 0.12 + (hash2(x, y, 4) - 0.5) * 0.18;
      if (((yy % 11) + 11) % 11 < 0.7) t -= 0.12;
      if (hash2(x, y, 9) > 0.988) return a.ground === 'coralSand' ? hex('#fff6e8') : hex(a.pal.sand[4]);
      if (hash2(x, y, 10) > 0.99) t -= 0.3;
      return R(t, x, y);
    });
    return tex(p);
  });
}

// ------------------------------------------------------------------ wood + metal (props, wrecks, crates)
/** weathered or fresh planks: 64 px, planks run along u */
export function paintPlanks(p: { set(x: number, y: number, c: RGB | string, a?: number): void }, W: number, Hh: number, o: { base: string[]; seed: number; rot?: number; barnacles?: number; algae?: string; nails?: boolean; plankH?: number }) {
  const R = ramp(o.base, 8, 0.7);
  const ph = o.plankH ?? 8;
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    const pi = Math.floor(y / ph), py = y - pi * ph;
    const off = hash2(pi, 0, o.seed) * W;
    const xx = (x + off) % W;
    const grain = Math.sin(xx * 0.35 + Math.sin(y * 0.9 + pi) * 1.5 + pxNoise(xx, y, 9, 2, o.seed + pi) * 6) * 0.5 + 0.5;
    let t = 0.48 + (hash2(pi, 1, o.seed) - 0.5) * 0.3 + (grain - 0.5) * 0.22 + (hash2(x, y, o.seed + 2) - 0.5) * 0.08;
    if (py === 0) t = 0.06;
    else if (py === 1) t -= 0.15;
    else if (py === ph - 1) t += 0.08;
    // butt joints
    const joint = Math.floor((xx + hash2(pi, 3, o.seed) * 7) / 26);
    if (((xx + Math.floor(hash2(pi, 3, o.seed) * 7)) % 26) === 0) t = 0.1;
    void joint;
    let c = R(t, x, y);
    if (o.rot) {
      const r = pxNoise(x, y, 7, 3, o.seed + 11);
      if (r > 1 - o.rot * 0.5) c = mix(c, hex('#1a1612'), 0.6);
      if (o.algae && pxNoise(x, y, 10, 2, o.seed + 13) > 1 - o.rot * 0.6) c = mix(c, hex(o.algae), 0.55 + hash2(x, y, 5) * 0.2);
    }
    if (o.nails && py === 3 && (xx % 13 === 5)) c = hex('#3a2a20');
    p.set(x, y, c);
  }
  if (o.barnacles) {
    const rng = new Rng(o.seed + 99);
    for (let i = 0; i < o.barnacles; i++) {
      const cx = rng.int(1, W - 2), cy = rng.int(1, Hh - 2);
      p.set(cx, cy, '#d8d0c0'); p.set(cx + 1, cy, '#b0a898'); p.set(cx, cy + 1, '#8a8478'); p.set(cx + 1, cy + 1, '#3a3630');
    }
  }
}

export function paintMetal(p: { set(x: number, y: number, c: RGB | string, a?: number): void }, W: number, Hh: number, o: { paint: string[]; rust: number; seed: number; rivets?: number; plate?: number }) {
  const P = ramp(o.paint, 7, 0.7), RU = ramp(['#2a140a', '#5a2a12', '#8a4a1e', '#b0702e'], 6, 0.7);
  const pl = o.plate ?? 32;
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    const n = pxNoise(x, y, 12, 3, o.seed);
    const streak = pxNoise(x * 3, y * 0.3, 10, 2, o.seed + 5);
    let c = P(0.55 + (n - 0.5) * 0.3 + (hash2(x, y, o.seed) - 0.5) * 0.06, x, y);
    const ru = n * 0.6 + streak * 0.6 - 0.5;
    if (ru > 1 - o.rust) c = RU(0.3 + (ru - (1 - o.rust)) * 2 + (hash2(x, y, 2) - 0.5) * 0.3, x, y);
    if (x % pl === 0 || y % pl === 0) c = mix(c, [10, 8, 6], 0.55);
    if (o.rivets && (x % pl === 3 || x % pl === pl - 3) && y % 5 === 2) c = mix(c, [220, 200, 180], 0.35);
    p.set(x, y, c);
  }
}

/** colour helpers shared by area painters */
export const col = { hex, mix, shade, clampi };
