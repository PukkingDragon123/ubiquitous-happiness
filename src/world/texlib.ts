// Clean, realistic pixel tiles for the v2 areas: 64 px seamless stone and seabed surfaces at PS1/PS2 texel
// density (~32 px per metre). Every tile is built from deliberate shapes in 4-6 hue-shifted tones (shadows
// cooler, lights warmer): bevelled rock plates with a lit upper-left edge and a shadowed lower-right edge,
// cracks, strata bands, pits, crusts and barnacle clusters; sand ripples as clean bands; pebbles with baked
// edge light. No per-pixel noise, no dithering. Rock and ground tiles are sampled in world space by mats.ts.
import * as THREE from 'three';
import { Px, hex, mix, pxNoise, RGB } from '../gfx/px';
import { hash2 } from '../core/math';
import { Rng } from '../core/rng';
import { hueRamp } from './pixart';
import type { AreaDef } from '../area/defs';

export const TILE = 64;
const cache = new Map<string, unknown>();
function memo<T>(k: string, f: () => T): T { if (!cache.has(k)) cache.set(k, f()); return cache.get(k) as T; }
const ci = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : Math.round(v));
const L: [number, number] = [-0.6, -0.8]; // light from the upper left (texture space, y down)

/** seamless cellular pattern: nearest feature distance f1, second f2, cell id, and the offset to the nearest point */
export function cells(x: number, y: number, cell: number, seed: number, tile: number) {
  const cx = Math.floor(x / cell), cy = Math.floor(y / cell), nt = Math.round(tile / cell);
  let f1 = 1e9, f2 = 1e9, id = 0, dx = 0, dy = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const gx = ((cx + i) % nt + nt) % nt, gy = ((cy + j) % nt + nt) % nt;
    const px = (cx + i + 0.15 + hash2(gx, gy, seed) * 0.7) * cell, py = (cy + j + 0.15 + hash2(gx, gy, seed + 7) * 0.7) * cell;
    const ex = x + 0.5 - px, ey = y + 0.5 - py, d = Math.hypot(ex, ey);
    if (d < f1) { f2 = f1; f1 = d; id = hash2(gx, gy, seed + 13); dx = ex; dy = ey; } else if (d < f2) f2 = d;
  }
  return { f1, f2, id, dx, dy };
}

/** a bevelled plate tone: +1 on the edge facing the light, -1 on the far edge, 0 inside */
function bevel(c: { f1: number; f2: number; dx: number; dy: number }, width: number) {
  if (c.f2 - c.f1 > width) return 0;
  const l = Math.hypot(c.dx, c.dy) || 1;
  return (c.dx / l) * L[0] + (c.dy / l) * L[1] > 0.15 ? 1 : -1;
}

/** clean smooth noise quantised into k levels (no speckle: large scale, few octaves) */
const qn = (x: number, y: number, scale: number, seed: number, k: number) => Math.floor(Math.min(0.999, Math.max(0, (pxNoise(x, y, scale, 2, seed, TILE) - 0.3) / 0.4)) * k);

/** stamp deterministic barnacle clusters / pits into a tone painter */
function spots(n: number, seed: number, r0: number, r1: number) {
  const rng = new Rng(seed);
  return Array.from({ length: n }, () => ({ x: rng.int(0, TILE - 1), y: rng.int(0, TILE - 1), r: rng.range(r0, r1) }));
}
function wrapD(ax: number, ay: number, bx: number, by: number): [number, number] {
  let dx = ax - bx, dy = ay - by;
  if (dx > TILE / 2) dx -= TILE; else if (dx < -TILE / 2) dx += TILE;
  if (dy > TILE / 2) dy -= TILE; else if (dy < -TILE / 2) dy += TILE;
  return [dx, dy];
}

function tex(p: Px) { return p.texture({ repeat: true }); }

// ------------------------------------------------------------------ stone
export function rockTile(a: AreaDef): THREE.Texture {
  return memo('rock' + a.id, () => {
    const N = TILE, p = new Px(N, N);
    const T = hueRamp(a.pal.rock[2], 6, { spread: 0.9 });
    const crustBase = a.rock === 'granite' ? '#dce6ee' : a.rock === 'pillow' ? '#c89a2a' : a.rock === 'volcanic' ? '#c87884' : a.rock === 'mudstone' ? '#6e7650' : '#c08a8e';
    const C = hueRamp(crustBase, 4);
    const s = a.id.length * 31;
    const pits = spots(a.rock === 'limestone' ? 14 : a.rock === 'volcanic' ? 10 : 0, s + 3, 1.1, 2.2);
    const barn = spots(a.rock === 'limestone' || a.rock === 'mudstone' ? 6 : 3, s + 5, 1.4, 2.0);
    p.fill((x, y) => {
      const plate = a.rock === 'pillow' ? cells(x, y, 16, s, N) : cells(x, y, a.rock === 'granite' ? 21 : 16, s, N);
      let t = 2 + (plate.id > 0.66 ? 1 : plate.id < 0.25 ? -1 : 0);
      if (a.rock === 'limestone' || a.rock === 'mudstone') {
        // bedding: flat bands with a dark parting line on top of each
        const yy = y + Math.round((pxNoise(x, 0, 24, 1, s + 4, N) - 0.5) * 6);
        const band = Math.floor(yy / 9), off = ((yy % 9) + 9) % 9;
        t = 2 + (band % 3 === 0 ? 1 : band % 3 === 1 ? 0 : -1);
        if (off === 0) t = 1; else if (off === 1) t += 1;
      }
      if (a.rock === 'pillow') {
        // each pillow is a rounded lump: lit toward the upper left, glassy dark rims
        const l = Math.hypot(plate.dx, plate.dy) || 1, k = (plate.dx / l) * L[0] + (plate.dy / l) * L[1];
        t = plate.f1 < 3 ? 2 : k > 0.3 ? 3 : k < -0.3 ? 1 : 2;
        if (plate.f2 - plate.f1 < 1.3) t = 0;
      } else {
        t += bevel(plate, 2.2);
        if (plate.f2 - plate.f1 < 0.9) t = 0;   // crack
      }
      if (a.rock === 'granite') { const g = cells(x, y, 5, s + 9, N); if (g.f1 < 1.1 && g.id > 0.72) t = g.id > 0.86 ? 5 : 4; else if (g.f1 < 0.9 && g.id < 0.12) t = 1; }
      let col: RGB = T[ci(t, 0, 5)];
      for (const q of pits) { const [dx, dy] = wrapD(x, y, q.x, q.y); const d = Math.hypot(dx, dy); if (d < q.r) col = T[dx + dy > 0 ? 3 : 0]; }
      // crusts: coralline algae, frost, sulfur or silt sit in the hollows of the larger shapes
      const cr = qn(x, y, 14, s + 21, 4);
      if (cr >= 3) col = C[(plate.f2 - plate.f1 < 2) ? 1 : 2];
      else if (cr === 2 && qn(x + 1, y + 1, 14, s + 21, 4) >= 3) col = C[0];
      for (const q of barn) {
        const [dx, dy] = wrapD(x, y, q.x, q.y); const d = Math.hypot(dx, dy);
        if (d < q.r + 1.2) { const k = d < q.r * 0.45 ? 0 : d < q.r ? (dx + dy < 0 ? 3 : 2) : 1; col = hueRamp('#c8c0ac', 4)[k]; }
      }
      return col;
    });
    return tex(p);
  });
}

// ------------------------------------------------------------------ seabed surfaces
export function groundTile(a: AreaDef): THREE.Texture {
  return memo('ground' + a.id, () => {
    const N = TILE, p = new Px(N, N);
    const T = hueRamp(a.pal.sand[2], 6, { spread: 1 });
    const s = a.id.length * 17 + 3;
    const shells = spots(a.ground === 'coralSand' ? 9 : a.ground === 'kelpSand' ? 5 : 0, s + 1, 1, 1.8);
    p.fill((x, y) => {
      let t = 3;
      switch (a.ground) {
        case 'coralSand': case 'kelpSand': {
          // current ripples: crest, lee, stoss and trough as four clean bands, gently meandering
          const warp = (pxNoise(x, y, 26, 2, s + 4, N) - 0.5) * 18;
          const f = (((x + warp) / 16) % 1 + 1) % 1;
          t = f < 0.16 ? 5 : f < 0.45 ? 4 : f < 0.8 ? 3 : 2;
          if (a.ground === 'kelpSand') {
            const c = cells(x, y, 9, s + 2, N);
            if (c.id > 0.62 && c.f1 < 2.6) { const l = Math.hypot(c.dx, c.dy) || 1; t = c.f1 > 1.8 ? 1 : ((c.dx / l) * L[0] + (c.dy / l) * L[1] > 0.2 ? 4 : 2); }
          }
          break;
        }
        case 'silt': {
          t = 2 + qn(x, y, 18, s + 7, 3);
          const c = cells(x, y, 11, s + 3, N);
          if (c.id > 0.8 && c.f1 < 1.6) t = c.f1 < 0.9 ? 0 : (c.dx + c.dy < 0 ? 1 : 4); // burrows with a lit rim
          break;
        }
        case 'gravel': {
          const c = cells(x, y, 6, s + 2, N);
          t = 1 + Math.round(c.id * 3) + bevel(c, 1.6);
          if (c.f2 - c.f1 < 0.8) t = 0;
          break;
        }
        case 'ooze': {
          t = 1 + qn(x, y, 16, s + 9, 3);
          const c = cells(x, y, 10, s + 11, N);
          if (c.id > 0.88 && c.f1 < 0.9) t = 5;
          break;
        }
      }
      let col: RGB = T[ci(t, 0, 5)];
      for (const q of shells) {
        const [dx, dy] = wrapD(x, y, q.x, q.y);
        if (Math.abs(dx) < q.r + 0.5 && Math.abs(dy) < q.r * 0.6 + 0.5) col = dy > 0 ? T[1] : hex(a.ground === 'coralSand' ? '#f6eee0' : '#d8ccb4');
      }
      if (a.ground === 'ooze' && qn(x, y, 12, s + 31, 5) >= 4) col = hueRamp('#c08a2a', 4)[2];
      return col;
    });
    return tex(p);
  });
}

/** the front cross-section wall below the sand: strata bands, pebbles with edge light, a fossil or two */
export function strataTile(a: AreaDef): THREE.Texture {
  return memo('strata' + a.id, () => {
    const W = 64, H = 128, p = new Px(W, H);
    const bands = a.pal.strata.map((b) => hueRamp(b[0], 5, { spread: 0.8 }));
    const s = 9 + a.id.length;
    p.fill((x, y) => {
      const wob = Math.round((pxNoise(x, 0, 22, 2, s, W) - 0.5) * 8);
      const yy = y + wob;
      const li = ci(Math.floor((yy / H) * bands.length), 0, bands.length - 1);
      const B = bands[li];
      const inBand = yy - (li * H) / bands.length;
      let t = 2 + ((Math.floor(inBand / 6) % 2) ? 0 : -1);
      if (inBand < 1) t = 0; else if (inBand < 2) t = 4;
      if (li >= 1) {
        const c = cells(x, y, 6 + li * 2, s + li, W);
        if (c.id > 0.55 && c.f1 < 2 + li * 0.6) t = 2 + bevel({ ...c, f2: c.f1 + 1.5 }, 2);
        if (c.id > 0.55 && Math.abs(c.f1 - (2 + li * 0.6)) < 0.6) t = 0;
      }
      return B[ci(t, 0, 4)];
    });
    const rng = new Rng(77 + a.id.length);
    for (let i = 0; i < 2; i++) {
      const cx = rng.int(10, W - 10), cy = rng.int(56, H - 12);
      for (let t = 0; t < 15; t += 0.25) { const rr = t * 0.32; p.set(cx + Math.cos(t) * rr, cy + Math.sin(t) * rr * 0.8, '#d4c6a4'); }
    }
    return tex(p);
  });
}

/** the sand layer seen in cross-section: laminae and a scatter of shell hash */
export function sectionTile(a: AreaDef): THREE.Texture {
  return memo('section' + a.id, () => {
    const N = TILE, p = new Px(N, N);
    const T = hueRamp(a.pal.sand[2], 5, { spread: 0.9 });
    const sh = spots(7, 31 + a.id.length, 1, 1.6);
    p.fill((x, y) => {
      const yy = y + Math.round((pxNoise(x, 0, 20, 2, 3, N) - 0.5) * 4);
      const lam = Math.floor(yy / 5) % 3;
      let col = T[lam === 0 ? 3 : lam === 1 ? 2 : 1];
      if (((yy % 5) + 5) % 5 === 0) col = T[lam === 0 ? 4 : 2];
      for (const q of sh) { const [dx, dy] = wrapD(x, y, q.x, q.y); if (Math.abs(dx) < q.r + 0.5 && Math.abs(dy) < 0.6) col = hex('#f2eadc'); }
      return col;
    });
    return tex(p);
  });
}

// ------------------------------------------------------------------ wood + metal (props, wrecks, crates)
type Setter = { set(x: number, y: number, c: RGB | string, a?: number): void };

/** planks: flat plank tones, a gap line with a lit lower lip, wavy grain lines, knots, nails, algae, barnacles */
export function paintPlanks(p: Setter, W: number, Hh: number, o: { base: string[]; seed: number; rot?: number; barnacles?: number; algae?: string; nails?: boolean; plankH?: number }) {
  const T = hueRamp(o.base[2], 6, { spread: 0.9 });
  const A = o.algae ? hueRamp(o.algae, 4) : null;
  const ph = o.plankH ?? 8;
  const rng = new Rng(o.seed);
  const knots = Array.from({ length: 3 }, () => ({ x: rng.int(4, W - 4), y: rng.int(2, Hh - 3) }));
  const barn = Array.from({ length: Math.round((o.barnacles ?? 0) / 4) }, () => ({ x: rng.int(2, W - 3), y: rng.int(2, Hh - 3), n: rng.int(2, 4) }));
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    const pi = Math.floor(y / ph), py = y - pi * ph;
    const off = Math.floor(hash2(pi, 0, o.seed) * W);
    const xx = (x + off) % W;
    let t = 3 + (pi % 2 ? 0 : -1) + (hash2(pi, 2, o.seed) > 0.7 ? 1 : 0);
    // grain: two long wavy lines per plank
    const g1 = Math.round(ph * 0.35 + Math.sin((xx + pi * 13) * 0.11) * 1.2), g2 = Math.round(ph * 0.7 + Math.sin((xx + pi * 7) * 0.08 + 1) * 1);
    if (py === g1 || (py === g2 && xx % 23 < 15)) t -= 1;
    if (py === 0) t = 0; else if (py === 1) t = 5;
    if (((xx + Math.floor(hash2(pi, 3, o.seed) * 7)) % 32) === 0) t = 1;     // butt joint
    let c: RGB = T[ci(t, 0, 5)];
    for (const k of knots) { const d = Math.hypot((x - k.x) * 0.6, y - k.y); if (d < 1.6) c = T[d < 0.8 ? 0 : 1]; }
    if (o.nails && (py === 3 || py === 4) && ((xx + 2) % 32 === 0 || (xx + 2) % 32 === 3)) c = py === 3 ? hex('#3a3a40') : hex('#7a3a1e');
    if (A && o.rot) { const k = qn(x, y, 11, o.seed + 13, 5); if (k >= 4) c = A[2]; else if (k === 3 && qn(x, y - 1, 11, o.seed + 13, 5) >= 4) c = A[0]; }
    p.set(x, y, c);
  }
  for (const b of barn) for (let i = 0; i < b.n; i++) {
    const cx = b.x + i * 2 - (i > 1 ? 3 : 0), cy = b.y + (i > 1 ? 2 : 0);
    p.set(cx, cy, '#e4dccb'); p.set(cx + 1, cy, '#b8ae9a'); p.set(cx, cy + 1, '#8c8474'); p.set(cx + 1, cy + 1, '#3a3630');
  }
}

/** steel plates: seams with a lit edge, rivet rows, rust weeping down from every rivet, paint chips */
export function paintMetal(p: Setter, W: number, Hh: number, o: { paint: string[]; rust: number; seed: number; rivets?: number; plate?: number }) {
  const T = hueRamp(o.paint[2], 5, { spread: 0.9 });
  const R = hueRamp('#8a4a20', 4);
  const pl = o.plate ?? 32;
  const run = (x: number) => Math.floor(hash2(x, 1, o.seed) * pl * o.rust * 1.6);
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    let t = 2 + (Math.floor(x / pl) + Math.floor(y / pl)) % 2;
    const lx = x % pl, ly = y % pl;
    if (lx === 0 || ly === 0) t = 0; else if (lx === 1 || ly === 1) t = 4;
    let c: RGB = T[t];
    const rivetRow = o.rivets && (ly === 3);
    if (rivetRow && lx % 5 === 3) c = T[4];
    else if (o.rivets && ly === 4 && lx % 5 === 3) c = T[0];
    // rust tears weeping from the rivets
    if (o.rivets && lx % 5 === 3 && ly > 4 && ly < 4 + run(Math.floor(x / 5) + Math.floor(y / pl) * 31)) c = R[ly % 3 === 0 ? 1 : 2];
    const chip = qn(x, y, 9, o.seed + 5, 6);
    if (chip >= 5) c = R[o.rust > 0.4 ? 1 : 2];
    p.set(x, y, c);
  }
}

/** colour helpers shared by area painters */
export const col = { hex, mix, ci };
