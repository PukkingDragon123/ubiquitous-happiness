// Hideout surface textures, painted per pixel at PS1 texel density (32 px/m for the cave, 64 px/m on furniture):
// realistic materials (wet basalt, flagstones, grained planks, corduroy, a worn Persian rug, chipped enamel,
// brass) in banded, dither-stepped ramps so they read as pixel art up close and as real stuff from afar.
//
//   TEX.rock() / TEX.floor() / TEX.wood('pine') ...   cached THREE textures (repeat-wrapped, nearest mag)
//   MAT.wood('pine') ...                              cached retro-patched MeshStandardMaterials
import * as THREE from 'three';
import { Px, ramp, pxNoise, worley, hex, mix, shade, type RGB } from '../gfx/px';
import { hash2, clamp01, fbm } from '../core/math';
import { retro } from '../gfx/retro';

const memo = <T>(fn: () => T) => { let v: T | undefined; return () => (v ??= fn()); };
const memoK = <T>(fn: (k: string) => T) => { const m = new Map<string, T>(); return (k: string) => { let v = m.get(k); if (!v) { v = fn(k); m.set(k, v); } return v; }; };

// ------------------------------------------------------------------ painters
/** basalt / granite cave rock (2 m tile at 32 px/m); outside=true adds coralline algae + sponge crust */
function paintRock(outside: boolean, seed: number): Px {
  const S = 64, p = new Px(S, S);
  const R = ramp(outside ? ['#1a1c22', '#2c2e36', '#40404a', '#56545c', '#6e6a6c', '#8a8480'] : ['#16110f', '#261d18', '#382b23', '#4a3a2e', '#5e4a3a', '#7a6450'], 7, 0.8);
  const hf = (x: number, y: number) => {
    const [f1, f2] = worley(x, y, 13, seed, S);
    const cell = clamp01((f2 - f1) / 6);
    return pxNoise(x, y, 18, 4, seed, S) * 0.6 + cell * 0.5 + pxNoise(x, y, 5, 2, seed + 3, S) * 0.25;
  };
  p.fill((x, y) => {
    const h = hf(x, y);
    const [f1, f2, id] = worley(x, y, 13, seed, S);
    let t = h * 0.95 - 0.05 + (id - 0.5) * 0.18;
    if (f2 - f1 < 1.2) t -= 0.45; // fracture lines
    const c = R(t, x, y);
    return c;
  });
  p.lightFromHeight((x, y) => hf(((x % S) + S) % S, ((y % S) + S) % S) * 6, -0.5, -0.8, 0.55, 1.4);
  // mineral flecks + wet glints
  p.map((c, x, y) => {
    const hv = hash2(x, y, seed + 9);
    if (hv > 0.985) return shade(c as unknown as RGB, 1.35);
    if (hv < 0.012) return shade(c as unknown as RGB, 0.6);
    return null;
  });
  if (outside) {
    // pink coralline crust and green algae in patches, sponge dots
    p.map((c, x, y) => {
      const a = pxNoise(x, y, 14, 3, seed + 20, S), g = pxNoise(x, y, 10, 3, seed + 30, S);
      if (a > 0.62) return mix(c as unknown as RGB, hash2(x, y, 4) > 0.5 ? hex('#c86a8a') : hex('#a84a6e'), 0.75);
      if (g > 0.64) return mix(c as unknown as RGB, hash2(x, y, 5) > 0.5 ? hex('#4a6a2a') : hex('#36521e'), 0.7);
      if (hash2(x, y, 6) > 0.993) return hex('#e8a03a');
      return null;
    });
  } else {
    // soot and damp near the bottom of the tile, a few tool marks
    p.map((c, x, y) => {
      const d = pxNoise(x, y, 20, 3, seed + 40, S);
      if (d > 0.6) return shade(c as unknown as RGB, 0.8);
      return null;
    });
  }
  return p;
}

/** flagstone floor, 4 m tile at 32 px/m: irregular slabs, sandy grout, wear and cracks */
function paintFloor(): Px {
  const S = 128, p = new Px(S, S);
  const stones = [['#5c5248', '#6e6458', '#827666', '#968a76', '#ab9e88'], ['#4e4a46', '#5e5a54', '#706a62', '#847c72', '#988e82'], ['#5e4c3c', '#705c48', '#846c56', '#987e64', '#ac9274']].map((c) => ramp(c, 6, 0.7));
  const grout = ramp(['#2a2218', '#3a3024', '#4e4232'], 3);
  p.fill((x, y) => {
    const [f1, f2, id] = worley(x, y, 22, 7, S);
    const edge = f2 - f1;
    if (edge < 2.2) return grout(pxNoise(x, y, 4, 2, 3, S), x, y);
    const R = stones[Math.floor(id * 3) % 3];
    const n = pxNoise(x, y, 12, 3, 11 + Math.floor(id * 50), S);
    let t = 0.35 + n * 0.55 + (id - 0.5) * 0.3;
    if (edge < 3.4) t += 0.18; // worn bevel catches light
    if (edge > 3.4 && edge < 4.4) t -= 0.08;
    // wear polish in the middle of slabs
    t += clamp01((edge - 6) / 10) * 0.08;
    return R(t, x, y);
  });
  // hairline cracks
  for (let k = 0; k < 14; k++) {
    let x = hash2(k, 1, 5) * S, y = hash2(k, 2, 5) * S, a = hash2(k, 3, 5) * 6.28;
    for (let i = 0; i < 10 + hash2(k, 4, 5) * 14; i++) {
      const xx = ((Math.round(x) % S) + S) % S, yy = ((Math.round(y) % S) + S) % S;
      const c = p.get(xx, yy);
      p.set(xx, yy, shade([c[0], c[1], c[2]], 0.55));
      a += (hash2(k, i, 6) - 0.5) * 0.9; x += Math.cos(a); y += Math.sin(a);
    }
  }
  p.grain(0.05, 3);
  return p;
}

/** seabed sand with ripples and shell grit (2 m tile) */
function paintSand(): Px {
  const S = 64, p = new Px(S, S);
  const R = ramp(['#4a4a52', '#6a6658', '#8a8268', '#a89c7c', '#c4b692'], 6, 0.8);
  p.fill((x, y) => {
    const rip = Math.sin((x * 0.42 + pxNoise(x, y, 16, 2, 4, S) * 9) ) * 0.5 + 0.5;
    const n = pxNoise(x, y, 9, 3, 8, S);
    return R(0.25 + n * 0.5 + rip * 0.22, x, y);
  });
  p.map((c, x, y) => { const h = hash2(x, y, 31); if (h > 0.985) return hex('#e8e0cc'); if (h < 0.015) return hex('#3a3830'); return null; });
  return p;
}

const WOODS: Record<string, string[]> = {
  pine: ['#5a3418', '#7a4a24', '#9a6432', '#b67e44', '#cc9a5c', '#e0b878'],
  walnut: ['#1e110a', '#2e1a0e', '#422614', '#56341c', '#6c4426', '#865834'],
  oak: ['#3a2410', '#563618', '#6e4a22', '#88602e', '#a0783e', '#b8925a'],
  drift: ['#3e3a36', '#55504a', '#6e6860', '#888076', '#a29a8e', '#bab2a4'],
  red: ['#2a0c08', '#4a1810', '#6a2618', '#8a3822', '#a24e2e', '#bc6a42'],
  teak: ['#2a1608', '#44260e', '#5e3816', '#7a4c1e', '#946228', '#ae7c3a'],
};
/** planks (1 m tile at 64 px/m): boards with grain, knots, seams and nail heads */
function paintWood(kind: string): Px {
  const S = 64, p = new Px(S, S);
  const R = ramp(WOODS[kind] ?? WOODS.pine, 7, 0.7);
  const bw = 16;
  p.fill((x, y) => {
    const b = Math.floor(x / bw), bx = x - b * bw;
    const off = hash2(b, 0, 3) * 60;
    const n = pxNoise(x * 3, y + off, 22, 3, 5 + b, 0);
    const grain = Math.sin((bx + n * 9 + Math.sin((y + off) * 0.05) * 3) * 1.1) * 0.5 + 0.5;
    let t = 0.3 + grain * 0.3 + (hash2(b, 1, 3) - 0.5) * 0.25 + (pxNoise(x, y, 8, 2, 9, S) - 0.5) * 0.2;
    // knot
    const kx = b * bw + 8, ky = (hash2(b, 2, 3) * 64) | 0;
    const kd = Math.hypot(x - kx, (y - ky) * 0.6);
    if (hash2(b, 4, 3) > 0.45 && kd < 3.5) t = 0.05 + kd * 0.06;
    if (bx === 0) t = 0.0; else if (bx === 1) t += 0.15; else if (bx === bw - 1) t -= 0.15;
    // board ends
    const endY = ((hash2(b, 5, 3) * 64) | 0);
    if (y === endY) t = 0.02; else if (y === (endY + 1) % S) t += 0.12;
    return R(t, x, y);
  });
  // nail heads at board ends
  for (let b = 0; b < S / bw; b++) {
    const endY = ((hash2(b, 5, 3) * 64) | 0);
    for (const nx of [b * bw + 4, b * bw + 11]) { const ny = (endY + 3) % S; p.set(nx, ny, '#2a2624'); p.set(nx + 1, ny, '#6a625a'); p.set(nx, ny + 1, '#141210'); }
  }
  return p;
}

const FAB: Record<string, string[]> = {
  mustard: ['#4a3208', '#6e4c10', '#946a1a', '#b8862a', '#d0a040', '#e4bc5c'],
  teal: ['#08262a', '#0e3a3e', '#165256', '#206a6c', '#348484', '#4e9c98'],
  rust: ['#2e0e06', '#4a1a0c', '#682814', '#86381e', '#a24c2a', '#ba6638'],
  plum: ['#1e0a1a', '#301228', '#481c3a', '#60284c', '#78365e', '#904a72'],
  olive: ['#1e2210', '#2e3418', '#424a22', '#56602e', '#6c763c', '#848e50'],
  navy: ['#080c1e', '#10182e', '#1a2644', '#26365a', '#344872', '#4a5e8a'],
  cream: ['#5a5040', '#7a6e58', '#9a8e74', '#b6aa8e', '#ccc2a6', '#e0d8c0'],
};
/** corduroy upholstery (0.5 m tile at 64 px/m) with wear on the ribs */
function paintFabric(kind: string): Px {
  const S = 32, p = new Px(S, S);
  const R = ramp(FAB[kind] ?? FAB.mustard, 6, 0.6);
  p.fill((x, y) => {
    const rib = (x % 4);
    let t = rib === 0 ? 0.15 : rib === 1 ? 0.55 : rib === 2 ? 0.72 : 0.45;
    t += (pxNoise(x, y, 7, 3, 13, S) - 0.5) * 0.35;
    if (hash2(x, y, 2) > 0.9) t += 0.1;
    return R(t, x, y);
  });
  return p;
}

/** chunky knit (blanket, beanie): rows of V stitches in stripes */
function paintKnit(a: string, b: string): Px {
  const S = 32, p = new Px(S, S);
  const A = ramp([shade(hex(a), 0.55), hex(a), shade(hex(a), 1.25)], 3), B = ramp([shade(hex(b), 0.55), hex(b), shade(hex(b), 1.25)], 3);
  p.fill((x, y) => {
    const row = Math.floor(y / 4), sx = x % 4, sy = y % 4;
    const R = Math.floor(row / 2) % 3 === 2 ? B : A;
    const v = Math.abs(sx - 1.5) / 1.5;
    let t = 0.6 + (sy === 0 ? -0.2 : 0) - v * 0.3 + (sy === 3 ? -0.35 : 0);
    if (sx === 0 || sx === 3) t -= 0.15;
    return R(t, x, y);
  });
  return p;
}

/** a worn Persian rug: border bands, a medallion, a field of small motifs, fringe (non-tiling 64 x 96) */
function paintRug(kind: string): Px {
  const W = 64, H = 96, p = new Px(W, H);
  const pal = kind === 'blue'
    ? { field: '#1e2c5a', field2: '#16224a', border: '#7a1e1e', motif: '#d8c8a0', ink: '#0c0e1e', accent: '#c88a2a' }
    : { field: '#8a1c1c', field2: '#701414', border: '#1e2c5a', motif: '#e0cfa2', ink: '#1a0808', accent: '#d89a2e' };
  const F = hex(pal.field), F2 = hex(pal.field2), BO = hex(pal.border), M = hex(pal.motif), K = hex(pal.ink), A = hex(pal.accent);
  p.fill((x, y) => {
    const dx = Math.min(x, W - 1 - x), dy = Math.min(y, H - 1 - y);
    const d = Math.min(dx, dy - 3);
    if (dy < 3) return (x % 2 === 0) ? hex('#d8ccb0') : null; // fringe
    if (d < 0) return null;
    if (d === 0) return K;
    if (d <= 2) return d === 1 ? A : K;
    if (d <= 8) {
      // border band with a running zig-zag
      const u = dx < dy - 3 ? y : x;
      const z = Math.abs(((u + (d - 3)) % 8) - 4);
      return (d === 3 || d === 8) ? K : z === (d - 4) % 4 ? M : BO;
    }
    if (d === 9) return M;
    // field: diamond medallion + scattered motifs
    const cx = x - W / 2 + 0.5, cy = y - H / 2 + 0.5;
    const md = Math.abs(cx) / 18 + Math.abs(cy) / 26;
    if (md < 1) {
      if (md > 0.9) return K;
      if (md > 0.8) return M;
      const inner = Math.abs(cx) / 7 + Math.abs(cy) / 10;
      if (inner < 1) return inner > 0.75 ? A : inner > 0.5 ? K : M;
      return ((Math.abs(cx) + Math.abs(cy)) % 4 < 1) ? A : BO;
    }
    const mx = (x - 10) % 9, my = (y - 12) % 11;
    if ((mx === 4 && my >= 3 && my <= 7) || (my === 5 && mx >= 2 && mx <= 6)) return M;
    return (Math.floor(y / 2) + Math.floor(x / 3)) % 7 === 0 ? F2 : F;
  });
  // wear: thin patches showing the cream warp threads, and dirt
  p.map((c, x, y) => {
    const w = pxNoise(x, y, 10, 3, 77, 0);
    if (w > 0.66 && hash2(x, y, 3) > 0.35) return mix(c as unknown as RGB, hex('#c8b898'), 0.45);
    if (w < 0.3) return shade(c as unknown as RGB, 0.85);
    return null;
  });
  p.grain(0.08, 9);
  return p;
}

/** painted steel with chipped enamel and rust runs (1 m tile at 64 px/m) */
function paintMetal(kind: string): Px {
  const S = 64, p = new Px(S, S);
  const paint = kind === 'red' ? ['#3a0c0a', '#5e1612', '#82221a', '#a03224', '#b84a34'] : kind === 'yellow' ? ['#4a3606', '#6e520c', '#967214', '#b8901e', '#d0aa34'] : kind === 'grey' ? ['#262a2e', '#3a4044', '#50585c', '#687074', '#848c8e'] : ['#16302a', '#1e443a', '#2a5a4a', '#3a7060', '#4e8674'];
  const P = ramp(paint, 5, 0.6), RU = ramp(['#2a1206', '#4a2008', '#6e3410', '#8e4a1a', '#a8642a'], 5);
  p.fill((x, y) => {
    const chip = pxNoise(x, y, 9, 3, 5, S);
    const run = pxNoise(x * 4, y * 0.5, 12, 2, 9, S);
    if (chip > 0.68) return RU(0.4 + pxNoise(x, y, 3, 2, 3, S) * 0.5, x, y);
    if (chip > 0.64) return hex('#aaa49a');
    let t = 0.55 + (pxNoise(x, y, 20, 2, 7, S) - 0.5) * 0.4;
    if (run > 0.6) return mix(P(t, x, y), RU(0.5, x, y), clamp01((run - 0.6) * 4));
    t += (hash2(x, y, 3) - 0.5) * 0.1;
    return P(t, x, y);
  });
  return p;
}

/** polished brass with verdigris in the crevices */
function paintBrass(): Px {
  const S = 32, p = new Px(S, S);
  const R = ramp(['#3a2408', '#6a4610', '#9a6e1e', '#c8982e', '#e8c45a', '#fff0a0'], 7, 0.7);
  p.fill((x, y) => {
    let t = 0.5 + (pxNoise(x, y, 8, 3, 3, S) - 0.5) * 0.7 + Math.sin(y * 0.4) * 0.12;
    const v = pxNoise(x, y, 6, 2, 9, S);
    if (v > 0.68) return mix(R(t, x, y), hex('#4aa08a'), 0.6);
    return R(t, x, y);
  });
  return p;
}

/** worn leather (armchair, belts) */
function paintLeather(kind: string): Px {
  const S = 32, p = new Px(S, S);
  const R = ramp(kind === 'black' ? ['#0a0808', '#1a1414', '#2a2020', '#3e3030', '#584646'] : ['#2a1208', '#46200e', '#643016', '#824422', '#a05e34', '#c08050'], 6, 0.7);
  p.fill((x, y) => {
    const [f1, f2] = worley(x, y, 5, 3, S);
    let t = 0.45 + (pxNoise(x, y, 10, 3, 4, S) - 0.5) * 0.6;
    if (f2 - f1 < 0.8) t -= 0.25;
    return R(t, x, y);
  });
  return p;
}

/** CRT TV cabinet: 70s walnut veneer */
const paintVeneer = () => {
  const S = 64, p = new Px(S, S);
  const R = ramp(['#1a0c06', '#2e170a', '#4a2610', '#643618', '#7e4a22', '#9a6232'], 7, 0.7);
  p.fill((x, y) => {
    const n = pxNoise(x * 0.3, y * 2, 6, 3, 21, 0);
    const fig = Math.sin(x * 0.35 + n * 12 + Math.sin(y * 0.15) * 2) * 0.5 + 0.5;
    return R(0.25 + fig * 0.45 + (pxNoise(x, y, 4, 2, 2, S) - 0.5) * 0.15, x, y);
  });
  return p;
};

/** a row of book spines (64 x 32): varied colours, heights, gilt bands */
function paintBooks(): Px {
  const p = new Px(64, 32);
  const cols = ['#7a1e1e', '#1e3a6a', '#2a5a2a', '#6a4a1a', '#4a1e5a', '#1e5a5a', '#8a6a2a', '#3a3a3a', '#a04a20'];
  let x = 0, k = 0;
  while (x < 64) {
    const w = 3 + Math.floor(hash2(k, 1, 4) * 4), h = 20 + Math.floor(hash2(k, 2, 4) * 11);
    const c = hex(cols[Math.floor(hash2(k, 3, 4) * cols.length)]);
    const lean = hash2(k, 5, 4) > 0.9;
    for (let i = 0; i < w && x + i < 64; i++) for (let j = 32 - h; j < 32; j++) {
      const edge = i === 0 || i === w - 1;
      let cc: RGB = edge ? shade(c, 0.6) : i === 1 ? shade(c, 1.2) : c;
      if (j === 32 - h + 3 || j === 32 - h + 4 || j === 29) cc = hex('#d8b04a');
      if (j === 32 - h + 8 && i > 0 && i < w - 1 && hash2(k, 6, 4) > 0.4) cc = hex('#e8dcc0');
      p.set(x + i + (lean && j < 16 ? 1 : 0), j, cc);
    }
    x += w; k++;
  }
  return p;
}

/** pegboard (workshop wall): brown board with a grid of holes */
function paintPegboard(): Px {
  const S = 32, p = new Px(S, S);
  const R = ramp(['#4a3018', '#5e3e20', '#72502a', '#866034'], 4);
  p.fill((x, y) => (x % 8 === 3 && y % 8 === 3 ? hex('#140c06') : x % 8 === 4 && y % 8 === 4 ? hex('#3a2410') : R(0.5 + (pxNoise(x, y, 6, 2, 3, S) - 0.5) * 0.6, x, y)));
  return p;
}

/** generic flat colour with grain (plastic, ceramic) */
function paintPlain(col: string, grain = 0.1): Px {
  const S = 16, p = new Px(S, S);
  const c = hex(col);
  const R = ramp([shade(c, 0.8), c, shade(c, 1.12)], 3, 0.7);
  p.fill((x, y) => R(0.5 + (pxNoise(x, y, 4, 2, 7, S) - 0.5) * grain * 6, x, y));
  return p;
}

/** a kelp blade (alpha cut-out): ruffled edge, midrib, gas bladder at the base */
function paintKelp(): Px {
  const W = 16, H = 64, p = new Px(W, H);
  const R = ramp(['#1a2a08', '#2e4410', '#4a6218', '#6a8222', '#8aa034', '#a8b84a'], 6, 0.7);
  for (let y = 0; y < H; y++) {
    const half = 3.2 + Math.sin(y * 0.5) * 1.2 + (y > H - 8 ? (H - y) * -0.3 : 0) + 2.2 * Math.min(1, y / 10);
    for (let x = 0; x < W; x++) {
      const dx = Math.abs(x + 0.5 - W / 2);
      if (dx > half) continue;
      let t = 0.55 - dx / half * 0.25 + (pxNoise(x, y, 5, 2, 4, 0) - 0.5) * 0.3 + Math.sin(y * 0.9 + dx) * 0.08;
      if (dx < 0.8) t += 0.25;
      if (dx > half - 1) t -= 0.25;
      p.set(x, y, R(t, x, y));
    }
  }
  p.ellipse(W / 2, H - 4, 3, 3.5, (nx, ny) => mix(hex('#c8b048'), hex('#6a7018'), clamp01((nx + ny) * 0.5 + 0.5)));
  return p;
}

/** soft vertical streak for god-ray cards (white, alpha in luminance) */
function paintRay(): Px {
  const W = 32, H = 64, p = new Px(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = (x + 0.5) / W, v = y / H;
    const s = Math.pow(Math.sin(u * Math.PI), 2.5) * (0.65 + 0.35 * fbm(x / 3, 0, 2, 5));
    const fade = Math.pow(1 - v, 0.6) * Math.min(1, v * 6 + 0.3);
    const a = clamp01(s * fade);
    const q = Math.round(a * 6) / 6; // banded
    p.set(x, y, [255, 255, 255], q * 255);
  }
  return p;
}

/** a small framed pixel painting (a heroic blobfish portrait / a sunset / a whale) */
function paintPainting(kind: string): Px {
  const W = 32, H = 24, p = new Px(W, H);
  if (kind === 'whale') {
    p.fill((x, y) => mix(hex('#1a3a6a'), hex('#4aa0c8'), 1 - y / H));
    p.ellipse(15, 13, 10, 4, '#2a3a52'); p.poly([[24, 12], [30, 8], [29, 15]], '#2a3a52'); p.ellipse(13, 15, 7, 2, '#c8ccd0');
    p.set(9, 12, '#ffffff');
  } else if (kind === 'sunset') {
    p.fill((x, y) => y < 14 ? mix(hex('#ffcc6a'), hex('#c8487a'), y / 14) : mix(hex('#2a4a8a'), hex('#0e1a3a'), (y - 14) / 10));
    p.circle(16, 14, 5, '#fff2b0');
    for (let y = 15; y < 24; y += 2) p.rect(12 + (y % 3), y, 8 - (y - 15) / 2, 1, '#ffdc8a');
  } else {
    // blobfish portrait
    p.fill((x, y) => mix(hex('#2a1a3a'), hex('#5a3a5a'), y / H));
    p.ellipse(16, 14, 9, 8, (nx, ny) => mix(hex('#f8b8c8'), hex('#c86a88'), clamp01(ny * 0.5 + 0.5 + nx * 0.2)));
    p.ellipse(18, 18, 4, 3, '#e090a8');
    p.set(13, 11, '#1a0a10'); p.set(19, 11, '#1a0a10'); p.set(13, 10, '#ffffff');
    p.rect(14, 21, 5, 1, '#6a2a3a');
  }
  return p;
}

// ------------------------------------------------------------------ textures
function tx(p: Px, repeat = true) { const t = p.texture({ repeat }); return t; }

export const TEX = {
  rock: memo(() => tx(paintRock(false, 3))),
  rockOut: memo(() => tx(paintRock(true, 5))),
  floor: memo(() => tx(paintFloor())),
  sand: memo(() => tx(paintSand())),
  wood: memoK((k) => tx(paintWood(k))),
  fabric: memoK((k) => tx(paintFabric(k))),
  knit: memoK((k) => { const [a, b] = k.split('/'); return tx(paintKnit(a, b)); }),
  rug: memoK((k) => tx(paintRug(k), false)),
  metal: memoK((k) => tx(paintMetal(k))),
  brass: memo(() => tx(paintBrass())),
  leather: memoK((k) => tx(paintLeather(k))),
  veneer: memo(() => tx(paintVeneer())),
  books: memo(() => tx(paintBooks())),
  pegboard: memo(() => tx(paintPegboard())),
  plain: memoK((k) => tx(paintPlain(k))),
  kelp: memo(() => { const t = paintKelp().texture({ mip: false }); return t; }),
  ray: memo(() => { const t = paintRay().texture({ mip: false }); t.colorSpace = THREE.NoColorSpace; return t; }),
  painting: memoK((k) => tx(paintPainting(k), false)),
};

// ------------------------------------------------------------------ materials
type MatOpts = { rough?: number; metal?: number; emissive?: string; emissiveI?: number; side?: THREE.Side; color?: string; alphaTest?: number; flat?: boolean; snap?: number };
function std(map: THREE.Texture | null, o: MatOpts = {}) {
  const m = new THREE.MeshStandardMaterial({ map, roughness: o.rough ?? 0.85, metalness: o.metal ?? 0, side: o.side ?? THREE.FrontSide, color: o.color ?? '#ffffff', alphaTest: o.alphaTest ?? 0, flatShading: o.flat ?? false });
  if (o.emissive) { m.emissive = new THREE.Color(o.emissive); m.emissiveIntensity = o.emissiveI ?? 1; }
  return retro(m, { snap: o.snap ?? 1 });
}
export const MAT = {
  rock: memo(() => std(TEX.rock(), { rough: 0.9, flat: true })),
  rockOut: memo(() => std(TEX.rockOut(), { rough: 0.92, flat: true })),
  floor: memo(() => std(TEX.floor(), { rough: 0.82 })),
  sand: memo(() => std(TEX.sand(), { rough: 1 })),
  wood: memoK((k) => std(TEX.wood(k), { rough: 0.75 })),
  fabric: memoK((k) => std(TEX.fabric(k), { rough: 0.95 })),
  knit: memoK((k) => std(TEX.knit(k), { rough: 1 })),
  rug: memoK((k) => std(TEX.rug(k), { rough: 1, alphaTest: 0.5, side: THREE.DoubleSide })),
  metal: memoK((k) => std(TEX.metal(k), { rough: 0.55, metal: 0.3 })),
  brass: memo(() => std(TEX.brass(), { rough: 0.32, metal: 0.85 })),
  leather: memoK((k) => std(TEX.leather(k), { rough: 0.6 })),
  veneer: memo(() => std(TEX.veneer(), { rough: 0.45 })),
  books: memo(() => std(TEX.books(), { rough: 0.8 })),
  pegboard: memo(() => std(TEX.pegboard(), { rough: 0.9 })),
  plain: memoK((k) => { const [col, r, m] = k.split('/'); return std(TEX.plain(col), { rough: r ? +r : 0.6, metal: m ? +m : 0 }); }),
  glow: memoK((k) => { const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(k).multiplyScalar(2.2), toneMapped: true }); return retro(m); }),
  painting: memoK((k) => std(TEX.painting(k), { rough: 0.7 })),
  dark: memo(() => std(null, { color: '#0a0806', rough: 1, side: THREE.DoubleSide })),
};
