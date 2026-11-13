// Underwater flora for the v2 areas: ~28 species of plants, corals, sponges and sessile animals, each a few
// dozen low-poly faces on one painted pixel atlas per area. A species paints its texture regions once and
// builds a handful of seeded variants (local space, base at the origin, sized in metres, sway flex baked per
// vertex), which the scenery then scatters into merged chunk meshes.
//
// Painters lean on a few parameterised generators (blades, porous sponge, corallites, brain mazes, alpha
// lattices, feathery fronds, striped tentacles) fed with realistic, hue-shifted palettes.
import { Atlas, Region } from './atlas';
import { Soup, V3, UVR, mat4 } from './lp';
import { ramp, hex, mix, RGB, pxNoise, worley } from '../gfx/px';
import { hash2 } from '../core/math';
import { Rng } from '../core/rng';
import type { AreaDef } from '../area/defs';

const TAU = Math.PI * 2;
type Pal = string[];

// ------------------------------------------------------------------ texture generators
/** a blade / leaf: alpha silhouette widening from the base, midrib, wrinkles, optional bladder + browned tip */
function blade(p: Region, w: number, h: number, pal: Pal, o: { bladder?: boolean; wrinkle?: number; rib?: number; tip?: string; ruffle?: number; base?: number; seed?: number } = {}) {
  const R = ramp(pal, 7, 0.7);
  const s = o.seed ?? 1;
  for (let y = 0; y < h; y++) {
    const t = 1 - y / (h - 1); // 0 base .. 1 tip
    const wid = Math.sin(Math.min(1, t * 1.15 + 0.08) * Math.PI) * (1 - (o.base ?? 0.25) * (1 - t) ** 6);
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w * 2 - 1;
      const edge = wid * (1 - (o.ruffle ?? 0.12) * (0.5 + 0.5 * Math.sin(y * 1.7 + s)));
      if (Math.abs(u) > edge) continue;
      const wr = Math.sin(y * (o.wrinkle ?? 0.9) + u * 2.5 + s) * 0.5 + 0.5;
      let k = 0.5 + (wr - 0.5) * 0.35 - Math.abs(u) * 0.15 + (hash2(x, y, s) - 0.5) * 0.12;
      if (Math.abs(u) < (o.rib ?? 0.12)) k -= 0.12;
      let c = R(k, x, y);
      if (o.tip && t > 0.82) c = mix(c, hex(o.tip), (t - 0.82) * 4);
      if (hash2(x, y, s + 7) > 0.97) c = mix(c, [235, 230, 210], 0.5); // epiphyte specks
      p.set(x, y, c);
    }
  }
  if (o.bladder) {
    const cx = w / 2, cy = h - 4;
    p.disc(cx, cy, Math.max(2, w * 0.22), (nx, ny) => mix(hex(pal[pal.length - 1]), hex(pal[1]), Math.min(1, (nx + ny + 1) * 0.5)));
    p.set(cx - 1, cy - 1, '#fff6c8');
  }
  p.rim(0.78);
}

/** porous sponge skin: oscula, pores, rough grain */
function porous(p: Region, w: number, h: number, pal: Pal, seed: number, holes = 0.6) {
  const R = ramp(pal, 7, 0.7);
  p.fill((x, y) => {
    const n = pxNoise(x, y, 6, 3, seed, w);
    const [f1, , cid] = worley(x, y, 5, seed + 1, w);
    let k = 0.55 + (n - 0.5) * 0.5 + (hash2(x, y, seed) - 0.5) * 0.15;
    if (f1 < 1.2 && cid < holes) k = 0.08;
    else if (f1 < 2.0 && cid < holes) k -= 0.18;
    return R(k, x, y);
  });
}

/** coral branch skin: corallite cups in rows, pale growing tips toward the top */
function corallite(p: Region, w: number, h: number, pal: Pal, tipCol: string, seed: number) {
  const R = ramp(pal, 7, 0.7);
  p.fill((x, y) => {
    const t = 1 - y / (h - 1);
    const cup = ((x + (Math.floor(y / 3) % 2) * 2) % 4 === 0) && (y % 3 === 0);
    let k = 0.5 + (pxNoise(x, y, 5, 2, seed) - 0.5) * 0.3 + (hash2(x, y, seed) - 0.5) * 0.12;
    if (cup) k -= 0.25;
    let c = R(k, x, y);
    if (t > 0.8) c = mix(c, hex(tipCol), (t - 0.8) * 4.5);
    return c;
  });
}

/** brain coral: meandering ridges and valleys */
function brainMaze(p: Region, w: number, h: number, pal: Pal, seed: number) {
  const R = ramp(pal, 7, 0.7);
  p.fill((x, y) => {
    const a = pxNoise(x, y, 9, 2, seed, w) * 9;
    const v = Math.sin(x * 0.75 + Math.sin(y * 0.33 + a) * 2.2 + a);
    let k = v > 0.25 ? 0.7 + (v - 0.25) * 0.4 : v > -0.2 ? 0.42 : 0.18;
    k += (hash2(x, y, seed) - 0.5) * 0.12;
    return R(k, x, y);
  });
}

/** alpha lattice (gorgonian fan, glass sponge): a branching or crossed mesh */
function lattice(p: Region, w: number, h: number, pal: Pal, seed: number, kind: 'fan' | 'grid') {
  const R = ramp(pal, 6, 0.7);
  const rng = new Rng(seed);
  if (kind === 'grid') {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const a = (x + y) % 6 === 0, b = (x - y + 600) % 6 === 0, rim = y < 2 || y > h - 3;
      if (a || b || rim || (y % 9 === 0 && x % 2 === 0)) p.set(x, y, R(0.45 + hash2(x, y, seed) * 0.4 + (rim ? 0.2 : 0), x, y));
    }
    return;
  }
  // fan: recursive branches from the bottom centre, spreading up, then dense anastomosing twigs
  const twig = (x: number, y: number, ang: number, len: number, wd: number, d: number) => {
    for (let i = 0; i < len; i++) {
      const k = 0.35 + (i / len) * 0.4 + rng.range(-0.08, 0.08);
      for (let q = 0; q < wd; q++) p.set(x + q, y, R(k, Math.floor(x), Math.floor(y)));
      x += Math.cos(ang); y -= Math.sin(ang);
      ang += rng.range(-0.25, 0.25);
      if (y < 1 || x < 0 || x >= w) return;
      if (d < 5 && rng.chance(0.14)) twig(x, y, ang + rng.sign() * rng.range(0.3, 0.8), Math.floor(len * rng.range(0.4, 0.75)), Math.max(1, wd - 1), d + 1);
    }
  };
  for (let k = 0; k < 3; k++) twig(w / 2 + rng.range(-2, 2), h - 1, Math.PI / 2 + rng.range(-0.6, 0.6), Math.floor(h * 0.9), 2, 0);
  // cross-links
  for (let i = 0; i < w * h * 0.04; i++) {
    const x = rng.int(1, w - 2), y = rng.int(1, h - 2);
    if (p.alpha(x, y) && !p.alpha(x + 1, y)) for (let q = 1; q < 4 && !p.alpha(x + q, y); q++) p.set(x + q, y, R(0.5, x + q, y));
  }
  // polyps
  p.each((x, y, c) => (hash2(x, y, seed + 3) > 0.85 ? mix([c[0], c[1], c[2]], [255, 245, 230], 0.45) : null));
}

/** feathery / fronded alpha tuft (weeds, hydroids, plumose crowns, crinoid arms) */
function fronds(p: Region, w: number, h: number, pal: Pal, seed: number, o: { density?: number; spread?: number; fluffy?: boolean; vertical?: boolean } = {}) {
  const R = ramp(pal, 6, 0.7);
  const rng = new Rng(seed);
  const n = Math.round((o.density ?? 1) * w * 0.4);
  for (let k = 0; k < n; k++) {
    let x = w / 2 + rng.range(-w * 0.15, w * 0.15), y = h - 1;
    let ang = Math.PI / 2 + rng.range(-1, 1) * (o.spread ?? 0.6);
    const len = rng.range(h * 0.4, h * 0.98);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      p.set(x, y, R(0.3 + t * 0.55 + rng.range(-0.08, 0.08), Math.floor(x), Math.floor(y)));
      if (o.fluffy && t > 0.45) for (let q = 0; q < 2; q++) p.set(x + rng.int(-2, 2), y + rng.int(-1, 1), R(0.65 + rng.range(0, 0.35), Math.floor(x), Math.floor(y)));
      else if (i % 3 === 0 && t > 0.2) { p.set(x - 1, y - 1, R(0.4 + t * 0.4, Math.floor(x), Math.floor(y))); p.set(x + 1, y - 1, R(0.4 + t * 0.4, Math.floor(x), Math.floor(y))); }
      x += Math.cos(ang) * 0.9; y -= Math.sin(ang) * 0.9;
      ang += rng.range(-0.18, 0.18) + (o.vertical ? (Math.PI / 2 - ang) * 0.05 : 0);
      if (y < 0 || x < 0 || x >= w) break;
    }
  }
}

/** striped tentacle strip, bulbous tip at the top */
function tentacle(p: Region, w: number, h: number, pal: Pal, tipCol: string, seed: number) {
  const R = ramp(pal, 6, 0.7);
  p.fill((x, y) => {
    const t = 1 - y / (h - 1);
    const u = Math.abs((x + 0.5) / w * 2 - 1);
    if (u > 0.95 - t * 0.35) return null;
    let k = 0.45 + (Math.sin(y * 1.3) > 0.6 ? 0.25 : 0) - u * 0.25 + (hash2(x, y, seed) - 0.5) * 0.1;
    let c = R(k, x, y);
    if (t > 0.86) c = mix(c, hex(tipCol), 0.85);
    return c;
  });
}

function solid(p: Region, w: number, h: number, pal: Pal, seed: number, n = 0.25) {
  const R = ramp(pal, 6, 0.7);
  p.fill((x, y) => R(0.5 + (pxNoise(x, y, 4, 2, seed) - 0.5) * n * 2 + (hash2(x, y, seed) - 0.5) * 0.1, x, y));
}

// ------------------------------------------------------------------ species
export interface Species {
  id: string;
  /** placed size range (multiplies the built variant) */
  size: [number, number];
  /** sits on sand (true) or prefers rock tops */
  glow?: number;
  /** emits a soft point of light (abyss) */
  light?: string;
  /** build variant k (local, metres, base at origin) */
  build(k: number, A: Atlas, a: AreaDef): Soup;
  /** tall plants get their own height: build(k, A, a, maxH) */
  tall?: boolean;
}

const rgbK = (c: string): [number, number, number] => { const h = hex(c); return [h[0] / 255, h[1] / 255, h[2] / 255]; };

// shared region painters per atlas (memoised by name inside the atlas)
const R_ = {
  white: (A: Atlas) => A.paint('white', 4, 4, (p) => p.fill(() => [235, 235, 235])),
};

function grassBlades(s: Soup, rng: Rng, r: UVR, n: number, hMin: number, hMax: number, wid: number, flexK = 0.1, spread = 0.18) {
  for (let i = 0; i < n; i++) {
    const a = rng.range(0, TAU), d = rng.range(0, spread);
    const bx = Math.cos(a) * d, bz = Math.sin(a) * d, H = rng.range(hMin, hMax);
    const lean = rng.range(-0.3, 0.3), lz = rng.range(-0.2, 0.2);
    const path: V3[] = [];
    for (let j = 0; j <= 3; j++) { const t = j / 3; path.push([bx + lean * t * t * H, t * H, bz + lz * t * t * H]); }
    s.ribbon(path, (t) => wid * (1 - t * 0.5), r, { side: [Math.cos(a + 1.3), 0, Math.sin(a + 1.3)], twist: rng.range(-1, 1), flex: (t) => t * t * flexK * H, shade: (t) => 0.65 + t * 0.4 });
  }
}

function branchTree(s: Soup, rng: Rng, r: UVR, o: { trunk: number; rad: number; depth: number; spread: number; sides?: number; glowTip?: number; flex?: number }) {
  const grow = (p: V3, dir: V3, len: number, rad: number, d: number) => {
    const n = 3, path: V3[] = [p];
    let q = p, dd = dir;
    for (let i = 1; i <= n; i++) {
      dd = [dd[0] + rng.range(-0.15, 0.15), dd[1] + 0.08, dd[2] + rng.range(-0.15, 0.15)];
      const l = Math.hypot(dd[0], dd[1], dd[2]); dd = [dd[0] / l, dd[1] / l, dd[2] / l];
      q = [q[0] + dd[0] * len / n, q[1] + dd[1] * len / n, q[2] + dd[2] * len / n];
      path.push(q);
    }
    const tip = d >= o.depth;
    if (tip && o.glowTip) s.glow(o.glowTip);
    s.tube(path, (t) => rad * (1 - t * 0.45), o.sides ?? 4, r, { tip: tip, flex: (t) => (o.flex ?? 0) * (p[1] + t * len) });
    s.glow(0);
    if (tip) return;
    const kids = rng.int(2, 3);
    for (let k = 0; k < kids; k++) {
      const a = rng.range(0, TAU), sp = o.spread * rng.range(0.6, 1.2);
      const nd: V3 = [dd[0] + Math.cos(a) * sp, dd[1], dd[2] + Math.sin(a) * sp];
      grow(q, nd, len * rng.range(0.55, 0.8), rad * 0.7, d + 1);
    }
  };
  grow([0, 0, 0], [0, 1, 0], o.trunk, o.rad, 0);
}

export const SPECIES: Record<string, Species> = {
  seagrass: {
    id: 'seagrass', size: [0.8, 1.4],
    build(k, A, a) {
      const pal = a.id === 'kelp' ? ['#1e2a10', '#3a5218', '#5e7a26', '#8aa040'] : ['#1a2e12', '#2e5a1e', '#4e8a2a', '#86b848'];
      const r = A.paint('seagrass', 8, 40, (p, w, h) => blade(p, w, h, pal, { tip: '#a89a5a', rib: 0.2, ruffle: 0.05, base: 0.05 }));
      const s = new Soup();
      grassBlades(s, new Rng(k * 19 + 3), r, 9 + k * 2, 0.3, 0.75, 0.06, 0.12, 0.2);
      return s;
    },
  },
  brain: {
    id: 'brain', size: [0.5, 1.1],
    build(k, A) {
      const pals = [['#3a3220', '#6a5a34', '#9a8a52', '#c8b878'], ['#2a3a24', '#4a6a3a', '#7a9a5a', '#b0c888'], ['#3a2a28', '#6a4a40', '#a07060', '#d0a890']];
      const r = A.paint('brain' + k, 32, 32, (p, w, h) => brainMaze(p, w, h, pals[k % 3], 11 + k));
      const s = new Soup();
      const rng = new Rng(k * 7 + 1);
      s.lathe([[0.62, 0], [0.7, 0.12], [0.62, 0.32], [0.42, 0.5], [0.0, 0.58]], 8, r, { jit: () => rng.range(0.9, 1.1), sx: 1, sz: rng.range(0.8, 1) });
      return s;
    },
  },
  staghorn: {
    id: 'staghorn', size: [0.5, 1.0],
    build(k, A, a) {
      const pals = [['#3a2e22', '#7a6448', '#b09a72', '#d8c8a0'], ['#3a2a3a', '#6a4a6a', '#9a7aa0', '#c8b0d0']];
      const r = A.paint('staghorn' + (k % 2), 16, 32, (p, w, h) => corallite(p, w, h, pals[k % 2], k % 2 ? '#e0d0ff' : '#a0d0f0', 5 + k));
      const s = new Soup();
      branchTree(s, new Rng(k * 31 + 7), r, { trunk: 0.35, rad: 0.06, depth: 2, spread: 0.9, glowTip: a.glow ? 2.5 : 0 });
      return s;
    },
  },
  glowcoral: {
    id: 'glowcoral', size: [0.6, 1.3], glow: 1,
    build(k, A) {
      const pals = [['#101828', '#203a5a', '#3a7aa0', '#7cf8ff'], ['#200a28', '#4a1a5a', '#8a3aa0', '#ff8ae8']];
      const r = A.paint('glowcoral' + (k % 2), 16, 32, (p, w, h) => corallite(p, w, h, pals[k % 2], k % 2 ? '#ffb0f0' : '#b0ffff', 9 + k));
      const s = new Soup();
      branchTree(s, new Rng(k * 37 + 2), r, { trunk: 0.4, rad: 0.05, depth: 2, spread: 0.8, glowTip: 3.2, flex: 0.02 });
      return s;
    },
  },
  table: {
    id: 'table', size: [0.9, 1.7],
    build(k, A) {
      const r = A.paint('table', 32, 32, (p, w, h) => {
        const R = ramp(['#3a3a28', '#6a6a48', '#9a9a6a', '#c8c89a'], 7, 0.7);
        p.fill((x, y) => { const dx = x - w / 2, dy = y - h / 2, a = Math.atan2(dy, dx), d = Math.hypot(dx, dy); return R(0.5 + Math.sin(a * 20 + d * 0.3) * 0.15 + (d % 4 < 1 ? -0.15 : 0) + (hash2(x, y, 3) - 0.5) * 0.1, x, y); });
      });
      const s = new Soup();
      const rng = new Rng(k * 13 + 5);
      s.lathe([[0.08, 0], [0.06, 0.45], [0.1, 0.55]], 5, r);
      const n = 11, top: V3[] = [], bot: V3[] = [];
      for (let i = 0; i < n; i++) { const a = (i / n) * TAU, rr = rng.range(0.55, 0.85); top.push([Math.cos(a) * rr, 0.6 + rng.range(-0.03, 0.05), Math.sin(a) * rr]); bot.push([Math.cos(a) * rr * 0.92, 0.54, Math.sin(a) * rr * 0.92]); }
      const c: V3 = [0, 0.62, 0], cb: V3 = [0, 0.55, 0];
      const uv = (q: V3): [number, number] => [r.u0 + (r.u1 - r.u0) * (q[0] * 0.55 + 0.5), r.v0 + (r.v1 - r.v0) * (q[2] * 0.55 + 0.5)];
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        s.tri(c, top[j], top[i], uv(c), uv(top[j]), uv(top[i]), 1, 1, 1);
        s.tri(cb, bot[i], bot[j], uv(cb), uv(bot[i]), uv(bot[j]), 0.5, 0.5, 0.5);
        s.quad(bot[i], bot[j], top[j], top[i], r, [0.6, 0.6, 0.8, 0.8]);
      }
      return s;
    },
  },
  seafan: {
    id: 'seafan', size: [0.8, 1.6],
    build(k, A, a) {
      const pals = a.id === 'reef' ? [['#3a0a1a', '#7a1a3a', '#b03a5a', '#e06a80'], ['#2a1040', '#5a2a80', '#8a4ab0', '#c08ae0'], ['#4a1a08', '#8a3a10', '#c86a20', '#f0a040']] : [['#3a2a1a', '#6a4a2a', '#9a7a4a', '#c8a870']];
      const pal = pals[k % pals.length];
      const r = A.paint('seafan' + (k % pals.length), 48, 48, (p, w, h) => lattice(p, w, h, pal, 21 + k, 'fan'));
      const s = new Soup();
      const rng = new Rng(k * 3 + 9);
      s.card([0, 0, 0], 1.2, 1.1, rng.range(-0.3, 0.3), r, 0.12);
      if (k % 2) s.card([0.1, 0, 0.15], 0.9, 0.85, rng.range(0.6, 1.2), r, 0.1);
      return s;
    },
  },
  tubesponge: {
    id: 'tubesponge', size: [0.6, 1.2],
    build(k, A) {
      const pals = [['#3a1408', '#8a3a10', '#c8641a', '#f0a040'], ['#200a28', '#5a2a6a', '#8a4aa0', '#c08ad0'], ['#3a3008', '#8a7a10', '#c8b030', '#f0e070']];
      const r = A.paint('tubesponge' + (k % 3), 16, 32, (p, w, h) => porous(p, w, h, pals[k % 3], 31 + k, 0.4));
      const s = new Soup();
      const rng = new Rng(k * 17 + 2);
      const n = rng.int(3, 5);
      for (let i = 0; i < n; i++) {
        const H = rng.range(0.35, 0.95), rad = rng.range(0.06, 0.11), x = rng.range(-0.15, 0.15), z = rng.range(-0.15, 0.15);
        const from = s.count;
        s.lathe([[rad * 0.9, 0], [rad, H * 0.5], [rad * 1.15, H], [rad * 0.75, H * 0.97], [rad * 0.6, H * 0.5]], 6, r, { flexTop: 0.03 });
        s.transformSince(from, mat4(x, 0, z, 1, 1, 1, 0, rng.range(-0.2, 0.2), rng.range(-0.2, 0.2)));
      }
      return s;
    },
  },
  barrelsponge: {
    id: 'barrelsponge', size: [0.9, 1.6],
    build(k, A, a) {
      const pal = a.id === 'graveyard' ? ['#20180e', '#4a3a24', '#6a5a3a', '#8a7a5a'] : ['#2a120a', '#5a2a18', '#8a4a2a', '#b07048'];
      const r = A.paint('barrel', 32, 32, (p, w, h) => {
        const R = ramp(pal, 7, 0.7);
        p.fill((x, y) => R(0.5 + (Math.sin(x * 0.8) > 0.4 ? 0.2 : -0.05) + (pxNoise(x, y, 5, 2, 4) - 0.5) * 0.3 + (y % 5 === 0 ? -0.1 : 0), x, y));
      });
      const s = new Soup();
      s.lathe([[0.25, 0], [0.42, 0.25], [0.48, 0.6], [0.44, 0.9], [0.32, 0.88], [0.26, 0.4]], 8, r, { jit: (j, kk) => 1 + hash2(j, kk, k) * 0.08 });
      return s;
    },
  },
  anemone: {
    id: 'anemone', size: [0.5, 0.9],
    build(k, A, a) {
      const sets: [Pal, string, Pal][] = a.id === 'kelp' ? [[['#3a2a0a', '#7a6a2a', '#b0a050', '#e0d090'], '#f0a0c0', ['#1a2a10', '#3a5a20', '#6a8a3a', '#a0c070']]] : [[['#3a2a18', '#8a6a4a', '#c8a07a', '#f0d8b0'], '#c060ff', ['#2a0a2a', '#6a1a5a', '#a03a80', '#d070b0']], [['#3a0a0a', '#8a1a2a', '#c84a5a', '#f08a90'], '#ffe0e0', ['#2a0a0a', '#5a1a1a', '#8a3030', '#c06050']]];
      const [tp, tip, cp] = sets[k % sets.length];
      const rt = A.paint('tent' + (k % sets.length), 6, 24, (p, w, h) => tentacle(p, w, h, tp, tip, 41 + k));
      const rc = A.paint('anembody' + (k % sets.length), 16, 16, (p, w, h) => solid(p, w, h, cp, 44 + k, 0.3));
      const s = new Soup();
      const rng = new Rng(k * 11 + 4);
      s.lathe([[0.16, 0], [0.13, 0.12], [0.18, 0.2], [0.0, 0.22]], 7, rc);
      const n = 16;
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * TAU + rng.range(-0.1, 0.1), rr = rng.range(0.06, 0.16), L = rng.range(0.2, 0.34);
        const p0: V3 = [Math.cos(ang) * rr, 0.2, Math.sin(ang) * rr];
        const path: V3[] = [p0];
        for (let j = 1; j <= 3; j++) { const t = j / 3; path.push([p0[0] + Math.cos(ang) * L * t * 0.9, 0.2 + L * Math.sin(t * 1.4) * 0.8, p0[2] + Math.sin(ang) * L * t * 0.9]); }
        s.ribbon(path, (t) => 0.035 * (1 - t * 0.4), rt, { side: [-Math.sin(ang), 0, Math.cos(ang)], flex: (t) => t * 0.07, shade: (t) => 0.7 + t * 0.4 });
      }
      return s;
    },
  },
  softcoral: {
    id: 'softcoral', size: [0.4, 0.9],
    build(k, A) {
      const pals = [['#3a0a20', '#8a2a50', '#c85a80', '#f0a0c0'], ['#3a1a08', '#8a4a18', '#d08a3a', '#f8c870'], ['#200a30', '#5a2a70', '#9a5ab0', '#d0a0f0']];
      const r = A.paint('softcoral' + (k % 3), 16, 16, (p, w, h) => {
        solid(p, w, h, pals[k % 3], 51 + k, 0.35);
        for (let i = 0; i < 18; i++) p.set(hash2(i, 1, k) * w, hash2(i, 2, k) * h, '#fff4f0');
      });
      const s = new Soup();
      branchTree(s, new Rng(k * 41 + 5), r, { trunk: 0.22, rad: 0.05, depth: 1, spread: 1.1, sides: 4, flex: 0.06 });
      // polyp lumps at the tips
      const rng = new Rng(k * 5);
      for (let i = 0; i < 7; i++) {
        const from = s.count;
        s.lathe([[0.06, 0], [0.08, 0.05], [0.0, 0.1]], 5, r, { flexTop: 0.04 });
        s.transformSince(from, mat4(rng.range(-0.25, 0.25), rng.range(0.25, 0.45), rng.range(-0.25, 0.25), 1, 1, 1, rng.range(0, 6)));
      }
      return s;
    },
  },
  clamDeco: {
    id: 'clamDeco', size: [0.6, 0.9],
    build(k, A) {
      const r = clamRegions(A);
      return clamShape(k, r.shell, r.mantle, 0.5);
    },
  },
  giantkelp: {
    id: 'giantkelp', size: [1, 1], tall: true,
    build(k, A) {
      const rb = A.paint('kelpblade', 12, 40, (p, w, h) => blade(p, w, h, ['#2a1e08', '#5a4614', '#8a7224', '#b89a38', '#dcc458'], { bladder: true, wrinkle: 1.3, ruffle: 0.22, rib: 0.08, base: 0.5, seed: 4 }));
      const rs = A.paint('kelpstipe', 4, 16, (p, w, h) => solid(p, w, h, ['#2a2008', '#4a3a12', '#6a5a20'], 3, 0.2));
      const s = new Soup();
      const rng = new Rng(k * 23 + 11);
      // unit height 10 m; scenery rescales y to the water column
      const H = 10, segs = 10;
      const sway = rng.range(-0.4, 0.4);
      const path: V3[] = [];
      for (let j = 0; j <= segs; j++) { const t = j / segs; path.push([Math.sin(t * 2.2 + k) * 0.25 + sway * t * t, t * H, Math.cos(t * 1.7 + k) * 0.15]); }
      const fl = (t: number) => Math.pow(t, 1.3) * 1.1;
      s.tube(path, (t) => 0.045 * (1 - t * 0.3), 3, rs, { flex: fl });
      // blades alternate up the stipe
      for (let y = 0.6; y < H; y += rng.range(0.32, 0.5)) {
        const t = y / H, side = Math.floor(y * 3) % 2 ? 1 : -1;
        const j = Math.min(segs - 1, Math.floor(t * segs)), q = path[j];
        const ang = rng.range(0, TAU);
        const L = rng.range(0.55, 0.9) * (t > 0.92 ? 1.3 : 1);
        const dir: V3 = [Math.cos(ang) * 0.8 * side, rng.range(0.25, 0.6), Math.sin(ang) * 0.8];
        const bp: V3[] = [];
        for (let i = 0; i <= 3; i++) { const u = i / 3; bp.push([q[0] + dir[0] * L * u, y + dir[1] * L * u - 0.12 * u * u, q[2] + dir[2] * L * u]); }
        s.ribbon(bp, (u) => 0.16 * Math.sin(Math.min(1, u * 1.2 + 0.15) * Math.PI) + 0.02, rb, { side: [-dir[2], 0, dir[0]], twist: rng.range(-0.8, 0.8), flex: (u) => fl(t) + u * 0.08, shade: () => 0.75 + t * 0.35, ruffle: 0.3 });
      }
      return s;
    },
  },
  bullkelp: {
    id: 'bullkelp', size: [1, 1], tall: true,
    build(k, A) {
      const rb = A.paint('bullblade', 8, 48, (p, w, h) => blade(p, w, h, ['#20180a', '#4a3a14', '#7a6224', '#a88a3a'], { wrinkle: 0.7, ruffle: 0.25, base: 0.2, seed: 9 }));
      const rs = A.paint('kelpstipe', 4, 16, (p, w, h) => solid(p, w, h, ['#2a2008', '#4a3a12', '#6a5a20'], 3, 0.2));
      const s = new Soup();
      const rng = new Rng(k * 29 + 5);
      const H = 10, path: V3[] = [];
      for (let j = 0; j <= 8; j++) { const t = j / 8; path.push([Math.sin(t * 2 + k) * 0.3, t * H * 0.9, 0]); }
      const fl = (t: number) => Math.pow(t, 1.2) * 1.4;
      s.tube(path, (t) => 0.03 + t * 0.03, 3, rs, { flex: fl });
      const top = path[8];
      const from = s.count;
      s.flex(fl(1)).lathe([[0.06, 0], [0.13, 0.12], [0.1, 0.28], [0, 0.36]], 5, rs);
      s.transformSince(from, mat4(top[0], top[1], top[2], 1, 1, 1));
      s.flex(0);
      for (let i = 0; i < 10; i++) {
        const ang = rng.range(-0.6, 0.6) + (i % 2 ? Math.PI : 0), L = rng.range(1.2, 2.2);
        const bp: V3[] = [];
        for (let q = 0; q <= 4; q++) { const u = q / 4; bp.push([top[0] + Math.cos(ang) * L * u, top[1] + 0.3 - u * 0.5 - Math.sin(u * 3) * 0.1, top[2] + Math.sin(ang) * L * u * 0.4]); }
        s.ribbon(bp, (u) => 0.1 * (1 - u * 0.5), rb, { side: [0, 1, 0], twist: rng.range(-1, 1), flex: (u) => fl(1) + u * 0.4 });
      }
      return s;
    },
  },
  sealettuce: {
    id: 'sealettuce', size: [0.5, 0.9],
    build(k, A) {
      const r = A.paint('lettuce', 20, 24, (p, w, h) => blade(p, w, h, ['#1a3a10', '#3a7a20', '#6ab038', '#a8e060'], { wrinkle: 2.1, ruffle: 0.3, rib: 0, base: 0.3, seed: 12 }));
      const s = new Soup();
      const rng = new Rng(k * 3 + 1);
      for (let i = 0; i < 6; i++) {
        const a = rng.range(0, TAU), H = rng.range(0.25, 0.45), path: V3[] = [];
        for (let j = 0; j <= 3; j++) { const t = j / 3; path.push([Math.cos(a) * t * 0.18, t * H, Math.sin(a) * t * 0.18]); }
        s.ribbon(path, (t) => 0.24 * Math.sin(Math.min(1, t * 1.1 + 0.2) * Math.PI), r, { side: [-Math.sin(a), 0.2, Math.cos(a)], twist: rng.range(-1.2, 1.2), ruffle: 0.5, flex: (t) => t * 0.06 });
      }
      return s;
    },
  },
  seapalm: {
    id: 'seapalm', size: [0.5, 0.9],
    build(k, A) {
      const rb = A.paint('palmblade', 6, 24, (p, w, h) => blade(p, w, h, ['#2a2008', '#5a4a14', '#8a7424', '#c0a43a'], { wrinkle: 2, ruffle: 0.2, base: 0.1, seed: 2 }));
      const rs = A.paint('kelpstipe', 4, 16, (p, w, h) => solid(p, w, h, ['#2a2008', '#4a3a12', '#6a5a20'], 3, 0.2));
      const s = new Soup();
      const rng = new Rng(k * 7 + 3);
      const H = rng.range(0.4, 0.6);
      s.tube([[0, 0, 0], [0.02, H * 0.5, 0], [0, H, 0.02]], (t) => 0.03 * (1 - t * 0.3), 3, rs, { flex: (t) => t * 0.05 });
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * TAU + rng.range(-0.2, 0.2), L = rng.range(0.22, 0.32), bp: V3[] = [];
        for (let q = 0; q <= 3; q++) { const u = q / 3; bp.push([Math.cos(a) * L * u, H + Math.sin(u * 2.4) * 0.08 - u * u * 0.18, Math.sin(a) * L * u]); }
        s.ribbon(bp, () => 0.04, rb, { side: [-Math.sin(a), 0, Math.cos(a)], flex: (u) => 0.05 + u * 0.06 });
      }
      return s;
    },
  },
  urchins: {
    id: 'urchins', size: [0.8, 1.3],
    build(k, A, a) {
      const r = R_.white(A);
      const s = new Soup();
      const rng = new Rng(k * 13 + 1);
      const body = a.id === 'arctic' ? rgbK('#c8506a') : rgbK('#3a1848'), spine = a.id === 'arctic' ? rgbK('#e07a8a') : rgbK('#6a2a7a');
      const n = rng.int(3, 6);
      for (let i = 0; i < n; i++) {
        const cx = rng.range(-0.35, 0.35), cz = rng.range(-0.35, 0.35), R = rng.range(0.05, 0.08);
        s.color(body[0], body[1], body[2]);
        const from = s.count;
        s.lathe([[R, 0], [R * 1.1, R * 0.6], [0, R * 1.3]], 6, r);
        s.transformSince(from, mat4(cx, 0, cz, 1, 1, 1));
        s.color(spine[0], spine[1], spine[2]);
        for (let q = 0; q < 14; q++) {
          const th = rng.range(0, TAU), ph = rng.range(0.1, 1.5), L = R * rng.range(1.8, 2.6);
          const d: V3 = [Math.cos(th) * Math.cos(ph), Math.sin(ph), Math.sin(th) * Math.cos(ph)];
          const b: V3 = [cx + d[0] * R, R * 0.6 + d[1] * R * 0.7, cz + d[2] * R];
          const side: V3 = [-d[2] * 0.012, 0, d[0] * 0.012];
          s.tri([b[0] - side[0], b[1], b[2] - side[2]], [b[0] + side[0], b[1], b[2] + side[2]], [b[0] + d[0] * L, b[1] + d[1] * L, b[2] + d[2] * L], [r.u0, r.v0], [r.u1, r.v0], [r.u0, r.v1], 0.7, 0.7, 1.2);
        }
      }
      s.color(1, 1, 1);
      return s;
    },
  },
  redweed: {
    id: 'redweed', size: [0.4, 0.8],
    build(k, A, a) {
      const pal = a.id === 'kelp' ? ['#2a0a10', '#5a1a24', '#8a2a3a', '#c05060'] : ['#2a1008', '#5a2a14', '#8a4a24', '#b07040'];
      const r = A.paint('redweed', 32, 32, (p, w, h) => fronds(p, w, h, pal, 61, { density: 1.2, spread: 0.7 }));
      const s = new Soup();
      const rng = new Rng(k * 3 + 2);
      s.cross([0, 0, 0], 0.6, 0.5, rng.range(0, 3), r, 0.06);
      return s;
    },
  },
  brownweed: {
    id: 'brownweed', size: [0.6, 1.2],
    build(k, A, a) {
      const pal = a.id === 'arctic' ? ['#1a1a10', '#3a3418', '#5a5228', '#7a7040'] : ['#1a160a', '#3a2e12', '#5e4a1e', '#8a6e30'];
      const r = A.paint('brownweed', 32, 48, (p, w, h) => fronds(p, w, h, pal, 71, { density: 1.1, spread: 0.5, vertical: true }));
      const s = new Soup();
      const rng = new Rng(k * 5 + 7);
      s.cross([0, 0, 0], 0.6, 0.9, rng.range(0, 3), r, 0.12);
      if (k % 2) s.card([0.1, 0, 0.1], 0.5, 0.7, rng.range(0, 3), r, 0.1);
      return s;
    },
  },
  hydroid: {
    id: 'hydroid', size: [0.4, 0.7],
    build(k, A) {
      const r = A.paint('hydroid', 24, 24, (p, w, h) => fronds(p, w, h, ['#3a3428', '#7a6e58', '#b0a488', '#e8e0c8'], 81, { density: 1.4, spread: 0.9, fluffy: false }));
      const s = new Soup();
      s.cross([0, 0, 0], 0.5, 0.45, k, r, 0.05);
      return s;
    },
  },
  plumose: {
    id: 'plumose', size: [0.6, 1.1],
    build(k, A, a) {
      const crown = a.id === 'arctic' && k % 2 ? ['#5a2a18', '#a8582a', '#e09050', '#ffd0a0'] : ['#4a4844', '#9a9890', '#d8d4cc', '#fffcf4'];
      const rc = A.paint('plumcrown' + (a.id === 'arctic' ? k % 2 : 0), 32, 24, (p, w, h) => fronds(p, w, h, crown, 91 + k, { density: 2.4, spread: 1.4, fluffy: true }));
      const rb = A.paint('plumbody' + (a.id === 'arctic' ? k % 2 : 0), 8, 16, (p, w, h) => solid(p, w, h, [crown[0], crown[1], crown[2]], 93, 0.2));
      const s = new Soup();
      const rng = new Rng(k * 9 + 1);
      const H = rng.range(0.35, 0.55);
      s.lathe([[0.1, 0], [0.08, H * 0.6], [0.12, H], [0.0, H + 0.02]], 6, rb, { flexTop: 0.04 });
      for (let i = 0; i < 3; i++) s.card([0, H - 0.05, 0], 0.42, 0.28, (i / 3) * Math.PI, rc, 0.06);
      return s;
    },
  },
  seawhip: {
    id: 'seawhip', size: [0.8, 1.6],
    build(k, A, a) {
      const pal = a.id === 'graveyard' ? ['#2a1a08', '#6a4218', '#a8702a', '#e0b050'] : ['#3a0a08', '#8a2a10', '#c8582a', '#f09050'];
      const r = A.paint('seawhip', 6, 32, (p, w, h) => corallite(p, w, h, pal, '#f8e0b0', 101));
      const s = new Soup();
      const rng = new Rng(k * 11 + 3);
      for (let i = 0; i < rng.int(2, 4); i++) {
        const a0 = rng.range(0, TAU), L = rng.range(0.7, 1.3), path: V3[] = [];
        const bend = rng.range(-0.4, 0.4);
        for (let j = 0; j <= 5; j++) { const t = j / 5; path.push([Math.cos(a0) * 0.05 + bend * t * t, t * L, Math.sin(a0) * 0.05 + bend * 0.4 * t * t]); }
        s.tube(path, (t) => 0.018 * (1 - t * 0.6), 3, r, { tip: true, flex: (t) => t * t * 0.25 });
      }
      return s;
    },
  },
  seapen: {
    id: 'seapen', size: [0.4, 0.8],
    build(k, A, a) {
      const r = A.paint('seapen', 12, 32, (p, w, h) => {
        const R = ramp(a.id === 'graveyard' ? ['#3a1a0a', '#8a4a20', '#d08a40', '#ffd090'] : ['#3a0a1a', '#8a2a3a', '#d06070', '#ffc0c0'], 6, 0.7);
        for (let y = 0; y < h; y++) {
          const t = 1 - y / (h - 1), wd = t < 0.3 ? 0.8 : Math.sin(Math.min(1, (t - 0.3) / 0.7 * 1.1 + 0.1) * Math.PI) * w * 0.5;
          for (let x = 0; x < w; x++) { const u = Math.abs(x + 0.5 - w / 2); if (u > wd) continue; if (t > 0.3 && u > 1 && (y + Math.floor(u)) % 3 === 0) continue; p.set(x, y, R(0.4 + (1 - u / (w / 2)) * 0.4, x, y)); }
        }
      });
      const s = new Soup();
      s.card([0, 0, 0], 0.18, 0.5, k * 0.7, r, 0.05);
      return s;
    },
  },
  seapenGlow: {
    id: 'seapenGlow', size: [0.5, 0.9], glow: 1,
    build(k, A) {
      const r = A.paint('seapenglow', 12, 32, (p, w, h) => {
        const R = ramp(['#0a1830', '#1a4a7a', '#40a0d0', '#a0f8ff'], 6, 0.7);
        for (let y = 0; y < h; y++) {
          const t = 1 - y / (h - 1), wd = t < 0.3 ? 0.8 : Math.sin(Math.min(1, (t - 0.3) / 0.7 * 1.1 + 0.1) * Math.PI) * w * 0.5;
          for (let x = 0; x < w; x++) { const u = Math.abs(x + 0.5 - w / 2); if (u > wd) continue; if (t > 0.3 && u > 1 && (y + Math.floor(u)) % 3 === 0) continue; p.set(x, y, R(0.4 + (1 - u / (w / 2)) * 0.5, x, y)); }
        }
      });
      const s = new Soup();
      s.glow(2.2).card([0, 0, 0], 0.2, 0.55, k * 0.9, r, 0.06);
      s.glow(0);
      return s;
    },
  },
  softcoralCold: {
    id: 'softcoralCold', size: [0.5, 0.9],
    build(k, A) {
      const pals = [['#4a1a20', '#9a4a50', '#e08a90', '#ffd0d0'], ['#4a4a48', '#9a9890', '#e0dcd0', '#fffff4'], ['#4a2008', '#a05018', '#e0903a', '#ffd090']];
      const r = A.paint('coldcoral' + (k % 3), 16, 16, (p, w, h) => { solid(p, w, h, pals[k % 3], 111 + k, 0.4); for (let i = 0; i < 20; i++) p.set(hash2(i, 3, k) * w, hash2(i, 4, k) * h, '#ffffff'); });
      const s = new Soup();
      const rng = new Rng(k * 19 + 2);
      branchTree(s, rng, r, { trunk: 0.18, rad: 0.06, depth: 1, spread: 1.2, sides: 4, flex: 0.04 });
      for (let i = 0; i < 9; i++) {
        const from = s.count;
        s.lathe([[0.07, 0], [0.09, 0.06], [0.0, 0.12]], 5, r, { flexTop: 0.03 });
        s.transformSince(from, mat4(rng.range(-0.22, 0.22), rng.range(0.15, 0.38), rng.range(-0.22, 0.22), 1, 1, 1, rng.range(0, 6)));
      }
      return s;
    },
  },
  glasssponge: {
    id: 'glasssponge', size: [0.8, 1.5],
    build(k, A, a) {
      const r = A.paint('glasssponge', 32, 32, (p, w, h) => lattice(p, w, h, a.glow ? ['#2a4a5a', '#5a8aa0', '#a0d8f0', '#e8ffff'] : ['#5a5a50', '#9a9a8a', '#d0d0c0', '#fffff0'], 121, 'grid'));
      const s = new Soup();
      if (a.glow) s.glow(0.9);
      s.lathe([[0.08, 0], [0.18, 0.3], [0.26, 0.8], [0.3, 1.1], [0.32, 1.15]], 7, r, { flexTop: 0.04 });
      s.glow(0);
      return s;
    },
  },
  seastarDeco: {
    id: 'seastarDeco', size: [0.25, 0.45],
    build(k, A) {
      const pals = [['#5a1a08', '#a83a10', '#e86a2a', '#ffa860'], ['#3a0a2a', '#7a1a5a', '#b03a8a', '#e070c0']];
      const r = A.paint('seastar' + (k % 2), 16, 16, (p, w, h) => { solid(p, w, h, pals[k % 2], 131 + k, 0.4); for (let i = 0; i < 24; i++) p.set(hash2(i, 5, k) * w, hash2(i, 6, k) * h, '#fff0e0'); });
      const s = new Soup();
      const c: V3 = [0, 0.06, 0];
      const uv = (q: V3): [number, number] => [r.u0 + (r.u1 - r.u0) * (q[0] + 0.5), r.v0 + (r.v1 - r.v0) * (q[2] + 0.5)];
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU, a1 = a - 0.32, a2 = a + 0.32;
        const tip: V3 = [Math.cos(a) * 0.5, 0.01, Math.sin(a) * 0.5], l: V3 = [Math.cos(a1) * 0.13, 0.02, Math.sin(a1) * 0.13], rr: V3 = [Math.cos(a2) * 0.13, 0.02, Math.sin(a2) * 0.13];
        const mid: V3 = [Math.cos(a) * 0.22, 0.05, Math.sin(a) * 0.22];
        s.tri(c, rr, mid, uv(c), uv(rr), uv(mid)); s.tri(c, mid, l, uv(c), uv(mid), uv(l));
        s.tri(mid, rr, tip, uv(mid), uv(rr), uv(tip), 1, 0.8, 0.9); s.tri(mid, tip, l, uv(mid), uv(tip), uv(l), 1, 0.9, 0.8);
      }
      return s;
    },
  },
  tubeworms: {
    id: 'tubeworms', size: [0.7, 1.4], glow: 1,
    build(k, A) {
      const rt = A.paint('wormtube', 8, 32, (p, w, h) => { const R = ramp(['#4a4038', '#8a8070', '#c8c0b0', '#f0ece0'], 6, 0.7); p.fill((x, y) => R(0.55 + (y % 4 === 0 ? -0.18 : 0) + (hash2(x, y, 2) - 0.5) * 0.15, x, y)); });
      const rp = A.paint('wormplume', 8, 8, (p, w, h) => solid(p, w, h, ['#4a0808', '#a01818', '#e83a3a', '#ff8a7a'], 141, 0.4));
      const s = new Soup();
      const rng = new Rng(k * 7 + 5);
      const n = rng.int(5, 9);
      for (let i = 0; i < n; i++) {
        const x = rng.range(-0.25, 0.25), z = rng.range(-0.25, 0.25), H = rng.range(0.4, 1.0), lean = rng.range(-0.15, 0.15);
        const path: V3[] = [[x, 0, z], [x + lean * 0.3, H * 0.5, z], [x + lean, H, z + lean * 0.3]];
        s.tube(path, () => 0.025, 4, rt, { flex: (t) => t * t * 0.04 });
        const from = s.count;
        s.glow(1.6).flex(0.05).lathe([[0.03, 0], [0.05, 0.05], [0.04, 0.1], [0, 0.13]], 4, rp);
        s.transformSince(from, mat4(x + lean, H, z + lean * 0.3, 1, 1, 1));
        s.glow(0).flex(0);
      }
      return s;
    },
  },
  crinoid: {
    id: 'crinoid', size: [0.6, 1.2],
    build(k, A, a) {
      const pal = a.glow ? ['#20102a', '#5a2a6a', '#a05ab0', '#f0b0ff'] : ['#3a2a10', '#7a5a20', '#c09a40', '#f0d080'];
      const ra = A.paint('crinarm', 8, 32, (p, w, h) => {
        const R = ramp(pal, 6, 0.7);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const u = Math.abs(x + 0.5 - w / 2); if (u < 1 || (y % 2 === 0 && u < w / 2 - (y / h) * 1.5)) p.set(x, y, R(0.4 + (1 - u / 4) * 0.4 + (hash2(x, y, 1) - 0.5) * 0.1, x, y)); }
      });
      const rs = A.paint('crinstalk', 4, 16, (p, w, h) => solid(p, w, h, [pal[0], pal[1], pal[2]], 151, 0.2));
      const s = new Soup();
      const rng = new Rng(k * 13 + 3);
      const H = rng.range(0.6, 1.0);
      s.tube([[0, 0, 0], [0.04, H * 0.5, 0], [0, H, 0.03]], () => 0.015, 3, rs, { flex: (t) => t * 0.05 });
      if (a.glow) s.glow(1.4);
      for (let i = 0; i < 10; i++) {
        const ang = (i / 10) * TAU, L = rng.range(0.25, 0.38), bp: V3[] = [];
        for (let q = 0; q <= 3; q++) { const u = q / 3; bp.push([Math.cos(ang) * L * u * 0.8, H + Math.sin(u * 2.8) * 0.15, Math.sin(ang) * L * u * 0.8]); }
        s.ribbon(bp, () => 0.06, ra, { side: [-Math.sin(ang), 0, Math.cos(ang)], flex: (u) => 0.05 + u * 0.08 });
      }
      s.glow(0);
      return s;
    },
  },
  bacteriaMat: {
    id: 'bacteriaMat', size: [0.8, 1.6], glow: 1,
    build(k, A) {
      const r = A.paint('bacmat', 32, 32, (p, w, h) => {
        const R = ramp(['#4a2a10', '#a86a28', '#e8c070', '#fff8e0'], 6, 0.7);
        p.fill((x, y) => { const d = Math.hypot(x - w / 2, y - h / 2) / (w / 2) + (pxNoise(x, y, 6, 3, 7) - 0.5) * 0.7; if (d > 0.95) return null; return R(0.3 + (1 - d) * 0.5 + (hash2(x, y, 4) - 0.5) * 0.2, x, y); });
      });
      const s = new Soup();
      s.glow(0.5);
      const n = 9, rng = new Rng(k * 3);
      const c: V3 = [0, 0.03, 0];
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * TAU, a1 = ((i + 1) / n) * TAU, r0 = rng.range(0.4, 0.55), r1 = rng.range(0.4, 0.55);
        const p0: V3 = [Math.cos(a0) * r0, 0.01, Math.sin(a0) * r0], p1: V3 = [Math.cos(a1) * r1, 0.01, Math.sin(a1) * r1];
        const uv = (q: V3): [number, number] => [r.u0 + (r.u1 - r.u0) * (q[0] + 0.5), r.v0 + (r.v1 - r.v0) * (q[2] + 0.5)];
        s.tri(c, p1, p0, uv(c), uv(p1), uv(p0));
      }
      s.glow(0);
      return s;
    },
  },
};

// ------------------------------------------------------------------ giant clams (decor + harvestable node)
export function clamRegions(A: Atlas) {
  const shell = A.paint('clamshell', 32, 16, (p, w, h) => {
    const R = ramp(['#4a4438', '#8a8270', '#c0b8a0', '#ece4cc'], 7, 0.7);
    p.fill((x, y) => R(0.55 + Math.sin(x * 1.1) * 0.18 + (y % 4 === 0 ? -0.1 : 0) + (hash2(x, y, 3) - 0.5) * 0.12, x, y));
  });
  const mantle = A.paint('clammantle', 16, 8, (p, w, h) => {
    p.fill((x, y) => {
      const n = pxNoise(x, y, 3, 2, 5);
      const c: RGB = mix(hex('#1a3a8a'), hex('#3ac8c0'), n);
      return hash2(x, y, 9) > 0.8 ? mix(c, [140, 255, 240], 0.6) : hash2(x, y, 8) < 0.1 ? hex('#0a1a3a') : c;
    });
  });
  return { shell, mantle };
}

/** a giant clam: two fluted half-shells (open by `open` rad) with the mantle between, length ~1 m */
export function clamShape(k: number, shell: UVR, mantle: UVR, open: number): Soup {
  const s = new Soup();
  const flutes = 5, NS = flutes * 2;
  const half = (sign: number) => {
    const rings: V3[][] = [];
    for (let j = 0; j <= 4; j++) {
      const t = j / 4, ring: V3[] = [];
      for (let i = 0; i <= NS; i++) {
        const u = i / NS, x = (u - 0.5) * 1.0 * Math.sin(Math.PI * (0.15 + t * 0.85)) + 0;
        const flute = (i % 2) * 0.04 * t;
        const y = Math.sin(t * Math.PI * 0.5) * 0.32 + flute;
        const z = sign * (0.05 + Math.sin(t * Math.PI) * 0.22 * Math.sin(Math.PI * u) + flute * 0.5);
        ring.push([x, y, z]);
      }
      rings.push(ring);
    }
    // rotate around the hinge line (y = 0)
    const ca = Math.cos(open * sign), sa = Math.sin(open * sign);
    for (const r of rings) for (const q of r) { const y = q[1], z = q[2]; q[1] = y * ca - z * sa * 0; q[2] = z + y * sa * 0.6; }
    for (let j = 0; j < 4; j++) for (let i = 0; i < NS; i++) {
      const a = rings[j][i], b = rings[j][i + 1], c = rings[j + 1][i + 1], d = rings[j + 1][i];
      const uv = (ii: number, jj: number): [number, number] => [shell.u0 + (shell.u1 - shell.u0) * ii / NS, shell.v0 + (shell.v1 - shell.v0) * jj / 4];
      if (sign > 0) { s.tri(a, b, c, uv(i, j), uv(i + 1, j), uv(i + 1, j + 1)); s.tri(a, c, d, uv(i, j), uv(i + 1, j + 1), uv(i, j + 1)); }
      else { s.tri(a, c, b, uv(i, j), uv(i + 1, j + 1), uv(i + 1, j)); s.tri(a, d, c, uv(i, j), uv(i, j + 1), uv(i + 1, j + 1)); }
    }
  };
  half(1); half(-1);
  // mantle: a wavy band between the lips
  const n = 8;
  for (let i = 0; i < n; i++) {
    const x0 = (i / n - 0.5) * 0.85, x1 = ((i + 1) / n - 0.5) * 0.85;
    const y = 0.28, w = 0.08 + open * 0.2;
    s.quad([x0, y - 0.02, -w], [x1, y - 0.02, -w], [x1, y + 0.02 + (i % 2) * 0.02, w], [x0, y + 0.02 + ((i + 1) % 2) * 0.02, w], mantle, [0.9, 0.9, 1.1, 1.1]);
  }
  void k;
  return s;
}

// ------------------------------------------------------------------ variants cache
export class FloraKit {
  variants = new Map<string, Soup[]>();
  constructor(public atlas: Atlas, public area: AreaDef) {}
  get(sp: string, n = 3): Soup[] {
    let v = this.variants.get(sp);
    if (!v) {
      const S = SPECIES[sp];
      if (!S) throw new Error('unknown flora species ' + sp);
      v = [];
      for (let k = 0; k < n; k++) v.push(S.build(k, this.atlas, this.area));
      this.variants.set(sp, v);
    }
    return v;
  }
}
